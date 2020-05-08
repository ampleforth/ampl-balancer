const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');

contract('configurableSwapFee', async (accounts) => {
    const admin = accounts[0];
    const { toWei } = web3.utils;

    const MAX = web3.utils.toTwosComplement(-1);

    let crpFactory; let
        bFactory;
    let crpPool;
    let CRPPOOL;
    let WETH; let DAI; let XYZ; let
        ABC;
    let weth; let dai; let abc; let
        xyz;

    // These are the intial settings for newCrp:
    const swapFee = 10 ** 15;
    const startWeights = [toWei('12'), toWei('1.5'), toWei('1.5')];
    const startBalances = [toWei('80000'), toWei('40'), toWei('10000')];
    const addTokenTimeLockInBLocks = 10;
    const minimumWeightChangeBlockPeriod = 10;
    // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
    const permissions = [false, true, false, false];

    before(async () => {
        /*
        Uses deployed BFactory & CRPFactory.
        Deploys new test tokens - XYZ, WETH, DAI, ABC, ASD
        Mints test tokens for Admin user (account[0])
        CRPFactory creates new CRP.
        Admin approves CRP for MAX
        newCrp call with configurableSwapFee set to true
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

        CRPPOOL = await crpFactory.newCrp.call(
            bFactory.address,
            tokenAddresses,
            startBalances,
            startWeights,
            swapFee,
            minimumWeightChangeBlockPeriod,
            addTokenTimeLockInBLocks,
            permissions,
        );

        await crpFactory.newCrp(
            bFactory.address,
            tokenAddresses,
            startBalances,
            startWeights,
            swapFee,
            minimumWeightChangeBlockPeriod,
            addTokenTimeLockInBLocks,
            permissions,
        );

        crpPool = await ConfigurableRightsPool.at(CRPPOOL);

        const CRPPOOL_ADDRESS = crpPool.address;

        await weth.approve(CRPPOOL_ADDRESS, MAX);
        await dai.approve(CRPPOOL_ADDRESS, MAX);
        await xyz.approve(CRPPOOL_ADDRESS, MAX);

        await crpPool.createPool();
    });

    it('Non Controller account should not be able to change swapFee', async () => {
        await truffleAssert.reverts(
            crpPool.setSwapFee(toWei('0.001'), { from: accounts[1] }),
            'ERR_NOT_CONTROLLER',
        );
    });

    it('Controller should be able to change swapFee', async () => {
        const bPoolAddr = await crpPool.bPool();
        const bPool = await BPool.at(bPoolAddr);

        const deployedSwapFee = await bPool.getSwapFee();
        assert.equal(swapFee, deployedSwapFee);

        const newSwapFee = toWei('0.001');
        await crpPool.setSwapFee(newSwapFee);

        const newSwapFeeCheck = await bPool.getSwapFee();
        assert.equal(newSwapFee, newSwapFeeCheck);
    });

    it('Configurable tokens should revert because non-permissioned', async () => {
        truffleAssert.reverts(
            crpPool.commitAddToken(ABC, toWei('1'), toWei('1')),
            'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
        );

        truffleAssert.reverts(
            crpPool.applyAddToken(),
            'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
        );

        truffleAssert.reverts(
            crpPool.removeToken(WETH),
            'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
        );
    });

    it('Set public swap should revert because non-permissioned', async () => {
        await truffleAssert.reverts(
            crpPool.setPublicSwap(false),
            'ERR_NOT_PAUSABLE_SWAP',
        );
    });

    it('Configurable weight should revert because non-permissioned', async () => {
        await truffleAssert.reverts(
            crpPool.updateWeight(xyz.address, toWei('13')),
            'ERR_NOT_CONFIGURABLE_WEIGHTS',
        );

        const block = await web3.eth.getBlock('latest');

        await truffleAssert.reverts(
            crpPool.updateWeightsGradually([toWei('2'), toWei('5'), toWei('5')], block.number, block.number + 10),
            'ERR_NOT_CONFIGURABLE_WEIGHTS',
        );

        await truffleAssert.reverts(
            crpPool.pokeWeights(),
            'ERR_NOT_CONFIGURABLE_WEIGHTS',
        );
    });
});
