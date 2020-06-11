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

import "./ConfigurableRightsPool.sol";

contract CRPFactory {
    event LOG_NEW_CRP(
        address indexed caller,
        address indexed pool
    );

    mapping(address=>bool) private _isCrp;

    function isCrp(address b)
        external view returns (bool)
    {
        return _isCrp[b];
    }

    function newCrp(
        address factoryAddress,
        address[] calldata tokens,
        uint256[] calldata startBalances,
        uint256[] calldata startWeights,
        uint swapFee,
        uint minimumWeightChangeBlockPeriod,
        uint addTokenTimeLockInBlocks,
        bool[4] calldata rights
    )
        external
        returns (ConfigurableRightsPool)
    {
        ConfigurableRightsPool crp = new ConfigurableRightsPool(
            factoryAddress,
            tokens,
            startBalances,
            startWeights,
            swapFee,
            minimumWeightChangeBlockPeriod,
            addTokenTimeLockInBlocks,
            rights
        );
        _isCrp[address(crp)] = true;
        emit LOG_NEW_CRP(msg.sender, address(crp));
        crp.setController(msg.sender);
        return crp;
    }

}
