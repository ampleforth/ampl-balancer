const { BigNumber } = require('bignumber.js');
const { BN } = require('@openzeppelin/test-helpers');
const { web3, contract } = require('@openzeppelin/test-environment');
const { expect } = require('chai');
// const mlog = require('mocha-logger');

const AmpleforthErc20 = contract.fromArtifact('uFragments/UFragments');
const RightsManager = contract.fromArtifact('configurable-rights-pool/RightsManager');
const SmartPoolManager = contract.fromArtifact('configurable-rights-pool/SmartPoolManager');
const BFactory = contract.fromArtifact('configurable-rights-pool/BFactory');
const BalancerSafeMath = contract.fromArtifact('configurable-rights-pool/BalancerSafeMath');
const BPool = contract.fromArtifact('configurable-rights-pool/BPool');
const TToken = contract.fromArtifact('configurable-rights-pool/TToken');
const AmplElasticCRP = contract.fromArtifact('AmplElasticCRP');

function toFixedPt (x, decimals) {
  return new BigNumber(10 ** decimals)
    .multipliedBy(x)
    .dividedToIntegerBy(1)
    .toString();
}

function weight (p) {
  return toFixedPt(p, 18);
}

async function invokeRebase (ampl, perc) {
  const ordinate = new BigNumber(10 ** 18);
  const p_ = ordinate.multipliedBy(perc).dividedBy(100);
  const s = new BigNumber((await ampl.totalSupply.call()).toString());
  const s_ = s.multipliedBy(p_).dividedToIntegerBy(ordinate);
  await ampl.rebase(1, s_.toString());
}

async function setupPairElasticCrp (
  tokens, startWeights, startBalances, permissions,
  swapFee, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks,
  initialSupply) {
  const accounts = await web3.eth.getAccounts();
  const owner = web3.utils.toChecksumAddress(accounts[0]);

  const ampl = await AmpleforthErc20.new();
  await ampl.initialize(owner);
  await ampl.setMonetaryPolicy(owner);

  const tokenNames = ['ampl'];
  const tokenAddresses = [ampl.address];
  const otherTokens = [ ];
  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    const mintAmt = new BN(startBalances[t + 1]).mul(new BN(10));
    const tk = await TToken.new(token.name, token.symbol, token.decimals);
    await tk.mint(owner, mintAmt);
    otherTokens.push(tk);
    tokenAddresses.push(tk.address);
    tokenNames.push(token.symbol);
  }

  const rightsManager = await RightsManager.new();
  const smartPoolManager = await SmartPoolManager.new();
  const balSafeMath = await BalancerSafeMath.new();
  await AmplElasticCRP.detectNetwork();
  await AmplElasticCRP.link('RightsManager', rightsManager.address);
  await AmplElasticCRP.link('SmartPoolManager', smartPoolManager.address);
  await AmplElasticCRP.link('BalancerSafeMath', balSafeMath.address);

  const bFactory = await BFactory.new();
  const crpPool = await AmplElasticCRP.new(
    bFactory.address,
    'balElasticTestPool',
    tokenAddresses,
    startBalances,
    startWeights,
    swapFee,
    permissions,
  );

  await crpPool.setController(owner);
  await ampl.approve(crpPool.address, startBalances[0]);
  for (let t = 0; t < tokens.length; t++) {
    await otherTokens[t].approve(crpPool.address, startBalances[t + 1]);
  }
  await crpPool.createPool(initialSupply, minimumWeightChangeBlockPeriod, addTokenTimeLockInBlocks);
  const bPool = await BPool.at(await crpPool.bPool.call());

  return { owner, ampl, otherTokens, tokenNames, tokenAddresses, bPool, crpPool };
}

async function checkPoolWeights (contracts, weights) {
  const {crpPool, tokenAddresses} = contracts;

  for (let t = 0; t < tokenAddresses.length; t++) {
    const wt = await crpPool.getDenormalizedWeight.call(tokenAddresses[t]);
    const wc = weight(weights[t]);
    // mlog.log(`expected ${wc.toString()} : got ${wt.toString()}`);
    expect(wt).to.be.bignumber.equal(wc);
  }
}

async function getAllPoolRelativePrices (contracts) {
  const {bPool, tokenAddresses} = contracts;
  const prices = [];
  for (let i = 0; i < tokenAddresses.length; i++) {
    prices[i] = new Array(tokenAddresses.length);
    const ti = tokenAddresses[i];
    for (let j = 0; j < tokenAddresses.length; j++) {
      const tj = tokenAddresses[j];
      const _p = await bPool.getSpotPrice.call(ti, tj);
      prices[i][j] = _p;
    }
  }
  return prices;
}

async function performActionAndCheck (contracts, weightsBefore, weightsAfter, action) {
  const {tokenAddresses} = contracts;

  await checkPoolWeights(contracts, weightsBefore);
  const _p = await getAllPoolRelativePrices(contracts);
  await action();
  const p = await getAllPoolRelativePrices(contracts);
  await checkPoolWeights(contracts, weightsAfter);

  for (let i = 0; i < tokenAddresses.length; i++) {
    for (let j = 0; j < tokenAddresses.length; j++) {
      // mlog.log(`price:${tokenNames[i]}:${tokenNames[j]}=${_p[i][j].toString()}`);
      expect(_p[i][j]).to.be.bignumber.equal(p[i][j]);
    }
  }
}

async function performRebaseResyncAndCheck (contracts, rebasePerc, weightsBefore, weightsAfter) {
  return performActionAndCheck(contracts, weightsBefore, weightsAfter, async () => {
    const {crpPool, ampl} = contracts;

    // const _b = await ampl.balanceOf.call(contracts.bPool.address);
    // mlog.log(`ampl_balance_before: ${_b.toString()}`);

    await invokeRebase(ampl, rebasePerc);

    // const b = await ampl.balanceOf.call(contracts.bPool.address);
    // mlog.log(`ampl_balance_after: ${b.toString()}`);

    await crpPool.resyncWeight(ampl.address);
  });
}

module.exports = { invokeRebase, toFixedPt, weight, setupPairElasticCrp,
  checkPoolWeights, performActionAndCheck, performRebaseResyncAndCheck };
