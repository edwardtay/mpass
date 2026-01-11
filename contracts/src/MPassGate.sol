// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ImPassVerifier} from "./interfaces/ImPassVerifier.sol";

/// @title MPassGate
/// @notice Base contract for protocols to easily integrate mPass verification
/// @dev Inherit this contract to add compliance gating to any protocol
abstract contract MPassGate {

    ImPassVerifier public mPassVerifier;

    // Compliance requirements for this protocol
    bool public requireAge;
    uint8 public minAge;
    bool public requireJurisdiction;
    bool public requireAccredited;
    bool public requireAML;

    error NotCompliant(string reason);

    constructor(address _verifier) {
        mPassVerifier = ImPassVerifier(_verifier);
    }

    /// @notice Modifier to enforce compliance on functions
    modifier onlyCompliant(bytes calldata proof) {
        _checkCompliance(msg.sender, proof);
        _;
    }

    /// @notice Check if a user meets all compliance requirements
    function _checkCompliance(address user, bytes calldata proof) internal view {
        // For batch verification, we need to decode the proof into components
        // This is a simplified version - real impl would parse proof properly

        if (requireAge) {
            if (!mPassVerifier.verifyAge(user, minAge, proof)) {
                revert NotCompliant("Age verification failed");
            }
        }

        if (requireJurisdiction) {
            if (!mPassVerifier.verifyJurisdiction(user, proof)) {
                revert NotCompliant("Jurisdiction verification failed");
            }
        }

        if (requireAccredited) {
            if (!mPassVerifier.verifyAccredited(user, proof)) {
                revert NotCompliant("Accreditation verification failed");
            }
        }

        if (requireAML) {
            if (!mPassVerifier.verifyAML(user, proof)) {
                revert NotCompliant("AML verification failed");
            }
        }
    }

    /// @notice Set compliance requirements (only callable by inheriting contract)
    function _setRequirements(
        bool _requireAge,
        uint8 _minAge,
        bool _requireJurisdiction,
        bool _requireAccredited,
        bool _requireAML
    ) internal {
        requireAge = _requireAge;
        minAge = _minAge;
        requireJurisdiction = _requireJurisdiction;
        requireAccredited = _requireAccredited;
        requireAML = _requireAML;
    }

    /// @notice Update the verifier address
    function _setVerifier(address _verifier) internal {
        mPassVerifier = ImPassVerifier(_verifier);
    }
}


/// @title ExampleRWAProtocol
/// @notice Example showing how to integrate mPass
contract ExampleRWAProtocol is MPassGate {

    mapping(address => uint256) public deposits;

    constructor(address _verifier) MPassGate(_verifier) {
        // This RWA protocol requires:
        // - User is 18+
        // - User is not in restricted jurisdiction
        // - User is accredited investor
        _setRequirements(
            true,   // requireAge
            18,     // minAge
            true,   // requireJurisdiction
            true,   // requireAccredited
            false   // requireAML (optional for this protocol)
        );
    }

    /// @notice Deposit funds - requires mPass compliance proof
    function deposit(bytes calldata complianceProof) external payable onlyCompliant(complianceProof) {
        deposits[msg.sender] += msg.value;
    }

    /// @notice Withdraw funds - no proof needed for withdrawals
    function withdraw(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "Insufficient balance");
        deposits[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }
}
