// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is disstributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity 0.5.12;

import "./IBFactory.sol";
import "./PCToken.sol";

contract ConfigurableRightsPool is PCToken {

    event LOG_CALL(
        bytes4  indexed sig,
        address indexed caller,
        bytes           data
    ) anonymous;

    event LOG_JOIN(
        address indexed caller,
        address indexed tokenIn,
        uint256         tokenAmountIn
    );

    event LOG_EXIT(
        address indexed caller,
        address indexed tokenOut,
        uint256         tokenAmountOut
    );

    modifier _logs_() {
        emit LOG_CALL(msg.sig, msg.sender, msg.data);
        _;
    }

    modifier _lock_() {
        require(!_mutex, "ERR_REENTRY");
        _mutex = true;
        _;
        _mutex = false;
    }

    modifier _viewlock_() {
        require(!_mutex, "ERR_REENTRY");
        _;
    }

    uint public constant BONE             = 10**18;
    uint public constant INIT_POOL_SUPPLY = BONE * 100;

    uint public constant MIN_WEIGHT        = BONE;
    uint public constant MAX_WEIGHT        = BONE * 50;
    uint public constant MAX_TOTAL_WEIGHT  = BONE * 50;

    bool private _mutex;
    bool private _created;
    uint private _swapFee;
    address private _controller;

    address[] private _tokens;
    uint256[] private _startBalances;
    uint256[] private _startWeights;
    uint256[] private _newWeights;
    uint256 private _startBlock;
    uint256 private _endBlock;
    uint private _minimumWeightChangeBlockPeriod;
    uint private _addTokenTimeLockInBLocks; // Number of blocks that adding a token requires to wait 
    bool[4] private _rights; // TODO: consider making all public so we don't need getter functions

    address private _commitNewToken;
    uint private _commitNewBalance;
    uint private _commitNewDenormalizedWeigth;
    uint private _commitBlock;

    IBFactory public _bFactory;
    IBPool public _bPool;
    

    constructor(
        address factoryAddress,
        address[] memory tokens,
        uint256[] memory startBalances,
        uint256[] memory startWeights,
        uint swapFee,
        uint minimumWeightChangeBlockPeriod,
        uint addTokenTimeLockInBLocks,
        bool[4] memory rights // pausableSwap, configurableSwapFee, configurableWeights, configurableAddRemoveTokens
    )
        public
    {
        _controller = msg.sender;
        _bFactory = IBFactory(factoryAddress);
        _tokens = tokens;
        _startBalances = startBalances;
        _startWeights = startWeights;
        _swapFee = swapFee;
        _minimumWeightChangeBlockPeriod = minimumWeightChangeBlockPeriod;
        _addTokenTimeLockInBLocks = addTokenTimeLockInBLocks;
        _rights = rights;
    }

    function setSwapFee(uint swapFee)
        external
        _logs_
        _lock_
    { 
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(_rights[1], "ERR_NOT_CONFIGURABLE_SWAP_FEE");
        _bPool.setSwapFee(swapFee);
    }

    function setController(address manager)
        external
        _logs_
        _lock_
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        _controller = manager;
    }

    function setPublicSwap(bool publicSwap)
        external
        _logs_
        _lock_
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(_rights[0], "ERR_NOT_PAUSABLE_SWAP");
        _bPool.setPublicSwap(publicSwap);
    }

    function createPool()
        external
        _logs_
        _lock_
        returns (ConfigurableRightsPool)
    {
        require(block.number >= _startBlock, "ERR_START_BLOCK");
        require(!_created, "ERR_IS_CREATED");


        // Deploy new BPool
        _bPool = _bFactory.newBPool();

        _bPool.setSwapFee(_swapFee);

        for (uint i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint bal = _startBalances[i];
            uint denorm = _startWeights[i];

            bool xfer = IERC20(t).transferFrom(msg.sender, address(this), bal);
            require(xfer, "ERR_ERC20_FALSE");

            IERC20(t).approve(address(_bPool), uint(-1));
            _bPool.bind(t, bal, denorm);
        }

        _created = true;
        _bPool.setPublicSwap(true);

        _mintPoolShare(INIT_POOL_SUPPLY);
        _pushPoolShare(msg.sender, INIT_POOL_SUPPLY);
    }

    // Notice Balance is not an input (like with rebind on BPool) since we will require prices not to change.
    // This is achieved by forcing balances to change proportionally to weights, so that prices don't change. 
    // If prices could be changed, this would allow the controller to drain the pool by arbing price changes.
    function updateWeight(address token, uint256 newWeight) 
        external
        _logs_
        _lock_
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(_created, "ERR_NOT_CREATED");
        require(_rights[2], "ERR_NOT_CONFIGURABLE_WEIGHTS");

        require(newWeight >= MIN_WEIGHT, "ERR_MIN_WEIGHT");
        require(newWeight <= MAX_WEIGHT, "ERR_MAX_WEIGHT");

        uint currentWeight = _bPool.getDenormalizedWeight(token);
        uint currentBalance = _bPool.getBalance(token);
        uint poolShares;
        uint deltaBalance;
        uint totalSupply = _bPool.totalSupply();
        uint totalWeight = _bPool.getTotalDenormalizedWeight();

        require(badd(totalWeight,bsub(newWeight,currentWeight))<=MAX_TOTAL_WEIGHT, "ERR_MAX_TOTAL_WEIGHT");

        if(newWeight<currentWeight){ // This means the controller will withdraw tokens to keep price. This means they need to redeem PCTokens
            poolShares = bmul(
                            totalSupply,
                            bdiv(
                                bsub(currentWeight, newWeight),
                                totalWeight
                                )
                            );
            deltaBalance = bmul(
                            currentBalance,
                            bdiv(newWeight, currentWeight)
                            );

            // New balance cannot be lower than MIN_BALANCE
            require(bsub(currentBalance, deltaBalance) >= MIN_BALANCE, "ERR_MIN_BALANCE");
            // First gets the tokens from this contract (Pool Controller) to msg.sender
            _bPool.bind(token, bsub(currentBalance, deltaBalance), newWeight);

            // Now with the tokens this contract can send them to msg.sender
            bool xfer = IERC20(token).transfer(msg.sender, deltaBalance);
            require(xfer, "ERR_ERC20_FALSE");

            _pullPoolShare(msg.sender, poolShares);
            _burnPoolShare(poolShares);
        }
        else{ // This means the controller will deposit tokens to keep the price. This means they will be minted and given PCTokens         
            poolShares = bmul(
                            totalSupply,
                            bdiv(
                                bsub(newWeight, currentWeight),
                                totalWeight
                                )
                            );
            deltaBalance = bmul(
                            currentBalance,
                            bdiv(newWeight, currentWeight)
                            );

            // First gets the tokens from msg.sender to this contract (Pool Controller)
            bool xfer = IERC20(token).transferFrom(msg.sender, address(this), deltaBalance);
            require(xfer, "ERR_ERC20_FALSE");
            // Now with the tokens this contract can bind them to the pool it controls
            _bPool.bind(token, badd(currentBalance, deltaBalance), newWeight);

            _mintPoolShare(poolShares);
            _pushPoolShare(msg.sender, poolShares);
        }
    }

    // Let external actors poke the contract with pokeWeights() to slowly get to newWeights at endBlock
    function updateWeightsGradually(uint256[] calldata newWeights, uint256 startBlock, uint256 endBlock)
        external
        _logs_
        _lock_
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");
        require(_created, "ERR_NOT_CREATED");
        require(_rights[2], "ERR_NOT_CONFIGURABLE_WEIGHTS");

        uint weightsSum = 0;
        // Check that endWeights are valid now to avoid reverting in a future pokeWeights call
        for (uint i = 0; i < _tokens.length; i++) {
            require(newWeights[i]>MAX_WEIGHT, "ERR_WEIGHT_ABOVE_MAX");
            require(newWeights[i]<MIN_WEIGHT, "ERR_WEIGHT_BELOW_MIN");
            weightsSum += newWeights[i];
        }
        require(weightsSum<=MAX_TOTAL_WEIGHT, "ERR_MAX_TOTAL_WEIGHT");
        require(endBlock>startBlock, "ERR_END_BLOCK_BEFORE_OR_EQUAL_TO_START_BLOCK");          
        
        if(block.number>startBlock){ // This means the weight update should start ASAP
            _startBlock = block.number; // This prevents a big jump in weights if block.number>startBlock
        }
        else{
            _startBlock = startBlock;
        }

        _endBlock = endBlock;
        _newWeights = newWeights;

        // Prevent weights to be changed in less than the minimum weight change period.
        require(bsub(_endBlock,_startBlock)>=_minimumWeightChangeBlockPeriod, "ERR_WEIGHT_CHANGE_PERIOD_BELOW_MIN");

        for (uint i = 0; i < _tokens.length; i++) {
            _startWeights[i] = _bPool.getDenormalizedWeight(_tokens[i]); // startWeights are current weights
        }
    }

    function pokeWeights()
        external
        _logs_
        _lock_
    {
        require(_created, "ERR_NOT_CREATED");
        require(_rights[2], "ERR_NOT_CONFIGURABLE_WEIGHTS");
        require(block.number >= _startBlock, "ERR_CANT_POKE_YET");

        uint minBetweenEndBlockAndThisBlock; // This allows for pokes after endBlock that get weights to endWeights
        if (block.number > _endBlock){
            minBetweenEndBlockAndThisBlock = _endBlock;
        }
        else{
            minBetweenEndBlockAndThisBlock = block.number;
        }
        
        for (uint i = 0; i < _tokens.length; i++) {
            uint blockPeriod = bsub(_endBlock, _startBlock);
            uint weightDelta;
            uint newWeight;
            if (_startWeights[i] >= _newWeights[i]) {
                weightDelta = bsub(_startWeights[i], _newWeights[i]);
                newWeight = bsub(
                                _startWeights[i],
                                bmul(
                                    bsub(minBetweenEndBlockAndThisBlock, _startBlock),
                                    bdiv(weightDelta,blockPeriod)
                                    )
                                );
            } else {
                weightDelta = bsub(_newWeights[i], _startWeights[i]);
                newWeight = badd(
                                _startWeights[i],
                                bmul(
                                    bsub(minBetweenEndBlockAndThisBlock, _startBlock),
                                    bdiv(weightDelta,blockPeriod)
                                    )
                                );
            }
            _bPool.rebind(_tokens[i], _bPool.getBalance(_tokens[i]), newWeight);
        }
    }

    function commitAddToken(address token, uint balance, uint denormalizedWeight)
        external
        _logs_
        _lock_
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");        
        require(_rights[3], "ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS");
        _commitNewToken = token;
        _commitNewBalance = balance;
        _commitNewDenormalizedWeigth = denormalizedWeight;
        _commitBlock = block.number;
    }

    function applyAddToken()
        external
        _logs_
        _lock_
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");        
        require(_rights[3], "ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS");
        require(bsub(block.number,_commitBlock)>=_addTokenTimeLockInBLocks ,"ERR_TIMELOCK_STILL_COUNTING");

        uint totalSupply = _bPool.totalSupply();

        uint poolShares = bdiv(
                            bmul(
                                totalSupply,
                                _commitNewDenormalizedWeigth
                                ),
                            _bPool.getTotalDenormalizedWeight()
                            );

        // First gets the tokens from msg.sender to this contract (Pool Controller)
        bool xfer = IERC20(_commitNewToken).transferFrom(msg.sender, address(this), _commitNewBalance);
        require(xfer, "ERR_ERC20_FALSE");
        // Now with the tokens this contract can bind them to the pool it controls
        _bPool.bind(_commitNewToken, _commitNewBalance, _commitNewDenormalizedWeigth);

        _mintPoolShare(poolShares);
        _pushPoolShare(msg.sender, poolShares);

    }

    function removeToken(address token)
        external
        _logs_
        _lock_
    {
        require(msg.sender == _controller, "ERR_NOT_CONTROLLER");        
        require(_rights[3], "ERR_NOT_CONFIGURABLE_ADD_REMOVE_TOKENS");
        uint totalSupply = _bPool.totalSupply();

        uint poolShares = bdiv(
                            bmul(
                                totalSupply,
                                _bPool.getDenormalizedWeight(token)
                                ),
                            _bPool.getTotalDenormalizedWeight()
                            );

        uint balance = _bPool.getBalance(token); // this is what will be unbound from the pool
        // Unbind and get the tokens out of balancer pool
        _bPool.unbind(token);

        // Now with the tokens this contract can send them to msg.sender
        bool xfer = IERC20(token).transfer(msg.sender, balance);
        require(xfer, "ERR_ERC20_FALSE");

        _pullPoolShare(msg.sender, poolShares);
        _burnPoolShare(poolShares);
    }


    // Pull tokens from address and rebind BPool
    function _pullUnderlying(address erc20, address from, uint amount)
        internal
    {
        // Gets current Balance of token i, Bi, and weight of token i, Wi, from BPool.
        uint tokenBalance = _bPool.getBalance(erc20);
        uint tokenWeight = _bPool.getDenormalizedWeight(erc20);

        bool xfer = IERC20(erc20).transferFrom(from, address(this), amount);
        require(xfer, "ERR_ERC20_FALSE");
        _bPool.rebind(erc20, badd(tokenBalance, amount), tokenWeight);
    }

    // Rebind BPool and push tokens to address
    function _pushUnderlying(address erc20, address to, uint amount)
        internal
    {
        // Gets current Balance of token i, Bi, and weight of token i, Wi, from BPool.
        uint tokenBalance = _bPool.getBalance(erc20);
        uint tokenWeight = _bPool.getDenormalizedWeight(erc20);
        _bPool.rebind(erc20, bsub(tokenBalance, amount), tokenWeight);

        bool xfer = IERC20(erc20).transfer(to, amount);
        require(xfer, "ERR_ERC20_FALSE");
    }

    function joinPool(uint poolAmountOut)
         external
        _logs_
        _lock_
    {
        require(_created, "ERR_NOT_CREATED");

        uint poolTotal = totalSupply();

        uint ratio = bdiv(poolAmountOut, poolTotal);
        require(ratio != 0);

        for (uint i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint bal = _bPool.getBalance(t);
            uint tokenAmountIn = bmul(ratio, bal);
            emit LOG_JOIN(msg.sender, t, tokenAmountIn);
            _pullUnderlying(t, msg.sender, tokenAmountIn);
        }
        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
    }

    function exitPool(uint poolAmountIn)
        external
        _logs_
        _lock_
    {
        require(_created, "ERR_NOT_CREATED");

        uint poolTotal = totalSupply();
        uint ratio = bdiv(poolAmountIn, poolTotal);
        require(ratio != 0);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(poolAmountIn);

        for (uint i = 0; i < _tokens.length; i++) {
            address t = _tokens[i];
            uint bal = _bPool.getBalance(t);
            uint tAo = bmul(ratio, bal);
            emit LOG_EXIT(msg.sender, t, tAo);
            _pushUnderlying(t, msg.sender, tAo);
        }
    }

    function joinswapExternAmountIn(address tokenIn, uint256 tokenAmountIn)
        external
        _logs_
        _lock_
        returns (uint poolAmountOut)
    {
        require(_bPool.isBound(tokenIn), "ERR_NOT_BOUND");
        require(_created, "ERR_NOT_CREATED");

        poolAmountOut = _bPool.calcPoolOutGivenSingleIn(
                            _bPool.getBalance(tokenIn),
                            _bPool.getDenormalizedWeight(tokenIn),
                            _totalSupply,
                            _bPool.getTotalDenormalizedWeight(),
                            tokenAmountIn,
                            _swapFee
                        );

        emit LOG_JOIN(msg.sender, tokenIn, tokenAmountIn);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        return poolAmountOut;
    }

    function joinswapPoolAmountOut(uint poolAmountOut, address tokenIn)
        external
        _logs_
        _lock_
        returns (uint tokenAmountIn)
    {
        require(_bPool.isBound(tokenIn), "ERR_NOT_BOUND");
        require(_created, "ERR_NOT_CREATED");

        tokenAmountIn = _bPool.calcSingleInGivenPoolOut(
                            _bPool.getBalance(tokenIn),
                            _bPool.getDenormalizedWeight(tokenIn),
                            _totalSupply,
                            _bPool.getTotalDenormalizedWeight(),
                            poolAmountOut,
                            _swapFee
                        );

        emit LOG_JOIN(msg.sender, tokenIn, tokenAmountIn);

        _mintPoolShare(poolAmountOut);
        _pushPoolShare(msg.sender, poolAmountOut);
        _pullUnderlying(tokenIn, msg.sender, tokenAmountIn);

        return tokenAmountIn;
    }

    function exitswapPoolAmountIn(uint poolAmountIn, address tokenOut)
        external
        _logs_
        _lock_
        returns (uint tokenAmountOut)
    {
        require(_bPool.isBound(tokenOut), "ERR_NOT_BOUND");
        require(_created, "ERR_NOT_CREATED");

        tokenAmountOut = _bPool.calcSingleOutGivenPoolIn(
                            _bPool.getBalance(tokenOut),
                            _bPool.getDenormalizedWeight(tokenOut),
                            _totalSupply,
                            _bPool.getTotalDenormalizedWeight(),
                            poolAmountIn,
                            _swapFee
                        );

        emit LOG_EXIT(msg.sender, tokenOut, tokenAmountOut);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(poolAmountIn);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);        // This will do an EXIT_FEE because of BP rebind

        return tokenAmountOut;
    }

    function exitswapExternAmountOut(address tokenOut, uint tokenAmountOut)
        external
        _logs_
        _lock_
        returns (uint poolAmountIn)
    {
        require(_bPool.isBound(tokenOut), "ERR_NOT_BOUND");
        require(_created, "ERR_NOT_CREATED");

        poolAmountIn = _bPool.calcPoolInGivenSingleOut(
                            _bPool.getBalance(tokenOut),
                            _bPool.getDenormalizedWeight(tokenOut),
                            _totalSupply,
                            _bPool.getTotalDenormalizedWeight(),
                            tokenAmountOut,
                            _swapFee
                        );

        emit LOG_EXIT(msg.sender, tokenOut, tokenAmountOut);

        _pullPoolShare(msg.sender, poolAmountIn);
        _burnPoolShare(poolAmountIn);
        _pushUnderlying(tokenOut, msg.sender, tokenAmountOut);

        return poolAmountIn;
    }

    function _mintPoolShare(uint amount)
        internal
    {
        _mint(amount);
    }

    function _pushPoolShare(address to, uint amount)
        internal
    {
        _push(to, amount);
    }

    function _pullPoolShare(address from, uint amount)
        internal
    {
        _pull(from, amount);
    }

    function _burnPoolShare(uint amount)
        internal
    {
        _burn(amount);
    }

}
