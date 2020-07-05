pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract WeightedPoolMock {
    using SafeMath for uint256;

    mapping(address => uint256) private _weights;

    function getDenormalizedWeight(address token) external view returns (uint) {
        return _weights[token];
    }

    function updateWeight(address token, uint256 newWeight) external {
        _weights[token] = newWeight;
    }
}
