const { expectRevert, time } = require('@openzeppelin/test-helpers');
const { setupPairElasticCrp, weight, toFixedPt } = require('./helper');

function $AMPL (x) {
  return toFixedPt(x, 9);
}

function $USD (x) {
  return toFixedPt(x, 6);
}

describe('AmplElasticCRP', function () {
  describe('resyncWeights', function () {
    describe('when pool does NOT have sufficient permissions', function () {
      it('should fail to construct', async function () {
        const swapFee = 10 ** 15;
        const minimumWeightChangeBlockPeriod = 10;
        const addTokenTimeLockInBlocks = 10;
        const tokens = [{ name: 'Stable coin', symbol: 'USD', decimals: 6 }];
        const startWeights = [weight(10), weight(10)];
        const startBalances = [ $AMPL(10000), $USD(10000) ];
        const permissions = {
          canPauseSwapping: false,
          canChangeSwapFee: false,
          canChangeWeights: false,
          canAddRemoveTokens: false,
          canWhitelistLPs: false
        };
        const initialSupply = toFixedPt(100.0, 18);

        await expectRevert(
          setupPairElasticCrp(
            tokens, startWeights, startBalances, permissions,
            swapFee, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks, initialSupply
          ),
          'ERR_NOT_CONFIGURABLE_WEIGHTS'
        );
      });
    });

    describe('when token address is NOT part of the pool', function () {
      it('should fail', async function () {
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

        const contracts = await setupPairElasticCrp(
          tokens, startWeights, startBalances, permissions,
          swapFee, minimumWeightChangeBlockPeriod,
          addTokenTimeLockInBlocks, initialSupply
        );

        await expectRevert(
          contracts.crpPool.resyncWeight(contracts.owner),
          'ERR_NOT_BOUND'
        );
      });
    });
  });
});
