// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MPassRegistryV2.sol";

contract MPassRegistryV2Test is Test {
    MPassRegistryV2 public registry;

    address public owner = address(1);
    address public issuer = address(2);
    address public user = address(3);

    bytes32 public testCommitment = keccak256("test_credential");
    bytes32 public testNullifier = keccak256("test_nullifier");
    bytes32 public registryRoot = keccak256("registry_root");
    bytes32 public revocationRoot = keccak256("revocation_root");

    function setUp() public {
        vm.startPrank(owner);
        registry = new MPassRegistryV2();
        registry.addIssuer(issuer);
        vm.stopPrank();
    }

    // ============ Root Management Tests ============

    function test_UpdateRoots() public {
        vm.prank(issuer);
        registry.updateRoots(registryRoot, revocationRoot);

        (bytes32 regRoot, bytes32 revRoot, uint64 updatedAt) = registry.getRoots();
        assertEq(regRoot, registryRoot);
        assertEq(revRoot, revocationRoot);
        assertGt(updatedAt, 0);
    }

    function test_OnlyUpdaterCanUpdateRoots() public {
        vm.prank(user);
        vm.expectRevert("Not authorized updater");
        registry.updateRoots(registryRoot, revocationRoot);
    }

    // ============ Credential Tests ============

    function test_RegisterCredential() public {
        vm.prank(issuer);
        registry.registerCredential(testCommitment);

        assertTrue(registry.credentialExists(testCommitment));
        assertTrue(registry.isCredentialValid(testCommitment));
    }

    function test_RevokeCredential() public {
        vm.startPrank(issuer);
        registry.registerCredential(testCommitment);
        registry.revokeCredential(testCommitment);
        vm.stopPrank();

        assertTrue(registry.credentialRevoked(testCommitment));
        assertFalse(registry.isCredentialValid(testCommitment));
    }

    function test_CannotRegisterTwice() public {
        vm.startPrank(issuer);
        registry.registerCredential(testCommitment);

        vm.expectRevert("Already registered");
        registry.registerCredential(testCommitment);
        vm.stopPrank();
    }

    // ============ Nullifier Tests ============

    function test_UseNullifier() public {
        vm.prank(user);
        registry.useNullifier(testNullifier);

        assertTrue(registry.isNullifierUsed(testNullifier));
    }

    function test_CannotReuseNullifier() public {
        vm.prank(user);
        registry.useNullifier(testNullifier);

        vm.prank(user);
        vm.expectRevert("Nullifier already used");
        registry.useNullifier(testNullifier);
    }

    function test_EventNullifier() public {
        uint256 eventId = 12345;

        vm.prank(user);
        registry.useEventNullifier(eventId, testNullifier);

        assertTrue(registry.isEventNullifierUsed(eventId, testNullifier));
        assertFalse(registry.isEventNullifierUsed(eventId + 1, testNullifier)); // Different event
        assertFalse(registry.isNullifierUsed(testNullifier)); // Global not affected
    }

    function test_SameNullifierDifferentEvents() public {
        uint256 eventId1 = 100;
        uint256 eventId2 = 200;

        vm.startPrank(user);
        registry.useEventNullifier(eventId1, testNullifier);
        registry.useEventNullifier(eventId2, testNullifier); // Should succeed
        vm.stopPrank();

        assertTrue(registry.isEventNullifierUsed(eventId1, testNullifier));
        assertTrue(registry.isEventNullifierUsed(eventId2, testNullifier));
    }

    // ============ Batch Operations ============

    function test_BatchRegister() public {
        bytes32[] memory commitments = new bytes32[](3);
        commitments[0] = keccak256("cred1");
        commitments[1] = keccak256("cred2");
        commitments[2] = keccak256("cred3");

        vm.prank(issuer);
        registry.batchRegisterCredentials(commitments);

        for (uint256 i = 0; i < 3; i++) {
            assertTrue(registry.credentialExists(commitments[i]));
        }
    }

    function test_BatchRevoke() public {
        bytes32[] memory commitments = new bytes32[](2);
        commitments[0] = keccak256("cred1");
        commitments[1] = keccak256("cred2");

        vm.startPrank(issuer);
        registry.batchRegisterCredentials(commitments);
        registry.batchRevokeCredentials(commitments);
        vm.stopPrank();

        for (uint256 i = 0; i < 2; i++) {
            assertTrue(registry.credentialRevoked(commitments[i]));
        }
    }

    // ============ Admin Tests ============

    function test_AddRemoveIssuer() public {
        address newIssuer = address(4);

        vm.prank(owner);
        registry.addIssuer(newIssuer);
        assertTrue(registry.authorizedIssuers(newIssuer));

        vm.prank(owner);
        registry.removeIssuer(newIssuer);
        assertFalse(registry.authorizedIssuers(newIssuer));
    }

    function test_TransferOwnership() public {
        address newOwner = address(5);

        vm.prank(owner);
        registry.transferOwnership(newOwner);

        assertEq(registry.owner(), newOwner);
    }
}
