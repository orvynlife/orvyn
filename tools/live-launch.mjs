// LIVE test on orvyn.life with the ORVYN test wallet (real Robinhood Chain, real Pons, real AI):
// AI draft → AI face → save → launch (splitter + 0.001 ETH first buy) → chat → collect & split.
// node tools/live-launch.mjs   (key from ~/.config/orvyn/test-wallet.env, never printed)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SITE = process.env.SITE || "https://orvyn.life";
const RPC = "https://robinhood-rpc.publicnode.com";
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), ".config/orvyn/test-wallet.env"), "utf8").trim().split("\n").map((l) => l.split("=")));
const provider = new ethers.JsonRpcProvider(RPC, 4663, { staticNetwork: true });
const wallet = new ethers.Wallet(env.ORVYN_TEST_KEY, provider);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function until(fn, ms, label) {
  const t0 = Date.now();
  for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() - t0 > ms) throw new Error("timeout: " + label); await sleep(700); }
}

log("wallet", wallet.address, "balance", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on("pageerror", (e) => log("pageerror", e.message));
page.on("console", (m) => m.text().startsWith("RPC ERROR") && log(m.text()));
// signing happens here in Node; the page only sees a normal EIP-1193 wallet
await page.exposeFunction("__orvynSend", async (tx) => {
  const sent = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n });
  log("sent", sent.hash);
  return sent.hash;
});
await page.evaluateOnNewDocument((RPC, ADDR) => {
  let id = 1;
  window.ethereum = {
    isMetaMask: true, on() {}, removeListener() {},
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDR];
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_sendTransaction") return window.__orvynSend(params[0]);
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params || [] }) });
      const j = await r.json();
      if (j.error) { console.log("RPC ERROR", method, JSON.stringify(j.error).slice(0, 300)); const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
      return j.result;
    },
  };
}, RPC, wallet.address.toLowerCase());

let agentId = process.env.AGENT;
if (!agentId) {
// 1. Automatic mode → AI profile
await page.goto(SITE + "/app", { waitUntil: "networkidle0" });
await page.type("[data-prompt-input]", "A test agent that checks the ORVYN launch flow end to end and reports what it finds");
await page.keyboard.press("Enter");
await page.waitForSelector("[data-modal].on", { timeout: 60_000 });
const drafted = await page.evaluate(() => ({ name: document.querySelector("[data-review] [name=name]").value, desc: document.querySelector("[data-review] [name=description]").value }));
log("AI draft:", JSON.stringify(drafted));
// 2. AI face (Meshy)
await page.click("[data-rv-face]");
await until(() => page.$eval("[data-rv-img]", (i) => !!i.getAttribute("src")), 90_000, "AI face");
log("AI face:", await page.$eval("[data-rv-img]", (i) => i.getAttribute("src")));
// test coin gets an unmistakable name
await page.$eval("[data-review] [name=name]", (i) => { i.value = "ORVYN Test"; });
await page.$eval("[data-review] [name=ticker]", (i) => { i.value = "OTEST"; });
await page.click('[data-review] button[type="submit"]');
await page.waitForSelector("[data-drawer].on", { timeout: 20_000 });
agentId = await page.$eval("[data-drawer] [data-dr-page]", (a) => a.getAttribute("href").split("/").pop());
log("agent saved", agentId);
await page.keyboard.press("Escape");
}

// 3. launch with the splitter + first buy (from the agent page)
await page.evaluateOnNewDocument((id) => { try { const m = JSON.parse(localStorage.getItem("orvyn.mine") || "[]"); if (!m.includes(id)) localStorage.setItem("orvyn.mine", JSON.stringify([...m, id])); } catch {} }, agentId);
await page.goto(`${SITE}/agent/${agentId}`, { waitUntil: "networkidle0" });
const already = await page.$eval("[data-ap-launch]", (b) => b.hidden);
if (!already) {
await page.click("[data-ap-launch]");
await page.waitForSelector(".lmodal.on");
if ((await page.$eval("[data-lm-go]", (b) => b.textContent)).includes("Connect")) await page.click("[data-lm-go]");
await until(() => page.$eval("[data-lm-go]", (b) => b.textContent.includes("Launch") && !b.disabled), 15_000, "wallet connected");
await sleep(1500);
log("modal:", await page.$eval("[data-lm-splittxt]", (e) => e.textContent), "| fee", await page.$eval("[data-lm-fee]", (e) => e.textContent));
await page.$eval('[data-lform] [name="buy"]', (i) => { i.value = "0.001"; i.dispatchEvent(new Event("input")); });
await page.click("[data-lm-go]");
await until(() => page.$eval("[data-lm-done]", (e) => !e.hidden), 180_000, "launch").catch(async (e) => {
  log("modal error:", await page.$eval("[data-lm-err]", (x) => x.textContent)); throw e;
});
await page.screenshot({ path: path.join(ROOT, "_gen/live-launch-done.png") });
}
const agent = (await (await fetch(`${SITE}/api/agents/${agentId}?mine=${agentId}`)).json()).agent;
log("LAUNCHED", JSON.stringify(agent.launch));
fs.writeFileSync(path.join(ROOT, "_gen/live-test.json"), JSON.stringify({ agentId, launch: agent.launch }, null, 1));

// 4. chat with it
await page.goto(`${SITE}/agent/${agentId}`, { waitUntil: "networkidle0" });
await until(() => page.$("[data-ap-chat] input"), 15_000, "chat box");
await page.type("[data-ap-chat] input", "Hi! In one sentence, what do you do?");
await page.keyboard.press("Enter");
const reply = await until(() => page.$$eval(".chat-msg.assistant", (m) => m.map((x) => x.textContent).find((t) => t && t !== "…")), 60_000, "chat reply");
log("CHAT:", reply);

// 5. collect & split on the real chain
await sleep(70_000); // let the server index the first fees
await page.goto(`${SITE}/agent/${agentId}`, { waitUntil: "networkidle0" });
log("fees waiting:", await page.$eval("[data-ap-feeamt]", (e) => e.textContent));
await page.click("[data-ap-collect]");
await until(() => page.$eval(".toast", (t) => /Split|Nothing/.test(t.textContent)), 90_000, "collect");
log("COLLECT:", await page.$eval(".toast", (t) => t.textContent));
await page.screenshot({ path: path.join(ROOT, "_gen/live-agent-page.png") });
log("balance left", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");
await browser.close();
