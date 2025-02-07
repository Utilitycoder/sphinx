import { ethers } from 'ethers'
import {
  ProxyABI,
  ProxyArtifact,
  buildInfo as sphinxBuildInfo,
} from '@sphinx-labs/contracts'

import {
  ConfigArtifacts,
  ParsedConfig,
  contractKindHashes,
} from '../config/types'
import {
  CompilerOutput,
  SolidityStorageLayout,
} from '../languages/solidity/types'
import {
  writeDeploymentFolderForNetwork,
  getConstructorArgs,
  writeDeploymentArtifact,
} from '../utils'
import 'core-js/features/array/at'

/**
 * Gets the storage layout for a contract.
 *
 * @param contractFullyQualifiedName Fully qualified name of the contract.
 * @param artifactFolder Relative path to the folder where artifacts are stored.
 * @return Storage layout object from the compiler output.
 */
export const getStorageLayout = (
  compilerOutput: CompilerOutput,
  sourceName: string,
  contractName: string
): SolidityStorageLayout => {
  const contractOutput = compilerOutput.contracts[sourceName][contractName]

  // Foundry artifacts do not contain the storage layout field for contracts which have no storage.
  // So we default to an empty storage layout in this case for consistency.
  return contractOutput.storageLayout ?? { storage: [], types: {} }
}

export const getDeployedBytecode = async (
  provider: ethers.providers.JsonRpcProvider,
  address: string
): Promise<string> => {
  const deployedBytecode = await provider.getCode(address)
  return deployedBytecode
}

export const writeDeploymentArtifacts = async (
  provider: ethers.providers.Provider,
  parsedConfig: ParsedConfig,
  deploymentEvents: ethers.Event[],
  networkDirName: string,
  deploymentFolderPath: string,
  configArtifacts: ConfigArtifacts
) => {
  writeDeploymentFolderForNetwork(networkDirName, deploymentFolderPath)

  const managerAddress = parsedConfig.manager

  for (const deploymentEvent of deploymentEvents) {
    if (!deploymentEvent.args) {
      throw new Error(`Deployment event has no arguments. Should never happen.`)
    }

    const receipt = await deploymentEvent.getTransactionReceipt()

    if (deploymentEvent.args.contractKindHash === contractKindHashes['proxy']) {
      // The deployment event is for a default proxy.
      const { metadata, storageLayout } =
        sphinxBuildInfo.output.contracts[
          '@eth-optimism/contracts-bedrock/contracts/universal/Proxy.sol'
        ]['Proxy']
      const { devdoc, userdoc } =
        typeof metadata === 'string'
          ? JSON.parse(metadata).output
          : metadata.output

      // Define the deployment artifact for the proxy.
      const proxyArtifact = {
        address: deploymentEvent.args.contractAddress,
        abi: ProxyABI,
        transactionHash: deploymentEvent.transactionHash,
        solcInputHash: sphinxBuildInfo.id,
        receipt: {
          ...receipt,
          gasUsed: receipt.gasUsed.toString(),
          cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
          // Exclude the `effectiveGasPrice` if it's undefined, which is the case on Optimism.
          ...(receipt.effectiveGasPrice && {
            effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          }),
        },
        numDeployments: 1,
        metadata:
          typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        args: [managerAddress],
        bytecode: ProxyArtifact.bytecode,
        deployedBytecode: await provider.getCode(
          deploymentEvent.args.contractAddress
        ),
        devdoc,
        userdoc,
        storageLayout,
      }

      // Write the deployment artifact for the proxy contract.
      writeDeploymentArtifact(
        networkDirName,
        deploymentFolderPath,
        proxyArtifact,
        `${deploymentEvent.args.referenceName}Proxy`
      )
    } else {
      // Get the deployed contract's info.
      const referenceName = deploymentEvent.args.referenceName
      const { artifact, buildInfo } = configArtifacts[referenceName]
      const { sourceName, contractName, bytecode, abi } = artifact
      const constructorArgValues = getConstructorArgs(
        parsedConfig.contracts[referenceName].constructorArgs,
        abi
      )
      const { metadata } = buildInfo.output.contracts[sourceName][contractName]
      const storageLayout = getStorageLayout(
        buildInfo.output,
        sourceName,
        contractName
      )
      const { devdoc, userdoc } =
        typeof metadata === 'string'
          ? JSON.parse(metadata).output
          : metadata.output

      // Define the deployment artifact for the deployed contract.
      const contractArtifact = {
        address: deploymentEvent.args.contractAddress,
        abi,
        transactionHash: deploymentEvent.transactionHash,
        solcInputHash: buildInfo.id,
        receipt: {
          ...receipt,
          gasUsed: receipt.gasUsed.toString(),
          cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
          // Exclude the `effectiveGasPrice` if it's undefined, which is the case on Optimism.
          ...(receipt.effectiveGasPrice && {
            effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          }),
        },
        numDeployments: 1,
        metadata:
          typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        args: constructorArgValues,
        bytecode,
        deployedBytecode: await provider.getCode(
          deploymentEvent.args.contractAddress
        ),
        devdoc,
        userdoc,
        storageLayout,
      }
      // Write the deployment artifact for the deployed contract.
      writeDeploymentArtifact(
        networkDirName,
        deploymentFolderPath,
        contractArtifact,
        referenceName
      )
    }
  }
}
