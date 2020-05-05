const BFactory = artifacts.require('BFactory');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');
const { time } = require("@openzeppelin/test-helpers");

contract('configurableAddRemoveTokens', async (accounts) => {
    const admin = accounts[0];
    const nonAdmin = accounts[1];
    const { toWei } = web3.utils;
    const { fromWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);

    let crpFactory, bFactory;
    let crpPool;
    let CRPPOOL;
    let CRPPOOL_ADDRESS;
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
    let addTokenTimeLockInBLocks = 10;
    let applyAddTokenValidBlock;

    before(async () => {
        /*
        Uses deployed BFactory & CRPFactory.
        Deploys new test tokens - XYZ, WETH, DAI, ABC, ASD
        Mints test tokens for Admin user (account[0])
        CRPFactory creates new CRP.
        CRP creates new BPool.
        */
        bfactory = await BFactory.deployed();
        crpFactory = await CRPFactory.deployed();
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
        CRPPOOL = await crpFactory.newCrp.call(
            bfactory.address,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            10**15, //swapFee
            10, //minimumWeightChangeBlockPeriod
            addTokenTimeLockInBLocks, //addTokenTimeLockInBLocks
            [false, false, false, true] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
        );

        await crpFactory.newCrp(
            bfactory.address,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            10**15, //swapFee
            10, //minimumWeightChangeBlockPeriod
            addTokenTimeLockInBLocks, //addTokenTimeLockInBLocks
            [false, false, false, true] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
        );

        crpPool = await ConfigurableRightsPool.at(CRPPOOL);

        CRPPOOL_ADDRESS = crpPool.address;

        await weth.approve(CRPPOOL_ADDRESS, MAX);
        await dai.approve(CRPPOOL_ADDRESS, MAX);
        await xyz.approve(CRPPOOL_ADDRESS, MAX);
        await abc.approve(CRPPOOL_ADDRESS, MAX);
        await asd.approve(CRPPOOL_ADDRESS, MAX);

        await crpPool.createPool();
    });

    it('Controller should not be able to commitAddToken with invalid weight', async () => {
        await truffleAssert.reverts(
              crpPool.commitAddToken(ABC, toWei('10000'),toWei('50.1')),
              'ERR_WEIGHT_ABOVE_MAX',
        );

        await truffleAssert.reverts(
              crpPool.commitAddToken(ABC, toWei('10000'),toWei('0.1')),
              'ERR_WEIGHT_BELOW_MIN',
        );

        // truffleAssert.reverts(
        //       crpPool.commitAddToken(ABC, toWei('10000'),toWei('35.1')), // total weight = 50.1, invalid
        //       'ERR_MAX_TOTAL_WEIGHT',
        // );

    });

    it('Controller should be able to commitAddToken', async () => {
        const block = await web3.eth.getBlock("latest");
        applyAddTokenValidBlock = block.number + addTokenTimeLockInBLocks;
        console.log("Block commitAddToken: " + block.number);
        console.log("Block valid applyAddToken : " + applyAddTokenValidBlock);
        await crpPool.commitAddToken(WETH, toWei('20'), toWei('1.5'));

        // ??????? Add a check that token has added?
    });

    it('1st Controller should not be able to applyAddToken before addTokenTimeLockInBLocks', async () => {
        // ??????? Better description?
        let block = await web3.eth.getBlock("latest");

        assert(block.number < applyAddTokenValidBlock, `Block Should Be Less Than Valid Block At Start Of Test`);

        while(block.number < applyAddTokenValidBlock){

            console.log(`Block invalid applyAddToken: ${block.number} ${applyAddTokenValidBlock}`);

            await truffleAssert.reverts(
              crpPool.applyAddToken(),
              'ERR_TIMELOCK_STILL_COUNTING',
            );
            block = await web3.eth.getBlock("latest");
        }

        // Move blocks on
        let advanceBlocks = 7;
        while(--advanceBlocks) await time.advanceBlock();
    });

    it('Controller should not be able to applyAddToken for a token that is already bound', async () => {
        truffleAssert.reverts(
              crpPool.applyAddToken(),
              'ERR_IS_BOUND',
            );
    });

    it('Controller should be able to commitAddToken again', async () => {
        const block = await web3.eth.getBlock("latest");
        applyAddTokenValidBlock = block.number + addTokenTimeLockInBLocks;
        console.log("Block commitAddToken: " + block.number);
        console.log("Block valid applyAddToken : " + applyAddTokenValidBlock);
        await crpPool.commitAddToken(ABC, toWei('10000'), toWei('1.5'));
    });

    it('Controller should not be able to applyAddToken before addTokenTimeLockInBLocks', async () => {
        let block = await web3.eth.getBlock("latest");

        assert(block.number < applyAddTokenValidBlock, `Block Should Be Less Than Valid Block At Start Of Test`);

        while(block.number < applyAddTokenValidBlock){
            console.log(`Test 2 Block invalid applyAddToken: ${block.number} ${applyAddTokenValidBlock}`);

            await truffleAssert.reverts(
              crpPool.applyAddToken(),
              'ERR_TIMELOCK_STILL_COUNTING',
            );

            block = await web3.eth.getBlock("latest");
        }

        // Move blocks on
        let advanceBlocks = 7;
        while(--advanceBlocks) await time.advanceBlock();
    });

    it('Controller should be able to applyAddToken', async () => {
        const block = await web3.eth.getBlock("latest");
        console.log("Block valid applyAddToken: "+ block.number);

        let balance = await crpPool.balanceOf.call(admin);
        console.log("BPT balance before: " + balance.toString());

        let adminABCBalance = await abc.balanceOf.call(admin);
        console.log("ABC balance before: " + adminABCBalance.toString());

        await crpPool.applyAddToken();

        balance = await crpPool.balanceOf.call(admin);
        console.log("BPT balance after : " + balance.toString());

        adminABCBalance = await abc.balanceOf.call(admin);
        console.log("ABC balance after : " + adminABCBalance.toString());

        // BPT Balance should go from 100 to 110 since total weight went from 15 to 16.5
        assert.equal(balance.toString(), toWei('110'));
        // WETH Balance should go from 60 to 20 (since 40 WETH are deposited to pool to get if from 40 to 80 WETH)
        assert.equal(adminABCBalance.toString(), toWei('90000'));
    });

    it('Controller should not be able to removeToken if token is not bound', async () => {
        truffleAssert.reverts(
              crpPool.removeToken(ASD),
              'ERR_NOT_BOUND',
            );
    });

    it('Controller should be able to removeToken if token is bound', async () => {
        let balance = await crpPool.balanceOf.call(admin);
        console.log("BPT balance before: "+balance.toString());

        let adminDAIBalance = await dai.balanceOf.call(admin);
        console.log("DAI balance before: "+adminDAIBalance.toString());

        await crpPool.removeToken(DAI);

        balance = await crpPool.balanceOf.call(admin);
        console.log("BPT balance after : "+balance.toString());

        adminDAIBalance = await dai.balanceOf.call(admin);
        console.log("DAI balance after : "+adminDAIBalance.toString());

        // BPT Balance should go from 110 to 100 since total weight went from 16.5 to 15
        assert.equal(balance.toString(), toWei('100'));
        // DAI Balance should go from 5000 to 15000 (since 10000 was given back from pool with DAI removal)
        assert.equal(adminDAIBalance.toString(), toWei('15000'));
    });

});
