// SPDX-License-Identifier: GNUV3

pragma solidity 0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

interface IBPool {
    function gulp(address token) external;
}

interface IAmplElasticCRP {
    function resyncWeight(address token) external;
}

contract MockBPool {
    event Gulp(address token);

    function gulp(address token) external {
        emit Gulp(token);
        return;
    }
}

contract MockCRPPool is MockBPool{
    event Resync(address token);

    function resyncWeight(address token) external {
        emit Resync(token);
        return;
    }
}


contract MockCRPPoolRevertWithString is MockBPool {
    function resyncWeight(address token) external {
        require(false, "FAILED");
        return;
    }
}

contract MockCRPPoolRevert is MockBPool {
    function resyncWeight(address token) external {
        require(false);
        return;
    }
}
