# @sphinx-labs/contracts

## 0.9.4

### Patch Changes

- ec24a7b6: Fix nohoist bug
- 99fd9f09: Remove dependency on inherited forge-std contracts in Sphinx.sol

## 0.9.3

### Patch Changes

- d88ec605: Fix bugs in getting started guides

## 0.9.2

### Patch Changes

- a778e4ff: Include build during release process

## 0.9.1

### Patch Changes

- 02674b8e: Include readme in release
- edf822d7: Rename scope to sphinx-labs

## 0.9.0

### Minor Changes

- 0b4dd04e: Add first-class support for organizations and one-click multi-chain deployments
- 1ce34a93: Add Balance contracts
- 21e3702f: Remove the concept of an organization in the core logic

### Patch Changes

- 48668b7e: Add Foundry deploy task and update proposal, test, and init tasks
- 115d3c10: Rebrand
- 227da3f8: Add crosschain funding contract

## 0.8.2

### Patch Changes

- 586c823: Minimize size of Sphinx.sol and allow Solidity versions >= 0.7.4

## 0.8.1

### Patch Changes

- 60d60bc: Include contract source files in release

## 0.8.0

### Minor Changes

- b6d1f76: Overhaul Foundry Integration

## 0.7.3

### Patch Changes

- c51462c: Use canary release of op bedrock

## 0.7.2

### Patch Changes

- bf7fe7f: Fix artifact import path

## 0.7.1

### Patch Changes

- 08f312f: Include dependency artifacts in package

## 0.7.0

### Minor Changes

- ea4bc1e: Add a protocol fee to be collected during execution
- c319493: Deploy contracts before modifying proxies during execution
- e5b9f81: Add SphinxClaimer which will exist on L1
- d652952: Use create3 to deploy non-proxy contracts
- d2f9fae: Add local adapter contract
- 57cd798: Make Sphinx non-upgradeable
- 34790fa: Add helper function on SphinxManager to execute entire bundle in one transaction
- 1ba3adc: Make contract execution atomic
- 1c8fc74: Support rollbacks in the contracts
- e797869: Add claimer field to config
- ac40b0b: Require that proposers are approved by the project owner

### Patch Changes

- b8952d1: Remove TODOs in the SphinxManager
- 1ac2ebd: Optimize gas in contract for loops
- 49a4934: Support arbitrary contract calls from the ManagedService contract
- ddbea87: Add Semver versioning to SphinxManager
- 28e807d: Fix incorrect fee calculation
- c309331: Add organization ID
- 73277b5: Add reentrancy guards to the bundle initiation and completion functions
- 491683b: Move `adapter.initiateExecution` function into the corresponding function in the SphinxManager
- 9fccb34: Merge execution functions in the SphinxManager
- 992e2fb: Resolve build info files automatically
- c2712bf: Allow executor to withdraw specified amount of debt
- 69dcfba: Add support for opt-in manager upgrades
- aa7051a: Skip deploying a contract if it already exists
- b41ec91: Remove unnecessary receive and fallback functions in updater contracts
- b204c6e: Allow bundles to be proposed after being completed or cancelled
- ff87792: Fix behavior of contracts deployed using Create3
- da576c3: Split UUPS adapter into ownable and access control adapters
- f72b185: Use general Create2 contract
- ae6641d: Add propoer address to bundle proposed event
- 99ef1a7: Allow configurable system owner
- 0c045f9: Remove Optimism-specific logic for tx.gasprice in SphinxManager
- c87c4a3: Resolve slither warnings
- 15368e8: Add PermissionedCaller contract
- 2b9f72c: Check that the bundle has been initiated in the `executeActions` function
- b05b489: Replace TODOs with Linear tickets
- 5e6feaa: Improve gas estimation on-chain
- 3d9f9c2: Add support for deploying stateless non-proxied contracts
- f433bc2: Remove claimer from config and registry
- 11fd15c: Make sphinx-deploy task execute locally by default

## 0.6.0

### Minor Changes

- 3da5ee8: Add meta upgrades to SphinxRegistry

### Patch Changes

- 3e923a0: Change implementation salt and skip deploying implementation if it's already been deployed
- c76142e: Remove contract unit tests until Sphinx contracts stabilize
- 35c7a63: Add meta upgrades for root SphinxManager

## 0.5.2

### Patch Changes

- 20f1a7e: Use JSON bundle in contract unit tests
- c8af97c: Update `setStorage` function to set only a segment of a storage slot
- 736b859: Update contract unit tests to reflect new storage slot segment setter

## 0.5.1

### Patch Changes

- ca6d384: Bump contracts

## 0.5.0

### Minor Changes

- fa3f420: Add support for UUPS proxies

### Patch Changes

- 263b34d: Add logic for claiming bundles
- 57a327d: Temporarily allow anyone to propose bundles

## 0.4.3

### Patch Changes

- 4265ae4: Bump sphinx salt value
- 4554d0c: Make `SphinxManagerProxy` address stable by removing dependency on `SphinxRegistry`'s bytecode
- 591e7da: improve transparent proxy test names

## 0.4.2

### Patch Changes

- 4029daf: Change `target` to `referenceName` everywhere

## 0.4.1

### Patch Changes

- 5a135ec: Fix issue verifying Sphinx contracts

## 0.4.0

### Minor Changes

- 0443459: Support custom transparent proxies

### Patch Changes

- 60d7adc: Make executors permissioned
- 40f0d0a: Add OpenZeppelin storage slot checker

## 0.3.17

### Patch Changes

- 2267ec4: Bump versions

## 0.3.16

### Patch Changes

- 10f3054: Use `tx.gasprice` instead of `block.basefee`
- fdf512b: Adds a universal salt that makes it easy to deploy new versions of the Sphinx contracts
- 88e9465: Update owner multisig address
- a60020a: Remove Infura as RPC URL service

## 0.3.15

### Patch Changes

- 74a61c0: Change deployment process so that Sphinx addresses are calculated based on multisig address
- 3ec7a05: Announce events with data on the SphinxRegistry

## 0.3.14

### Patch Changes

- c5cf649: Add events for default proxy and implementation contract deployment

## 0.3.13

### Patch Changes

- 7047b9d: Update implementations mapping to use the salt as its key
- b55ab15: Use a salted Create2 call to deploy implementation contracts

## 0.3.12

### Patch Changes

- 40c7bfb: Adds proposers to the SphinxManager

## 0.3.11

### Patch Changes

- d7fff20: Several improvements / bug fixes discovered when deploying on Optimism's devnet.
- b1850ad: Change implementation contract deployment from create2 to create
- e1dc2ec: Upgrade contract tests to reflect latest deployment flow
- da79232: Remove unnecessary dependencies

## 0.3.10

### Patch Changes

- 6f83489: Add support for executing multiple actions at once in the SphinxManager
- 16348b2: Make the SphinxRegistry proxy's address deterministic
- 9be91c3: Fix underflow bug when cancelling bundle with no executor

## 0.3.9

### Patch Changes

- ed7babc: Fix bug where implementation contract deployments were failing due to out-of-gas

## 0.3.8

### Patch Changes

- 6a6f0c0: Hard-code build info file as a temporary fix

## 0.3.7

### Patch Changes

- a536675: Export constructor arguments for all Sphinx contracts
- 273d4c3: Use creation bytecode instead of the `DEPLOY_CODE_PREFIX` to deploy implementation contracts for Etherscan compatibility
- c08a950: Export Sphinx predeploy contracts
- 78acb9a: Fix build info export bug

## 0.3.6

### Patch Changes

- e9c881b: Hardcode basefee on Optimism

## 0.3.5

### Patch Changes

- 123d9c1: Add support for deployments on live networks

## 0.3.4

### Patch Changes

- d0344f7: Remove ownership requirement to propose bundles

## 0.3.3

### Patch Changes

- 2c5b238: Support demo

## 0.3.2

### Patch Changes

- 03d557c: Bump all versions

## 0.3.1

### Patch Changes

- 557e3bd: Bump versions
- cd310fe: Export artifacts folder in contracts package

## 0.3.0

### Minor Changes

- 52c7f6c: Bump all packages

## 0.2.2

### Patch Changes

- 4a87fb7: Bump contracts package

## 0.2.1

### Patch Changes

- eb1d3de: Bump contracts package

## 0.2.0

### Minor Changes

- 416d41b: Add unit and integration tests to the Sphinx contracts
- 19cf359: Adds local Sphinx deployments for testing contracts on the Hardhat network.
- 53e1514: Adds upgradeability to the Manager and Registry contracts.

## 0.2.0

### Minor Changes

- 5109141: Adds a ProxyUpdater contract, which contains the logic for the setCode/setStorage actions.
- e7ee72d: Adds the ProxyAdmin, which owns the proxies for a project.
- d7f930f: Adds executor selection to Manager
- 3450d6f: Implements the adapter for the default proxy.
- da53947: Adds logic for handling project owner and executor bonds in SphinxManager
- f92ff76: Adds logic to the Manager to support non-standard proxies. Removes SphinxProxy in favor of a
  minimal EIP-1967 proxy.
- 2cc3bc9: Adds the Simple Lock ESS

### Patch Changes

- e0db3d0: Moves `setCode` logic from ProxyUpdater to ProxyAdmin
- efccd1a: Deploys `ProxyAdmin` in `SphinxManager` so that it is owned by the manager.
- 967b529: Allows project owners to transfer proxy ownership by querying with the target's name
- 67c3507: Allow project owner to claim ownership of their proxies.
- 2cc3bc9: Removes Executor Selection Strategies and merges executor selector logic into the SphinxManager.
- 3a7b19c: Fixes a typo in a variable name (activebundleID => activeBundleID) that was created as a result of an errant find/replace

## 0.1.1

### Patch Changes

- 6403ed2: Add hardhat-deploy script for SphinxRegistry
- e5fe498: Brings back the SphinxManager contract
