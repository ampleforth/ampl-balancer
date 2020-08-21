const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { setupPairElasticCrp, weight, toFixedPt, invokeRebase, aproxCheck,
  checkPoolWeights } = require('./helper');

function $AMPL (x) {
  return toFixedPt(x, 9);
}

function $USD (x) {
  return toFixedPt(x, 6);
}

let contracts, ampl, stableCoin, bPool, crpPool;
describe('when weights go out of bounds', function () {
  beforeEach(async function () {
    const swapFee = 10 ** 15;
    const minimumWeightChangeBlockPeriod = 10;
    const addTokenTimeLockInBlocks = 10;

    const tokens = [{ name: 'Stable coin', symbol: 'USD', decimals: 6 }];
    const startWeights = [weight(10), weight(10)];
    const startBalances = [ $AMPL(10000), $USD(10000) ];
    const permissions = {
      canPauseSwapping: false,
      canChangeSwapFee: false,
      canChangeWeights: true,
      canAddRemoveTokens: false,
      canWhitelistLPs: false
    };
    const initialSupply = toFixedPt(1.0, 18);

    contracts = await setupPairElasticCrp(
      tokens, startWeights, startBalances, permissions,
      swapFee, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks, initialSupply
    );

    ampl = contracts.ampl;
    stableCoin = contracts.otherTokens[0];
    bPool = contracts.bPool;
    crpPool = contracts.crpPool;
  });

  describe('updateWeightsGradually', function () {
    describe('when weights deviate too much, admin action to adjust them back', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await checkPoolWeights(contracts, [10, 10]);
        await invokeRebase(ampl, +1500.0);
        await crpPool.resyncWeight(ampl.address);
        await checkPoolWeights(contracts, [40, 2.5]);
        await invokeRebase(ampl, +41);
        await crpPool.resyncWeight(ampl.address);
        await checkPoolWeights(contracts,
          ['47.497368348151668938', '2.105379802666297382']);

        const _p = await bPool.getSpotPrice.call(ampl.address, stableCoin.address);
        await invokeRebase(ampl, +10.0);
        await crpPool.resyncWeight(ampl.address);
        const p = await bPool.getSpotPrice.call(ampl.address, stableCoin.address);
        expect(_p).to.be.bignumber.not.equal(p); // price is out of sync now

        // Admin action to adjust weights proportionally down
        // NOTE: consider pausing swapping here
        const currentBlock = (await time.latestBlock()).toNumber();
        const waitForBlocks = 10;
        await crpPool.updateWeightsGradually([weight(26.1235525915), weight(1.05268990133)],
          currentBlock, currentBlock + waitForBlocks);
        for (let i = 0; i < waitForBlocks; i++) {
          await time.advanceBlock();
          await crpPool.pokeWeights();
        }
        await checkPoolWeights(contracts, [26.1235525915, 1.05268990133]);

        const p_ = await bPool.getSpotPrice.call(ampl.address, stableCoin.address);
        aproxCheck(_p, p_);
      });
    });
  });
});
