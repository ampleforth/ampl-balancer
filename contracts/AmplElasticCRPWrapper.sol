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

contract AmplElasticCRPWrapper {
    event LogErrorReason(string reason);

    function safeResync(address _crp, IBPool _bpool, address token) public {


        try IAmplElasticCRP(_crp).resyncWeight(token) {

            // no-op : Resync call success

        }

        catch Error(string memory reason) {

            IBPool(_bpool).gulp(token);

            emit LogErrorReason(reason);


        }

        catch (bytes memory reason) {

            IBPool(_bpool).gulp(token);

            emit LogErrorReason(string(reason));

        }

    }
}
