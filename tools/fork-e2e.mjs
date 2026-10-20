// End-to-end on a Robinhood Chain fork, no real funds:
//   anvil fork → deploy OrvynSplitterFactory → ORVYN server (test data dir) → browser with an
//   injected wallet: create agent → launch coin (splitter + first buy) → traders trade →
//   "Collect & split" in the UI → check 0.5% / 0.2% split on chain.
// node tools/fork-e2e.mjs        (needs anvil + Chrome; ports 8548 / 9171)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const RPC_PORT = 8548, WEB_PORT = 9171, RPC = `http://127.0.0.1:${RPC_PORT}`, WEB = `http://127.0.0.1:${WEB_PORT}`;
const FORK = process.env.FORK_RPC || "https://robinhood.drpc.org";
const ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
let ok = 0, bad = 0;
const check = (cond, label, extra = "") => { cond ? ok++ : bad++; console.log(`${cond ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`); };

function start(cmd, args, env, tag) {
  const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[${tag}] ${d}`));
  p.stderr.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[${tag}!] ${d}`));
  procs.push(p); return p;
}
async function until(fn, ms, label) {
  const t0 = Date.now();
  for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() - t0 > ms) throw new Error("timeout: " + label); await sleep(500); }
}
const cleanup = () => procs.forEach((p) => { try { p.kill("SIGTERM"); } catch {} });
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

try {
  // 1. fork
  start("anvil", ["--fork-url", FORK, "--port", String(RPC_PORT), "--no-storage-caching", "--retries", "12", "--silent"], {}, "anvil");
  const rpc = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: false, pollingInterval: 250 });
  await until(() => rpc.getBlockNumber(), 60_000, "anvil up");
  const net = await rpc.getNetwork();
  check(net.chainId === 4663n, "fork is Robinhood Chain", "chain " + net.chainId);

  const acct = async (label) => {
    const a = ethers.Wallet.createRandom().address;
    await rpc.send("anvil_setBalance", [a, "0x" + (20n * 10n ** 18n).toString(16)]);
    await rpc.send("anvil_impersonateAccount", [a]);
    return { a, s: await rpc.getSigner(a), label };
  };
  const deployer = await acct("deployer"), user = await acct("user"), treasury = ethers.Wallet.createRandom().address;

  // 2. factory
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts/out/OrvynSplitterFactory.sol/OrvynSplitterFactory.json"), "utf8"));
  const factory = await new ethers.ContractFactory(art.abi, art.bytecode.object, deployer.s).deploy(ESCROW, treasury, 7143);
  await factory.waitForDeployment();
  const factoryAddr = (await factory.getAddress()).toLowerCase();
  check(!!factoryAddr, "factory deployed on fork", factoryAddr);

  // 3. ORVYN server against the fork, in a throwaway data dir
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "orvyn-e2e-"));
  fs.copyFileSync(path.join(ROOT, "data/agents.json"), path.join(dataDir, "agents.json"));
  start("node", [path.join(ROOT, "src/server.mjs")], { PORT: String(WEB_PORT), DATA_DIR: dataDir, RPC_URLS: RPC, SPLITTER_FACTORY: factoryAddr, MARKET_INTERVAL_MS: "3000", ADMIN_TOKEN: "e2e" }, "web");
  const cfg = await until(async () => (await fetch(WEB + "/api/config")).json(), 20_000, "server up");
  check(cfg.fees?.splitterFactory === factoryAddr && cfg.fees.creatorBps === 7143, "server runs fee model B", JSON.stringify(cfg.fees));

  // 4. browser with an injected wallet that forwards to the fork (anvil signs for the impersonated user)
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.evaluateOnNewDocument((RPC, ADDR) => {
    let id = 1; const ls = {};
    window.ethereum = {
      isMetaMask: true,
      on: (e, f) => { (ls[e] ||= []).push(f); }, removeListener() {},
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDR];
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params || [] }) });
        const j = await r.json();
        if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
        return j.result;
      },
    };
  }, RPC, user.a);

  await page.goto(WEB + "/app", { waitUntil: "networkidle0" });
  await page.click('[data-mode] [data-m="manual"]');
  await page.type('[data-create] [name="name"]', "Forkbot");
  await page.type('[data-create] [name="ticker"]', "FORKB");
  await page.type('[data-create] [name="description"]', "Watches fork tests and reports how the fee split behaves.");
  const file = await page.$('[data-create] input[type="file"]');
  await file.uploadFile(path.join(ROOT, "public/img/agents/nova-lens.webp"));
  await sleep(600);
  await page.click('[data-create] button[type="submit"]');
  await page.waitForSelector("[data-modal].on");
  await page.click('[data-review] button[type="submit"]');
  await page.waitForSelector("[data-drawer].on", { timeout: 10_000 });
  const agentId = await page.$eval("[data-drawer] [data-dr-page]", (a) => a.getAttribute("href").split("/").pop());
  check(/^[0-9a-f]{12}$/.test(agentId), "agent created (pending review)", agentId);

  await page.click("[data-dr-launch]");
  await page.waitForSelector(".lmodal.on");
  await page.click("[data-lm-go]"); // connect
  await until(() => page.$eval("[data-lm-go]", (b) => b.textContent.includes("Launch")), 10_000, "wallet connected");
  const TAX = +(process.env.TAX ?? 200);   // the optional extra creator tax, paid into the same splitter
  check(await page.$eval("[data-lm-taxf]", (e) => !e.hidden && [...e.querySelectorAll("option")].every((o) => +o.value <= 200)), "split model offers an extra creator tax up to 2%");
  await page.select('[data-lform] [name="tax"]', String(TAX));
  check((await page.$eval("[data-lm-splittxt]", (e) => e.textContent)).includes("0.5% of volume to you"), "modal shows 0.5% / 0.2% split");
  await page.$eval('[data-lform] [name="buy"]', (i) => { i.value = "0.01"; i.dispatchEvent(new Event("input")); });
  await page.click("[data-lm-go]");
  await until(() => page.$eval("[data-lm-done]", (e) => !e.hidden), 120_000, "launch done").catch(async (e) => {
    console.log("modal error:", await page.$eval("[data-lm-err]", (x) => x.textContent), "| step:", await page.$eval("[data-lm-steps] li.on", (x) => x.textContent).catch(() => "none"));
    await page.screenshot({ path: path.join(ROOT, "_gen/e2e-fork-stuck.png") }); throw e;
  });
  const a1 = (await (await fetch(`${WEB}/api/agents/${agentId}?mine=${agentId}`)).json()).agent;
  check(!!a1.launch?.ca, "coin launched and linked to the agent", a1.launch?.ca);
  check(!!a1.launch?.splitter && a1.launch.feeRecipient === a1.launch.splitter, "Pons fee recipient = the agent's splitter", a1.launch?.splitter);
  check(a1.launch.creatorBps === 7143 && a1.wallet === user.a.toLowerCase(), "splitter pays the launching wallet 71.43%");
  const pub = (await (await fetch(`${WEB}/api/agents`)).json()).agents.some((x) => x.id === agentId);
  check(pub, "launched agent is public without review");
  const token = new ethers.Contract(a1.launch.ca, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], rpc);
  check((await token.balanceOf(user.a)) > 0n, "first buy landed in the creator's wallet");

  // 5. traders
  await rpc.send("evm_increaseTime", [30]); await rpc.send("evm_mine", []);
  let volume = ethers.parseEther("0.01"); // the creator's first buy
  for (let i = 0; i < 3; i++) {
    const t = await acct("trader" + i);
    const curve = new ethers.Contract(a1.launch.curve, ["function buy(uint256,uint256,address) payable returns (uint256)", "function sell(uint256,uint256,address) returns (uint256)",
      "event CurveSell(address indexed seller,address indexed recipient,uint256 tokensIn,uint256 quoteOut,uint256 fee,uint256 tax)"], t.s);
    await (await curve.buy(ethers.parseEther("0.5"), 0, t.a, { value: ethers.parseEther("0.5") })).wait();
    volume += ethers.parseEther("0.5");
    const bal = await token.balanceOf(t.a);
    await (await token.connect(t.s).approve(a1.launch.curve, bal)).wait();
    const rc = await (await curve.sell(bal / 2n, 0, t.a)).wait();
    const sold = rc.logs.map((l) => { try { return curve.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "CurveSell");
    volume += sold.args.quoteOut + sold.args.fee; // gross sell value
  }
  const waiting = await until(async () => {
    const a = (await (await fetch(`${WEB}/api/agents/${agentId}?mine=${agentId}`)).json()).agent;
    return a.market?.feesWaitingEth > 0.005 ? a.market : null; // the traders' fees, not just the first buy
  }, 30_000, "fees indexed");
  check(waiting.feesWaitingEth > 0, "server sees fees waiting", waiting.feesWaitingEth.toFixed(6) + " ETH · MC $" + Math.round(waiting.mcUsd));

  // 6. collect from the agent page
  const tBefore = await rpc.getBalance(treasury), fromBlock = await rpc.getBlockNumber();
  await page.goto(`${WEB}/agent/${agentId}`, { waitUntil: "networkidle0" });
  check(await page.$eval("[data-ap-fees]", (e) => !e.hidden), "agent page shows the fee panel");
  await page.click("[data-ap-collect]");
  const splitter = new ethers.Contract(a1.launch.splitter, ["event Distributed(address indexed asset, uint256 total, uint256 toCreator, uint256 toTreasury)"], rpc);
  const ev = await until(async () => (await splitter.queryFilter(splitter.filters.Distributed(), fromBlock))[0], 30_000, "Distributed event")
    .catch(async (e) => { console.log("toast:", await page.$eval(".toast", (t) => t.textContent)); throw e; });
  await sleep(800);
  check((await page.$eval(".toast", (t) => t.textContent)).startsWith("Split"), "UI confirms the split", await page.$eval(".toast", (t) => t.textContent));
  const { total, toCreator, toTreasury } = ev.args;
  check(toCreator === (total * 7143n) / 10_000n, "creator got exactly 71.43%", ethers.formatEther(toCreator) + " ETH");
  check((await rpc.getBalance(treasury)) - tBefore === toTreasury, "treasury got the rest", ethers.formatEther(toTreasury) + " ETH");
  const ppm = Number((total * 1_000_000n) / volume);
  const want = 7000 + TAX * 100;   // ppm: Pons' 0.7% creator fee + the extra tax
  check(ppm > want * 0.94 && ppm < want * 1.06, `collected ≈ ${want / 10_000}% of volume (0.7% fee + ${TAX / 100}% tax)`, `${ppm / 10_000}% · creator ${(Number(toCreator * 1_000_000n / volume) / 10_000)}% · ORVYN ${(Number(toTreasury * 1_000_000n / volume) / 10_000)}%`);
  check(errs.length === 0, "no page errors", errs.join(" | "));
  await page.screenshot({ path: path.join(ROOT, "_gen/e2e-fork-agent.png") });
  await browser.close();
} catch (e) {
  bad++; console.log("✗ crashed:", e.message);
} finally {
  console.log(`\n${ok} passed, ${bad} failed`);
  cleanup();
  process.exit(bad ? 1 : 0);
}
