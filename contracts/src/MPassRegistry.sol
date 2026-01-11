// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ICredentialIssuer} from "./interfaces/ICredentialIssuer.sol";

/// @title MPassRegistry
/// @notice Registry for mPass ZK-KYC credentials on Mantle
/// @dev Stores credential hashes and manages issuers
contract MPassRegistry is ICredentialIssuer {

    // Credential types
    uint8 public constant CRED_AGE = 0;
    uint8 public constant CRED_JURISDICTION = 1;
    uint8 public constant CRED_ACCREDITED = 2;
    uint8 public constant CRED_AML = 3;

    address public owner;

    // Authorized issuers
    mapping(address => bool) public authorizedIssuers;

    // user => credentialHash => Credential
    mapping(address => mapping(bytes32 => Credential)) public credentials;

    // user => credentialType => credentialHashes[]
    mapping(address => mapping(uint8 => bytes32[])) public userCredentialsByType;

    // Merkle root for revocation list (for ZK proofs)
    bytes32 public revocationRoot;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyIssuer() {
        require(authorizedIssuers[msg.sender], "Not authorized issuer");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Add an authorized credential issuer
    function addIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = true;
    }

    /// @notice Remove an authorized credential issuer
    function removeIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = false;
    }

    /// @notice Issue a credential to a user
    function issueCredential(
        address user,
        bytes32 credentialHash,
        uint8 credentialType,
        uint64 expiresAt
    ) external onlyIssuer {
        require(credentialType <= CRED_AML, "Invalid credential type");
        require(expiresAt > block.timestamp, "Already expired");
        require(credentials[user][credentialHash].issuedAt == 0, "Credential exists");

        credentials[user][credentialHash] = Credential({
            credentialHash: credentialHash,
            credentialType: credentialType,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            revoked: false
        });

        userCredentialsByType[user][credentialType].push(credentialHash);

        emit CredentialIssued(user, credentialHash, credentialType, expiresAt);
    }

    /// @notice Revoke a credential
    function revokeCredential(address user, bytes32 credentialHash) external onlyIssuer {
        Credential storage cred = credentials[user][credentialHash];
        require(cred.issuedAt != 0, "Credential not found");
        require(!cred.revoked, "Already revoked");

        cred.revoked = true;

        emit CredentialRevoked(user, credentialHash);
    }

    /// @notice Update the revocation merkle root (for ZK proofs)
    function updateRevocationRoot(bytes32 newRoot) external onlyIssuer {
        revocationRoot = newRoot;
    }

    /// @notice Check if a credential is valid
    function isCredentialValid(address user, bytes32 credentialHash) external view returns (bool) {
        Credential storage cred = credentials[user][credentialHash];
        return cred.issuedAt != 0 &&
               !cred.revoked &&
               cred.expiresAt > block.timestamp;
    }

    /// @notice Get all credentials of a type for a user
    function getUserCredentials(address user, uint8 credentialType) external view returns (bytes32[] memory) {
        return userCredentialsByType[user][credentialType];
    }

    /// @notice Get credential details
    function getCredential(address user, bytes32 credentialHash) external view returns (Credential memory) {
        return credentials[user][credentialHash];
    }

    /// @notice Transfer ownership
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }
}
