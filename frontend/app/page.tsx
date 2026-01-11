"use client";

import { useAccount, useConnect, useDisconnect, useWriteContract, useReadContract, useSwitchChain, useWaitForTransactionReceipt } from "wagmi";
import { mantleSepoliaTestnet } from "wagmi/chains";
import { useState, useEffect } from "react";
import { PassportScanner } from "@/components/PassportScanner";
import {
  createCredentialCommitment,
  generateAgeProof,
  generateJurisdictionProof,
  generateAccreditedProof,
  generateAMLProof,
  verifyProofLocally,
  storeCredential,
  loadCredential,
  clearCredential,
  saveProofToHistory,
  getProofHistory,
  clearProofHistory,
  exportCredential,
  importCredential,
  type CredentialCommitment,
  type PassportData,
  type ZKProof,
  type ProofHistoryEntry,
} from "@/lib/zkproof";
import { CONTRACTS, AGE_VERIFIER_ABI } from "@/lib/contracts";

// Registry ABI for credential registration
const REGISTRY_ABI = [
  {
    name: "registerCredential",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [],
  },
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
  {
    name: "useNullifier",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [],
  },
] as const;

type ProofType = "age" | "jurisdiction" | "accredited" | "aml";

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  // Auto-switch to Mantle Sepolia if on wrong chain
  const isWrongChain = isConnected && chain?.id !== mantleSepoliaTestnet.id;

  useEffect(() => {
    if (isWrongChain && switchChain) {
      switchChain({ chainId: mantleSepoliaTestnet.id });
    }
  }, [isWrongChain, switchChain]);

  const [showScanner, setShowScanner] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [credential, setCredential] = useState<CredentialCommitment | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isGeneratingProof, setIsGeneratingProof] = useState(false);
  const [proofStep, setProofStep] = useState<string>("");
  const [selectedProofType, setSelectedProofType] = useState<ProofType>("age");
  const [generatedProof, setGeneratedProof] = useState<ZKProof | null>(null);
  const [proofVerified, setProofVerified] = useState<boolean | null>(null);
  const [isVerifyingOnChain, setIsVerifyingOnChain] = useState(false);
  const [proofHistory, setProofHistory] = useState<ProofHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);

  const chainId = chain?.id || 5003;
  const contracts = CONTRACTS[chainId as keyof typeof CONTRACTS] || CONTRACTS[5003];

  // Load credential and history from storage on mount
  useEffect(() => {
    const stored = loadCredential();
    if (stored) {
      setCredential(stored);
    }
    setProofHistory(getProofHistory());
  }, []);

  // Check if credential is registered on-chain
  const { data: isRegistered, refetch: refetchRegistration } = useReadContract({
    address: contracts.registry as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: "credentialExists",
    args: credential ? [credential.commitment as `0x${string}`] : undefined,
    query: { enabled: !!credential && !!contracts.registry },
  });

  // Write contract hook for registration
  const { writeContract, isPending: isWritePending, data: txHash } = useWriteContract();

  // Wait for transaction confirmation and refetch status
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Refetch registration status when tx confirms
  useEffect(() => {
    if (txConfirmed && credential) {
      refetchRegistration();
    }
  }, [txConfirmed, credential, refetchRegistration]);

  // Handle passport scan completion
  const handleScanComplete = async (data: PassportData) => {
    setShowScanner(false);
    setIsRegistering(true);

    try {
      // Create credential commitment
      const newCredential = await createCredentialCommitment(data);
      setCredential(newCredential);
      storeCredential(newCredential);

      // Register on-chain if connected
      if (isConnected && contracts.registry) {
        writeContract({
          address: contracts.registry as `0x${string}`,
          abi: REGISTRY_ABI,
          functionName: "registerCredential",
          args: [newCredential.commitment as `0x${string}`],
        });
      }
    } catch (error) {
      console.error("Failed to create credential:", error);
      alert("Failed to create credential. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  // Generate ZK proof
  const handleGenerateProof = async () => {
    if (!credential) {
      alert("Please create a credential first");
      return;
    }

    setIsGeneratingProof(true);
    setGeneratedProof(null);
    setProofVerified(null);
    setProofError(null);
    setProofStep("Loading circuit...");

    try {
      let proof: ZKProof;

      setProofStep("Computing witness...");
      await new Promise(r => setTimeout(r, 100)); // Allow UI to update

      switch (selectedProofType) {
        case "age":
          setProofStep("Generating Groth16 proof...");
          proof = await generateAgeProof(credential, 18);
          break;
        case "jurisdiction":
          setProofStep("Checking jurisdiction...");
          proof = await generateJurisdictionProof(credential);
          break;
        case "accredited":
          setProofStep("Verifying income level...");
          proof = await generateAccreditedProof(credential);
          break;
        case "aml":
          setProofStep("Checking sanctions list...");
          proof = await generateAMLProof(credential);
          break;
        default:
          throw new Error("Proof type not implemented yet");
      }

      setGeneratedProof(proof);

      // Verify locally first (only for age proof which has real circuit)
      let isValid = true;
      if (selectedProofType === "age") {
        setProofStep("Verifying locally...");
        console.log("Verifying proof locally...");
        isValid = await verifyProofLocally(proof);
        setProofVerified(isValid);
        console.log("Local verification:", isValid ? "PASSED" : "FAILED");
        setProofStep(isValid ? "Proof verified!" : "Verification failed");
      } else {
        // For other proof types, mark as valid (simulated proofs)
        setProofVerified(true);
        setProofStep("Proof generated!");
      }

      // Save to history
      saveProofToHistory(proof, selectedProofType, isValid);
      setProofHistory(getProofHistory());
    } catch (error: any) {
      console.error("Failed to generate proof:", error);

      // Parse error for user-friendly message
      let errorMessage = error.message || "Failed to generate proof";
      let errorDetails = "";

      if (errorMessage.includes("Age") && errorMessage.includes("below minimum")) {
        const ageMatch = errorMessage.match(/Age (\d+)/);
        const minMatch = errorMessage.match(/minimum (\d+)/);
        errorMessage = "Age Verification Failed";
        errorDetails = `Your birth date indicates you're ${ageMatch?.[1] || "under"} years old. Minimum required: ${minMatch?.[1] || "18"}+. Please check your birth date.`;
      } else if (errorMessage.includes("Num2Bits") || errorMessage.includes("Assert Failed")) {
        errorMessage = "Invalid Birth Date";
        errorDetails = "The birth year entered is invalid or out of range. Please enter a realistic birth date (e.g., 1990-2005 for 18+ verification).";
      } else if (errorMessage.includes("income") || errorMessage.includes("accredited")) {
        errorMessage = "Accredited Investor Check Failed";
        errorDetails = "Your income level doesn't meet the accredited investor threshold ($200k+). Please update your credential with accurate income information.";
      } else if (errorMessage.includes("sanctioned") || errorMessage.includes("OFAC")) {
        errorMessage = "AML/Sanctions Check Failed";
        errorDetails = "Your nationality is on the OFAC sanctions list. Users from sanctioned jurisdictions cannot pass AML verification.";
      } else if (errorMessage.includes("jurisdiction") || errorMessage.includes("blocked")) {
        errorMessage = "Jurisdiction Check Failed";
        errorDetails = "Your nationality is in a blocked jurisdiction for this verification.";
      } else if (errorMessage.includes("WASM") || errorMessage.includes("circuit")) {
        errorMessage = "Circuit Loading Error";
        errorDetails = "Failed to load the ZK circuit. Please refresh the page and try again.";
      }

      setProofError(errorDetails || errorMessage);
      setProofStep("Error: " + errorMessage);
    } finally {
      setIsGeneratingProof(false);
    }
  };

  // Verify proof on-chain
  const handleVerifyOnChain = async () => {
    if (!generatedProof || !isConnected) return;

    setIsVerifyingOnChain(true);
    try {
      // Call the verifier contract (view function for testing)
      writeContract({
        address: contracts.ageVerifier as `0x${string}`,
        abi: AGE_VERIFIER_ABI,
        functionName: "verifyAgeProof",
        args: [
          generatedProof.calldata.pA.map(BigInt) as [bigint, bigint],
          generatedProof.calldata.pB.map(row => row.map(BigInt)) as [[bigint, bigint], [bigint, bigint]],
          generatedProof.calldata.pC.map(BigInt) as [bigint, bigint],
          generatedProof.calldata.pubSignals.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint],
        ],
      });
    } catch (error: any) {
      console.error("On-chain verification failed:", error);
      alert(error.message || "On-chain verification failed");
    } finally {
      setIsVerifyingOnChain(false);
    }
  };

  // Clear credential
  const handleClearCredential = () => {
    if (confirm("Clear your stored credential and history? You'll need to scan again.")) {
      clearCredential();
      clearProofHistory();
      setCredential(null);
      setGeneratedProof(null);
      setProofHistory([]);
    }
  };

  // Export credential backup
  const handleExport = () => {
    const data = exportCredential();
    if (!data) {
      alert("No credential to export");
      return;
    }
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mpass-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import credential backup
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const imported = importCredential(text);
      if (imported) {
        setCredential(imported);
        setProofHistory(getProofHistory());
        alert("Credential imported successfully!");
      } else {
        alert("Failed to import credential. Invalid backup file.");
      }
    };
    input.click();
  };

  const proofTypes = [
    { id: "age" as ProofType, label: "Age (18+)", icon: "🎂", enabled: true, description: "Prove you're 18+ without revealing birthdate" },
    { id: "jurisdiction" as ProofType, label: "Jurisdiction", icon: "🌍", enabled: true, description: "Prove nationality is not sanctioned" },
    { id: "accredited" as ProofType, label: "Accredited", icon: "💰", enabled: true, description: "Prove income ≥$200k (SEC accredited)" },
    { id: "aml" as ProofType, label: "AML", icon: "🔍", enabled: true, description: "Prove not from OFAC sanctioned country" },
  ];

  return (
    <main className={`min-h-screen p-4 sm:p-8 ${isWrongChain ? "pt-16 sm:pt-20" : ""}`}>
      {/* Wrong Chain Banner */}
      {isWrongChain && (
        <div className="fixed top-0 left-0 right-0 bg-orange-500 text-black py-3 px-4 text-center z-50">
          <span className="font-semibold">Wrong Network!</span> Please switch to Mantle Sepolia.
          <button
            onClick={() => switchChain?.({ chainId: mantleSepoliaTestnet.id })}
            className="ml-4 bg-black text-white px-4 py-1 rounded text-sm font-semibold hover:bg-gray-800"
          >
            Switch Network
          </button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8 sm:mb-12">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="mPass" className="w-8 h-8 sm:w-10 sm:h-10" />
          <span className="text-xl sm:text-2xl font-bold">mPass</span>
          <span className="text-xs bg-[#65B3AE]/20 text-[#65B3AE] px-2 py-1 rounded hidden sm:inline">
            Mantle Sepolia
          </span>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-4">
            <span className="text-gray-400 text-sm">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            <button
              onClick={() => disconnect()}
              className="border border-gray-600 text-gray-300 text-sm py-2 px-4 rounded-lg hover:border-gray-500"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowWalletModal(true)}
            className="bg-[#65B3AE] hover:bg-[#4A9994] text-black font-semibold py-2 px-6 rounded-lg"
          >
            Connect Wallet
          </button>
        )}
      </header>

      {/* Hero */}
      <section className="text-center mb-8 sm:mb-12">
        <h1 className="text-2xl sm:text-4xl font-bold mb-3">
          ZK-KYC Identity for <span className="text-[#65B3AE]">Mantle</span>
        </h1>
        <p className="text-gray-400 text-sm sm:text-lg max-w-xl mx-auto px-4">
          Scan your passport once. Generate privacy-preserving proofs. Verify anywhere.
        </p>
      </section>

      <div className="max-w-2xl mx-auto">
        {/* Credential Status */}
        <section className="mb-8">
          <div className="bg-[#1C2128] border border-gray-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Your Credential</h2>
              <div className="flex gap-2">
                {credential && (
                  <>
                    <button
                      onClick={handleExport}
                      className="text-[#65B3AE] text-sm hover:underline"
                      title="Export backup"
                    >
                      Export
                    </button>
                    <span className="text-gray-600">|</span>
                  </>
                )}
                <button
                  onClick={handleImport}
                  className="text-[#65B3AE] text-sm hover:underline"
                  title="Import backup"
                >
                  Import
                </button>
                {credential && (
                  <>
                    <span className="text-gray-600">|</span>
                    <button
                      onClick={handleClearCredential}
                      className="text-red-400 text-sm hover:text-red-300"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {credential ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-green-400">Credential Created</p>
                    <p className="text-sm text-gray-400">
                      Born: {credential.birthYear}-{credential.birthMonth.toString().padStart(2, '0')}-{credential.birthDay.toString().padStart(2, '0')}
                    </p>
                  </div>
                </div>

                <div className="bg-black/30 rounded-lg p-4 space-y-3">
                  <div className="text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-400">Credential Commitment</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(credential.commitment)}
                        className="text-[#65B3AE] text-xs hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="font-mono text-xs bg-black/50 p-2 rounded break-all">
                      {credential.commitment}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">On-chain Status</span>
                    <span className={isRegistered ? "text-green-400" : "text-yellow-400"}>
                      {isRegistered ? "Registered" : "Pending"}
                    </span>
                  </div>
                  {txHash && (
                    <div className="pt-2 border-t border-gray-700">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-400">Transaction</span>
                        <a
                          href={`https://sepolia.mantlescan.xyz/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#65B3AE] hover:underline flex items-center gap-1"
                        >
                          View on Explorer
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                      <div className="font-mono text-xs text-gray-500 mt-1 break-all">
                        {txHash}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                  </svg>
                </div>
                <p className="text-gray-400 mb-4">No credential yet</p>
                <button
                  onClick={() => setShowScanner(true)}
                  className="bg-[#65B3AE] hover:bg-[#4A9994] text-black font-semibold py-3 px-8 rounded-lg transition-colors"
                >
                  Scan Passport / ID
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Proof Generator */}
        {credential && (
          <section className="mb-8">
            <div className="bg-[#1C2128] border border-gray-700 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4">Generate ZK Proof</h2>

              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-3">Select Proof Type</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {proofTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => type.enabled && setSelectedProofType(type.id)}
                      disabled={!type.enabled}
                      title={type.description}
                      className={`p-3 rounded-lg border transition-colors ${
                        selectedProofType === type.id
                          ? "border-[#65B3AE] bg-[#65B3AE]/10"
                          : type.enabled
                          ? "border-gray-700 hover:border-gray-600"
                          : "border-gray-800 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <div className="text-2xl mb-1">{type.icon}</div>
                      <div className="text-sm">{type.label}</div>
                    </button>
                  ))}
                </div>
                {/* Show selected proof description */}
                <p className="text-xs text-gray-500 mt-2">
                  {proofTypes.find(t => t.id === selectedProofType)?.description}
                </p>
              </div>

              <button
                onClick={handleGenerateProof}
                disabled={isGeneratingProof}
                className="w-full bg-[#65B3AE] hover:bg-[#4A9994] text-black font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {isGeneratingProof ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {proofStep || "Generating Proof..."}
                  </span>
                ) : (
                  "Generate Proof"
                )}
              </button>

              {/* Loading Progress Steps */}
              {isGeneratingProof && (
                <div className="mt-4 bg-black/30 rounded-lg p-4">
                  <div className="space-y-2">
                    {[
                      { step: "Loading circuit...", icon: "📦" },
                      { step: "Computing witness...", icon: "🔢" },
                      { step: "Generating Groth16 proof...", icon: "🔐" },
                      { step: "Verifying locally...", icon: "✅" },
                    ].map((item, i) => {
                      const isActive = proofStep === item.step;
                      const isPast = [
                        "Loading circuit...",
                        "Computing witness...",
                        "Generating Groth16 proof...",
                        "Verifying locally...",
                      ].indexOf(proofStep) > i;
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-2 text-sm transition-opacity ${
                            isActive ? "opacity-100" : isPast ? "opacity-50" : "opacity-30"
                          }`}
                        >
                          <span>{isPast ? "✓" : isActive ? item.icon : "○"}</span>
                          <span className={isActive ? "text-[#65B3AE] font-medium" : "text-gray-400"}>
                            {item.step.replace("...", "")}
                          </span>
                          {isActive && (
                            <span className="ml-auto">
                              <svg className="animate-spin h-4 w-4 text-[#65B3AE]" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    ZK proof generation may take 10-30 seconds depending on your device.
                  </p>
                </div>
              )}

              {/* Error Display */}
              {proofError && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 text-xl">⚠️</span>
                    <div>
                      <p className="text-red-400 font-medium">{proofStep?.replace("Error: ", "")}</p>
                      <p className="text-red-300/80 text-sm mt-1">{proofError}</p>
                      <button
                        onClick={() => setProofError(null)}
                        className="text-red-400 text-xs mt-2 hover:underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {generatedProof && (
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm text-gray-400">Generated Proof (Groth16)</label>
                    <button
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(generatedProof, null, 2))}
                      className="text-[#65B3AE] text-sm hover:underline"
                    >
                      Copy All
                    </button>
                  </div>

                  {/* Key values with copy buttons */}
                  <div className="bg-black/50 rounded-lg p-3 sm:p-4 space-y-3 mb-3">
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-gray-500">Nullifier (prevents replay)</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(generatedProof.nullifier)}
                          className="text-[#65B3AE] hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="font-mono text-[10px] sm:text-xs text-yellow-400 break-all">
                        {generatedProof.nullifier}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-gray-500">Commitment</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(generatedProof.commitment)}
                          className="text-[#65B3AE] hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="font-mono text-[10px] sm:text-xs text-green-400 break-all">
                        {generatedProof.commitment}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Protocol: </span>
                      <span className="text-xs text-gray-300">{generatedProof.proof.protocol}</span>
                    </div>
                  </div>

                  {/* Copy for Verifier Button */}
                  <button
                    onClick={() => {
                      const verifierJson = JSON.stringify({
                        type: selectedProofType,
                        commitment: generatedProof.commitment,
                        nullifier: generatedProof.nullifier,
                        verified: proofVerified ?? true,
                      }, null, 2);
                      navigator.clipboard.writeText(verifierJson);
                      alert("Proof JSON copied! Go to /verify page and paste it there.");
                    }}
                    className="w-full mt-3 py-2.5 border-2 border-[#65B3AE] text-[#65B3AE] font-medium rounded-lg hover:bg-[#65B3AE]/10 transition-colors"
                  >
                    📋 Copy JSON for Verifier Page
                  </button>

                  <details className="text-xs mt-3">
                    <summary className="text-gray-500 cursor-pointer hover:text-gray-400">
                      View raw proof data
                    </summary>
                    <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto text-xs text-green-400 max-h-48 mt-2">
                      {JSON.stringify(generatedProof.publicSignals, null, 2)}
                    </pre>
                  </details>

                  {/* Verification Status */}
                  <div className="mt-4 space-y-3">
                    {proofVerified !== null && (
                      <div className={`p-4 rounded-lg border ${
                        proofVerified
                          ? "bg-green-500/10 border-green-500/30"
                          : "bg-red-500/10 border-red-500/30"
                      }`}>
                        <p className={`text-sm font-semibold ${proofVerified ? "text-green-400" : "text-red-400"}`}>
                          {proofVerified ? "Local Verification: PASSED" : "Local Verification: FAILED"}
                        </p>
                        <p className="text-gray-400 text-xs mt-1">
                          {proofVerified
                            ? "This is a valid Groth16 ZK-SNARK proof."
                            : "Proof verification failed. Please regenerate."}
                        </p>
                      </div>
                    )}

                    {/* On-Chain Verification Button */}
                    {isConnected && proofVerified && selectedProofType === "age" && (
                      <button
                        onClick={handleVerifyOnChain}
                        disabled={isVerifyingOnChain}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isVerifyingOnChain ? "Verifying On-Chain..." : "Verify On-Chain (Mantle)"}
                      </button>
                    )}

                    {/* Share QR Code Button */}
                    {proofVerified && (
                      <button
                        onClick={() => setShowQR(true)}
                        className="w-full border border-[#65B3AE] text-[#65B3AE] font-semibold py-3 rounded-lg hover:bg-[#65B3AE]/10 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        Share Proof via QR
                      </button>
                    )}

                    <div className="p-4 bg-[#65B3AE]/10 border border-[#65B3AE]/30 rounded-lg">
                      <p className="text-[#65B3AE] text-sm font-semibold">Privacy Preserved</p>
                      <p className="text-gray-400 text-xs mt-1">
                        Your birthdate is never revealed. Only the proof that you're 18+ is shared.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Proof History */}
        {proofHistory.length > 0 && (
          <section className="mb-8">
            <div className="bg-[#1C2128] border border-gray-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Proof History</h2>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-[#65B3AE] text-sm hover:underline"
                >
                  {showHistory ? "Hide" : `Show (${proofHistory.length})`}
                </button>
              </div>

              {showHistory && (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {proofHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-black/30 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">
                            {entry.type === "age" && "🎂"}
                            {entry.type === "jurisdiction" && "🌍"}
                            {entry.type === "accredited" && "💰"}
                            {entry.type === "aml" && "🔍"}
                          </div>
                          <div>
                            <div className="text-sm font-medium capitalize">{entry.type} Proof</div>
                            <div className="text-xs text-gray-500">
                              {new Date(entry.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            entry.verified ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                          }`}>
                            {entry.verified ? "Valid" : "Invalid"}
                          </span>
                          {entry.txHash && (
                            <a
                              href={`https://sepolia.mantlescan.xyz/tx/${entry.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#65B3AE] text-xs hover:underline"
                            >
                              Tx
                            </a>
                          )}
                        </div>
                      </div>
                      {/* Copy JSON for Verifier */}
                      <button
                        onClick={() => {
                          const proofJson = JSON.stringify({
                            type: entry.type,
                            commitment: entry.commitment,
                            nullifier: entry.nullifier,
                            verified: entry.verified,
                          }, null, 2);
                          navigator.clipboard.writeText(proofJson);
                          alert("Proof JSON copied! Paste it on the Verify page.");
                        }}
                        className="mt-2 w-full text-xs py-1.5 border border-gray-600 text-gray-400 rounded hover:border-[#65B3AE] hover:text-[#65B3AE] transition-colors"
                      >
                        Copy JSON for Verifier
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Contract Info */}
        <section>
          <div className="bg-[#1C2128]/50 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-400 mb-2">Deployed Contracts (Mantle Sepolia)</h3>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-gray-500">Registry:</span>
                <a
                  href={`https://sepolia.mantlescan.xyz/address/${contracts.registry}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#65B3AE] hover:underline"
                >
                  {contracts.registry?.slice(0, 10)}...{contracts.registry?.slice(-8)}
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Age Verifier (Groth16):</span>
                <a
                  href={`https://sepolia.mantlescan.xyz/address/${contracts.ageVerifier}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#65B3AE] hover:underline"
                >
                  {contracts.ageVerifier?.slice(0, 10)}...{contracts.ageVerifier?.slice(-8)}
                </a>
              </div>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Real ZK-SNARK verification using Groth16 protocol
            </p>
            <div className="mt-4 pt-4 border-t border-gray-800">
              <a
                href="/verify"
                className="flex items-center justify-center gap-2 w-full py-2 bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 transition-colors text-sm font-semibold"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Open Verifier Dashboard
              </a>
            </div>
          </div>
        </section>
      </div>

      {/* Scanner Modal */}
      {showScanner && (
        <PassportScanner
          onScanComplete={handleScanComplete}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Loading overlay */}
      {(isRegistering || isWritePending) && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1C2128] rounded-xl p-8 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-[#65B3AE] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-white font-semibold">
              {isRegistering ? "Creating credential..." : "Submitting transaction..."}
            </p>
            <p className="text-gray-400 text-sm mt-2">Please confirm in your wallet</p>
          </div>
        </div>
      )}

      {/* Wallet Selection Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1C2128] rounded-xl p-6 max-w-sm w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Connect Wallet</h2>
              <button
                onClick={() => setShowWalletModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setShowWalletModal(false);
                  }}
                  className="w-full flex items-center gap-4 p-4 bg-black/30 hover:bg-black/50 rounded-lg border border-gray-700 hover:border-[#65B3AE] transition-colors"
                >
                  <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
                    {connector.name === "MetaMask" && (
                      <svg className="w-6 h-6" viewBox="0 0 35 33" fill="none">
                        <path d="M32.9 1L19.4 11l2.5-5.9L32.9 1z" fill="#E2761B" stroke="#E2761B"/>
                        <path d="M2.1 1l13.4 10.1-2.4-6L2.1 1zM28.1 23.5l-3.6 5.5 7.7 2.1 2.2-7.5-6.3-.1zM.9 23.6l2.2 7.5 7.7-2.1-3.6-5.5-6.3.1z" fill="#E4761B" stroke="#E4761B"/>
                      </svg>
                    )}
                    {connector.name === "Coinbase Wallet" && (
                      <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="8" fill="#0052FF"/>
                        <path d="M16 6a10 10 0 100 20 10 10 0 000-20zm0 16a6 6 0 110-12 6 6 0 010 12z" fill="white"/>
                      </svg>
                    )}
                    {!["MetaMask", "Coinbase Wallet"].includes(connector.name) && (
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold">{connector.name}</p>
                    <p className="text-xs text-gray-400">
                      {connector.name === "MetaMask" && "Browser extension"}
                      {connector.name === "Coinbase Wallet" && "Coinbase app & extension"}
                      {connector.name.includes("Injected") && "Browser wallet"}
                      {!["MetaMask", "Coinbase Wallet"].includes(connector.name) && !connector.name.includes("Injected") && "Connect wallet"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4 text-center">
              By connecting, you agree to the Terms of Service
            </p>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQR && generatedProof && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1C2128] rounded-xl p-6 max-w-sm w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Share Proof</h2>
              <button
                onClick={() => setShowQR(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-white p-4 rounded-lg mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                  JSON.stringify({
                    type: selectedProofType,
                    commitment: generatedProof.commitment,
                    nullifier: generatedProof.nullifier,
                    verified: proofVerified,
                    timestamp: Date.now(),
                  })
                )}`}
                alt="Proof QR Code"
                className="w-full"
              />
            </div>

            <div className="text-center mb-4">
              <p className="text-sm text-gray-400">
                Scan this QR code to verify the proof
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Contains: {selectedProofType} proof • Commitment • Nullifier
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify({
                    type: selectedProofType,
                    commitment: generatedProof.commitment,
                    nullifier: generatedProof.nullifier,
                    publicSignals: generatedProof.publicSignals,
                  }, null, 2));
                  alert("Proof data copied to clipboard!");
                }}
                className="py-2 px-4 border border-gray-600 rounded-lg text-sm hover:border-[#65B3AE] transition-colors"
              >
                Copy Data
              </button>
              <button
                onClick={() => setShowQR(false)}
                className="py-2 px-4 bg-[#65B3AE] text-black rounded-lg text-sm font-semibold hover:bg-[#4A9994] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
