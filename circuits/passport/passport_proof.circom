pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../lib/nullifier.circom";
include "../lib/merkle.circom";

/*
 * Passport Verification Circuit for mPass
 *
 * Based on OpenPassport and Rarimo patterns.
 *
 * Two-phase design:
 * 1. Register: Verify passport signature, create commitment
 * 2. Disclose: Prove attributes from registered credential
 *
 * This circuit handles the Disclose phase.
 * Register phase requires RSA verification (separate heavy circuit).
 */

template PassportDisclose(registryLevels, revocationLevels) {
    // === Private Inputs ===
    signal input secret;

    // Passport data (MRZ fields)
    signal input documentType;      // 1 = passport, 2 = ID card
    signal input issuingCountry;    // ISO 3166-1 numeric
    signal input nationality;       // ISO 3166-1 numeric
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input expiryYear;
    signal input expiryMonth;
    signal input expiryDay;
    signal input gender;            // 0 = unspecified, 1 = male, 2 = female
    signal input documentNumber;    // Hashed for privacy

    // Registry proof
    signal input registryPathElements[registryLevels];
    signal input registryPathIndices[registryLevels];

    // Revocation proof
    signal input revocationSiblings[revocationLevels];
    signal input isRevocationEmpty;
    signal input revocationOldKey;
    signal input revocationOldValue;

    // === Public Inputs ===
    signal input registryRoot;
    signal input revocationRoot;
    signal input eventId;
    signal input currentTimestamp;  // Unix timestamp

    // Disclosure selectors (1 = reveal, 0 = hide)
    signal input revealNationality;
    signal input revealAge;
    signal input revealGender;

    // Verification parameters
    signal input minAge;            // For age check
    signal input allowedCountries[10]; // Countries NOT in blocked list

    // === Outputs ===
    signal output nullifier;
    signal output passportCommitment;

    // Disclosed values (0 if not revealed)
    signal output disclosedNationality;
    signal output disclosedAgeOver;
    signal output disclosedGender;
    signal output isValid;

    // 1. Compute passport commitment (hash of all fields)
    component passportHasher = Poseidon(12);
    passportHasher.inputs[0] <== secret;
    passportHasher.inputs[1] <== documentType;
    passportHasher.inputs[2] <== issuingCountry;
    passportHasher.inputs[3] <== nationality;
    passportHasher.inputs[4] <== birthYear;
    passportHasher.inputs[5] <== birthMonth;
    passportHasher.inputs[6] <== birthDay;
    passportHasher.inputs[7] <== expiryYear;
    passportHasher.inputs[8] <== expiryMonth;
    passportHasher.inputs[9] <== expiryDay;
    passportHasher.inputs[10] <== gender;
    passportHasher.inputs[11] <== documentNumber;

    passportCommitment <== passportHasher.out;

    // 2. Verify in registry
    component registryProof = MerkleTreeVerifier(registryLevels);
    registryProof.leaf <== passportCommitment;
    registryProof.root <== registryRoot;
    for (var i = 0; i < registryLevels; i++) {
        registryProof.pathElements[i] <== registryPathElements[i];
        registryProof.pathIndices[i] <== registryPathIndices[i];
    }
    signal registryValid <== registryProof.valid;

    // 3. Verify not revoked
    component revocationCheck = SparseMerkleTreeNonInclusion(revocationLevels);
    revocationCheck.key <== passportCommitment;
    revocationCheck.root <== revocationRoot;
    revocationCheck.isOld0 <== isRevocationEmpty;
    revocationCheck.oldKey <== revocationOldKey;
    revocationCheck.oldValue <== revocationOldValue;
    for (var i = 0; i < revocationLevels; i++) {
        revocationCheck.siblings[i] <== revocationSiblings[i];
    }
    signal notRevoked <== revocationCheck.valid;

    // 4. Check passport not expired
    // Convert expiry to timestamp and compare
    // Simplified: compare year/month/day components
    signal expiryTimestamp <== expiryYear * 10000 + expiryMonth * 100 + expiryDay;
    signal currentDate <== currentTimestamp; // Assume preprocessed to YYYYMMDD format

    component expiryCheck = GreaterThan(32);
    expiryCheck.in[0] <== expiryTimestamp;
    expiryCheck.in[1] <== currentDate;
    signal notExpired <== expiryCheck.out;

    // 5. Selective disclosure

    // Nationality (only if selector = 1)
    disclosedNationality <== nationality * revealNationality;

    // Age check (only if selector = 1)
    signal currentYear <== currentTimestamp \ 10000; // Extract year
    signal baseAge <== currentYear - birthYear;

    component ageCheck = GreaterEqThan(8);
    ageCheck.in[0] <== baseAge;
    ageCheck.in[1] <== minAge;
    disclosedAgeOver <== ageCheck.out * revealAge * minAge;

    // Gender (only if selector = 1)
    disclosedGender <== gender * revealGender;

    // 6. Nationality/jurisdiction check (not in blocked countries)
    // Check nationality is in allowed list
    component countryChecks[10];
    signal countryMatches[10];
    for (var i = 0; i < 10; i++) {
        countryChecks[i] = IsEqual();
        countryChecks[i].in[0] <== nationality;
        countryChecks[i].in[1] <== allowedCountries[i];
        countryMatches[i] <== countryChecks[i].out;
    }

    // At least one match means allowed (or allowedCountries[0] = 0 means no restriction)
    component noRestriction = IsZero();
    noRestriction.in <== allowedCountries[0];

    signal matchSum <== countryMatches[0] + countryMatches[1] + countryMatches[2] +
                        countryMatches[3] + countryMatches[4] + countryMatches[5] +
                        countryMatches[6] + countryMatches[7] + countryMatches[8] +
                        countryMatches[9];

    component hasMatch = GreaterThan(8);
    hasMatch.in[0] <== matchSum;
    hasMatch.in[1] <== 0;

    signal countryAllowed <== noRestriction.out + (1 - noRestriction.out) * hasMatch.out;

    // 7. Generate nullifier
    component nullifierGen = EventBoundNullifier();
    nullifierGen.secret <== secret;
    nullifierGen.eventId <== eventId;
    nullifier <== nullifierGen.nullifier;

    // 8. Final validity
    isValid <== registryValid * notRevoked * notExpired * countryAllowed;
    isValid === 1;
}

component main {public [
    registryRoot,
    revocationRoot,
    eventId,
    currentTimestamp,
    revealNationality,
    revealAge,
    revealGender,
    minAge,
    allowedCountries
]} = PassportDisclose(20, 20);
