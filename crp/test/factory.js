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
            abc = await TToken.new('ABC', 'ABC', 18);

            WETH = weth.address;
            DAI = dai.address;
            XYZ = xyz.address;
            ABC = abc.address;

            // admin balances
            await weth.mint(admin, toWei('100'));
            await dai.mint(admin, toWei('15000'));
            await xyz.mint(admin, toWei('100000'));
            await abc.mint(admin, toWei('100000'));

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
                [true, false, false, false]
            );  

            await factory.newCrp(
                bfactory.address,
                [XYZ, WETH, DAI],
                [toWei('80000'), toWei('40'), toWei('10000')],
                [toWei('12'), toWei('1.5'), toWei('1.5')],
                10**15,
                10,
                10,
                [true, false, false, false]
            );  

            controller = await ConfigurableRightsPool.at(CONTROLLER);
            
            let CONTROLLER_ADDRESS = controller.address;

            //console.log(CONTROLLER_ADDRESS);

            await weth.approve(CONTROLLER_ADDRESS, MAX);
            await dai.approve(CONTROLLER_ADDRESS, MAX);
            await xyz.approve(CONTROLLER_ADDRESS, MAX);

            await controller.createPool();

        });

        describe('Pausable swaps only', () => {
            it('JoinPool should revert if smart pool is not finalized yet', async () => {
                truffleAssert.reverts(
                    controller.joinPool(toWei('1000')),
                    "ERR_SMART_POOL_NOT_FINALIZED");            
            });

            it('JoinPool should not revert if smart pool is finalized', async () => {
                await controller.finalizeSmartPool();
                await controller.joinPool(toWei('1'));

                let balance = await controller.balanceOf.call(admin);
                //console.log(balance.toString());

                assert.equal(balance, toWei('101'));
            });

            it('JoinPool should revert if user does not have allowance to join pool', async () => {
                truffleAssert.reverts(
                      controller.joinPool(toWei('1'), { from: nonAdmin }),
                      'ERR_BTOKEN_BAD_CALLER.',
                );                   
            });

            // TODO: make this test work
            it('Controller should be able to pause trades: setPublicSwap(false)')

            // , async () => {
            //     // Double Check that pool is not paused 
            //     // let bPoolAddress = await controller._bPool.call();
            //     // console.log(bPoolAddress);

            //     // bPool = await ConfigurableRightsPool.at(bPoolAddress);

            //     // assert.equal(controller._bPool.call.isPublicSwap(), true);
                
            //     // await controller.setPublicSwap(false);
                
            //     // assert.equal(controller._bPool.call.isPublicSwap(), false);   

            //     assert.equal(controller.isPublicSwap(), true);
                
            //     await controller.setPublicSwap(false);
                
            //     assert.equal(controller.isPublicSwap(), false);             
            // });

            // TODO: make this test work
            it('Controller should not be able to change swapFee', async () => {
                truffleAssert.reverts(
                      controller.setSwapFee(toWei('1')),
                      'ERR_NOT_CONFIGURABLE_SWAP_FEE.',
                );  
            });

            // TODO: make this test work
            it('Controller should not be able to change weights', async () => {
                truffleAssert.reverts(
                      controller.updateWeight(WETH, toWei('1')),
                      'ERR_NOT_CONFIGURABLE_WEIGHTS.',
                );  
                truffleAssert.reverts(
                      controller.updateWeightsGradually([toWei('1'), toWei('15'), toWei('15')], 0, 10),
                      'ERR_NOT_CONFIGURABLE_WEIGHTS.',
                );  
            });

            // TODO: make this test work
            it('Controller should not be able to add/remove tokens', async () => {
                truffleAssert.reverts(
                      controller.commitAddToken(ABC, toWei('1'), toWei('1')),
                      'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS.',
                );  

                truffleAssert.reverts(
                      controller.applyAddToken(),
                      'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS.',
                );  

                truffleAssert.reverts(
                      controller.removeToken(WETH),
                      'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS.',
                );  
            });
        });

    });

});