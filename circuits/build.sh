#!/bin/bash

# mPass Circuit Build Script
# Compiles Circom circuits and generates Solidity verifiers

set -e

echo "=== mPass Circuit Builder ==="

# Create build directories
mkdir -p build/age build/jurisdiction build/accreditation
mkdir -p ../contracts/src/verifiers

# Check for powers of tau file
if [ ! -f "pot12_final.ptau" ]; then
    echo "Downloading powers of tau file..."
    wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_12.ptau -O pot12_final.ptau
fi

echo ""
echo "=== Building Age Proof Circuit ==="
circom age/age_proof.circom --r1cs --wasm --sym -o build/age
snarkjs groth16 setup build/age/age_proof.r1cs pot12_final.ptau build/age/age_proof_0000.zkey
snarkjs zkey contribute build/age/age_proof_0000.zkey build/age/age_proof.zkey --name="mPass" -v -e="$(head -c 64 /dev/urandom | xxd -p)"
snarkjs zkey export solidityverifier build/age/age_proof.zkey ../contracts/src/verifiers/AgeVerifier.sol
snarkjs zkey export verificationkey build/age/age_proof.zkey build/age/verification_key.json

echo ""
echo "=== Building Jurisdiction Proof Circuit ==="
circom jurisdiction/jurisdiction_proof.circom --r1cs --wasm --sym -o build/jurisdiction
snarkjs groth16 setup build/jurisdiction/jurisdiction_proof.r1cs pot12_final.ptau build/jurisdiction/jurisdiction_proof_0000.zkey
snarkjs zkey contribute build/jurisdiction/jurisdiction_proof_0000.zkey build/jurisdiction/jurisdiction_proof.zkey --name="mPass" -v -e="$(head -c 64 /dev/urandom | xxd -p)"
snarkjs zkey export solidityverifier build/jurisdiction/jurisdiction_proof.zkey ../contracts/src/verifiers/JurisdictionVerifier.sol
snarkjs zkey export verificationkey build/jurisdiction/jurisdiction_proof.zkey build/jurisdiction/verification_key.json

echo ""
echo "=== Building Accredited Proof Circuit ==="
circom accreditation/accredited_proof.circom --r1cs --wasm --sym -o build/accreditation
snarkjs groth16 setup build/accreditation/accredited_proof.r1cs pot12_final.ptau build/accreditation/accredited_proof_0000.zkey
snarkjs zkey contribute build/accreditation/accredited_proof_0000.zkey build/accreditation/accredited_proof.zkey --name="mPass" -v -e="$(head -c 64 /dev/urandom | xxd -p)"
snarkjs zkey export solidityverifier build/accreditation/accredited_proof.zkey ../contracts/src/verifiers/AccreditedVerifier.sol
snarkjs zkey export verificationkey build/accreditation/accredited_proof.zkey build/accreditation/verification_key.json

echo ""
echo "=== Build Complete ==="
echo "Verifier contracts exported to: ../contracts/src/verifiers/"
echo ""
echo "Next steps:"
echo "1. cd ../contracts"
echo "2. forge build"
echo "3. forge test"
