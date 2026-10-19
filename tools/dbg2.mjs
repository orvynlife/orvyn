import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto("http://localhost:9170/", { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 7000));
for (let i = 0; i < 4; i++) {
  await p.evaluate((i) => { const h = window.__objs.head; h.children.forEach((c, k) => (c.visible = k === i)); }, i);
  await new Promise((r) => setTimeout(r, 400));
  await p.screenshot({ path: `_gen/dbg-c${i}.png`, clip: { x: 620, y: 160, width: 200, height: 160 } });
}
console.log(await p.evaluate(() => window.__objs.head.children.map((c) => c.type + ":" + (c.material?.type || "") + ":" + (c.material?.side ?? ""))));
await b.close();
