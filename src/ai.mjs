// AI features, all switched off until the owner adds keys to .env and approves the spend.
//
//   OPENROUTER_API_KEY  profile drafting (Automatic mode) + agent chat through OpenRouter (the owner's choice)
//   ANTHROPIC_API_KEY   same features straight through the Anthropic SDK, used only without an OpenRouter key
//   AI_MODEL            OpenRouter default anthropic/claude-haiku-5.5; Anthropic default claude-opus-5-5
//   AI_USD_DAILY        hard stop on OpenRouter spend per UTC day (default $2), from the cost OpenRouter reports
//   MESHY_API_KEY       agent faces (nano-banana text-to-image, ~3 credits each)
//   AI_DRAFT_DAILY / AI_CHAT_DAILY / AI_FACE_DAILY   global caps per UTC day
//
// Daily counters live in data/ai-usage.json so a restart does not reset the budget.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const OR_KEY = process.env.OPENROUTER_API_KEY || "";
const PROVIDER = OR_KEY ? "openrouter" : process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
const MODEL = process.env.AI_MODEL || (PROVIDER === "openrouter" ? "anthropic/claude-haiku-5.5" : "claude-opus-5-5");
const USD_DAILY = +process.env.AI_USD_DAILY || 2;
// Server-side refusal fallback: "default" form, Claude API only, for the models that accept it.
const FALLBACK = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/.test(MODEL);
const client = PROVIDER === "anthropic" ? new Anthropic() : null;
const MESHY = process.env.MESHY_API_KEY || "";

const CAPS = {
  draft: +process.env.AI_DRAFT_DAILY || 200,
  chat: +process.env.AI_CHAT_DAILY || 1500,
  face: +process.env.AI_FACE_DAILY || 30,
};
const PER_IP = { draft: 12, chat: 60, face: 3 };

export const aiEnabled = () => ({ draft: !!PROVIDER, chat: !!PROVIDER, face: !!MESHY });

export class AiError extends Error { constructor(msg, status = 503) { super(msg); this.status = status; } }

let usageFile, usage = { day: "", total: {}, ip: {} };
export function initAi(dataDir) {
  usageFile = path.join(dataDir, "ai-usage.json");
  try { usage = JSON.parse(fs.readFileSync(usageFile, "utf8")); } catch { /* fresh */ }
}
function spend(kind, ip) {
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) usage = { day, total: {}, ip: {} };
  const key = kind + ":" + ip;
  if ((usage.total[kind] || 0) >= CAPS[kind] || (usage.usd || 0) >= USD_DAILY) throw new AiError("The daily AI budget is used up. Try again tomorrow.", 429);
  if ((usage.ip[key] || 0) >= PER_IP[kind]) throw new AiError("You have reached today's limit for this feature.", 429);
  usage.total[kind] = (usage.total[kind] || 0) + 1;
  usage.ip[key] = (usage.ip[key] || 0) + 1;
  fs.writeFile(usageFile, JSON.stringify(usage), () => {});
}

// ---------- OpenRouter (chat completions, OpenAI-compatible) ----------
async function openrouter({ system, messages, maxTokens, schema }) {
  const body = {
    model: MODEL, max_tokens: maxTokens, usage: { include: true },
    messages: [{ role: "system", content: system }, ...messages],
  };
  if (schema) body.response_format = { type: "json_schema", json_schema: { name: "agent_profile", strict: true, schema } };
  let r;
  try {
    r = await fetch((process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1") + "/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(60_000),
      headers: { Authorization: "Bearer " + OR_KEY, "Content-Type": "application/json", "HTTP-Referer": "https://orvyn.life", "X-Title": "ORVYN" },
      body: JSON.stringify(body),
    });
  } catch { throw new AiError("AI is temporarily unavailable.", 502); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("openrouter", r.status, j.error?.message);
    if (r.status === 429) throw new AiError("The AI is busy right now. Try again in a minute.", 429);
    if (r.status === 402) throw new AiError("AI credits are used up for now.", 503);
    throw new AiError("AI is temporarily unavailable.", 502);
  }
  const cost = +j.usage?.cost || 0;
  if (cost) { usage.usd = (usage.usd || 0) + cost; fs.writeFile(usageFile, JSON.stringify(usage), () => {}); }
  const c = j.choices?.[0];
  if (c?.finish_reason === "content_filter" || c?.message?.refusal) throw new AiError("The agent declined that request.", 422);
  return (c?.message?.content || "").trim();
}

async function ask(params, parse = false) {
  try {
    const p = FALLBACK ? { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : params;
    const api = FALLBACK ? client.beta.messages : client.messages;
    const res = parse ? await api.parse(p) : await api.create(p);
    if (res.stop_reason === "refusal") throw new AiError("The agent declined that request.", 422);
    return res;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new AiError("The AI is busy right now. Try again in a minute.", 429);
    if (e instanceof Anthropic.AuthenticationError) { console.error("anthropic auth:", e.message); throw new AiError("AI is temporarily unavailable.", 503); }
    if (e instanceof Anthropic.APIError) { console.error("anthropic", e.status, e.message); throw new AiError("AI is temporarily unavailable.", 502); }
    throw e;
  }
}

// ---------- 1. one sentence → agent profile ----------
const Profile = z.object({
  name: z.string(),
  ticker: z.string(),
  category: z.enum(["utility", "companion", "meme", "community", "creator"]),
  description: z.string(),
  skills: z.array(z.string()),
  persona: z.string(),
  look: z.string(),
});

const DRAFT_SYSTEM = `You design AI agents for ORVYN, a launchpad where each agent gets a coin on Robinhood Chain.
From the user's one-sentence idea, write the agent's profile:
- name: short, memorable, 1-2 words, no emoji, max 24 characters
- ticker: 3-6 uppercase letters or digits, derived from the name
- category: the closest of utility, companion, meme, community, creator
- description: one or two plain sentences on what the agent does, max 220 characters, no hype words, no price talk
- skills: 2-4 short skill labels (2-3 words each)
- persona: two sentences on its voice and personality
- look: one sentence describing a single striking character or object to illustrate it (no text, no logos, no real people)
Write in English even if the idea is in another language.`;

export async function draftProfile(idea, ip) {
  if (!PROVIDER) throw new AiError("AI drafting is not switched on yet.");
  spend("draft", ip);
  let p;
  if (PROVIDER === "openrouter") {
    const { description, ...schema } = zodOutputFormat(Profile).schema;
    const text = await openrouter({ system: DRAFT_SYSTEM, messages: [{ role: "user", content: idea.slice(0, 600) }], maxTokens: 1500, schema });
    try { p = Profile.parse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""))); } catch { throw new AiError("The AI returned something unusable. Try rephrasing.", 502); }
    return shapeProfile(p);
  }
  const res = await ask({
    model: MODEL, max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Profile) },
    system: DRAFT_SYSTEM,
    messages: [{ role: "user", content: idea.slice(0, 600) }],
  }, true);
  p = res.parsed_output;
  if (!p) throw new AiError("The AI returned something unusable. Try rephrasing.", 502);
  return shapeProfile(p);
}

function shapeProfile(p) {
  return {
    name: p.name.slice(0, 32), ticker: p.ticker.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
    category: p.category, description: p.description.slice(0, 600),
    skills: p.skills.slice(0, 4).map((s) => s.slice(0, 32)), persona: p.persona.slice(0, 400), look: p.look.slice(0, 300),
  };
}

// ---------- 2. chat in character ----------
export async function chat(agent, history, ip) {
  if (!PROVIDER) throw new AiError("Chat is not switched on yet.");
  spend("chat", ip);
  const messages = history.slice(-12)
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages.at(-1).role !== "user") throw new AiError("Send a message first.", 400);
  const system = `You are ${agent.name} ($${agent.ticker}), an AI agent listed on ORVYN (orvyn.life).
What you do: ${agent.description}
${agent.persona ? "Your personality: " + agent.persona : ""}
${agent.skills?.length ? "Your skills: " + agent.skills.join(", ") + "." : ""}
Stay in character. Keep replies under 120 words. Right now you can only talk: do not claim to have run tasks, posted, traded or browsed.
Never give financial advice or price predictions about any coin, including your own.`;
  if (PROVIDER === "openrouter") return openrouter({ system, messages, maxTokens: 600 });
  const res = await ask({ model: MODEL, max_tokens: 2000, output_config: { effort: "low" }, system, messages });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

// ---------- 3. a face for the agent (Meshy nano-banana) ----------
export async function makeFace(look, ip, outDir) {
  if (!MESHY) throw new AiError("Face generation is not switched on yet.");
  spend("face", ip);
  const H = { Authorization: "Bearer " + MESHY, "Content-Type": "application/json" };
  const api = "https://api.meshy.ai/openapi/v1/text-to-image";
  const prompt = `Bold collectible-card illustration, single centered subject: ${look.slice(0, 300)}. Rich saturated background, soft studio light, high detail stylized 3D render, no text, no letters, no frame.`;
  const r = await (await fetch(api, { method: "POST", headers: H, body: JSON.stringify({ ai_model: "nano-banana", prompt, aspect_ratio: "3:4" }) })).json();
  if (!r.result) throw new AiError("Face generation failed to start.", 502);
  for (let i = 0; i < 25; i++) {
    await new Promise((s) => setTimeout(s, 3000));
    const t = await (await fetch(`${api}/${r.result}`, { headers: H })).json();
    if (t.status === "SUCCEEDED" && t.image_urls?.[0]) {
      const buf = Buffer.from(await (await fetch(t.image_urls[0])).arrayBuffer());
      const ext = buf[0] === 0x89 ? "png" : "jpg";
      const file = `face-${r.result.slice(-12)}.${ext}`;
      fs.writeFileSync(path.join(outDir, file), buf);
      return "/uploads/" + file;
    }
    if (t.status === "FAILED" || t.status === "CANCELED") throw new AiError("Face generation failed. Try a different description.", 502);
  }
  throw new AiError("Face generation took too long.", 504);
}
