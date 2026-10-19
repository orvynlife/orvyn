// Two frames 1.5 s apart, cropped on the head, plus the clip track names.
import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:9170/", { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 7500));
for (const i of [0, 1]) { await p.screenshot({ path: `_gen/head-${i}.png`, clip: { x: 420, y: 120, width: 600, height: 680 } }); await new Promise((r) => setTimeout(r, 900)); }
await b.close();
