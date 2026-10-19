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

  document.querySelectorAll("[data-ca-text]").forEach((el) => { el.textContent = hasCa ? C.ca : "Coming soon"; });
  document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    if (!hasCa) return toast("Contract address drops at launch");
    try { await navigator.clipboard.writeText(C.ca); toast("Contract address copied"); } catch { toast(C.ca); }
  }));
  const social = (sel, url, label) => document.querySelectorAll(sel).forEach((a) => {
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; }
    else a.addEventListener("click", (e) => { e.preventDefault(); toast(label + " coming soon"); });
  });
  social("[data-x]", C.x, "X account");
  document.querySelectorAll("[data-buy]").forEach((a) => {
    if (hasCa) { a.href = ORVYN_URL(C.buyUrl); a.target = "_blank"; a.rel = "noopener"; }
    else a.addEventListener("click", (e) => { e.preventDefault(); toast("Buy opens at launch"); });
  });
})();
