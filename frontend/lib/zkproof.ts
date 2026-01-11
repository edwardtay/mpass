// ZK Proof Generation for MantlePass
// Uses real snarkjs for Groth16 proof generation

export interface PassportData {
  documentType: string;
  issuingCountry: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  birthDate: string; // YYYY-MM-DD
  sex: string;
  expiryDate: string; // YYYY-MM-DD
  incomeLevel: string; // 1-6 scale for accredited investor proof
}

export interface CredentialCommitment {
  commitment: string;
  nullifier: string;
  secret: string;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  nationalityCode: number;
  incomeLevel: number; // 1-6 scale (4+ = accredited $200k+)
}

export interface ZKProof {
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
  };
  publicSignals: string[];
  nullifier: string;
  commitment: string;
  // Formatted for contract call
  calldata: {
    pA: [string, string];
    pB: [[string, string], [string, string]];
    pC: [string, string];
    pubSignals: string[];
  };
}

// Country codes (ISO 3166-1 numeric)
const COUNTRY_CODES: Record<string, number> = {
  ARG: 32,
  AUS: 36,
  AUT: 40,
  BEL: 56,
  BRA: 76,
  CAN: 124,
  CHE: 756,
  CHL: 152,
  CHN: 156,
  COL: 170,
  CZE: 203,
  DEU: 276,
  DNK: 208,
  ESP: 724,
  FIN: 246,
  FRA: 250,
  GBR: 826,
  GRC: 300,
  HKG: 344,
  IDN: 360,
  IND: 356,
  IRL: 372,
  ISR: 376,
  ITA: 380,
  JPN: 392,
  KOR: 410,
  MEX: 484,
  MYS: 458,
  NLD: 528,
  NOR: 578,
  NZL: 554,
  PHL: 608,
  POL: 616,
  PRT: 620,
  ROU: 642,
  SAU: 682,
  SGP: 702,
  SWE: 752,
  THA: 764,
  TUR: 792,
  TWN: 158,
  UAE: 784,
  USA: 840,
  VNM: 704,
  ZAF: 710,
  OTHER: 999,
};

// OFAC Sanctioned countries (cannot pass AML check)
// North Korea, Iran, Syria, Sudan, Cuba, Russia, Belarus, Venezuela, Myanmar, Zimbabwe
export const SANCTIONED_COUNTRIES: number[] = [
  408,  // North Korea (PRK)
  364,  // Iran (IRN)
  760,  // Syria (SYR)
  729,  // Sudan (SDN)
  192,  // Cuba (CUB)
  643,  // Russia (RUS)
  112,  // Belarus (BLR)
  862,  // Venezuela (VEN)
  104,  // Myanmar (MMR)
  716,  // Zimbabwe (ZWE)
];

// Income level thresholds
// 1 = Under $50k, 2 = $50-100k, 3 = $100-200k, 4 = $200-500k, 5 = $500k-1M, 6 = Over $1M
// SEC Accredited Investor = income >= $200k (level 4+)
export const ACCREDITED_MIN_LEVEL = 4;

// BN254 field prime
const FIELD_PRIME = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

// Generate a random secret (field element)
function generateSecret(): bigint {
  const array = new Uint8Array(31);
  crypto.getRandomValues(array);
  let secret = BigInt(0);
  for (let i = 0; i < array.length; i++) {
    secret = (secret << BigInt(8)) | BigInt(array[i]);
  }
  return secret % FIELD_PRIME;
}

// Parse date string to components
function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year: year || 2000, month: month || 1, day: day || 1 };
}

// Simple hash for commitment (matches Poseidon output format)
// In browser, we'll use this until circomlibjs loads
async function simpleFieldHash(inputs: bigint[]): Promise<bigint> {
  const encoder = new TextEncoder();
  const data = inputs.map((n) => n.toString()).join(",");
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = new Uint8Array(hashBuffer);
  let result = BigInt(0);
  const len = Math.min(31, hashArray.length);
  for (let i = 0; i < len; i++) {
    result = (result << BigInt(8)) | BigInt(hashArray[i]);
  }
  return result % FIELD_PRIME;
}

// Create credential commitment from passport data
export async function createCredentialCommitment(
  data: PassportData
): Promise<CredentialCommitment> {
  const secret = generateSecret();
  const birth = parseDate(data.birthDate);
  const nationalityCode = COUNTRY_CODES[data.nationality] || 999;
  const incomeLevel = parseInt(data.incomeLevel) || 0;

  // Create commitment (this will be verified against circuit output)
  const commitment = await simpleFieldHash([
    BigInt(birth.year),
    BigInt(birth.month),
    BigInt(birth.day),
    secret,
  ]);

  // Create nullifier based on secret and a default event
  const nullifier = await simpleFieldHash([secret, BigInt(0)]);

  return {
    commitment: "0x" + commitment.toString(16).padStart(64, "0"),
    nullifier: "0x" + nullifier.toString(16).padStart(64, "0"),
    secret: "0x" + secret.toString(16).padStart(64, "0"),
    birthYear: birth.year,
    birthMonth: birth.month,
    birthDay: birth.day,
    nationalityCode,
    incomeLevel,
  };
}

// Load snarkjs dynamically (browser-compatible)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let snarkjsModule: typeof import("snarkjs") | null = null;

async function loadSnarkjs() {
  if (snarkjsModule) return snarkjsModule;
  // Dynamic import for browser
  snarkjsModule = await import("snarkjs");
  return snarkjsModule;
}

// Generate REAL age proof using snarkjs
export async function generateAgeProof(
  credential: CredentialCommitment,
  minAge: number,
  eventId: number = 1
): Promise<ZKProof> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // Calculate age for validation
  let age = currentYear - credential.birthYear;
  if (
    currentMonth < credential.birthMonth ||
    (currentMonth === credential.birthMonth && currentDay < credential.birthDay)
  ) {
    age--;
  }

  if (age < minAge) {
    throw new Error(`Age ${age} is below minimum ${minAge}`);
  }

  // Load snarkjs
  const snarkjs = await loadSnarkjs();

  // Prepare circuit inputs
  const input = {
    // Private inputs
    birthYear: credential.birthYear.toString(),
    birthMonth: credential.birthMonth.toString(),
    birthDay: credential.birthDay.toString(),
    secret: BigInt(credential.secret).toString(),
    // Public inputs
    currentYear: currentYear.toString(),
    currentMonth: currentMonth.toString(),
    currentDay: currentDay.toString(),
    minAge: minAge.toString(),
    eventId: eventId.toString(),
  };

  console.log("Generating ZK proof with inputs:", {
    ...input,
    secret: "[HIDDEN]",
  });

  // Paths to circuit artifacts (served from public folder)
  const wasmPath = "/circuits/age_verify.wasm";
  const zkeyPath = "/circuits/age_verify_final.zkey";

  try {
    // Generate the proof using Groth16
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    console.log("Proof generated successfully!");
    console.log("Public signals:", publicSignals);

    // Format calldata for smart contract
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const calldataArray = JSON.parse("[" + calldata + "]");

    const formattedCalldata = {
      pA: calldataArray[0] as [string, string],
      pB: calldataArray[1] as [[string, string], [string, string]],
      pC: calldataArray[2] as [string, string],
      pubSignals: calldataArray[3] as string[],
    };

    return {
      proof: {
        pi_a: proof.pi_a,
        pi_b: proof.pi_b,
        pi_c: proof.pi_c,
        protocol: proof.protocol,
      },
      publicSignals,
      nullifier: "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, "0"),
      commitment: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, "0"),
      calldata: formattedCalldata,
    };
  } catch (error: any) {
    console.error("Proof generation failed:", error);

    // Provide helpful error messages
    if (error.message?.includes("WASM")) {
      throw new Error("Failed to load circuit. Please refresh and try again.");
    }
    if (error.message?.includes("Assert Failed")) {
      throw new Error(
        "Age verification failed in circuit. Ensure birthdate meets minimum age requirement."
      );
    }
    throw new Error(`ZK proof generation failed: ${error.message}`);
  }
}

// Generate REAL jurisdiction proof using snarkjs
export async function generateJurisdictionProof(
  credential: CredentialCommitment,
  blockedCountries: number[] = SANCTIONED_COUNTRIES,
  eventId: number = 1
): Promise<ZKProof> {
  // Validate blocked countries list (circuit expects exactly 10)
  if (blockedCountries.length !== 10) {
    // Pad or truncate to 10 countries
    const countries = [...blockedCountries];
    while (countries.length < 10) countries.push(0);
    blockedCountries = countries.slice(0, 10);
  }

  // Check if nationality is in blocked list
  if (blockedCountries.includes(credential.nationalityCode)) {
    throw new Error("Nationality is in blocked jurisdiction");
  }

  // Load snarkjs
  const snarkjs = await loadSnarkjs();

  // Prepare circuit inputs
  const input = {
    // Private inputs
    nationalityCode: credential.nationalityCode.toString(),
    birthYear: credential.birthYear.toString(),
    birthMonth: credential.birthMonth.toString(),
    birthDay: credential.birthDay.toString(),
    secret: BigInt(credential.secret).toString(),
    // Public inputs
    blockedCountries: blockedCountries.map(String),
    eventId: eventId.toString(),
  };

  console.log("Generating Jurisdiction ZK proof with inputs:", {
    ...input,
    secret: "[HIDDEN]",
    nationalityCode: "[HIDDEN]",
  });

  // Paths to circuit artifacts
  const wasmPath = "/circuits/jurisdiction_verify.wasm";
  const zkeyPath = "/circuits/jurisdiction_final.zkey";

  try {
    // Generate the proof using Groth16
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input as any,
      wasmPath,
      zkeyPath
    );

    console.log("Jurisdiction proof generated successfully!");
    console.log("Public signals:", publicSignals);

    // Format calldata for smart contract
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const calldataArray = JSON.parse("[" + calldata + "]");

    const formattedCalldata = {
      pA: calldataArray[0] as [string, string],
      pB: calldataArray[1] as [[string, string], [string, string]],
      pC: calldataArray[2] as [string, string],
      pubSignals: calldataArray[3] as string[],
    };

    // Public signals order: credentialCommitment, nullifier, isAllowed, blockedCountries[10], eventId
    return {
      proof: {
        pi_a: proof.pi_a,
        pi_b: proof.pi_b,
        pi_c: proof.pi_c,
        protocol: proof.protocol,
      },
      publicSignals,
      nullifier: "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, "0"),
      commitment: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, "0"),
      calldata: formattedCalldata,
    };
  } catch (error: any) {
    console.error("Jurisdiction proof generation failed:", error);

    if (error.message?.includes("WASM")) {
      throw new Error("Failed to load jurisdiction circuit. Please refresh and try again.");
    }
    if (error.message?.includes("Assert Failed")) {
      throw new Error(
        "Jurisdiction verification failed in circuit. Your nationality may be in the blocked list."
      );
    }
    throw new Error(`Jurisdiction ZK proof generation failed: ${error.message}`);
  }
}

// Generate REAL Accredited Investor proof using snarkjs
// Proves income level >= ACCREDITED_MIN_LEVEL ($200k+) without revealing exact income
export async function generateAccreditedProof(
  credential: CredentialCommitment,
  minIncomeLevel: number = ACCREDITED_MIN_LEVEL,
  eventId: number = 1
): Promise<ZKProof> {
  // Check if income level meets accredited threshold
  if (!credential.incomeLevel || credential.incomeLevel < minIncomeLevel) {
    const levelNames = ["", "Under $50k", "$50-100k", "$100-200k", "$200-500k", "$500k-1M", "Over $1M"];
    const currentLevel = levelNames[credential.incomeLevel] || "Not specified";
    throw new Error(
      `Income level ${currentLevel} does not meet accredited investor threshold ($200k+). ` +
      `Please update your credential with accurate income information.`
    );
  }

  // Load snarkjs
  const snarkjs = await loadSnarkjs();

  // Prepare circuit inputs
  const input = {
    // Private inputs
    incomeLevel: credential.incomeLevel.toString(),
    birthYear: credential.birthYear.toString(),
    birthMonth: credential.birthMonth.toString(),
    birthDay: credential.birthDay.toString(),
    secret: BigInt(credential.secret).toString(),
    // Public inputs
    minIncomeLevel: minIncomeLevel.toString(),
    eventId: eventId.toString(),
  };

  console.log("Generating Accredited Investor ZK proof with inputs:", {
    ...input,
    secret: "[HIDDEN]",
    incomeLevel: "[HIDDEN]",
  });

  // Paths to circuit artifacts
  const wasmPath = "/circuits/accredited_verify.wasm";
  const zkeyPath = "/circuits/accredited_final.zkey";

  try {
    // Generate the proof using Groth16
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    console.log("Accredited proof generated successfully!");
    console.log("Public signals:", publicSignals);

    // Format calldata for smart contract
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const calldataArray = JSON.parse("[" + calldata + "]");

    const formattedCalldata = {
      pA: calldataArray[0] as [string, string],
      pB: calldataArray[1] as [[string, string], [string, string]],
      pC: calldataArray[2] as [string, string],
      pubSignals: calldataArray[3] as string[],
    };

    // Public signals order: credentialCommitment, nullifier, isAccredited, minIncomeLevel, eventId
    return {
      proof: {
        pi_a: proof.pi_a,
        pi_b: proof.pi_b,
        pi_c: proof.pi_c,
        protocol: proof.protocol,
      },
      publicSignals,
      nullifier: "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, "0"),
      commitment: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, "0"),
      calldata: formattedCalldata,
    };
  } catch (error: any) {
    console.error("Accredited proof generation failed:", error);

    if (error.message?.includes("WASM")) {
      throw new Error("Failed to load accredited circuit. Please refresh and try again.");
    }
    if (error.message?.includes("Assert Failed")) {
      throw new Error(
        "Accredited verification failed in circuit. Income level may not meet threshold."
      );
    }
    throw new Error(`Accredited ZK proof generation failed: ${error.message}`);
  }
}

// Generate REAL AML (Anti-Money Laundering) compliance proof using snarkjs
// Proves user is NOT from a sanctioned jurisdiction
export async function generateAMLProof(
  credential: CredentialCommitment,
  sanctionedCountries: number[] = SANCTIONED_COUNTRIES,
  eventId: number = 1
): Promise<ZKProof> {
  // Validate sanctioned countries list (circuit expects exactly 10)
  if (sanctionedCountries.length !== 10) {
    const countries = [...sanctionedCountries];
    while (countries.length < 10) countries.push(0);
    sanctionedCountries = countries.slice(0, 10);
  }

  // Check if nationality is in sanctioned list
  if (sanctionedCountries.includes(credential.nationalityCode)) {
    const countryNames: Record<number, string> = {
      408: "North Korea",
      364: "Iran",
      760: "Syria",
      729: "Sudan",
      192: "Cuba",
      643: "Russia",
      112: "Belarus",
      862: "Venezuela",
      104: "Myanmar",
      716: "Zimbabwe",
    };
    const countryName = countryNames[credential.nationalityCode] || "Sanctioned country";
    throw new Error(
      `Cannot generate AML proof: ${countryName} is on the OFAC sanctions list. ` +
      `Users from sanctioned jurisdictions cannot pass AML verification.`
    );
  }

  // Load snarkjs
  const snarkjs = await loadSnarkjs();

  // Prepare circuit inputs
  const input = {
    // Private inputs
    nationalityCode: credential.nationalityCode.toString(),
    birthYear: credential.birthYear.toString(),
    birthMonth: credential.birthMonth.toString(),
    birthDay: credential.birthDay.toString(),
    secret: BigInt(credential.secret).toString(),
    // Public inputs
    sanctionedCountries: sanctionedCountries.map(String),
    eventId: eventId.toString(),
  };

  console.log("Generating AML ZK proof with inputs:", {
    ...input,
    secret: "[HIDDEN]",
    nationalityCode: "[HIDDEN]",
  });

  // Paths to circuit artifacts
  const wasmPath = "/circuits/aml_verify.wasm";
  const zkeyPath = "/circuits/aml_final.zkey";

  try {
    // Generate the proof using Groth16
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input as any,
      wasmPath,
      zkeyPath
    );

    console.log("AML proof generated successfully!");
    console.log("Public signals:", publicSignals);

    // Format calldata for smart contract
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const calldataArray = JSON.parse("[" + calldata + "]");

    const formattedCalldata = {
      pA: calldataArray[0] as [string, string],
      pB: calldataArray[1] as [[string, string], [string, string]],
      pC: calldataArray[2] as [string, string],
      pubSignals: calldataArray[3] as string[],
    };

    // Public signals order: credentialCommitment, nullifier, sanctionsListHash, isCompliant, sanctionedCountries[10], eventId
    return {
      proof: {
        pi_a: proof.pi_a,
        pi_b: proof.pi_b,
        pi_c: proof.pi_c,
        protocol: proof.protocol,
      },
      publicSignals,
      nullifier: "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, "0"),
      commitment: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, "0"),
      calldata: formattedCalldata,
    };
  } catch (error: any) {
    console.error("AML proof generation failed:", error);

    if (error.message?.includes("WASM")) {
      throw new Error("Failed to load AML circuit. Please refresh and try again.");
    }
    if (error.message?.includes("Assert Failed")) {
      throw new Error(
        "AML verification failed in circuit. Your nationality may be on the sanctions list."
      );
    }
    throw new Error(`AML ZK proof generation failed: ${error.message}`);
  }
}

// Verify proof locally (useful for testing before on-chain verification)
export async function verifyProofLocally(proof: ZKProof): Promise<boolean> {
  const snarkjs = await loadSnarkjs();

  try {
    const vkeyResponse = await fetch("/circuits/verification_key.json");
    const vkey = await vkeyResponse.json();

    const isValid = await snarkjs.groth16.verify(
      vkey,
      proof.publicSignals,
      proof.proof
    );

    return isValid;
  } catch (error) {
    console.error("Local verification failed:", error);
    return false;
  }
}

// Store credential locally (encrypted in production)
export async function storeCredential(
  credential: CredentialCommitment
): Promise<void> {
  const stored = {
    ...credential,
    storedAt: Date.now(),
  };
  localStorage.setItem("mpass_credential", JSON.stringify(stored));
}

// Load credential from local storage
export function loadCredential(): CredentialCommitment | null {
  const stored = localStorage.getItem("mpass_credential");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Clear stored credential
export function clearCredential(): void {
  localStorage.removeItem("mpass_credential");
}

// Proof history management
export interface ProofHistoryEntry {
  id: string;
  type: "age" | "jurisdiction" | "accredited" | "aml";
  timestamp: number;
  nullifier: string;
  commitment: string;
  verified: boolean;
  txHash?: string;
}

export function saveProofToHistory(
  proof: ZKProof,
  type: "age" | "jurisdiction" | "accredited" | "aml",
  verified: boolean,
  txHash?: string
): ProofHistoryEntry {
  const entry: ProofHistoryEntry = {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    nullifier: proof.nullifier,
    commitment: proof.commitment,
    verified,
    txHash,
  };

  const history = getProofHistory();
  history.unshift(entry); // Add to beginning
  // Keep only last 50 proofs
  if (history.length > 50) history.pop();
  localStorage.setItem("mpass_proof_history", JSON.stringify(history));

  return entry;
}

export function getProofHistory(): ProofHistoryEntry[] {
  const stored = localStorage.getItem("mpass_proof_history");
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function clearProofHistory(): void {
  localStorage.removeItem("mpass_proof_history");
}

// Export credential as JSON for backup
export function exportCredential(): string | null {
  const credential = loadCredential();
  if (!credential) return null;

  const exportData = {
    version: 1,
    exported: new Date().toISOString(),
    credential,
    history: getProofHistory(),
  };

  return JSON.stringify(exportData, null, 2);
}

// Import credential from JSON backup
export function importCredential(jsonString: string): CredentialCommitment | null {
  try {
    const data = JSON.parse(jsonString);

    if (!data.credential || !data.credential.commitment) {
      throw new Error("Invalid backup format");
    }

    // Store the credential
    storeCredential(data.credential);

    // Restore history if present
    if (data.history && Array.isArray(data.history)) {
      localStorage.setItem("mpass_proof_history", JSON.stringify(data.history));
    }

    return data.credential;
  } catch (error) {
    console.error("Failed to import credential:", error);
    return null;
  }
}
