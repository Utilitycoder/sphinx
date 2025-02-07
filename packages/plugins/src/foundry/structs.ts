import { MinimalConfigCache } from '@sphinx-labs/core/dist/config/types'
import { defaultAbiCoder } from 'ethers/lib/utils'

export const decodeCachedConfig = (
  encodedConfigCache: string,
  SphinxUtilsABI: any
): MinimalConfigCache => {
  const configCacheType = SphinxUtilsABI.find(
    (fragment) => fragment.name === 'configCache'
  ).outputs[0]

  const configCache = defaultAbiCoder.decode(
    [configCacheType],
    encodedConfigCache
  )[0]

  const structuredConfigCache: MinimalConfigCache = {
    blockGasLimit: configCache.blockGasLimit,
    chainId: configCache.chainId,
    isManagerDeployed: configCache.isManagerDeployed,
    contractConfigCache: {},
  }

  for (const cachedContract of configCache.contractConfigCache) {
    structuredConfigCache.contractConfigCache[cachedContract.referenceName] = {
      isTargetDeployed: cachedContract.isTargetDeployed,
      deploymentRevert: {
        deploymentReverted: cachedContract.deploymentRevert.deploymentReverted,
        revertString: cachedContract.deploymentRevert.revertString.exists
          ? cachedContract.deploymentRevert.revertString.value
          : undefined,
      },
      importCache: {
        requiresImport: cachedContract.importCache.requiresImport,
        currProxyAdmin: cachedContract.importCache.currProxyAdmin.exists
          ? cachedContract.importCache.currProxyAdmin.value
          : undefined,
      },
      previousConfigUri: cachedContract.previousConfigUri.exists
        ? cachedContract.previousConfigUri.value
        : undefined,
    }
  }

  return structuredConfigCache
}
