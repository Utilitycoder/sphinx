import {
  getOwnerAddress,
  ManagedServiceArtifact,
  SphinxRegistryArtifact,
  SphinxManagerArtifact,
  DefaultAdapterArtifact,
  OZUUPSOwnableAdapterArtifact,
  OZUUPSAccessControlAdapterArtifact,
  DefaultUpdaterArtifact,
  OZUUPSUpdaterArtifact,
  OZTransparentAdapterArtifact,
  DefaultCreate3Artifact,
  SphinxManagerProxyArtifact,
  ProxyArtifact,
  AuthFactoryArtifact,
  AuthArtifact,
  BalanceFactoryArtifact,
  BalanceArtifact,
  EscrowArtifact,
  AuthProxyArtifact,
} from '@sphinx-labs/contracts'
import { constants, providers } from 'ethers/lib/ethers'

import { ContractArtifact } from './languages/solidity/types'
import {
  getManagerConstructorValues,
  OZ_UUPS_UPDATER_ADDRESS,
  DEFAULT_UPDATER_ADDRESS,
  getSphinxRegistryAddress,
  getRegistryConstructorValues,
  getSphinxManagerV1Address,
  DEFAULT_ADAPTER_ADDRESS,
  OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
  OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
  OZ_TRANSPARENT_ADAPTER_ADDRESS,
  DEFAULT_CREATE3_ADDRESS,
  getManagedServiceAddress,
  REFERENCE_SPHINX_MANAGER_PROXY_ADDRESS,
  REFERENCE_PROXY_ADDRESS,
  AUTH_FACTORY_ADDRESS,
  AUTH_IMPL_V1_ADDRESS,
  getReferenceBalanceContractAddress,
  getReferenceBalanceConstructorArgs,
  getReferenceEscrowConstructorArgs,
  getBalanceFactoryAddress,
  getReferenceEscrowContractAddress,
  ReferenceAuthProxyAddress,
} from './addresses'
import { USDC_ADDRESSES } from './networks'

export const getSphinxConstants = async (
  provider: providers.Provider
): Promise<
  Array<{
    artifact: ContractArtifact
    expectedAddress: string
    constructorArgs: any[]
  }>
> => {
  const { chainId } = await provider.getNetwork()
  const contractInfo = [
    {
      artifact: SphinxRegistryArtifact,
      expectedAddress: getSphinxRegistryAddress(),
      constructorArgs: getRegistryConstructorValues(),
    },
    {
      artifact: SphinxManagerArtifact,
      expectedAddress: getSphinxManagerV1Address(chainId),
      constructorArgs: getManagerConstructorValues(chainId),
    },
    {
      artifact: DefaultAdapterArtifact,
      expectedAddress: DEFAULT_ADAPTER_ADDRESS,
      constructorArgs: [DEFAULT_UPDATER_ADDRESS],
    },
    {
      artifact: OZUUPSOwnableAdapterArtifact,
      expectedAddress: OZ_UUPS_OWNABLE_ADAPTER_ADDRESS,
      constructorArgs: [OZ_UUPS_UPDATER_ADDRESS],
    },
    {
      artifact: OZUUPSAccessControlAdapterArtifact,
      expectedAddress: OZ_UUPS_ACCESS_CONTROL_ADAPTER_ADDRESS,
      constructorArgs: [OZ_UUPS_UPDATER_ADDRESS],
    },
    {
      artifact: OZTransparentAdapterArtifact,
      expectedAddress: OZ_TRANSPARENT_ADAPTER_ADDRESS,
      constructorArgs: [DEFAULT_UPDATER_ADDRESS],
    },
    {
      artifact: DefaultUpdaterArtifact,
      expectedAddress: DEFAULT_UPDATER_ADDRESS,
      constructorArgs: [],
    },
    {
      artifact: OZUUPSUpdaterArtifact,
      expectedAddress: OZ_UUPS_UPDATER_ADDRESS,
      constructorArgs: [],
    },
    {
      artifact: DefaultCreate3Artifact,
      expectedAddress: DEFAULT_CREATE3_ADDRESS,
      constructorArgs: [],
    },
    {
      artifact: ManagedServiceArtifact,
      expectedAddress: getManagedServiceAddress(chainId),
      constructorArgs: [
        getOwnerAddress(),
        chainId === 420 || chainId === 10
          ? USDC_ADDRESSES[chainId]
          : constants.AddressZero,
      ],
    },
    {
      artifact: SphinxManagerProxyArtifact,
      expectedAddress: REFERENCE_SPHINX_MANAGER_PROXY_ADDRESS,
      constructorArgs: [getSphinxRegistryAddress(), getSphinxRegistryAddress()],
    },
    {
      artifact: ProxyArtifact,
      expectedAddress: REFERENCE_PROXY_ADDRESS,
      constructorArgs: [getSphinxRegistryAddress()],
    },
    {
      artifact: AuthArtifact,
      expectedAddress: AUTH_IMPL_V1_ADDRESS,
      constructorArgs: [[1, 0, 0]],
    },
    {
      artifact: AuthFactoryArtifact,
      expectedAddress: AUTH_FACTORY_ADDRESS,
      constructorArgs: [getSphinxRegistryAddress(), getOwnerAddress()],
    },
    {
      artifact: AuthProxyArtifact,
      expectedAddress: ReferenceAuthProxyAddress,
      constructorArgs: [AUTH_FACTORY_ADDRESS, constants.AddressZero],
    },
  ]

  // Add any network-specific contracts to the array.
  if (chainId === 10 || chainId === 420) {
    const usdcAddress = USDC_ADDRESSES[chainId]
    // Only add the Optimism-specific contracts if the USDC contract address exists. This contract
    // won't exist if we're on a local Anvil node that has an Optimism chain ID, which occurs
    // during testing.
    if ((await provider.getCode(usdcAddress)) !== '0x') {
      // These are contracts that only exist on Optimism Mainnet (chain ID 10) and Optimism Goerli
      // (chain ID 420).
      const balanceFactoryAddress = getBalanceFactoryAddress(chainId)
      const escrowAddress = getReferenceEscrowContractAddress(chainId)
      const optimismContractInfo = [
        {
          artifact: BalanceFactoryArtifact,
          expectedAddress: balanceFactoryAddress,
          constructorArgs: [usdcAddress, getManagedServiceAddress(chainId)],
        },
        {
          artifact: BalanceArtifact,
          expectedAddress: getReferenceBalanceContractAddress(chainId),
          constructorArgs: getReferenceBalanceConstructorArgs(chainId),
        },
        {
          artifact: EscrowArtifact,
          expectedAddress: escrowAddress,
          constructorArgs: getReferenceEscrowConstructorArgs(chainId),
        },
      ]
      contractInfo.push(...optimismContractInfo)
    }
  }

  return contractInfo
}
