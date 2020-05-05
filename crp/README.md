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
* `uint minimumWeightChangeBlockPeriod` - ???????
* `uint addTokenTimeLockInBLocks` - ???????
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

### ConfigurableRightsPool.sol

Configurable Rights Pool contract.
- Should it have a getController function?
- Is INIT_POOL_SUPPLY correct?
- Should _rights be public so people know what settings are?

### PCToken.sol

Balancer Smart Pool token. ERC20 with some extra math functions.

### IBFactory.sol

Interface for [Balancer Factory](https://github.com/balancer-labs/balancer-core/blob/master/contracts/BFactory.sol).

## Getting Started - Local Testing

`yarn`

`yarn testrpc`

`yarn test`
