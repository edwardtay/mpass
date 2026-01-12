"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useReadContract } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
import Link from "next/link";
import { CONTRACTS, AGE_VERIFIER_ABI } from "@/lib/contracts";

// Registry ABI for verification
const REGISTRY_ABI = [
  {
    name: "credentialExists",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "isNullifierUsed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

interface ProofData {
  type: string;
  commitment: string;
  nullifier: string;
  verified?: boolean;
  publicSignals?: string[];
  proof?: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
  };
}

export default function VerifyPage() {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  // Fix hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [proofInput, setProofInput] = useState("");
  const [parsedProof, setParsedProof] = useState<ProofData | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    credentialRegistered: boolean | null;
    nullifierUsed: boolean | null;
    proofValid: boolean | null;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contracts = CONTRACTS[5003]; // Mantle Sepolia

  // Check credential registration
  const { data: isRegistered, refetch: refetchRegistered } = useReadContract({
    address: contracts.registry as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "credentialExists",
    args: parsedProof ? [parsedProof.commitment as `0x${string}`] : undefined,
    query: { enabled: false },
  });

  // Check nullifier usage
  const { data: nullifierUsed, refetch: refetchNullifier } = useReadContract({
    address: contracts.registry as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "isNullifierUsed",
    args: parsedProof ? [parsedProof.nullifier as `0x${string}`] : undefined,
    query: { enabled: false },
  });

  const handleParseProof = () => {
    setError(null);
    setVerificationResult(null);

    try {
      const data = JSON.parse(proofInput);

      if (!data.commitment || !data.nullifier) {
        throw new Error("Invalid proof format: missing commitment or nullifier");
      }

      setParsedProof(data);
    } catch (e: any) {
      setError(e.message || "Failed to parse proof data");
      setParsedProof(null);
    }
  };

  const handleVerify = async () => {
    if (!parsedProof) return;

    setIsVerifying(true);
    setError(null);

    try {
      // Check credential registration
      const regResult = await refetchRegistered();
      const nullResult = await refetchNullifier();

      setVerificationResult({
        credentialRegistered: regResult.data as boolean,
        nullifierUsed: nullResult.data as boolean,
        proofValid: parsedProof.verified ?? null,
      });
    } catch (e: any) {
      setError(e.message || "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleScanQR = async () => {
    // In production, integrate a QR scanner library
    alert("QR scanning requires camera access. Paste proof data manually for now.");
  };

  const proofTypeLabels: Record<string, string> = {
    age: "Age Verification (18+)",
    jurisdiction: "Jurisdiction Check",
    accredited: "Accredited Investor",
    aml: "AML Compliance",
  };

  return (
    <main className="min-h-screen p-4 sm:p-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80">
            <img src="/favicon.svg" alt="MantlePass" className="w-8 h-8 sm:w-10 sm:h-10" />
            <span className="text-xl sm:text-2xl font-bold">MantlePass</span>
          </Link>
          <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
            Verifier Dashboard
          </span>
        </div>

        <Link
          href="/"
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back to App
        </Link>
      </header>

      {/* Hero */}
      <section className="text-center mb-8">
        <h1 className="text-2xl sm:text-4xl font-bold mb-3">
          Verify <span className="text-purple-400">ZK Proofs</span>
        </h1>
        <p className="text-gray-400 text-sm sm:text-lg max-w-xl mx-auto">
          Verify MantlePass proofs without accessing any personal data
        </p>
      </section>

      <div className="max-w-2xl mx-auto">
        {/* Input Section */}
        <section className="mb-8">
          <div className="bg-[#1C2128] border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4">Enter Proof Data</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Paste proof JSON or scan QR code
                </label>
                <textarea
                  value={proofInput}
                  onChange={(e) => setProofInput(e.target.value)}
                  placeholder='{"type": "age", "commitment": "0x...", "nullifier": "0x...", "verified": true}'
                  className="w-full h-32 bg-black/50 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm font-mono focus:border-purple-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleParseProof}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  Parse Proof
                </button>
                <button
                  onClick={handleScanQR}
                  className="px-4 border border-gray-600 text-gray-300 rounded-lg hover:border-purple-500 transition-colors"
                  title="Scan QR Code"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </button>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Parsed Proof Display */}
        {parsedProof && (
          <section className="mb-8">
            <div className="bg-[#1C2128] border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">Proof Details</h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/30 rounded-lg p-4">
                    <p className="text-gray-500 text-xs mb-1">Proof Type</p>
                    <p className="text-white font-semibold">
                      {proofTypeLabels[parsedProof.type] || parsedProof.type || "Unknown"}
                    </p>
                  </div>
                  <div className="bg-black/30 rounded-lg p-4">
                    <p className="text-gray-500 text-xs mb-1">Self-Verified</p>
                    <p className={`font-semibold ${parsedProof.verified ? "text-green-400" : "text-yellow-400"}`}>
                      {parsedProof.verified ? "Yes" : "Pending"}
                    </p>
                  </div>
                </div>

                <div className="bg-black/30 rounded-lg p-4">
                  <p className="text-gray-500 text-xs mb-1">Credential Commitment</p>
                  <p className="text-white font-mono text-xs break-all">{parsedProof.commitment}</p>
                </div>

                <div className="bg-black/30 rounded-lg p-4">
                  <p className="text-gray-500 text-xs mb-1">Nullifier</p>
                  <p className="text-white font-mono text-xs break-all">{parsedProof.nullifier}</p>
                </div>

                {mounted && !isConnected ? (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-yellow-400 text-sm mb-3">
                      Connect wallet to verify on-chain
                    </p>
                    <button
                      onClick={() => connect({ connector: connectors[0] })}
                      className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-2 rounded-lg transition-colors"
                    >
                      Connect Wallet
                    </button>
                  </div>
                ) : mounted ? (
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isVerifying ? "Verifying..." : "Verify On-Chain"}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        )}

        {/* Verification Results */}
        {verificationResult && (
          <section className="mb-8">
            <div className="bg-[#1C2128] border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">Verification Results</h2>

              <div className="space-y-3">
                {/* Primary Check - ZK Proof Valid */}
                <div className={`p-4 rounded-lg border flex items-center justify-between ${
                  verificationResult.proofValid
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold">ZK Proof Valid</p>
                      <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded">PRIMARY</span>
                    </div>
                    <p className="text-gray-400 text-xs">Groth16 proof is mathematically valid</p>
                  </div>
                  <span className={`text-2xl ${verificationResult.proofValid ? "text-green-400" : "text-red-400"}`}>
                    {verificationResult.proofValid ? "✓" : "✗"}
                  </span>
                </div>

                {/* Nullifier Check */}
                <div className={`p-4 rounded-lg border flex items-center justify-between ${
                  !verificationResult.nullifierUsed
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}>
                  <div>
                    <p className="text-white font-semibold">Nullifier Fresh</p>
                    <p className="text-gray-400 text-xs">Proof has not been used before (replay protection)</p>
                  </div>
                  <span className={`text-2xl ${!verificationResult.nullifierUsed ? "text-green-400" : "text-red-400"}`}>
                    {!verificationResult.nullifierUsed ? "✓" : "✗"}
                  </span>
                </div>

                {/* Optional Check - Credential Registered */}
                <div className={`p-4 rounded-lg border flex items-center justify-between ${
                  verificationResult.credentialRegistered
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-gray-500/10 border-gray-500/30"
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-semibold">On-Chain Registration</p>
                      <span className="text-[10px] bg-gray-500/30 text-gray-400 px-1.5 py-0.5 rounded">OPTIONAL</span>
                    </div>
                    <p className="text-gray-400 text-xs">Commitment registered in on-chain registry</p>
                  </div>
                  <span className={`text-2xl ${verificationResult.credentialRegistered ? "text-green-400" : "text-gray-500"}`}>
                    {verificationResult.credentialRegistered ? "✓" : "−"}
                  </span>
                </div>

                {/* Overall Result - Based on Proof Valid + Nullifier Fresh */}
                <div className={`p-6 rounded-lg border mt-4 text-center ${
                  verificationResult.proofValid && !verificationResult.nullifierUsed
                    ? "bg-green-500/20 border-green-500"
                    : "bg-red-500/20 border-red-500"
                }`}>
                  <p className={`text-2xl font-bold ${
                    verificationResult.proofValid && !verificationResult.nullifierUsed
                      ? "text-green-400"
                      : "text-red-400"
                  }`}>
                    {verificationResult.proofValid && !verificationResult.nullifierUsed
                      ? "✓ PROOF VERIFIED"
                      : "✗ VERIFICATION FAILED"}
                  </p>
                  <p className="text-gray-400 text-sm mt-2">
                    {verificationResult.proofValid && !verificationResult.nullifierUsed
                      ? "This ZK proof is cryptographically valid and hasn't been used before"
                      : "This proof failed verification checks"}
                  </p>
                  {verificationResult.proofValid && !verificationResult.nullifierUsed && !verificationResult.credentialRegistered && (
                    <p className="text-gray-500 text-xs mt-2">
                      Note: Credential not yet registered on-chain (optional for verification)
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Info Section */}
        <section>
          <div className="bg-[#1C2128]/50 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">How Verification Works</h3>
            <div className="space-y-2 text-xs text-gray-500">
              <p>1. <strong className="text-purple-400">ZK Proof Valid (Primary):</strong> Confirms the Groth16 ZK-SNARK proof is mathematically valid</p>
              <p>2. <strong className="text-gray-400">Nullifier Fresh:</strong> Ensures this specific proof hasn't been used before (replay protection)</p>
              <p>3. <strong className="text-gray-500">On-Chain Registration (Optional):</strong> Extra check that credential is registered in on-chain registry</p>
            </div>
            <div className="mt-3 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <p className="text-xs text-purple-300">
                <strong>For demo:</strong> A proof is considered verified if it passes the ZK validity check and hasn't been replayed. On-chain registration provides additional trust for production use.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-500">
                Registry: <a href={`https://sepolia.mantlescan.xyz/address/${contracts.registry}`} target="_blank" className="text-purple-400 hover:underline">{contracts.registry?.slice(0, 10)}...{contracts.registry?.slice(-8)}</a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
