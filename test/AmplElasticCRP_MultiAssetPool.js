const { setupPairElasticCrp, weight, toFixedPt, performRebaseResyncAndCheck } = require('./helper');

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

    const startWeights = [weight(10), weight(10), weight(5), weight(4)];
    const startBalances = [ $AMPL(10000), $USD(10000), $BTC(1), $ETH(50) ];
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
  });

  describe('resyncWeights', function () {
    describe('when rebase does not alter supply', function () {
      it('should not adjust weights', async function () {
        await performRebaseResyncAndCheck(contracts, 0.0,
          [10, 10, 5, 4], [10, 10, 5, 4]);
      });
    });

    describe('when rebase increases supply', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +10.0,
          [10, 10, 5, 4],
          ['10.488088481701515469', '9.534625892455923154', '4.767312946227961577', '3.813850356982369261']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +5.2313,
          [10, 10, 5, 4],
          ['10.258230841621765727', '9.748269613339154536', '4.874134806669577268', '3.899307845335661814']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +1.84329,
          [10, 10, 5, 4],
          ['10.091743655087558752', '9.909090382967359707', '4.954545191483679854', '3.963636153186943883']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.29,
          [10, 10, 5, 4],
          ['10.014489502715552799', '9.985531461477268720', '4.992765730738634360', '3.994212584590907488']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.00003,
          [10, 10, 5, 4],
          ['10.000001499999887500', '9.999998500000337500', '4.999999250000168750', '3.999999400000135000']);
      });
    });

    describe('when rebase decreases supply', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -10.0,
          [10, 10, 5, 4],
          ['9.486832980505137995', '10.540925533894597772', '5.270462766947298886', '4.216370213557839109']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -4.2153,
          [10, 10, 5, 4],
          ['9.786965821949109064', '10.217671321149524991', '5.108835660574762495', '4.087068528459809996']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -1.43,
          [10, 10, 5, 4],
          ['9.928242543370906186', '10.072276091479056697', '5.036138045739528348', '4.028910436591622679']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.31,
          [10, 10, 5, 4],
          ['9.984487968844471495', '10.015536130850106826', '5.007768065425053413', '4.006214452340042730']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.00003,
          [10, 10, 5, 4],
          ['9.999998499999887499', '10.000001500000337499', '5.000000750000168750', '4.000000600000135000']);
      });
    });

    describe('multiple rebase cycles', async function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +3.25,
          [10, 10, 5, 4],
          ['10.161200716450787638', '9.841356626102457761', '4.920678313051228880', '3.936542650440983104']);

        await performRebaseResyncAndCheck(contracts, -4.8,
          ['10.161200716450787638', '9.841356626102457761', '4.920678313051228880', '3.936542650440983104'],
          ['9.914333058758901402', '10.086407164993731387', '5.043203582496865693', '4.034562865997492554']);

        await performRebaseResyncAndCheck(contracts, -7.32,
          ['9.914333058758901402', '10.086407164993731387', '5.043203582496865693', '4.034562865997492554'],
          ['9.544573285380509426', '10.477157753418972537', '5.238578876709486268', '4.190863101367589014']);

        await performRebaseResyncAndCheck(contracts, +17.5,
          ['9.544573285380509426', '10.477157753418972537', '5.238578876709486268', '4.190863101367589014'],
          ['10.346070899621705705', '9.665504998970807880', '4.832752499485403940', '3.866201999588323151']);
      });
    });
  });
});
