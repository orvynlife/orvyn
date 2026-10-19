// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OrvynFeeSplitter} from "./OrvynFeeSplitter.sol";

/// @title OrvynSplitterFactory
/// @notice Deploys one OrvynFeeSplitter per agent coin at a predictable CREATE2 address, so the
///         launch transaction can name it as Pons' creatorFeeRecipient. Keeps the list of genuine
///         splitters (isSplitter) that the ORVYN server checks before accepting a launch.
contract OrvynSplitterFactory {
    uint16 public constant MIN_CREATOR_BPS = 5_000;
    uint16 public constant MAX_CREATOR_BPS = 10_000;

    address public immutable escrow;
    address public owner;
    address public treasury;
    /// Share for splitters created from now on; existing splitters keep theirs.
    uint16 public creatorBps;

    mapping(address => bool) public isSplitter;

    event SplitterCreated(address indexed splitter, address indexed creator, bytes32 indexed salt, uint16 creatorBps);
    event TreasuryChanged(address indexed treasury);
    event CreatorBpsChanged(uint16 creatorBps);
    event OwnershipTransferred(address indexed from, address indexed to);

    error NotOwner();
    error ZeroAddress();
    error BadBps();
    error AlreadyCreated();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address escrow_, address treasury_, uint16 creatorBps_) {
        if (escrow_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (creatorBps_ < MIN_CREATOR_BPS || creatorBps_ > MAX_CREATOR_BPS) revert BadBps();
        escrow = escrow_;
        treasury = treasury_;
        creatorBps = creatorBps_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Deploy the splitter for `creator`. `salt` is the agent id, so one agent → one splitter.
    function create(address creator, bytes32 salt) external returns (address splitter) {
        address predicted = predict(creator, salt);
        if (predicted.code.length != 0) revert AlreadyCreated();
        splitter = address(new OrvynFeeSplitter{salt: _salt(creator, salt)}(escrow, creator, creatorBps));
        isSplitter[splitter] = true;
        emit SplitterCreated(splitter, creator, salt, creatorBps);
    }

    /// @notice Address create() will deploy to for (creator, salt) at the current creatorBps.
    function predict(address creator, bytes32 salt) public view returns (address) {
        bytes32 codeHash = keccak256(abi.encodePacked(type(OrvynFeeSplitter).creationCode, abi.encode(escrow, creator, creatorBps)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), _salt(creator, salt), codeHash)))));
    }

    function setTreasury(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        treasury = next;
        emit TreasuryChanged(next);
    }

    function setCreatorBps(uint16 next) external onlyOwner {
        if (next < MIN_CREATOR_BPS || next > MAX_CREATOR_BPS) revert BadBps();
        creatorBps = next;
        emit CreatorBpsChanged(next);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, next);
        owner = next;
    }

    function _salt(address creator, bytes32 salt) private pure returns (bytes32) {
        return keccak256(abi.encode(creator, salt));
    }
}
