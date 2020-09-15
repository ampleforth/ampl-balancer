const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { setupPairElasticCrp, weight, toFixedPt } = require('./helper');

function $AMPL (x) {
  return toFixedPt(x, 9);
}

function $USD (x) {
  return toFixedPt(x, 6);
}

let contracts, ampl, crpPool;
describe('admin action', function () {
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
    const initialSupply = toFixedPt(100.0, 18);

    contracts = await setupPairElasticCrp(
      tokens, startWeights, startBalances, permissions,
      swapFee, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks, initialSupply
    );

    ampl = contracts.ampl;
    crpPool = contracts.crpPool;
  });

  describe('updateWeight', function () {
    it('should revert', async function () {
      await expectRevert(
        crpPool.updateWeight(ampl.address, weight(12)),
        'ERR_UNSUPPORTED_OPERATION'
      );
    });
  });

  describe('updateWeightsGradually', function () {
    it('should revert', async function () {
      const currentBlock = (await time.latestBlock()).toNumber();
      const waitForBlocks = 10;
      await expectRevert(
        crpPool.updateWeightsGradually([weight(12), weight(12)],
          currentBlock, currentBlock + waitForBlocks),
        'ERR_UNSUPPORTED_OPERATION'
      );
    });
  });

  describe('pokeWeights', function () {
    it('should revert', async function () {
      await expectRevert(
        crpPool.pokeWeights(),
        'ERR_UNSUPPORTED_OPERATION'
      );
    });
  });
});
