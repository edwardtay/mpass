// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title MPassSBT - Soul-Bound Token for Verified Credentials
/// @notice Non-transferable NFT issued to users who complete ZK verification
/// @dev Implements latest zkKYC patterns from zkMe and Self Protocol
/// @custom:research Based on ERC-5192 (Minimal Soulbound NFTs) and zkMe's SBT model
contract MPassSBT is ERC721 {
    // ============ Types ============

    /// @notice Credential types that can be verified
    enum CredentialType {
        AGE_18_PLUS,        // 0: Age >= 18
        AGE_21_PLUS,        // 1: Age >= 21
        JURISDICTION,       // 2: Not in blocked jurisdiction
        ACCREDITED,         // 3: SEC accredited investor ($200k+)
        AML_COMPLIANT,      // 4: OFAC AML compliance
        KYC_FULL           // 5: Full KYC (all above)
    }

    /// @notice ERC-735 compatible claim structure
    /// @dev Aligned with ONCHAINID and ERC-3643 standards
    struct Claim {
        uint256 topic;           // Claim type (maps to CredentialType)
        uint256 scheme;          // Verification scheme (1=ZK-SNARK, 2=signature)
        address issuer;          // Who verified (verifier contract)
        bytes32 commitment;      // ZK commitment hash
        bytes32 nullifier;       // Proof nullifier (prevents reuse)
        uint64 issuedAt;         // Timestamp of verification
        uint64 expiresAt;        // Expiration (0 = never)
        string uri;              // IPFS URI for metadata (optional)
    }

    /// @notice Token metadata
    struct TokenData {
        address holder;
        uint256[] credentialTypes;  // Array of verified credential types
        uint64 mintedAt;
        bool locked;                // SBT: always true
    }

    // ============ State ============

    address public owner;
    address public mPassVerifier;           // MPassVerifier contract
    address public mPassRegistry;           // MPassRegistry contract

    uint256 private _tokenIdCounter;

    // Token ID => TokenData
    mapping(uint256 => TokenData) public tokens;

    // Address => Token ID (one SBT per address)
    mapping(address => uint256) public userToken;

    // Token ID => Credential Type => Claim
    mapping(uint256 => mapping(uint256 => Claim)) public claims;

    // Commitment => Token ID (for lookup)
    mapping(bytes32 => uint256) public commitmentToToken;

    // ============ Events ============

    /// @notice ERC-5192 Locked event (SBT standard)
    event Locked(uint256 tokenId);

    /// @notice Claim added to token (ERC-735 compatible)
    event ClaimAdded(
        uint256 indexed tokenId,
        uint256 indexed topic,
        bytes32 commitment,
        address issuer
    );

    /// @notice Claim revoked
    event ClaimRevoked(uint256 indexed tokenId, uint256 indexed topic);

    /// @notice Full KYC achieved
    event FullKYCVerified(address indexed user, uint256 indexed tokenId);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == mPassVerifier, "Not verifier");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _verifier,
        address _registry
    ) ERC721("mPass Verified Identity", "mPASS") {
        owner = msg.sender;
        mPassVerifier = _verifier;
        mPassRegistry = _registry;
        _tokenIdCounter = 1; // Start from 1
    }

    // ============ Admin Functions ============

    function setVerifier(address _verifier) external onlyOwner {
        mPassVerifier = _verifier;
    }

    function setRegistry(address _registry) external onlyOwner {
        mPassRegistry = _registry;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ============ SBT Core Functions ============

    /// @notice Mint SBT to user after first successful verification
    /// @dev Called by verifier contract after ZK proof validation
    function mintSBT(
        address user,
        CredentialType credType,
        bytes32 commitment,
        bytes32 nullifier,
        uint64 expiresAt
    ) external onlyVerifier returns (uint256 tokenId) {
        // Check if user already has SBT
        if (userToken[user] != 0) {
            // Add claim to existing token
            tokenId = userToken[user];
            _addClaim(tokenId, credType, commitment, nullifier, expiresAt);
        } else {
            // Mint new SBT
            tokenId = _tokenIdCounter++;
            _mint(user, tokenId);

            tokens[tokenId] = TokenData({
                holder: user,
                credentialTypes: new uint256[](0),
                mintedAt: uint64(block.timestamp),
                locked: true
            });

            userToken[user] = tokenId;
            commitmentToToken[commitment] = tokenId;

            // Add initial claim
            _addClaim(tokenId, credType, commitment, nullifier, expiresAt);

            // Emit locked event (ERC-5192)
            emit Locked(tokenId);
        }

        return tokenId;
    }

    /// @notice Add a claim to existing SBT
    function addClaim(
        uint256 tokenId,
        CredentialType credType,
        bytes32 commitment,
        bytes32 nullifier,
        uint64 expiresAt
    ) external onlyVerifier {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        _addClaim(tokenId, credType, commitment, nullifier, expiresAt);
    }

    /// @notice Internal claim addition
    function _addClaim(
        uint256 tokenId,
        CredentialType credType,
        bytes32 commitment,
        bytes32 nullifier,
        uint64 expiresAt
    ) internal {
        uint256 topic = uint256(credType);

        claims[tokenId][topic] = Claim({
            topic: topic,
            scheme: 1, // ZK-SNARK
            issuer: msg.sender,
            commitment: commitment,
            nullifier: nullifier,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            uri: ""
        });

        // Add to credential types array if not present
        TokenData storage token = tokens[tokenId];
        bool exists = false;
        for (uint256 i = 0; i < token.credentialTypes.length; i++) {
            if (token.credentialTypes[i] == topic) {
                exists = true;
                break;
            }
        }
        if (!exists) {
            token.credentialTypes.push(topic);
        }

        commitmentToToken[commitment] = tokenId;

        emit ClaimAdded(tokenId, topic, commitment, msg.sender);

        // Check for full KYC
        if (_hasFullKYC(tokenId)) {
            emit FullKYCVerified(tokens[tokenId].holder, tokenId);
        }
    }

    /// @notice Revoke a claim
    function revokeClaim(uint256 tokenId, CredentialType credType) external onlyVerifier {
        uint256 topic = uint256(credType);
        delete claims[tokenId][topic];
        emit ClaimRevoked(tokenId, topic);
    }

    // ============ View Functions ============

    /// @notice Check if address has specific credential
    function hasCredential(address user, CredentialType credType) external view returns (bool) {
        uint256 tokenId = userToken[user];
        if (tokenId == 0) return false;

        Claim storage claim = claims[tokenId][uint256(credType)];
        if (claim.issuedAt == 0) return false;
        if (claim.expiresAt > 0 && block.timestamp > claim.expiresAt) return false;

        return true;
    }

    /// @notice Check if address has full KYC (all credentials)
    function hasFullKYC(address user) external view returns (bool) {
        uint256 tokenId = userToken[user];
        if (tokenId == 0) return false;
        return _hasFullKYC(tokenId);
    }

    function _hasFullKYC(uint256 tokenId) internal view returns (bool) {
        // Check: Age + Jurisdiction + Accredited + AML
        CredentialType[4] memory required = [
            CredentialType.AGE_18_PLUS,
            CredentialType.JURISDICTION,
            CredentialType.ACCREDITED,
            CredentialType.AML_COMPLIANT
        ];

        for (uint256 i = 0; i < required.length; i++) {
            Claim storage claim = claims[tokenId][uint256(required[i])];
            if (claim.issuedAt == 0) return false;
            if (claim.expiresAt > 0 && block.timestamp > claim.expiresAt) return false;
        }

        return true;
    }

    /// @notice Get all credentials for user
    function getUserCredentials(address user) external view returns (uint256[] memory) {
        uint256 tokenId = userToken[user];
        if (tokenId == 0) return new uint256[](0);
        return tokens[tokenId].credentialTypes;
    }

    /// @notice Get claim details
    function getClaim(
        uint256 tokenId,
        CredentialType credType
    ) external view returns (Claim memory) {
        return claims[tokenId][uint256(credType)];
    }

    /// @notice ERC-5192: Check if token is locked (always true for SBT)
    function locked(uint256 tokenId) external view returns (bool) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return true; // SBTs are always locked
    }

    // ============ SBT Transfer Restrictions ============

    /// @notice Override transfer to prevent SBT transfers
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        // Allow minting (from = 0) but block transfers
        if (from != address(0) && to != address(0)) {
            revert("SBT: Transfer not allowed");
        }

        return super._update(to, tokenId, auth);
    }

    /// @notice Override approve to prevent approvals
    function approve(address, uint256) public pure override {
        revert("SBT: Approval not allowed");
    }

    /// @notice Override setApprovalForAll to prevent approvals
    function setApprovalForAll(address, bool) public pure override {
        revert("SBT: Approval not allowed");
    }

    // ============ Metadata ============

    /// @notice Token URI with credential info
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        TokenData storage token = tokens[tokenId];
        uint256 numCredentials = token.credentialTypes.length;

        // Return JSON metadata (simplified)
        return string(abi.encodePacked(
            "data:application/json;base64,",
            _encodeBase64(abi.encodePacked(
                '{"name":"mPass Verified Identity #',
                _toString(tokenId),
                '","description":"Soul-bound token proving ZK-verified identity credentials on Mantle",',
                '"attributes":[{"trait_type":"Credentials Verified","value":',
                _toString(numCredentials),
                '},{"trait_type":"Full KYC","value":"',
                _hasFullKYC(tokenId) ? "true" : "false",
                '"}]}'
            ))
        ));
    }

    // ============ Helpers ============

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _encodeBase64(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";

        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i = 0;
        uint256 j = 0;

        while (i < len) {
            uint256 a = i < len ? uint256(uint8(data[i++])) : 0;
            uint256 b = i < len ? uint256(uint8(data[i++])) : 0;
            uint256 c = i < len ? uint256(uint8(data[i++])) : 0;

            uint256 triple = (a << 16) + (b << 8) + c;

            result[j++] = TABLE[(triple >> 18) & 0x3F];
            result[j++] = TABLE[(triple >> 12) & 0x3F];
            result[j++] = TABLE[(triple >> 6) & 0x3F];
            result[j++] = TABLE[triple & 0x3F];
        }

        // Padding
        if (len % 3 == 1) {
            result[encodedLen - 1] = "=";
            result[encodedLen - 2] = "=";
        } else if (len % 3 == 2) {
            result[encodedLen - 1] = "=";
        }

        return string(result);
    }
}
