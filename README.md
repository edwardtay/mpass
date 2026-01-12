# MantlePass

**ZK-KYC identity layer for Mantle.** Groth16 proofs for age, jurisdiction, accreditation, and AML compliance—no PII disclosure.

## Live

| | URL |
|--|-----|
| App | https://mantle-mpass.vercel.app |
| Verifier | https://mantle-mpass.vercel.app/verify |

## Contracts (Mantle Sepolia, Verified)

| Contract | Address |
|----------|---------|
| MPassRegistryV2 | [`0xcfF09905F8f18B35F5A1Ba6d2822D62B3d8c48bE`](https://sepolia.mantlescan.xyz/address/0xcfF09905F8f18B35F5A1Ba6d2822D62B3d8c48bE#code) |
| MPassAgeVerifier | [`0x073b61f5Ed26d802b05301e0E019f78Ac1A41D23`](https://sepolia.mantlescan.xyz/address/0x073b61f5Ed26d802b05301e0E019f78Ac1A41D23#code) |

## Stack

- **Circuit**: circom2 → 568 R1CS constraints
- **Proving**: Groth16 via snarkjs (browser, ~2s)
- **Hash**: Poseidon (circomlibjs)
- **Curve**: BN254
- **Verification**: EVM precompiles (ecAdd, ecMul, ecPairing)

## Architecture

```
credential = {birthYear, birthMonth, birthDay, secret}
commitment = Poseidon(birthYear, birthMonth, birthDay, secret)  // on-chain
nullifier  = Poseidon(secret, eventId)                          // per-use

Circuit proves:
  ∃ secret, birthdate s.t.
    commitment = Poseidon(birthdate, secret) ∧
    age(birthdate) ≥ minAge ∧
    nullifier = Poseidon(secret, eventId)
```

## Circuit I/O

```
Public:  [currentYear, currentMonth, currentDay, minAge, eventId]
Private: [birthYear, birthMonth, birthDay, secret]
Output:  [commitment, nullifier, ageValid=1]
```

## Contract Interface

```solidity
// MPassAgeVerifier
function verifyAgeProof(
    uint[2] calldata _pA,
    uint[2][2] calldata _pB,
    uint[2] calldata _pC,
    uint[8] calldata _pubSignals  // [commitment, nullifier, ageValid, year, month, day, minAge, eventId]
) external returns (bool);

function verifyProofOnly(...) external view returns (bool);  // no state change
function isNullifierUsed(uint256) external view returns (bool);
function isCredentialRegistered(uint256) external view returns (bool);
function registerCredential(uint256 commitment) external;

// MPassRegistryV2
function credentialExists(bytes32) external view returns (bool);
function isNullifierUsed(bytes32) external view returns (bool);
function useNullifier(bytes32) external;
function useEventNullifier(uint256 eventId, bytes32 nullifier) external;
function updateRoots(bytes32 registryRoot, bytes32 revocationRoot) external;
```

## Integration

```solidity
contract RestrictedVault {
    IMPassAgeVerifier verifier;

    function deposit(
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[8] calldata pubSignals
    ) external payable {
        require(verifier.verifyAgeProof(pA, pB, pC, pubSignals), "ZK");
        // proceed
    }
}
```

## Client Proof Generation

```typescript
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();
const secret = crypto.getRandomValues(new Uint8Array(31));
const commitment = poseidon.F.toString(poseidon([birthYear, birthMonth, birthDay, secret]));

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  { birthYear, birthMonth, birthDay, secret, currentYear, currentMonth, currentDay, minAge, eventId },
  "/circuits/age_verify.wasm",
  "/circuits/age_verify_final.zkey"
);

const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
```

## Gas (Mantle)

| Op | Gas |
|----|-----|
| verifyAgeProof | ~200k |
| registerCredential | ~45k |
| useNullifier | ~20k |

## Build

```bash
# Circuits
cd circuits/prod
circom age_verify.circom --r1cs --wasm --sym -o build
snarkjs groth16 setup build/age_verify.r1cs pot12.ptau age_verify_0000.zkey
snarkjs zkey contribute age_verify_0000.zkey age_verify_final.zkey --name="1" -e="$(openssl rand -hex 32)"
snarkjs zkey export solidityverifier age_verify_final.zkey AgeVerifier.sol

# Contracts
cd contracts && forge build
forge create src/MPassAgeVerifier.sol:MPassAgeVerifier --rpc-url https://rpc.sepolia.mantle.xyz --private-key $PK

# Frontend
cd frontend && npm i && npm run dev
```

## Security

**Proven**: User knows `(secret, birthdate)` producing `commitment` where `age ≥ minAge`

**Hidden**: Actual birthdate, secret, all PII

**Nullifier**: `H(secret, eventId)` — deterministic per-event, unlinkable across events, single-use

## Circuits

| Circuit | Constraints | Status |
|---------|-------------|--------|
| age_verify | 568 | Deployed |
| jurisdiction_verify | ~800 | Written |
| accredited_verify | ~600 | Written |
| aml_verify | ~800 | Written |

## References

- [Groth16](https://eprint.iacr.org/2016/260.pdf)
- [Poseidon](https://eprint.iacr.org/2019/458.pdf)
- [circom](https://docs.circom.io/)
- [snarkjs](https://github.com/iden3/snarkjs)

## License

MIT
