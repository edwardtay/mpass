pragma circom 2.1.8;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * Production Age Verification Circuit for mPass
 *
 * Proves: User is at least minAge years old without revealing birthdate
 *
 * Privacy guarantees:
 * - Birth date is never revealed (private inputs)
 * - Only proves age >= threshold
 * - Nullifier prevents proof reuse
 * - Commitment binds to specific identity
 */

template AgeVerify() {
    // Private inputs (not declared in main's public list)
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input secret;

    // Public inputs (declared in main's public list)
    signal input currentYear;
    signal input currentMonth;
    signal input currentDay;
    signal input minAge;
    signal input eventId;

    // Outputs
    signal output credentialCommitment;
    signal output nullifier;
    signal output ageValid;

    // Step 1: Compute credential commitment
    // commitment = Poseidon(birthYear, birthMonth, birthDay, secret)
    component commitmentHasher = Poseidon(4);
    commitmentHasher.inputs[0] <== birthYear;
    commitmentHasher.inputs[1] <== birthMonth;
    commitmentHasher.inputs[2] <== birthDay;
    commitmentHasher.inputs[3] <== secret;
    credentialCommitment <== commitmentHasher.out;

    // Step 2: Generate nullifier
    // nullifier = Poseidon(secret, eventId) - unique per event
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== eventId;
    nullifier <== nullifierHasher.out;

    // Step 3: Calculate age
    signal baseAge <== currentYear - birthYear;

    // Check if birthday has passed this year
    component monthLess = LessThan(8);
    monthLess.in[0] <== currentMonth;
    monthLess.in[1] <== birthMonth;

    component monthEqual = IsEqual();
    monthEqual.in[0] <== currentMonth;
    monthEqual.in[1] <== birthMonth;

    component dayLess = LessThan(8);
    dayLess.in[0] <== currentDay;
    dayLess.in[1] <== birthDay;

    // birthdayNotPassed = monthLess OR (monthEqual AND dayLess)
    signal monthEqualAndDayLess <== monthEqual.out * dayLess.out;
    signal birthdayNotPassed <== monthLess.out + monthEqualAndDayLess - monthLess.out * monthEqualAndDayLess;

    // Actual age = baseAge - 1 if birthday hasn't passed
    signal actualAge <== baseAge - birthdayNotPassed;

    // Step 4: Verify age meets minimum
    component ageCheck = GreaterEqThan(8);
    ageCheck.in[0] <== actualAge;
    ageCheck.in[1] <== minAge;

    ageValid <== ageCheck.out;

    // Constraint: proof is only valid if age >= minAge
    ageValid === 1;
}

// Public inputs: currentYear, currentMonth, currentDay, minAge, eventId
// Private inputs: birthYear, birthMonth, birthDay, secret
component main {public [currentYear, currentMonth, currentDay, minAge, eventId]} = AgeVerify();
