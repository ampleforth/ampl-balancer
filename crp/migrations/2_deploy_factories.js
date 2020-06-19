const RightsManager = artifacts.require('RightsManager');
const CRPFactory = artifacts.require('CRPFactory');
const BFactory = artifacts.require('BFactory');

module.exports = async function (deployer, network, accounts) {
     if (network === 'development' || network === 'coverage') {
        await deployer.deploy(RightsManager);
        await deployer.deploy(BFactory);
    }
    deployer.link(RightsManager, CRPFactory);
    await deployer.deploy(CRPFactory);
};
