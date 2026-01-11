pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/*
 * Jurisdiction Proof Circuit for mPass
 *
 * Proves: User is NOT in a restricted jurisdiction
 * Uses a Merkle proof to show country is NOT in the blocked list
 *
 * Private Inputs:
 *   - countryCode: User's country code (ISO 3166-1 numeric)
 *   - secret: Random secret for commitment
 *
 * Public Inputs:
 *   - blockedCountriesRoot: Merkle root of blocked countries
 *   - credentialCommitment: Poseidon(countryCode, secret)
 *
 * This is a simplified version - production would use:
 * - Non-membership proof in a Sparse Merkle Tree
 * - Or exclusion proof against a sorted list
 */

template JurisdictionProof(numBlockedCountries) {
    // Private inputs
    signal input countryCode;
    signal input secret;

    // Public inputs
    signal input blockedCountries[numBlockedCountries]; // List of blocked country codes
    signal input credentialCommitment;

    // Output
    signal output jurisdictionValid;

    // 1. Verify credential commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== countryCode;
    hasher.inputs[1] <== secret;

    credentialCommitment === hasher.out;

    // 2. Check country is not in blocked list
    // For each blocked country, check if NOT equal to user's country
    component isNotBlocked[numBlockedCountries];
    signal notBlockedAccum[numBlockedCountries + 1];
    notBlockedAccum[0] <== 1;

    for (var i = 0; i < numBlockedCountries; i++) {
        isNotBlocked[i] = IsEqual();
        isNotBlocked[i].in[0] <== countryCode;
        isNotBlocked[i].in[1] <== blockedCountries[i];

        // If equal to blocked country, this becomes 0
        notBlockedAccum[i + 1] <== notBlockedAccum[i] * (1 - isNotBlocked[i].out);
    }

    jurisdictionValid <== notBlockedAccum[numBlockedCountries];

    // Constrain: must not be in any blocked jurisdiction
    jurisdictionValid === 1;
}

// Default: check against 10 blocked jurisdictions
component main {public [blockedCountries, credentialCommitment]} = JurisdictionProof(10);
