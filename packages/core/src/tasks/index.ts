import process from 'process'

import * as dotenv from 'dotenv'
import { ethers } from 'ethers'
import ora from 'ora'
import Hash from 'ipfs-only-hash'
import { create } from 'ipfs-http-client'
import { ProxyABI } from '@sphinx/contracts'

import {
  SphinxInput,
  contractKindHashes,
  CanonicalConfig,
  GetConfigArtifacts,
  GetProviderForChainId,
  ConfigArtifacts,
  ParsedConfigWithOptions,
  ConfigCache,
  CompilerConfig,
  GetCanonicalConfig,
  UserConfigWithOptions,
  ParsedConfig,
} from '../config/types'
import {
  getDeploymentId,
  displayDeploymentTable,
  getSphinxManager,
  getSphinxRegistry,
  getDeploymentEvents,
  getEIP1967ProxyAdminAddress,
  getGasPriceOverrides,
  isProjectRegistered,
  writeCompilerConfig,
  writeSnapshotId,
  transferProjectOwnership,
  isHardhatFork,
  getProjectConfigInfo,
  relayProposal,
  relayIPFSCommit,
  registerOwner,
  fetchCanonicalConfig,
} from '../utils'
import { ensureSphinxInitialized, getMinimumCompilerInput } from '../languages'
import { Integration } from '../constants'
import { resolveNetworkName } from '../messages'
import {
  SphinxBundles,
  DeploymentState,
  DeploymentStatus,
  ProposalRequestLeaf,
  RoleType,
  executeDeployment,
  getAuthLeafSignerInfo,
  getNumDeployContractActions,
  makeAuthBundle,
  makeBundlesFromConfig,
  writeDeploymentArtifacts,
  ProposalRequest,
  AuthLeaf,
  getProjectDeploymentForChain,
  getAuthLeafsForChain,
  getGasEstimates,
  ProjectDeployment,
} from '../actions'
import { SphinxRuntimeEnvironment, FailureAction } from '../types'
import {
  trackCancel,
  trackExportProxy,
  trackDeployed,
  trackImportProxy,
} from '../analytics'
import { isSupportedNetworkOnEtherscan, verifySphinxConfig } from '../etherscan'
import { getAuthAddress, getSphinxManagerAddress } from '../addresses'
import { signAuthRootMetaTxn } from '../metatxs'
import { getParsedConfigWithOptions } from '../config/parse'

// Load environment variables from .env
dotenv.config()

/**
 * @param getCanonicalConfig A function that returns the canonical config. By default,
 * this function will fetch the canonical config from the back-end. However, it can be
 * overridden to return a different canonical config. This is useful for testing.
 */
export const proposeAbstractTask = async (
  userConfig: UserConfigWithOptions,
  isTestnet: boolean,
  dryRun: boolean,
  cre: SphinxRuntimeEnvironment,
  getConfigArtifacts: GetConfigArtifacts,
  getProviderForChainId: GetProviderForChainId,
  spinner: ora.Ora = ora({ isSilent: true }),
  failureAction: FailureAction = FailureAction.EXIT,
  getCanonicalConfig: GetCanonicalConfig = fetchCanonicalConfig
): Promise<ProposalRequest> => {
  const apiKey = process.env.SPHINX_API_KEY
  if (!apiKey) {
    throw new Error(`Must provide a 'SPHINX_API_KEY' environment variable.`)
  }

  const privateKey = process.env.PROPOSER_PRIVATE_KEY
  if (!privateKey) {
    throw new Error(
      `Must provide a 'PROPOSER_PRIVATE_KEY' environment variable.`
    )
  }

  const { project } = userConfig

  const wallet = new ethers.Wallet(privateKey)
  const signerAddress = await wallet.getAddress()

  const { isNewConfig, chainIds, prevConfig } = await getProjectConfigInfo(
    getCanonicalConfig,
    userConfig,
    isTestnet,
    apiKey,
    cre,
    failureAction
  )

  // Next, we parse and validate the config for each chain ID. This is necessary to ensure that
  // there aren't any network-specific errors that are caused by the config. These errors would most
  // likely occur in the `postParsingValidation` function that's a few calls inside of
  // `getParsedConfigWithOptions`. Note that the parsed config will be the same on each chain ID because the
  // network-specific validation does not change any fields in the parsed config. Likewise, the
  // `ConfigArtifacts` object will be the same on each chain. The only thing that will change is the
  // `ConfigCache` object.
  let parsedConfig: ParsedConfigWithOptions | undefined
  let configArtifacts: ConfigArtifacts | undefined
  const leafs: Array<AuthLeaf> = []
  const projectDeployments: Array<ProjectDeployment> = []
  const compilerConfigs: {
    [ipfsHash: string]: CompilerConfig
  } = {}
  // We loop through any logic that depends on the provider object.
  for (const chainId of chainIds) {
    const provider = getProviderForChainId(chainId)

    await ensureSphinxInitialized(provider, wallet.connect(provider))

    const parsedConfigValues = await getParsedConfigWithOptions(
      userConfig,
      prevConfig.deployer,
      isTestnet,
      provider,
      cre,
      getConfigArtifacts,
      failureAction
    )

    parsedConfig = parsedConfigValues.parsedConfig
    configArtifacts = parsedConfigValues.configArtifacts
    const configCache = parsedConfigValues.configCache

    const leafsForChain = await getAuthLeafsForChain(
      chainId,
      parsedConfig,
      configArtifacts,
      configCache,
      prevConfig
    )
    leafs.push(...leafsForChain)

    const { compilerConfig, configUri, bundles } = await getProjectBundleInfo(
      parsedConfig,
      configArtifacts,
      configCache
    )

    const projectDeployment = await getProjectDeploymentForChain(
      leafs,
      chainId,
      project,
      configUri,
      bundles
    )
    if (projectDeployment) {
      projectDeployments.push(projectDeployment)
    }

    compilerConfigs[configUri] = compilerConfig
  }

  // This removes a TypeScript error that occurs because TypeScript doesn't know that the
  // `parsedConfig` variable is defined.
  if (!parsedConfig || !configArtifacts) {
    throw new Error(
      'Could not find either parsed config or config artifacts. Should never happen.'
    )
  }

  const { orgId } = parsedConfig.options

  if (!isNewConfig && orgId !== prevConfig.options.orgId) {
    throw new Error(
      `Organization ID cannot be changed.\n` +
        `Previous: ${prevConfig.options.orgId}\n` +
        `New: ${orgId}`
    )
  }

  const chainIdToNumLeafs: { [chainId: number]: number } = {}
  for (const leaf of leafs) {
    const { chainId } = leaf
    if (!chainIdToNumLeafs[chainId]) {
      chainIdToNumLeafs[chainId] = 0
    }
    chainIdToNumLeafs[chainId] += 1
  }

  const chainStatus = Object.entries(chainIdToNumLeafs).map(
    ([chainId, numLeaves]) => ({
      chainId: parseInt(chainId, 10),
      numLeaves,
    })
  )

  const { root, leafs: bundledLeafs } = makeAuthBundle(leafs)

  // Skip signing the meta transaction if we're doing a dry run.
  const metaTxnSignature = dryRun
    ? undefined
    : await signAuthRootMetaTxn(wallet, root)

  const proposalRequestLeafs: Array<ProposalRequestLeaf> = []
  for (const bundledLeaf of bundledLeafs) {
    const { leaf, prettyLeaf, proof } = bundledLeaf
    const { chainId, index, to, leafType } = prettyLeaf
    const { data } = leaf

    let firstProposalOccurred: boolean
    const chainStates = prevConfig.chainStates[chainId]
    if (!chainStates) {
      firstProposalOccurred = false
    } else {
      firstProposalOccurred = chainStates.firstProposalOccurred
    }

    if (
      firstProposalOccurred &&
      !prevConfig.options.proposers.includes(signerAddress)
    ) {
      throw new Error(
        `Signer is not currently a proposer on chain ${chainId}. Signer's address: ${signerAddress}\n` +
          `Current proposers: ${prevConfig.options.proposers.map(
            (proposer) => `\n- ${proposer}`
          )}`
      )
    }

    if (
      !firstProposalOccurred &&
      !parsedConfig.options.proposers.includes(signerAddress)
    ) {
      throw new Error(
        `Signer must be a proposer in the config file. Signer's address: ${signerAddress}`
      )
    }

    let owners: string[]
    let proposers: string[]
    let ownerThreshold: number
    if (firstProposalOccurred) {
      ;({ owners, proposers, threshold: ownerThreshold } = prevConfig.options)
    } else {
      ;({ owners, proposers, threshold: ownerThreshold } = parsedConfig.options)
    }

    const { leafThreshold, roleType } = getAuthLeafSignerInfo(
      ownerThreshold,
      leafType
    )

    let signerAddresses: string[]
    if (roleType === RoleType.OWNER) {
      signerAddresses = owners
    } else if (roleType === RoleType.PROPOSER) {
      signerAddresses = proposers
    } else {
      throw new Error(`Invalid role type: ${roleType}`)
    }

    const signers = signerAddresses.map((addr) => {
      const signature = addr === signerAddress ? metaTxnSignature : undefined
      return { address: addr, signature }
    })

    proposalRequestLeafs.push({
      chainId,
      index,
      to,
      leafType,
      data,
      siblings: proof,
      threshold: leafThreshold,
      signers,
    })
  }

  const newChainStates: CanonicalConfig['chainStates'] = {}
  for (const chainId of chainIds) {
    newChainStates[chainId] = {
      firstProposalOccurred: true,
      projectCreated: true,
    }
  }

  const newCanonicalConfig: CanonicalConfig = {
    deployer: prevConfig.deployer,
    options: parsedConfig.options,
    contracts: parsedConfig.contracts,
    project: parsedConfig.project,
    chainStates: newChainStates,
  }

  const authAddress = getAuthAddress(
    prevConfig.options.owners,
    prevConfig.options.threshold,
    parsedConfig.project
  )
  const deployerAddress = getSphinxManagerAddress(authAddress, project)

  const gasEstimates = await getGasEstimates(leafs, configArtifacts)

  const proposalRequest: ProposalRequest = {
    apiKey,
    orgId,
    isTestnet,
    chainIds,
    deploymentName: parsedConfig.project,
    owners: newCanonicalConfig.options.owners,
    threshold: newCanonicalConfig.options.threshold,
    authAddress,
    deployerAddress,
    canonicalConfig: JSON.stringify(newCanonicalConfig),
    projectDeployments,
    gasEstimates,
    tree: {
      root,
      chainStatus,
      leaves: proposalRequestLeafs,
    },
  }

  // Only relay the proposal to the back-end if we're not doing a dry run.
  if (!dryRun) {
    await relayProposal(proposalRequest)
    const compilerConfigArray = Object.values(compilerConfigs)
    await relayIPFSCommit(apiKey, orgId, compilerConfigArray)
  }

  spinner.succeed(`${dryRun ? 'Dry run' : 'Proposal'} succeeded!`)

  return proposalRequest
}

export const sphinxCommitAbstractSubtask = async (
  parsedConfig: ParsedConfig,
  commitToIpfs: boolean,
  configArtifacts: ConfigArtifacts,
  ipfsUrl?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<{
  configUri: string
  compilerConfig: CompilerConfig
}> => {
  const { project } = parsedConfig
  if (spinner) {
    commitToIpfs
      ? spinner.start(`Committing ${project}...`)
      : spinner.start('Building the project...')
  }

  const sphinxInputs: Array<SphinxInput> = []
  for (const [referenceName, contractConfig] of Object.entries(
    parsedConfig.contracts
  )) {
    const { buildInfo } = configArtifacts[referenceName]

    const prevSphinxInput = sphinxInputs.find(
      (input) => input.solcLongVersion === buildInfo.solcLongVersion
    )

    // Split the contract's fully qualified name
    const [sourceName, contractName] = contractConfig.contract.split(':')

    const { language, settings, sources } = getMinimumCompilerInput(
      buildInfo.input,
      buildInfo.output.contracts,
      sourceName,
      contractName
    )

    if (prevSphinxInput === undefined) {
      const sphinxInput: SphinxInput = {
        solcVersion: buildInfo.solcVersion,
        solcLongVersion: buildInfo.solcLongVersion,
        id: buildInfo.id,
        input: {
          language,
          settings,
          sources,
        },
      }
      sphinxInputs.push(sphinxInput)
    } else {
      prevSphinxInput.input.sources = {
        ...prevSphinxInput.input.sources,
        ...sources,
      }
    }
  }

  const compilerConfig: CompilerConfig = {
    ...parsedConfig,
    inputs: sphinxInputs,
  }

  const ipfsData = JSON.stringify(compilerConfig, null, 2)

  let ipfsHash
  if (!commitToIpfs) {
    // Get the IPFS hash without publishing anything on IPFS.
    ipfsHash = await Hash.of(ipfsData)
  } else if (ipfsUrl) {
    const ipfs = create({
      url: ipfsUrl,
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else if (process.env.IPFS_PROJECT_ID && process.env.IPFS_API_KEY_SECRET) {
    const projectCredentials = `${process.env.IPFS_PROJECT_ID}:${process.env.IPFS_API_KEY_SECRET}`
    const ipfs = create({
      host: 'ipfs.infura.io',
      port: 5001,
      protocol: 'https',
      headers: {
        authorization: `Basic ${Buffer.from(projectCredentials).toString(
          'base64'
        )}`,
      },
    })
    ipfsHash = (await ipfs.add(ipfsData)).path
  } else {
    throw new Error(
      `To commit to IPFS, you must first setup an IPFS project with
Infura: https://app.infura.io/. Once you've done this, copy and paste the following
variables into your .env file:

IPFS_PROJECT_ID: ...
IPFS_API_KEY_SECRET: ...
        `
    )
  }

  const configUri = `ipfs://${ipfsHash}`

  if (spinner) {
    commitToIpfs
      ? spinner.succeed(`${project} has been committed to IPFS.`)
      : spinner.succeed(`Built ${project}.`)
  }

  return { configUri, compilerConfig }
}

export const deployAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  compilerConfigPath: string,
  deploymentFolder: string,
  integration: Integration,
  cre: SphinxRuntimeEnvironment,
  parsedConfig: ParsedConfig,
  configCache: ConfigCache,
  configArtifacts: ConfigArtifacts,
  newOwner?: string,
  spinner: ora.Ora = ora({ isSilent: true })
): Promise<void> => {
  const { project, deployer } = parsedConfig
  const { networkName, blockGasLimit, localNetwork } = configCache

  const registry = getSphinxRegistry(signer)
  const manager = getSphinxManager(deployer, signer)

  // Register the project with the signer as the owner. Once we've completed the deployment, we'll
  // transfer ownership to the user-defined new owner, if it exists.
  const signerAddress = await signer.getAddress()
  await registerOwner(
    project,
    registry,
    manager,
    signerAddress,
    provider,
    spinner
  )

  spinner.start(`Checking the status of ${project}...`)

  const { configUri, bundles, compilerConfig } = await getProjectBundleInfo(
    parsedConfig,
    configArtifacts,
    configCache
  )

  if (
    bundles.actionBundle.actions.length === 0 &&
    bundles.targetBundle.targets.length === 0
  ) {
    spinner.succeed(`Nothing to execute in this deployment. Exiting early.`)
    return
  }

  const deploymentId = getDeploymentId(bundles, configUri)
  const deploymentState: DeploymentState = await manager.deployments(
    deploymentId
  )
  const initialDeploymentStatus = deploymentState.status
  let currDeploymentStatus = deploymentState.status

  if (currDeploymentStatus === DeploymentStatus.CANCELLED) {
    throw new Error(`${project} was previously cancelled on ${networkName}.`)
  }

  if (currDeploymentStatus === DeploymentStatus.EMPTY) {
    spinner.succeed(`${project} has not been deployed before.`)
    spinner.start(`Approving ${project}...`)
    await (
      await manager.approve(
        bundles.actionBundle.root,
        bundles.targetBundle.root,
        bundles.actionBundle.actions.length,
        bundles.targetBundle.targets.length,
        getNumDeployContractActions(bundles.actionBundle),
        configUri,
        false,
        await getGasPriceOverrides(provider)
      )
    ).wait()
    currDeploymentStatus = DeploymentStatus.APPROVED
    spinner.succeed(`Approved ${project}.`)
  }

  if (
    currDeploymentStatus === DeploymentStatus.APPROVED ||
    currDeploymentStatus === DeploymentStatus.PROXIES_INITIATED
  ) {
    spinner.start(`Executing ${project}...`)

    const success = await executeDeployment(
      manager,
      bundles,
      blockGasLimit,
      configArtifacts,
      provider
    )

    if (!success) {
      throw new Error(
        `Failed to execute ${project}, likely because one of the user's constructors reverted during the deployment.`
      )
    }
  }

  initialDeploymentStatus === DeploymentStatus.COMPLETED
    ? spinner.succeed(`${project} was already completed on ${networkName}.`)
    : spinner.succeed(`Executed ${project}.`)

  if (newOwner) {
    spinner.start(`Transferring ownership to: ${newOwner}`)
    await transferProjectOwnership(
      manager,
      newOwner,
      signerAddress,
      provider,
      spinner
    )
    spinner.succeed(`Transferred ownership to: ${newOwner}`)
  }

  // TODO(post): foundry: this must only be called if the deployment was broadcasted.
  await postDeploymentActions(
    compilerConfig,
    configArtifacts,
    deploymentId,
    compilerConfigPath,
    configUri,
    localNetwork,
    networkName,
    deploymentFolder,
    integration,
    cre.silent,
    manager.owner(),
    provider,
    manager,
    spinner,
    process.env.ETHERSCAN_API_KEY
  )
}

// TODO(post): we need to make `provider` an optional parameter. it should be undefined on the in-process
// anvil node, and defined in all other cases, including the stand-alone anvil node.
export const postDeploymentActions = async (
  compilerConfig: CompilerConfig,
  configArtifacts: ConfigArtifacts,
  deploymentId: string,
  compilerConfigPath: string,
  configUri: string,
  localNetwork: boolean,
  networkName: string,
  deploymentFolder: string,
  integration: Integration,
  silent: boolean,
  owner: string,
  provider: ethers.providers.JsonRpcProvider,
  manager: ethers.Contract,
  spinner?: ora.Ora,
  etherscanApiKey?: string
) => {
  spinner?.start(`Writing deployment artifacts...`)

  if (integration === 'hardhat') {
    writeCompilerConfig(compilerConfigPath, configUri, compilerConfig)
  }

  await trackDeployed(owner, networkName, integration)

  // Only write deployment artifacts if the deployment was completed in the last 150 blocks.
  // This can be anywhere from 5 minutes to half an hour depending on the network
  await writeDeploymentArtifacts(
    provider,
    compilerConfig,
    await getDeploymentEvents(manager, deploymentId),
    networkName,
    deploymentFolder,
    configArtifacts
  )

  spinner?.succeed(`Wrote deployment artifacts.`)

  // TODO(post): wait to see if Foundry can automatically verify the contracts. It's unlikely because we
  // deploy them in a non-standard way, but it's possible. If foundry can do it, we should just
  // never pass in the `etherscanApiKey`. if foundry can't do it, we should  retrieve the api key
  // via `execAsync(forge config --json)` and pass it in here

  if (isSupportedNetworkOnEtherscan(networkName) && etherscanApiKey) {
    if (etherscanApiKey) {
      await verifySphinxConfig(
        compilerConfig,
        configArtifacts,
        provider,
        networkName,
        etherscanApiKey
      )
    } else {
      spinner?.fail(`No Etherscan API Key detected. Skipped verification.`)
    }
  }

  if (integration === 'hardhat') {
    try {
      if (localNetwork || (await isHardhatFork(provider))) {
        // We save the snapshot ID here so that tests on the stand-alone Hardhat network can be run
        // against the most recently deployed contracts.
        await writeSnapshotId(provider, networkName, deploymentFolder)
      }
    } catch (e) {
      if (!e.message.includes('hardhat_metadata')) {
        throw e
      }
    }

    displayDeploymentTable(compilerConfig, silent)
    spinner?.info(
      "Thank you for using Sphinx! We'd love to see you in the Discord: https://discord.gg/7Gc3DK33Np"
    )
  }
}

export const sphinxCancelAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  owner: ethers.Signer,
  projectName: string,
  integration: Integration,
  cre: SphinxRuntimeEnvironment
) => {
  const networkName = await resolveNetworkName(provider, integration)

  const ownerAddress = await owner.getAddress()
  const deployer = getSphinxManagerAddress(ownerAddress, projectName)

  const spinner = ora({ stream: cre.stream })
  spinner.start(`Cancelling deployment for ${projectName} on ${networkName}.`)
  const registry = getSphinxRegistry(owner)
  const manager = getSphinxManager(deployer, owner)

  if (!(await isProjectRegistered(registry, manager.address))) {
    throw new Error(`Project has not been registered yet.`)
  }

  const currOwner = await manager.owner()
  if (currOwner !== ownerAddress) {
    throw new Error(`Project is owned by: ${currOwner}.
You attempted to cancel the project using the address: ${await owner.getAddress()}`)
  }

  const activeDeploymentId = await manager.activeDeploymentId()

  if (activeDeploymentId === ethers.constants.HashZero) {
    spinner.fail(
      `${projectName} does not have an active project, so there is nothing to cancel.`
    )
    return
  }

  await (
    await manager.cancelActiveSphinxDeployment(
      await getGasPriceOverrides(provider)
    )
  ).wait()

  spinner.succeed(`Cancelled deployment for ${projectName} on ${networkName}.`)

  await trackCancel(await manager.owner(), networkName, integration)
}

export const sphinxExportProxyAbstractTask = async (
  provider: ethers.providers.JsonRpcProvider,
  owner: ethers.Signer,
  projectName: string,
  referenceName: string,
  integration: Integration,
  parsedConfig: ParsedConfig,
  cre: SphinxRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const ownerAddress = await owner.getAddress()
  const deployer = getSphinxManagerAddress(ownerAddress, projectName)

  const registry = getSphinxRegistry(owner)
  const manager = getSphinxManager(deployer, owner)

  // Throw an error if the project has not been registered
  if ((await isProjectRegistered(registry, manager.address)) === false) {
    throw new Error(`Project has not been registered yet.`)
  }

  const projectOwner = await manager.owner()

  const signerAddress = await owner.getAddress()
  if (projectOwner !== signerAddress) {
    throw new Error(`Caller does not own the project.`)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Claiming proxy ownership...')

  const activeDeploymentId = await manager.activeDeploymentId()
  if (activeDeploymentId !== ethers.constants.HashZero) {
    throw new Error(
      `A project is currently being executed. Proxy ownership has not been transferred.
  Please wait a couple of minutes before trying again.`
    )
  }

  const targetContract = parsedConfig[projectName].contracts[referenceName]
  await (
    await manager.exportProxy(
      targetContract.address,
      contractKindHashes[targetContract.kind],
      signerAddress,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  const networkName = await resolveNetworkName(provider, integration)
  await trackExportProxy(projectOwner, networkName, integration)

  spinner.succeed(`Proxy ownership claimed by address ${signerAddress}`)
}

export const sphinxImportProxyAbstractTask = async (
  project: string,
  provider: ethers.providers.JsonRpcProvider,
  signer: ethers.Signer,
  proxy: string,
  integration: Integration,
  owner: string,
  cre: SphinxRuntimeEnvironment
) => {
  const spinner = ora({ isSilent: cre.silent, stream: cre.stream })
  spinner.start('Checking project registration...')

  const deployer = getSphinxManagerAddress(owner, project)
  const registry = getSphinxRegistry(signer)
  const manager = getSphinxManager(deployer, signer)

  // Throw an error if the project has not been registered
  if ((await isProjectRegistered(registry, manager.address)) === false) {
    throw new Error(`Project has not been registered yet.`)
  }

  spinner.succeed('Project registration detected')
  spinner.start('Checking proxy compatibility...')

  const networkName = await resolveNetworkName(provider, integration)
  if ((await provider.getCode(proxy)) === '0x') {
    throw new Error(`Proxy is not deployed on ${networkName}: ${proxy}`)
  }

  // TODO: These checks were written when we didn't prompt the user for their proxy type. Now that
  // we do, we should run just the function that corresponds to the proxy type they selected. E.g.
  // if they selected oz-uups, then we should only run `isUUPSProxy`. Also, the
  // `isInternalDefaultProxy` function relies on the `DefaultProxyDeployed` event, which no longer
  // exists. I'm not even sure we need `isInternalDefaultProxy` anymore, so we should first figure
  // that out.
  //   if (
  //     (await isInternalDefaultProxy(provider, proxy)) === false &&
  //     (await isTransparentProxy(provider, proxy)) === false &&
  //     (await isUUPSProxy(provider, proxy)) === false
  //   ) {
  //     throw new Error(`Sphinx does not support your proxy type.
  // Currently Sphinx only supports UUPS and Transparent proxies that implement EIP-1967 which yours does not appear to do.
  // If you believe this is a mistake, please reach out to the developers or open an issue on GitHub.`)
  //   }

  const ownerAddress = await getEIP1967ProxyAdminAddress(provider, proxy)

  // If proxy owner is already Sphinx, then throw an error
  if (
    ethers.utils.getAddress(manager.address) ===
    ethers.utils.getAddress(ownerAddress)
  ) {
    throw new Error('Proxy is already owned by Sphinx')
  }

  // If the signer doesn't own the proxy, then throw an error
  const signerAddress = await signer.getAddress()
  if (
    ethers.utils.getAddress(ownerAddress) !==
    ethers.utils.getAddress(signerAddress)
  ) {
    throw new Error(`Proxy is owned by: ${ownerAddress}.
  You attempted to transfer ownership of the proxy using the address: ${signerAddress}`)
  }

  spinner.succeed('Proxy compatibility verified')
  spinner.start('Transferring proxy ownership to Sphinx...')

  // Transfer ownership of the proxy to the SphinxManager.
  const Proxy = new ethers.Contract(proxy, ProxyABI, signer)
  await (
    await Proxy.changeAdmin(
      manager.address,
      await getGasPriceOverrides(provider)
    )
  ).wait()

  await trackImportProxy(await manager.owner(), networkName, integration)

  spinner.succeed('Proxy ownership successfully transferred to Sphinx')
}

export const getProjectBundleInfo = async (
  parsedConfig: ParsedConfig,
  configArtifacts: ConfigArtifacts,
  configCache: ConfigCache
): Promise<{
  configUri: string
  compilerConfig: CompilerConfig
  bundles: SphinxBundles
}> => {
  const { configUri, compilerConfig } = await sphinxCommitAbstractSubtask(
    parsedConfig,
    false,
    configArtifacts
  )

  const bundles = makeBundlesFromConfig(
    parsedConfig,
    configArtifacts,
    configCache
  )

  return { configUri, compilerConfig, bundles }
}

export const approveDeployment = async (
  projectName: string,
  bundles: SphinxBundles,
  configUri: string,
  manager: ethers.Contract,
  signerAddress: string,
  provider: ethers.providers.Provider
) => {
  const projectOwnerAddress = await manager.owner()
  if (signerAddress !== projectOwnerAddress) {
    throw new Error(
      `Caller is not the project owner.\n` +
        `Caller's address: ${signerAddress}\n` +
        `Owner's address: ${projectOwnerAddress}`
    )
  }

  await (
    await manager.approve(
      bundles.actionBundle.root,
      bundles.targetBundle.root,
      bundles.actionBundle.actions.length,
      bundles.targetBundle.targets.length,
      getNumDeployContractActions(bundles.actionBundle),
      configUri,
      false,
      await getGasPriceOverrides(provider)
    )
  ).wait()
}
