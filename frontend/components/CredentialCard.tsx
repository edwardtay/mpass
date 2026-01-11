"use client";

interface CredentialCardProps {
  type: "age" | "jurisdiction" | "accredited" | "aml";
  title: string;
  description: string;
  status: "verified" | "pending" | "unverified";
}

const statusColors = {
  verified: "bg-green-500/20 text-green-400 border-green-500/50",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  unverified: "bg-gray-500/20 text-gray-400 border-gray-500/50",
};

const statusLabels = {
  verified: "Verified",
  pending: "Pending",
  unverified: "Not Verified",
};

const typeIcons = {
  age: "🎂",
  jurisdiction: "🌍",
  accredited: "💰",
  aml: "🔍",
};

export function CredentialCard({ type, title, description, status }: CredentialCardProps) {
  return (
    <div className="card hover:border-[#65B3AE]/50 transition-colors cursor-pointer">
      <div className="flex items-start justify-between mb-4">
        <div className="text-3xl">{typeIcons[type]}</div>
        <span className={`text-xs px-2 py-1 rounded-full border ${statusColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>

      {status === "unverified" && (
        <button className="btn-secondary w-full mt-4 text-sm py-2">
          Get Verified
        </button>
      )}

      {status === "verified" && (
        <button className="btn-primary w-full mt-4 text-sm py-2">
          Generate Proof
        </button>
      )}
    </div>
  );
}
