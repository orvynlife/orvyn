// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// Pons v2 bonding curve: fees sit on the curve until the fee recipient sweeps them into the escrow.
interface IPonsCurve {
    function sweepFees(uint256 minBuybackTokensOut) external;
}

/// Pons v2 fee escrow: one pooled balance per recipient, paid out by claim().
interface IPonsEscrow {
    function claim() external returns (uint256 amount);
    function claimToken(address token) external returns (uint256 amount);
}

interface ISplitterFactory {
    function treasury() external view returns (address);
}

interface IERC20 {
    function balanceOf(address owner) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title OrvynFeeSplitter
/// @notice The creator-fee recipient of exactly one ORVYN agent coin on Pons. Anyone may call
///         collect(): it sweeps the curve, claims the escrow and splits what arrived between the
///         agent's creator (creatorBps, fixed at creation) and the ORVYN treasury (the rest).
///         No one can redirect the treasury share to themselves, and no one but the creator can
///         change where the creator share goes.

contract OrvynFeeSplitter {
    uint16 public constant BPS = 10_000;

    address public immutable factory;
    address public immutable escrow;
    uint16 public immutable creatorBps;
    address public creator;

    uint256 private locked = 1;

    event Distributed(address indexed asset, uint256 total, uint256 toCreator, uint256 toTreasury);
    event CreatorChanged(address indexed from, address indexed to);

    error NotCreator();
    error ZeroAddress();
    error Reentrancy();
    error TransferFailed();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address escrow_, address creator_, uint16 creatorBps_) {
        if (escrow_ == address(0) || creator_ == address(0)) revert ZeroAddress();
        factory = msg.sender;
        escrow = escrow_;
        creator = creator_;
        creatorBps = creatorBps_;
    }

    receive() external payable {}

    /// @notice Sweep `curve` (pass address(0) after graduation), claim the escrow, split the ETH.
    /// Failures of the sweep or the claim are tolerated: whatever ETH this contract holds is split.
    function collect(address curve) external nonReentrant {
        if (curve != address(0)) {
            try IPonsCurve(curve).sweepFees(0) {} catch {}
        }
        try IPonsEscrow(escrow).claim() {} catch {}
        _splitEth();
    }

    /// @notice Split ETH already held (e.g. sent directly) without touching Pons.
    function distribute() external nonReentrant {
        _splitEth();
    }

    /// @notice Fees in a pair token (non-ETH launches): claim from the escrow and split.
    function collectToken(address token) external nonReentrant {
        try IPonsEscrow(escrow).claimToken(token) {} catch {}
        uint256 total = IERC20(token).balanceOf(address(this));
        if (total == 0) return;
        uint256 toCreator = (total * creatorBps) / BPS;
        _safeTransfer(token, creator, toCreator);
        _safeTransfer(token, ISplitterFactory(factory).treasury(), total - toCreator);
        emit Distributed(token, total, toCreator, total - toCreator);
    }

    /// @notice The creator can move their share to another wallet.
    function setCreator(address next) external {
        if (msg.sender != creator) revert NotCreator();
        if (next == address(0)) revert ZeroAddress();
        emit CreatorChanged(creator, next);
        creator = next;
    }

    function _splitEth() private {
        uint256 total = address(this).balance;
        if (total == 0) return;
        uint256 toCreator = (total * creatorBps) / BPS;
        uint256 toTreasury = total - toCreator;
        address treasury = ISplitterFactory(factory).treasury();
        bool okC = true;
        if (toCreator != 0) (okC,) = creator.call{value: toCreator}("");
        (bool okT,) = treasury.call{value: toTreasury}("");
        if (!okC || !okT) revert TransferFailed();
        emit Distributed(address(0), total, toCreator, toTreasury);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
