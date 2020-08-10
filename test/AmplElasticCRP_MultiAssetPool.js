const { setupPairElasticCrp, weight, toFixedPt,
  performRebaseResyncAndCheck } = require('./helper');

function $AMPL (x) {
  return toFixedPt(x, 9);
}

function $USD (x) {
  return toFixedPt(x, 6);
}

function $BTC (x) {
  return toFixedPt(x, 8);
}

function $ETH (x) {
  return toFixedPt(x, 18);
}

let contracts;
describe('CRP pool ampl + 3 other assets', function () {
  beforeEach(async function () {
    const swapFee = 10 ** 15;
    const minimumWeightChangeBlockPeriod = 10;
    const addTokenTimeLockInBlocks = 10;

    const tokens = [
      { name: 'Stable coin', symbol: 'USD', decimals: 6 },
      { name: 'Bitcoin', symbol: 'BTC', decimals: 8 },
      { name: 'Ethereum', symbol: 'ETH', decimals: 18 }
    ];

    const startWeights = [weight(5), weight(5), weight(5), weight(5)];
    const startBalances = [ $AMPL(10000), $USD(10000), $BTC(1), $ETH(50) ];
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
  });

  describe('resyncWeights', function () {
    describe('when rebase does not alter supply', function () {
      it('should not adjust weights', async function () {
        await performRebaseResyncAndCheck(contracts, 0.0, [5, 5, 5, 5], [5, 5, 5, 5]);
      });
    });

    describe('when rebase increases supply', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +10.0, [5, 5, 5, 5], [5.5, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +5.2313, [5, 5, 5, 5], [5.261565, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +1.84329, [5, 5, 5, 5], [5.0921645, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.29, [5, 5, 5, 5], [5.0145, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.00003, [5, 5, 5, 5], [5.0000015, 5, 5, 5]);
      });
    });

    describe('when rebase decreases supply', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -10.0, [5, 5, 5, 5], [4.5, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -4.2153, [5, 5, 5, 5], [4.789235, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -1.43, [5, 5, 5, 5], [4.9285, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.31, [5, 5, 5, 5], [4.9845, 5, 5, 5]);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.00003, [5, 5, 5, 5], [4.9999985, 5, 5, 5]);
      });
    });

    describe('multiple rebase cycles', async function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +3.25, [5, 5, 5, 5], [5.1625, 5, 5, 5]);
        await performRebaseResyncAndCheck(contracts, -4.8, [5.1625, 5, 5, 5], [4.9147, 5, 5, 5]);
        await performRebaseResyncAndCheck(contracts, -7.32, [4.9147, 5, 5, 5], [4.55494396, 5, 5, 5]);
        await performRebaseResyncAndCheck(contracts, +17.5, [4.55494396, 5, 5, 5], ['5.352059152999985537', 5, 5, 5]);
      });
    });
  });
});
