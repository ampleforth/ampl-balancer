// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.6.6;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

/**
 * @author Balancer Labs
 * @title Manage Configurable Rights for the smart pool
 *      canPauseSwapping - can setPublicSwap back to false after turning it on
 *                         by default, it is off on initialization and can only be turned on
 *      canChangeSwapFee - can setSwapFee after initialization (by default, it is fixed at create time)
 *      canChangeWeights - can bind new token weights (allowed by default in base pool)
 *      canAddRemoveTokens - can bind/unbind tokens (allowed by default in base pool)
 */
library RightsManager {

    // Type declarations

    enum Permissions { PAUSE_SWAPPING,
                       CHANGE_SWAP_FEE,
                       CHANGE_WEIGHTS,
                       ADD_REMOVE_TOKENS,
                       WHITELIST_LPS }

    struct Rights {
        bool canPauseSwapping;
        bool canChangeSwapFee;
        bool canChangeWeights;
        bool canAddRemoveTokens;
        bool canWhitelistLPs;
    }

    // State variables (can only be constants in a library)
    bool public constant DEFAULT_CAN_PAUSE_SWAPPING = false;
    bool public constant DEFAULT_CAN_CHANGE_SWAP_FEE = false;
    bool public constant DEFAULT_CAN_CHANGE_WEIGHTS = true;
    bool public constant DEFAULT_CAN_ADD_REMOVE_TOKENS = true;
    bool public constant DEFAULT_CAN_WHITELIST_LPS = false;

    // Functions

    // Used in ConfigurableRightsPool constructor, so that we don't need to hard-code the number of permissions
    // If you pass an empty array, it will construct it using the defaults
    // See note above about external vs internal
    function constructRights(bool[] calldata a) external pure returns (Rights memory) {
        if (a.length == 0) {
            return Rights(DEFAULT_CAN_PAUSE_SWAPPING,
                          DEFAULT_CAN_CHANGE_SWAP_FEE,
                          DEFAULT_CAN_CHANGE_WEIGHTS,
                          DEFAULT_CAN_ADD_REMOVE_TOKENS,
                          DEFAULT_CAN_WHITELIST_LPS);
        }
        else {
            return Rights(a[0], a[1], a[2], a[3], a[4]);
        }
    }

    /**
     * @notice Externally check permissions using the Enum
     * @param self - Rights struct containing the permissions
     * @param _permission - The permission to check
     * @return Boolean true if it has the permission
     */
    function hasPermission(Rights calldata self, Permissions _permission) external pure returns (bool) {
        if (Permissions.PAUSE_SWAPPING == _permission) {
            return self.canPauseSwapping;
        }
        else if (Permissions.CHANGE_SWAP_FEE == _permission) {
            return self.canChangeSwapFee;
        }
        else if (Permissions.CHANGE_WEIGHTS == _permission) {
            return self.canChangeWeights;
        }
        else if (Permissions.ADD_REMOVE_TOKENS == _permission) {
            return self.canAddRemoveTokens;
        }
        else if (Permissions.WHITELIST_LPS == _permission) {
            return self.canWhitelistLPs;
        }
    }
}
