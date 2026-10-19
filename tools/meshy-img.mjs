// node tools/meshy-img.mjs jobs.json  → each job {id, model, aspect, prompt, out}
import fs from "node:fs";
const key = fs.readFileSync(process.env.HOME + "/.config/meshy/.env", "utf8").match(/MESHY_API_KEY=(\S+)/)[1];
const H = { Authorization: "Bearer " + key, "Content-Type": "application/json" };
const jobs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const api = "https://api.meshy.ai/openapi/v1/text-to-image";
await Promise.all(jobs.map(async (j) => {
  const r = await fetch(api, { method: "POST", headers: H, body: JSON.stringify({ ai_model: j.model, prompt: j.prompt, aspect_ratio: j.aspect }) });
  const { result, message } = await r.json();
  if (!result) return console.log(j.id, "SUBMIT FAIL", message);
  for (let i = 0; i < 90; i++) {
    await new Promise((s) => setTimeout(s, 4000));
    const t = await (await fetch(api + "/" + result, { headers: H })).json();
    if (t.status === "SUCCEEDED") {
      const urls = t.image_urls || [];
      for (let k = 0; k < urls.length; k++) {
        const buf = Buffer.from(await (await fetch(urls[k])).arrayBuffer());
        fs.writeFileSync(urls.length > 1 ? j.out.replace(/(\.\w+)$/, `-${k}$1`) : j.out, buf);
      }
      return console.log(j.id, "OK", result);
    }
    if (t.status === "FAILED" || t.status === "CANCELED") return console.log(j.id, t.status, JSON.stringify(t.task_error || ""));
  }
  console.log(j.id, "TIMEOUT", result);
}));
