const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');
const Decimal = require('decimal.js');
//const { time, expectRevert } = require("@openzeppelin/test-helpers");

function calcRelativeDiff(expected, actual) {
    return ((Decimal(expected).minus(Decimal(actual))).div(expected)).abs();
}

contract('configurableWeights', async (accounts) => {
    const admin = accounts[0];
    const { toWei } = web3.utils;
    const { fromWei } = web3.utils;
    const errorDelta = 10 ** -8;
    const MAX = web3.utils.toTwosComplement(-1);

    let crpFactory, bFactory;
    let crpPool;
    let CRPPOOL;
    let WETH, DAI, XYZ, ABC;
    let weth, dai, xyz, abc;

    // These are the intial settings for newCrp:
    const swapFee = 10**15;
    const startingXyzWeight = '12';
    const startingWethWeight = '1.5';
    const startingDaiWeight = '1.5';
    const startWeights = [toWei(startingXyzWeight), toWei(startingWethWeight), toWei(startingDaiWeight)];
    const startBalances = [toWei('80000'), toWei('40'), toWei('10000')];
    const addTokenTimeLockInBLocks = 10;
    const minimumWeightChangeBlockPeriod = 10;
    const permissions = [false, false, true, false] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens

    let validEndBlock, validStartBlock;
    const updatedWethWeight = '3';
    let endXyzWeight = '3';
    let endWethWeight = '6';
    let endDaiWeight = '6';

    before(async () => {
        /*
        Uses deployed BFactory & CRPFactory.
        Deploys new test tokens - XYZ, WETH, DAI, ABC, ASD
        Mints test tokens for Admin user (account[0])
        CRPFactory creates new CRP.
        Admin approves CRP for MAX
        newCrp call with configurableWeights set to true
        */
        bFactory = await BFactory.deployed();
        crpFactory = await CRPFactory.deployed();
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

        const tokenAddresses = [XYZ, WETH, DAI];

        // Copied this model of code from https://github.com/balancer-labs/balancer-core/blob/5d70da92b1bebaa515254d00a9e064ecac9bd18e/test/math_with_fees.js#L93
        CRPPOOL = await crpFactory.newCrp.call(
            bFactory.address,
            tokenAddresses,
            startBalances,
            startWeights,
            swapFee,
            minimumWeightChangeBlockPeriod,
            addTokenTimeLockInBLocks,
            permissions
        );

        await crpFactory.newCrp(
            bFactory.address,
            tokenAddresses,
            startBalances,
            startWeights,
            swapFee,
            minimumWeightChangeBlockPeriod,
            addTokenTimeLockInBLocks,
            permissions
        );

        crpPool = await ConfigurableRightsPool.at(CRPPOOL);

        let CRPPOOL_ADDRESS = crpPool.address;

        await weth.approve(CRPPOOL_ADDRESS, MAX);
        await dai.approve(CRPPOOL_ADDRESS, MAX);
        await xyz.approve(CRPPOOL_ADDRESS, MAX);

        await crpPool.createPool();
    });

    describe('updateWeight', () => {

        it('Non Controller account should not be able to change weights', async () => {
            await truffleAssert.reverts(
              crpPool.updateWeight(WETH, toWei('3'), { from: accounts[1]}),
              'ERR_NOT_CONTROLLER',
            );
        });

        it('Should not change weights below min', async () => {
            await truffleAssert.reverts(
              crpPool.updateWeight(WETH, toWei('0.1')),
              'ERR_MIN_WEIGHT',
            );
        });

        it('Should not change weights above max', async () => {
            await truffleAssert.reverts(
              crpPool.updateWeight(WETH, toWei('50.1')),
              'ERR_MAX_WEIGHT',
            );
        });

        it('Should not change weights if brings total weight above max', async () => {
            await truffleAssert.reverts(
              crpPool.updateWeight(WETH, toWei('37.5')),
              'ERR_MAX_TOTAL_WEIGHT',
            );
        });

        it('Controller should be able to change weights with updateWeight()', async () => {
            const _bPool = await crpPool._bPool();
            const bPool = await BPool.at(_bPool);

            let adminBPTBalance = await crpPool.balanceOf.call(admin);
            let adminWethBalance = await weth.balanceOf.call(admin);
            let bPoolXYZBalance = await xyz.balanceOf.call(_bPool);
            let bPoolWethBalance = await weth.balanceOf.call(_bPool);
            let bPoolDaiBalance = await dai.balanceOf.call(_bPool);

            assert.equal(adminBPTBalance, toWei('100'));
            assert.equal(adminWethBalance, toWei('60'));
            assert.equal(bPoolXYZBalance, toWei('80000'));
            assert.equal(bPoolWethBalance, toWei('40'));
            assert.equal(bPoolDaiBalance, toWei('10000'));

            let xyzWeight = await bPool.getDenormalizedWeight.call(xyz.address);
            let wethWeight = await bPool.getDenormalizedWeight.call(weth.address);
            let daiWeight = await bPool.getDenormalizedWeight.call(dai.address);

            assert.equal(xyzWeight, toWei(startingXyzWeight));
            assert.equal(wethWeight, toWei(startingWethWeight));
            assert.equal(daiWeight, toWei(startingDaiWeight));

            await crpPool.updateWeight(WETH, toWei(updatedWethWeight)); // This should double WETH weight from 1.5 to 3.

            adminBPTBalance = await crpPool.balanceOf.call(admin);
            adminWethBalance = await weth.balanceOf.call(admin);
            bPoolXYZBalance = await xyz.balanceOf.call(_bPool);
            bPoolWethBalance = await weth.balanceOf.call(_bPool);
            bPoolDaiBalance = await dai.balanceOf.call(_bPool);

            // BPT Balance should go from 100 to 110 since total weight went from 15 to 16.5
            // WETH Balance should go from 60 to 20 (since 40 WETH are deposited to pool to get if from 40 to 80 WETH)
            assert.equal(adminBPTBalance, toWei('110'));
            assert.equal(adminWethBalance, toWei('20'));
            assert.equal(bPoolXYZBalance, toWei('80000'));
            assert.equal(bPoolWethBalance, toWei('80'));
            assert.equal(bPoolDaiBalance, toWei('10000'));

            xyzWeight = await bPool.getDenormalizedWeight.call(xyz.address);
            wethWeight = await bPool.getDenormalizedWeight.call(weth.address);
            daiWeight = await bPool.getDenormalizedWeight.call(dai.address);

            assert.equal(xyzWeight, toWei(startingXyzWeight));
            assert.equal(wethWeight, toWei(updatedWethWeight));
            assert.equal(daiWeight, toWei(startingDaiWeight));
        });

        it('Controller should not be able to change weights'+
         'when they dont have enough tokens', async () => {
            // This should tripple WETH weight from 1.5 to 4.5, requiring 80 WETH, but admin only has 60.
            await truffleAssert.reverts(
                  crpPool.updateWeight(WETH, toWei('4.5')),
                  'ERR_INSUFFICIENT_BAL',
            );
        });

        it('Should not be able to update weight for non-token', async () => {
            // This should tripple WETH weight from 1.5 to 4.5, requiring 80 WETH, but admin only has 60.
            await truffleAssert.reverts(
                  crpPool.updateWeight(ABC, toWei('4.5')),
                  'ERR_NOT_BOUND',
            );
        });
    });

    describe('updateWeightsGradually', () => {

        it('Non Controller account should not be able to change weights gradually', async () => {
            let blockRange = 10;
            let block = await web3.eth.getBlock("latest");

            let startBlock = block.number + 6;
            let endBlock = startBlock + blockRange;
            let endWeights = [toWei('3'), toWei('6'), toWei('6')];

            await truffleAssert.reverts(
              crpPool.updateWeightsGradually(endWeights, startBlock, endBlock, {from: accounts[1]}),
              'ERR_NOT_CONTROLLER',
            );
        });

        it('Should not be able to call updateWeightsGradually() with block period < minimumWeightChangeBlockPeriod', async () => {
            const blockRange = minimumWeightChangeBlockPeriod - 1;
            const block = await web3.eth.getBlock("latest");
            const startBlock = block.number;
            const endBlock = startBlock + blockRange;

            await truffleAssert.reverts(
                crpPool.updateWeightsGradually([toWei('3'), toWei('6'), toWei('6')], startBlock, endBlock),
                  'ERR_WEIGHT_CHANGE_PERIOD_BELOW_MIN',
            );
        });

        it('Should not be able to call updateWeightsGradually() with invalid weights', async () => {
            const blockRange = minimumWeightChangeBlockPeriod;
            const block = await web3.eth.getBlock("latest");
            const startBlock = block.number;
            const endBlock = startBlock + blockRange;

            await truffleAssert.reverts(
                crpPool.updateWeightsGradually([toWei('51'), toWei('6'), toWei('6')], startBlock, endBlock),
                  'ERR_WEIGHT_ABOVE_MAX',
            );

            await truffleAssert.reverts(
                crpPool.updateWeightsGradually([toWei('0.999'), toWei('6'), toWei('6')], startBlock, endBlock),
                  'ERR_WEIGHT_BELOW_MIN',
            );

            await truffleAssert.reverts(
                crpPool.updateWeightsGradually([toWei('20'), toWei('20'), toWei('11')], startBlock, endBlock),
                  'ERR_MAX_TOTAL_WEIGHT',
            );
        });

        it('Controller should be able to call updateWeightsGradually() with valid range', async () => {
            let block = await web3.eth.getBlock("latest");
            const startBlock = block.number + 10;
            const endBlock = startBlock + minimumWeightChangeBlockPeriod;
            validEndBlock = endBlock;
            validStartBlock = startBlock;
            console.log(`Setting start block: ${startBlock} End Block: ${endBlock}`)
            let endWeights = [toWei(endXyzWeight), toWei(endWethWeight), toWei(endDaiWeight)];
            await crpPool.updateWeightsGradually(endWeights, startBlock, endBlock);
        });

        it('Should not be able to pokeWeights until valid start block reached', async () => {
            let block = await web3.eth.getBlock("latest");
            assert(block.number < validStartBlock, `Block Should Be Less Than Valid Block At Start Of Test`);

            while(block.number < (validStartBlock - 1)){

                await truffleAssert.reverts(
                  crpPool.pokeWeights(),
                  'ERR_CANT_POKE_YET',
                );

                block = await web3.eth.getBlock("latest");
                console.log(`Valid start block: ${validStartBlock}, last block: ${block.number} `);
            }
        });

        it('Should run full update cycle (descending weights), no missed blocks. (anyone can pokeWeights())', async () => {

              let xyzWeight = await crpPool.getDenormalizedWeight(XYZ);
              let wethWeight = await crpPool.getDenormalizedWeight(WETH);
              let daiWeight = await crpPool.getDenormalizedWeight(DAI);
              let block = await web3.eth.getBlock("latest");
              console.log(`Last Block: ${block.number} weights: ${xyzWeight.toString()} ${wethWeight.toString()} ${daiWeight.toString()}`);

              // Starting weights
              assert.equal(xyzWeight, toWei(startingXyzWeight));
              assert.equal(wethWeight, toWei(updatedWethWeight));
              assert.equal(daiWeight, toWei(startingDaiWeight));

              // let endWeights = [toWei('3'), toWei('6'), toWei('6')];
              const blockPeriod = validEndBlock - validStartBlock;
              while(block.number < validEndBlock){

                await crpPool.pokeWeights({from: accounts[1]});

                xyzWeight = await crpPool.getDenormalizedWeight(XYZ);
                wethWeight = await crpPool.getDenormalizedWeight(WETH);
                daiWeight = await crpPool.getDenormalizedWeight(DAI);

                block = await web3.eth.getBlock("latest");
                let newXyzW = Number(startingXyzWeight) - ((block.number - validStartBlock) * ((Number(startingXyzWeight) - Number(endXyzWeight))/blockPeriod));
                let newWethW = Number(updatedWethWeight) - ((block.number - validStartBlock) * ((Number(updatedWethWeight) - Number(endWethWeight))/blockPeriod));
                let newDaiW = Number(startingDaiWeight) - ((block.number - validStartBlock) * ((Number(startingDaiWeight) - Number(endDaiWeight))/blockPeriod));
                console.log(`${block.number} Weights: ${newXyzW}/${fromWei(xyzWeight)}, ${newWethW}/${wethWeight.toString()}, ${newDaiW}/${daiWeight.toString()}`);

                let relDif = calcRelativeDiff(newXyzW, fromWei(xyzWeight));
                assert.isAtMost(relDif.toNumber(), errorDelta);
                relDif = calcRelativeDiff(newWethW, fromWei(wethWeight));
                assert.isAtMost(relDif.toNumber(), errorDelta);
                relDif = calcRelativeDiff(newDaiW, fromWei(daiWeight));
                assert.isAtMost(relDif.toNumber(), errorDelta);
              }

              assert.equal(xyzWeight, toWei(endXyzWeight));
              assert.equal(wethWeight, toWei(endWethWeight));
              assert.equal(daiWeight, toWei(endDaiWeight));
        });

        it(`poking weights after end date should have no effect`, async () => {
            for(var i = 0;i < 10;i++){
              await crpPool.pokeWeights();
              let xyzWeight = await crpPool.getDenormalizedWeight(XYZ);
              let wethWeight = await crpPool.getDenormalizedWeight(WETH);
              let daiWeight = await crpPool.getDenormalizedWeight(DAI);
              assert.equal(xyzWeight, toWei(endXyzWeight));
              assert.equal(wethWeight, toWei(endWethWeight));
              assert.equal(daiWeight, toWei(endDaiWeight));
            }
        })

        /*
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
            await crpPool.updateWeightsGradually(endWeights, startBlock, endBlock);
        });
        */

        // increasing weights
        // weight poked after start/end
        // check price remains same
    });
});
