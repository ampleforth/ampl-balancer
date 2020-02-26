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

import "./LiquidityBootstrappingPool.sol";

contract LBPFactory {
    event LOG_NEW_LBP(
        address indexed caller,
        address indexed pool
    );

    mapping(address=>bool) private _isLbp;

    constructor() public {}

    function isLbp(address b)
        external view returns (bool)
    {
        return _isLbp[b];
    }

    function newLbp(
        address factoryAddress,
        address[] calldata tokens,
        uint256[] calldata startBalances,
        uint256[] calldata startWeights,
        uint256[] calldata endWeights,
        uint256[3] calldata params // startBlock, endBlock, swapFee
    )
        external
        returns (LiquidityBootstrappingPool)
    {
        LiquidityBootstrappingPool lbp = new LiquidityBootstrappingPool(
            factoryAddress,
            tokens,
            startBalances,
            startWeights,
            endWeights,
            params
        );
        _isLbp[address(lbp)] = true;
        emit LOG_NEW_LBP(msg.sender, address(lbp));
        lbp.setController(msg.sender);
        return lbp;
    }
    
}
