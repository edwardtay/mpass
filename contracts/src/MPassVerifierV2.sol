// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MPassRegistryV2} from "./MPassRegistryV2.sol";

/// @title MPassVerifierV2
/// @notice Enhanced verifier with nullifier checking and event binding
/// @dev Verifies ZK proofs and manages nullifier consumption
contract MPassVerifierV2 {
    // ============ Types ============

    struct ProofResult {
        bool valid;
        bytes32 nullifier;
        bytes32 blindedCommitment;
    }

    // ============ State ============

    MPassRegistryV2 public registry;
    address public owner;

    // Verifier contracts (generated from circom)
    address public ageVerifier;
    address public identityVerifier;
    address public passportVerifier;
    address public jurisdictionVerifier;
    address public accreditedVerifier;

    // ============ Events ============

    event ProofVerified(
        address indexed user,
        uint8 indexed proofType,
        bytes32 nullifier,
        uint256 eventId
    );

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============ Constructor ============

    constructor(address _registry) {
        registry = MPassRegistryV2(_registry);
        owner = msg.sender;
    }

    // ============ Admin ============

    function setVerifiers(
        address _ageVerifier,
        address _identityVerifier,
        address _passportVerifier,
        address _jurisdictionVerifier,
        address _accreditedVerifier
    ) external onlyOwner {
        ageVerifier = _ageVerifier;
        identityVerifier = _identityVerifier;
        passportVerifier = _passportVerifier;
        jurisdictionVerifier = _jurisdictionVerifier;
        accreditedVerifier = _accreditedVerifier;
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = MPassRegistryV2(_registry);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ============ Verification Functions ============

    /// @notice Verify age proof with nullifier
    /// @param minAge Minimum age required
    /// @param eventId Event scope (0 for global)
    /// @param proof ZK proof data
    /// @return result Verification result with nullifier
    function verifyAgeWithNullifier(
        uint8 minAge,
        uint256 eventId,
        bytes calldata proof
    ) external returns (ProofResult memory result) {
        require(ageVerifier != address(0), "Age verifier not set");

        // Decode proof
        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c,
            uint256[] memory publicInputs
        ) = _decodeProof(proof);

        // Public inputs for age proof v2:
        // [minAge, currentYear, currentMonth, currentDay, registryRoot, revocationRoot, eventId]
        require(publicInputs.length >= 7, "Invalid public inputs");
        require(publicInputs[0] >= minAge, "Age below minimum");

        // Verify roots match current state
        (bytes32 registryRoot, bytes32 revocationRoot, ) = registry.getRoots();
        require(bytes32(publicInputs[4]) == registryRoot, "Invalid registry root");
        require(bytes32(publicInputs[5]) == revocationRoot, "Invalid revocation root");
        require(publicInputs[6] == eventId, "Event ID mismatch");

        // Verify the ZK proof
        bool valid = _verifyGroth16(ageVerifier, a, b, c, publicInputs);
        require(valid, "Invalid proof");

        // Extract nullifier and blinded commitment from proof output
        // These are the first two outputs after public inputs
        bytes32 nullifier = bytes32(publicInputs[publicInputs.length - 2]);
        bytes32 blindedCommitment = bytes32(publicInputs[publicInputs.length - 1]);

        // Check and consume nullifier
        if (eventId == 0) {
            require(!registry.isNullifierUsed(nullifier), "Nullifier already used");
            registry.useNullifier(nullifier);
        } else {
            require(!registry.isEventNullifierUsed(eventId, nullifier), "Nullifier already used for event");
            registry.useEventNullifier(eventId, nullifier);
        }

        emit ProofVerified(msg.sender, 0, nullifier, eventId);

        return ProofResult({
            valid: true,
            nullifier: nullifier,
            blindedCommitment: blindedCommitment
        });
    }

    /// @notice Verify passport disclosure proof
    /// @param eventId Event scope
    /// @param proof ZK proof data
    /// @return result Verification result
    /// @return disclosedNationality Disclosed nationality (0 if hidden)
    /// @return disclosedAgeOver Disclosed age threshold (0 if hidden)
    /// @return disclosedGender Disclosed gender (0 if hidden)
    function verifyPassportDisclosure(
        uint256 eventId,
        bytes calldata proof
    ) external returns (
        ProofResult memory result,
        uint256 disclosedNationality,
        uint256 disclosedAgeOver,
        uint256 disclosedGender
    ) {
        require(passportVerifier != address(0), "Passport verifier not set");

        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c,
            uint256[] memory publicInputs
        ) = _decodeProof(proof);

        // Verify roots
        (bytes32 registryRoot, bytes32 revocationRoot, ) = registry.getRoots();
        require(bytes32(publicInputs[0]) == registryRoot, "Invalid registry root");
        require(bytes32(publicInputs[1]) == revocationRoot, "Invalid revocation root");

        // Verify ZK proof
        bool valid = _verifyGroth16(passportVerifier, a, b, c, publicInputs);
        require(valid, "Invalid proof");

        // Extract outputs
        bytes32 nullifier = bytes32(publicInputs[publicInputs.length - 5]);
        bytes32 commitment = bytes32(publicInputs[publicInputs.length - 4]);
        disclosedNationality = publicInputs[publicInputs.length - 3];
        disclosedAgeOver = publicInputs[publicInputs.length - 2];
        disclosedGender = publicInputs[publicInputs.length - 1];

        // Consume nullifier
        if (eventId == 0) {
            require(!registry.isNullifierUsed(nullifier), "Nullifier already used");
            registry.useNullifier(nullifier);
        } else {
            require(!registry.isEventNullifierUsed(eventId, nullifier), "Nullifier used for event");
            registry.useEventNullifier(eventId, nullifier);
        }

        emit ProofVerified(msg.sender, 1, nullifier, eventId);

        return (
            ProofResult({
                valid: true,
                nullifier: nullifier,
                blindedCommitment: commitment
            }),
            disclosedNationality,
            disclosedAgeOver,
            disclosedGender
        );
    }

    /// @notice Verify any proof without consuming nullifier (view only)
    /// @dev Useful for off-chain verification
    function verifyProofOnly(
        address verifier,
        bytes calldata proof
    ) external view returns (bool valid) {
        (
            uint256[2] memory a,
            uint256[2][2] memory b,
            uint256[2] memory c,
            uint256[] memory publicInputs
        ) = _decodeProof(proof);

        return _verifyGroth16(verifier, a, b, c, publicInputs);
    }

    // ============ Internal Functions ============

    function _decodeProof(bytes calldata proof) internal pure returns (
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory inputs
    ) {
        require(proof.length >= 256, "Proof too short");

        a[0] = uint256(bytes32(proof[0:32]));
        a[1] = uint256(bytes32(proof[32:64]));

        b[0][0] = uint256(bytes32(proof[64:96]));
        b[0][1] = uint256(bytes32(proof[96:128]));
        b[1][0] = uint256(bytes32(proof[128:160]));
        b[1][1] = uint256(bytes32(proof[160:192]));

        c[0] = uint256(bytes32(proof[192:224]));
        c[1] = uint256(bytes32(proof[224:256]));

        uint256 inputsLength = (proof.length - 256) / 32;
        inputs = new uint256[](inputsLength);
        for (uint256 i = 0; i < inputsLength; i++) {
            inputs[i] = uint256(bytes32(proof[256 + i * 32:256 + (i + 1) * 32]));
        }
    }

    function _verifyGroth16(
        address verifier,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory inputs
    ) internal view returns (bool) {
        (bool success, bytes memory result) = verifier.staticcall(
            abi.encodeWithSignature(
                "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[])",
                a, b, c, inputs
            )
        );

        if (!success || result.length == 0) return false;
        return abi.decode(result, (bool));
    }
}
