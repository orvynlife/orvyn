import puppeteer from "puppeteer-core";
const [, , m, out, views = "0,0.8,3.14"] = process.argv;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); await p.setViewport({ width: 520, height: 700 });
p.on("pageerror", (e) => console.log("pageerror", e.message)); p.on("console", (m) => console.log("console", m.text().slice(0, 200)));
let i = 0;
for (const ry of views.split(",")) {
  await p.goto(`http://localhost:9170/_lab/model.html?m=${m}&ry=${ry}`, { waitUntil: "load" });
  await p.waitForFunction("window.done", { timeout: 120000 });
  await p.screenshot({ path: out.replace(".png", `-${i++}.png`) });
}
await b.close();
