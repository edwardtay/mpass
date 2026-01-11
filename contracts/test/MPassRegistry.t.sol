// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MPassRegistry.sol";

contract MPassRegistryTest is Test {
    MPassRegistry public registry;

    address public owner = address(1);
    address public issuer = address(2);
    address public user = address(3);

    bytes32 public credentialHash = keccak256("test_credential");
    uint8 public credentialType = 0; // Age
    uint64 public expiresAt;

    function setUp() public {
        vm.startPrank(owner);
        registry = new MPassRegistry();
        registry.addIssuer(issuer);
        vm.stopPrank();

        expiresAt = uint64(block.timestamp + 365 days);
    }

    function test_IssueCredential() public {
        vm.prank(issuer);
        registry.issueCredential(user, credentialHash, credentialType, expiresAt);

        assertTrue(registry.isCredentialValid(user, credentialHash));

        MPassRegistry.Credential memory cred = registry.getCredential(user, credentialHash);
        assertEq(cred.credentialType, credentialType);
        assertEq(cred.expiresAt, expiresAt);
        assertFalse(cred.revoked);
    }

    function test_RevokeCredential() public {
        vm.prank(issuer);
        registry.issueCredential(user, credentialHash, credentialType, expiresAt);

        vm.prank(issuer);
        registry.revokeCredential(user, credentialHash);

        assertFalse(registry.isCredentialValid(user, credentialHash));
    }

    function test_OnlyIssuerCanIssue() public {
        vm.prank(user);
        vm.expectRevert("Not authorized issuer");
        registry.issueCredential(user, credentialHash, credentialType, expiresAt);
    }

    function test_OnlyOwnerCanAddIssuer() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        registry.addIssuer(address(4));
    }

    function test_ExpiredCredentialInvalid() public {
        uint64 shortExpiry = uint64(block.timestamp + 1 hours);

        vm.prank(issuer);
        registry.issueCredential(user, credentialHash, credentialType, shortExpiry);

        assertTrue(registry.isCredentialValid(user, credentialHash));

        // Warp past expiry
        vm.warp(block.timestamp + 2 hours);

        assertFalse(registry.isCredentialValid(user, credentialHash));
    }

    function test_GetUserCredentials() public {
        bytes32 hash1 = keccak256("cred1");
        bytes32 hash2 = keccak256("cred2");

        vm.startPrank(issuer);
        registry.issueCredential(user, hash1, credentialType, expiresAt);
        registry.issueCredential(user, hash2, credentialType, expiresAt);
        vm.stopPrank();

        bytes32[] memory creds = registry.getUserCredentials(user, credentialType);
        assertEq(creds.length, 2);
        assertEq(creds[0], hash1);
        assertEq(creds[1], hash2);
    }
}
