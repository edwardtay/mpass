pragma circom 2.1.8;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * Jurisdiction Verification Circuit for mPass
 *
 * Proves: User's nationality is NOT in a blocked jurisdiction list
 *         without revealing the actual nationality
 *
 * Privacy guarantees:
 * - Nationality code is never revealed (private input)
 * - Only proves NOT in blocked list
 * - Nullifier prevents proof reuse
 */

template JurisdictionVerify(numBlocked) {
    // Private inputs
    signal input nationalityCode;
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input secret;

    // Public inputs - blocked country codes
    signal input blockedCountries[numBlocked];
    signal input eventId;

    // Outputs
    signal output credentialCommitment;
    signal output nullifier;
    signal output isAllowed;

    // Step 1: Compute credential commitment (same as age circuit for consistency)
    component commitmentHasher = Poseidon(4);
    commitmentHasher.inputs[0] <== birthYear;
    commitmentHasher.inputs[1] <== birthMonth;
    commitmentHasher.inputs[2] <== birthDay;
    commitmentHasher.inputs[3] <== secret;
    credentialCommitment <== commitmentHasher.out;

    // Step 2: Generate nullifier unique to this proof type
    // nullifier = Poseidon(secret, eventId + 1000) - offset to differentiate from age proofs
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== eventId + 1000;
    nullifier <== nullifierHasher.out;

    // Step 3: Check nationality is NOT equal to any blocked country
    component notEqual[numBlocked];
    signal notBlocked[numBlocked];

    for (var i = 0; i < numBlocked; i++) {
        notEqual[i] = IsEqual();
        notEqual[i].in[0] <== nationalityCode;
        notEqual[i].in[1] <== blockedCountries[i];
        // notBlocked[i] = 1 if NOT equal (allowed)
        notBlocked[i] <== 1 - notEqual[i].out;
    }

    // Step 4: AND all notBlocked signals - must pass ALL checks
    signal accumulated[numBlocked];
    accumulated[0] <== notBlocked[0];

    for (var i = 1; i < numBlocked; i++) {
        accumulated[i] <== accumulated[i-1] * notBlocked[i];
    }

    isAllowed <== accumulated[numBlocked - 1];

    // Constraint: proof is only valid if not in blocked list
    isAllowed === 1;
}

// 10 blocked countries for jurisdiction check
// Public: blockedCountries array, eventId
// Private: nationalityCode, birthYear, birthMonth, birthDay, secret
component main {public [blockedCountries, eventId]} = JurisdictionVerify(10);
