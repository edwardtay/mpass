pragma circom 2.1.8;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * AML (Anti-Money Laundering) Verification Circuit for mPass
 *
 * Proves: User is NOT from an OFAC-sanctioned jurisdiction
 *         without revealing actual nationality
 *
 * OFAC Sanctioned Countries (as of 2024):
 *   408 = North Korea (PRK)
 *   364 = Iran (IRN)
 *   760 = Syria (SYR)
 *   729 = Sudan (SDN)
 *   192 = Cuba (CUB)
 *   643 = Russia (RUS)
 *   112 = Belarus (BLR)
 *   862 = Venezuela (VEN)
 *   104 = Myanmar (MMR)
 *   716 = Zimbabwe (ZWE)
 *
 * Privacy guarantees:
 * - Nationality is never revealed (private input)
 * - Only proves NOT sanctioned
 * - Commitment hash proves same identity across proofs
 */

template AMLVerify(numSanctioned) {
    // Private inputs
    signal input nationalityCode;
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input secret;

    // Public inputs - OFAC sanctioned country codes
    signal input sanctionedCountries[numSanctioned];
    signal input eventId;

    // Outputs
    signal output credentialCommitment;
    signal output nullifier;
    signal output sanctionsListHash;  // Hash of the sanctions list for verification
    signal output isCompliant;

    // Step 1: Compute credential commitment
    component commitmentHasher = Poseidon(4);
    commitmentHasher.inputs[0] <== birthYear;
    commitmentHasher.inputs[1] <== birthMonth;
    commitmentHasher.inputs[2] <== birthDay;
    commitmentHasher.inputs[3] <== secret;
    credentialCommitment <== commitmentHasher.out;

    // Step 2: Generate nullifier unique to AML proof type
    // nullifier = Poseidon(secret, eventId + 3000) - offset for AML proofs
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== eventId + 3000;
    nullifier <== nullifierHasher.out;

    // Step 3: Hash the sanctions list (for on-chain verification)
    component listHasher = Poseidon(numSanctioned);
    for (var i = 0; i < numSanctioned; i++) {
        listHasher.inputs[i] <== sanctionedCountries[i];
    }
    sanctionsListHash <== listHasher.out;

    // Step 4: Check nationality is NOT equal to any sanctioned country
    component notEqual[numSanctioned];
    signal notSanctioned[numSanctioned];

    for (var i = 0; i < numSanctioned; i++) {
        notEqual[i] = IsEqual();
        notEqual[i].in[0] <== nationalityCode;
        notEqual[i].in[1] <== sanctionedCountries[i];
        // notSanctioned[i] = 1 if NOT equal (compliant)
        notSanctioned[i] <== 1 - notEqual[i].out;
    }

    // Step 5: AND all notSanctioned signals - must pass ALL checks
    signal accumulated[numSanctioned];
    accumulated[0] <== notSanctioned[0];

    for (var i = 1; i < numSanctioned; i++) {
        accumulated[i] <== accumulated[i-1] * notSanctioned[i];
    }

    isCompliant <== accumulated[numSanctioned - 1];

    // Constraint: proof is only valid if not sanctioned
    isCompliant === 1;
}

// 10 OFAC sanctioned countries
// Public: sanctionedCountries array, eventId
// Private: nationalityCode, birthYear, birthMonth, birthDay, secret
component main {public [sanctionedCountries, eventId]} = AMLVerify(10);
