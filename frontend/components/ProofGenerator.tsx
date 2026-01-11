"use client";

import { useState } from "react";

type ProofType = "age" | "jurisdiction" | "accredited" | "aml";

export function ProofGenerator() {
  const [selectedType, setSelectedType] = useState<ProofType>("age");
  const [isGenerating, setIsGenerating] = useState(false);
  const [proof, setProof] = useState<string | null>(null);

  const proofTypes = [
    { id: "age" as ProofType, label: "Age (18+)", icon: "🎂" },
    { id: "jurisdiction" as ProofType, label: "Jurisdiction", icon: "🌍" },
    { id: "accredited" as ProofType, label: "Accredited", icon: "💰" },
    { id: "aml" as ProofType, label: "AML", icon: "🔍" },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProof(null);

    // Simulate proof generation
    // In production, this would call snarkjs to generate the actual ZK proof
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock proof output
    setProof(
      JSON.stringify(
        {
          pi_a: ["0x1234...", "0x5678..."],
          pi_b: [["0xabcd...", "0xef01..."], ["0x2345...", "0x6789..."]],
          pi_c: ["0xdead...", "0xbeef..."],
          publicInputs: [selectedType === "age" ? "18" : "1"],
        },
        null,
        2
      )
    );
    setIsGenerating(false);
  };

  const handleCopyProof = () => {
    if (proof) {
      navigator.clipboard.writeText(proof);
    }
  };

  return (
    <div className="card">
      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-3">Select Proof Type</label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {proofTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`p-3 rounded-lg border transition-colors ${
                selectedType === type.id
                  ? "border-[#65B3AE] bg-[#65B3AE]/10"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <div className="text-2xl mb-1">{type.icon}</div>
              <div className="text-sm">{type.label}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="btn-primary w-full mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Generating ZK Proof...
          </span>
        ) : (
          "Generate Proof"
        )}
      </button>

      {proof && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm text-gray-400">Generated Proof</label>
            <button
              onClick={handleCopyProof}
              className="text-[#65B3AE] text-sm hover:underline"
            >
              Copy
            </button>
          </div>
          <pre className="bg-black/50 rounded-lg p-4 overflow-x-auto text-xs text-green-400">
            {proof}
          </pre>
        </div>
      )}
    </div>
  );
}
