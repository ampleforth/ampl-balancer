const { contract, web3 } = require('@openzeppelin/test-environment');
const { expect } = require('chai');

const AmplElasticCRPWrapper = contract.fromArtifact('AmplElasticCRPWrapper');
const { setupPairElasticCrp, weight, toFixedPt, invokeRebase, checkPoolWeights } = require('./helper');

function $AMPL (x) {
  return toFixedPt(x, 9);
}

function $USD (x) {
  return toFixedPt(x, 6);
}

let contracts, ampl, stableCoin, bPool, crpPool, caller;
describe('AmplElasticCRPWrapper', function () {
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
    stableCoin = contracts.otherTokens[0];
    bPool = contracts.bPool;
    crpPool = contracts.crpPool;

    caller = await AmplElasticCRPWrapper.new();
  });

  describe('when weights deviate too much', function () {
    it('should safely handle revert and gulp', async function () {
      await checkPoolWeights(contracts, [10, 10]);
      await invokeRebase(ampl, +1500.0);
      await caller.safeResync(crpPool.address, bPool.address, ampl.address);

      await checkPoolWeights(contracts, [40, 2.5]);
      await invokeRebase(ampl, +41);
      await caller.safeResync(crpPool.address, bPool.address, ampl.address);

      await checkPoolWeights(contracts,
        ['47.497368348151668938', '2.105379802666297382']);

      const _p = await bPool.getSpotPrice.call(ampl.address, stableCoin.address);
      await invokeRebase(ampl, +10.0);

      const tx = await caller.safeResync(crpPool.address, bPool.address, ampl.address);

      const log = tx.logs[0];
      const reason = web3.utils.toAscii(log.args.reason);
      expect(log.event).to.eq('ErrorReason');
      expect(
        reason.includes('ERR_MAX_TOTAL_WEIGHT')
      ).to.be.true;

      const p = await bPool.getSpotPrice.call(ampl.address, stableCoin.address);
      expect(_p).to.be.bignumber.not.equal(p); // after gulp price is out of sync now
    });
  });
});
