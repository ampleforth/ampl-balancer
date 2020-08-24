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

function aproxCheck (c1, c2, accuracy = new BN(1e8)) {
  // accuracy=1e8 = 0.000005%
  const uBound = accuracy.add(new BN(5));
  const lBound = accuracy.sub(new BN(5));
  const b = c1.mul(accuracy).div(c2).toString();
  // mlog.log(`c1:${c1.toString()}::c2:${c2.toString()}::${b.toString()}`);
  expect(b).to.be.bignumber.gte(lBound);
  expect(b).to.be.bignumber.lte(uBound);
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
  const poolParams = {
    tokenSymbol: tokenNames.join('-'),
    tokenName: tokenNames.join('-'),
    tokens: tokenAddresses,
    startBalances: startBalances,
    startWeights: startWeights,
    swapFee: swapFee
  };

  const bFactory = await BFactory.new();
  const crpPool = await AmplElasticCRP.new(
    bFactory.address,
    poolParams,
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
  const _weights = await getPoolWeights(contracts);
  for (let i = 0; i < weights.length; i++) {
    const w2 = weight(weights[i]);
    // mlog.log(`w1:${_weights[i].toString()}::w2:${w2.toString()}`);
    expect(_weights[i]).to.be.bignumber.equal(w2);
  }
}

async function getPoolWeights (contracts) {
  const {crpPool, tokenAddresses} = contracts;
  const weights = [ ];
  for (let t = 0; t < tokenAddresses.length; t++) {
    const wt = await crpPool.getDenormalizedWeight.call(tokenAddresses[t]);
    weights.push(wt);
  }
  return weights;
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

  const _weights = await getPoolWeights(contracts);
  const _p = await getAllPoolRelativePrices(contracts);
  await action();
  const p = await getAllPoolRelativePrices(contracts);
  const weights = await getPoolWeights(contracts);

  for (let i = 0; i < _weights.length; i++) {
    // check if token weight before and after match checked values
    expect(_weights[i]).to.be.bignumber.equal(weight(weightsBefore[i]));
    expect(weights[i]).to.be.bignumber.equal(weight(weightsAfter[i]));
  }

  for (let i = 0; i < tokenAddresses.length; i++) {
    for (let j = 0; j < tokenAddresses.length; j++) {
      aproxCheck(_p[i][j], p[i][j]);
    }
  }
}

async function performRebaseResyncAndCheck (contracts, rebasePerc, weightsBefore, weightsAfter) {
  return performActionAndCheck(contracts, weightsBefore, weightsAfter, async () => {
    const {crpPool, ampl} = contracts;
    const _weights = await getPoolWeights(contracts);
    await invokeRebase(ampl, rebasePerc);
    await crpPool.resyncWeight(ampl.address);
    const weights = await getPoolWeights(contracts);
    const round = new BN(1e9);
    const rebaseFactor = new BN((100 + rebasePerc) * 1e7);
    for (let i = 1; i < weights.length; i++) {
      aproxCheck(
        _weights[0].mul(rebaseFactor).div(_weights[i]),
        weights[0].mul(round).div(weights[i])
      );
    }
  });
}

module.exports = { invokeRebase, toFixedPt, weight, setupPairElasticCrp,
  aproxCheck, checkPoolWeights, performActionAndCheck, performRebaseResyncAndCheck };
