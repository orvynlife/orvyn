// node tools/meshy-3d.mjs <image.png> [out.glb] [texture prompt] → image-to-3d (meshy-6, textured, a-pose)
import fs from "node:fs";
const key = fs.readFileSync(process.env.HOME + "/.config/meshy/.env", "utf8").match(/MESHY_API_KEY=(\S+)/)[1];
const H = { Authorization: "Bearer " + key, "Content-Type": "application/json" };
const img = "data:image/png;base64," + fs.readFileSync(process.argv[2]).toString("base64");
const base = "https://api.meshy.ai/openapi/v1/image-to-3d";
const r = await (await fetch(base, { method: "POST", headers: H, body: JSON.stringify({
  image_url: img, ai_model: "meshy-6", should_texture: true, enable_pbr: true, ...(process.env.NOPOSE ? {} : { pose_mode: "a-pose" }),
  should_remesh: true, target_polycount: 60000, target_formats: ["glb"],
  texture_prompt: process.argv[4] || "glossy porcelain white armor, matte graphite joints, polished chrome trims, glowing amber chest core" }) })).json();
console.log("task", JSON.stringify(r));
if (!r.result) process.exit(1);
for (;;) {
  await new Promise((s) => setTimeout(s, 8000));
  const t = await (await fetch(base + "/" + r.result, { headers: H })).json();
  process.stdout.write(t.status + " " + t.progress + "\n");
  if (t.status === "SUCCEEDED") { fs.writeFileSync(process.argv[3] || "_gen/morbix.glb", Buffer.from(await (await fetch(t.model_urls.glb)).arrayBuffer())); console.log("saved", process.argv[3] || "_gen/morbix.glb", r.result); break; }
  if (t.status === "FAILED" || t.status === "CANCELED") { console.log(JSON.stringify(t.task_error)); break; }
}
