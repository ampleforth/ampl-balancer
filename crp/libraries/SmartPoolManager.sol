// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.5.12;

// Needed to pass in structs
pragma experimental ABIEncoderV2;

// Imports

import "../contracts/ConfigurableRightsPool.sol";
import "../contracts/PCToken.sol";
import "../contracts/IBFactory.sol";
import "./BalancerSafeMath.sol";

/**
 * @author Balancer Labs
 * @title Factor out the weight updates
 */
library SmartPoolManager {
    // Type declarations

    struct NewToken {
        address addr;
        bool isCommitted;
        uint commitBlock;
        uint denorm;
        uint balance;
    }

    // State variables (must be constant in a library)

    // Don't like copying, but can't seem to get these
    // self.MIN_WEIGHT, PCToken.MIN_WEIGHT, PCToken(self).MIN_WEIGHT don't work
    // These must be kept in sync with PCToken.sol!
    uint public constant BONE = 10**18;
    uint public constant MIN_WEIGHT = BONE;
    uint public constant MAX_WEIGHT = BONE * 50;
    uint public constant MAX_TOTAL_WEIGHT = BONE * 50;
    uint public constant MIN_BALANCE = BONE / 10**6;
    uint public constant EXIT_FEE = 0;
    uint public constant MAX_IN_RATIO = BONE / 2;
    uint public constant MAX_OUT_RATIO = (BONE / 3) + 1 wei;

    /**
     * @notice Update the weight of an existing token
     * @dev Refactored to library to make CRPFactory deployable
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param token - token to be reweighted
     * @param newWeight - new weight of the token
    */
    function updateWeight(
        ConfigurableRightsPool self,
        IBPool bPool,
        address token,
        uint newWeight
    )
        external
    {
        require(newWeight >= MIN_WEIGHT, "ERR_MIN_WEIGHT");
        require(newWeight <= MAX_WEIGHT, "ERR_MAX_WEIGHT");

        uint currentWeight = bPool.getDenormalizedWeight(token);
        if (currentWeight == newWeight) {
             return;
        }

        uint currentBalance = bPool.getBalance(token);
        uint totalSupply = self.totalSupply();
        uint totalWeight = bPool.getTotalDenormalizedWeight();
        uint poolShares;
        uint deltaBalance;
        uint deltaWeight;
        uint newBalance;

        if (newWeight < currentWeight) {
            // This means the controller will withdraw tokens to keep price
            // So they need to redeem PCTokens
            // This will raise the weight; check to make sure it doesn't go over the max
            deltaWeight = BalancerSafeMath.bsub(currentWeight, newWeight);

            require(BalancerSafeMath.badd(totalWeight, deltaWeight) <= MAX_TOTAL_WEIGHT,
                    "ERR_MAX_TOTAL_WEIGHT");


            // poolShares = totalSupply * (deltaWeight / totalWeight)
            poolShares = BalancerSafeMath.bmul(totalSupply,
                                               BalancerSafeMath.bdiv(deltaWeight, totalWeight));

            // deltaBalance = currentBalance * (deltaWeight / currentWeight)
            deltaBalance = BalancerSafeMath.bmul(currentBalance,
                                                 BalancerSafeMath.bdiv(deltaWeight, currentWeight));

            // New balance cannot be lower than MIN_BALANCE
            newBalance = BalancerSafeMath.bsub(currentBalance, deltaBalance);

            require(newBalance >= MIN_BALANCE, "ERR_MIN_BALANCE");

            // First get the tokens from this contract (Pool Controller) to msg.sender
            bPool.rebind(token, newBalance, newWeight);

            // Now with the tokens this contract can send them to msg.sender
            bool xfer = IERC20(token).transfer(msg.sender, deltaBalance);
            require(xfer, "ERR_ERC20_FALSE");

            self._pullPoolShareFromLib(msg.sender, poolShares);
            self._burnPoolShareFromLib(poolShares);
        }
        else {
            // This means the controller will deposit tokens to keep the price.
            // They will be minted and given PCTokens
            deltaWeight = BalancerSafeMath.bsub(newWeight, currentWeight);

            require(BalancerSafeMath.badd(totalWeight, deltaWeight) <= MAX_TOTAL_WEIGHT,
                    "ERR_MAX_TOTAL_WEIGHT");

            // poolShares = totalSupply * (deltaWeight / totalWeight)
            poolShares = BalancerSafeMath.bmul(totalSupply,
                                               BalancerSafeMath.bdiv(deltaWeight, totalWeight));
            // deltaBalance = currentBalance * (deltaWeight / currentWeight)
            deltaBalance = BalancerSafeMath.bmul(currentBalance,
                                                 BalancerSafeMath.bdiv(deltaWeight, currentWeight));

            // First gets the tokens from msg.sender to this contract (Pool Controller)
            bool xfer = IERC20(token).transferFrom(msg.sender, address(this), deltaBalance);
            require(xfer, "ERR_ERC20_FALSE");

            // Now with the tokens this contract can bind them to the pool it controls
            bPool.rebind(token, BalancerSafeMath.badd(currentBalance, deltaBalance), newWeight);

            self._mintPoolShareFromLib(poolShares);
            self._pushPoolShareFromLib(msg.sender, poolShares);
        }
    }

    /**
     * @notice Update weights in a predetermined way, between startBlock and endBlock,
     *         through external cals to pokeWeights
     * @param bPool - Core BPool the CRP is wrapping
     * @param _newToken - NewToken instance we're using to store the new token data (in CRP storage)
     * @param newWeights - final weights we want to get to
     * @param startBlock - when weights should start to change
     * @param endBlock - when weights will be at their final values
     * @param minimumWeightChangeBlockPeriod - can override default value
    */
    function updateWeightsGradually(
        IBPool bPool,
        NewToken storage _newToken,
        uint[] calldata newWeights,
        uint startBlock,
        uint endBlock,
        uint minimumWeightChangeBlockPeriod
    )
        external
        view
        returns (uint actualStartBlock, uint[] memory startWeights)
    {
        // Don't start this when we're in the middle of adding a new token
        require(_newToken.isCommitted == false, "ERR_PENDING_TOKEN_ADD");

        // Enforce a minimum time over which to make the changes
        // The also prevents endBlock <= startBlock
        require(BalancerSafeMath.bsub(endBlock, startBlock) >= minimumWeightChangeBlockPeriod,
                "ERR_WEIGHT_CHANGE_TIME_BELOW_MIN");

        address[] memory tokens = bPool.getCurrentTokens();

        uint weightsSum = 0;
        startWeights = new uint[](tokens.length);

        // Check that endWeights are valid now to avoid reverting in a future pokeWeights call
        // *Could* set startWeights now, and check for the case of newWeights=startWeights, and
        // return in that case.
        //
        // Such a call could be used to prevent anyone from starting a weight update.
        // You could have an endBlock years in the future, and set the newWeights equal to the current;
        // then no one could update the weights for years
        for (uint i = 0; i < tokens.length; i++) {
            require(newWeights[i] <= MAX_WEIGHT, "ERR_WEIGHT_ABOVE_MAX");
            require(newWeights[i] >= MIN_WEIGHT, "ERR_WEIGHT_BELOW_MIN");

            weightsSum = BalancerSafeMath.badd(weightsSum, newWeights[i]);
            startWeights[i] = bPool.getDenormalizedWeight(tokens[i]);
        }
        require(weightsSum <= MAX_TOTAL_WEIGHT, "ERR_MAX_TOTAL_WEIGHT");

        if(block.number > startBlock){
            // This means the weight update should start ASAP
            // Moving the start block up prevents a big jump/discontinuity in the weights
            actualStartBlock = block.number;
        }
        else{
            actualStartBlock = startBlock;
        }
    }

    /**
     * @notice External function called to make the contract update weights according to plan
     * @param bPool - Core BPool the CRP is wrapping
     * @param startBlock - when weights should start to change
     * @param endBlock - when weights will be at their final values
     * @param startWeights - current token weights
     * @param newWeights - target token weights
    */
    function pokeWeights(
        IBPool bPool,
        uint startBlock,
        uint endBlock,
        uint[] calldata startWeights,
        uint[] calldata newWeights
    )
        external
    {
        require(block.number >= startBlock, "ERR_CANT_POKE_YET");

        // Do nothing if we call this when there is no update plan
        if (startBlock == 0) {
            return;
        }

        // Error to call it before the start of the plan
        require(block.number >= startBlock, "ERR_CANT_POKE_YET");
        // Proposed error message improvement
        // require(block.number >= startBlock, "ERR_NO_HOKEY_POKEY");

        // This allows for pokes after endBlock that get weights to endWeights
        // Get the current block (or the endBlock, if we're already past the end)
        uint currentBlock;
        if (block.number > endBlock) {
            currentBlock = endBlock;
        }
        else {
            currentBlock = block.number;
        }

        uint blockPeriod = BalancerSafeMath.bsub(endBlock, startBlock);
        uint blocksElapsed = BalancerSafeMath.bsub(currentBlock, startBlock);
        uint weightDelta;
        uint deltaPerBlock;
        uint newWeight;

        address[] memory tokens = bPool.getCurrentTokens();

        for (uint i = 0; i < tokens.length; i++) {
            // Make sure it does nothing if the new and old weights are the same (saves gas)
            // It's a degenerate case if they're *all* the same, but you certainly could have
            // a plan where you only change some of the weights in the set
            if (startWeights[i] != newWeights[i]) {
                if (newWeights[i] < startWeights[i]) {
                    // We are decreasing the weight

                    // First get the total weight delta
                    weightDelta = BalancerSafeMath.bsub(startWeights[i], newWeights[i]);
                    // And the amount it should change per block = total change/number of blocks in the period
                    deltaPerBlock = BalancerSafeMath.bdiv(weightDelta, blockPeriod);
                    //deltaPerBlock = bdivx(weightDelta, blockPeriod);

                     // newWeight = startWeight - (blocksElapsed * deltaPerBlock)
                    newWeight = BalancerSafeMath.bsub(startWeights[i],
                                                      BalancerSafeMath.bmul(blocksElapsed, deltaPerBlock));
                }
                else {
                    // We are increasing the weight

                    // First get the total weight delta
                    weightDelta = BalancerSafeMath.bsub(newWeights[i], startWeights[i]);
                    // And the amount it should change per block = total change/number of blocks in the period
                    deltaPerBlock = BalancerSafeMath.bdiv(weightDelta, blockPeriod);
                    //deltaPerBlock = bdivx(weightDelta, blockPeriod);

                     // newWeight = startWeight + (blocksElapsed * deltaPerBlock)
                    newWeight = BalancerSafeMath.badd(startWeights[i],
                                                      BalancerSafeMath.bmul(blocksElapsed, deltaPerBlock));
                }

                uint bal = bPool.getBalance(tokens[i]);

                bPool.rebind(tokens[i], bal, newWeight);
            }
        }
    }

    /**
     * @notice Schedule (commit) a token to be added; must call applyAddToken after a fixed
     *         number of blocks to actually add the token
     * @dev Not sure about the naming here. Kind of reversed; I would think you would "Apply" to add
     *      a token, then "Commit" it to actually do the binding.
     * @param bPool - Core BPool the CRP is wrapping
     * @param token - the token to be added
     * @param balance - how much to be added
     * @param denormalizedWeight - the desired token weight
     * @param _newToken - NewToken struct used to hold the token data (in CRP storage)
     */
    function commitAddToken(
        IBPool bPool,
        address token,
        uint balance,
        uint denormalizedWeight,
        NewToken storage _newToken
    )
        external
    {
        require(bPool.isBound(token) == false, "ERR_IS_BOUND");

        require(denormalizedWeight <= MAX_WEIGHT, "ERR_WEIGHT_ABOVE_MAX");
        require(denormalizedWeight >= MIN_WEIGHT, "ERR_WEIGHT_BELOW_MIN");
        require(BalancerSafeMath.badd(bPool.getTotalDenormalizedWeight(),
                                      denormalizedWeight) <= MAX_TOTAL_WEIGHT,
                "ERR_MAX_TOTAL_WEIGHT");

        _newToken.addr = token;
        _newToken.balance = balance;
        _newToken.denorm = denormalizedWeight;
        _newToken.commitBlock = block.number;
        _newToken.isCommitted = true;
    }

    /**
     * @notice Add the token previously committed (in commitAddToken) to the pool
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param _addTokenTimeLockInBlocks -  Wait time between committing and applying a new token
     * @param _newToken - NewToken struct used to hold the token data (in CRP storage)
     */
    function applyAddToken(
        ConfigurableRightsPool self,
        IBPool bPool,
        uint _addTokenTimeLockInBlocks,
        NewToken storage _newToken
    )
        external
    {
        require(_newToken.isCommitted, "ERR_NO_TOKEN_COMMIT");
        require(BalancerSafeMath.bsub(block.number, _newToken.commitBlock) >= _addTokenTimeLockInBlocks,
                                      "ERR_TIMELOCK_STILL_COUNTING");

        uint totalSupply = self.totalSupply();

        // poolShares = totalSupply * newTokenWeight / totalWeight
        uint poolShares = BalancerSafeMath.bdiv(BalancerSafeMath.bmul(totalSupply, _newToken.denorm),
                                                bPool.getTotalDenormalizedWeight());

        // Clear this to allow adding more tokens
        _newToken.isCommitted = false;

        // First gets the tokens from msg.sender to this contract (Pool Controller)
        // bool xfer = IERC20(_newToken.addr).transferFrom(msg.sender, address(this), _newToken.balance);
        bool xfer = IERC20(_newToken.addr).transferFrom(self.getController(), address(self), _newToken.balance);
        require(xfer, "ERR_ERC20_FALSE");

        // Now with the tokens this contract can bind them to the pool it controls
        // Approves bPool to pull from this controller (only approve exact balance, not unlimited, for security)
        IERC20(_newToken.addr).approve(address(bPool), _newToken.balance);
        bPool.bind(_newToken.addr, _newToken.balance, _newToken.denorm);

        self._mintPoolShareFromLib(poolShares);
        self._pushPoolShareFromLib(msg.sender, poolShares);
    }

     /**
     * @notice Remove a token from the pool
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param token - token to remove
     */
    function removeToken(
        ConfigurableRightsPool self,
        IBPool bPool,
        address token
    )
        external
    {
        uint totalSupply = self.totalSupply();

        // poolShares = totalSupply * tokenWeight / totalWeight
        uint poolShares = BalancerSafeMath.bdiv(BalancerSafeMath.bmul(totalSupply,
                                                                      bPool.getDenormalizedWeight(token)),
                                                bPool.getTotalDenormalizedWeight());

        // this is what will be unbound from the pool
        // Have to get it before unbinding
        uint balance = bPool.getBalance(token);

        // Unbind and get the tokens out of balancer pool
        bPool.unbind(token);

        // Now with the tokens this contract can send them to msg.sender
        bool xfer = IERC20(token).transfer(self.getController(), balance);
        require(xfer, "ERR_ERC20_FALSE");

        self._pullPoolShareFromLib(self.getController(), poolShares);
        self._burnPoolShareFromLib(poolShares);
    }

    /**
     * @notice Join a pool
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param poolAmountOut - number of pool tokens to receive
     * @param maxAmountsIn - Max amount of asset tokens to spend
     * @return actualAmountsIn - calculated values of the tokens to pull in
     */
    function joinPool(
        ConfigurableRightsPool self,
        IBPool bPool,
        uint poolAmountOut,
        uint[] calldata maxAmountsIn
    )
         external
         view
         returns (uint[] memory actualAmountsIn)
    {
        address[] memory tokens = bPool.getCurrentTokens();

        require(maxAmountsIn.length == tokens.length, "ERR_AMOUNTS_MISMATCH");

        uint poolTotal = self.totalSupply();
        uint ratio = BalancerSafeMath.bdiv(poolAmountOut, poolTotal);

        require(ratio != 0, "ERR_MATH_APPROX");

        // We know the length of the array; initialize it, and fill it below
        // Cannot do "push" in memory
        actualAmountsIn = new uint[](tokens.length);

        for (uint i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            uint bal = bPool.getBalance(t);
            uint tokenAmountIn = BalancerSafeMath.bmul(ratio, bal);

            require(tokenAmountIn != 0, "ERR_MATH_APPROX");
            require(tokenAmountIn <= maxAmountsIn[i], "ERR_LIMIT_IN");

            actualAmountsIn[i] = tokenAmountIn;
        }
    }

    /**
     * @notice Exit a pool - redeem pool tokens for underlying assets
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param poolAmountIn - amount of pool tokens to redeem
     * @param minAmountsOut - minimum amount of asset tokens to receive
     * @return exitFee - calculated exit fee
     * @return pAiAfterExitFee - final amount in (after accounting for exit fee)
     * @return actualAmountsOut - calculated amounts of each token to pull
     */
    function exitPool(
        ConfigurableRightsPool self,
        IBPool bPool,
        uint poolAmountIn,
        uint[] calldata minAmountsOut
    )
        external
        view
        returns (uint exitFee, uint pAiAfterExitFee, uint[] memory actualAmountsOut)
    {
        address[] memory tokens = bPool.getCurrentTokens();

        require(minAmountsOut.length == tokens.length, "ERR_AMOUNTS_MISMATCH");

        uint poolTotal = self.totalSupply();

        // Calculate exit fee and the final amount in
        exitFee = BalancerSafeMath.bmul(poolAmountIn, EXIT_FEE);
        pAiAfterExitFee = BalancerSafeMath.bsub(poolAmountIn, exitFee);

        uint ratio = BalancerSafeMath.bdiv(pAiAfterExitFee, poolTotal);

        require(ratio != 0, "ERR_MATH_APPROX");

        actualAmountsOut = new uint[](tokens.length);

        for (uint i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            uint bal = bPool.getBalance(t);
            uint tokenAmountOut = BalancerSafeMath.bmul(ratio, bal);

            require(tokenAmountOut != 0, "ERR_MATH_APPROX");
            require(tokenAmountOut >= minAmountsOut[i], "ERR_LIMIT_OUT");

            actualAmountsOut[i] = tokenAmountOut;
        }
    }

    /**
     * @notice Join by swapping a fixed amount of an external token in (must be present in the pool)
     *         System calculates the pool token amount
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param swapFee - Current swap fee of the underlying pool
     * @param tokenIn - which token we're transferring in
     * @param tokenAmountIn - amount of deposit
     * @param minPoolAmountOut - minimum of pool tokens to receive
     * @return poolAmountOut - amount of pool tokens minted and transferred
     */
    function joinswapExternAmountIn(
        ConfigurableRightsPool self,
        IBPool bPool,
        uint swapFee,
        address tokenIn,
        uint tokenAmountIn,
        uint minPoolAmountOut
    )
        external
        view
        returns (uint poolAmountOut)
    {
        require(bPool.isBound(tokenIn), "ERR_NOT_BOUND");
        require(tokenAmountIn <= BalancerSafeMath.bmul(bPool.getBalance(tokenIn), MAX_IN_RATIO),
                                                       "ERR_MAX_IN_RATIO");

        poolAmountOut = bPool.calcPoolOutGivenSingleIn(
                            bPool.getBalance(tokenIn),
                            bPool.getDenormalizedWeight(tokenIn),
                            self.totalSupply(),
                            bPool.getTotalDenormalizedWeight(),
                            tokenAmountIn,
                            swapFee
                        );

        require(poolAmountOut >= minPoolAmountOut, "ERR_LIMIT_OUT");
    }

    /**
     * @notice Join by swapping an external token in (must be present in the pool)
     *         To receive an exact amount of pool tokens out. System calculates the deposit amount
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param swapFee - Current swap fee of the underlying pool
     * @param tokenIn - which token we're transferring in (system calculates amount required)
     * @param poolAmountOut - amount of pool tokens to be received
     * @param maxAmountIn - Maximum asset tokens that can be pulled to pay for the pool tokens
     * @return tokenAmountIn - amount of asset tokens transferred in to purchase the pool tokens
     */
    function joinswapPoolAmountOut(
        ConfigurableRightsPool self,
        IBPool bPool,
        uint swapFee,
        address tokenIn,
        uint poolAmountOut,
        uint maxAmountIn
    )
        external
        view
        returns (uint tokenAmountIn)
    {
        require(bPool.isBound(tokenIn), "ERR_NOT_BOUND");

        tokenAmountIn = bPool.calcSingleInGivenPoolOut(
                            bPool.getBalance(tokenIn),
                            bPool.getDenormalizedWeight(tokenIn),
                            self.totalSupply(),
                            bPool.getTotalDenormalizedWeight(),
                            poolAmountOut,
                            swapFee
                        );

        require(tokenAmountIn != 0, "ERR_MATH_APPROX");
        require(tokenAmountIn <= maxAmountIn, "ERR_LIMIT_IN");

        require(tokenAmountIn <= BalancerSafeMath.bmul(bPool.getBalance(tokenIn), MAX_IN_RATIO),
                                                       "ERR_MAX_IN_RATIO");
    }

    /**
     * @notice Exit a pool - redeem a specific number of pool tokens for an underlying asset
     *         Asset must be present in the pool, and will incur an EXIT_FEE (if set to non-zero)
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param swapFee - Current swap fee of the underlying pool
     * @param tokenOut - which token the caller wants to receive
     * @param poolAmountIn - amount of pool tokens to redeem
     * @param minAmountOut - minimum asset tokens to receive
     * @return exitFee - calculated exit fee
     * @return pAiAfterExitFee - calculated pool amount in, accounting for exit fee
     * @return tokenAmountOut - amount of asset tokens returned
     */
    function exitswapPoolAmountIn(
        ConfigurableRightsPool self,
        IBPool bPool,
        uint swapFee,
        address tokenOut,
        uint poolAmountIn,
        uint minAmountOut
    )
        external
        view
        returns (uint exitFee, uint pAiAfterExitFee, uint tokenAmountOut)
    {
        require(bPool.isBound(tokenOut), "ERR_NOT_BOUND");

        tokenAmountOut = bPool.calcSingleOutGivenPoolIn(
                            bPool.getBalance(tokenOut),
                            bPool.getDenormalizedWeight(tokenOut),
                            self.totalSupply(),
                            bPool.getTotalDenormalizedWeight(),
                            poolAmountIn,
                            swapFee
                        );

        require(tokenAmountOut >= minAmountOut, "ERR_LIMIT_OUT");
        require(tokenAmountOut <= BalancerSafeMath.bmul(bPool.getBalance(tokenOut), MAX_OUT_RATIO),
                                                        "ERR_MAX_OUT_RATIO");

        exitFee = BalancerSafeMath.bmul(poolAmountIn, EXIT_FEE);
        pAiAfterExitFee = BalancerSafeMath.bsub(poolAmountIn, exitFee);
    }

    /**
     * @notice Exit a pool - redeem pool tokens for a specific amount of underlying assets
     *         Asset must be present in the pool
     * @param self - ConfigurableRightsPool instance calling the library
     * @param bPool - Core BPool the CRP is wrapping
     * @param swapFee - Current swap fee of the underlying pool
     * @param tokenOut - which token the caller wants to receive
     * @param tokenAmountOut - amount of underlying asset tokens to receive
     * @param maxPoolAmountIn - maximum pool tokens to be redeemed
     * @return exitFee - calculated exit fee
     * @return pAiAfterExitFee - calculated pool amount in, accounting for exit fee
     * @return poolAmountIn - amount of pool tokens redeemed
     */
    function exitswapExternAmountOut(
        ConfigurableRightsPool self,
        IBPool bPool,
        uint swapFee,
        address tokenOut,
        uint tokenAmountOut,
        uint maxPoolAmountIn
    )
        external
        view
        returns (uint exitFee, uint pAiAfterExitFee, uint poolAmountIn)
    {
        require(bPool.isBound(tokenOut), "ERR_NOT_BOUND");
        require(tokenAmountOut <= BalancerSafeMath.bmul(bPool.getBalance(tokenOut), MAX_OUT_RATIO),
                                                        "ERR_MAX_OUT_RATIO");
        poolAmountIn = bPool.calcPoolInGivenSingleOut(
                            bPool.getBalance(tokenOut),
                            bPool.getDenormalizedWeight(tokenOut),
                            self.totalSupply(),
                            bPool.getTotalDenormalizedWeight(),
                            tokenAmountOut,
                            swapFee
                        );

        require(poolAmountIn != 0, "ERR_MATH_APPROX");
        require(poolAmountIn <= maxPoolAmountIn, "ERR_LIMIT_IN");

        exitFee = BalancerSafeMath.bmul(poolAmountIn, EXIT_FEE);
        pAiAfterExitFee = BalancerSafeMath.bsub(poolAmountIn, exitFee);
    }
}
