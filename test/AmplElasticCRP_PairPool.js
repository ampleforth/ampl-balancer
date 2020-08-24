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
      /*
        w1=10, w2=10, rebase increases by 10%
        wt = 110/100 * w1
        w1`=sqrt(10, wt)=10.48, w2`= w1`/w2*wt = 9.53
      */
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +10.0,
          [10, 10],
          ['10.488088481701515469', '9.534625892455923154']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +5.2313,
          [10, 10],
          ['10.258230841621765727', '9.748269613339154536']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +1.84329,
          [10, 10],
          ['10.091743655087558752', '9.909090382967359707']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.29,
          [10, 10],
          ['10.014489502715552799', '9.985531461477268720']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +0.00003,
          [10, 10],
          ['10.000001499999887500', '9.999998500000337500']);
      });
    });

    describe('when rebase decreases supply', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -10.0,
          [10, 10],
          ['9.486832980505137995', '10.540925533894597772']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -4.2153,
          [10, 10],
          ['9.786965821949109064', '10.217671321149524991']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -1.43,
          [10, 10],
          ['9.928242543370906186', '10.072276091479056697']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.31,
          [10, 10],
          ['9.984487968844471495', '10.015536130850106826']);
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, -0.00003,
          [10, 10],
          ['9.999998499999887499', '10.000001500000337499']);
      });
    });

    describe('multiple rebase cycles', async function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performRebaseResyncAndCheck(contracts, +3.25,
          [10, 10],
          ['10.161200716450787638', '9.841356626102457761']);

        await performRebaseResyncAndCheck(contracts, -4.8,
          ['10.161200716450787638', '9.841356626102457761'],
          ['9.914333058758901402', '10.086407164993731387']);

        await performRebaseResyncAndCheck(contracts, -7.32,
          ['9.914333058758901402', '10.086407164993731387'],
          ['9.544573285380509426', '10.477157753418972537']);

        await performRebaseResyncAndCheck(contracts, +17.5,
          ['9.544573285380509426', '10.477157753418972537'],
          ['10.346070899621705705', '9.665504998970807880']);
      });
    });

    describe('when a malicious user transfers tokens into the pool', function () {
      it('should adjust weights while keeping price unchanged', async function () {
        await performActionAndCheck(contracts,
          [10, 10], ['12.247448713915890490', '8.164965809277260327'], async () => {
            await ampl.transfer(bPool.address, $AMPL(5000));
            await crpPool.resyncWeight(ampl.address);
          });
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performActionAndCheck(contracts,
          [10, 10], ['11.526978788910821969', '8.675300079167487237'], async () => {
            await ampl.transfer(bPool.address, $AMPL(3287.124));
            await crpPool.resyncWeight(ampl.address);
          });
      });

      it('should adjust weights while keeping price unchanged', async function () {
        await performActionAndCheck(contracts,
          [10, 10], ['8.164965809277260327', '12.247448713915890490'], async () => {
            await stableCoin.transfer(bPool.address, $USD(5000));
            await crpPool.resyncWeight(stableCoin.address);
          });
      });
    });
  });
});
