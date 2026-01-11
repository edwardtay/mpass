// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title MPassRegistryV2
/// @notice Enhanced registry with Merkle tree roots and nullifier tracking
/// @dev Supports credential registry, revocation, and nullifier management
contract MPassRegistryV2 {
    // ============ Types ============

    struct CredentialRoots {
        bytes32 registryRoot;      // Merkle root of registered credentials
        bytes32 revocationRoot;    // Sparse Merkle Tree root of revoked credentials
        uint64 updatedAt;
    }

    // ============ State ============

    address public owner;
    mapping(address => bool) public authorizedIssuers;
    mapping(address => bool) public authorizedUpdaters;

    // Credential roots (updated by issuers)
    CredentialRoots public roots;

    // Nullifier tracking: nullifier => used
    mapping(bytes32 => bool) public nullifierUsed;

    // Event-scoped nullifiers: eventId => nullifier => used
    mapping(uint256 => mapping(bytes32 => bool)) public eventNullifierUsed;

    // Credential commitments (for on-chain backup)
    mapping(bytes32 => bool) public credentialExists;
    mapping(bytes32 => bool) public credentialRevoked;

    // ============ Events ============

    event RootsUpdated(bytes32 registryRoot, bytes32 revocationRoot, uint64 timestamp);
    event NullifierUsed(bytes32 indexed nullifier, address indexed user);
    event EventNullifierUsed(uint256 indexed eventId, bytes32 indexed nullifier, address indexed user);
    event CredentialRegistered(bytes32 indexed commitment, address indexed issuer);
    event CredentialRevoked(bytes32 indexed commitment, address indexed issuer);
    event IssuerAdded(address indexed issuer);
    event IssuerRemoved(address indexed issuer);

    // ============ Modifiers ============

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    modifier onlyIssuer() {
        _checkIssuer();
        _;
    }

    modifier onlyUpdater() {
        _checkUpdater();
        _;
    }

    function _checkOwner() internal view {
        require(msg.sender == owner, "Not owner");
    }

    function _checkIssuer() internal view {
        require(authorizedIssuers[msg.sender], "Not authorized issuer");
    }

    function _checkUpdater() internal view {
        require(authorizedUpdaters[msg.sender] || authorizedIssuers[msg.sender], "Not authorized updater");
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
        authorizedIssuers[msg.sender] = true;
        authorizedUpdaters[msg.sender] = true;
    }

    // ============ Admin Functions ============

    function addIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = true;
        emit IssuerAdded(issuer);
    }

    function removeIssuer(address issuer) external onlyOwner {
        authorizedIssuers[issuer] = false;
        emit IssuerRemoved(issuer);
    }

    function addUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = true;
    }

    function removeUpdater(address updater) external onlyOwner {
        authorizedUpdaters[updater] = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ============ Root Management ============

    /// @notice Update Merkle roots (registry and revocation)
    /// @dev Called by authorized updaters when credentials change
    function updateRoots(bytes32 registryRoot, bytes32 revocationRoot) external onlyUpdater {
        roots = CredentialRoots({
            registryRoot: registryRoot,
            revocationRoot: revocationRoot,
            updatedAt: uint64(block.timestamp)
        });

        emit RootsUpdated(registryRoot, revocationRoot, uint64(block.timestamp));
    }

    /// @notice Get current roots
    function getRoots() external view returns (bytes32 registryRoot, bytes32 revocationRoot, uint64 updatedAt) {
        return (roots.registryRoot, roots.revocationRoot, roots.updatedAt);
    }

    // ============ Credential Management ============

    /// @notice Register a credential commitment on-chain
    /// @dev Merkle tree is updated off-chain, this provides backup
    function registerCredential(bytes32 commitment) external onlyIssuer {
        require(!credentialExists[commitment], "Already registered");
        credentialExists[commitment] = true;
        emit CredentialRegistered(commitment, msg.sender);
    }

    /// @notice Revoke a credential
    function revokeCredential(bytes32 commitment) external onlyIssuer {
        require(credentialExists[commitment], "Not registered");
        require(!credentialRevoked[commitment], "Already revoked");
        credentialRevoked[commitment] = true;
        emit CredentialRevoked(commitment, msg.sender);
    }

    /// @notice Check if credential is valid (exists and not revoked)
    function isCredentialValid(bytes32 commitment) external view returns (bool) {
        return credentialExists[commitment] && !credentialRevoked[commitment];
    }

    // ============ Nullifier Management ============

    /// @notice Mark a global nullifier as used
    /// @dev Called by verifier after successful proof verification
    function useNullifier(bytes32 nullifier) external {
        require(!nullifierUsed[nullifier], "Nullifier already used");
        nullifierUsed[nullifier] = true;
        emit NullifierUsed(nullifier, msg.sender);
    }

    /// @notice Mark an event-scoped nullifier as used
    /// @param eventId The event/scope identifier
    /// @param nullifier The nullifier to mark as used
    function useEventNullifier(uint256 eventId, bytes32 nullifier) external {
        require(!eventNullifierUsed[eventId][nullifier], "Nullifier already used for this event");
        eventNullifierUsed[eventId][nullifier] = true;
        emit EventNullifierUsed(eventId, nullifier, msg.sender);
    }

    /// @notice Check if a global nullifier has been used
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return nullifierUsed[nullifier];
    }

    /// @notice Check if an event-scoped nullifier has been used
    function isEventNullifierUsed(uint256 eventId, bytes32 nullifier) external view returns (bool) {
        return eventNullifierUsed[eventId][nullifier];
    }

    // ============ Batch Operations ============

    /// @notice Register multiple credentials
    function batchRegisterCredentials(bytes32[] calldata commitments) external onlyIssuer {
        for (uint256 i = 0; i < commitments.length; i++) {
            if (!credentialExists[commitments[i]]) {
                credentialExists[commitments[i]] = true;
                emit CredentialRegistered(commitments[i], msg.sender);
            }
        }
    }

    /// @notice Revoke multiple credentials
    function batchRevokeCredentials(bytes32[] calldata commitments) external onlyIssuer {
        for (uint256 i = 0; i < commitments.length; i++) {
            if (credentialExists[commitments[i]] && !credentialRevoked[commitments[i]]) {
                credentialRevoked[commitments[i]] = true;
                emit CredentialRevoked(commitments[i], msg.sender);
            }
        }
    }
}
