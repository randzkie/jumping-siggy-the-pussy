// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal TEEServiceRegistry interface for deploy-time executor discovery.
/// @dev Registry: 0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F (Ritual Chain)
interface ITEEServiceRegistry {
    struct TEEServiceNode {
        address paymentAddress;
        address teeAddress;
        uint8 teeType;
        bytes publicKey;
        string endpoint;
        bytes32 certPubKeyHash;
        uint8 capability;
    }

    struct TEEServiceContext {
        TEEServiceNode node;
        bool isValid;
        bytes32 workloadId;
    }

    function getServicesByCapability(uint8 capability, bool checkValidity)
        external
        view
        returns (TEEServiceContext[] memory);
}
