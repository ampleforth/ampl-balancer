const BFactory = artifacts.require('BFactory');
const LiquidityBootstrappingPool = artifacts.require('LiquidityBootstrappingPool');
const LBPFactory = artifacts.require('LBPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');

contract('LBPFactory', async (accounts) => {
    const admin = accounts[0];
    const nonAdmin = accounts[1];
    const { toWei } = web3.utils;
    const { fromWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);

    describe('Factory', () => {
        let factory;
        let controller;
        let CONTROLLER;
        let WETH;
        let DAI;
        let weth;
        let dai;

        before(async () => {
            bfactory = await BFactory.deployed();
            factory = await LBPFactory.deployed();
            xyz = await TToken.new('XYZ', 'XYZ', 18);
            weth = await TToken.new('Wrapped Ether', 'WETH', 18);
            dai = await TToken.new('Dai Stablecoin', 'DAI', 18);

            WETH = weth.address;
            DAI = dai.address;
            XYZ = xyz.address;

            // admin balances
            await weth.mint(admin, toWei('100'));
            await dai.mint(admin, toWei('15000'));
            await xyz.mint(admin, toWei('100000'));

            controller = await factory.newLbp(
                bfactory.address,
                [XYZ, WETH, DAI],
                [toWei('80000'), toWei('40'), toWei('10000')],
                [toWei('12'), toWei('1.5'), toWei('1.5')],
                [toWei('5'), toWei('5'), toWei('5')],
                [10, 1000, toWei('0.03')]
            );

            CONTROLLER = controller.address;

            await weth.approve(CONTROLLER, MAX);
            await dai.approve(CONTROLLER, MAX);
            await xyz.approve(CONTROLLER, MAX);

            await controller.createPool(toWei('100'));

        });

    });

});
