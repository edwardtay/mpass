pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * Accredited Investor Proof Circuit for mPass
 *
 * Proves: User meets accredited investor criteria
 * Based on SEC Rule 501 thresholds (simplified)
 *
 * Private Inputs:
 *   - netWorth: User's net worth in USD (excluding primary residence)
 *   - annualIncome: User's annual income in USD
 *   - professionalCertification: 1 if has Series 7/65/82, 0 otherwise
 *   - secret: Random secret for commitment
 *
 * Public Inputs:
 *   - netWorthThreshold: Minimum net worth (default: $1,000,000)
 *   - incomeThreshold: Minimum income (default: $200,000 individual / $300,000 joint)
 *   - credentialCommitment: Hash of private inputs
 *
 * Accredited if ANY of:
 *   - Net worth >= $1M (excl. primary residence)
 *   - Income >= $200K (individual) for last 2 years
 *   - Professional certification (Series 7, 65, 82)
 */

template AccreditedProof() {
    // Private inputs
    signal input netWorth;
    signal input annualIncome;
    signal input professionalCertification; // 0 or 1
    signal input secret;

    // Public inputs
    signal input netWorthThreshold;  // 1000000 (1M USD)
    signal input incomeThreshold;    // 200000 (200K USD)
    signal input credentialCommitment;

    // Output
    signal output accreditedValid;

    // 1. Verify credential commitment
    component hasher = Poseidon(4);
    hasher.inputs[0] <== netWorth;
    hasher.inputs[1] <== annualIncome;
    hasher.inputs[2] <== professionalCertification;
    hasher.inputs[3] <== secret;

    credentialCommitment === hasher.out;

    // 2. Check net worth criteria
    component netWorthCheck = GreaterEqThan(64);
    netWorthCheck.in[0] <== netWorth;
    netWorthCheck.in[1] <== netWorthThreshold;

    // 3. Check income criteria
    component incomeCheck = GreaterEqThan(64);
    incomeCheck.in[0] <== annualIncome;
    incomeCheck.in[1] <== incomeThreshold;

    // 4. Professional certification is already 0 or 1
    // Constrain to boolean
    professionalCertification * (1 - professionalCertification) === 0;

    // 5. Accredited if ANY criteria met (OR logic)
    // netWorthCheck.out + incomeCheck.out + professionalCertification >= 1
    signal sumCriteria <== netWorthCheck.out + incomeCheck.out + professionalCertification;

    component atLeastOne = GreaterEqThan(8);
    atLeastOne.in[0] <== sumCriteria;
    atLeastOne.in[1] <== 1;

    accreditedValid <== atLeastOne.out;

    // Must be accredited
    accreditedValid === 1;
}

component main {public [netWorthThreshold, incomeThreshold, credentialCommitment]} = AccreditedProof();
