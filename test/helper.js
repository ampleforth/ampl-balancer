const { BN } = require('@openzeppelin/test-helpers');

const PERC_DECIMALS = 9;
const AMPL_DECIMALS = 9;

function $AMPL (x) {
  return new BN(x * (10 ** AMPL_DECIMALS));
}

async function invokeRebase (ampl, perc) {
  const s = await ampl.totalSupply.call();
  const ordinate = 10 ** PERC_DECIMALS;
  const p_ = new BN(parseInt(perc * ordinate)).div(new BN(100));
  const s_ = s.mul(p_).div(new BN(ordinate));
  await ampl.rebase(1, s_);
}

module.exports = { invokeRebase, $AMPL };
