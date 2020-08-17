pragma solidity 0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

// Imports
import "configurable-rights-pool/contracts/ConfigurableRightsPool.sol";
import "./Math.sol";

/**
 * @author Ampleforth engineering team & Balancer Labs
 *
 * Reference:
 * https://github.com/balancer-labs/configurable-rights-pool/blob/master/contracts/templates/ElasticSupplyPool.sol
 *
 * @title Ampl Elastic Configurable Rights Pool.
 *
 * @dev   Extension of Balancer labs' configurable rights pool (smart-pool).
 *        Amples are a dynamic supply tokens, supply and individual balances change daily by a Rebase operation.
 *        In constant-function markets, Ampleforth's rebases result in Impermanent Loss (IL) liquidity providers.
 *        The AmplElasticCRP is an extension of Balancer Lab's ConfigurableRightsPool which mitigates IL
 *        induced by supply changes.
 *
 *        It accomplishes this by doing the following mechanism:
 *        The `resyncWeight` method will be invoked atomically after rebase through Ampleforth's orchestrator.
 *
 *        Weights: {w_ampl, w_t1 ... w_tn}
 *
 *        Rebase_change: x% (Ample's supply changes by x%, can be positive or negative)
 *
 *        Ample target weight: w_ampl_target = (1+x)/100 * w_ampl
 *
 *        w_ampl_new = sqrt(w_ampl, w_ampl_target)  // geometric mean
 *        for i in tn:
 *           w_ti_new = (w_ampl_new * w_ti) / w_ampl_target
 *
 */
contract AmplElasticCRP is ConfigurableRightsPool {
    constructor(
        address factoryAddress,
        string memory tokenSymbolString,
        address[] memory tokens,
        uint[] memory startBalances,
        uint[] memory startWeights,
        uint swapFee,
        RightsManager.Rights memory rights
    )
    public
    ConfigurableRightsPool(factoryAddress, tokenSymbolString, tokens, startBalances, startWeights, swapFee, rights) { }

    /*
     * @param token The address of the token in the underlying BPool to be weight adjusted.
     * @dev Checks if the token's current pool balance has deviated from cached balance,
     *      if so it adjusts the token's weights proportional to the deviation.
     *      The underlying BPool enforces bounds on MIN_WEIGHTS=1e18, MAX_WEIGHT=50e18 and TOTAL_WEIGHT=50e18.
     *      NOTE: The BPool.rebind function CAN REVERT if the updated weights go beyond the enforced bounds.
     */
    function resyncWeight(address token)
        external
        logs
        lock
        needsBPool
    {

        require(
            this.hasPermission(RightsManager.Permissions.CHANGE_WEIGHTS),
            "ERR_NOT_CONFIGURABLE_WEIGHTS");

        require(
            ConfigurableRightsPool.getStartBlock() == 0,
            "ERR_NO_UPDATE_DURING_GRADUAL");

        require(
            IBPool(address(bPool)).isBound(token),
            "ERR_NOT_BOUND");

        // get cached balance
        uint tokenBalanceBefore = IBPool(address(bPool)).getBalance(token);

        // sync balance
        IBPool(address(bPool)).gulp(token);

        // get new balance
        uint tokenBalanceAfter = IBPool(address(bPool)).getBalance(token);

        // No-Op
        if(tokenBalanceBefore == tokenBalanceAfter) {
            return;
        }

        // current token weight
        uint tokenWeightBefore = IBPool(address(bPool)).getDenormalizedWeight(token);

        // target token weight = RebaseRatio * previous token weight
        uint tokenWeightTarget = BalancerSafeMath.bdiv(
            BalancerSafeMath.bmul(tokenWeightBefore, tokenBalanceAfter),
            tokenBalanceBefore
        );

        // new token weight = sqrt(current token weight * target token weight)
        uint tokenWeightAfter = Math.sqrt(
            BalancerSafeMath.bdiv(
                BalancerSafeMath.bmul(tokenWeightBefore, tokenWeightTarget),
                1
            )
        );


        address[] memory tokens = IBPool(address(bPool)).getCurrentTokens();
        for(uint i=0; i<tokens.length; i++){
            if(tokens[i] == token) {

                // adjust weight
                IBPool(address(bPool)).rebind(token, tokenBalanceAfter, tokenWeightAfter);

            } else {

                uint otherWeightBefore = IBPool(address(bPool)).getDenormalizedWeight(tokens[i]);
                uint otherBalance = bPool.getBalance(tokens[i]);

                // other token weight = (other token weight before * new token weight) / target token weight
                uint otherWeightAfter = BalancerSafeMath.bdiv(
                    BalancerSafeMath.bmul(tokenWeightAfter, otherWeightBefore),
                    tokenWeightTarget
                );

                // adjust weight
                IBPool(address(bPool)).rebind(tokens[i], otherBalance, otherWeightAfter);
            }
        }
    }
}
