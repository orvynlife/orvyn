// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {OrvynFeeSplitter} from "../src/OrvynFeeSplitter.sol";
import {OrvynSplitterFactory} from "../src/OrvynSplitterFactory.sol";

struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }
struct TokenParams {
    string name; string symbol; string logo; string description; Socials socials;
    address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt;
}

interface IPonsFactory {
    function launchFee() external view returns (uint256);
    function feeEscrow() external view returns (address);
    function launchForwarder() external view returns (address);
    function previewLaunchEconomics(uint256 launchConfigId, address pairToken) external view returns (bytes32);
    function launchToken(TokenParams calldata params, uint256 launchConfigId, address pairToken, address[] calldata snipeTaxExemptions)
        external payable returns (address token, address curve);
}
interface IPonsLaunchAndBuy {
    function launchAndBuy(TokenParams calldata params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] calldata snipeTaxExemptions)
        external payable returns (address token, address curve, uint256 tokensOut);
}
interface ICurve {
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256);
    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256);
}
interface IToken {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}
interface IEscrow { function balanceOf(address recipient) external view returns (uint256); }

/// Real Pons v2 on a Robinhood Chain fork: launch with the splitter as creator-fee recipient,
/// trade on the curve, collect, check the split.   forge test --match-contract PonsFork -vv
contract PonsForkTest is Test {
    IPonsFactory constant PONS = IPonsFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    uint16 constant B = 7143;

    OrvynSplitterFactory factory;
    address treasury = makeAddr("orvyn-treasury");
    address creator = makeAddr("agent-creator");

    function setUp() public {
        vm.createSelectFork(vm.envOr("FORK_RPC", string("https://robinhood.drpc.org")));
        factory = new OrvynSplitterFactory(PONS.feeEscrow(), treasury, B);
        vm.deal(creator, 10 ether);
    }

    function _params(address recipient, string memory agentId) internal view returns (TokenParams memory p) {
        string memory link = string.concat("https://orvyn.life/agent/", agentId);
        p = TokenParams({
            name: "Fork Agent", symbol: "FORK", logo: "https://orvyn.life/img/agents/nova-lens.webp",
            description: string.concat("Fork test agent\n\nAgent page: orvyn.life/agent/", agentId),
            socials: Socials("", "", "", link, ""),
            creatorFeeRecipient: recipient, creatorTaxBps: 0, buybackEnabled: false,
            expectedEconomics: PONS.previewLaunchEconomics(0, address(0)), salt: keccak256(bytes(agentId))
        });
    }

    function _trade(address curve, address token) internal returns (uint256 volume) {
        vm.warp(block.timestamp + 30); // past the 3 s snipe-tax window
        for (uint256 i; i < 3; i++) {
            address t = makeAddr(string.concat("trader", vm.toString(i)));
            vm.deal(t, 2 ether);
            vm.prank(t, t);
            ICurve(curve).buy{value: 0.5 ether}(0.5 ether, 0, t);
            volume += 0.5 ether;
            uint256 bal = IToken(token).balanceOf(t);
            vm.startPrank(t, t);
            IToken(token).approve(curve, bal);
            uint256 out = ICurve(curve).sell(bal / 2, 0, t);
            vm.stopPrank();
            volume += out;
        }
    }

    function _collectAndCheck(OrvynFeeSplitter s, address curve, uint256 volume) internal {
        uint256 c0 = creator.balance;
        uint256 t0 = treasury.balance;
        vm.prank(makeAddr("keeper"), makeAddr("keeper"));
        s.collect(curve);
        uint256 toCreator = creator.balance - c0;
        uint256 toTreasury = treasury.balance - t0;
        uint256 total = toCreator + toTreasury;
        console2.log("volume (wei)", volume);
        console2.log("collected  ", total);
        console2.log("to creator ", toCreator);
        console2.log("to treasury", toTreasury);
        assertGt(total, 0, "nothing collected");
        assertEq(toCreator, (total * B) / 10_000, "creator share");
        assertEq(address(s).balance, 0, "dust left in splitter");
        assertEq(IEscrow(PONS.feeEscrow()).balanceOf(address(s)), 0, "escrow not emptied");
        // Pons pays the creator ~70% of its 1% fee → ~0.7% of volume; ORVYN keeps 2/7 of that.
        uint256 bpsOfVolume = (total * 1_000_000) / volume;
        console2.log("creator fee, ppm of volume", bpsOfVolume);
        assertApproxEqRel(bpsOfVolume, 7_000, 0.05e18, "creator fee not ~0.7% of volume");
    }

    function test_launchToken_withSplitter() public {
        address splitter = factory.create(creator, bytes32("agent-fork-1"));
        uint256 fee = PONS.launchFee();
        vm.prank(creator, creator);
        (address token, address curve) = PONS.launchToken{value: fee}(_params(splitter, "agentfork1"), 0, address(0), new address[](0));
        uint256 volume = _trade(curve, token);
        _collectAndCheck(OrvynFeeSplitter(payable(splitter)), curve, volume);
    }

    function test_launchAndBuy_withSplitter() public {
        address splitter = factory.create(creator, bytes32("agent-fork-2"));
        uint256 fee = PONS.launchFee();
        IPonsLaunchAndBuy lab = IPonsLaunchAndBuy(PONS.launchForwarder());
        vm.prank(creator, creator);
        (address token, address curve, uint256 got) = lab.launchAndBuy{value: fee + 0.01 ether}(
            _params(splitter, "agentfork2"), 0, address(0), 0.01 ether, 0, creator, new address[](0));
        assertGt(got, 0);
        assertEq(IToken(token).balanceOf(creator), got, "first buy goes to the creator");
        uint256 volume = _trade(curve, token) + 0.01 ether;
        _collectAndCheck(OrvynFeeSplitter(payable(splitter)), curve, volume);
    }

    function test_collectTwiceIsHarmless() public {
        address splitter = factory.create(creator, bytes32("agent-fork-3"));
        uint256 fee = PONS.launchFee();
        vm.prank(creator, creator);
        (address token, address curve) = PONS.launchToken{value: fee}(_params(splitter, "agentfork3"), 0, address(0), new address[](0));
        _trade(curve, token);
        OrvynFeeSplitter(payable(splitter)).collect(curve);
        uint256 c = creator.balance;
        uint256 t = treasury.balance;
        OrvynFeeSplitter(payable(splitter)).collect(curve);
        assertEq(creator.balance, c);
        assertEq(treasury.balance, t);
    }
}
