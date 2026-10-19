// Merge Meshy animation GLBs into one model, shrink textures, meshopt-compress.
// node tools/glb/build-glb.mjs <base.glb> <extra-anim.glb...> <out.glb>
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, textureCompress, meshopt, weld, quantize } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
const args = process.argv.slice(2), out = args.pop(), [basePath, ...extras] = args;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(basePath);
const root = doc.getRoot();
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const rename = (a) => a.setName(a.getName().replace(/^Armature\|/, "").replace(/\|baselayer$/, ""));
root.listAnimations().forEach(rename);
for (const p of extras) {
  const src = (await io.read(p)).getRoot();
  for (const a of src.listAnimations()) {
    const na = doc.createAnimation(a.getName()); rename(na);
    for (const ch of a.listChannels()) {
      const target = byName.get(ch.getTargetNode()?.getName()); if (!target) continue;
      const s = ch.getSampler();
      const inp = doc.createAccessor().setArray(s.getInput().getArray().slice()).setType(s.getInput().getType());
      const outp = doc.createAccessor().setArray(s.getOutput().getArray().slice()).setType(s.getOutput().getType());
      const ns = doc.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
      na.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(ns));
    }
  }
}
const buf = root.listBuffers()[0]; root.listAccessors().forEach((a) => a.setBuffer(buf)); root.listBuffers().slice(1).forEach((b) => b.dispose());
// no resample()/meshopt: both quantise animation keys and make the head jitter
await doc.transform(
  dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
  weld(), ...(process.env.NOQ ? [] : [quantize()]),
);
console.log("animations:", root.listAnimations().map((a) => a.getName()));
await io.write(out, doc);
