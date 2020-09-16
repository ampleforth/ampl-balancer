
## Deployed addresses

```yaml
ampl: "0xD46bA6D942050d489DBd938a2C909A5d5039A161"
usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"

bFactory: "0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd"
crpPool: "0xD31D776c18522Ac0776283A0c54fCA181f61D4f7"
controller: "0x6723B7641c8Ac48a61F5f505aB1E9C03Bb44a301"
bPool: "0x0b0448EE12653B2DDD12b2C4B858E98de30B4eb9"
wrapper: "0xE39953DEac442fD5A2CCd1ca3a1F5b4B90be229A"

RightsManager: "0x2992a06AF9b5E156cD6574049d37aD8Da52b9e28"
SmartPoolManager: "0xA854eCC4d8bF77CAD542a04087fC6e0082d43b86"
BalancerSafeMath: "0x5147FD16f4F7bfBc33F9fdcC5b82f945e37fE4D8"
```

### Constraints

```
minFee = BONE / 10**6 => 1e12 => 0.0001%
maxFee = BONE / 10  => 1e17 => 10%

poolFee = 3e15 = 3000000000000000 => 0.3%

MIN_POOL_SUPPLY = 1e18 * 100
MAX_POOL_SUPPLY = 1e18 * 10**9
initialSupply = 1e18 * 1000 = 1e21 (100AMPL/100USDC)
```

### Pool Parameters

```
permissions = {
  canPauseSwapping: true,
  canChangeSwapFee: true,
  canChangeWeights: true,
  canAddRemoveTokens: false,
  canWhitelistLPs: false,
  canChangeCap: false
}

poolParams = {
  "poolTokenSymbol": "BAL-REBASING-SMART-V1-AMPL-USDC",
  "poolTokenName": "Balancer Rebasing Smart Pool Token V1 (AMPL-USDC)",
  "constituentTokens": [
    "0xD46bA6D942050d489DBd938a2C909A5d5039A161",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  ],
  "tokenBalances": ["100000000000","100000000"],
  "tokenWeights": ["7071067811870000000", "7071067811870000000"],
  "swapFee": "3000000000000000"
}
```

### Deployment

```
const rightsManager = await RightsManager.new();
const smartPoolManager = await SmartPoolManager.new();
const balSafeMath = await BalancerSafeMath.new();

const rightsManager = await RightsManager.at("0x2992a06AF9b5E156cD6574049d37aD8Da52b9e28")
const smartPoolManager = await SmartPoolManager.at("0xA854eCC4d8bF77CAD542a04087fC6e0082d43b86")
const balSafeMath = await BalancerSafeMath.at("0x5147FD16f4F7bfBc33F9fdcC5b82f945e37fE4D8")

await AmplElasticCRP.detectNetwork();
await AmplElasticCRP.link('RightsManager', rightsManager.address);
await AmplElasticCRP.link('SmartPoolManager', smartPoolManager.address);
await AmplElasticCRP.link('BalancerSafeMath', balSafeMath.address);

deployer = "0x5A617f363674489339226E8A448307763a43108F"
bFactory = "0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd"
crpPool = await AmplElasticCRP.new(bFactory, poolParams, permissions);
# crpPool = await AmplElasticCRP.at("0xD31D776c18522Ac0776283A0c54fCA181f61D4f7");
await crpPool.setController(deployer);
await crpPool.getController.call()

initialSupply = '1000000000000000000000' // 1000e18
minimumWeightChangeBlockPeriod = 10;
addTokenTimeLockInBlocks = 10;

await crpPool.createPool(initialSupply, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks);
```

### Orchestrator transaction

```
web3.eth.abi.encodeFunctionCall({
  name: 'safeResync',
  type: 'function',
  inputs: [{
      type: 'address',
      name: 'crp'
  }, {
      type: 'address',
      name: 'bpool'
  }, {
      type: 'address',
      name: 'token'
  }],
}, [
  '0xD31D776c18522Ac0776283A0c54fCA181f61D4f7',
  '0x0b0448EE12653B2DDD12b2C4B858E98de30B4eb9',
  '0xD46bA6D942050d489DBd938a2C909A5d5039A161'
]);


0x0bbc6873000000000000000000000000d31d776c18522ac0776283a0c54fca181f61d4f70000000000000000000000000b0448ee12653b2ddd12b2c4b858e98de30b4eb9000000000000000000000000d46ba6d942050d489dbd938a2c909a5d5039a161
```
