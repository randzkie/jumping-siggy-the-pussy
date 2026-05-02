// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PresenceRegistry
/// @notice Records player presence for Jumping Siggy on Ritual Net.
contract PresenceRegistry {
    uint256 public totalPresenceRecords;

    mapping(address => uint256) public playerPresenceCount;
    mapping(address => uint256) public lastSeenAt;
    mapping(address => uint256) public bestRecordedScore;

    event PresenceRecorded(
        address indexed player,
        uint256 indexed score,
        uint256 timestamp,
        uint256 playerPresenceCount,
        uint256 totalPresenceRecords
    );

    function recordPresence(uint256 score) external {
        totalPresenceRecords += 1;
        playerPresenceCount[msg.sender] += 1;
        lastSeenAt[msg.sender] = block.timestamp;

        if (score > bestRecordedScore[msg.sender]) {
            bestRecordedScore[msg.sender] = score;
        }

        emit PresenceRecorded(
            msg.sender,
            score,
            block.timestamp,
            playerPresenceCount[msg.sender],
            totalPresenceRecords
        );
    }
}
