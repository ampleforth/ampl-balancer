pragma solidity 0.5.0;

import "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

interface IConfigurableRightsPool {
    function getCurrentRights() external view returns (bool[4] memory rights);
    function getDenormalizedWeight(address token) external view returns (uint);
    function updateWeight(address token, uint256 newWeight) external;
}

contract AmplBalancer is Ownable {
    using SafeMath for uint256;

    IERC20 public ampl;
    IConfigurableRightsPool public pool;

    uint256 private recordedAmplSupply;

    constructor(IERC20 _ampl, IConfigurableRightsPool _pool) public {
        ampl = _ampl;
        pool = _pool;

        // TODO: what to verify here?
        // 1) ampl is part of the pool?
        // 2) pool has the appropriate rights?
        // pool.getCurrentRights()

        recordAmplSupply();
    }

    // TODO: implement access control for balancer pool and this contract
    // If supply changes by x%, change ampl weight by x%
    function rebalance() external onlyOwner {
        uint256 currentAmplSupply = ampl.totalSupply();

        uint256 absSupplyDelta;
        bool negativeSupplyChange;
        if(currentAmplSupply >= recordedAmplSupply) {
            absSupplyDelta = currentAmplSupply.sub(recordedAmplSupply);
            // negativeSupplyChange = false;
        } else {
            absSupplyDelta = recordedAmplSupply.sub(currentAmplSupply);
            negativeSupplyChange = true;
        }

        if(absSupplyDelta == 0) {
            return;
        }

        uint256 amplWeight = pool.getDenormalizedWeight(address(ampl));
        uint256 amplWeightDeviation = amplWeight.mul(absSupplyDelta)
            .div(recordedAmplSupply);

        uint256 newAmplWeight;
        if(negativeSupplyChange) {
            newAmplWeight = amplWeight.sub(amplWeightDeviation);
        } else {
            newAmplWeight = amplWeight.add(amplWeightDeviation);
        }

        // NOTE: This call could fail downstream if `deltaBalance` is not zero
        // we might have to call gulp first: pool.bPool.gulp() ?
        pool.updateWeight(address(ampl), newAmplWeight);

        recordAmplSupply();
    }

    function recordAmplSupply() private {
        recordedAmplSupply = ampl.totalSupply();
    }
}
