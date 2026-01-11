// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ImPassVerifier} from "./interfaces/ImPassVerifier.sol";
import {MPassRegistry} from "./MPassRegistry.sol";

/// @title MPassVerifier
/// @notice On-chain ZK proof verifier for mPass credentials
/// @dev Integrates Groth16 verifiers generated from Circom circuits
contract MPassVerifier is ImPassVerifier {

    MPassRegistry public registry;

    // Verifier contracts for each proof type (deployed separately from circom)
    address public ageVerifier;
    address public jurisdictionVerifier;
    address public accreditedVerifier;
    address public amlVerifier;

    address public owner;

    // Cached proof results (optional, for gas optimization)
    // user => proofHash => expiry
    mapping(address => mapping(bytes32 => uint256)) public proofCache;

    uint256 public constant CACHE_DURATION = 1 days;

    event ProofVerified(address indexed user, uint8 indexed credentialType, bool valid);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _registry) {
        registry = MPassRegistry(_registry);
        owner = msg.sender;
    }

    /// @notice Set verifier contract addresses
    function setVerifiers(
        address _ageVerifier,
        address _jurisdictionVerifier,
        address _accreditedVerifier,
        address _amlVerifier
    ) external onlyOwner {
        ageVerifier = _ageVerifier;
        jurisdictionVerifier = _jurisdictionVerifier;
        accreditedVerifier = _accreditedVerifier;
        amlVerifier = _amlVerifier;
    }

    /// @notice Verify age proof
    function verifyAge(address user, uint8 minAge, bytes calldata proof) external view returns (bool) {
        if (ageVerifier == address(0)) return false;

        // Decode proof components
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory inputs) =
            _decodeProof(proof);

        // Input[0] should be the user's address commitment
        // Input[1] should be the minimum age
        require(inputs.length >= 2, "Invalid inputs");
        require(inputs[1] >= minAge, "Age below minimum");

        // Call the Groth16 verifier
        return _verifyGroth16(ageVerifier, a, b, c, inputs);
    }

    /// @notice Verify jurisdiction proof (not in restricted list)
    function verifyJurisdiction(address user, bytes calldata proof) external view returns (bool) {
        if (jurisdictionVerifier == address(0)) return false;

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory inputs) =
            _decodeProof(proof);

        return _verifyGroth16(jurisdictionVerifier, a, b, c, inputs);
    }

    /// @notice Verify accredited investor status
    function verifyAccredited(address user, bytes calldata proof) external view returns (bool) {
        if (accreditedVerifier == address(0)) return false;

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory inputs) =
            _decodeProof(proof);

        return _verifyGroth16(accreditedVerifier, a, b, c, inputs);
    }

    /// @notice Verify AML clearance
    function verifyAML(address user, bytes calldata proof) external view returns (bool) {
        if (amlVerifier == address(0)) return false;

        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[] memory inputs) =
            _decodeProof(proof);

        return _verifyGroth16(amlVerifier, a, b, c, inputs);
    }

    /// @notice Batch verify multiple credentials
    function verifyBatch(
        address user,
        uint8[] calldata credentialTypes,
        bytes[] calldata proofs
    ) external view returns (bool) {
        require(credentialTypes.length == proofs.length, "Length mismatch");

        for (uint256 i = 0; i < credentialTypes.length; i++) {
            bool valid;
            if (credentialTypes[i] == 0) {
                valid = this.verifyAge(user, 18, proofs[i]); // Default 18+
            } else if (credentialTypes[i] == 1) {
                valid = this.verifyJurisdiction(user, proofs[i]);
            } else if (credentialTypes[i] == 2) {
                valid = this.verifyAccredited(user, proofs[i]);
            } else if (credentialTypes[i] == 3) {
                valid = this.verifyAML(user, proofs[i]);
            } else {
                return false;
            }

            if (!valid) return false;
        }

        return true;
    }

    /// @notice Decode a packed proof into Groth16 components
    function _decodeProof(bytes calldata proof) internal pure returns (
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory inputs
    ) {
        require(proof.length >= 256, "Proof too short");

        // Decode a (2 * 32 bytes)
        a[0] = uint256(bytes32(proof[0:32]));
        a[1] = uint256(bytes32(proof[32:64]));

        // Decode b (2 * 2 * 32 bytes)
        b[0][0] = uint256(bytes32(proof[64:96]));
        b[0][1] = uint256(bytes32(proof[96:128]));
        b[1][0] = uint256(bytes32(proof[128:160]));
        b[1][1] = uint256(bytes32(proof[160:192]));

        // Decode c (2 * 32 bytes)
        c[0] = uint256(bytes32(proof[192:224]));
        c[1] = uint256(bytes32(proof[224:256]));

        // Remaining bytes are public inputs
        uint256 inputsLength = (proof.length - 256) / 32;
        inputs = new uint256[](inputsLength);
        for (uint256 i = 0; i < inputsLength; i++) {
            inputs[i] = uint256(bytes32(proof[256 + i * 32:256 + (i + 1) * 32]));
        }
    }

    /// @notice Call a Groth16 verifier contract
    function _verifyGroth16(
        address verifier,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory inputs
    ) internal view returns (bool) {
        // Standard Groth16 verifier interface
        (bool success, bytes memory result) = verifier.staticcall(
            abi.encodeWithSignature(
                "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[])",
                a, b, c, inputs
            )
        );

        if (!success || result.length == 0) return false;
        return abi.decode(result, (bool));
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
