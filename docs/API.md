# mPass API Documentation

## Overview

mPass provides privacy-preserving identity verification using Zero-Knowledge proofs on Mantle Network. This documentation covers smart contract interfaces, frontend SDK usage, and integration patterns.

## Table of Contents

1. [Smart Contracts](#smart-contracts)
2. [Frontend SDK](#frontend-sdk)
3. [Proof Types](#proof-types)
4. [Integration Examples](#integration-examples)
5. [Error Handling](#error-handling)

---

## Smart Contracts

### Deployed Addresses (Mantle Sepolia)

| Contract | Address | Purpose |
|----------|---------|---------|
| MPassRegistry | `0xcfF09905F8f18B35F5A1Ba6d2822D62B3d8c48bE` | Credential storage |
| MPassAgeVerifier | `0x073b61f5Ed26d802b05301e0E019f78Ac1A41D23` | Age proof verification |

### MPassRegistry

Stores credential commitments and tracks nullifier usage.

```solidity
interface IMPassRegistry {
    // Register a new credential commitment
    function registerCredential(bytes32 commitment) external;

    // Check if credential exists
    function credentialExists(bytes32 commitment) external view returns (bool);

    // Check if nullifier has been used
    function isNullifierUsed(bytes32 nullifier) external view returns (bool);

    // Mark nullifier as used (called by verifier contracts)
    function useNullifier(bytes32 nullifier) external;

    // Events
    event CredentialRegistered(bytes32 indexed commitment, address indexed owner);
    event NullifierUsed(bytes32 indexed nullifier);
}
```

#### Usage Example (ethers.js)

```typescript
import { ethers } from "ethers";

const registry = new ethers.Contract(
  "0xcfF09905F8f18B35F5A1Ba6d2822D62B3d8c48bE",
  [
    "function registerCredential(bytes32 commitment) external",
    "function credentialExists(bytes32 commitment) view returns (bool)",
    "function isNullifierUsed(bytes32 nullifier) view returns (bool)",
  ],
  signer
);

// Register credential
await registry.registerCredential(commitment);

// Check registration
const exists = await registry.credentialExists(commitment);
```

### MPassAgeVerifier

Verifies Groth16 proofs for age verification.

```solidity
interface IMPassAgeVerifier {
    // Verify age proof and consume nullifier
    function verifyAgeProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[8] calldata _pubSignals
    ) external returns (bool);

    // View-only verification (doesn't consume nullifier)
    function verifyProofOnly(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[8] calldata _pubSignals
    ) external view returns (bool);
}
```

#### Public Signals Format

```
_pubSignals[0] = credentialCommitment
_pubSignals[1] = nullifier
_pubSignals[2] = ageValid (always 1 if proof is valid)
_pubSignals[3] = currentYear
_pubSignals[4] = currentMonth
_pubSignals[5] = currentDay
_pubSignals[6] = minAge
_pubSignals[7] = eventId
```

---

## Frontend SDK

### Installation

```bash
npm install snarkjs circomlibjs
```

### Core Functions

#### createCredentialCommitment

Creates a cryptographic commitment from passport/ID data.

```typescript
import { createCredentialCommitment } from "@/lib/zkproof";

const credential = await createCredentialCommitment({
  documentType: "P",
  surname: "Doe",
  givenNames: "John",
  nationality: "USA",
  birthDate: "1990-06-15",
  sex: "M",
  documentNumber: "AB1234567",
  expiryDate: "2030-01-01",
  issuingCountry: "USA",
  incomeLevel: "4", // For accredited investor proof
});

// Returns:
// {
//   commitment: "0x...",     // Poseidon hash
//   nullifier: "0x...",      // Base nullifier
//   secret: "0x...",         // Random secret (keep private!)
//   birthYear: 1990,
//   birthMonth: 6,
//   birthDay: 15,
//   nationalityCode: 840,
//   incomeLevel: 4
// }
```

#### generateAgeProof

Generates a ZK proof that user is at least `minAge` years old.

```typescript
import { generateAgeProof } from "@/lib/zkproof";

const proof = await generateAgeProof(credential, 18, eventId);

// Returns:
// {
//   proof: { pi_a, pi_b, pi_c, protocol: "groth16" },
//   publicSignals: [...],
//   nullifier: "0x...",
//   commitment: "0x...",
//   calldata: { pA, pB, pC, pubSignals }  // Ready for contract
// }
```

#### generateJurisdictionProof

Proves nationality is NOT in a blocked jurisdiction list.

```typescript
import { generateJurisdictionProof, SANCTIONED_COUNTRIES } from "@/lib/zkproof";

const proof = await generateJurisdictionProof(credential);
// Throws if nationality is in SANCTIONED_COUNTRIES
```

#### generateAccreditedProof

Proves income level meets SEC accredited investor threshold ($200k+).

```typescript
import { generateAccreditedProof, ACCREDITED_MIN_LEVEL } from "@/lib/zkproof";

const proof = await generateAccreditedProof(credential);
// Throws if incomeLevel < 4
```

#### generateAMLProof

Proves user is not from an OFAC-sanctioned jurisdiction.

```typescript
import { generateAMLProof } from "@/lib/zkproof";

const proof = await generateAMLProof(credential);
// Throws if nationality is sanctioned
```

#### verifyProofLocally

Verifies a proof client-side before on-chain submission.

```typescript
import { verifyProofLocally } from "@/lib/zkproof";

const isValid = await verifyProofLocally(proof);
// Returns boolean
```

### Storage Functions

```typescript
// Save credential to localStorage
storeCredential(credential);

// Load credential from localStorage
const credential = loadCredential();

// Clear stored credential
clearCredential();

// Export credential as JSON backup
const backup = exportCredential();

// Import credential from backup
const credential = importCredential(jsonString);

// Save proof to history
saveProofToHistory(proof, "age", true);

// Get proof history
const history = getProofHistory();
```

---

## Proof Types

### Age Verification

**Circuit:** `age_verify.circom` (568 constraints)

**Proves:** User is at least X years old

**Public Inputs:**
- currentYear, currentMonth, currentDay
- minAge (threshold)
- eventId (for nullifier uniqueness)

**Private Inputs:**
- birthYear, birthMonth, birthDay
- secret

### Jurisdiction Verification

**Circuit:** `jurisdiction_verify.circom`

**Proves:** Nationality NOT in blocked list

**Public Inputs:**
- blockedCountries[10] (array of ISO country codes)
- eventId

**Private Inputs:**
- nationalityCode
- birthYear, birthMonth, birthDay
- secret

### Accredited Investor

**Circuit:** `accredited_verify.circom`

**Proves:** Income level ≥ threshold (level 4 = $200k+)

**Public Inputs:**
- minIncomeLevel (typically 4)
- eventId

**Private Inputs:**
- incomeLevel (1-6)
- birthYear, birthMonth, birthDay
- secret

### AML Compliance

**Circuit:** `aml_verify.circom`

**Proves:** Not from OFAC-sanctioned country

**Public Inputs:**
- sanctionedCountries[10]
- eventId

**Private Inputs:**
- nationalityCode
- birthYear, birthMonth, birthDay
- secret

---

## Integration Examples

### DeFi Protocol Integration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IMPassAgeVerifier} from "./interfaces/IMPassAgeVerifier.sol";

contract RestrictedPool {
    IMPassAgeVerifier public verifier;

    constructor(address _verifier) {
        verifier = IMPassAgeVerifier(_verifier);
    }

    function deposit(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[8] calldata pubSignals
    ) external payable {
        // Verify age proof (18+)
        require(
            verifier.verifyAgeProof(pA, pB, pC, pubSignals),
            "Age verification failed"
        );

        // Process deposit
        // ...
    }
}
```

### Frontend Integration

```typescript
import { useWriteContract } from "wagmi";
import { generateAgeProof } from "@/lib/zkproof";

function DepositButton({ credential }) {
  const { writeContract } = useWriteContract();

  const handleDeposit = async () => {
    // Generate proof
    const proof = await generateAgeProof(credential, 18);

    // Submit to contract
    writeContract({
      address: POOL_ADDRESS,
      abi: POOL_ABI,
      functionName: "deposit",
      args: [
        proof.calldata.pA.map(BigInt),
        proof.calldata.pB.map(row => row.map(BigInt)),
        proof.calldata.pC.map(BigInt),
        proof.calldata.pubSignals.map(BigInt),
      ],
      value: depositAmount,
    });
  };

  return <button onClick={handleDeposit}>Deposit</button>;
}
```

### Verifier Dashboard Integration

```typescript
// Parse proof from QR code or input
const proofData = JSON.parse(qrCodeData);

// Check on-chain status
const isRegistered = await registry.credentialExists(proofData.commitment);
const nullifierUsed = await registry.isNullifierUsed(proofData.nullifier);

// Verify proof validity
const isValid = proofData.verified && isRegistered && !nullifierUsed;
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Age X is below minimum Y` | User doesn't meet age requirement | Cannot generate proof |
| `Nationality is in blocked jurisdiction` | User from sanctioned country | Cannot generate proof |
| `Income level does not meet threshold` | Income too low for accredited | Update credential |
| `Failed to load circuit` | WASM not found | Check public/circuits/ |
| `Assert Failed` | Circuit constraint violation | Invalid inputs |

### Error Handling Pattern

```typescript
try {
  const proof = await generateAgeProof(credential, 18);
} catch (error) {
  if (error.message.includes("below minimum")) {
    // User is too young
  } else if (error.message.includes("WASM")) {
    // Circuit loading failed
  } else {
    // Generic error
  }
}
```

---

## Gas Costs (Mantle)

| Operation | Gas | Est. Cost |
|-----------|-----|-----------|
| Register credential | ~45,000 | ~$0.01 |
| Verify age proof | ~200,000 | ~$0.05 |
| Nullifier storage | ~20,000 | ~$0.005 |

---

## Security Considerations

1. **Secret Management:** The `secret` field must NEVER be shared. It's used to generate nullifiers.

2. **Nullifier Uniqueness:** Each (secret, eventId) pair produces a unique nullifier. Use different eventIds for different use cases.

3. **Commitment Binding:** The commitment binds the credential to the user. Changing any input produces a different commitment.

4. **Proof Freshness:** Always check `isNullifierUsed` before accepting a proof.

5. **Circuit Verification:** The on-chain verifier performs full BN254 pairing checks. Invalid proofs will revert.

---

## Network Configuration

| Network | Chain ID | RPC | Explorer |
|---------|----------|-----|----------|
| Mantle Sepolia | 5003 | `https://rpc.sepolia.mantle.xyz` | [Mantlescan](https://sepolia.mantlescan.xyz) |
| Mantle Mainnet | 5000 | `https://rpc.mantle.xyz` | [Mantlescan](https://mantlescan.xyz) |

---

## Support

- GitHub: [mPass Repository](https://github.com/your-repo/mpass)
- Documentation: This file
- Issues: GitHub Issues
