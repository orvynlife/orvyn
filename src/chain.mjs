// Robinhood Chain reads: verify a Pons launch from its receipt, and poll each launched
// agent's bonding curve (price, market cap, progress). Plain JSON-RPC, no dependencies.
//
// Pons v2 (read live 19 Oct 2026): factory 0x7eD5…EC7e emits
//   TokenLaunched(address indexed token, address indexed curve, address indexed deployer,
//                 address pairToken, uint256 launchConfigId, uint256 graduationThreshold)
// Progress = (quoteReserve − phantomQuote) / graduationThreshold, supply 1B (config 0).

export const FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";
const TOPIC_LAUNCHED = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";
const SEL = {
  name: "0x06fdde03", symbol: "0x95d89b41", description: "0x7284e416",
  launchFee: "0xcf3cf573", getReserves: "0x0902f1ac", graduated: "0xe7c2b772", phantomQuote: "0xc57eadfc", graduationThreshold: "0x8b0bc501",
};
const SUPPLY = 1_000_000_000;
const ESCROW = "0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e";
const SEL2 = {
  getLaunchedToken: "0x3cf28b5a", isSplitter: "0xa4c597d1", creatorBps: "0xde90e29b", creator: "0x02d05d3f",
  balanceOf: "0x70a08231", quoteFeeBalance: "0xed479c47", protocolFeeShareBps: "0x9040f866",
};
// Fee model B: every agent coin pays its creator fee to an OrvynFeeSplitter from this factory.
export const SPLITTER_FACTORY = (process.env.SPLITTER_FACTORY || "").toLowerCase();
const pad = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

// The official endpoint answers from Hetzner; the mirrors are the fallback.
// (Its Cloudflare 403s compressed POSTs, so no Accept-Encoding is sent.)
const RPCS = (process.env.RPC_URLS || "https://rpc.mainnet.chain.robinhood.com,https://robinhood-rpc.publicnode.com,https://robinhood.drpc.org").split(",");

let rpcId = 1;
async function rpc(method, params) {
  let last;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept-Encoding": "identity" },
        body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }), signal: AbortSignal.timeout(12_000),
      });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error("rpc unreachable");
}

const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
const word = (hex, i) => BigInt("0x" + (hex.slice(2 + i * 64, 2 + (i + 1) * 64) || "0"));
const addr = (topic) => "0x" + topic.slice(-40).toLowerCase();
function decodeString(hex) {
  if (!hex || hex === "0x") return "";
  const off = Number(word(hex, 0)) * 2, len = Number(BigInt("0x" + hex.slice(2 + off, 2 + off + 64)));
  return Buffer.from(hex.slice(2 + off + 64, 2 + off + 64 + len * 2), "hex").toString("utf8");
}

/** Reads a launch receipt and returns the token it created, or throws a readable reason. */
export async function readLaunch(txHash) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash || "")) throw new Error("That is not a transaction hash.");
  const rc = await rpc("eth_getTransactionReceipt", [txHash]);
  if (!rc) throw new Error("Transaction not found yet. Wait a few seconds and try again.");
  if (rc.status !== "0x1") throw new Error("That transaction failed on chain.");
  const log = rc.logs.find((l) => l.address.toLowerCase() === FACTORY && l.topics[0] === TOPIC_LAUNCHED);
  if (!log) throw new Error("No Pons launch in that transaction.");
  const token = addr(log.topics[1]), curve = addr(log.topics[2]), deployer = addr(log.topics[3]);
  const [n, s, d, info] = await Promise.all([
    call(token, SEL.name), call(token, SEL.symbol), call(token, SEL.description), call(FACTORY, SEL2.getLaunchedToken + pad(token)),
  ]);
  const feeRecipient = "0x" + info.slice(2 + 3 * 64 + 24, 2 + 4 * 64);
  const out = { token, curve, deployer, feeRecipient, block: parseInt(rc.blockNumber, 16), name: decodeString(n), symbol: decodeString(s), description: decodeString(d) };
  if (SPLITTER_FACTORY) {
    const [isS, bps, who] = await Promise.all([
      call(SPLITTER_FACTORY, SEL2.isSplitter + pad(feeRecipient)), call(feeRecipient, SEL2.creatorBps).catch(() => "0x"), call(feeRecipient, SEL2.creator).catch(() => "0x"),
    ]);
    if (word(isS, 0) !== 1n) throw new Error("This coin does not pay its fees through an ORVYN splitter.");
    out.splitter = feeRecipient; out.creatorBps = Number(word(bps, 0)); out.splitCreator = "0x" + who.slice(-40);
  }
  return out;
}

/** Curve state → price in ETH per token, progress 0..1, graduated flag. */
export async function readCurve(curve) {
  const [res, grad, phantom, threshold] = await Promise.all([
    call(curve, SEL.getReserves), call(curve, SEL.graduated), call(curve, SEL.phantomQuote), call(curve, SEL.graduationThreshold),
  ]);
  const quote = word(res, 0), tokens = word(res, 1);
  const priceEth = tokens > 0n ? Number(quote) / Number(tokens) : 0;
  const progress = Math.max(0, Math.min(1, Number(quote - word(phantom, 0)) / Number(word(threshold, 0) || 1n)));
  return { priceEth, progress, graduated: word(grad, 0) === 1n };
}

let fee = { wei: 0n, at: 0 };
/** Pons launch fee in ETH (cached 10 min). */
export async function getLaunchFee() {
  if (Date.now() - fee.at > 10 * 60_000) {
    try { fee = { wei: word(await call(FACTORY, SEL.launchFee), 0), at: Date.now() }; } catch { /* keep last */ }
  }
  return fee.wei ? Number(fee.wei) / 1e18 : null;
}

let ethUsd = { value: 0, at: 0 };
export async function getEthUsd() {
  if (Date.now() - ethUsd.at < 5 * 60_000 && ethUsd.value) return ethUsd.value;
  try {
    const j = await (await fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=ETHUSDT", { signal: AbortSignal.timeout(8000) })).json();
    const v = Number(j.price); if (v > 0) ethUsd = { value: v, at: Date.now() };
  } catch { /* keep the last good value */ }
  return ethUsd.value;
}

// After graduation the curve is frozen; the market lives in the Uniswap pool, which DexScreener indexes.
async function dexMarket(ca) {
  try {
    const j = await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, { signal: AbortSignal.timeout(8000) })).json();
    const p = (j.pairs || []).filter((x) => x.chainId === "robinhood").sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    return p ? { mcUsd: p.marketCap || p.fdv || 0, volume24h: p.volume?.h24 || 0 } : null;
  } catch { return null; }
}

/** Creator fees the splitter can collect now: its escrow balance + the creator part still on the curve. */
async function feesWaiting(splitter, curve) {
  const esc = word(await call(ESCROW, SEL2.balanceOf + pad(splitter)), 0);
  let onCurve = 0n;
  if (curve) {
    const [q, share] = await Promise.all([call(curve, SEL2.quoteFeeBalance), call(curve, SEL2.protocolFeeShareBps)]);
    onCurve = (word(q, 0) * (10_000n - word(share, 0))) / 10_000n;
  }
  return Number(esc + onCurve) / 1e18;
}

/** Refreshes market data for every launched agent; runs on an interval from the server. */
export async function refreshMarkets(store) {
  const usd = await getEthUsd();
  for (const a of store.all()) {
    if (!a.launch?.curve || a.status === "hidden") continue;
    try {
      const c = await readCurve(a.launch.curve);
      const m = { priceEth: c.priceEth, progress: c.progress, graduated: c.graduated, mcUsd: usd ? c.priceEth * SUPPLY * usd : 0, updatedAt: new Date().toISOString() };
      if (a.launch.splitter) m.feesWaitingEth = await feesWaiting(a.launch.splitter, c.graduated ? null : a.launch.curve).catch(() => a.market?.feesWaitingEth || 0);
      if (c.graduated) { const d = await dexMarket(a.launch.ca); if (d) Object.assign(m, d, { progress: 1 }); }
      store.update(a.id, { market: m });
    } catch { /* one bad read must not stop the rest */ }
  }
}
