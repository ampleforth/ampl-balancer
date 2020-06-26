// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.6.6;

abstract contract BColor {
    function getColor()
        external view virtual
        returns (bytes32);
}

contract BBronze is BColor {
    function getColor()
        external view override
        returns (bytes32) {
            return bytes32("BRONZE");
        }
}
