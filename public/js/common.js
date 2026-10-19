// Shared: CA chip, copy, socials, toast.
(() => {
  const C = window.ORVYN || {};
  const hasCa = /^0x[0-9a-fA-F]{40}$/.test(C.ca || "");
  const toastEl = () => document.querySelector(".toast");
  let tt;
  window.toast = (msg) => {
    const t = toastEl(); if (!t) return;
    t.textContent = msg; t.classList.add("on");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("on"), 2200);
  };
  window.ORVYN_URL = (tpl) => (tpl || "").replace("{CA}", C.ca);
  window.fmtUsd = (n) => !n ? "—" : n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + Math.round(n);

  // Downscale an upload to ≤900px WebP so it stays light.
  window.OrvynImage = (file) => new Promise((ok, bad) => {
    if (file.size > 12e6) return bad(new Error("That image is too large"));
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, 900 / Math.max(im.width, im.height));
        const c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/webp", 0.85));
      };
      im.onerror = () => bad(new Error("Could not read that image"));
      im.src = fr.result;
    };
    fr.onerror = () => bad(new Error("Could not read that image"));
    fr.readAsDataURL(file);
  });
  window.ORVYN_HAS_CA = hasCa;

  // CA chip: shows the full address once it exists, the placeholder before; a click copies exactly what is shown.
  const caText = C.caText || "CA NOT YET BOTTLED";
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0";
      document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast("Copied");
  };
  document.querySelectorAll("[data-ca]").forEach((chip) => {
    const label = chip.querySelector("b"), text = chip.querySelector("[data-ca-text]");
    chip.classList.toggle("has-ca", hasCa);
    if (label) label.hidden = !hasCa;
    if (text) text.textContent = hasCa ? C.ca : caText;
    chip.setAttribute("role", "button"); chip.tabIndex = 0;
    chip.title = hasCa ? "Copy contract address" : "The contract address is posted at launch";
    const go = () => copy(hasCa ? C.ca : caText);
    chip.addEventListener("click", go);
    chip.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  const social = (sel, url, label) => document.querySelectorAll(sel).forEach((a) => {
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; }
    else a.addEventListener("click", (e) => { e.preventDefault(); toast(label + " coming soon"); });
  });
  social("[data-x]", C.x, "X account");
  // Buy / Chart only exist once the CA does
  document.querySelectorAll("[data-ca-only]").forEach((el) => { el.hidden = !hasCa; });
  document.querySelectorAll("[data-buy]").forEach((a) => {
    if (hasCa) { a.href = ORVYN_URL(C.buyUrl); a.target = "_blank"; a.rel = "noopener"; }
    else a.addEventListener("click", (e) => { e.preventDefault(); toast("Buy opens at launch"); });
  });
})();
