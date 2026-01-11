pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../lib/nullifier.circom";
include "../lib/merkle.circom";

/*
 * Identity Proof Circuit for mPass
 *
 * Core identity circuit that:
 * 1. Proves ownership of a registered credential
 * 2. Generates nullifier to prevent double-use
 * 3. Verifies credential is not revoked
 * 4. Optionally binds to specific event/scope
 *
 * Based on Semaphore and OpenPassport patterns.
 */

template IdentityProof(registryLevels, revocationLevels) {
    // === Private Inputs ===
    signal input secret;                    // User's secret key
    signal input credentialData[4];         // Credential attributes [type, value1, value2, expiry]

    // Registry Merkle proof
    signal input registryPathElements[registryLevels];
    signal input registryPathIndices[registryLevels];

    // Revocation SMT proof
    signal input revocationSiblings[revocationLevels];
    signal input isRevocationEmpty;
    signal input revocationOldKey;
    signal input revocationOldValue;

    // === Public Inputs ===
    signal input registryRoot;              // Current registry Merkle root
    signal input revocationRoot;            // Current revocation SMT root
    signal input eventId;                   // Event/scope identifier (0 for global)
    signal input currentTimestamp;          // Current time for expiry check

    // === Outputs ===
    signal output nullifier;                // Unique nullifier for this proof
    signal output credentialCommitment;     // Blinded credential identifier

    // 1. Compute credential commitment
    component credCommitment = Poseidon(5);
    credCommitment.inputs[0] <== secret;
    for (var i = 0; i < 4; i++) {
        credCommitment.inputs[i + 1] <== credentialData[i];
    }
    credentialCommitment <== credCommitment.out;

    // 2. Verify credential is in registry
    component registryProof = MerkleTreeVerifier(registryLevels);
    registryProof.leaf <== credentialCommitment;
    registryProof.root <== registryRoot;
    for (var i = 0; i < registryLevels; i++) {
        registryProof.pathElements[i] <== registryPathElements[i];
        registryProof.pathIndices[i] <== registryPathIndices[i];
    }
    registryProof.valid === 1;

    // 3. Verify credential is NOT revoked
    component revocationCheck = SparseMerkleTreeNonInclusion(revocationLevels);
    revocationCheck.key <== credentialCommitment;
    revocationCheck.root <== revocationRoot;
    revocationCheck.isOld0 <== isRevocationEmpty;
    revocationCheck.oldKey <== revocationOldKey;
    revocationCheck.oldValue <== revocationOldValue;
    for (var i = 0; i < revocationLevels; i++) {
        revocationCheck.siblings[i] <== revocationSiblings[i];
    }
    revocationCheck.valid === 1;

    // 4. Check credential not expired
    // credentialData[3] is expiry timestamp
    component expiryCheck = GreaterThan(64);
    expiryCheck.in[0] <== credentialData[3];  // expiry
    expiryCheck.in[1] <== currentTimestamp;
    expiryCheck.out === 1;

    // 5. Generate nullifier (event-bound if eventId != 0)
    component eventNullifier = EventBoundNullifier();
    eventNullifier.secret <== secret;
    eventNullifier.eventId <== eventId;

    component globalNullifier = GlobalNullifier();
    globalNullifier.secret <== secret;
    globalNullifier.credentialCommitment <== credentialCommitment;

    // Select nullifier based on whether eventId is 0
    component isGlobal = IsZero();
    isGlobal.in <== eventId;

    component nullifierMux = Mux1();
    nullifierMux.c[0] <== eventNullifier.nullifier;
    nullifierMux.c[1] <== globalNullifier.nullifier;
    nullifierMux.s <== isGlobal.out;

    nullifier <== nullifierMux.out;
}

// Default configuration: 20-level registry tree, 20-level revocation tree
component main {public [registryRoot, revocationRoot, eventId, currentTimestamp]} = IdentityProof(20, 20);
