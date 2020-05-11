const BFactory = artifacts.require('BFactory');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');

contract('CRPFactory', async (accounts) => {
    const admin = accounts[0];
    const { toWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);

    let crpFactory;
    let bFactory;
    let crpPool;
    let CRPPOOL;
    let CRPPOOL_ADDRESS;
    let WETH;
    let DAI;
    let XYZ;
    let weth;
    let dai;
    let xyz;
    const startWeights = [toWei('12'), toWei('1.5'), toWei('1.5')];
    const startBalances = [toWei('80000'), toWei('40'), toWei('10000')];
    const addTokenTimeLockInBLocks = 10;

    before(async () => {
        bFactory = await BFactory.deployed();
        crpFactory = await CRPFactory.deployed();
        xyz = await TToken.new('XYZ', 'XYZ', 18);
        weth = await TToken.new('Wrapped Ether', 'WETH', 18);
        dai = await TToken.new('Dai Stablecoin', 'DAI', 18);

        WETH = weth.address;
        DAI = dai.address;
        XYZ = xyz.address;

        // admin balances
        await weth.mint(admin, toWei('100'));
        await dai.mint(admin, toWei('15000'));
        await xyz.mint(admin, toWei('100000'));

        CRPPOOL = await crpFactory.newCrp.call(
            bFactory.address,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            10 ** 15, // swapFee
            10, // minimumWeightChangeBlockPeriod
            addTokenTimeLockInBLocks, // addTokenTimeLockInBLocks
            [false, false, false, true],
            // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
        );

        await crpFactory.newCrp(
            bFactory.address,
            [XYZ, WETH, DAI],
            startBalances,
            startWeights,
            10 ** 15, // swapFee
            10, // minimumWeightChangeBlockPeriod
            addTokenTimeLockInBLocks, // addTokenTimeLockInBLocks
            [false, false, false, true],
            // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
        );

        crpPool = await ConfigurableRightsPool.at(CRPPOOL);

        CRPPOOL_ADDRESS = crpPool.address;

        await weth.approve(CRPPOOL_ADDRESS, MAX);
        await dai.approve(CRPPOOL_ADDRESS, MAX);
        await xyz.approve(CRPPOOL_ADDRESS, MAX);

        await crpPool.createPool(toWei('100'));
    });

    it('CRPFactory should have new crpPool registered', async () => {
        console.log(CRPPOOL_ADDRESS);
        const isPoolRegistered = await crpFactory.isCrp(CRPPOOL_ADDRESS);

        assert.equal(isPoolRegistered, true, `Expected ${CRPPOOL_ADDRESS} to be registered.`);
    });

    it('CRPFactory should not have random address registered', async () => {
        const isPoolRegistered = await crpFactory.isCrp(WETH);
        assert.equal(isPoolRegistered, false, 'Expected not to be registered.');
    });

    // ?????? Check for controller?
});
