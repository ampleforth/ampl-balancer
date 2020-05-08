const BFactory = artifacts.require('BFactory');
const BPool = artifacts.require('BPool');
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool');
const CRPFactory = artifacts.require('CRPFactory');
const TToken = artifacts.require('TToken');
const truffleAssert = require('truffle-assertions');

contract('pausableSwap', async (accounts) => {
    const admin = accounts[0];
    const nonAdmin = accounts[1];
    const { toWei } = web3.utils;
    const { fromWei } = web3.utils;
    const MAX = web3.utils.toTwosComplement(-1);

    let crpFactory, bFactory;
    let crpPool;
    let CRPPOOL;
    let WETH, DAI, XYZ, ABC;
    let weth, dai, xyz, abc;

    // These are the intial settings for newCrp:
    const swapFee = 10**15;
    let startingXyzWeight = '12';
    let startingWethWeight = '1.5';
    let startingDaiWeight = '1.5';
    const startWeights = [toWei(startingXyzWeight), toWei(startingWethWeight), toWei(startingDaiWeight)];
    const startBalances = [toWei('80000'), toWei('40'), toWei('10000')];
    const addTokenTimeLockInBLocks = 10;
    const minimumWeightChangeBlockPeriod = 10;
    const permissions = [true, false, false, false] // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens


    before(async () => {
        /*
        Uses deployed BFactory & CRPFactory.
        Deploys new test tokens - XYZ, WETH, DAI, ABC, ASD
        Mints test tokens for Admin user (account[0])
        CRPFactory creates new CRP.
        Admin approves CRP for MAX
        newCrp call with pausableSwap set to true
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

    it('ConfigurableRightsPool isPublicSwap should be true after creation', async () => {
      const _bPool = await crpPool._bPool();
      const bPool = await BPool.at(_bPool);
      const isPublicSwap = await bPool.isPublicSwap.call();
      assert.equal(isPublicSwap, true);
    })

    it('Set public swap should revert for non-controller', async () => {
        await truffleAssert.reverts(
          crpPool.setPublicSwap(false, {from: accounts[1]}),
          'ERR_NOT_CONTROLLER',
        );
    });

    it('Controller should be able to pause trades', async () => {
      const _bPool = await crpPool._bPool();
      const bPool = await BPool.at(_bPool);

      await crpPool.setPublicSwap(false);

      const isPublicSwap = await bPool.isPublicSwap.call();
      assert.equal(isPublicSwap, false);
    })

    it('Non-controller should not be able to restart trades', async () => {
        await truffleAssert.reverts(
          crpPool.setPublicSwap(true, {from: accounts[1]}),
          'ERR_NOT_CONTROLLER',
        );
    });

    it('Controller should be able to restart trades', async () => {
      const _bPool = await crpPool._bPool();
      const bPool = await BPool.at(_bPool);

      await crpPool.setPublicSwap(true);

      const isPublicSwap = await bPool.isPublicSwap.call();
      assert.equal(isPublicSwap, true);
    })

    it('Controller should not be able to change swapFee', async () => {
        await truffleAssert.reverts(
              crpPool.setSwapFee(toWei('1')),
              'ERR_NOT_CONFIGURABLE_SWAP_FEE',
        );
    });

    it('Set swap fee should revert because non-permissioned', async () => {
        await truffleAssert.reverts(
          crpPool.setSwapFee(toWei('0.01')),
          'ERR_NOT_CONFIGURABLE_SWAP_FEE',
        );
    });

    it('Remove token should revert because non-permissioned', async () => {
        await truffleAssert.reverts(
          crpPool.removeToken(DAI),
          'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
        );
    });

    it('Commit add token should revert because non-permissioned', async () => {
        await truffleAssert.reverts(
          crpPool.commitAddToken(DAI, toWei('150000'), toWei('1.5')),
          'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
        );
    });

    it('Apply add token should revert because non-permissioned', async () => {
        await truffleAssert.reverts(
          crpPool.applyAddToken(),
          'ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS',
        );
    });

    it('Configurable weight should revert because non-permissioned', async () => {
        await truffleAssert.reverts(
          crpPool.updateWeight(xyz.address, toWei('13')),
          'ERR_NOT_CONFIGURABLE_WEIGHTS',
        );

        const block = await web3.eth.getBlock("latest");

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
