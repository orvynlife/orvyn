// node tools/meshy-rig.mjs <image-to-3d task id> <actionId,...>  → rig + animations into _gen/
import fs from "node:fs";
const key = fs.readFileSync(process.env.HOME + "/.config/meshy/.env", "utf8").match(/MESHY_API_KEY=(\S+)/)[1];
const H = { Authorization: "Bearer " + key, "Content-Type": "application/json" };
const B = "https://api.meshy.ai/openapi/v1";
const wait = async (path, id) => { for (;;) { await new Promise((s) => setTimeout(s, 6000)); const t = await (await fetch(`${B}/${path}/${id}`, { headers: H })).json(); console.log(path, t.status, t.progress); if (t.status === "SUCCEEDED") return t; if (/FAILED|CANCELED/.test(t.status)) throw new Error(JSON.stringify(t.task_error)); } };
const [, , input, actions = ""] = process.argv;
const r = await (await fetch(`${B}/rigging`, { method: "POST", headers: H, body: JSON.stringify({ input_task_id: input, height_meters: 1.8 }) })).json();
console.log("rig", JSON.stringify(r)); if (!r.result) process.exit(1);
const rig = await wait("rigging", r.result);
fs.writeFileSync("_gen/rig.json", JSON.stringify(rig, null, 1));
const glb = rig.result?.rigged_character_glb_url; if (glb) fs.writeFileSync("_gen/morbix-rigged.glb", Buffer.from(await (await fetch(glb)).arrayBuffer()));
await Promise.all(actions.split(",").filter(Boolean).map(async (a) => {
  const q = await (await fetch(`${B}/animations`, { method: "POST", headers: H, body: JSON.stringify({ rig_task_id: r.result, action_id: +a }) })).json();
  console.log("anim", a, JSON.stringify(q)); if (!q.result) return;
  const t = await wait("animations", q.result);
  fs.writeFileSync(`_gen/anim-${a}.json`, JSON.stringify(t, null, 1));
  const u = t.result?.animation_glb_url; if (u) fs.writeFileSync(`_gen/anim-${a}.glb`, Buffer.from(await (await fetch(u)).arrayBuffer()));
}));
console.log("DONE");
