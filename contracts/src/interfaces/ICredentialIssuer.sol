// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICredentialIssuer
/// @notice Interface for authorized KYC credential issuers
interface ICredentialIssuer {
    struct Credential {
        bytes32 credentialHash;
        uint8 credentialType;
        uint64 issuedAt;
        uint64 expiresAt;
        bool revoked;
    }

    event CredentialIssued(
        address indexed user,
        bytes32 indexed credentialHash,
        uint8 credentialType,
        uint64 expiresAt
    );

    event CredentialRevoked(address indexed user, bytes32 indexed credentialHash);

    /// @notice Issue a new credential to a user
    /// @param user The user address
    /// @param credentialHash Hash of the credential data
    /// @param credentialType Type of credential (0=age, 1=jurisdiction, 2=accredited, 3=aml)
    /// @param expiresAt Expiration timestamp
    function issueCredential(
        address user,
        bytes32 credentialHash,
        uint8 credentialType,
        uint64 expiresAt
    ) external;

    /// @notice Revoke a credential
    /// @param user The user address
    /// @param credentialHash Hash of the credential to revoke
    function revokeCredential(address user, bytes32 credentialHash) external;

    /// @notice Check if a credential is valid (not expired, not revoked)
    /// @param user The user address
    /// @param credentialHash The credential hash
    /// @return valid True if credential is valid
    function isCredentialValid(address user, bytes32 credentialHash) external view returns (bool valid);
}
