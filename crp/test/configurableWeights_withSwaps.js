const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');
const { calcOutGivenIn, calcRelativeDiff } = require('../lib/calc_comparisons');


contract('configurableWeights_withSwaps', async (accounts) => {
    const admin = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];

    const { toWei, fromWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);
    const errorDelta = 10 ** -8;

    const SYMBOL = 'BSP';
    const permissions = {
        canPauseSwapping: false,
        canChangeSwapFee: false,
        canChangeWeights: true,
        canAddRemoveTokens: true,
        canWhitelistLPs: false,
    };

    describe('Factory', () => {
        let bfactory;
        let factory;
        let controller;
        let CONTROLLER;
        let WETH;
        let XYZ;
        let weth;
        let dai;
        let xyz;
        let abc;
        const startWeights = [toWei('1'), toWei('39')];
        const startBalances = [toWei('80000'), toWei('40')];
        let blockRange;

        before(async () => {
            bfactory = await BFactory.deployed();
            factory = await CRPFactory.deployed();
            xyz = await TToken.new('XYZ', 'XYZ', 18);
            weth = await TToken.new('Wrapped Ether', 'WETH', 18);
            dai = await TToken.new('Dai Stablecoin', 'DAI', 18);
            abc = await TToken.new('ABC', 'ABC', 18);

            WETH = weth.address;
            XYZ = xyz.address;

            // admin balances
            await weth.mint(admin, toWei('100000000'));
            await dai.mint(admin, toWei('100000000'));
            await xyz.mint(admin, toWei('100000000'));
            await abc.mint(admin, toWei('100000000'));

            // user balances
            await weth.mint(user1, toWei('100000000'));
            await xyz.mint(user1, toWei('100000000'));
            await abc.mint(user1, toWei('100000000'));

            await weth.mint(user2, toWei('100000000'));
            await xyz.mint(user2, toWei('100000000'));
            await abc.mint(user2, toWei('100000000'));

            CONTROLLER = await factory.newCrp.call(
                bfactory.address,
                SYMBOL,
                [XYZ, WETH],
                startBalances,
                startWeights,
                10 ** 15, // swapFee
                permissions,
            );

            await factory.newCrp(
                bfactory.address,
                SYMBOL,
                [XYZ, WETH],
                startBalances,
                startWeights,
                10 ** 15, // swapFee
                permissions,
            );

            controller = await ConfigurableRightsPool.at(CONTROLLER);

            const CONTROLLER_ADDRESS = controller.address;

            // console.log(CONTROLLER_ADDRESS);

            await weth.approve(CONTROLLER_ADDRESS, MAX);
            await dai.approve(CONTROLLER_ADDRESS, MAX);
            await xyz.approve(CONTROLLER_ADDRESS, MAX);

            await controller.createPool(toWei('100'));
        });

        describe('configurableWeights / Swaps', () => {
            it('Controller should be able to call updateWeightsGradually() with valid range', async () => {
                blockRange = 20;
                // get current block number
                const block = await web3.eth.getBlock('latest');
                // console.log("Block of updateWeightsGradually() call: "+block.number)
                const startBlock = block.number + 3;
                const endBlock = startBlock + blockRange;
                const endWeights = [toWei('39'), toWei('1')];
                console.log(`Start block for June -> July flipping: ${startBlock}`);
                console.log(`End   block for June -> July flipping: ${endBlock}`);
                await controller.updateWeightsGradually(endWeights, startBlock, endBlock);
            });

            it('Should revert because too early to pokeWeights()', async () => {
                const block = await web3.eth.getBlock('latest');
                console.log(`Block: ${block.number}`);
                truffleAssert.reverts(
                    controller.pokeWeights(),
                    'ERR_CANT_POKE_YET',
                );
            });

            it('Should be able to pokeWeights()', async () => {
                let i;
                let weightXYZ;
                let weightWETH;
                let block;
                const bPoolAddr = await controller.bPool();
                const underlyingPool = await BPool.at(bPoolAddr);

                // Pool was created by CRP
                const owner = await underlyingPool.getController();
                assert.equal(owner, CONTROLLER);

                // By definition, underlying pool is not finalized
                const finalized = await underlyingPool.isFinalized();
                assert.isFalse(finalized);

                truffleAssert.reverts(
                    underlyingPool.finalize(), 'ERR_NOT_CONTROLLER',
                );

                const numTokens = await underlyingPool.getNumTokens();
                assert.equal(numTokens, 2);

                const poolTokens = await underlyingPool.getCurrentTokens();
                assert.equal(poolTokens[0], XYZ);
                assert.equal(poolTokens[1], WETH);

                // Enable swaps
                await xyz.approve(underlyingPool.address, MAX, { from: user1 });
                await weth.approve(underlyingPool.address, MAX, { from: user1 });
                let tokenIn;
                let tokenOut;
                let tokenInBalance;
                let tokenInWeight;
                let tokenOutBalance;
                let tokenOutWeight;
                let expectedTotalOut;
                let tokenAmountOut;
                let relDif;
                let swapAmount;

                const poolSwapFee = await underlyingPool.getSwapFee();

                for (i = 0; i < blockRange + 10; i++) {
                    weightXYZ = await controller.getDenormalizedWeight(XYZ);
                    weightWETH = await controller.getDenormalizedWeight(WETH);
                    block = await web3.eth.getBlock('latest');
                    console.log('Block: ' + block.number + '. Weights -> July: ' +
                        (weightXYZ*2.5/10**18).toString() + '%\tJune: ' +
                        (weightWETH*2.5/10**18).toString() + '%');
                    await controller.pokeWeights();

                    // Swap back and forth

                    if (i % 2 === 0) {
                        swapAmount = Math.floor((Math.random() * 10) + 1).toString();
                        console.log(`Swapping ${swapAmount} XYZ for WETH`);

                        tokenIn = XYZ;
                        tokenOut = WETH;

                        tokenInBalance = await xyz.balanceOf.call(underlyingPool.address);
                        tokenInWeight = await underlyingPool.getDenormalizedWeight(XYZ);
                        tokenOutBalance = await weth.balanceOf.call(underlyingPool.address);
                        tokenOutWeight = await underlyingPool.getDenormalizedWeight(WETH);

                        expectedTotalOut = calcOutGivenIn(
                            fromWei(tokenInBalance),
                            fromWei(tokenInWeight),
                            fromWei(tokenOutBalance),
                            fromWei(tokenOutWeight),
                            swapAmount,
                            fromWei(poolSwapFee),
                        );

                        tokenAmountOut = await underlyingPool.swapExactAmountIn.call(
                            tokenIn,
                            toWei(swapAmount), // tokenAmountIn
                            tokenOut,
                            toWei('0'), // minAmountOut
                            MAX,
                            { from: user1 },
                        );

                        relDif = calcRelativeDiff(expectedTotalOut, fromWei(tokenAmountOut[0]));
                        assert.isAtMost(relDif.toNumber(), errorDelta);
                    } else {
                        swapAmount = Math.floor((Math.random() * 10) + 1).toString();
                        console.log(`Swapping ${swapAmount} WETH for XYZ`);

                        tokenIn = WETH;
                        tokenOut = XYZ;

                        tokenInBalance = await weth.balanceOf.call(underlyingPool.address);
                        tokenInWeight = await underlyingPool.getDenormalizedWeight(WETH);
                        tokenOutBalance = await xyz.balanceOf.call(underlyingPool.address);
                        tokenOutWeight = await underlyingPool.getDenormalizedWeight(XYZ);

                        expectedTotalOut = calcOutGivenIn(
                            fromWei(tokenInBalance),
                            fromWei(tokenInWeight),
                            fromWei(tokenOutBalance),
                            fromWei(tokenOutWeight),
                            swapAmount,
                            fromWei(poolSwapFee),
                        );

                        tokenAmountOut = await underlyingPool.swapExactAmountIn.call(
                            tokenIn,
                            toWei(swapAmount), // tokenAmountIn
                            tokenOut,
                            toWei('0'), // minAmountOut
                            MAX,
                            { from: user1 },
                        );

                        relDif = calcRelativeDiff(expectedTotalOut, fromWei(tokenAmountOut[0]));
                        assert.isAtMost(relDif.toNumber(), errorDelta);
                    }
                }
            });
        });
    });
});
