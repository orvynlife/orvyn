// Screenshot a page: node tools/shot.mjs <url> <out.png> [width] [height] [fullPage 0|1] [dark 0|1]
import puppeteer from "puppeteer-core";
const [,, url, out, w = "1440", h = "900", full = "0", dark = "1"] = process.argv;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--no-first-run"] });
const p = await b.newPage();
if (process.env.NOJS) await p.setJavaScriptEnabled(false);
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 });
if (dark === "1") await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
await p.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch(e => console.log("goto", e.message));
await new Promise(r => setTimeout(r, 1500));
await p.screenshot({ path: out, fullPage: full === "1" });
await b.close();
