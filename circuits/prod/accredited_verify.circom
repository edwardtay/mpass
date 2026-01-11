pragma circom 2.1.8;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * Accredited Investor Verification Circuit for mPass
 *
 * Proves: User's income level meets SEC accredited investor threshold
 *         without revealing actual income
 *
 * Income Levels:
 *   1 = Under $50k
 *   2 = $50k - $100k
 *   3 = $100k - $200k
 *   4 = $200k - $500k  (accredited threshold)
 *   5 = $500k - $1M
 *   6 = Over $1M
 *
 * Privacy guarantees:
 * - Actual income level is never revealed (private input)
 * - Only proves income >= threshold level
 * - Nullifier prevents proof reuse
 */

template AccreditedVerify() {
    // Private inputs
    signal input incomeLevel;     // 1-6 scale
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input secret;

    // Public inputs
    signal input minIncomeLevel;  // Threshold (typically 4 for $200k+)
    signal input eventId;

    // Outputs
    signal output credentialCommitment;
    signal output nullifier;
    signal output isAccredited;

    // Step 1: Compute credential commitment
    component commitmentHasher = Poseidon(4);
    commitmentHasher.inputs[0] <== birthYear;
    commitmentHasher.inputs[1] <== birthMonth;
    commitmentHasher.inputs[2] <== birthDay;
    commitmentHasher.inputs[3] <== secret;
    credentialCommitment <== commitmentHasher.out;

    // Step 2: Generate nullifier unique to this proof type
    // nullifier = Poseidon(secret, eventId + 2000) - offset for accredited proofs
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== eventId + 2000;
    nullifier <== nullifierHasher.out;

    // Step 3: Verify income level meets minimum
    // Using 4 bits is enough for values 1-6
    component incomeCheck = GreaterEqThan(4);
    incomeCheck.in[0] <== incomeLevel;
    incomeCheck.in[1] <== minIncomeLevel;

    isAccredited <== incomeCheck.out;

    // Step 4: Range check - income level must be between 1 and 6
    component minBound = GreaterEqThan(4);
    minBound.in[0] <== incomeLevel;
    minBound.in[1] <== 1;

    component maxBound = LessEqThan(4);
    maxBound.in[0] <== incomeLevel;
    maxBound.in[1] <== 6;

    // Constraint: income must be in valid range
    minBound.out === 1;
    maxBound.out === 1;

    // Constraint: proof is only valid if income >= threshold
    isAccredited === 1;
}

// Public: minIncomeLevel, eventId
// Private: incomeLevel, birthYear, birthMonth, birthDay, secret
component main {public [minIncomeLevel, eventId]} = AccreditedVerify();
