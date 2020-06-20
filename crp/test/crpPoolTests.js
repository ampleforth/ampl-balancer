const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');
const Decimal = require('decimal.js');
const { calcRelativeDiff } = require('../lib/calc_comparisons');

const verbose = process.env.VERBOSE;

/*
Tests initial CRP Pool set-up including:
BPool deployment, token binding, balance checks, BPT checks.
*/
contract('crpPoolTests', async (accounts) => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const { toWei, fromWei } = web3.utils;
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const MAX = web3.utils.toTwosComplement(-1);
    const errorDelta = 10 ** -8;
    // These are the intial settings for newCrp:
    const swapFee = toWei('0.003');
    const startWeights = [toWei('12'), toWei('1.5'), toWei('1.5')];
    const startBalances = [toWei('80000'), toWei('40'), toWei('10000')];
    const SYMBOL = 'BSP';
    const permissions = {
        canPauseSwapping: true,
        canChangeSwapFee: true,
        canChangeWeights: true,
        canAddRemoveTokens: true,
        canWhitelistLPs: false,
    };

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
            SYMBOL,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            swapFee,
            permissions,
        );

        await crpFactory.newCrp(
            bFactory.address,
            SYMBOL,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            swapFee,
            permissions,
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
        // const currentRights = await crpPool.getCurrentRights();
        // assert.sameMembers(currentRights, [true, true, true, true]);
        let x;
        for (x = 0; x < permissions.length; x++) {
            const perm = await crpPool.hasPermission(x);
            assert.isTrue(perm);
        }
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
        // const currentRights = await crpPool.getCurrentRights();
        // assert.sameMembers(currentRights, [true, true, true, true]);
        let x;
        for (x = 0; x <= 3; x++) {
            const perm = await crpPool.hasPermission(x);
            assert.isTrue(perm);
        }
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

    /* Pools are now "finalized" at the CRP level on create; don't need to call anything
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
    */

    it('JoinPool should not revert if smart pool is finalized', async () => {
        const bPoolAddr = await crpPool.bPool();
        let currentPoolBalance = await crpPool.balanceOf.call(admin);
        currentPoolBalance = Decimal(fromWei(currentPoolBalance));
        const previousPoolBalance = currentPoolBalance;
        let previousbPoolXyzBalance = await xyz.balanceOf.call(bPoolAddr);
        let previousbPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
        let previousbPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
        previousbPoolXyzBalance = Decimal(fromWei(previousbPoolXyzBalance));
        previousbPoolWethBalance = Decimal(fromWei(previousbPoolWethBalance));
        previousbPoolDaiBalance = Decimal(fromWei(previousbPoolDaiBalance));

        // Removed this function - smart pools are "finalized" at the CRP level on create
        // They are never finalized at the core level, or we wouldn't be able to do anything
        // await crpPool.finalizeSmartPool();

        const poolAmountOut = '1';
        await crpPool.joinPool(toWei(poolAmountOut), [MAX, MAX, MAX]);

        currentPoolBalance = currentPoolBalance.add(Decimal(poolAmountOut));

        const balance = await crpPool.balanceOf.call(admin);
        const bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
        const bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
        const bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);

        // Balances of all tokens increase proportionally to the pool balance
        let balanceChange = (Decimal(poolAmountOut).div(previousPoolBalance)).mul(previousbPoolWethBalance);
        const currentWethBalance = previousbPoolWethBalance.add(balanceChange);
        balanceChange = (Decimal(poolAmountOut).div(previousPoolBalance)).mul(previousbPoolDaiBalance);
        const currentDaiBalance = previousbPoolDaiBalance.add(balanceChange);
        balanceChange = (Decimal(poolAmountOut).div(previousPoolBalance)).mul(previousbPoolXyzBalance);
        const currentXyzBalance = previousbPoolXyzBalance.add(balanceChange);

        assert.equal(fromWei(balance), currentPoolBalance);
        assert.equal(bPoolXYZBalance, toWei(String(currentXyzBalance)));
        assert.equal(bPoolWethBalance, toWei(String(currentWethBalance)));
        assert.equal(bPoolDaiBalance, toWei(String(currentDaiBalance)));
    });

    it('JoinPool should revert if user does not have allowance to join pool', async () => {
        await truffleAssert.reverts(
            crpPool.joinPool(toWei('1'), [MAX, MAX, MAX], { from: user1 }),
            'ERR_BTOKEN_BAD_CALLER',
        );
    });

    it('Fails calling any swap on unbound token', async () => {
        await truffleAssert.reverts(
            crpPool.joinswapExternAmountIn(XXX, toWei('2.5'), toWei('0')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            crpPool.joinswapPoolAmountOut(XXX, toWei('2.5'), MAX),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            crpPool.exitswapPoolAmountIn(XXX, toWei('2.5'), toWei('0')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            crpPool.exitswapExternAmountOut(XXX, toWei('2.5'), MAX),
            'ERR_NOT_BOUND',
        );
    });

    it('tAo = exitswapPoolAmountIn(exitswapExternAmountOut(tAo))', async () => {
        // From Balancer Core
        const tAo = '1';
        const pAi = await crpPool.exitswapExternAmountOut.call(DAI, toWei(tAo), MAX);
        const calculatedtAo = await crpPool.exitswapPoolAmountIn.call(DAI, String(pAi), toWei('0'));

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
        const tAi = await crpPool.joinswapPoolAmountOut.call(WETH, toWei(String(pAo)), MAX);
        const calculatedPAo = await crpPool.joinswapExternAmountIn.call(WETH, String(tAi), toWei('0'));

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


    it('should exitpool', async () => {
        const bPoolAddr = await crpPool.bPool();
        const poolAmountIn = '99';

        let currentPoolBalance = await crpPool.balanceOf.call(admin);
        let previousbPoolXyzBalance = await xyz.balanceOf.call(bPoolAddr);
        let previousbPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
        let previousbPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
        currentPoolBalance = Decimal(fromWei(currentPoolBalance));
        previousbPoolXyzBalance = Decimal(fromWei(previousbPoolXyzBalance));
        previousbPoolWethBalance = Decimal(fromWei(previousbPoolWethBalance));
        previousbPoolDaiBalance = Decimal(fromWei(previousbPoolDaiBalance));
        const previousPoolBalance = Decimal(currentPoolBalance);

        await crpPool.exitPool(toWei(poolAmountIn), [toWei('0'), toWei('0'), toWei('0')]);

        currentPoolBalance = currentPoolBalance.sub(Decimal(poolAmountIn));

        const poolBalance = await crpPool.balanceOf.call(admin);
        const bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
        const bPoolWethBalance = await weth.balanceOf.call(bPoolAddr);
        const bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);

        // Balances of all tokens increase proportionally to the pool balance
        let balanceChange = (Decimal(poolAmountIn).div(previousPoolBalance)).mul(previousbPoolWethBalance);
        const currentWethBalance = previousbPoolWethBalance.sub(balanceChange);
        balanceChange = (Decimal(poolAmountIn).div(previousPoolBalance)).mul(previousbPoolDaiBalance);
        const currentDaiBalance = previousbPoolDaiBalance.sub(balanceChange);
        balanceChange = (Decimal(poolAmountIn).div(previousPoolBalance)).mul(previousbPoolXyzBalance);
        const currentXyzBalance = previousbPoolXyzBalance.sub(balanceChange);

        let relDif = calcRelativeDiff(currentXyzBalance, fromWei(bPoolXYZBalance));
        assert.isAtMost(relDif.toNumber(), errorDelta);
        relDif = calcRelativeDiff(currentDaiBalance, fromWei(bPoolDaiBalance));
        assert.isAtMost(relDif.toNumber(), errorDelta);
        relDif = calcRelativeDiff(currentWethBalance, fromWei(bPoolWethBalance));
        assert.isAtMost(relDif.toNumber(), errorDelta);
        assert.equal(fromWei(poolBalance), currentPoolBalance);
    });

    describe('PCToken interactions', () => {
        it('Token descriptors', async () => {
            const name = await crpPool.NAME();
            assert.equal(name, 'Balancer Smart Pool');

            const symbol = await crpPool.tokenSymbol();
            assert.equal(symbol, 'BSP');

            const decimals = await crpPool.DECIMALS();
            assert.equal(decimals, 18);
        });

        it('Token allowances', async () => {
            await crpPool.approve(user1, toWei('50'));
            let allowance = await crpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 50);

            await crpPool.increaseApproval(user1, toWei('50'));
            allowance = await crpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 100);

            await crpPool.decreaseApproval(user1, toWei('50'));
            allowance = await crpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 50);

            await crpPool.decreaseApproval(user1, toWei('100'));
            allowance = await crpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 0);
        });

        it('Token transfers', async () => {
            await truffleAssert.reverts(
                crpPool.transferFrom(user2, admin, toWei('10')),
                'ERR_PCTOKEN_BAD_CALLER',
            );

            await crpPool.transferFrom(admin, user2, toWei('1'));
            await crpPool.approve(user2, toWei('10'));
            await crpPool.transferFrom(admin, user2, toWei('1'), { from: user2 });
            await crpPool.transfer(admin, toWei('0.5'), { from: user2 });
        });
    });
});
