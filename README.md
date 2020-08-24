## Ampl Elastic Configuration Rights Pool

[![Build Status](https://travis-ci.com/ampleforth/ampl-balancer.svg?token=xxNsLhLrTiyG3pc78i5v&branch=master)](https://travis-ci.com/ampleforth/ampl-balancer)

`AmplElasticCRP.sol` - Extension of Balancer labs' configurable rights pool (smart-pool).

When the Ampleforth protocol [adjusts supply](https://www.ampleforth.org/redbook/ampleforth_protocol/) it expects market actors to propagate this information back into price. However, un-informed AMMs like Uniswap and Balancer do this automatically as they price assets by the relative pool balances. This lets arbitrageurs extract value from liqudity providers in these platforms.

We aim to create a Balancer smart pool which mitigates this problem by adjusting pool weights proportional to rebase.
This ensures that the price of Amples in the smart-pool is unaffected by rebase induced supply adjustments.

The `resyncWeight` method is invoked atomically, just after rebase from Ampleforth's [Orchestrator](https://github.com/ampleforth/uFragments/blob/master/contracts/Orchestrator.sol).


## Getting started

```
# install dependencies
yarn install

# compile contracts
yarn compile

# run tests
yarn test
```
