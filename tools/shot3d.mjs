// node tools/shot3d.mjs <url> <out.png> [w] [h] [waitMs] [dpr] [fullPage]
import puppeteer from "puppeteer-core";
const [, , url, out, w = "1440", h = "900", waitMs = "6000", dpr = "1", full = "0"] = process.argv;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true,
  args: ["--no-first-run", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage();
p.on("console", (m) => { if (/error|warn/i.test(m.type())) console.log("console", m.type(), m.text().slice(0, 300)); });
p.on("pageerror", (e) => console.log("pageerror", e.message));
p.on("requestfailed", (r) => console.log("failed", r.url()));
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr });
await p.goto(url, { waitUntil: "load", timeout: 60000 });
if (process.env.MOVE) await p.mouse.move(+w * 0.75, +h * 0.3);
await new Promise((r) => setTimeout(r, +waitMs));
await p.screenshot({ path: out, fullPage: full === "1" });
await b.close();
