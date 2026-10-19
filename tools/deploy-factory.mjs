// Deploy OrvynSplitterFactory on Robinhood Chain from the ORVYN test wallet, then hand ownership
// to the owner's wallet.   node tools/deploy-factory.mjs <treasury> [owner] [--dry]
// Key: ~/.config/orvyn/test-wallet.env (ORVYN_TEST_KEY). Never printed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e";
const BPS = 7143;
const [treasury, ownerArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dry = process.argv.includes("--dry");
if (!ethers.isAddress(treasury)) throw new Error("usage: node tools/deploy-factory.mjs <treasury> [owner] [--dry]");
const owner = ethers.isAddress(ownerArg) ? ownerArg : treasury;

const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), ".config/orvyn/test-wallet.env"), "utf8").trim().split("\n").map((l) => l.split("=")));
const RPCS = ["https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com", "https://robinhood.drpc.org"];
let provider;
for (const u of RPCS) {
  try { const p = new ethers.JsonRpcProvider(u, 4663, { staticNetwork: true }); await p.getBlockNumber(); provider = p; console.log("rpc", u); break; } catch { /* next */ }
}
const wallet = new ethers.Wallet(env.ORVYN_TEST_KEY, provider);
const art = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts/out/OrvynSplitterFactory.sol/OrvynSplitterFactory.json"), "utf8"));
const cf = new ethers.ContractFactory(art.abi, art.bytecode.object, wallet);
const tx = await cf.getDeployTransaction(ESCROW, treasury, BPS);
const gas = await provider.estimateGas({ ...tx, from: wallet.address });
const fee = await provider.getFeeData();
console.log("deployer", wallet.address, "balance", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");
console.log("estimate", gas.toString(), "gas ≈", ethers.formatEther(gas * (fee.maxFeePerGas || fee.gasPrice)), "ETH");
if (dry) process.exit(0);

const c = await cf.deploy(ESCROW, treasury, BPS);
const rc = await c.deploymentTransaction().wait(1);
const addr = await c.getAddress();
console.log("OrvynSplitterFactory", addr, "block", rc.blockNumber, "tx", rc.hash);
if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
  const t = await c.transferOwnership(owner);
  await t.wait(1);
  console.log("ownership →", owner, "tx", t.hash);
}
const f = new ethers.Contract(addr, art.abi, provider);
console.log("check: owner", await f.owner(), "treasury", await f.treasury(), "creatorBps", (await f.creatorBps()).toString(), "escrow", await f.escrow());
fs.writeFileSync(path.join(ROOT, "contracts/deployment.json"), JSON.stringify({ chainId: 4663, factory: addr, block: rc.blockNumber, tx: rc.hash, treasury, owner, creatorBps: BPS, escrow: ESCROW, at: new Date().toISOString() }, null, 1));
