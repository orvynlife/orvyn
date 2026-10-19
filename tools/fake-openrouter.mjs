// Stand-in for OpenRouter's /chat/completions: echoes a valid profile for json_schema requests,
// a short reply otherwise, and reports a cost so the daily USD cap can be exercised.
import http from "node:http";
const COST = +process.env.FAKE_COST || 0.0004;
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const j = JSON.parse(b || "{}");
    const auth = req.headers.authorization === "Bearer test-or-key";
    if (!auth) { res.writeHead(401); return res.end(JSON.stringify({ error: { message: "bad key" } })); }
    const content = j.response_format?.type === "json_schema"
      ? JSON.stringify({ name: "Owl Ledger", ticker: "OWL", category: "utility", description: "Reads every governance vote overnight and posts a short summary at sunrise.", skills: ["Vote reading", "Summaries", "Alerts"], persona: "Calm and precise. Speaks like a night librarian.", look: "a small owl made of folded ledger paper holding a lantern" })
      : `(${j.model}) Hi! I'm ${j.messages[0].content.match(/You are (.+?) \(/)?.[1] || "an agent"}. You said: ${j.messages.at(-1).content}`;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content } }], usage: { prompt_tokens: 300, completion_tokens: 120, cost: COST } }));
  });
}).listen(+process.env.PORT || 9181, () => console.log("fake openrouter up"));
