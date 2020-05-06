# Configurable Rights Pool

### CRPFactory.sol

Creates new ConfigurableRightsPools & stores registry of their addresses.

#### `newCrp`

Creates new ConfigurableRightsPools with caller as contract controller.

###### Params
* `address factoryAddress` - BFactory address.
* `address[] tokens` - Array of token addresses. The pool will hold these.
* `uint256[] startBalances` - Array of initial balances for the tokens above.
* `uint256[] startWeights` - Array of initial weights for the tokens above.
* `uint swapFee` - Initial swap fee for the pool.
* `uint minimumWeightChangeBlockPeriod` - Amount of blocks that have to pass before a new weight can be applied.
* `uint addTokenTimeLockInBLocks` - Amount of blocks that have to pass before a new commited token can be applied.
*  `bool[4] rights` - Bool array of rights. These are - [pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens] Set for true to allow.

###### Response
```
Returns address of new ConfigurableRightsPool.
```
###### Example Code
```javascript
await crpFactory.newCrp(
    bfactory.address,
    [XYZ, WETH, DAI],
    [toWei('80000'), toWei('40'), toWei('10000')],
    [toWei('12'), toWei('1.5'), toWei('1.5')],
    toWei('0.003'),
    10,
    10,
    [false, false, false, true] // Sets configurableAddRemoveTokens right
);
```

- Is above documentation style worth continuing for rest?

### ConfigurableRightsPool.sol

commitAddToken(address token, uint balance, uint denormalizedWeight)
- Precommits a new token that can be applied addTokenTimeLockInBLocks blocks in the future.

applyAddToken()
- Applies above committed token & mints pool shares if addTokenTimeLockInBLocks blocks in the future.

removeToken(address token)
Removes an existing token and returns balance to controller.

upDateWeight(address token, uint256 newWeight)
Updates weight for given token but keeps prices the same. Balances of token will change so user must have enough.




Configurable Rights Pool contract.
- Should it have a getController function?
- Is INIT_POOL_SUPPLY correct - Should it be configurable?
- Should _rights be public so people can query what settings are?
- Why max total weight 50?
- Should commitAddToken on already bound token be allowed? applyAddToken() reverts but seems like a waste?
- Change commitAddToken to commitNewToken? (Then applyAddToken to applyNewToken)


### PCToken.sol

Balancer Smart Pool token. ERC20 with some extra math functions.

### IBFactory.sol

Interface for [Balancer Factory](https://github.com/balancer-labs/balancer-core/blob/master/contracts/BFactory.sol).

## Getting Started - Local Testing

`yarn`

`yarn testrpc`

`yarn test`
