// /agent/:id — one agent, shareable. Data from /api/agents/:id (mine ids let a creator see a draft).
(() => {
  const C = window.ORVYN || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const id = document.body.dataset.agent;
  const mine = (() => { try { return JSON.parse(localStorage.getItem("orvyn.mine")) || []; } catch { return []; } })();
  let cfg = { ai: {} }, agent = null, chatMounted = false;

  async function load() {
    const [r, c] = await Promise.all([
      fetch(`/api/agents/${encodeURIComponent(id)}?mine=${mine.join(",")}`, { cache: "no-store" }),
      fetch("/api/config").then((x) => x.json()).catch(() => ({ ai: {} })),
    ]);
    cfg = c;
    $("[data-ap-loading]").hidden = true;
    if (!r.ok) { $("[data-ap-missing]").hidden = false; return; }
    agent = (await r.json()).agent;
    render();
  }

  function render() {
    const a = agent, launched = !!a.launch?.ca;
    const status = a.example ? "Example" : launched ? (a.market?.graduated ? "Graduated" : "Trading") : a.status === "pending" ? "In review" : "Not launched";
    $("[data-ap-grid]").hidden = false;
    const img = $("[data-ap-img]");
    if (a.image) img.src = a.image; else { img.remove(); $(".ap-media").classList.add("ph"); $(".ap-media").innerHTML = `<span>${esc(a.ticker.slice(0, 2))}</span>`; }
    $("[data-ap-badge]").textContent = status;
    $("[data-ap-name]").textContent = a.name;
    $("[data-ap-ticker]").textContent = "$" + a.ticker;
    $("[data-ap-desc]").textContent = a.description;
    $("[data-ap-skills]").innerHTML = (a.skills || []).map((s) => `<span>${esc(s)}</span>`).join("");
    $("[data-ap-mc]").textContent = launched ? fmtUsd(a.market?.mcUsd) : "—";
    $("[data-ap-status]").textContent = status;
    $("[data-ap-curve]").hidden = !launched;
    $("[data-ap-buy]").hidden = !launched;
    $("[data-ap-chart]").hidden = !launched;
    if (launched) {
      const p = Math.round((a.market?.progress || 0) * 1000) / 10;
      $("[data-ap-prog]").textContent = a.market?.graduated ? "Graduated" : p + "%";
      $("[data-ap-bar]").style.width = (a.market?.graduated ? 100 : p) + "%";
      $("[data-ap-ca]").textContent = a.launch.ca;
      $("[data-ap-buy]").href = (C.buyUrl || "").replace("{CA}", a.launch.ca);
      $("[data-ap-chart]").href = (C.chartUrl || "").replace("{CA}", a.launch.ca);
    }
    const on = !!a.launch?.splitter, bps = a.launch?.creatorBps || 7143;
    $("[data-ap-fees]").hidden = !on;
    if (on) {
      $("[data-ap-feeamt]").textContent = (a.market?.feesWaitingEth || 0).toFixed(6) + " ETH";
      $("[data-ap-feesplit]").textContent = `${Math.round(bps / 10_000 * 70) / 100}% of volume to the creator · ${Math.round((10_000 - bps) / 10_000 * 70) / 100}% to ORVYN`;
    }
    $("[data-ap-share]").href = `https://x.com/intent/post?text=${encodeURIComponent(`${a.name} ($${a.ticker}) on @orvynlife`)}&url=${encodeURIComponent(location.origin + "/agent/" + a.id)}`;
    $("[data-ap-launch]").hidden = !(a.mine && !launched && !a.example);
    const chat = cfg.ai?.chat && !a.example && (a.status === "approved" || launched);
    $("[data-ap-chatwrap]").hidden = !chat;
    if (chat && !chatMounted) { OrvynChat.mount($("[data-ap-chat]"), a); chatMounted = true; }
    $("[data-ap-note]").textContent = a.example ? "This is an example of what an agent coin looks like. It is not a live coin."
      : a.status === "pending" && !launched ? "Only you can see this page until the agent is reviewed. Launching its coin makes it public right away." : "";
  }

  $("[data-ap-copy]").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(agent.launch.ca); toast("Contract address copied"); } catch { toast(agent.launch.ca); }
  });
  $("[data-ap-collect]").addEventListener("click", async () => {
    if (await OrvynLaunch.collect(agent)) { const r = await fetch(`/api/agents/${encodeURIComponent(id)}?mine=${mine.join(",")}`); if (r.ok) agent = (await r.json()).agent; agent.market = { ...agent.market, feesWaitingEth: 0 }; render(); }
  });
  $("[data-ap-launch]").addEventListener("click", () => OrvynLaunch.open(agent, (a) => { agent = a; render(); }));

  OrvynWallet.onChange((a) => { document.querySelectorAll("[data-connect] span").forEach((s) => (s.textContent = a ? OrvynWallet.short(a) : "Connect")); if (agent) render(); });
  document.querySelectorAll("[data-connect]").forEach((b) => b.addEventListener("click", () => {
    if (OrvynWallet.address) { OrvynWallet.disconnect(); toast("Disconnected"); } else OrvynWallet.connect();
  }));
  addEventListener("pointermove", (e) => {
    document.querySelectorAll(".eyes i").forEach((el) => {
      const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, m = r.width * 0.2;
      el.firstElementChild.style.setProperty("--ex", (dx / d) * Math.min(m, d / 12) + "px");
      el.firstElementChild.style.setProperty("--ey", (dy / d) * Math.min(m, d / 12) + "px");
    });
  });

  load();
  setInterval(async () => {
    if (document.hidden || !agent?.launch?.ca) return;
    const r = await fetch(`/api/agents/${encodeURIComponent(id)}?mine=${mine.join(",")}`, { cache: "no-store" });
    if (r.ok) { agent = (await r.json()).agent; render(); }
  }, 30_000);
})();
