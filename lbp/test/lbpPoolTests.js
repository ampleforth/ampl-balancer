const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const LiquidityBootstrappingPool = artifacts.require('LiquidityBootstrappingPool');
const LBPFactory = artifacts.require('LBPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');
const Decimal = require('decimal.js');
const { calcRelativeDiff } = require('../lib/calc_comparisons');

const verbose = process.env.VERBOSE;

contract('LBPFactory', async (accounts) => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const { toWei, fromWei } = web3.utils;
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const MAX = web3.utils.toTwosComplement(-1);
    const errorDelta = 10 ** -8;

    let lbpFactory;
    let bFactory;
    let lbpPool;
    let bPool;
    let LBPPOOL;
    let LBPPOOL_ADDRESS;
    let WETH;
    let DAI;
    let XYZ;
    let weth;
    let dai;
    let xyz;
    const startBalances = [toWei('800000'), toWei('800')];
    const startWeights = [toWei('8'), toWei('2')];
    const endWeights = [toWei('2'), toWei('8')];
    const swapFee = toWei('0.003');
    const params = [10, 1000, swapFee]; // startBlock, endBlock, swapFee

    before(async () => {
        bFactory = await BFactory.deployed();
        lbpFactory = await LBPFactory.deployed();
        xyz = await TToken.new('XYZ', 'XYZ', 18);
        weth = await TToken.new('Wrapped Ether', 'WETH', 18);
        dai = await TToken.new('Dai Stablecoin', 'DAI', 18);

        WETH = weth.address;
        DAI = dai.address;
        XYZ = xyz.address;

        // admin balances
        await weth.mint(admin, toWei('100'));
        await dai.mint(admin, toWei('900'));
        await xyz.mint(admin, toWei('900000'));

        const tokenAddresses = [XYZ, DAI];

        LBPPOOL = await lbpFactory.newLbp.call(
            bFactory.address,
            tokenAddresses,
            startBalances,
            startWeights,
            endWeights,
            params,
        );

        await lbpFactory.newLbp(
            bFactory.address,
            tokenAddresses,
            startBalances,
            startWeights,
            endWeights,
            params,
        );

        lbpPool = await LiquidityBootstrappingPool.at(LBPPOOL);

        LBPPOOL_ADDRESS = lbpPool.address;

        await weth.approve(LBPPOOL_ADDRESS, MAX);
        await dai.approve(LBPPOOL_ADDRESS, MAX);
        await xyz.approve(LBPPOOL_ADDRESS, MAX);
    });

    it('lbpPool should have no BPool before creation', async () => {
        const bPoolAddr = await lbpPool.bPool();
        assert.equal(bPoolAddr, ZERO_ADDRESS);
    });

    it('JoinPool should revert before creation', async () => {
        await truffleAssert.reverts(
            lbpPool.joinPool(toWei('1000')),
            'ERR_NOT_CREATED',
        );
    });

    it('Fails calling any join exit swap before creation', async () => {
        await truffleAssert.reverts(
            lbpPool.joinswapExternAmountIn(DAI, toWei('2.5')),
            'ERR_NOT_CREATED',
        );

        await truffleAssert.reverts(
            lbpPool.joinswapPoolAmountOut(DAI, toWei('2.5')),
            'ERR_NOT_CREATED',
        );
        await truffleAssert.reverts(
            lbpPool.exitswapPoolAmountIn(DAI, toWei('2.5')),
            'ERR_NOT_CREATED',
        );
        await truffleAssert.reverts(
            lbpPool.exitswapExternAmountOut(DAI, toWei('2.5')),
            'ERR_NOT_CREATED',
        );
    });

    it('lbpPool should have admin account as controller', async () => {
        const controllerAddr = await lbpPool.getController.call();
        assert.equal(controllerAddr, admin);
    });

    it('Admin should have no initial BPT', async () => {
        const adminBPTBalance = await lbpPool.balanceOf.call(admin);
        assert.equal(adminBPTBalance, toWei('0'));
    });

    it('lbpPool should not createPool with 0 BPT Initial Supply', async () => {
        await truffleAssert.reverts(
            lbpPool.createPool(toWei('0')),
            'ERR_INIT_SUPPLY',
        );
    });

    it('lbpPool should have a BPool after creation', async () => {
        await lbpPool.createPool(toWei('100'));
        const bPoolAddr = await lbpPool.bPool();
        assert.notEqual(bPoolAddr, ZERO_ADDRESS);
        bPool = await BPool.at(bPoolAddr);
    });

    it('should not be able to createPool twice', async () => {
        await truffleAssert.reverts(
            lbpPool.createPool(toWei('100')),
            'ERR_IS_CREATED',
        );
    });

    it('BPool should have matching swap fee', async () => {
        const deployedSwapFee = await bPool.getSwapFee();
        assert.equal(swapFee, deployedSwapFee);
    });

    it('BPool should not have public swaps enabled', async () => {
        const isPublicSwap = await bPool.isPublicSwap();
        assert.equal(isPublicSwap, false);
    });

    it('BPool should have initial token balances', async () => {
        const bPoolAddr = await lbpPool.bPool();

        const adminXYZBalance = await xyz.balanceOf.call(admin);
        const bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
        const adminDaiBalance = await dai.balanceOf.call(admin);
        const bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);

        assert.equal(adminXYZBalance, toWei('100000'));
        assert.equal(bPoolXYZBalance, toWei('800000'));
        assert.equal(adminDaiBalance, toWei('100'));
        assert.equal(bPoolDaiBalance, toWei('800'));
    });

    it('BPool should have initial token weights', async () => {
        const xyzWeight = await bPool.getDenormalizedWeight.call(xyz.address);
        const daiWeight = await bPool.getDenormalizedWeight.call(dai.address);

        assert.equal(xyzWeight, toWei('8'));
        assert.equal(daiWeight, toWei('2'));
    });

    it('Admin should have initial BPT', async () => {
        const adminBPTBalance = await lbpPool.balanceOf.call(admin);
        assert.equal(adminBPTBalance, toWei('100'));
    });

    it('JoinPool should not revert if smart pool', async () => {
        const bPoolAddr = await lbpPool.bPool();
        let currentPoolBalance = await lbpPool.balanceOf.call(admin);
        currentPoolBalance = Decimal(fromWei(currentPoolBalance));
        const previousPoolBalance = currentPoolBalance;
        let previousbPoolXyzBalance = await xyz.balanceOf.call(bPoolAddr);
        let previousbPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
        previousbPoolXyzBalance = Decimal(fromWei(previousbPoolXyzBalance));
        previousbPoolDaiBalance = Decimal(fromWei(previousbPoolDaiBalance));

        const poolAmountOut = '1';
        await lbpPool.joinPool(toWei(poolAmountOut));

        currentPoolBalance = currentPoolBalance.add(Decimal(poolAmountOut));

        const balance = await lbpPool.balanceOf.call(admin);
        const bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
        const bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);

        // Balances of all tokens increase proportionally to the pool balance
        let balanceChange = (Decimal(poolAmountOut).div(previousPoolBalance)).mul(previousbPoolDaiBalance);
        const currentDaiBalance = previousbPoolDaiBalance.add(balanceChange);
        balanceChange = (Decimal(poolAmountOut).div(previousPoolBalance)).mul(previousbPoolXyzBalance);
        const currentXyzBalance = previousbPoolXyzBalance.add(balanceChange);

        assert.equal(fromWei(balance), currentPoolBalance);
        assert.equal(bPoolXYZBalance, toWei(String(currentXyzBalance)));
        assert.equal(bPoolDaiBalance, toWei(String(currentDaiBalance)));
    });

    it('JoinPool should revert if user does not have allowance to join pool', async () => {
        await truffleAssert.reverts(
            lbpPool.joinPool(toWei('1'), { from: user1 }),
            'ERR_BTOKEN_BAD_CALLER',
        );
    });

    it('Fails calling any swap on unbound token', async () => {
        await truffleAssert.reverts(
            lbpPool.joinswapExternAmountIn(WETH, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            lbpPool.joinswapPoolAmountOut(WETH, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            lbpPool.exitswapPoolAmountIn(WETH, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
        await truffleAssert.reverts(
            lbpPool.exitswapExternAmountOut(WETH, toWei('2.5')),
            'ERR_NOT_BOUND',
        );
    });

    it('tAo = exitswapPoolAmountIn(exitswapExternAmountOut(tAo))', async () => {
        // From Balancer Core
        const tAo = '1';
        const pAi = await lbpPool.exitswapExternAmountOut.call(DAI, toWei(tAo));
        const calculatedtAo = await lbpPool.exitswapPoolAmountIn.call(DAI, String(pAi));

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
        const tAi = await lbpPool.joinswapPoolAmountOut.call(XYZ, toWei(String(pAo)));
        const calculatedPAo = await lbpPool.joinswapExternAmountIn.call(XYZ, String(tAi));

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
        const bPoolAddr = await lbpPool.bPool();
        const poolAmountIn = '99';

        let currentPoolBalance = await lbpPool.balanceOf.call(admin);
        let previousbPoolXyzBalance = await xyz.balanceOf.call(bPoolAddr);
        let previousbPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);
        currentPoolBalance = Decimal(fromWei(currentPoolBalance));
        previousbPoolXyzBalance = Decimal(fromWei(previousbPoolXyzBalance));
        previousbPoolDaiBalance = Decimal(fromWei(previousbPoolDaiBalance));
        const previousPoolBalance = Decimal(currentPoolBalance);

        await lbpPool.exitPool(toWei(poolAmountIn));

        currentPoolBalance = currentPoolBalance.sub(Decimal(poolAmountIn));

        const poolBalance = await lbpPool.balanceOf.call(admin);
        const bPoolXYZBalance = await xyz.balanceOf.call(bPoolAddr);
        const bPoolDaiBalance = await dai.balanceOf.call(bPoolAddr);

        // Balances of all tokens increase proportionally to the pool balance
        let balanceChange = (Decimal(poolAmountIn).div(previousPoolBalance)).mul(previousbPoolDaiBalance);
        const currentDaiBalance = previousbPoolDaiBalance.sub(balanceChange);
        balanceChange = (Decimal(poolAmountIn).div(previousPoolBalance)).mul(previousbPoolXyzBalance);
        const currentXyzBalance = previousbPoolXyzBalance.sub(balanceChange);

        let relDif = calcRelativeDiff(currentXyzBalance, fromWei(bPoolXYZBalance));
        assert.isAtMost(relDif.toNumber(), errorDelta);
        relDif = calcRelativeDiff(currentDaiBalance, fromWei(bPoolDaiBalance));
        assert.isAtMost(relDif.toNumber(), errorDelta);
        assert.equal(fromWei(poolBalance), currentPoolBalance);
    });

    describe('PCToken interactions', () => {
        it('Token descriptors', async () => {
            const name = await lbpPool.NAME();
            assert.equal(name, 'Balancer Smart Pool');

            const symbol = await lbpPool.SYMBOL();
            assert.equal(symbol, 'BSP');

            const decimals = await lbpPool.DECIMALS();
            assert.equal(decimals, 18);
        });

        it('Token allowances', async () => {
            await lbpPool.approve(user1, toWei('50'));
            let allowance = await lbpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 50);

            await lbpPool.increaseApproval(user1, toWei('50'));
            allowance = await lbpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 100);

            await lbpPool.decreaseApproval(user1, toWei('50'));
            allowance = await lbpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 50);

            await lbpPool.decreaseApproval(user1, toWei('100'));
            allowance = await lbpPool.allowance(admin, user1);
            assert.equal(fromWei(allowance), 0);
        });

        it('Token transfers', async () => {
            await truffleAssert.reverts(
                lbpPool.transferFrom(user2, admin, toWei('10')),
                'ERR_PCTOKEN_BAD_CALLER',
            );

            await lbpPool.transferFrom(admin, user2, toWei('1'));
            await lbpPool.approve(user2, toWei('10'));
            await lbpPool.transferFrom(admin, user2, toWei('1'), { from: user2 });
            await lbpPool.transfer(admin, toWei('0.5'), { from: user2 });
        });
    });

    // Get params, etc
});
