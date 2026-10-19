import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  for (const a of doc.getRoot().listAnimations()) {
    for (const ch of a.listChannels()) {
      const n = ch.getTargetNode().getName(); if (!/^(Head|neck|Spine02)$/.test(n) || ch.getTargetPath() !== "rotation") continue;
      const t = ch.getSampler().getInput().getArray(), v = ch.getSampler().getOutput().getArray();
      // frame-to-frame angular change (deg) and its 2nd difference (jitter)
      const ang = []; for (let i = 1; i < t.length; i++) { let d = 0; for (let k = 0; k < 4; k++) d += v[i * 4 + k] * v[(i - 1) * 4 + k]; ang.push(2 * Math.acos(Math.min(1, Math.abs(d))) * 180 / Math.PI); }
      const jit = []; for (let i = 1; i < ang.length; i++) jit.push(Math.abs(ang[i] - ang[i - 1]));
      const avg = (x) => (x.reduce((s, y) => s + y, 0) / x.length).toFixed(3);
      console.log(f.split("/").pop(), a.getName(), n, "keys", t.length, "dt", (t[1] - t[0]).toFixed(4), "avgStep°", avg(ang), "maxStep°", Math.max(...ang).toFixed(2), "jitter°", avg(jit));
    }
  }
}
