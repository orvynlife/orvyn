import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:9170/", { waitUntil: "load" }); await new Promise((r) => setTimeout(r, 7000));
console.log(await p.evaluate(() => {
  const { head, model, THREE } = window.__objs;
  const wp = head.getWorldPosition(new THREE.Vector3()), ws = head.getWorldScale(new THREE.Vector3());
  let mat; model.traverse((o) => { if (o.isMesh) mat = o.material; });
  return JSON.stringify({ headWorld: wp.toArray(), headScale: ws.toArray(), parent: head.parent?.name, matType: mat.type, hasOBC: !!mat.onBeforeCompile, ver: mat.version });
}));
await p.evaluate(() => { window.__objs.head.visible = false; });
await new Promise((r) => setTimeout(r, 600));
await p.screenshot({ path: "_gen/dbg-nohead.png", clip: { x: 520, y: 120, width: 400, height: 300 } });
await b.close();
