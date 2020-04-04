const BFactory = artifacts.require('BFactory');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');

contract('CRPFactory', async (accounts) => {
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
            factory = await CRPFactory.deployed();
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

            // Copied this model of code from https://github.com/balancer-labs/balancer-core/blob/5d70da92b1bebaa515254d00a9e064ecac9bd18e/test/math_with_fees.js#L93
            // const input_parameters = {
            //     bfactory.address,
            //     [XYZ, WETH, DAI],
            //     [toWei('80000'), toWei('40'), toWei('10000')],
            //     [toWei('12'), toWei('1.5'), toWei('1.5')],
            //     10**15,
            //     10,
            //     10,
            //     [true, true, true, true]
            // };

            CONTROLLER = await factory.newCrp.call(
                bfactory.address,
                [XYZ, WETH, DAI],
                [toWei('80000'), toWei('40'), toWei('10000')],
                [toWei('12'), toWei('1.5'), toWei('1.5')],
                10**15,
                10,
                10,
                [true, true, true, true]
            );  

            await factory.newCrp(
                bfactory.address,
                [XYZ, WETH, DAI],
                [toWei('80000'), toWei('40'), toWei('10000')],
                [toWei('12'), toWei('1.5'), toWei('1.5')],
                10**15,
                10,
                10,
                [true, true, true, true]
            );  

            controller = await ConfigurableRightsPool.at(CONTROLLER);
            
            let CONTROLLER_ADDRESS = controller.address;

            console.log(CONTROLLER_ADDRESS);

            await weth.approve(CONTROLLER_ADDRESS, MAX);
            await dai.approve(CONTROLLER_ADDRESS, MAX);
            await xyz.approve(CONTROLLER_ADDRESS, MAX);

            await controller.createPool();

        });

        describe('Pausable swaps only', () => {
            it('Pauses if unpaused', async () => {
                //await controller.
                assert.equal(1, 1);
                // await truffleAssert.reverts(
                //       pcContract.finalize(),
                //       'ERR_IS_FINALIZED',
                //   );                
            });

        });

    });

});