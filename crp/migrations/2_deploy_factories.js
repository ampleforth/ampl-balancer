const RightsManager = artifacts.require('RightsManager');
const SmartPoolManager = artifacts.require('SmartPoolManager');
const CRPFactory = artifacts.require('CRPFactory');
const BFactory = artifacts.require('BFactory');
const BalancerSafeMathMock = artifacts.require('BalancerSafeMathMock');

module.exports = async function (deployer, network, accounts) {
     if (network === 'development' || network === 'coverage') {
        await deployer.deploy(RightsManager);
        await deployer.deploy(SmartPoolManager);
        await deployer.deploy(BFactory);
        await deployer.deploy(BalancerSafeMathMock);
    }
    deployer.link(RightsManager, CRPFactory);
    deployer.link(SmartPoolManager, CRPFactory);
    await deployer.deploy(CRPFactory);
};
