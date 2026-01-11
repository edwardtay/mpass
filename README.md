# MantlePass

Privacy-preserving ZK-KYC identity layer for Mantle. Verify once, prove anywhere.

## Live Demo

**Frontend:** https://mantle-mpass.vercel.app

**Verifier Dashboard:** https://mantle-mpass.vercel.app/verify

**GitHub:** https://github.com/edwardtay/mpass

## Features

- **Passport OCR Scanning** - Tesseract.js for MRZ reading with camera
- **ZK Proof Generation** - Real Groth16 proofs in browser via snarkjs
- **On-Chain Verification** - Verify proofs on Mantle Sepolia
- **Proof Types** - Age (18+), Jurisdiction, Accredited Investor, AML
- **Proof History** - Track and export generated proofs
- **Verifier Dashboard** - Third parties can verify proofs without accessing personal data

## Production ZK Stack (No Mocks)

This is a **fully functional ZK implementation**, not a demo:

- **Real Poseidon hashing** via circomlibjs - cryptographic commitments computed client-side
- **Real Groth16 proofs** via snarkjs - 568 R1CS constraints, ~2s proving time in browser
- **Real on-chain verification** - BN254 pairing checks via EVM precompiles
- **Real trusted setup** - Powers of Tau ceremony + circuit-specific phase 2

When you register a credential, the Poseidon hash is computed and stored on-chain. When you generate a proof, snarkjs runs the full Groth16 prover. The verifier contract performs actual pairing checks - invalid proofs will revert.

## Live Deployment (Mantle Sepolia)

| Contract | Address | Explorer |
|----------|---------|----------|
| Registry | `0xcfF09905F8f18B35F5A1Ba6d2822D62B3d8c48bE` | [View](https://sepolia.mantlescan.xyz/address/0xcfF09905F8f18B35F5A1Ba6d2822D62B3d8c48bE) |
| Age Verifier (Groth16) | `0x073b61f5Ed26d802b05301e0E019f78Ac1A41D23` | [View](https://sepolia.mantlescan.xyz/address/0x073b61f5Ed26d802b05301e0E019f78Ac1A41D23) |

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MantlePass Protocol                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User Device (Client-Side)                                              │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  1. Passport/ID Data → SHA256 → Field Element                   │    │
│  │  2. Generate random secret ∈ F_p (BN254 scalar field)           │    │
│  │  3. commitment = Poseidon(birthYear, birthMonth, birthDay, s)   │    │
│  │  4. nullifier = Poseidon(secret, eventId)                       │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Groth16 Proof Generation (snarkjs in browser)                  │    │
│  │  • WASM witness calculator                                      │    │
│  │  • ~600 constraints for age verification                        │    │
│  │  • Proving time: ~2-3s in browser                               │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  On-Chain Verification (Mantle)                                 │    │
│  │  • BN254 precompiles (ecAdd, ecMul, ecPairing)                  │    │
│  │  • ~200k gas for verification                                   │    │
│  │  • Nullifier consumed on-chain (one-time use per event)         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Circuit Specifications

### Age Verification Circuit (`age_verify.circom`)

**Constraints:** 568 R1CS
**Proving System:** Groth16
**Curve:** BN254

```
Public Inputs (5):
├── currentYear    (uint)
├── currentMonth   (uint)
├── currentDay     (uint)
├── minAge         (uint)
└── eventId        (uint256)

Private Inputs (4):
├── birthYear      (uint)
├── birthMonth     (uint)
├── birthDay       (uint)
└── secret         (field element)

Outputs (3):
├── credentialCommitment  = Poseidon(birthYear, birthMonth, birthDay, secret)
├── nullifier             = Poseidon(secret, eventId)
└── ageValid              = 1 (constrained)
```

**Constraint breakdown:**
- 2× Poseidon(4) for commitment: ~300 constraints
- 2× Poseidon(2) for nullifier: ~150 constraints
- LessThan/GreaterEqThan comparators: ~100 constraints
- Boolean logic (birthday calculation): ~18 constraints

### Trusted Setup

```bash
# Powers of Tau (phase 1)
pot12.ptau  # 2^12 = 4096 constraint capacity

# Circuit-specific (phase 2)
age_verify_0000.zkey  # Initial contribution
age_verify_final.zkey # After ceremony contribution
```

## Project Structure

```
MantlePass/
├── circuits/
│   ├── prod/
│   │   ├── age_verify.circom        # Production circuit
│   │   ├── build/
│   │   │   ├── age_verify.r1cs      # Compiled constraints
│   │   │   ├── age_verify.sym       # Symbol table
│   │   │   └── age_verify_js/
│   │   │       └── age_verify.wasm  # Witness generator
│   │   ├── age_verify_final.zkey    # Proving key (601KB)
│   │   └── verification_key.json    # Verification key
│   └── lib/
│       ├── merkle.circom            # Sparse Merkle Tree
│       ├── nullifier.circom         # Nullifier schemes
│       └── rsa.circom               # RSA verification
│
├── contracts/
│   └── src/
│       ├── AgeVerifier.sol          # snarkjs-generated verifier
│       ├── MPassAgeVerifier.sol     # Wrapper with nullifier tracking
│       ├── MPassRegistry.sol        # Credential registry
│       ├── MPassRegistryV2.sol      # Enhanced with Merkle roots
│       └── MPassGate.sol            # Integration base contract
│
└── frontend/
    ├── public/circuits/
    │   ├── age_verify.wasm          # Browser witness calc
    │   ├── age_verify_final.zkey    # Browser proving
    │   └── verification_key.json    # Local verification
    └── lib/
        └── zkproof.ts               # snarkjs integration
```

## Smart Contract Interface

### MPassAgeVerifier

```solidity
// Verify proof and consume nullifier (prevents replay)
function verifyAgeProof(
    uint[2] calldata _pA,
    uint[2][2] calldata _pB,
    uint[2] calldata _pC,
    uint[8] calldata _pubSignals  // [commitment, nullifier, ageValid, year, month, day, minAge, eventId]
) external returns (bool valid);

// View-only verification (for testing/simulation)
function verifyProofOnly(
    uint[2] calldata _pA,
    uint[2][2] calldata _pB,
    uint[2] calldata _pC,
    uint[8] calldata _pubSignals
) external view returns (bool);

// State queries
function isNullifierUsed(uint256 nullifier) external view returns (bool);
function isCredentialRegistered(uint256 commitment) external view returns (bool);
```

### Integration Example

```solidity
import {MPassGate} from "mpass/MPassGate.sol";

contract RestrictedVault is MPassGate {
    constructor(address _verifier) MPassGate(_verifier) {
        _setRequirements(
            true,   // requireAge
            18,     // minAge
            true,   // requireJurisdiction
            false,  // requireAccredited
            false   // requireAML
        );
    }

    function deposit(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[8] calldata pubSignals
    ) external payable {
        require(verifier.verifyAgeProof(pA, pB, pC, pubSignals), "Invalid proof");
        // User is 18+ verified - proceed
    }
}
```

## Local Development

### Prerequisites

- Node.js 18+
- Rust (for circom2)
- Foundry

### Build Circuits

```bash
cd circuits/prod

# Install circomlib
npm install

# Compile circuit (requires circom2)
circom age_verify.circom --r1cs --wasm --sym -o build

# Trusted setup
snarkjs groth16 setup build/age_verify.r1cs pot12.ptau age_verify_0000.zkey
snarkjs zkey contribute age_verify_0000.zkey age_verify_final.zkey --name="local" -e="$(openssl rand -hex 32)"
snarkjs zkey export verificationkey age_verify_final.zkey verification_key.json
snarkjs zkey export solidityverifier age_verify_final.zkey AgeVerifier.sol
```

### Deploy Contracts

```bash
cd contracts

# Install dependencies
forge install

# Build
forge build

# Deploy to Mantle Sepolia
forge create src/MPassAgeVerifier.sol:MPassAgeVerifier \
    --rpc-url https://rpc.sepolia.mantle.xyz \
    --private-key $PRIVATE_KEY
```

### Run Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

## Proof Generation (Browser)

```typescript
import * as snarkjs from "snarkjs";

const input = {
  // Private
  birthYear: "1990",
  birthMonth: "6",
  birthDay: "15",
  secret: "123456789...",  // Random field element
  // Public
  currentYear: "2026",
  currentMonth: "1",
  currentDay: "12",
  minAge: "18",
  eventId: "1",
};

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  "/circuits/age_verify.wasm",
  "/circuits/age_verify_final.zkey"
);

// Format for contract
const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
```

## Security Model

**What's proven:**
- User knows a secret `s` and birthdate `(y,m,d)` such that:
  - `commitment = Poseidon(y, m, d, s)` matches registered commitment
  - `age(y,m,d) >= minAge` at current date
  - `nullifier = Poseidon(s, eventId)` is fresh

**What's NOT revealed:**
- Actual birthdate
- User's secret
- Any PII

**Nullifier properties:**
- Deterministic: same (secret, eventId) → same nullifier
- Unlinkable: different eventIds → different nullifiers
- One-time: nullifier consumed on verification

## Gas Costs (Mantle)

| Operation | Gas |
|-----------|-----|
| Proof verification | ~200,000 |
| Nullifier storage | ~20,000 |
| Commitment registration | ~45,000 |

## Network Configuration

| Network | Chain ID | RPC |
|---------|----------|-----|
| Mantle Sepolia | 5003 | `https://rpc.sepolia.mantle.xyz` |
| Mantle Mainnet | 5000 | `https://rpc.mantle.xyz` |

## Documentation

- [API Documentation](./docs/API.md) - Full integration guide
- [Circuit Compilation](./circuits/prod/COMPILE.md) - How to compile circuits

## Circuits

| Circuit | Purpose | Status |
|---------|---------|--------|
| `age_verify.circom` | Prove age ≥ threshold | ✅ Compiled |
| `jurisdiction_verify.circom` | Prove not in blocked list | 📝 Written |
| `accredited_verify.circom` | Prove income ≥ $200k | 📝 Written |
| `aml_verify.circom` | Prove not OFAC sanctioned | 📝 Written |

## References

- [Groth16](https://eprint.iacr.org/2016/260.pdf) - On the Size of Pairing-based Non-interactive Arguments
- [Poseidon](https://eprint.iacr.org/2019/458.pdf) - ZK-friendly hash function
- [circom](https://docs.circom.io/) - Circuit compiler
- [snarkjs](https://github.com/iden3/snarkjs) - JavaScript zk-SNARK implementation

## License

MIT
