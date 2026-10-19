// Pull the newest Pons launch and run it through readLaunch + readCurve.
import { readLaunch, readCurve, getEthUsd, FACTORY } from "../src/chain.mjs";
const RPC = process.env.TEST_RPC || "https://rpc.mainnet.chain.robinhood.com";
const rpc = async (method, params) => { const j = await (await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json", "Accept-Encoding": "identity" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json(); if (j.error) console.log(method, j.error.message); return j.result; };
const head = parseInt(await rpc("eth_blockNumber", []), 16);
const logs = await rpc("eth_getLogs", [{ address: FACTORY, fromBlock: "0x" + (head - 3000).toString(16), toBlock: "latest", topics: ["0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607"] }]);
console.log("launches in last 3k blocks:", logs?.length);
const tx = logs.at(-1).transactionHash;
const l = await readLaunch(tx);
console.log("readLaunch", { ...l, description: l.description.slice(0, 80) });
const c = await readCurve(l.curve), usd = await getEthUsd();
console.log("readCurve", c, "ethUsd", usd, "mcUsd", Math.round(c.priceEth * 1e9 * usd));
