const { contract, web3 } = require('@openzeppelin/test-environment');
const { expect } = require('chai');
const { toWei } = web3.utils;
const { invokeRebase } = require('./helper');

const AmpleforthErc20 = contract.fromArtifact('UFragments');
const WeightedPoolMock = contract.fromArtifact('WeightedPoolMock');
const AmplBalancer = contract.fromArtifact('AmplBalancer');

// const WEIGHT_DECIMALS = 18;
function weightFixedPt (p) {
  return toWei(p.toString());
}

async function compareWeightsAfterRebase (rebasePerc, weightBefore, weightAfter) {
  const accounts = await web3.eth.getAccounts();
  const owner = web3.utils.toChecksumAddress(accounts[0]);

  const ampl = await AmpleforthErc20.new();
  await ampl.initialize(owner);
  await ampl.setMonetaryPolicy(owner);
  const balPool = await WeightedPoolMock.new();
  await balPool.updateWeight(ampl.address, weightFixedPt(1));

  const amplBalancer = await AmplBalancer.new(ampl.address, balPool.address);

  expect(await balPool.getDenormalizedWeight.call(ampl.address))
    .to.be.bignumber.equal(weightFixedPt(weightBefore));

  await invokeRebase(ampl, rebasePerc);
  await amplBalancer.rebalance();

  expect(await balPool.getDenormalizedWeight.call(ampl.address))
    .to.be.bignumber.equal(weightFixedPt(weightAfter));
}

describe('Weight change math', function () {
  describe('Rebase does not change supply', function () {
    it('should result NOT adjust weights', async function () {
      await compareWeightsAfterRebase(0, 1, 1);
    });
  });

  describe('Rebase increases supply by 0.05%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(+0.05, 1, 1.0005);
    });
  });

  describe('Rebase increases supply by 10%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(+10, 1, 1.1);
    });
  });

  describe('Rebase increases supply by 27.89%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(+27.89, 1, 1.2789);
    });
  });

  describe('Rebase increases supply by 99.99%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(+99.99, 1, 1.9999);
    });
  });

  describe('Rebase decreases supply by 0.05%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(-0.05, 1, 0.9995);
    });
  });

  describe('Rebase decreases supply by 10%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(-10, 1, 0.9);
    });
  });

  describe('Rebase decreases supply by 27.89%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(-27.89, 1, 0.7211);
    });
  });

  describe('Rebase decreases supply by 99.99%', function () {
    it('should result adjust weights accordingly', async function () {
      await compareWeightsAfterRebase(-99.99, 1, 0.0001);
    });
  });
});
