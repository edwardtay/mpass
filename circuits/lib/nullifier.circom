pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * Nullifier Library for mPass
 *
 * Nullifiers prevent double-use of credentials while preserving privacy.
 * Based on patterns from OpenPassport, Rarimo, and Semaphore.
 *
 * Types:
 * 1. Global Nullifier - One per credential, prevents any reuse
 * 2. Event-bound Nullifier - Unique per (credential, eventId), allows reuse across events
 * 3. Time-bound Nullifier - Expires after time period, allows renewal
 */

/// @title GlobalNullifier
/// @notice Generates a unique nullifier from secret + credential commitment
/// @dev nullifier = Poseidon(secret, credentialCommitment)
template GlobalNullifier() {
    signal input secret;
    signal input credentialCommitment;
    signal output nullifier;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== credentialCommitment;

    nullifier <== hasher.out;
}

/// @title EventBoundNullifier
/// @notice Generates nullifier bound to specific event (e.g., airdrop, vote)
/// @dev nullifier = Poseidon(secret, Poseidon(secret), eventId)
/// @dev This pattern from Rarimo prevents correlation across events
template EventBoundNullifier() {
    signal input secret;
    signal input eventId;
    signal output nullifier;

    // Derive internal commitment from secret
    component innerHash = Poseidon(1);
    innerHash.inputs[0] <== secret;

    // Combine with eventId
    component outerHash = Poseidon(3);
    outerHash.inputs[0] <== secret;
    outerHash.inputs[1] <== innerHash.out;
    outerHash.inputs[2] <== eventId;

    nullifier <== outerHash.out;
}

/// @title TimeBoundNullifier
/// @notice Nullifier that includes epoch for time-based renewal
/// @dev nullifier = Poseidon(secret, credentialCommitment, epoch)
template TimeBoundNullifier() {
    signal input secret;
    signal input credentialCommitment;
    signal input epoch; // e.g., block.timestamp / EPOCH_DURATION
    signal output nullifier;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== credentialCommitment;
    hasher.inputs[2] <== epoch;

    nullifier <== hasher.out;
}

/// @title IdentityCommitment
/// @notice Creates identity commitment from secret (Semaphore-style)
/// @dev Used to register identity without revealing secret
template IdentityCommitment() {
    signal input secret;
    signal input identityNullifier;
    signal output commitment;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== identityNullifier;

    commitment <== hasher.out;
}

/// @title BlindedCommitment
/// @notice Creates blinded commitment for privacy (OpenPassport pattern)
/// @dev blindedCommitment = Poseidon(commitment, blindingFactor)
template BlindedCommitment() {
    signal input commitment;
    signal input blindingFactor;
    signal output blindedCommitment;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== commitment;
    hasher.inputs[1] <== blindingFactor;

    blindedCommitment <== hasher.out;
}
