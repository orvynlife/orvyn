// ORVYN — static site + JSON API. node src/server.mjs (PORT default 9170)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStore, publicAgent } from "./store.mjs";
import { readLaunch, refreshMarkets, getEthUsd, getLaunchFee, SPLITTER_FACTORY } from "./chain.mjs";
import { initAi, aiEnabled, draftProfile, chat, makeFace, AiError } from "./ai.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "public");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");
const PORT = +process.env.PORT || 9170;
const HOST = process.env.HOST || undefined;      // 127.0.0.1 behind Caddy in production
const PROD = process.env.NODE_ENV === "production";
const SITE = (process.env.SITE_URL || "https://orvyn.life").replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const AUTO_APPROVE = process.env.AUTO_APPROVE === "1";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".glb": "model/gltf-binary", ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".mp4": "video/mp4",
};

// pretty routes → files
const ROUTES = {
  "/": "index.html", "/app": "app.html", "/create": "app.html", "/discover": "app.html", "/my": "app.html",
  "/terms": "terms.html", "/privacy": "privacy.html", "/risk": "risk.html", "/admin": "admin.html",
};

fs.mkdirSync(UPLOADS, { recursive: true });
const store = createStore(DATA);
initAi(DATA);

const send = (res, code, body, type = "application/json", extra = {}) => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req, limit = 3_000_000) => new Promise((ok, bad) => {
  let n = 0; const chunks = [];
  req.on("data", (c) => { n += c.length; if (n > limit) { bad(new Error("too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
  req.on("error", bad);
});
const json = async (req) => { try { return JSON.parse(await readBody(req)); } catch { return null; } };
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ipOf = (req) => (req.headers["x-forwarded-for"]?.split(",")[0] || req.socket.remoteAddress || "").trim();
const CATS = ["utility", "companion", "meme", "community", "creator"];

// naive per-IP rate limit for writes
const hits = new Map();
const limited = (ip, key, max, windowMs = 60_000) => {
  const k = key + ip, now = Date.now(), w = (hits.get(k) || []).filter((t) => now - t < windowMs);
  w.push(now); hits.set(k, w); return w.length > max;
};
setInterval(() => hits.clear(), 10 * 60_000).unref();

function saveImage(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 2_000_000) throw Object.assign(new Error("Image must be under 2 MB."), { status: 400 });
  const file = crypto.randomBytes(8).toString("hex") + "." + (m[1] === "jpeg" ? "jpg" : m[1]);
  fs.writeFileSync(path.join(UPLOADS, file), buf);
  return "/uploads/" + file;
}

const mineFrom = (url) => (url.searchParams.get("mine") || "").split(",").filter((x) => /^[0-9a-f]{12}$|^ex-[a-z-]+$/.test(x)).slice(0, 50);
const isAdmin = (req) => ADMIN_TOKEN && crypto.timingSafeEqual(
  Buffer.from(crypto.createHash("sha256").update(req.headers.authorization?.replace(/^Bearer /, "") || "").digest()),
  Buffer.from(crypto.createHash("sha256").update(ADMIN_TOKEN).digest()));

async function api(req, res, url) {
  const p = url.pathname, ip = ipOf(req);
  let m;

  if (p === "/api/config" && req.method === "GET") {
    return send(res, 200, { ai: aiEnabled(), ethUsd: await getEthUsd(), launchFeeEth: await getLaunchFee(), fees: { splitterFactory: SPLITTER_FACTORY || null, creatorBps: SPLITTER_FACTORY ? +(process.env.SPLITTER_CREATOR_BPS || 7143) : 10_000 } });
  }

  if (p === "/api/agents" && req.method === "GET") {
    const mine = new Set(mineFrom(url));
    return send(res, 200, { agents: store.visible([...mine]).map((a) => publicAgent(a, { mine: mine.has(a.id) })) });
  }

  if ((m = p.match(/^\/api\/agents\/([0-9a-z-]+)$/)) && req.method === "GET") {
    const a = store.get(m[1]), mine = mineFrom(url).includes(m[1]);
    if (!a || a.status === "hidden" || (!store.isPublic(a) && !mine)) return send(res, 404, { error: "Agent not found." });
    return send(res, 200, { agent: publicAgent(a, { mine }) });
  }

  if (p === "/api/agents" && req.method === "POST") {
    if (limited(ip, "create:", 6)) return send(res, 429, { error: "Slow down a little." });
    const b = await json(req); if (!b) return send(res, 400, { error: "Bad request" });
    const name = clean(b.name, 32), ticker = clean(b.ticker, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const description = clean(b.description, 600);
    if (!name || !ticker || description.length < 12) return send(res, 400, { error: "Name, ticker and a short description are required." });
    let image = null;
    if (typeof b.image === "string" && /^\/uploads\/face-[0-9a-z]+\.(png|jpg)$/.test(b.image) && fs.existsSync(path.join(DATA, b.image))) image = b.image;
    else image = saveImage(b.image);
    const agent = store.add({
      name, ticker, description,
      category: CATS.includes(b.category) ? b.category : "utility",
      skills: Array.isArray(b.skills) ? b.skills.slice(0, 4).map((s) => clean(s, 32)).filter(Boolean) : [],
      persona: clean(b.persona, 400) || undefined,
      mode: b.mode === "manual" ? "manual" : "automatic",
      image, wallet: /^0x[0-9a-fA-F]{40}$/.test(b.wallet || "") ? b.wallet.toLowerCase() : null,
      status: AUTO_APPROVE ? "approved" : "pending", ip,
    });
    return send(res, 201, { agent: publicAgent(agent, { mine: true }) });
  }

  // Pons needs a logo: an agent without one may get a picture once, before it launches.
  if ((m = p.match(/^\/api\/agents\/([0-9a-f]{12})\/image$/)) && req.method === "POST") {
    if (limited(ip, "image:", 6)) return send(res, 429, { error: "Slow down a little." });
    const a = store.get(m[1]); if (!a || a.status === "hidden") return send(res, 404, { error: "Agent not found." });
    if (a.image || a.launch?.ca) return send(res, 400, { error: "This agent already has an image." });
    const b = await json(req), image = saveImage(b?.image);
    if (!image) return send(res, 400, { error: "Send a PNG, JPG or WebP image." });
    return send(res, 200, { agent: publicAgent(store.update(a.id, { image }), { mine: true }) });
  }

  // A launch is accepted only if the token on chain carries this agent's link and name.
  if ((m = p.match(/^\/api\/agents\/([0-9a-f]{12})\/launch$/)) && req.method === "POST") {
    if (limited(ip, "launch:", 10)) return send(res, 429, { error: "Slow down a little." });
    const a = store.get(m[1]); if (!a || a.status === "hidden") return send(res, 404, { error: "Agent not found." });
    if (a.launch?.ca) return send(res, 200, { agent: publicAgent(a, { mine: true }) });
    const b = await json(req);
    try {
      const l = await readLaunch(b?.tx);
      if (!l.description.includes(`orvyn.life/agent/${a.id}`)) return send(res, 400, { error: "That token was not launched from this agent." });
      if (l.name !== a.name || l.symbol !== a.ticker) return send(res, 400, { error: "Token name or ticker does not match this agent." });
      const agent = store.update(a.id, {
        launch: { ca: l.token, curve: l.curve, deployer: l.deployer, feeRecipient: l.feeRecipient, splitter: l.splitter, creatorBps: l.creatorBps, tx: b.tx, block: l.block, launchedAt: new Date().toISOString() },
        wallet: l.splitCreator || l.deployer,
      });
      refreshMarkets(store).catch(() => {});
      return send(res, 200, { agent: publicAgent(agent, { mine: true }) });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }

  if (p === "/api/stats" && req.method === "GET") {
    const list = store.all().filter((a) => !a.example && store.isPublic(a));
    const today = new Date().toISOString().slice(0, 10);
    return send(res, 200, { agents: list.length, today: list.filter((a) => (a.createdAt || "").startsWith(today)).length, launched: list.filter((a) => a.launch?.ca).length });
  }

  // ---------- AI (off until keys are set) ----------
  if (p.startsWith("/api/ai/") && req.method === "POST") {
    const b = await json(req); if (!b) return send(res, 400, { error: "Bad request" });
    try {
      if (p === "/api/ai/draft") {
        const idea = clean(b.idea, 600); if (idea.length < 12) return send(res, 400, { error: "Describe your agent in a sentence." });
        return send(res, 200, { profile: await draftProfile(idea, ip) });
      }
      if (p === "/api/ai/face") {
        const look = clean(b.look, 300); if (look.length < 8) return send(res, 400, { error: "Describe how it should look." });
        return send(res, 200, { image: await makeFace(look, ip, UPLOADS) });
      }
      if (p === "/api/ai/chat") {
        const a = store.get(clean(b.agentId, 40));
        if (!a || !store.isPublic(a)) return send(res, 404, { error: "Agent not found." });
        if (a.example) return send(res, 400, { error: "Example agents do not chat. Try a live one." });
        return send(res, 200, { reply: await chat(a, Array.isArray(b.messages) ? b.messages : [], ip) });
      }
    } catch (e) {
      if (e instanceof AiError) return send(res, e.status, { error: e.message });
      throw e;
    }
  }

  // ---------- admin ----------
  if (p.startsWith("/api/admin/")) {
    if (!isAdmin(req)) return send(res, 401, { error: "Not allowed." });
    if (p === "/api/admin/agents" && req.method === "GET") {
      return send(res, 200, { agents: store.all().filter((a) => !a.example) });
    }
    if ((m = p.match(/^\/api\/admin\/agents\/([0-9a-f]{12})$/)) && req.method === "POST") {
      const b = await json(req), a = store.get(m[1]); if (!a) return send(res, 404, { error: "Not found." });
      if (b?.action === "approve") return send(res, 200, { agent: store.update(a.id, { status: "approved" }) });
      if (b?.action === "hide") return send(res, 200, { agent: store.update(a.id, { status: "hidden" }) });
      if (b?.action === "pending") return send(res, 200, { agent: store.update(a.id, { status: "pending" }) });
      if (b?.action === "delete") {
        if (a.launch?.ca) return send(res, 400, { error: "Launched agents can only be hidden, not deleted." });
        if (a.image?.startsWith("/uploads/")) fs.rm(path.join(DATA, a.image), () => {});
        store.remove(a.id); return send(res, 200, { ok: true });
      }
      return send(res, 400, { error: "Unknown action." });
    }
  }
  return send(res, 404, { error: "Not found" });
}

// /agent/:id — the app's agent page with real meta tags, so links unfurl on X.
const agentTpl = () => fs.readFileSync(path.join(PUB, "agent.html"), "utf8");
function agentPage(res, id) {
  const a = store.get(id);
  const ok = a && store.isPublic(a);
  const abs = (u) => (u?.startsWith("http") ? u : SITE + (u || "/brand/og.jpg"));
  const title = ok ? `${a.name} ($${a.ticker}) — ORVYN` : "Agent — ORVYN";
  const desc = ok ? a.description : "An autonomous agent coin on ORVYN.";
  const html = agentTpl()
    .replaceAll("{{TITLE}}", esc(title)).replaceAll("{{DESC}}", esc(desc))
    .replaceAll("{{IMAGE}}", esc(ok && a.image ? abs(a.image) : SITE + "/brand/og.jpg"))
    .replaceAll("{{URL}}", esc(`${SITE}/agent/${id}`)).replaceAll("{{ID}}", esc(id))
    .replaceAll("{{CARD}}", ok && a.image ? "summary_large_image" : "summary_large_image");
  send(res, ok ? 200 : 404, html, TYPES[".html"]);
}

function sitemap(res) {
  const urls = ["/", "/app", "/terms", "/privacy", "/risk", ...store.all().filter((a) => !a.example && store.isPublic(a)).map((a) => "/agent/" + a.id)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  send(res, 200, body, TYPES[".xml"], { "Cache-Control": "public, max-age=3600" });
}

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      return fs.readFile(path.join(PUB, "404.html"), (e, b) => send(res, 404, e ? "Not found" : b, TYPES[".html"]));
    }
    const ext = path.extname(file).toLowerCase();
    const cache = PROD && /\.(woff2|webp|png|jpg|glb|svg|ico)$/.test(ext) ? "public, max-age=604800" : "no-cache";
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": cache });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (PROD && url.pathname.startsWith("/_")) return send(res, 404, "Not found", "text/plain");
    if (url.pathname === "/sitemap.xml") return sitemap(res);
    if (url.pathname === "/robots.txt") return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${SITE}/sitemap.xml\n`, TYPES[".txt"]);
    const am = url.pathname.match(/^\/agent\/([0-9a-z-]{3,40})\/?$/);
    if (am) return agentPage(res, am[1]);
    if (url.pathname.startsWith("/uploads/")) return serveFile(res, path.join(UPLOADS, path.basename(url.pathname)));
    const rel = ROUTES[url.pathname] || decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.resolve(PUB, rel);
    if (!file.startsWith(PUB)) return send(res, 403, "Forbidden", "text/plain");
    serveFile(res, fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, "index.html") : file);
  } catch (e) {
    console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : "Server error" });
  }
}).listen(PORT, HOST, () => console.log(`ORVYN on http://${HOST || "localhost"}:${PORT}`));

// market data for launched agents
const tick = () => refreshMarkets(store).catch((e) => console.error("markets", e.message));
setTimeout(tick, 3000); setInterval(tick, +process.env.MARKET_INTERVAL_MS || 60_000);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { store.flush(); process.exit(0); });
