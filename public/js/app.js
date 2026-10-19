// ORVYN app — agents from /api/agents, create flow, launch, chat, drawer.
(() => {
  const C = window.ORVYN || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const icon = (id) => `<svg class="icon"><use href="#${id}"/></svg>`;

  let agents = [], cat = "all", query = "", sort = "new", cfg = { ai: {} };
  const stars = new Set(store.get("orvyn.stars", []));
  const mine = () => new Set(store.get("orvyn.mine", []));
  const addMine = (id) => { const s = mine(); s.add(id); store.set("orvyn.mine", [...s]); };

  // ---------- data ----------
  async function load() {
    try {
      const r = await fetch("/api/agents?mine=" + [...mine()].join(","), { cache: "no-store" });
      agents = (await r.json()).agents || [];
    } catch { agents = []; }
    if (C.showExamples === false) agents = agents.filter((a) => !a.example);
    $("[data-example-note]").hidden = !agents.some((a) => a.example);
    render();
  }
  fetch("/api/config").then((r) => r.json()).then((j) => { cfg = j; }).catch(() => {});

  const visible = () => agents.filter((a) =>
    (cat === "all" || a.category === cat) &&
    (!query || (a.name + " " + a.ticker + " " + a.description).toLowerCase().includes(query)));

  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const art = (a, cls = "") => a.image
    ? `<img src="${esc(a.image)}" alt="" loading="lazy" decoding="async" class="${cls}">`
    : `<div class="ph ${cls}" style="--h:${hue(a.name)}"><span>${esc(a.ticker.slice(0, 2))}</span></div>`;
  const launched = (a) => !!a.launch?.ca;
  const statusOf = (a) => a.example ? "Example" : launched(a) ? (a.market?.graduated ? "Graduated" : "Trading") : a.status === "pending" ? "In review" : "Not launched";
  const badge = (a) => a.example ? `<span class="pill ex">Example</span>`
    : launched(a) ? `<span class="pill live">MC <i>${esc(fmtUsd(a.market?.mcUsd))}</i></span>`
    : a.status === "pending" ? `<span class="pill draft">In review</span>`
    : `<span class="pill">Not launched</span>`;
  const byNew = (x, y) => (y.launch?.launchedAt || y.createdAt || "").localeCompare(x.launch?.launchedAt || x.createdAt || "");

  function card(a) {
    const prog = launched(a) ? `<span class="card-prog"><i style="width:${Math.round((a.market?.progress || 0) * 100)}%"></i></span>` : "";
    return `<article class="card" data-id="${esc(a.id)}" tabindex="0">
      ${art(a)}
      <div class="card-top">${badge(a)}</div>
      <div class="card-body">
        <div class="card-name"><b>${esc(a.name)}</b><button class="star ${stars.has(a.id) ? "on" : ""}" data-star aria-label="Star ${esc(a.name)}">${icon("i-star")}</button></div>
        <p class="card-desc">${esc(a.description)}</p>
        <div class="card-act">
          <button data-act="chat" aria-label="Chat">${icon("i-chat")}</button>
          <button data-act="run" aria-label="Run">${icon("i-play")}</button>
          <button data-act="buy" class="buy" aria-label="Buy">${icon("i-bag")}</button>
        </div>
        ${prog}
      </div>
    </article>`;
  }

  function render() {
    const list = visible();
    const live = list.filter(launched), real = list.filter((a) => !a.example && !launched(a)).sort(byNew), ex = list.filter((a) => a.example);
    const liveByMc = [...live].sort((x, y) => (y.market?.mcUsd || 0) - (x.market?.mcUsd || 0));

    $("[data-rail=trending]").innerHTML =
      `<button class="card card-create" type="button" data-goto="#create"><span class="cc-plus">${icon("i-plus")}</span><b>Create an agent</b><span>Describe it in one sentence. We handle the rest.</span></button>` +
      [...liveByMc, ...ex].slice(0, 12).map(card).join("");

    const latest = [...[...live].sort(byNew), ...real, ...ex].slice(0, 8);
    $("[data-list=latest]").innerHTML = latest.map((a) => `
      <button class="row-item" type="button" data-id="${esc(a.id)}">
        ${art(a)}
        <div><b>${esc(a.name)}</b><p>${esc(a.description)}</p><small>${launched(a) ? `MC <em>${esc(fmtUsd(a.market?.mcUsd))}</em>` : esc(statusOf(a))} · $${esc(a.ticker)}</small></div>
      </button>`).join("") || `<p class="grid-empty">No agents match that yet.</p>`;

    const skilled = [...list].sort((a, b) => (b.skills?.length || 0) - (a.skills?.length || 0)).slice(0, 8);
    $("[data-list=skilled]").innerHTML = skilled.map((a) => `
      <button class="sk" type="button" data-id="${esc(a.id)}">
        <div class="sk-img">${art(a)}${launched(a) ? `<span class="sk-live"></span>` : ""}</div>
        <div class="sk-body">
          <b>${esc(a.name)}</b><p>${esc(a.description)}</p>
          <div class="sk-foot"><div><small>Skills</small><em>${a.skills?.length || 0}</em></div><span class="sk-go">${icon("i-ne")}</span></div>
        </div>
      </button>`).join("");

    const all = sort === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : [...[...live].sort(byNew), ...real, ...ex];
    $("[data-list=live]").innerHTML = all.map(card).join("") || `<p class="grid-empty">Nothing here yet. Describe the first one.</p>`;

    renderSide();
  }

  // ---------- sidebar lists ----------
  let sideTab = "drafts";
  function renderSide() {
    const ids = mine();
    let list = [], empty = "";
    if (sideTab === "drafts") { list = agents.filter((a) => ids.has(a.id) && !launched(a)); empty = "Agents you create land here until you launch them."; }
    if (sideTab === "launched") { list = agents.filter((a) => ids.has(a.id) && launched(a)); empty = "Nothing launched yet."; }
    if (sideTab === "starred") { list = agents.filter((a) => stars.has(a.id)); empty = "Tap the star on any agent to keep it here."; }
    $("[data-side-list]").innerHTML = list.length
      ? list.slice(0, 8).map((a) => `<button class="side-item" type="button" data-id="${esc(a.id)}">${art(a)}<span>${esc(a.name)}<small>$${esc(a.ticker)} · ${esc(statusOf(a))}</small></span></button>`).join("")
      : `<p class="empty">${empty}</p>`;
  }
  $("[data-side-tabs]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    $$("[data-side-tabs] button").forEach((x) => x.classList.toggle("on", x === b));
    sideTab = b.dataset.tab; renderSide();
  });

  // ---------- interactions ----------
  document.addEventListener("click", (e) => {
    const star = e.target.closest("[data-star]");
    if (star) {
      e.stopPropagation();
      const id = star.closest("[data-id]").dataset.id;
      stars.has(id) ? stars.delete(id) : stars.add(id);
      store.set("orvyn.stars", [...stars]);
      $$(`[data-id="${CSS.escape(id)}"] [data-star]`).forEach((s) => s.classList.toggle("on", stars.has(id)));
      renderSide(); return;
    }
    const act = e.target.closest("[data-act]");
    if (act) { e.stopPropagation(); return action(act.dataset.act, find(act.closest("[data-id]").dataset.id)); }
    const go = e.target.closest("[data-goto]");
    if (go) { $(go.dataset.goto).scrollIntoView({ behavior: "smooth" }); return; }
    const item = e.target.closest("[data-id]");
    if (item && !e.target.closest(".drawer")) openDrawer(find(item.dataset.id));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".card[data-id]")) openDrawer(find(e.target.dataset.id));
    if (e.key === "Escape") { closeDrawer(); closeModal(); document.body.classList.remove("side-open"); }
    if (e.key === "/" && !e.target.matches("input, textarea")) { e.preventDefault(); $("[data-search]").focus(); }
  });
  const find = (id) => agents.find((a) => a.id === id);
  // launched coins are public, so their agents can talk even before review
  const canChat = (a) => cfg.ai?.chat && !a.example && (a.status === "approved" || launched(a));

  function action(kind, a) {
    if (!a) return;
    if (kind === "buy") {
      if (launched(a)) return window.open((C.buyUrl || "").replace("{CA}", a.launch.ca), "_blank", "noopener");
      if (a.mine) return OrvynLaunch.open(a, onLaunched);
      return toast(a.example ? "Example agent — there is no coin to buy" : "This agent has not launched its coin yet");
    }
    if (kind === "chat") {
      if (canChat(a)) { openDrawer(a); setTimeout(() => $("[data-dr-chatbox] input")?.focus(), 350); return; }
      return toast(a.example ? "Example agent — chat with a live one" : cfg.ai?.chat ? "Chat opens once the agent is reviewed" : "Agent chat is coming soon");
    }
    if (kind === "run") return toast("Runs arrive with agent computers — coming soon");
  }

  $("[data-cats]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    $$("[data-cats] button").forEach((x) => x.classList.toggle("on", x === b));
    cat = b.dataset.cat; render();
  });
  $("[data-sort]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-s]"); if (!b) return;
    $$("[data-sort] button").forEach((x) => x.classList.toggle("on", x === b));
    sort = b.dataset.s; render();
  });
  let qt;
  $("[data-search]").addEventListener("input", (e) => {
    clearTimeout(qt); qt = setTimeout(() => { query = e.target.value.trim().toLowerCase(); render(); if (query) $("#trending").scrollIntoView({ behavior: "smooth" }); }, 140);
  });
  $$("[data-scroll]").forEach((b) => b.addEventListener("click", () => {
    const r = $("[data-rail=trending]"); r.scrollBy({ left: +b.dataset.scroll * (r.clientWidth * 0.8), behavior: "smooth" });
  }));

  // sidebar toggle
  $("[data-menu]").addEventListener("click", () => {
    if (innerWidth > 1100) document.body.classList.toggle("side-closed");
    else document.body.classList.toggle("side-open");
  });
  $("[data-scrim]").addEventListener("click", () => document.body.classList.remove("side-open"));
  $$("[data-open-mine]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    if (innerWidth <= 1100) document.body.classList.add("side-open");
    $("[data-side-tabs] [data-tab=drafts]").click();
  }));

  // active nav on scroll
  const navLinks = $$(".side-nav a[href^='#'], .tabbar a[href^='#']");
  const spy = new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) return;
    const id = en.target.id === "live" ? "#live" : en.target.id === "create" ? "#create" : "#top";
    navLinks.forEach((l) => l.classList.toggle("on", l.getAttribute("href") === id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  ["top", "create", "live"].forEach((id) => spy.observe(document.getElementById(id)));

  // platform token links
  $$("[data-chart]").forEach((a) => {
    if (window.ORVYN_HAS_CA) { a.href = ORVYN_URL(C.chartUrl); a.target = "_blank"; a.rel = "noopener"; }
    else a.addEventListener("click", (e) => { e.preventDefault(); toast("Chart opens at launch"); });
  });
  $$("[data-ticker]").forEach((el) => (el.textContent = C.ticker || "$ORVYN"));

  // ---------- drawer ----------
  const drawer = $("[data-drawer]");
  let current = null;
  function openDrawer(a) {
    if (!a) return; current = a;
    const img = $("[data-dr-img]");
    if (a.image) { img.src = a.image; img.hidden = false; } else { img.hidden = true; img.removeAttribute("src"); }
    $(".dr-media").style.background = a.image ? "" : `radial-gradient(80% 70% at 30% 30%, hsl(${hue(a.name)} 80% 65% / .5), transparent 60%), #120f1c`;
    $("[data-dr-badge]").textContent = statusOf(a);
    $("[data-dr-name]").textContent = a.name;
    $("[data-dr-ticker]").textContent = "$" + a.ticker;
    $("[data-dr-desc]").textContent = a.description;
    $("[data-dr-skills]").innerHTML = (a.skills || []).map((s) => `<span>${esc(s)}</span>`).join("");
    $("[data-dr-mc]").textContent = launched(a) ? fmtUsd(a.market?.mcUsd) : "—";
    $("[data-dr-status]").textContent = statusOf(a);
    $("[data-dr-curve]").hidden = !launched(a);
    if (launched(a)) {
      const p = Math.round((a.market?.progress || 0) * 1000) / 10;
      $("[data-dr-prog]").textContent = a.market?.graduated ? "Graduated" : p + "%";
      $("[data-dr-bar]").style.width = (a.market?.graduated ? 100 : p) + "%";
      $("[data-dr-ca]").textContent = a.launch.ca;
    }
    fees(a, "dr");
    $("[data-dr-launch]").hidden = !(a.mine && !launched(a) && !a.example);
    const page = `${location.origin}/agent/${a.id}`;
    $("[data-dr-page]").href = "/agent/" + a.id;
    $("[data-dr-share]").href = `https://x.com/intent/post?text=${encodeURIComponent(`${a.name} ($${a.ticker}) on @orvynlife`)}&url=${encodeURIComponent(page)}`;
    $(".dr-links").toggleAttribute("hidden", a.status === "pending" && !launched(a));
    const box = $("[data-dr-chatbox]");
    box.hidden = !canChat(a);
    if (canChat(a)) OrvynChat.mount(box, a);
    $("[data-dr-note]").textContent = a.example ? "This is an example of what an agent coin looks like. It is not a live coin."
      : a.status === "pending" && !launched(a) ? "Only you can see this agent until it is reviewed. Launching its coin makes it public right away." : "";
    drawer.classList.add("on"); drawer.setAttribute("aria-hidden", "false");
  }
  function closeDrawer() { drawer.classList.remove("on"); drawer.setAttribute("aria-hidden", "true"); }
  $$("[data-close]").forEach((b) => b.addEventListener("click", closeDrawer));
  $("[data-dr-chat]").addEventListener("click", () => action("chat", current));
  $("[data-dr-run]").addEventListener("click", () => action("run", current));
  $("[data-dr-buy]").addEventListener("click", () => action("buy", current));
  $("[data-dr-launch]").addEventListener("click", () => OrvynLaunch.open(current, onLaunched));
  $("[data-dr-copy]").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(current.launch.ca); toast("Contract address copied"); } catch { toast(current.launch.ca); }
  });
  // splitter coins: what is waiting and who gets what
  function fees(a, pre) {
    const box = $(`[data-${pre}-fees]`), on = !!a.launch?.splitter;
    box.hidden = !on; if (!on) return;
    const bps = a.launch.creatorBps || 7143;
    $(`[data-${pre}-feeamt]`).textContent = (a.market?.feesWaitingEth || 0).toFixed(6) + " ETH";
    $(`[data-${pre}-feesplit]`).textContent = `${Math.round(bps / 10_000 * 70) / 100}% of volume to the creator · ${Math.round((10_000 - bps) / 10_000 * 70) / 100}% to ORVYN`;
  }
  $("[data-dr-collect]").addEventListener("click", async () => { if (await OrvynLaunch.collect(current)) { await load(); const f = find(current.id); if (f) { f.market = { ...f.market, feesWaitingEth: 0 }; openDrawer(f); } } });
  async function onLaunched(a) { addMine(a.id); await load(); const fresh = find(a.id); if (fresh && drawer.classList.contains("on")) openDrawer(fresh); }

  // ---------- prompt placeholder rotation ----------
  const ideas = [
    "A night-shift analyst that writes a risk note on every new launch",
    "A sarcastic cat that turns my trades into a weekly comic",
    "An agent that keeps my community chat summarised every evening",
    "A tiny chef that plans meals from a photo of my fridge",
    "A designer that rebuilds local shop websites and pitches them",
  ];
  const pIn = $("[data-prompt-input]"), hint = $("[data-prompt-hint]");
  let ii = 0, ci = 0;
  function typeNext() {
    const s = ideas[ii];
    if (document.activeElement === pIn || pIn.value) { pIn.placeholder = "Describe the agent you want to launch…"; setTimeout(typeNext, 800); return; }
    ci++;
    pIn.placeholder = s.slice(0, ci) + (ci < s.length ? "▍" : "");
    if (ci >= s.length) { ci = 0; ii = (ii + 1) % ideas.length; setTimeout(typeNext, 2200); }
    else setTimeout(typeNext, 28 + Math.random() * 40);
  }
  typeNext();
  hint.textContent = "Press Enter to shape it into an agent";
  pIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("[data-prompt]").requestSubmit(); } });
  $("[data-prompt]").addEventListener("submit", (e) => {
    e.preventDefault();
    const idea = pIn.value.trim();
    if (idea.length < 12) { pIn.focus(); return toast("Give it a sentence — what should your agent do?"); }
    fromIdea(idea);
  });
  $("[data-launch]").addEventListener("click", () => {
    if (pIn.value.trim().length >= 12) return $("[data-prompt]").requestSubmit();
    pIn.focus(); toast("Start by describing your agent");
  });

  // Automatic mode: the AI drafts the profile when it is switched on, otherwise a local first guess.
  async function fromIdea(idea) {
    if (cfg.ai?.draft) {
      toast("Shaping your agent…");
      try {
        const r = await fetch("/api/ai/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea }) });
        const j = await r.json();
        if (r.ok) return openReview({ ...j.profile, image: null, mode: "automatic" });
        toast(j.error || "Could not draft it — fill it in yourself");
      } catch { toast("Could not draft it — fill it in yourself"); }
    }
    openReview(draftFromIdea(idea));
  }

  // ---------- create form ----------
  const form = $("[data-create]");
  $("[data-mode]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]"); if (!b) return;
    $$("[data-mode] button").forEach((x) => x.classList.toggle("on", x === b));
    const manual = b.dataset.m === "manual";
    $(".mode-auto", form).hidden = manual; $(".mode-manual", form).hidden = !manual;
  });
  let formImage = null;
  form.image.addEventListener("change", async () => {
    const f = form.image.files[0]; if (!f) return;
    try { formImage = await OrvynImage(f); $("[data-upload-label]").lastChild.textContent = f.name; } catch (x) { toast(x.message); }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const manual = $(".mode-auto", form).hidden;
    if (!manual) {
      const idea = form.idea.value.trim();
      if (idea.length < 12) { form.idea.focus(); return toast("Describe your agent in a sentence first"); }
      return fromIdea(idea);
    }
    openReview({
      name: form.name.value.trim(), ticker: form.ticker.value.trim(), description: form.description.value.trim(),
      category: form.category.value, image: formImage, mode: "manual",
    });
  });

  // A first draft from the sentence alone; the creator edits everything in review.
  function draftFromIdea(idea) {
    const stop = new Set("a an the that who which and or to of for in on my me i it its with every each from into your their this one agent bot".split(" "));
    const words = idea.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);
    const key = words.find((w) => w.length > 3 && !stop.has(w.toLowerCase())) || "Orvy";
    const name = key[0].toUpperCase() + key.slice(1).toLowerCase();
    const l = idea.toLowerCase();
    const category = /meme|cat|dog|funny|roast|joke|frog/.test(l) ? "meme" : /community|chat|discord|telegram|holders/.test(l) ? "community"
      : /friend|companion|story|chef|coach|tutor/.test(l) ? "companion" : /art|music|design|video|write|post/.test(l) ? "creator" : "utility";
    return { name: name.slice(0, 32), ticker: name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase(), description: idea.slice(0, 600), category, image: null, mode: "automatic" };
  }

  // ---------- review modal ----------
  const modal = $("[data-modal]"), rv = $("[data-review]");
  let rvImage = null, rvExtra = {};
  function setRvImage(src) {
    rvImage = src;
    const img = $("[data-rv-img]");
    if (src) { img.src = src; $("[data-rv-ph]").hidden = true; } else { img.removeAttribute("src"); $("[data-rv-ph]").hidden = false; }
  }
  function openReview(d) {
    rv.name.value = d.name || ""; rv.ticker.value = d.ticker || ""; rv.description.value = d.description || "";
    rv.category.value = d.category || "utility";
    rvExtra = { mode: d.mode, skills: d.skills || [], persona: d.persona || "", look: d.look || "" };
    setRvImage(d.image || null);
    $("[data-rv-face]").hidden = !cfg.ai?.face;
    $("[data-rv-err]").textContent = "";
    modal.classList.add("on"); modal.setAttribute("aria-hidden", "false");
    setTimeout(() => rv.name.focus(), 50);
  }
  function closeModal() { modal.classList.remove("on"); modal.setAttribute("aria-hidden", "true"); }
  $$("[data-mclose]").forEach((b) => b.addEventListener("click", closeModal));
  $("[data-rv-file]").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { setRvImage(await OrvynImage(f)); } catch (x) { toast(x.message); }
  });
  $("[data-rv-face]").addEventListener("click", async (e) => {
    const b = e.currentTarget, look = rvExtra.look || `${rv.name.value}: ${rv.description.value}`;
    b.disabled = true; b.lastChild.textContent = "Painting… (about 20s)";
    try {
      const r = await fetch("/api/ai/face", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ look }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      setRvImage(j.image);
    } catch (x) { $("[data-rv-err]").textContent = x.message || "Could not paint a face"; }
    finally { b.disabled = false; b.lastChild.textContent = "Generate a face"; }
  });
  rv.ticker.addEventListener("input", () => { rv.ticker.value = rv.ticker.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
  rv.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("button[type=submit]", rv); btn.disabled = true; btn.textContent = "Saving…";
    try {
      const r = await fetch("/api/agents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: rv.name.value, ticker: rv.ticker.value, description: rv.description.value, category: rv.category.value, image: rvImage, wallet: OrvynWallet.address, ...rvExtra }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      addMine(j.agent.id);
      closeModal(); pIn.value = ""; form.reset(); formImage = null;
      await load();
      toast(j.agent.status === "pending" ? `${j.agent.name} saved — live after a quick review` : `${j.agent.name} is live`);
      openDrawer(find(j.agent.id));
    } catch (err) {
      $("[data-rv-err]").textContent = err.message;
    } finally { btn.disabled = false; btn.textContent = "Save agent"; }
  });

  // ---------- wallet buttons ----------
  OrvynWallet.onChange((a) => {
    $$("[data-connect] span").forEach((s) => (s.textContent = a ? OrvynWallet.short(a) : (s.closest(".tabbar") ? "Wallet" : "Connect")));
  });
  $$("[data-connect]").forEach((b) => b.addEventListener("click", () => {
    if (OrvynWallet.address) { OrvynWallet.disconnect(); toast("Disconnected"); } else OrvynWallet.connect();
  }));

  // ---------- googly eyes follow the pointer ----------
  addEventListener("pointermove", (e) => {
    $$(".eyes i").forEach((el) => {
      const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, m = r.width * 0.2;
      const b = el.firstElementChild; b.style.setProperty("--ex", (dx / d) * Math.min(m, d / 12) + "px"); b.style.setProperty("--ey", (dy / d) * Math.min(m, d / 12) + "px");
    });
  });

  // deep link: /app#agent=<id>
  load().then(() => { const m = location.hash.match(/agent=([0-9a-z-]+)/); if (m && find(m[1])) openDrawer(find(m[1])); });
  setInterval(() => { if (!document.hidden && !drawer.classList.contains("on") && !modal.classList.contains("on")) load(); }, 60_000);
})();
