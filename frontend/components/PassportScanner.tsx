"use client";

import { useState, useRef, useCallback } from "react";

interface PassportData {
  documentType: string;
  issuingCountry: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  birthDate: string;
  sex: string;
  expiryDate: string;
  incomeLevel: string; // For accredited investor proof
}

interface PassportScannerProps {
  onScanComplete: (data: PassportData) => void;
  onClose: () => void;
}

export function PassportScanner({ onScanComplete, onClose }: PassportScannerProps) {
  const [mode, setMode] = useState<"choose" | "camera" | "manual">("choose");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Manual input state
  const [manualData, setManualData] = useState<PassportData>({
    documentType: "P",
    issuingCountry: "",
    surname: "",
    givenNames: "",
    documentNumber: "",
    nationality: "",
    birthDate: "",
    sex: "",
    expiryDate: "",
    incomeLevel: "",
  });

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 1280, height: 720 },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setMode("camera");
    } catch (err) {
      console.error("Camera access denied:", err);
      alert("Camera access denied. Please use manual input.");
      setMode("manual");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg", 0.8);
        setCapturedImage(imageData);
        stopCamera();
        processImage(imageData);
      }
    }
  }, [stopCamera]);

  const processImage = async (imageData: string) => {
    setIsProcessing(true);
    // OCR processing - in production integrate Tesseract.js or cloud OCR for MRZ reading
    // Currently shows manual input for user confirmation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsProcessing(false);
    setMode("manual");
  };

  const handleManualSubmit = () => {
    // Validate required fields
    if (!manualData.surname || !manualData.birthDate || !manualData.nationality) {
      alert("Please fill in required fields: Name, Birth Date, Nationality");
      return;
    }
    onScanComplete(manualData);
  };

  const handleInputChange = (field: keyof PassportData, value: string) => {
    setManualData((prev) => ({ ...prev, [field]: value }));
  };

  if (mode === "choose") {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-[#1C2128] rounded-xl p-8 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold mb-6 text-center">Scan Your Document</h2>
          <p className="text-gray-400 text-center mb-8">
            Scan your passport or ID to create your ZK credential
          </p>

          <div className="space-y-4">
            <button
              onClick={startCamera}
              className="w-full bg-[#65B3AE] hover:bg-[#4A9994] text-black font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Scan with Camera
            </button>

            <button
              onClick={() => setMode("manual")}
              className="w-full border border-gray-600 hover:border-[#65B3AE] text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Enter Manually
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full mt-6 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (mode === "camera") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col z-50">
        <div className="flex-1 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scan overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="border-2 border-[#65B3AE] rounded-lg w-80 h-52 relative">
              <div className="absolute -top-8 left-0 right-0 text-center text-white text-sm">
                Position passport within frame
              </div>
              {/* Corner markers */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#65B3AE]" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#65B3AE]" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#65B3AE]" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#65B3AE]" />
            </div>
          </div>

          {isProcessing && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin w-12 h-12 border-4 border-[#65B3AE] border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-white">Processing document...</p>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-[#1C2128]">
          <div className="flex gap-4">
            <button
              onClick={() => {
                stopCamera();
                setMode("choose");
              }}
              className="flex-1 border border-gray-600 text-white py-3 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={capturePhoto}
              className="flex-1 bg-[#65B3AE] text-black font-semibold py-3 rounded-lg"
            >
              Capture
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Manual input mode
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-[#1C2128] rounded-xl p-6 max-w-lg w-full mx-4 my-8">
        <h2 className="text-2xl font-bold mb-2">Enter Document Details</h2>
        <p className="text-gray-400 text-sm mb-6">
          This data will be hashed and used to generate ZK proofs. Your actual data never leaves your device.
        </p>

        {capturedImage && (
          <div className="mb-6">
            <img src={capturedImage} alt="Captured" className="w-full rounded-lg" />
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">First Name *</label>
              <input
                type="text"
                value={manualData.givenNames}
                onChange={(e) => handleInputChange("givenNames", e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-[#65B3AE] focus:outline-none"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Last Name *</label>
              <input
                type="text"
                value={manualData.surname}
                onChange={(e) => handleInputChange("surname", e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-[#65B3AE] focus:outline-none"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Birth Date *</label>
              <input
                type="date"
                value={manualData.birthDate}
                onChange={(e) => handleInputChange("birthDate", e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-[#65B3AE] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nationality *</label>
              <select
                value={manualData.nationality}
                onChange={(e) => handleInputChange("nationality", e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-[#65B3AE] focus:outline-none"
              >
                <option value="">Select...</option>
                <option value="ARG">Argentina</option>
                <option value="AUS">Australia</option>
                <option value="AUT">Austria</option>
                <option value="BEL">Belgium</option>
                <option value="BRA">Brazil</option>
                <option value="CAN">Canada</option>
                <option value="CHE">Switzerland</option>
                <option value="CHL">Chile</option>
                <option value="CHN">China</option>
                <option value="COL">Colombia</option>
                <option value="CZE">Czech Republic</option>
                <option value="DEU">Germany</option>
                <option value="DNK">Denmark</option>
                <option value="ESP">Spain</option>
                <option value="FIN">Finland</option>
                <option value="FRA">France</option>
                <option value="GBR">United Kingdom</option>
                <option value="GRC">Greece</option>
                <option value="HKG">Hong Kong</option>
                <option value="IDN">Indonesia</option>
                <option value="IND">India</option>
                <option value="IRL">Ireland</option>
                <option value="ISR">Israel</option>
                <option value="ITA">Italy</option>
                <option value="JPN">Japan</option>
                <option value="KOR">South Korea</option>
                <option value="MEX">Mexico</option>
                <option value="MYS">Malaysia</option>
                <option value="NLD">Netherlands</option>
                <option value="NOR">Norway</option>
                <option value="NZL">New Zealand</option>
                <option value="PHL">Philippines</option>
                <option value="POL">Poland</option>
                <option value="PRT">Portugal</option>
                <option value="ROU">Romania</option>
                <option value="SAU">Saudi Arabia</option>
                <option value="SGP">Singapore</option>
                <option value="SWE">Sweden</option>
                <option value="THA">Thailand</option>
                <option value="TUR">Turkey</option>
                <option value="TWN">Taiwan</option>
                <option value="UAE">United Arab Emirates</option>
                <option value="USA">United States</option>
                <option value="VNM">Vietnam</option>
                <option value="ZAF">South Africa</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Document Number <span className="text-gray-600">(optional)</span></label>
              <input
                type="text"
                value={manualData.documentNumber}
                onChange={(e) => handleInputChange("documentNumber", e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-[#65B3AE] focus:outline-none"
                placeholder="AB1234567"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Expiry Date <span className="text-gray-600">(optional)</span></label>
              <input
                type="date"
                value={manualData.expiryDate}
                onChange={(e) => handleInputChange("expiryDate", e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-[#65B3AE] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Sex <span className="text-gray-600">(optional)</span></label>
            <div className="flex gap-4">
              {["M", "F", "X"].map((sex) => (
                <button
                  key={sex}
                  onClick={() => handleInputChange("sex", sex)}
                  className={`flex-1 py-2 rounded-lg border transition-colors ${
                    manualData.sex === sex
                      ? "border-[#65B3AE] bg-[#65B3AE]/20 text-[#65B3AE]"
                      : "border-gray-700 text-gray-400"
                  }`}
                >
                  {sex === "M" ? "Male" : sex === "F" ? "Female" : "Other"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Annual Income <span className="text-gray-600">(for accredited investor proof)</span></label>
            <select
              value={manualData.incomeLevel}
              onChange={(e) => handleInputChange("incomeLevel", e.target.value)}
              className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:border-[#65B3AE] focus:outline-none"
            >
              <option value="">Select range...</option>
              <option value="1">Under $50,000</option>
              <option value="2">$50,000 - $100,000</option>
              <option value="3">$100,000 - $200,000</option>
              <option value="4">$200,000 - $500,000</option>
              <option value="5">$500,000 - $1,000,000</option>
              <option value="6">Over $1,000,000</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">Used to prove accredited investor status (≥$200k = accredited)</p>
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-600 text-white py-3 rounded-lg hover:border-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleManualSubmit}
            className="flex-1 bg-[#65B3AE] hover:bg-[#4A9994] text-black font-semibold py-3 rounded-lg transition-colors"
          >
            Create Credential
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Your data is hashed locally. Only ZK proofs are stored on-chain.
        </p>
      </div>
    </div>
  );
}
