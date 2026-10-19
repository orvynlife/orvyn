// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {OrvynSplitterFactory} from "../src/OrvynSplitterFactory.sol";

/// TREASURY=0x… [OWNER=0x…] [CREATOR_BPS=7143] forge script script/Deploy.s.sol --rpc-url … --private-key … --broadcast
/// Deploys the factory (escrow = Pons v2 fee escrow), then hands ownership to OWNER if given.
contract Deploy is Script {
    address constant PONS_ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;

    function run() external returns (OrvynSplitterFactory f) {
        address treasury = vm.envAddress("TREASURY");
        address owner = vm.envOr("OWNER", address(0));
        uint16 bps = uint16(vm.envOr("CREATOR_BPS", uint256(7143)));
        vm.startBroadcast();
        f = new OrvynSplitterFactory(PONS_ESCROW, treasury, bps);
        if (owner != address(0)) f.transferOwnership(owner);
        vm.stopBroadcast();
        console2.log("OrvynSplitterFactory", address(f));
        console2.log("treasury", treasury, "creatorBps", bps);
        console2.log("owner", f.owner());
    }
}
