const connectionConfig = require('frg-ethereum-runners/config/network_config.json');

const mainnetUrl = 'https://mainnet.infura.io/v3/b117b6719619448892c158d64291aa24';
const rinkebyUrl = 'https://rinkeby.infura.io/v3/b117b6719619448892c158d64291aa24';
const kovanUrl = 'https://kovan.infura.io/v3/b117b6719619448892c158d64291aa24';

function keystoreProvider (providerURL) {
  const fs = require('fs');
  const EthereumjsWallet = require('ethereumjs-wallet');
  const HDWalletProvider = require('truffle-hdwallet-provider');

  const KEYFILE = process.env.KEYFILE;
  const PASSPHRASE = (process.env.PASSPHRASE || '');
  if (!KEYFILE) {
    throw new Error('Expected environment variable KEYFILE with path to ethereum wallet keyfile');
  }

  const KEYSTORE = JSON.parse(fs.readFileSync(KEYFILE));
  const wallet = EthereumjsWallet.fromV3(KEYSTORE, PASSPHRASE);
  return new HDWalletProvider(wallet._privKey.toString('hex'), providerURL);
}

module.exports = {
  networks: {
    ganacheUnitTest: connectionConfig.ganacheUnitTest,
    gethUnitTest: connectionConfig.gethUnitTest,
    testrpcCoverage: connectionConfig.testrpcCoverage,
    rinkeby: {
      ref: 'rinkeby-staging',
      network_id: 4,
      provider: () => keystoreProvider(rinkebyUrl),
      gasPrice: 300000000000
      // gas: 10000000,
    },
    kovan: {
      ref: 'kovan-staging',
      network_id: 42,
      provider: () => keystoreProvider(kovanUrl),
      gasPrice: 2000000000
      // gas: 10000000,
    },
    mainnet: {
      ref: 'mainnet-prod',
      network_id: 1,
      provider: () => keystoreProvider(mainnetUrl),
      gasPrice: 35000000000
    }
  }
};
