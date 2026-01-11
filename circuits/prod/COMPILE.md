# Circuit Compilation Guide

## Prerequisites

Install circom2 (Rust version):

```bash
# Install Rust if not present
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install circom2
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom
```

## Compile Circuits

### 1. Age Verify (Already compiled)
```bash
circom age_verify.circom --r1cs --wasm --sym -o build
```

### 2. Jurisdiction Verify
```bash
circom jurisdiction_verify.circom --r1cs --wasm --sym -o build

# Generate keys
snarkjs groth16 setup build/jurisdiction_verify.r1cs pot12.ptau jurisdiction_0000.zkey
snarkjs zkey contribute jurisdiction_0000.zkey jurisdiction_final.zkey --name="local" -e="$(openssl rand -hex 32)"
snarkjs zkey export verificationkey jurisdiction_final.zkey jurisdiction_vkey.json
snarkjs zkey export solidityverifier jurisdiction_final.zkey JurisdictionVerifier.sol
```

### 3. Accredited Verify
```bash
circom accredited_verify.circom --r1cs --wasm --sym -o build

snarkjs groth16 setup build/accredited_verify.r1cs pot12.ptau accredited_0000.zkey
snarkjs zkey contribute accredited_0000.zkey accredited_final.zkey --name="local" -e="$(openssl rand -hex 32)"
snarkjs zkey export verificationkey accredited_final.zkey accredited_vkey.json
snarkjs zkey export solidityverifier accredited_final.zkey AccreditedVerifier.sol
```

### 4. AML Verify
```bash
circom aml_verify.circom --r1cs --wasm --sym -o build

snarkjs groth16 setup build/aml_verify.r1cs pot12.ptau aml_0000.zkey
snarkjs zkey contribute aml_0000.zkey aml_final.zkey --name="local" -e="$(openssl rand -hex 32)"
snarkjs zkey export verificationkey aml_final.zkey aml_vkey.json
snarkjs zkey export solidityverifier aml_final.zkey AMLVerifier.sol
```

## Circuit Specifications

| Circuit | Purpose | Constraints (est.) |
|---------|---------|-------------------|
| age_verify | Prove age ≥ threshold | ~568 |
| jurisdiction_verify | Prove not in blocked list | ~400 |
| accredited_verify | Prove income ≥ threshold | ~350 |
| aml_verify | Prove not OFAC sanctioned | ~450 |

## Copy to Frontend

After compilation, copy WASM and zkey files:

```bash
cp build/jurisdiction_verify_js/jurisdiction_verify.wasm ../frontend/public/circuits/
cp jurisdiction_final.zkey ../frontend/public/circuits/
cp jurisdiction_vkey.json ../frontend/public/circuits/

# Repeat for accredited and aml
```
