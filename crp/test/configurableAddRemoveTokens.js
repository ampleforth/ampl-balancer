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
        let CONTROLLER_ADDRESS;
        let WETH;
        let DAI;
        let XYZ;
        let ABC;
        let ASD;
        let weth;
        let dai;
        let xyz;
        let abc;
        let asd;
        let startWeights = [toWei('12'), toWei('1.5'), toWei('1.5')];
        let startBalances = [toWei('80000'), toWei('40'), toWei('10000')];
        let addTokenTimeLockInBlocks = 10;
        let applyAddTokenValidBlock;

        before(async () => {
            bfactory = await BFactory.deployed();
            factory = await CRPFactory.deployed();
            xyz = await TToken.new('XYZ', 'XYZ', 18);
            weth = await TToken.new('Wrapped Ether', 'WETH', 18);
            dai = await TToken.new('Dai Stablecoin', 'DAI', 18);
            abc = await TToken.new('ABC', 'ABC', 18);
            asd = await TToken.new('ASD', 'ASD', 18);

            WETH = weth.address;
            DAI = dai.address;
            XYZ = xyz.address;
            ABC = abc.address;
            ASD = asd.address;

            // admin balances
            await weth.mint(admin, toWei('100'));
            await dai.mint(admin, toWei('15000'));
            await xyz.mint(admin, toWei('100000'));
            await abc.mint(admin, toWei('100000'));
            await asd.mint(admin, toWei('100000'));

            // Copied this model of code from https://github.com/balancer-labs/balancer-core/blob/5d70da92b1bebaa515254d00a9e064ecac9bd18e/test/math_with_fees.js#L93
            CONTROLLER = await factory.newCrp.call(
                bfactory.address,
                [XYZ, WETH, DAI],
                startBalances,
                startWeights,
                10**15, //swapFee
                10, //minimumWeightChangeBlockPeriod
                addTokenTimeLockInBlocks, //addTokenTimeLockInBlocks
                [false, false, false, true] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
            );  

            await factory.newCrp(
                bfactory.address,
                [XYZ, WETH, DAI],
                startBalances,
                startWeights,
                10**15, //swapFee
                10, //minimumWeightChangeBlockPeriod
                addTokenTimeLockInBlocks, //addTokenTimeLockInBlocks
                [false, false, false, true] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
            );  

            controller = await ConfigurableRightsPool.at(CONTROLLER);
            
            CONTROLLER_ADDRESS = controller.address;

            //console.log(CONTROLLER_ADDRESS);

            await weth.approve(CONTROLLER_ADDRESS, MAX);
            await dai.approve(CONTROLLER_ADDRESS, MAX);
            await xyz.approve(CONTROLLER_ADDRESS, MAX);
            await abc.approve(CONTROLLER_ADDRESS, MAX);
            await asd.approve(CONTROLLER_ADDRESS, MAX);

            await controller.createPool();

        });

        describe('configurableAddRemoveTokens only', () => {
            it('Controller should not be able to commitAddToken with invalid weight', async () => {
                truffleAssert.reverts(
                      controller.commitAddToken(ABC, toWei('10000'),toWei('50.1')), 
                      'ERR_WEIGHT_ABOVE_MAX',
                );  

                truffleAssert.reverts(
                      controller.commitAddToken(ABC, toWei('10000'),toWei('0.1')), 
                      'ERR_WEIGHT_BELOW_MIN',
                );  

                // truffleAssert.reverts(
                //       controller.commitAddToken(ABC, toWei('10000'),toWei('35.1')), // total weight = 50.1, invalid
                //       'ERR_MAX_TOTAL_WEIGHT',
                // );

            });

            it('Controller should be able to commitAddToken', async () => {
                block = await web3.eth.getBlock("latest");
                applyAddTokenValidBlock = block.number+addTokenTimeLockInBlocks
                console.log("Block commitAddToken: "+block.number); 
                console.log("Block valid applyAddToken : "+applyAddTokenValidBlock);  
                await controller.commitAddToken(WETH, toWei('20'), toWei('1.5'));
            });



            it('Controller should not be able to applyAddToken before addTokenTimeLockInBlocks', async () => {
                for (var i = 0; block.number < applyAddTokenValidBlock-1; i++) {
                    truffleAssert.reverts(
                      controller.applyAddToken(), 
                      'ERR_TIMELOCK_STILL_COUNTING',
                    ); 
                    block = await web3.eth.getBlock("latest");
                    console.log("Block invalid applyAddToken: "+block.number);
                }

                // Just to move block forward a bit before next test: calls are useless
                await abc.approve(CONTROLLER_ADDRESS, MAX);
                await abc.approve(CONTROLLER_ADDRESS, MAX);
                await abc.approve(CONTROLLER_ADDRESS, MAX);

            });

            it('Controller should not be able to applyAddToken for a token that is already bound', async () => {
                truffleAssert.reverts(
                      controller.applyAddToken(), 
                      'ERR_IS_BOUND',
                    ); 
            });   

            it('Controller should be able to commitAddToken again', async () => {
                block = await web3.eth.getBlock("latest");
                applyAddTokenValidBlock = block.number+addTokenTimeLockInBlocks
                console.log("Block commitAddToken: "+block.number); 
                console.log("Block valid applyAddToken : "+applyAddTokenValidBlock);  
                await controller.commitAddToken(ABC, toWei('10000'), toWei('1.5'));
            });


            it('Controller should not be able to applyAddToken before addTokenTimeLockInBlocks', async () => {
                for (var i = 0; block.number < applyAddTokenValidBlock-1; i++) { // -1 seems necessary here. TODO: Investigate block numbers
                    truffleAssert.reverts(
                      controller.applyAddToken(), 
                      'ERR_TIMELOCK_STILL_COUNTING',
                    ); 
                    block = await web3.eth.getBlock("latest");
                    console.log("Block invalid applyAddToken: "+block.number);
                }
                // Just to move block forward a bit before next test: calls are useless
                await abc.approve(CONTROLLER_ADDRESS, MAX);
                await abc.approve(CONTROLLER_ADDRESS, MAX);
                await abc.approve(CONTROLLER_ADDRESS, MAX);

            });

            it('Controller should be able to applyAddToken', async () => {
                block = await web3.eth.getBlock("latest");
                console.log("Block valid applyAddToken: "+block.number);
                
                balance = await controller.balanceOf.call(admin);
                console.log("BPT balance before: "+balance.toString());  

                adminABCBalance = await abc.balanceOf.call(admin);
                console.log("ABC balance before: "+adminABCBalance.toString());  
                
                await controller.applyAddToken();
                
                balance = await controller.balanceOf.call(admin);
                console.log("BPT balance after : "+balance.toString());

                adminABCBalance = await abc.balanceOf.call(admin);
                console.log("ABC balance after : "+adminABCBalance.toString());

                // BPT Balance should go from 100 to 110 since total weight went from 15 to 16.5
                assert.equal(balance.toString(), toWei('110'));
                // WETH Balance should go from 60 to 20 (since 40 WETH are deposited to pool to get if from 40 to 80 WETH)
                assert.equal(adminABCBalance.toString(), toWei('90000')); 
            });  

            it('Controller should not be able to removeToken if token is not bound', async () => {
                truffleAssert.reverts(
                      controller.removeToken(ASD), 
                      'ERR_NOT_BOUND',
                    );  
            });       

            it('Controller should be able to removeToken if token is bound', async () => {
                balance = await controller.balanceOf.call(admin);
                console.log("BPT balance before: "+balance.toString());

                adminDAIBalance = await dai.balanceOf.call(admin);
                console.log("DAI balance before: "+adminDAIBalance.toString());

                await controller.removeToken(DAI);

                balance = await controller.balanceOf.call(admin);
                console.log("BPT balance after : "+balance.toString());

                adminDAIBalance = await dai.balanceOf.call(admin);
                console.log("DAI balance after : "+adminDAIBalance.toString());

                // BPT Balance should go from 110 to 100 since total weight went from 16.5 to 15
                assert.equal(balance.toString(), toWei('100'));
                // DAI Balance should go from 5000 to 15000 (since 10000 was given back from pool with DAI removal)
                assert.equal(adminDAIBalance.toString(), toWei('15000')); 
            });       

        });

    });

});