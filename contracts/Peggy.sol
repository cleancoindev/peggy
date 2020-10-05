// SPDX-License-Identifier: MIT

pragma solidity ^0.6.6;

import '@openzeppelin/contracts/math/SafeMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/*
    TODO list:
    - QUESTION let's remove powerThreshold? and use totalPower / 2 + 1?
*/
contract Peggy {
    using SafeMath for uint256;

    // Deposit event.
    event ValsetUpdated(address[] _validators, uint256[] _powers);
    event Deposit(address indexed _erc20, bytes32 indexed _destination, uint256 _amount);
    event Withdraw(address indexed _erc20, address indexed _destination, uint256 _amount);

    // Current PegZone ID.
    bytes32 public peggyId;

    // Amount of power to confirm operation.
    uint256 public powerThreshold;

    // Last checkpoint.
    bytes32 public lastCheckpoint;

    // Checkpoint method name hash ("checkpoint").
    bytes32 constant public CHECKPOINT_METHOD_NAME = keccak256("checkpoint");

    // Withdraw method name hash ("withdraw").
    bytes32 constant public WITHDRAW_METHOD_NAME = keccak256("withdraw");

    // List of processed withdraws.
    mapping(bytes32 => bool) withdrawIds;

    //
    // Signature utils functions.
    //

    // Utility function to verify geth style signatures
    function verifySig(
        address _signer,
        bytes32 _theHash,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) private pure returns (bool) {
        bytes32 messageDigest = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", _theHash)
        );
        return _signer == ecrecover(messageDigest, _v, _r, _s);
    }

    // Validators checkpoint.
    function makeCheckpoint(
        address[] memory _validators,
        uint256[] memory _powers,
        uint256 _valsetNonce,
        bytes32 _peggyId
    ) public pure returns (bytes32) {
        bytes32 checkpoint = keccak256(
            abi.encode(_peggyId, CHECKPOINT_METHOD_NAME, _valsetNonce, _validators, _powers)
        );

        return checkpoint;
    }

    // Check validator signatures.
    function checkValidatorSignatures(
        // The current validator set and their powers
        address[] memory _currentValidators,
        uint256[] memory _currentPowers,
        // The current validator's signatures
        uint8[] memory _v,
        bytes32[] memory _r,
        bytes32[] memory _s,
        // This is what we are checking they have signed
        bytes32 _theHash,
        uint256 _powerThreshold
    ) public pure {
        uint256 cumulativePower = 0;

        for (uint256 k = 0; k < _currentValidators.length; k = k.add(1)) {
            // If v is set to 0, this signifies that it was not possible to get a signature from this validator and we skip evaluation
            // (In a valid signature, it is either 27 or 28)
            if (_v[k] != 0) {
                // Check that the current validator has signed off on the hash
                require(
                    verifySig(_currentValidators[k], _theHash, _v[k], _r[k], _s[k]),
                    'Peggy: validator signature does not match'
                );

                // Sum up cumulative power
                cumulativePower = cumulativePower + _currentPowers[k];

                // Break early to avoid wasting gas
                if (cumulativePower > _powerThreshold) {
                    break;
                }
            }
        }

        // Check that there was enough power
        require(
            cumulativePower > _powerThreshold,
            'Peggy: submitted validator set signatures do not have enough power'
        );
    }

    // !!!IMPORTANT!!!: Only whitelisted ERC20 will be move to dfinance network.
    // Deposit ERC20 into Peggy.
    // Whitelist is stored on dfinance part.
    // Validators use transaction id as unique id for processing deposit.
    function deposit(address _erc20, bytes32 _destination, uint256 _amount) public {
        require(IERC20(_erc20).transferFrom(msg.sender, address(this), _amount), 'Peggy: ERC20 transfer failed');
        emit Deposit(_erc20, _destination, _amount);
    }

    // This updates the valset by checking that the validators in the current valset have signed off on the
    // new valset. The signatures supplied are the signatures of the current valset over the checkpoint hash
    // generated from the new valset.
    function updateValset(
        // The new version of the validator set
        address[] memory _newValidators,
        uint256[] memory _newPowers,
        uint256 _newValsetNonce,
        // The current validators that approve the change
        address[] memory _validators,
        uint256[] memory _powers,
        uint256 _valsetNonce,
        // These are arrays of the parts of the current validator's signatures
        uint8[] memory _v,
        bytes32[] memory _r,
        bytes32[] memory _s
    ) public {
        // CHECKS

        // Check that new validators and powers set is well-formed
        require(_newValidators.length == _newPowers.length, 'Peggy: Malformed new validator set');

        // Check that current validators, powers, and signatures (v,r,s) set is well-formed
        require(
            _validators.length == _powers.length &&
            _validators.length == _v.length &&
            _validators.length == _r.length &&
            _validators.length == _s.length,
            'Peggy: Malformed current validator set'
        );

        // Check that the supplied current validator set matches the saved checkpoint
        require(
            makeCheckpoint(
            _validators,
            _powers,
            _valsetNonce,
            peggyId
            ) == lastCheckpoint,
            'Peggy: Supplied current validators and powers do not match checkpoint'
        );

        // Check that the valset nonce is greater than the old one
        require(
            _newValsetNonce > _valsetNonce,
            'Peggy: New valset nonce must be greater than the current nonce'
        );

        // Check that enough current validators have signed off on the new validator set
        bytes32 newCheckpoint = makeCheckpoint(
            _newValidators,
            _newPowers,
            _newValsetNonce,
            peggyId
        );

        checkValidatorSignatures(
            _validators,
            _powers,
            _v,
            _r,
            _s,
            newCheckpoint,
            powerThreshold
        );

        /* TODO: check that new powers enough to approve anything. */

        // Stored to be used next time to validate that the valset
        // supplied by the caller is correct.
        lastCheckpoint = newCheckpoint;

        emit ValsetUpdated(_newValidators, _newPowers);
    }

    // Withdraw function.
    // Accepting id, erc20 address, destination.
    // Also requires validators, powers.
    // Anyone can submit.
    function withdraw(bytes32 _id, address _erc20, address _destination, uint256 _amount, address[] memory _validators, uint256 _valsetNonce, uint256[] memory _powers, uint8[] memory _v, bytes32[] memory _r, bytes32[] memory _s) public {
        require(
            _validators.length == _powers.length &&
            _validators.length == _v.length &&
            _validators.length == _r.length &&
            _validators.length == _s.length,
            'Peggy: malformed current validator set'
        );

        require(!withdrawIds[_id], 'Peggy: transaction id already processed');

        // Check that the supplied current validator set matches the saved checkpoint.
        require(
            makeCheckpoint(
            _validators,
            _powers,
            _valsetNonce,
            peggyId
            ) == lastCheckpoint,
            'Peggy: supplied current validators and powers do not match checkpoint'
        );

        // Get hash of the transaction.
        bytes32 confirmationHash = keccak256(
            abi.encode(peggyId, WITHDRAW_METHOD_NAME, _id, _amount, _destination)
        );

        // Check that enough current validators have signed off on the transaction batch
        checkValidatorSignatures(
            _validators,
            _powers,
            _v,
            _r,
            _s,
            confirmationHash,
            powerThreshold
        );

        require(IERC20(_erc20).transfer(_destination, _amount), 'Peggy: ERC20 transfer failed');

        withdrawIds[_id] = true;

        emit Withdraw(_erc20, _destination, _amount);
    }

    // Smart contract constructor.
    constructor(bytes32 _peggyId, uint256 _powerThreshold, address[] memory _validators, uint256[] memory _powers, uint8[] memory _v, bytes32[] memory _r, bytes32[] memory _s) public {
        require(
            _validators.length == _powers.length &&
            _validators.length == _v.length &&
            _validators.length == _r.length &&
            _validators.length == _s.length,
            'Peggy: malformed current validator set'
        );

        uint256 nonce = 0;
        bytes32 newCheckpoint = makeCheckpoint(_validators, _powers, nonce, _peggyId);

        checkValidatorSignatures(
            _validators,
            _powers,
            _v,
            _r,
            _s,
            keccak256(abi.encode(newCheckpoint, _powerThreshold)),
            _powerThreshold
        );

        lastCheckpoint = newCheckpoint;
        peggyId = _peggyId;
        powerThreshold = _powerThreshold;
    }
}
