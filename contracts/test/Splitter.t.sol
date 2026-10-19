// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OrvynFeeSplitter} from "../src/OrvynFeeSplitter.sol";
import {OrvynSplitterFactory} from "../src/OrvynSplitterFactory.sol";

/// Escrow stand-in: pooled ETH per recipient, claim() pays msg.sender.
contract MockEscrow {
    mapping(address => uint256) public balanceOf;
    function credit(address r) external payable { balanceOf[r] += msg.value; }
    function claim() external returns (uint256 a) {
        a = balanceOf[msg.sender];
        balanceOf[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: a}("");
        require(ok);
    }
    function claimToken(address) external pure returns (uint256) { return 0; }
}

/// Curve stand-in: holds fees for one recipient; only that recipient may sweep them to the escrow.
contract MockCurve {
    MockEscrow immutable escrow;
    address public recipient;
    constructor(MockEscrow e) { escrow = e; }
    function setRecipient(address r) external { recipient = r; }
    receive() external payable {}
    function sweepFees(uint256) external {
        require(msg.sender == recipient, "not recipient");
        escrow.credit{value: address(this).balance}(recipient);
    }
}

contract Rejecter {
    receive() external payable { revert(); }
}

contract SplitterTest is Test {
    uint16 constant B = 7143; // creator 0.5% of volume out of Pons' 0.7% creator fee
    MockEscrow escrow;
    MockCurve curve;
    OrvynSplitterFactory factory;
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");

    function setUp() public {
        escrow = new MockEscrow();
        curve = new MockCurve(escrow);
        factory = new OrvynSplitterFactory(address(escrow), treasury, B);
    }

    function _splitter() internal returns (OrvynFeeSplitter s) {
        s = OrvynFeeSplitter(payable(factory.create(creator, bytes32("agent-1"))));
        curve.setRecipient(address(s));
    }

    function test_predictMatchesCreate() public {
        address p = factory.predict(creator, bytes32("agent-1"));
        assertEq(address(_splitter()), p);
        assertTrue(factory.isSplitter(p));
        assertEq(OrvynFeeSplitter(payable(p)).creatorBps(), B);
    }

    function test_oneSplitterPerAgent() public {
        _splitter();
        vm.expectRevert(OrvynSplitterFactory.AlreadyCreated.selector);
        factory.create(creator, bytes32("agent-1"));
    }

    function test_collectSplitsCurveAndEscrow() public {
        OrvynFeeSplitter s = _splitter();
        vm.deal(address(curve), 0.7 ether);          // fees still on the curve
        escrow.credit{value: 0.3 ether}(address(s));  // fees already swept earlier
        vm.prank(makeAddr("anyone"));
        s.collect(address(curve));
        assertEq(creator.balance, (1 ether * uint256(B)) / 10_000);
        assertEq(treasury.balance, 1 ether - creator.balance);
        assertEq(address(s).balance, 0);
        assertEq(escrow.balanceOf(address(s)), 0);
    }

    function test_collectAfterGraduationWithoutCurve() public {
        OrvynFeeSplitter s = _splitter();
        escrow.credit{value: 2 ether}(address(s));
        s.collect(address(0));
        assertEq(creator.balance + treasury.balance, 2 ether);
    }

    function test_badCurveDoesNotBlock() public {
        OrvynFeeSplitter s = _splitter();
        escrow.credit{value: 1 ether}(address(s));
        s.collect(address(new Rejecter())); // sweepFees reverts → ignored
        assertEq(creator.balance + treasury.balance, 1 ether);
    }

    function test_setCreatorOnlyByCreator() public {
        OrvynFeeSplitter s = _splitter();
        address next = makeAddr("next");
        vm.expectRevert(OrvynFeeSplitter.NotCreator.selector);
        vm.prank(treasury);
        s.setCreator(next);
        vm.prank(creator);
        s.setCreator(next);
        assertEq(s.creator(), next);
        vm.deal(address(s), 1 ether);
        s.distribute();
        assertEq(next.balance, (1 ether * uint256(B)) / 10_000);
        assertEq(creator.balance, 0);
    }

    function test_creatorCanFixARejectingWallet() public {
        Rejecter bad = new Rejecter();
        OrvynFeeSplitter s = OrvynFeeSplitter(payable(factory.create(address(bad), bytes32("x"))));
        vm.deal(address(s), 1 ether);
        vm.expectRevert(OrvynFeeSplitter.TransferFailed.selector);
        s.distribute();
        vm.prank(address(bad));
        s.setCreator(creator);
        s.distribute();
        assertEq(creator.balance + treasury.balance, 1 ether);
    }

    function test_treasuryChangeAppliesToExistingSplitters() public {
        OrvynFeeSplitter s = _splitter();
        address t2 = makeAddr("t2");
        factory.setTreasury(t2);
        vm.deal(address(s), 1 ether);
        s.distribute();
        assertEq(t2.balance, 1 ether - (1 ether * uint256(B)) / 10_000);
        assertEq(treasury.balance, 0);
    }

    function test_bpsChangeOnlyAffectsNewSplitters() public {
        OrvynFeeSplitter s = _splitter();
        factory.setCreatorBps(8_000);
        OrvynFeeSplitter s2 = OrvynFeeSplitter(payable(factory.create(creator, bytes32("agent-2"))));
        assertEq(s.creatorBps(), B);
        assertEq(s2.creatorBps(), 8_000);
    }

    function test_ownerGuards() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(OrvynSplitterFactory.NotOwner.selector);
        factory.setTreasury(stranger);
        vm.expectRevert(OrvynSplitterFactory.NotOwner.selector);
        factory.setCreatorBps(10_000);
        vm.expectRevert(OrvynSplitterFactory.NotOwner.selector);
        factory.transferOwnership(stranger);
        vm.stopPrank();
        vm.expectRevert(OrvynSplitterFactory.BadBps.selector);
        factory.setCreatorBps(4_999);
    }

    function testFuzz_splitIsExact(uint96 amount) public {
        OrvynFeeSplitter s = _splitter();
        vm.deal(address(s), amount);
        s.distribute();
        assertEq(creator.balance + treasury.balance, amount);
        assertEq(creator.balance, (uint256(amount) * B) / 10_000);
    }
}
