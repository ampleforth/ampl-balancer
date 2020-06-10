const BFactory = artifacts.require('BFactory');
const LiquidityBootstrappingPool = artifacts.require('LiquidityBootstrappingPool');
const LBPFactory = artifacts.require('LBPFactory');
const TToken = artifacts.require('TToken');

contract('LBPFactory', async (accounts) => {
    const admin = accounts[0];
    const { toWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);

    let lbpFactory;
    let bFactory;
    let lbpPool;
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
    const params = [10, 1000, toWei('0.03')]; // startBlock, endBlock, swapFee

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
        await dai.mint(admin, toWei('800'));
        await xyz.mint(admin, toWei('800000'));

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

        await lbpPool.createPool(toWei('100'));
    });

    it('LBPFactory should have new lbpPool registered', async () => {
        const isPoolRegistered = await lbpFactory.isLbp(LBPPOOL_ADDRESS);
        assert.equal(isPoolRegistered, true, `Expected ${LBPPOOL_ADDRESS} to be registered.`);
    });

    it('LBPFactory should not have random address registered', async () => {
        const isPoolRegistered = await lbpFactory.isLbp(WETH);
        assert.equal(isPoolRegistered, false, 'Expected not to be registered.');
    });
});
