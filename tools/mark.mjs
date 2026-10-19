import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); await p.setViewport({ width: 512, height: 512 });
p.on("pageerror", (e) => console.log(e.message));
await p.goto("http://localhost:9170/_lab/mark.html?t=" + (process.argv[2] || "7.3"), { waitUntil: "load" });
await p.waitForFunction("window.done", { timeout: 20000 });
await p.screenshot({ path: "public/brand/mark-512.png", omitBackground: true });
await b.close();
