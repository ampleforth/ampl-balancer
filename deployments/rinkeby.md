
## Deployed addresses

```yaml
ampl: "0x027dbcA046ca156De9622cD1e2D907d375e53aa7"
usdc: "0x21F3179cADAE46509f615428F639e38123A508Ac"

bFactory: "0x9C84391B443ea3a48788079a5f98e2EaD55c9309"
crpPool: "0x0b54923f21e2b873e38d3eb4674E7531A732Da2A" # develop
bPool: "0x00dcf2a91100ebb472d3d1d41a3c8164ca168476"
wrapper: "0x2AcaECd8B6BD2223dd2BDC01566A7aFdC5681323"

RightsManager: "0xE5B4Ca4D23130311d36772c7a1a2AD560524A614"
SmartPoolManager: "0x6412589739bF80F0892DaaCe32585bAd59760042"
BalancerSafeMath: "0xb05Bb3677d26554127C0084a31b2b009fE645c73"
```

### Constraints

```
minFee = BONE / 10**6 => 1e12 => 0.0001%
maxFee = BONE / 10  => 1e17 => 10%

MIN_POOL_SUPPLY = 1e18 * 100
MAX_POOL_SUPPLY = 1e18 * 10**9
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
  "poolTokenSymbol": "BAL-SPLPV1.0-AMPL-USDC",
  "poolTokenName": "Balancer smart pool liquidity token (AMPL-USDC)",
  "constituentTokens": [
    "0x027dbcA046ca156De9622cD1e2D907d375e53aa7",
    "0x21F3179cADAE46509f615428F639e38123A508Ac"
  ],
  "tokenBalances": ["1000000000000","1000000000"],
  "tokenWeights": ["7071067811870000000", "7071067811870000000"],
  "swapFee": "100000000000000"
}
```

### Deployment

```
const rightsManager = await RightsManager.new();
const smartPoolManager = await SmartPoolManager.new();
const balSafeMath = await BalancerSafeMath.new();

# const rightsManager = await RightsManager.at("0xE5B4Ca4D23130311d36772c7a1a2AD560524A614")
# const smartPoolManager = await SmartPoolManager.at("0x6412589739bF80F0892DaaCe32585bAd59760042")
# const balSafeMath = await BalancerSafeMath.at("0xb05Bb3677d26554127C0084a31b2b009fE645c73")

await AmplElasticCRP.detectNetwork();
await AmplElasticCRP.link('RightsManager', rightsManager.address);
await AmplElasticCRP.link('SmartPoolManager', smartPoolManager.address);
await AmplElasticCRP.link('BalancerSafeMath', balSafeMath.address);

owner = "0x3b2b9EfdaE5291F3Bb9C7e6508C7e67534511585"
bFactory = "0x9C84391B443ea3a48788079a5f98e2EaD55c9309"
crpPool = await AmplElasticCRP.new(bFactory, params, permissions);
# crpPool = await AmplElasticCRP.at("0x0b54923f21e2b873e38d3eb4674E7531A732Da2A");
await crpPool.setController(owner);
await crpPool.getController.call()

initialSupply = '1000000000000000000000' // 100e18
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
  '0x0b54923f21e2b873e38d3eb4674E7531A732Da2A',
  '0x00dcf2a91100ebb472d3d1d41a3c8164ca168476',
  '0x027dbcA046ca156De9622cD1e2D907d375e53aa7'
]);

0x0bbc68730000000000000000000000000b54923f21e2b873e38d3eb4674e7531a732da2a00000000000000000000000000dcf2a91100ebb472d3d1d41a3c8164ca168476000000000000000000000000027dbca046ca156de9622cd1e2d907d375e53aa7
```

### Tests


```
# test on rinkeby-staging

rate: 1.2
supplyBefore: 15,134,295
weightsBefore: ['7073763360649399165', '7068373290264235528']
rebase()
supplyAfter: 17,904,094
weightsAfter: ['7693883665742345261', '6498668575233744956']

rate: 0.8
supplyAfter: 14,120,539
weightsAfter: ['6832742811317646166', '7317705551165307658']
price: 1000100011654966953986

rate: 1.5
weightsAfter: ['8308931307390981214', '6017621057426225860']
price: 1000100010891697086989

rate: 10000
weightsAfter: ['8308931307390981214', '6017621057426225860']
price: 97198887088586898359261

# success resync example
https://rinkeby.etherscan.io/tx/0xce87e047e90a658a97cae6212da65898364a7d6849a998019f36a7105e6850c0#eventlog

# fail and gulp example
https://rinkeby.etherscan.io/tx/0x7a05843a9f11ae45fe488b841ab4288fba6aa9df9d9563c25eb7f46d68284c08#eventlog
```
