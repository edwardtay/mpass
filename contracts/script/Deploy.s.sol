// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MPassRegistry} from "../src/MPassRegistry.sol";
import {MPassVerifier} from "../src/MPassVerifier.sol";
import {MPassRegistryV2} from "../src/MPassRegistryV2.sol";
import {MPassVerifierV2} from "../src/MPassVerifierV2.sol";

contract DeployMPass is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying from:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy V2 Registry (enhanced with nullifiers + Merkle roots)
        MPassRegistryV2 registryV2 = new MPassRegistryV2();
        console.log("MPassRegistryV2 deployed at:", address(registryV2));

        // Deploy V2 Verifier
        MPassVerifierV2 verifierV2 = new MPassVerifierV2(address(registryV2));
        console.log("MPassVerifierV2 deployed at:", address(verifierV2));

        // Initialize with empty roots
        bytes32 emptyRoot = bytes32(0);
        registryV2.updateRoots(emptyRoot, emptyRoot);
        console.log("Initial roots set");

        vm.stopBroadcast();

        // Log addresses for frontend config
        console.log("\n=== Deployment Summary ===");
        console.log("NEXT_PUBLIC_REGISTRY_ADDRESS=", address(registryV2));
        console.log("NEXT_PUBLIC_VERIFIER_ADDRESS=", address(verifierV2));
    }
}
