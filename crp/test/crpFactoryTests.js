const BFactory = artifacts.require('BFactory');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');

contract('CRPFactory', async (accounts) => {
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

    it(`CRPFactory should have new crpPool registered`, async () => {
        console.log(CRPPOOL_ADDRESS)
        let isPoolRegistered = await crpFactory.isCrp(CRPPOOL_ADDRESS);

        assert.equal(isPoolRegistered, true, `Expected ` + CRPPOOL_ADDRESS + ` to be registered.`)
    });

    it(`CRPFactory should not have random address registered`, async () => {
        let isPoolRegistered = await crpFactory.isCrp(WETH);
        assert.equal(isPoolRegistered, false, `Expected not to be registered.`)
    });

    // ?????? Check for controller?
});
