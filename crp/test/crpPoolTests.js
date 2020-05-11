const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');
const Decimal = require('decimal.js');
const {
    calcSpotPrice,
    calcOutGivenIn,
    calcInGivenOut,
    calcRelativeDiff,
} = require('../lib/calc_comparisons');

const verbose = true;//process.env.VERBOSE;


/*
Tests initial CRP Pool set-up including:
BPool deployment, token binding, balance checks, BPT checks.
*/
contract('crpPoolTests', async (accounts) => {
    const admin = accounts[0];
    const nonAdmin = accounts[1];
    const { toWei, fromWei } = web3.utils;
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const MAX = web3.utils.toTwosComplement(-1);
    const errorDelta = 10 ** -8;
    // These are the intial settings for newCrp:
    const swapFee = toWei('0.003');
    const startWeights = [toWei('12'), toWei('1.5'), toWei('1.5')];
    const startBalances = [toWei('80000'), toWei('40'), toWei('10000')];
    const addTokenTimeLockInBLocks = 10;
    const minimumWeightChangeBlockPeriod = 10;

    let crpFactory; let bFactory; let bPool; let
        crpPool;
    let CRPPOOL;
    let CRPPOOL_ADDRESS;
    let WETH;
    let DAI;
    let XYZ;
    let XXX;
    let weth;
    let dai;
    let xyz;
    let xxx;

    before(async () => {
        /*
        Uses deployed BFactory & CRPFactory.
        Deploys new test tokens - XYZ, WETH, DAI, ABC, ASD
        Mints test tokens for Admin user (account[0])
        CRPFactory creates new CRP.
        Admin approves CRP for MAX
        */
        bFactory = await BFactory.deployed();
        crpFactory = await CRPFactory.deployed();
        xyz = await TToken.new('XYZ', 'XYZ', 18);
        weth = await TToken.new('Wrapped Ether', 'WETH', 18);
        dai = await TToken.new('Dai Stablecoin', 'DAI', 18);
        xxx = await TToken.new('XXX', 'XXX', 18);

        WETH = weth.address;
        DAI = dai.address;
        XYZ = xyz.address;
        XXX = xxx.address;

        // admin balances
        await weth.mint(admin, toWei('100'));
        await dai.mint(admin, toWei('15000'));
        await xyz.mint(admin, toWei('100000'));

        CRPPOOL = await crpFactory.newCrp.call(
            bFactory.address,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            swapFee,
            minimumWeightChangeBlockPeriod,
            addTokenTimeLockInBLocks,
            [true, true, true, true],
            // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
        );

        await crpFactory.newCrp(
            bFactory.address,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            swapFee,
            minimumWeightChangeBlockPeriod,
            addTokenTimeLockInBLocks,
            [true, true, true, true],
            // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
        );

        crpPool = await ConfigurableRightsPool.at(CRPPOOL);

        CRPPOOL_ADDRESS = crpPool.address;

        await weth.approve(CRPPOOL_ADDRESS, MAX);
        await dai.approve(CRPPOOL_ADDRESS, MAX);
        await xyz.approve(CRPPOOL_ADDRESS, MAX);
    });

    it('crpPool should have no BPool before creation', async () => {
        const bPoolAddr = await crpPool.bPool();
        assert.equal(bPoolAddr, ZERO_ADDRESS);
    });

    it('crpPool should have admin account as controller', async () => {
        const controllerAddr = await crpPool.getController.call();
        assert.equal(controllerAddr, admin);
    });

    it('crpPool should have all rights set to true', async () => {
        const currentRights = await crpPool.getCurrentRights();
        assert.sameMembers(currentRights, [true, true, true, true]);
    });

    it('Admin should have no initial BPT', async () => {
        const adminBPTBalance = await crpPool.balanceOf.call(admin);
        assert.equal(adminBPTBalance, toWei('0'));
    });

    it('crpPool should not createPool with 0 BPT Initial Supply', async () => {
        await truffleAssert.reverts(
            crpPool.createPool(toWei('0')),
            'ERR_INIT_SUPPLY',
        );
    });

    it('crpPool should have a BPool after creation', async () => {
        await crpPool.createPool(toWei('100'));
        const bPoolAddr = await crpPool.bPool();
        assert.notEqual(bPoolAddr, ZERO_ADDRESS);
        bPool = await BPool.at(bPoolAddr);
    });

    it('crpPool should have all rights set to true', async () => {
        const currentRights = await crpPool.getCurrentRights();
        assert.sameMembers(currentRights, [true, true, true, true]);
    });

    it('should not be able to createPool twice', async () => {
        await truffleAssert.reverts(
            crpPool.createPool(toWei('100')),
            'ERR_IS_CREATED',
        );
    });

    it('BPool should have matching swap fee', async () => {
        const deployedSwapFee = await bPool.getSwapFee();
        assert.equal(swapFee, deployedSwapFee);
    });

    it('BPool should have public swaps enabled', async () => {
        const isPublicSwap = await bPool.isPublicSwap();
        assert.equal(isPublicSwap, true);
    });

    it('BPool should have initial token balances', async () => {
        const bPoolAddr = await crpPool.bPool();

        const adminXYZBalance = await xyz.balanceOf.call(admin);
        const bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
        const adminWethBalance = await weth.balanceOf.call(admin);
        const bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
        const adminDaiBalance = await dai.balanceOf.call(admin);
        const bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);

        assert.equal(adminXYZBalance, toWei('20000'));
        assert.equal(bPoolXYZBalance, toWei('80000'));
        assert.equal(adminWethBalance, toWei('60'));
        assert.equal(bPoolWethBalance, toWei('40'));
        assert.equal(adminDaiBalance, toWei('5000'));
        assert.equal(bPoolDaiBalance, toWei('10000'));
    });

    it('BPool should have initial token weights', async () => {
        const xyzWeight = await bPool.getDenormalizedWeight.call(xyz.address);
        const wethWeight = await bPool.getDenormalizedWeight.call(weth.address);
        const daiWeight = await bPool.getDenormalizedWeight.call(dai.address);

        assert.equal(xyzWeight, toWei('12'));
        assert.equal(wethWeight, toWei('1.5'));
        assert.equal(daiWeight, toWei('1.5'));
    });

    it('Admin should have initial BPT', async () => {
        const adminBPTBalance = await crpPool.balanceOf.call(admin);
        assert.equal(adminBPTBalance, toWei('100'));
    });

    it('JoinPool should revert if smart pool is not finalized yet', async () => {
        await truffleAssert.reverts(
            crpPool.joinPool(toWei('1000')),
            'ERR_SMART_POOL_NOT_FINALIZED',
        );
    });

    it('Fails calling any join exit swap before finalizing', async () => {
        await truffleAssert.reverts(
            crpPool.joinswapExternAmountIn(WETH, toWei('2.5')),
            'ERR_SMART_POOL_NOT_FINALIZED',
        );
        await truffleAssert.reverts(
            crpPool.joinswapPoolAmountOut(WETH, toWei('2.5')),
            'ERR_SMART_POOL_NOT_FINALIZED',
        );
        await truffleAssert.reverts(
            crpPool.exitswapPoolAmountIn(WETH, toWei('2.5')),
            'ERR_SMART_POOL_NOT_FINALIZED',
        );
        await truffleAssert.reverts(
            crpPool.exitswapExternAmountOut(WETH, toWei('2.5')),
            'ERR_SMART_POOL_NOT_FINALIZED',
        );
    });

    it('JoinPool should not revert if smart pool is finalized', async () => {
        await crpPool.finalizeSmartPool();
        await crpPool.joinPool(toWei('1'));

        const balance = await crpPool.balanceOf.call(admin);

        assert.equal(balance, toWei('101'));
        // !!!!!!! Confirm account balances for tokens is correct
    });

    it('JoinPool should revert if user does not have allowance to join pool', async () => {
        await truffleAssert.reverts(
            crpPool.joinPool(toWei('1'), { from: nonAdmin }),
            'ERR_BTOKEN_BAD_CALLER',
        );
    });

    it('Fails calling any swap on unbound token', async () => {

        await truffleAssert.reverts(
            crpPool.joinswapExternAmountIn(XXX, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            crpPool.joinswapPoolAmountOut(XXX, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            crpPool.exitswapPoolAmountIn(XXX, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            crpPool.exitswapExternAmountOut(XXX, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
    });

    it('tAo = exitswapPoolAmountIn(exitswapExternAmountOut(tAo))', async () => {
        // From Balancer Core
        const tAo = '1';
        const pAi = await crpPool.exitswapExternAmountOut.call(DAI, toWei(tAo));
        const calculatedtAo = await crpPool.exitswapPoolAmountIn.call(DAI, String(pAi));

        const expected = Decimal(tAo);
        const actual = fromWei(calculatedtAo);
        const relDif = calcRelativeDiff(expected, actual);

        if (verbose) {
            console.log(`pAi: ${pAi})`);
            console.log('tAo');
            console.log(`expected: ${expected})`);
            console.log(`actual  : ${actual})`);
            console.log(`relDif  : ${relDif})`);
        }

        assert.isAtMost(relDif.toNumber(), errorDelta);
    });

    it('pAo = joinswapExternAmountIn(joinswapPoolAmountOut(pAo))', async () => {
        // From Balancer Core
        const pAo = 1;
        const tAi = await crpPool.joinswapPoolAmountOut.call(WETH, toWei(String(pAo)));
        const calculatedPAo = await crpPool.joinswapExternAmountIn.call(WETH, String(tAi));

        const expected = Decimal(pAo);
        const actual = fromWei(calculatedPAo);
        const relDif = calcRelativeDiff(expected, actual);

        if (verbose) {
            console.log(`tAi: ${tAi})`);
            console.log('pAo');
            console.log(`expected: ${expected})`);
            console.log(`actual  : ${actual})`);
            console.log(`relDif  : ${relDif})`);
        }

        assert.isAtMost(relDif.toNumber(), errorDelta);
    });
});
