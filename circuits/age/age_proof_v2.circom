pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../lib/nullifier.circom";
include "../lib/merkle.circom";

/*
 * Enhanced Age Proof Circuit for mPass (v2)
 *
 * Improvements over v1:
 * - Nullifier to prevent proof reuse
 * - Merkle proof for credential registry
 * - Revocation checking
 * - Event binding for scoped proofs
 * - Blinded commitment for privacy
 *
 * Proves: User's age >= minAge without revealing birthdate
 */

template AgeProofV2(registryLevels, revocationLevels) {
    // === Private Inputs ===
    signal input secret;
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input blindingFactor;

    // Registry proof
    signal input registryPathElements[registryLevels];
    signal input registryPathIndices[registryLevels];

    // Revocation proof
    signal input revocationSiblings[revocationLevels];
    signal input isRevocationEmpty;
    signal input revocationOldKey;
    signal input revocationOldValue;

    // === Public Inputs ===
    signal input minAge;
    signal input currentYear;
    signal input currentMonth;
    signal input currentDay;
    signal input registryRoot;
    signal input revocationRoot;
    signal input eventId;           // Scope for nullifier (0 = global)

    // === Outputs ===
    signal output nullifier;
    signal output blindedCommitment;
    signal output ageValid;

    // 1. Compute credential commitment
    component credHasher = Poseidon(4);
    credHasher.inputs[0] <== birthYear;
    credHasher.inputs[1] <== birthMonth;
    credHasher.inputs[2] <== birthDay;
    credHasher.inputs[3] <== secret;

    signal credentialCommitment <== credHasher.out;

    // 2. Create blinded commitment (for privacy)
    component blinder = BlindedCommitment();
    blinder.commitment <== credentialCommitment;
    blinder.blindingFactor <== blindingFactor;
    blindedCommitment <== blinder.blindedCommitment;

    // 3. Verify in registry
    component registryProof = MerkleTreeVerifier(registryLevels);
    registryProof.leaf <== credentialCommitment;
    registryProof.root <== registryRoot;
    for (var i = 0; i < registryLevels; i++) {
        registryProof.pathElements[i] <== registryPathElements[i];
        registryProof.pathIndices[i] <== registryPathIndices[i];
    }
    registryProof.valid === 1;

    // 4. Verify not revoked
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

    // 5. Calculate age
    signal baseAge <== currentYear - birthYear;

    // Check if birthday has passed this year
    component monthLess = LessThan(8);
    monthLess.in[0] <== currentMonth;
    monthLess.in[1] <== birthMonth;

    component dayLess = LessThan(8);
    dayLess.in[0] <== currentDay;
    dayLess.in[1] <== birthDay;

    component monthEqual = IsEqual();
    monthEqual.in[0] <== currentMonth;
    monthEqual.in[1] <== birthMonth;

    // Birthday hasn't passed if month < birthMonth OR (month == birthMonth AND day < birthDay)
    signal birthdayNotPassed <== monthLess.out + monthEqual.out * dayLess.out;
    signal actualAge <== baseAge - birthdayNotPassed;

    // 6. Verify age >= minAge
    component ageCheck = GreaterEqThan(8);
    ageCheck.in[0] <== actualAge;
    ageCheck.in[1] <== minAge;
    ageValid <== ageCheck.out;
    ageValid === 1;

    // 7. Generate nullifier
    component eventNullifier = EventBoundNullifier();
    eventNullifier.secret <== secret;
    eventNullifier.eventId <== eventId;

    component globalNullifier = GlobalNullifier();
    globalNullifier.secret <== secret;
    globalNullifier.credentialCommitment <== credentialCommitment;

    component isGlobal = IsZero();
    isGlobal.in <== eventId;

    component nullifierMux = Mux1();
    nullifierMux.c[0] <== eventNullifier.nullifier;
    nullifierMux.c[1] <== globalNullifier.nullifier;
    nullifierMux.s <== isGlobal.out;

    nullifier <== nullifierMux.out;
}

component main {public [
    minAge,
    currentYear,
    currentMonth,
    currentDay,
    registryRoot,
    revocationRoot,
    eventId
]} = AgeProofV2(20, 20);
