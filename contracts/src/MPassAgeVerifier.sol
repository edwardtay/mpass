// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgeVerifier.sol";

/**
 * @title MPassAgeVerifier
 * @notice Production ZK age verification for mPass
 * @dev Wraps snarkjs-generated Groth16 verifier with nullifier tracking
 */
contract MPassAgeVerifier {
    Groth16Verifier public immutable verifier;

    // Nullifier tracking to prevent proof reuse
    mapping(uint256 => bool) public nullifierUsed;

    // Credential commitment registry
    mapping(uint256 => bool) public registeredCredentials;

    // Events
    event CredentialRegistered(uint256 indexed commitment, address indexed owner);
    event AgeVerified(uint256 indexed nullifier, uint256 minAge, uint256 eventId);
    event NullifierConsumed(uint256 indexed nullifier);

    constructor() {
        verifier = new Groth16Verifier();
    }

    /**
     * @notice Register a credential commitment on-chain
     * @param commitment Poseidon hash of (birthYear, birthMonth, birthDay, secret)
     */
    function registerCredential(uint256 commitment) external {
        require(!registeredCredentials[commitment], "Already registered");
        registeredCredentials[commitment] = true;
        emit CredentialRegistered(commitment, msg.sender);
    }

    /**
     * @notice Verify age proof and consume nullifier
     * @param _pA Proof point A
     * @param _pB Proof point B
     * @param _pC Proof point C
     * @param _pubSignals Public signals [commitment, nullifier, ageValid, currentYear, currentMonth, currentDay, minAge, eventId]
     * @return valid Whether proof is valid and age requirement met
     */
    function verifyAgeProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[8] calldata _pubSignals
    ) external returns (bool valid) {
        // Extract public signals
        uint256 commitment = _pubSignals[0];
        uint256 nullifier = _pubSignals[1];
        uint256 ageValid = _pubSignals[2];

        // Check nullifier hasn't been used
        require(!nullifierUsed[nullifier], "Nullifier already used");

        // Check credential is registered (optional - can be disabled for permissionless)
        // require(registeredCredentials[commitment], "Credential not registered");

        // Verify the ZK proof
        valid = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);

        if (valid) {
            // Mark nullifier as used
            nullifierUsed[nullifier] = true;
            emit NullifierConsumed(nullifier);
            emit AgeVerified(nullifier, _pubSignals[6], _pubSignals[7]);
        }

        // Ensure ageValid signal is 1 (proof constraint guarantees this, but double-check)
        require(ageValid == 1, "Age requirement not met");

        return valid;
    }

    /**
     * @notice View-only proof verification (doesn't consume nullifier)
     * @dev Use this for off-chain verification or testing
     */
    function verifyProofOnly(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[8] calldata _pubSignals
    ) external view returns (bool) {
        return verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
    }

    /**
     * @notice Check if a nullifier has been used
     */
    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return nullifierUsed[nullifier];
    }

    /**
     * @notice Check if a credential is registered
     */
    function isCredentialRegistered(uint256 commitment) external view returns (bool) {
        return registeredCredentials[commitment];
    }
}
