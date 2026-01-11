pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * Age Proof Circuit for mPass
 *
 * Proves: User's age >= minAge without revealing actual birthdate
 *
 * Private Inputs:
 *   - birthYear: User's birth year
 *   - birthMonth: User's birth month
 *   - birthDay: User's birth day
 *   - secret: Random secret for commitment
 *
 * Public Inputs:
 *   - minAge: Minimum age required
 *   - currentYear: Current year for calculation
 *   - currentMonth: Current month
 *   - currentDay: Current day
 *   - credentialCommitment: Poseidon hash of (birthYear, birthMonth, birthDay, secret)
 *
 * Output:
 *   - ageValid: 1 if age >= minAge, 0 otherwise
 */

template AgeProof() {
    // Private inputs
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input secret;

    // Public inputs
    signal input minAge;
    signal input currentYear;
    signal input currentMonth;
    signal input currentDay;
    signal input credentialCommitment;

    // Output
    signal output ageValid;

    // 1. Verify credential commitment
    component hasher = Poseidon(4);
    hasher.inputs[0] <== birthYear;
    hasher.inputs[1] <== birthMonth;
    hasher.inputs[2] <== birthDay;
    hasher.inputs[3] <== secret;

    credentialCommitment === hasher.out;

    // 2. Calculate age
    signal baseAge <== currentYear - birthYear;

    // 3. Check if birthday has passed this year
    component monthCheck = LessThan(8);
    monthCheck.in[0] <== currentMonth;
    monthCheck.in[1] <== birthMonth;

    component dayCheck = LessThan(8);
    dayCheck.in[0] <== currentDay;
    dayCheck.in[1] <== birthDay;

    component monthEqual = IsEqual();
    monthEqual.in[0] <== currentMonth;
    monthEqual.in[1] <== birthMonth;

    // Birthday hasn't passed if: currentMonth < birthMonth OR (currentMonth == birthMonth AND currentDay < birthDay)
    signal birthdayNotPassed <== monthCheck.out + monthEqual.out * dayCheck.out;

    // Actual age = baseAge - 1 if birthday hasn't passed
    signal actualAge <== baseAge - birthdayNotPassed;

    // 4. Compare age with minimum
    component ageCheck = GreaterEqThan(8);
    ageCheck.in[0] <== actualAge;
    ageCheck.in[1] <== minAge;

    ageValid <== ageCheck.out;

    // Constrain output to be 1 (proof only valid if age >= minAge)
    ageValid === 1;
}

component main {public [minAge, currentYear, currentMonth, currentDay, credentialCommitment]} = AgeProof();
