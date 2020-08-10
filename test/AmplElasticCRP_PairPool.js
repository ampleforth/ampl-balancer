const { setupPairElasticCrp, weight, toFixedPt,
  performActionAndCheck, performRebaseResyncAndCheck } = require('./helper');

function $AMPL (x) {
  return toFixedPt(x, 9);
}

function $USD (x) {
  return toFixedPt(x, 6);
}

let contracts, ampl, stableCoin, bPool, crpPool;
describe('CRP pool ampl + other asset', function () {
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

  describe('resyncWeights', function () {
    describe('when rebase does not alter supply', function () {
      it('should not adjust weights', async function () {
        await performRebaseResyncAndCheck(contracts, 0.0, [10, 10], [10, 10]);
      });
    });

    describe('when rebase increases supply', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +10.0, [10, 10], [11, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +5.2313, [10, 10], [10.52313, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +1.84329, [10, 10], [10.184329, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.29, [10, 10], [10.029, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.00003, [10, 10], [10.000003, 10]);
      });
    });

    describe('when rebase decreases supply', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -10.0, [10, 10], [9, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -4.2153, [10, 10], [9.57847, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -1.43, [10, 10], [9.857, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.31, [10, 10], [9.969, 10]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.00003, [10, 10], [9.999997, 10]);
      });
    });

    describe('multiple rebase cycles', async function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +3.25, [10, 10], [10.325, 10]);
        await performRebaseResyncAndCheck(contracts, -4.8, [10.325, 10], [9.8294, 10]);
        await performRebaseResyncAndCheck(contracts, -7.32, [9.8294, 10], [9.10988792, 10]);

        // (weight_before=9109887920000000000 * supply_after=10704118306000) / supply_before=9109887920000
        // NOTE: The expected output is 10.704118306
        // await performRebaseResyncAndCheck(contracts, +17.5, [9.10988792, 10], [10.704118306, 10]);
        // However, the Bmath performs some additional rounding
        // https://github.com/balancer-labs/configurable-rights-pool/blob/master/libraries/BalancerSafeMath.sol
        await performRebaseResyncAndCheck(contracts, +17.5, [9.10988792, 10], ['10.704118305999971073', 10]);
      });
    });

    describe('when a malicious user transfers tokens into the pool', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performActionAndCheck(contracts, [10, 10], [15, 10], async () => {
          await ampl.transfer(bPool.address, $AMPL(5000));
          await crpPool.resyncWeight(ampl.address);
        });
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performActionAndCheck(contracts, [10, 10], [13.287124, 10], async () => {
          await ampl.transfer(bPool.address, $AMPL(3287.124));
          await crpPool.resyncWeight(ampl.address);
        });
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performActionAndCheck(contracts, [10, 10], [10, 15], async () => {
          await stableCoin.transfer(bPool.address, $USD(5000));
          await crpPool.resyncWeight(stableCoin.address);
        });
      });
    });
  });
});
