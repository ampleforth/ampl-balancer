const BFactory = artifacts.require('BFactory');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');
//const { time, expectRevert } = require("@openzeppelin/test-helpers");

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
        let startWeights = [toWei('12'), toWei('1.5'), toWei('1.5')];
        let startBalances = [toWei('80000'), toWei('40'), toWei('10000')];

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
            CONTROLLER = await factory.newCrp.call(
                bfactory.address,
                [XYZ, WETH, DAI],
                startBalances,
                startWeights,
                10**15, //swapFee
                10, //minimumWeightChangeBlockPeriod
                10, //addTokenTimeLockInBlocks
                [false, false, true, false] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
            );  

            await factory.newCrp(
                bfactory.address,
                [XYZ, WETH, DAI],
                startBalances,
                startWeights,
                10**15, //swapFee
                10, //minimumWeightChangeBlockPeriod
                10, //addTokenTimeLockInBlocks
                [false, false, true, false] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
            );  

            controller = await ConfigurableRightsPool.at(CONTROLLER);
            
            let CONTROLLER_ADDRESS = controller.address;

            //console.log(CONTROLLER_ADDRESS);

            await weth.approve(CONTROLLER_ADDRESS, MAX);
            await dai.approve(CONTROLLER_ADDRESS, MAX);
            await xyz.approve(CONTROLLER_ADDRESS, MAX);

            await controller.createPool();

        });

        describe('configurableWeights only', () => {
            it('Controller should not be able to pause trades', async () => {
                truffleAssert.reverts(
                      controller.setPublicSwap(false),
                      'ERR_NOT_PAUSABLE_SWAP',
                );  
            });
            
            it('Controller should not be able to change swapFee', async () => {
                truffleAssert.reverts(
                      controller.setSwapFee(toWei('1')),
                      'ERR_NOT_CONFIGURABLE_SWAP_FEE',
                );  
            });

            it('Controller should not be able to add/remove tokens', async () => {
                truffleAssert.reverts(
                      controller.commitAddToken(ABC, toWei('1'), toWei('1')),
                      'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
                );  

                truffleAssert.reverts(
                      controller.applyAddToken(),
                      'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
                );  

                truffleAssert.reverts(
                      controller.removeToken(WETH),
                      'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
                );  
            });

            it('Controller should be able to change weigths with updateWeight()', async () => {
                let balance = await controller.balanceOf.call(admin);
                //console.log(balance.toString());

                await controller.updateWeight(WETH, toWei('3')); // This should double WETH weight from 1.5 to 3.
                
                balance = await controller.balanceOf.call(admin);
                //console.log(balance.toString());

                adminWETHBalance = await weth.balanceOf.call(admin);
                //console.log(adminWETHBalance.toString());

                // BPT Balance should go from 100 to 110 since total weight went from 15 to 16.5
                assert.equal(balance.toString(), toWei('110'));
                // WETH Balance should go from 60 to 20 (since 40 WETH are deposited to pool to get if from 40 to 80 WETH)
                assert.equal(adminWETHBalance.toString(), toWei('20')); 
            });        

            it('Controller should not be able to change weigths'+
             'when they dont have enough tokens', async () => {
                // This should tripple WETH weight from 1.5 to 4.5, requiring 80 WETH, but admin only has 60.
                truffleAssert.reverts(
                      controller.updateWeight(WETH, toWei('4.5')),
                      'ERR_INSUFFICIENT_BAL',
                ); 
            });

            it('Controller should not be able to call updateWeightsGradually() with invalid range', async () => {
                let blockRange = 5;
                // get current block number
                let block = await web3.eth.getBlock("latest");
                truffleAssert.reverts(
                    controller.updateWeightsGradually([toWei('3'), toWei('6'), toWei('6')], block.number, block.number + blockRange),
                      'ERR_WEIGHT_CHANGE_PERIOD_BELOW_MIN',
                );
            });    

            it('Controller should not be able to call updateWeightsGradually() with invalid weights', async () => {
                blockRange = 10;
                block = await web3.eth.getBlock("latest");
                truffleAssert.reverts(
                    controller.updateWeightsGradually([toWei('51'), toWei('6'), toWei('6')], block.number, block.number + blockRange),
                      'ERR_WEIGHT_ABOVE_MAX',
                );
                truffleAssert.reverts(
                    controller.updateWeightsGradually([toWei('0.999'), toWei('6'), toWei('6')], block.number, block.number + blockRange),
                      'ERR_WEIGHT_BELOW_MIN',
                );
                truffleAssert.reverts(
                    controller.updateWeightsGradually([toWei('20'), toWei('20'), toWei('11')], block.number, block.number + blockRange),
                      'ERR_MAX_TOTAL_WEIGHT',
                );
            });    

            // async function waitForInterest(nBlocks = 100) {
            //     console.log(`Wait for ${nBlocks} blocks...`);
            //     while(--nBlocks) await time.advanceBlock();
            //     await cToken.accrueInterest({ from: admin });
            // }

            it('Controller should be able to call updateWeightsGradually() with valid range', async () => {
                let blockRange = 10;
                // get current block number
                let block = await web3.eth.getBlock("latest");
                console.log("Block of updateWeightsGradually() call: "+block.number)
                let startBlock = block.number+6; // This number 6 was trial and error as I don't know how blocks are mined exactly
                let endBlock = startBlock + blockRange;
                let endWeights = [toWei('3'), toWei('6'), toWei('6')];
                console.log("startBlock: "+startBlock)
                console.log("endBlock: "+endBlock)
                console.log("startWeights: "+startWeights)
                console.log("endWeights  : "+endWeights)
                await controller.updateWeightsGradually(endWeights, startBlock, endBlock);
            });    

            it('Should revert because too early to pokeWeights()', async () => {
                block = await web3.eth.getBlock("latest");
                console.log("Block: "+block.number);
                truffleAssert.reverts(
                     controller.pokeWeights(),
                      'ERR_CANT_POKE_YET',
                );
            });  

            it('Should be able to pokeWeights()', async () => {
                for (var i = 0; i < 13; i++) {
                    weightXYZ = await controller.getDenormalizedWeight(XYZ);
                    weightWETH = await controller.getDenormalizedWeight(WETH);
                    weightDAI = await controller.getDenormalizedWeight(DAI);
                    block = await web3.eth.getBlock("latest");
                    console.log("Block: "+block.number+" weights: "+weightXYZ.toString()+", "+weightWETH.toString()+
                        ", "+weightDAI.toString());
                    await controller.pokeWeights();
                }
            });  

            it('Controller should be able to call updateWeightsGradually() again', async () => {
                blockRange = 15;
                // get current block number
                block = await web3.eth.getBlock("latest");
                console.log("Block of updateWeightsGradually() call: "+block.number)
                startBlock = block.number+3; // This number 6 was trial and error as I don't know how blocks are mined exactly
                endBlock = startBlock + blockRange;
                endWeights = [toWei('15'), toWei('15'), toWei('15')];
                console.log("startBlock: "+startBlock)
                console.log("endBlock: "+endBlock)
                console.log("endWeights  : "+endWeights)
                await controller.updateWeightsGradually(endWeights, startBlock, endBlock);
            });    

            it('Should revert because too early to pokeWeights()', async () => {
                // block = await web3.eth.getBlock("latest");
                // console.log("Block: "+block.number);
                truffleAssert.reverts(
                     controller.pokeWeights(),
                      'ERR_CANT_POKE_YET',
                );
            });  

            it('Should be able to pokeWeights()', async () => {
                for (var i = 0; i < 18; i++) {
                    weightXYZ = await controller.getDenormalizedWeight(XYZ);
                    weightWETH = await controller.getDenormalizedWeight(WETH);
                    weightDAI = await controller.getDenormalizedWeight(DAI);
                    block = await web3.eth.getBlock("latest");
                    console.log("Block: "+block.number+" weights: "+weightXYZ.toString()+", "+weightWETH.toString()+
                        ", "+weightDAI.toString());
                    await controller.pokeWeights();
                }

            });  


        });

    });

});