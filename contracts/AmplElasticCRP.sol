pragma solidity 0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

// Imports
import "configurable-rights-pool/contracts/ConfigurableRightsPool.sol";

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
 *        The AmplElasticCRP is an extension of Balancer Lab's ConfigurableRightsPool which eliminates all IL
 *        induced by supply changes.
 *
 *        It accomplishes this by doing the following mechanism:
 *        The `resyncWeight` method will be invoked atomically after rebase through Ampleforth's orchestrator.
 *        1) When Ample expands and the pool's Ample balance is detected to increase by +x% after rebase,
 *           Ample pool's weight is increased by +x%.
 *        2) When Ample contracts and the pool's Ample balance is detected to decrease by -x% after rebase,
 *           Ample pool's weight is decreased by -x%.
 *        3) When the pool's Ample balance doesn't change, the pool's weight is unaltered.
 *
 *        These proportional weight adjustments keep the price of Amples in the underlying BPool
 *        unaffected by rebase, thus prevent arbitrageurs from extracting value away from liquidity providers.
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

        uint weightBefore = IBPool(address(bPool)).getDenormalizedWeight(token);

        uint weightAfter = BalancerSafeMath.bdiv(
            BalancerSafeMath.bmul(weightBefore, tokenBalanceAfter),
            tokenBalanceBefore
        );

        IBPool(address(bPool)).rebind(token, tokenBalanceAfter, weightAfter);
    }
}
