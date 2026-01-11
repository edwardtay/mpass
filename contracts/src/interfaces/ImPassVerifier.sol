// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ImPassVerifier
/// @notice Interface for protocols to integrate mPass ZK-KYC verification
interface ImPassVerifier {
    /// @notice Verify a user is over a certain age
    /// @param user The address to verify
    /// @param minAge The minimum age required
    /// @param proof The ZK proof data
    /// @return valid True if proof is valid
    function verifyAge(address user, uint8 minAge, bytes calldata proof) external view returns (bool valid);

    /// @notice Verify a user is NOT in a restricted jurisdiction
    /// @param user The address to verify
    /// @param proof The ZK proof data
    /// @return valid True if proof is valid
    function verifyJurisdiction(address user, bytes calldata proof) external view returns (bool valid);

    /// @notice Verify a user is an accredited investor
    /// @param user The address to verify
    /// @param proof The ZK proof data
    /// @return valid True if proof is valid
    function verifyAccredited(address user, bytes calldata proof) external view returns (bool valid);

    /// @notice Verify a user has passed AML screening
    /// @param user The address to verify
    /// @param proof The ZK proof data
    /// @return valid True if proof is valid
    function verifyAML(address user, bytes calldata proof) external view returns (bool valid);

    /// @notice Batch verify multiple credentials in one call
    /// @param user The address to verify
    /// @param credentialTypes Array of credential type IDs
    /// @param proofs Array of corresponding proofs
    /// @return valid True if all proofs are valid
    function verifyBatch(
        address user,
        uint8[] calldata credentialTypes,
        bytes[] calldata proofs
    ) external view returns (bool valid);
}
