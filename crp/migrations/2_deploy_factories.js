const CRPFactory = artifacts.require('CRPFactory');
const BFactory = artifacts.require('BFactory');

module.exports = async function (deployer, network, accounts) {
     if (network === 'development' || network === 'coverage') {
        deployer.deploy(BFactory);
    }
    await deployer.deploy(CRPFactory);
};
