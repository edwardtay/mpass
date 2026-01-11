import { Address } from "viem";

// Contract addresses - deployed on Mantle Sepolia
export const CONTRACTS = {
  // Mantle Sepolia Testnet
  5003: {
    registry: "0xcfF09905F8f18B35F5A1Ba6d2822D62B3d8c48bE" as Address,
    verifier: "0xf98a4A0482d534c004cdB9A3358fd71347c4395B" as Address,
    // Production ZK Age Verifier (Groth16)
    ageVerifier: "0x073b61f5Ed26d802b05301e0E019f78Ac1A41D23" as Address,
  },
  // Mantle Mainnet
  5000: {
    registry: "" as Address,
    verifier: "" as Address,
    ageVerifier: "" as Address,
  },
} as const;

// ABIs
export const REGISTRY_ABI = [
  {
    name: "isCredentialValid",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "credentialHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getCredential",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "credentialHash", type: "bytes32" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "credentialHash", type: "bytes32" },
          { name: "credentialType", type: "uint8" },
          { name: "issuedAt", type: "uint64" },
          { name: "expiresAt", type: "uint64" },
          { name: "revoked", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getUserCredentials",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "credentialType", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bytes32[]" }],
  },
] as const;

// Production Groth16 Age Verifier ABI
export const AGE_VERIFIER_ABI = [
  {
    name: "verifyAgeProof",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_pA", type: "uint256[2]" },
      { name: "_pB", type: "uint256[2][2]" },
      { name: "_pC", type: "uint256[2]" },
      { name: "_pubSignals", type: "uint256[8]" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
  {
    name: "verifyProofOnly",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_pA", type: "uint256[2]" },
      { name: "_pB", type: "uint256[2][2]" },
      { name: "_pC", type: "uint256[2]" },
      { name: "_pubSignals", type: "uint256[8]" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "registerCredential",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "uint256" }],
    outputs: [],
  },
  {
    name: "isNullifierUsed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isCredentialRegistered",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "commitment", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "CredentialRegistered",
    type: "event",
    inputs: [
      { name: "commitment", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    name: "AgeVerified",
    type: "event",
    inputs: [
      { name: "nullifier", type: "uint256", indexed: true },
      { name: "minAge", type: "uint256", indexed: false },
      { name: "eventId", type: "uint256", indexed: false },
    ],
  },
  {
    name: "NullifierConsumed",
    type: "event",
    inputs: [{ name: "nullifier", type: "uint256", indexed: true }],
  },
] as const;

export const VERIFIER_ABI = [
  {
    name: "verifyAge",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "minAge", type: "uint8" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
  {
    name: "verifyJurisdiction",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
  {
    name: "verifyAccredited",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
  {
    name: "verifyAML",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "proof", type: "bytes" },
    ],
    outputs: [{ name: "valid", type: "bool" }],
  },
] as const;
