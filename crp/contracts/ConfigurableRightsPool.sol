// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.5.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

// Imports

import "./IBFactory.sol";
import "./PCToken.sol";
import "./utils/BalancerReentrancyGuard.sol";
import "./utils/BalancerOwnable.sol";

// Interfaces

// Libraries
import { RightsManager } from "../libraries/RightsManager.sol";
import "../libraries/SmartPoolManager.sol";
import "../libraries/BalancerSafeMath.sol";

// Contracts

/**
 * @author Balancer Labs
 * @title Smart Pool with customizable features
 * @notice PCToken is the "Balancer Smart Pool" token (transferred upon finalization)
 * @dev Rights are defined as follows (index values into the array)
 *      0: canPauseSwapping - can setPublicSwap back to false after turning it on
 *                            by default, it is off on initialization and can only be turned on
 *      1: canChangeSwapFee - can setSwapFee after initialization (by default, it is fixed at create time)
 *      2: canChangeWeights - can bind new token weights (allowed by default in base pool)
 *      3: canAddRemoveTokens - can bind/unbind tokens (allowed by default in base pool)
 */
contract ConfigurableRightsPool is PCToken, BalancerOwnable, BalancerReentrancyGuard {
    using BalancerSafeMath for uint;

    // State variables

    IBFactory public bFactory;
    IBPool public bPool;

    // Struct holding the rights configuration
    RightsManager.Rights private _rights;

    // This is for adding a new (currently unbound) token to the pool
    // It's a two-step process: commitAddToken(), then applyAddToken()
    SmartPoolManager.NewToken private _newToken;

    // Fee is initialized on creation, and can be changed if permission is set
    uint private _swapFee;

    // Store the list of tokens in the pool, and balances
    address[] private _tokens;
    uint[] private _startBalances;

    // For blockwise, automated weight updates
    // Move weights linearly from _startWeights to _newWeights,
    // between _startBlock and _endBlock
    uint private _startBlock;
    uint private _endBlock;
    uint[] private _startWeights;
    uint[] private _newWeights;

    // Enforce a minimum time between the start and end blocks
    uint private _minimumWeightChangeBlockPeriod;
    // Enforce a mandatory wait time between updates
    // This is also the wait time between committing and applying a new token
    uint private _addTokenTimeLockInBlocks;

    // Whitelist of LPs (if configured)
    mapping(address => bool) private _liquidityProviderWhitelist;

    // Event declarations

    // Anonymous logger event - can only be filtered by contract address

    event LOG_CALL(
        bytes4  indexed sig,
        address indexed caller,
        bytes data
    ) anonymous;

    event LOG_JOIN(
        address indexed caller,
        address indexed tokenIn,
        uint tokenAmountIn
    );

    event LOG_EXIT(
        address indexed caller,
        address indexed tokenOut,
        uint tokenAmountOut
    );

    // Modifiers

    modifier _logs_() {
        emit LOG_CALL(msg.sig, msg.sender, msg.data);
        _;
    }

    // Mark functions that require delegation to the underlying Pool
    modifier _needsBPool_() {
        require(address(bPool) != address(0), "ERR_NOT_CREATED");
        _;
    }

    // Default values for these (cannot pass them into the constructor; stack too deep)
    // They are not needed until updateWeightsGradually, so just pass them in there
    uint public constant DEFAULT_MIN_WEIGHT_CHANGE_BLOCK_PERIOD = 10;
    uint public constant DEFAULT_ADD_TOKEN_TIME_LOCK_IN_BLOCKS = 10;

    // Function declarations

    /**
     * @notice Construct a new Configurable Rights Pool (wrapper around BPool)
     * @param factoryAddress - the BPoolFactory used to create the underlying pool
     * @param symbol - Token symbol
     * @param tokens - list of tokens to include
     * @param startBalances - initial token balances
     * @param startWeights - initial token weights
     * @param swapFee - initial swap fee (will set on the core pool after pool creation)
     * @param rights - Set of permissions we are assigning to this smart pool
     *                 Would ideally not want to hard-code the length, but not sure how it interacts with structures
     */
    constructor(
        address factoryAddress,
        string memory symbol,
        address[] memory tokens,
        uint[] memory startBalances,
        uint[] memory startWeights,
        uint swapFee,
        RightsManager.Rights memory rights
    )
        public
        PCToken(symbol)
    {
        require(tokens.length >= MIN_ASSET_LIMIT, "ERR_TOO_FEW_TOKENS");

        // Arrays must be parallel
        require(startBalances.length == tokens.length, "ERR_START_BALANCES_MISMATCH");
        require(startWeights.length == tokens.length, "ERR_START_WEIGHTS_MISMATCH");

        // We don't have a pool yet; check now or it will fail later
        // (and be unrecoverable if they don't have permission set to change it)
        require(swapFee >= MIN_FEE, "ERR_INVALID_SWAP_FEE");
        require(swapFee <= MAX_FEE, "ERR_INVALID_SWAP_FEE");

        bFactory = IBFactory(factoryAddress);
        _tokens = tokens;
        _startBalances = startBalances;
        _startWeights = startWeights;
        _swapFee = swapFee;
        _minimumWeightChangeBlockPeriod = DEFAULT_MIN_WEIGHT_CHANGE_BLOCK_PERIOD;
        _addTokenTimeLockInBlocks = DEFAULT_ADD_TOKEN_TIME_LOCK_IN_BLOCKS;
        _rights = rights;
    }

    // External functions

    /**
     * @notice Getter for specific permissions
     * @dev value of the enum is just the 0-based index in the enumeration
     *      For instance canPauseSwapping is 0; canChangeWeights is 2
     * @return token boolean true if we have the given permission
    */
    function hasPermission(RightsManager.Permissions _permission)
        external
        view
        returns(bool)
    {
        return RightsManager.hasPermission(_rights, _permission);
    }

    /**
     * @notice Get the denormalized weight of a token
     * @dev _viewlock_ to prevent calling if it's being updated
     * @return token weight
     */
    function getDenormalizedWeight(address token)
        external
        view
        _viewlock_
        _needsBPool_
        returns (uint)
    {
        return bPool.getDenormalizedWeight(token);
    }

    /**
     * @notice Set the swap fee on the underlying pool
     * @dev Keep the local version and core in sync (see below)
     * @param swapFee in Wei
     */
    function setSwapFee(uint swapFee)
        external
        _logs_
        _lock_
        _onlyOwner_
        _needsBPool_
    {
        require(_rights.canChangeSwapFee, "ERR_NOT_CONFIGURABLE_SWAP_FEE");

        // Also need to set the local variable, because it is accessed directly
        // in the wrapped pool functions, and so could get out of sync with core
        //
        // Probably best practice to read from the core pool instead of using this
        // again, but setting it is defensive programming
        // The alternative is to not have this "pending swap fee" at all, but set it
        // to the default on creation, and they can only change it with permission
        //
        // (That would lose the functionality of setting a fixed fee different from the
        // default, though.)
        _swapFee = swapFee;

        bPool.setSwapFee(swapFee);
    }

    /**
     * @notice Getter for the publicSwap field on the underlying pool
     * @dev nonReentrantView, because setPublicSwap is nonReentrant
     * @return Current value of isPublicSwap
     */
    function isPublicSwap()
        external
        _logs_
        _lock_
        _needsBPool_
        returns (bool)
    {
        return bPool.isPublicSwap();
    }

    /**
     * @notice Set the public swap flag on the underlying pool
     * @dev If this smart pool has canPauseSwapping enabled, we can turn publicSwap off if it's already on
     *      Note that if they turn swapping off - but then finalize the pool - finalizing will turn the
     *      swapping back on. They're not supposed to finalize the underlying pool... would defeat the
     *      smart pool functions. (Only the owner can finalize the final pool, at least.)
     * @param publicSwap new value of the swap
     */
    function setPublicSwap(bool publicSwap)
        external
        _logs_
        _lock_
        _onlyOwner_
        _needsBPool_
    {
        require(_rights.canPauseSwapping, "ERR_NOT_PAUSABLE_SWAP");

        bPool.setPublicSwap(publicSwap);
    }

    /**
     * @notice Create a new Smart Pool
     * @dev Initialize the swap fee to the value provided in the CRP constructor
     *      Can be changed if the canChangeSwapFee permission is enabled
     * @param initialSupply starting token balance
     */
    function createPool(uint initialSupply)
        external
        _logs_
        _lock_
        returns (ConfigurableRightsPool)
    {
        require(address(bPool) == address(0), "ERR_IS_CREATED");
        require(block.number >= _startBlock, "ERR_START_BLOCK");
        require(initialSupply > 0, "ERR_INIT_SUPPLY");

        // Deploy new BPool
        bPool = bFactory.newBPool();

        // Set fee to the initial value set in the constructor
        bPool.setSwapFee(_swapFee);

        for (uint i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint bal = _startBalances[i];
            uint denorm = _startWeights[i];

            bool xfer = IERC20(t).transferFrom(msg.sender, address(this), bal);
            require(xfer, "ERR_ERC20_FALSE");

            IERC20(t).approve(address(bPool), uint(-1));
            // Note that this will actually duplicate the array of tokens
            //   This contract has _tokens, and so does the underlying pool
            // Binding pushes a token to the end of the underlying pool's array
            bPool.bind(t, bal, denorm);
        }

        // Do "finalize" things, but can't call bPool.finalize(), or it wouldn't let us rebind or do any
        // adjustments. The underlying pool has to remain unfinalized, but we want to mint the tokens
        // immediately. This is how a CRP differs from base Pool. Base Pool tokens are issued on finalize;
        // CRP pool tokens are issued on create.
        //
        // We really don't need a "CRP level" finalize. It is considered "finalized" on creation.
        // The underlying pool is never finalized. So it is sufficient just to check that the pool exists,
        // and you can join it.
        bPool.setPublicSwap(true);

        _mintPoolShare(initialSupply);
        _pushPoolShare(msg.sender, initialSupply);
    }

    /**
     * @notice Update the weight of an existing token
     * @dev Notice Balance is not an input (like with rebind on BPool) since we will require prices not to change
     *      This is achieved by forcing balances to change proportionally to weights, so that prices don't change
     *      If prices could be changed, this would allow the controller to drain the pool by arbing price changes
     * @param token - token to be reweighted
     * @param newWeight - new weight of the token
    */
    function updateWeight(address token, uint newWeight)
        external
        _logs_
        _lock_
        _onlyOwner_
        _needsBPool_
    {
        require(_rights.canChangeWeights, "ERR_NOT_CONFIGURABLE_WEIGHTS");

        // We don't want people to set weights manually if there's a block-based update in progress
        require(_startBlock == 0, "ERR_NO_UPDATE_DURING_GRADUAL");

        // Delegate to library to save space
        SmartPoolManager.updateWeight(this, bPool, token, newWeight);
    }

    /**
     * @notice Update weights in a predetermined way, between startBlock and endBlock,
     *         through external cals to pokeWeights
     * @dev Makes sure we aren't already in a weight update scheme
     *      Must call pokeWeights at least once past the end for it to do the final update
     *      and enable calling this again. (Could make this check for that case, but unwarranted complexity.)
     * @param newWeights - final weights we want to get to
     * @param startBlock - when weights should start to change
     * @param endBlock - when weights will be at their final values
     * Should we even be able to override these? Too low level?
     * @param minimumWeightChangeBlockPeriod - can override default value
     * @param addTokenTimeLockInBlocks - can override default value
    */
    function updateWeightsGradually(
        uint[] calldata newWeights,
        uint startBlock,
        uint endBlock,
        uint minimumWeightChangeBlockPeriod,
        uint addTokenTimeLockInBlocks
    )
        external
        _logs_
        _lock_
        _onlyOwner_
        _needsBPool_
    {
        require(_rights.canChangeWeights, "ERR_NOT_CONFIGURABLE_WEIGHTS");

        // Set these values (if overloaded function called, just set to default values)
        _minimumWeightChangeBlockPeriod = minimumWeightChangeBlockPeriod;
        _addTokenTimeLockInBlocks = addTokenTimeLockInBlocks;

        // Delegate to library to save space

        // Library computes the startBlock, computes startWeights as the current
        // denormalized weights of the core pool tokens.
        (uint actualStartBlock,
         uint[] memory startWeights) = SmartPoolManager.updateWeightsGradually(
                                           bPool,
                                           _newToken,
                                           newWeights,
                                           startBlock,
                                           endBlock,
                                           minimumWeightChangeBlockPeriod
                                       );
        _startBlock = actualStartBlock;
        _endBlock = endBlock;
        _newWeights = newWeights;

        for (uint i = 0; i < _tokens.length; i++) {
            _startWeights[i] = startWeights[i];
        }
    }

    /**
     * @notice Update weights in a predetermined way, between startBlock and endBlock,
     *         through external cals to pokeWeights (using default values of the change period)
     * @dev Can override the change period parameters by calling the overloaded function directly
     * @param newWeights - final weights we want to get to
     * @param startBlock - when weights should start to change
     * @param endBlock - when weights will be at their final values

    Why can't I overload this?

    function updateWeightsGradually(
        uint[] calldata newWeights,
        uint startBlock,
        uint endBlock
    )
        external
    {
        this.updateWeightsGradually(
            newWeights,
            startBlock,
            endBlock,
            DEFAULT_MIN_WEIGHT_CHANGE_BLOCK_PERIOD,
            DEFAULT_ADD_TOKEN_TIME_LOCK_IN_BLOCKS);
    } */

    /**
     * @notice External function called to make the contract update weights according to plan
     * @dev Still works if we poke after the end of the period; also works if the weights don't change
     *      Resets if we are poking beyond the end, so that we can do it again
    */
    function pokeWeights()
        external
        _logs_
        _lock_
        _needsBPool_
    {
        require(_rights.canChangeWeights, "ERR_NOT_CONFIGURABLE_WEIGHTS");

        // Delegate to library to save space
        SmartPoolManager.pokeWeights(
            bPool,
            _startBlock,
            _endBlock,
            _startWeights,
            _newWeights
        );
    }

    /**
     * @notice Schedule (commit) a token to be added; must call applyAddToken after a fixed
     *         number of blocks to actually add the token
     * @dev Not sure about the naming here. Kind of reversed; I would think you would "Apply" to add
     *      a token, then "Commit" it to actually do the binding.
     * @param token - the token to be added
     * @param balance - how much to be added
     * @param denormalizedWeight - the desired token weight
     */
    function commitAddToken(
        address token,
        uint balance,
        uint denormalizedWeight
    )
        external
        _logs_
        _lock_
        _onlyOwner_
        _needsBPool_
    {
        require(_rights.canAddRemoveTokens, "ERR_CANNOT_ADD_REMOVE_TOKENS");

        // Can't do this while a progressive update is happening
        require(_startBlock == 0, "ERR_NO_UPDATE_DURING_GRADUAL");

        // Delegate to library to save space
        SmartPoolManager.commitAddToken(
            bPool,
            token,
            balance,
            denormalizedWeight,
            _newToken
        );
    }

    /**
     * @notice Add the token previously committed (in commitAddToken) to the pool
     */
    function applyAddToken()
        external
        _logs_
        _lock_
        _onlyOwner_
        _needsBPool_
    {
        require(_rights.canAddRemoveTokens, "ERR_CANNOT_ADD_REMOVE_TOKENS");

        // Delegate to library to save space
        SmartPoolManager.applyAddToken(
            this,
            bPool,
            _addTokenTimeLockInBlocks,
            _newToken
        );
    }

     /**
     * @notice Remove a token from the pool
     * @param token - token to remove
     */
    function removeToken(address token)
        external
        _logs_
        _lock_
        _onlyOwner_
        _needsBPool_
    {
        require(_rights.canAddRemoveTokens, "ERR_CANNOT_ADD_REMOVE_TOKENS");

        // Delegate to library to save space
        SmartPoolManager.removeToken(
            this,
            bPool,
            token
        );
    }

    /**
     * @notice Join a pool
     * @dev Emits a LogJoin event (for each token)
     * @param poolAmountOut - number of pool tokens to receive
     * @param maxAmountsIn - Max amount of asset tokens to spend
     */
    function joinPool(uint poolAmountOut, uint[] calldata maxAmountsIn)
         external
        _logs_
        _lock_
        _needsBPool_
    {
        require(_rights.canWhitelistLPs == false || _liquidityProviderWhitelist[msg.sender],
                "ERR_NOT_ON_WHITELIST");

        // Delegate to library to save space

        // Library computes actualAmountsIn, and does many validations
        // Cannot call the push/pull/min from an external library for
        // any of these pool functions. Since msg.sender can be anybody,
        // they must be internal
        uint[] memory actualAmountsIn = SmartPoolManager.joinPool(
                                            this,
                                            bPool,
                                            poolAmountOut,
                                            maxAmountsIn
                                        );

        for (uint i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint tokenAmountIn = actualAmountsIn[i];

            emit LOG_JOIN(msg.sender, t, tokenAmountIn);

            _pullUnderlying(t, msg.sender, tokenAmountIn);
        }

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
    }

    /**
     * @notice Exit a pool - redeem pool tokens for underlying assets
     * @dev Emits a LogExit event for each token
     * @param poolAmountIn - amount of pool tokens to redeem
     * @param minAmountsOut - minimum amount of asset tokens to receive
     */
    function exitPool(uint poolAmountIn, uint[] calldata minAmountsOut)
        external
        _logs_
        _lock_
        _needsBPool_
    {
        // Delegate to library to save space

        // Library computes actualAmountsOut, and does many validations
        // Also computes the exitFee and pAiAfterExitFee
        (uint exitFee,
         uint pAiAfterExitFee,
         uint[] memory actualAmountsOut) = SmartPoolManager.exitPool(
                                               this,
                                               bPool,
                                               poolAmountIn,
                                               minAmountsOut
                                           );

        _pullPoolShare(msg.sender, poolAmountIn);
        _pushPoolShare(address(bFactory), exitFee);
        _burnPoolShare(pAiAfterExitFee);

        for (uint i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint tokenAmountOut = actualAmountsOut[i];

            emit LOG_EXIT(msg.sender, t, tokenAmountOut);

            _pushUnderlying(t, msg.sender, tokenAmountOut);
        }
    }

    /**
     * @notice Join by swapping a fixed amount of an external token in (must be present in the pool)
     *         System calculates the pool token amount
     * @dev emits a LogJoin event
     * @param tokenIn - which token we're transferring in
     * @param tokenAmountIn - amount of deposit
     * @param minPoolAmountOut - minimum of pool tokens to receive
     * @return poolAmountOut - amount of pool tokens minted and transferred
     */
    function joinswapExternAmountIn(
        address tokenIn,
        uint tokenAmountIn,
        uint minPoolAmountOut
    )
        external
        _logs_
        _lock_
        _needsBPool_
        returns (uint poolAmountOut)
    {
        require(_rights.canWhitelistLPs == false || _liquidityProviderWhitelist[msg.sender],
                "ERR_NOT_ON_WHITELIST");

        // Delegate to library to save space
        poolAmountOut = SmartPoolManager.joinswapExternAmountIn(
                            this,
                            bPool,
                            _swapFee,
                            tokenIn,
                            tokenAmountIn,
                            minPoolAmountOut
                        );

        emit LOG_JOIN(msg.sender, tokenIn, tokenAmountIn);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        return poolAmountOut;
    }

    /**
     * @notice Join by swapping an external token in (must be present in the pool)
     *         To receive an exact amount of pool tokens out. System calculates the deposit amount
     * @dev emits a LogJoin event
     * @param tokenIn - which token we're transferring in (system calculates amount required)
     * @param poolAmountOut - amount of pool tokens to be received
     * @param maxAmountIn - Maximum asset tokens that can be pulled to pay for the pool tokens
     * @return tokenAmountIn - amount of asset tokens transferred in to purchase the pool tokens
     */
    function joinswapPoolAmountOut(
        address tokenIn,
        uint poolAmountOut,
        uint maxAmountIn
    )
        external
        _logs_
        _lock_
        _needsBPool_
        returns (uint tokenAmountIn)
    {
        require(_rights.canWhitelistLPs == false || _liquidityProviderWhitelist[msg.sender],
                "ERR_NOT_ON_WHITELIST");

        // Delegate to library to save space
        tokenAmountIn = SmartPoolManager.joinswapPoolAmountOut(
                            this,
                            bPool,
                            _swapFee,
                            tokenIn,
                            poolAmountOut,
                            maxAmountIn
                        );

        emit LOG_JOIN(msg.sender, tokenIn, tokenAmountIn);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        return tokenAmountIn;
    }

    /**
     * @notice Exit a pool - redeem a specific number of pool tokens for an underlying asset
     *         Asset must be present in the pool, and will incur an EXIT_FEE (if set to non-zero)
     * @dev Emits a LogExit event for the token
     * @param tokenOut - which token the caller wants to receive
     * @param poolAmountIn - amount of pool tokens to redeem
     * @param minAmountOut - minimum asset tokens to receive
     * @return tokenAmountOut - amount of asset tokens returned
     */
    function exitswapPoolAmountIn(
        address tokenOut,
        uint poolAmountIn,
        uint minAmountOut
    )
        external
        _logs_
        _lock_
        _needsBPool_
        returns (uint tokenAmountOut)
    {
        // Delegate to library to save space

        // Calculates final amountOut, and the fee and final amount in
        (uint exitFee,
         uint pAiAfterExitFee,
         uint amountOut) = SmartPoolManager.exitswapPoolAmountIn(
                               this,
                               bPool,
                               _swapFee,
                               tokenOut,
                               poolAmountIn,
                               minAmountOut
                           );

        tokenAmountOut = amountOut;

        emit LOG_EXIT(msg.sender, tokenOut, tokenAmountOut);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(pAiAfterExitFee);
        _pushPoolShare(address(bFactory), exitFee);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        return tokenAmountOut;
    }

    /**
     * @notice Exit a pool - redeem pool tokens for a specific amount of underlying assets
     *         Asset must be present in the pool
     * @dev Emits a LogExit event for the token
     * @param tokenOut - which token the caller wants to receive
     * @param tokenAmountOut - amount of underlying asset tokens to receive
     * @param maxPoolAmountIn - maximum pool tokens to be redeemed
     * @return poolAmountIn - amount of pool tokens redeemed
     */
    function exitswapExternAmountOut(
        address tokenOut,
        uint tokenAmountOut,
        uint maxPoolAmountIn
    )
        external
        _logs_
        _lock_
        _needsBPool_
        returns (uint poolAmountIn)
    {
        // Delegate to library to save space

        // Calculates final amounts in, accounting for the exit fee
        (uint exitFee,
         uint pAiAfterExitFee,
         uint amountIn) = SmartPoolManager.exitswapExternAmountOut(
                              this,
                              bPool,
                              _swapFee,
                              tokenOut,
                              tokenAmountOut,
                              maxPoolAmountIn
                          );

        poolAmountIn = amountIn;

        emit LOG_EXIT(msg.sender, tokenOut, tokenAmountOut);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(pAiAfterExitFee);
        _pushPoolShare(address(bFactory), exitFee);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        return poolAmountIn;
    }

    /**
     * @notice Check if an address is a liquidity provider
     * @dev If the whitelist feature is not enabled, anyone can provide liquidity (assuming finalized)
     * @return boolean value indicating whether the address can join a pool
     */
    function canProvideLiquidity(address provider)
        external
        view
        returns(bool)
    {
        if (_rights.canWhitelistLPs) {
            return _liquidityProviderWhitelist[provider];
        }
        else {
            // Probably don't strictly need this (could just return true)
            // But the null address can't provide funds
            return provider != address(0);
        }
    }

    /**
     * @notice Add to the whitelist of liquidity providers (if enabled)
     * @param provider - address of the liquidity provider
     */
    function whitelistLiquidityProvider(address provider)
        external
        _onlyOwner_
        _lock_
        _logs_
    {
        require(_rights.canWhitelistLPs, "ERR_CANNOT_WHITELIST_LPS");
        require(provider != address(0), "ERR_INVALID_ADDRESS");

        _liquidityProviderWhitelist[provider] = true;
    }

    // Public functions

    // Internal functions

    // Rebind BPool and pull tokens from address
    function _pullUnderlying(address erc20, address from, uint amount) internal _needsBPool_ {
        // Gets current Balance of token i, Bi, and weight of token i, Wi, from BPool.
        uint tokenBalance = bPool.getBalance(erc20);
        uint tokenWeight = bPool.getDenormalizedWeight(erc20);

        bool xfer = IERC20(erc20).transferFrom(from, address(this), amount);
        require(xfer, "ERR_ERC20_FALSE");
        bPool.rebind(erc20, BalancerSafeMath.badd(tokenBalance, amount), tokenWeight);
    }

    // Rebind BPool and push tokens to address
    function _pushUnderlying(address erc20, address to, uint amount) internal _needsBPool_ {
        // Gets current Balance of token i, Bi, and weight of token i, Wi, from BPool.
        uint tokenBalance = bPool.getBalance(erc20);
        uint tokenWeight = bPool.getDenormalizedWeight(erc20);
        bPool.rebind(erc20, BalancerSafeMath.bsub(tokenBalance, amount), tokenWeight);

        bool xfer = IERC20(erc20).transfer(to, amount);
        require(xfer, "ERR_ERC20_FALSE");
    }

    // Wrappers around corresponding core functions

    function _mintPoolShare(uint amount) internal {
        _mint(amount);
    }

    function _pushPoolShare(address to, uint amount) internal {
        _push(to, amount);
    }

    function _pullPoolShare(address from, uint amount) internal  {
        _pull(from, amount);
    }

    function _burnPoolShare(uint amount) internal  {
        _burn(amount);
    }

    // "Public" versions that can safely be called from SmartPoolManager
    // If called from external accounts, will fail if not controller
    // Allows the contract itself to call them internally

    function _mintPoolShareFromLib(uint amount) public {
        require (msg.sender == getController() || msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _mint(amount);
    }

    function _pushPoolShareFromLib(address to, uint amount) public {
        require (msg.sender == getController() || msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _push(to, amount);
    }

    function _pullPoolShareFromLib(address from, uint amount) public  {
        require (msg.sender == getController() || msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _pull(from, amount);
    }

    function _burnPoolShareFromLib(uint amount) public  {
        require (msg.sender == getController() || msg.sender == address(this), "ERR_NOT_CONTROLLER");

        _burn(amount);
    }
}
