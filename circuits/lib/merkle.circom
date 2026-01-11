pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/*
 * Merkle Tree Library for mPass
 *
 * Implements:
 * 1. Standard Merkle inclusion proof
 * 2. Sparse Merkle Tree non-membership proof (for revocation)
 */

/// @title MerkleTreeInclusionProof
/// @notice Proves a leaf is included in a Merkle tree
/// @param levels The depth of the Merkle tree
template MerkleTreeInclusionProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels]; // 0 = left, 1 = right
    signal output root;

    component hashers[levels];
    component mux[levels];

    signal levelHashes[levels + 1];
    levelHashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // Constrain pathIndices to be binary
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Select order based on path index
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== levelHashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== levelHashes[i];
        mux[i].s <== pathIndices[i];

        // Hash the pair
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        levelHashes[i + 1] <== hashers[i].out;
    }

    root <== levelHashes[levels];
}

/// @title MerkleTreeVerifier
/// @notice Verifies a leaf is in a tree with known root
template MerkleTreeVerifier(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input root;
    signal output valid;

    component merkleProof = MerkleTreeInclusionProof(levels);
    merkleProof.leaf <== leaf;
    for (var i = 0; i < levels; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }

    component isEqual = IsEqual();
    isEqual.in[0] <== merkleProof.root;
    isEqual.in[1] <== root;

    valid <== isEqual.out;
}

/// @title SparseMerkleTreeNonInclusion
/// @notice Proves a key is NOT in a Sparse Merkle Tree (for revocation checking)
/// @dev Uses the standard SMT non-membership proof pattern
/// @param levels The depth of the SMT
template SparseMerkleTreeNonInclusion(levels) {
    signal input key;           // The key we're proving is NOT in the tree
    signal input root;          // SMT root
    signal input siblings[levels];
    signal input isOld0;        // 1 if the leaf is empty (old value was 0)
    signal input oldKey;        // The key of the existing leaf (if any)
    signal input oldValue;      // The value of the existing leaf (if any)
    signal output valid;

    // Convert key to bits for path
    component keyBits = Num2Bits(levels);
    keyBits.in <== key;

    // If isOld0 = 1: We're proving an empty slot
    // If isOld0 = 0: We're proving a different key exists at that path

    // Hash the old leaf (or 0 if empty)
    component oldLeafHasher = Poseidon(2);
    oldLeafHasher.inputs[0] <== oldKey;
    oldLeafHasher.inputs[1] <== oldValue;

    // Select between empty (0) and existing leaf hash
    component leafMux = Mux1();
    leafMux.c[0] <== oldLeafHasher.out;
    leafMux.c[1] <== 0;
    leafMux.s <== isOld0;

    // Verify the Merkle path
    component merkleProof = MerkleTreeInclusionProof(levels);
    merkleProof.leaf <== leafMux.out;
    for (var i = 0; i < levels; i++) {
        merkleProof.pathElements[i] <== siblings[i];
        merkleProof.pathIndices[i] <== keyBits.out[i];
    }

    // Check computed root matches provided root
    component rootCheck = IsEqual();
    rootCheck.in[0] <== merkleProof.root;
    rootCheck.in[1] <== root;

    // If not empty, verify oldKey != key (different key at this path)
    component keyNotEqual = IsEqual();
    keyNotEqual.in[0] <== key;
    keyNotEqual.in[1] <== oldKey;

    // Valid if: (isOld0 = 1) OR (oldKey != key)
    signal keyDifferent <== 1 - keyNotEqual.out;
    signal validNonMembership <== isOld0 + (1 - isOld0) * keyDifferent;

    valid <== rootCheck.out * validNonMembership;
}

/// @title CredentialRegistryProof
/// @notice Combined proof: credential in registry AND not in revocation tree
template CredentialRegistryProof(registryLevels, revocationLevels) {
    // Registry inclusion
    signal input credentialHash;
    signal input registryRoot;
    signal input registryPath[registryLevels];
    signal input registryIndices[registryLevels];

    // Revocation non-inclusion
    signal input revocationRoot;
    signal input revocationSiblings[revocationLevels];
    signal input isRevocationEmpty;
    signal input revocationOldKey;
    signal input revocationOldValue;

    signal output valid;

    // Verify credential is in registry
    component registryVerifier = MerkleTreeVerifier(registryLevels);
    registryVerifier.leaf <== credentialHash;
    registryVerifier.root <== registryRoot;
    for (var i = 0; i < registryLevels; i++) {
        registryVerifier.pathElements[i] <== registryPath[i];
        registryVerifier.pathIndices[i] <== registryIndices[i];
    }

    // Verify credential is NOT revoked
    component revocationCheck = SparseMerkleTreeNonInclusion(revocationLevels);
    revocationCheck.key <== credentialHash;
    revocationCheck.root <== revocationRoot;
    revocationCheck.isOld0 <== isRevocationEmpty;
    revocationCheck.oldKey <== revocationOldKey;
    revocationCheck.oldValue <== revocationOldValue;
    for (var i = 0; i < revocationLevels; i++) {
        revocationCheck.siblings[i] <== revocationSiblings[i];
    }

    // Both must be valid
    valid <== registryVerifier.valid * revocationCheck.valid;
}
