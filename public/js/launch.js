// Launch an agent's coin on Pons v2 from the visitor's own wallet.
// The creator fee goes to the launching wallet (no ORVYN cut). The token description and
// website carry orvyn.life/agent/<id>, which is how the server ties the coin to the agent.
(() => {
  const C = window.ORVYN || {};
  const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
  const ZERO = "0x0000000000000000000000000000000000000000";
  const TP = "tuple(string name,string symbol,string logo,string description,tuple(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt)";
  const ERRORS = [
    "error LaunchFeeNotPaid()", "error NotWhitelisted()", "error LaunchEconomicsMismatch(bytes32 expected,bytes32 actual)",
    "error CreatorTaxTooHigh()", "error InvalidTokenParams()", "error LaunchConfigDisabled()", "error NativeValueMismatch(uint256 sent,uint256 expected)",
    "error NotApprovedLauncher()", "error ZeroAmount()", "error SlippageExceeded(uint256 actual,uint256 minimum)",
  ];
  const FACTORY_ABI = [
    "function launchFee() view returns (uint256)", "function launchEnabled() view returns (bool)", "function launchForwarder() view returns (address)",
    "function previewLaunchEconomics(uint256 launchConfigId,address pairToken) view returns (bytes32)",
    `function launchToken(${TP} params,uint256 launchConfigId,address pairToken,address[] snipeTaxExemptions) payable returns (address token,address curve)`,
    ...ERRORS,
  ];
  const LAB_ABI = [
    `function launchAndBuy(${TP} params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)`,
    ...ERRORS,
  ];
  const SF_ABI = [
    "function predict(address creator, bytes32 salt) view returns (address)",
    "function create(address creator, bytes32 salt) returns (address)",
    "function isSplitter(address splitter) view returns (bool)",
    "event SplitterCreated(address indexed splitter, address indexed creator, bytes32 indexed salt, uint16 creatorBps)",
  ];
  const SPLIT_ABI = ["function collect(address curve)", "event Distributed(address indexed asset, uint256 total, uint256 toCreator, uint256 toTreasury)"];
  let cfgP = null;
  const cfg = () => (cfgP ||= fetch("/api/config").then((r) => r.json()).catch(() => ({})));
  const pct = (bps, of = 0.7) => Math.round((bps / 10_000) * of * 100) / 100;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const site = () => (location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "https://orvyn.life" : location.origin);
  const absImage = (u) => (u?.startsWith("http") ? u : site() + u);

  let el, agent, onDone, busy = false;

  function build() {
    el = document.createElement("div");
    el.className = "modal lmodal";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="drawer-scrim" data-lclose></div>
      <form class="modal-card" data-lform role="dialog" aria-modal="true" aria-labelledby="lm-title">
        <button class="drawer-x" type="button" data-lclose aria-label="Close"><svg class="icon"><use href="#i-close"/></svg></button>
        <p class="micro">Launch on Pons</p>
        <h3 id="lm-title">Give it a coin</h3>
        <div class="lm-agent"><img data-lm-img alt=""><div><b data-lm-name></b><small data-lm-ticker></small></div></div>
        <div class="lm-noimg" data-lm-noimg hidden>
          <p>Pons needs a logo. Add a picture for this agent first.</p>
          <label class="btn btn-ghost lm-upload"><input type="file" accept="image/png,image/jpeg,image/webp" data-lm-file>Upload image</label>
        </div>
        <label class="field"><span>Your first buy (ETH) — optional, bought in the same transaction</span>
          <input name="buy" inputmode="decimal" value="0" autocomplete="off">
        </label>
        <div class="lm-chips" data-lm-chips><button type="button" data-v="0">None</button><button type="button" data-v="0.005">0.005</button><button type="button" data-v="0.01">0.01</button><button type="button" data-v="0.05">0.05</button></div>
        <label class="field" data-lm-taxf><span>Creator tax on every trade (paid to you, fixed forever)</span>
          <select name="tax"><option value="0">0%</option><option value="100">1%</option><option value="200">2%</option><option value="300">3%</option><option value="500">5%</option></select>
        </label>
        <div class="lm-sum">
          <div><span>Pons launch fee</span><b data-lm-fee>—</b></div>
          <div><span>First buy</span><b data-lm-buy>0 ETH</b></div>
          <div><span>Your balance</span><b data-lm-bal>—</b></div>
          <div data-lm-split hidden><span>Trading fees</span><b data-lm-splittxt></b></div>
        </div>
        <ol class="lm-steps" data-lm-steps hidden>
          <li data-s="split" data-lm-splitstep hidden>Create your fee splitter (1st signature)</li><li data-s="sign">Confirm the launch in your wallet</li><li data-s="chain">Waiting for Robinhood Chain</li><li data-s="verify">Linking the coin to this agent</li><li data-s="done">Live</li>
        </ol>
        <p class="form-err" data-lm-err></p>
        <div class="lm-done" data-lm-done hidden></div>
        <button class="btn btn-white lm-go" type="submit" data-lm-go>Connect wallet</button>
        <p class="form-note">Creator fees from trading go to the launching wallet. Coins are speculative and can lose all value.</p>
      </form>`;
    document.body.appendChild(el);
    const f = el.querySelector("[data-lform]");
    el.addEventListener("click", (e) => { if (e.target.closest("[data-lclose]") && !busy) close(); });
    el.querySelector("[data-lm-chips]").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { f.buy.value = b.dataset.v; summary(); } });
    f.buy.addEventListener("input", summary);
    f.addEventListener("submit", (e) => { e.preventDefault(); go(); });
    el.querySelector("[data-lm-file]").addEventListener("change", upload);
    OrvynWallet.onChange(() => { if (el.classList.contains("on")) refresh(); });
  }

  const $ = (s) => el.querySelector(s);
  const buyEth = () => { const v = parseFloat(String($("[data-lform]").buy.value).replace(",", ".")); return isFinite(v) && v > 0 ? v : 0; };
  function summary() { $("[data-lm-buy]").textContent = buyEth() + " ETH"; }
  function err(msg) { $("[data-lm-err]").textContent = msg || ""; }
  function step(s) {
    const list = $("[data-lm-steps]"); list.hidden = false;
    let seen = false;
    [...list.children].forEach((li) => { li.classList.toggle("on", li.dataset.s === s); if (li.dataset.s === s) seen = true; li.classList.toggle("ok", !seen); });
  }

  let reader = null;
  function provider() {
    if (!window.ethereum) return null;
    reader ||= new ethers.BrowserProvider(window.ethereum);
    return reader;
  }

  async function refresh() {
    const has = !!agent.image;
    $("[data-lm-noimg]").hidden = has;
    $("[data-lm-img]").src = has ? agent.image : "/brand/mark.png";
    $("[data-lm-go]").textContent = !OrvynWallet.address ? "Connect wallet" : has ? "Launch on Pons" : "Add an image first";
    $("[data-lm-go]").disabled = !!OrvynWallet.address && !has;
    cfg().then((c) => {
      if (c.launchFeeEth && $("[data-lm-fee]").textContent === "—") $("[data-lm-fee]").textContent = c.launchFeeEth + " ETH";
      const split = !!c.fees?.splitterFactory;
      $("[data-lm-taxf]").hidden = split;
      $("[data-lm-split]").hidden = !split;
      $("[data-lm-splitstep]").hidden = !split;
      if (split) $("[data-lm-splittxt]").textContent = `${pct(c.fees.creatorBps)}% of volume to you · ${Math.round((0.7 - pct(c.fees.creatorBps)) * 100) / 100}% to ORVYN`;
    });
    const p = provider();
    if (!p) return;
    try {
      const f = new ethers.Contract(FACTORY, FACTORY_ABI, p);
      $("[data-lm-fee]").textContent = ethers.formatEther(await f.launchFee()) + " ETH";
      if (OrvynWallet.address) $("[data-lm-bal]").textContent = (+ethers.formatEther(await p.getBalance(OrvynWallet.address))).toFixed(5) + " ETH";
    } catch { /* wrong network until the wallet switches */ }
  }

  async function upload(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      const image = await window.OrvynImage(file);
      const r = await fetch(`/api/agents/${agent.id}/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      agent = j.agent; refresh();
    } catch (x) { err(x.message || "Upload failed"); }
  }

  function explain(e) {
    if (e?.code === "ACTION_REJECTED" || e?.code === 4001) return "Cancelled in the wallet.";
    if (e?.code === "INSUFFICIENT_FUNDS") return "Not enough ETH on Robinhood Chain for the fee, the first buy and gas.";
    const name = e?.revert?.name;
    if (name === "LaunchEconomicsMismatch") return "Pons changed its launch terms a moment ago. Try again.";
    if (name === "NotWhitelisted" || name === "NotApprovedLauncher") return "Pons is not accepting launches from this wallet right now.";
    if (name === "LaunchConfigDisabled") return "Pons has paused launches. Try again later.";
    if (name) return "Pons refused the launch (" + name + ").";
    return e?.shortMessage || e?.message || "Something went wrong.";
  }

  async function go() {
    if (busy) return;
    err("");
    if (!OrvynWallet.address) { if (await OrvynWallet.connect()) refresh(); return; }
    if (!agent.image) return err("Add an image first.");
    busy = true; $("[data-lm-go]").disabled = true;
    try {
      await OrvynWallet.ensureChain(window.ethereum);
      reader = null;
      const p = provider(), signer = await p.getSigner();
      const me = (await signer.getAddress()).toLowerCase();
      const f = new ethers.Contract(FACTORY, FACTORY_ABI, signer);
      if (!(await f.launchEnabled())) throw new Error("Pons has paused launches. Try again later.");
      const [fee, fwd, economics] = await Promise.all([f.launchFee(), f.launchForwarder(), f.previewLaunchEconomics(0, ZERO)]);
      const c = await cfg();
      let recipient = me, tax = +$("[data-lform]").tax.value;
      if (c.fees?.splitterFactory) {
        // Fee model B: the coin pays its creator fee into this agent's own splitter.
        const sf = new ethers.Contract(c.fees.splitterFactory, SF_ABI, signer);
        const salt = ethers.id(agent.id);
        recipient = await sf.predict(me, salt);
        if ((await p.getCode(recipient)) === "0x") {
          step("split");
          const t = await sf.create(me, salt);
          const rc = await t.wait(1);
          const ev = rc.logs.map((l) => { try { return sf.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "SplitterCreated");
          if (ev) recipient = ev.args.splitter;
        } else if (!(await sf.isSplitter(recipient))) throw new Error("Unexpected contract at the splitter address.");
        tax = 0;
      }
      const link = `${site()}/agent/${agent.id}`;
      const params = {
        name: agent.name.slice(0, 64), symbol: agent.ticker.slice(0, 16), logo: absImage(agent.image).slice(0, 512),
        description: `${agent.description}\n\nAgent page: ${link.replace(/^https?:\/\//, "")}`.slice(0, 2048),
        socials: { twitter: "", telegram: "", discord: "", website: link, farcaster: "" },
        creatorFeeRecipient: recipient, creatorTaxBps: tax, buybackEnabled: false,
        expectedEconomics: economics, salt: ethers.hexlify(ethers.randomBytes(32)),
      };
      const buy = ethers.parseEther(String(buyEth()));
      let tx;
      step("sign");
      if (buy > 0n) {
        // launch + first buy are atomic, so nothing can get in front of it: minTokensOut 0 is safe
        const lab = new ethers.Contract(fwd, LAB_ABI, signer);
        const args = [params, 0, ZERO, buy, 0, me, []];
        await lab.launchAndBuy.staticCall(...args, { value: fee + buy });
        tx = await lab.launchAndBuy(...args, { value: fee + buy });
      } else {
        const args = [params, 0, ZERO, []];
        await f.launchToken.staticCall(...args, { value: fee });
        tx = await f.launchToken(...args, { value: fee });
      }
      step("chain");
      await tx.wait(1);
      step("verify");
      let j, r;
      for (let i = 0; i < 6; i++) {
        r = await fetch(`/api/agents/${agent.id}/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tx: tx.hash }) });
        j = await r.json();
        if (r.ok || !/not found yet/i.test(j.error || "")) break;
        await new Promise((s) => setTimeout(s, 2500));
      }
      if (!r.ok) throw new Error((j.error || "Could not link the coin") + " — tx " + tx.hash.slice(0, 10) + "…");
      step("done");
      agent = j.agent;
      const ca = agent.launch.ca;
      $("[data-lm-done]").hidden = false;
      $("[data-lm-done]").innerHTML = `
        <b>${esc(agent.name)} is live.</b>
        <code>${esc(ca)}</code>
        <div class="lm-done-row">
          <a class="btn btn-white" target="_blank" rel="noopener" href="${esc((C.buyUrl || "").replace("{CA}", ca))}">Open on Pons</a>
          <a class="btn btn-ghost" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(`I just launched ${agent.name} ($${agent.ticker}) on @orvynlife`)}&url=${encodeURIComponent(link)}">Share on X</a>
        </div>`;
      $("[data-lm-go]").hidden = true;
      onDone?.(agent);
    } catch (e) {
      err(explain(e));
      $("[data-lm-steps]").hidden = true;
    } finally {
      busy = false; $("[data-lm-go]").disabled = false;
    }
  }

  function open(a, done) {
    if (!el) build();
    agent = a; onDone = done; busy = false;
    $("[data-lm-name]").textContent = a.name;
    $("[data-lm-ticker]").textContent = "$" + a.ticker;
    $("[data-lm-done]").hidden = true; $("[data-lm-go]").hidden = false; $("[data-lm-steps]").hidden = true;
    err(""); summary(); refresh();
    el.classList.add("on"); el.setAttribute("aria-hidden", "false");
  }
  function close() { el.classList.remove("on"); el.setAttribute("aria-hidden", "true"); }

  /** Sweep + claim + split an agent's fees (anyone may call; the split is fixed on chain). */
  async function collect(a) {
    if (!a?.launch?.splitter) return toast("This coin pays its creator directly");
    if (!OrvynWallet.address && !(await OrvynWallet.connect())) return;
    try {
      await OrvynWallet.ensureChain(window.ethereum);
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
      const sp = new ethers.Contract(a.launch.splitter, SPLIT_ABI, signer);
      toast("Confirm in your wallet");
      const t = await sp.collect(a.market?.graduated ? ZERO : a.launch.curve);
      const rc = await t.wait(1);
      const ev = rc.logs.map((l) => { try { return sp.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === "Distributed");
      toast(ev ? `Split ${(+ethers.formatEther(ev.args.total)).toFixed(6)} ETH — creator got ${(+ethers.formatEther(ev.args.toCreator)).toFixed(6)}` : "Nothing to collect yet");
      return true;
    } catch (e) { toast(explain(e)); return false; }
  }

  window.OrvynLaunch = { open, collect };
})();
