// Render public/_lab/og.html → public/og.png (1200×630 social card)
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); await p.setViewport({ width: 1200, height: 630 });
p.on("pageerror", (e) => console.log(e.message));
await p.goto("http://localhost:9170/_lab/og.html", { waitUntil: "load" });
await p.waitForFunction("window.done", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 300));
await p.screenshot({ path: "public/og.png" });
await b.close();
