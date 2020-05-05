## Configurable Rights Pool

PCToken.sol - Balancer Smart Pool token. ERC20 with some extra math functions.

IBFactory.sol - Interface for [Balancer Factory](https://github.com/balancer-labs/balancer-core/blob/master/contracts/BFactory.sol).

CRPFactory.sol - Creates & stores registry of ConfigurableRightsPools.

ConfigurableRightsPool.sol - Main Configurable Rights Pool contract.
- Should it have a getController function?
- Is INIT_POOL_SUPPLY correct?
- Should _rights be public so people know what settings are?

## Getting Started - Local Testing

`yarn`

`yarn testrpc`

`yarn test`
