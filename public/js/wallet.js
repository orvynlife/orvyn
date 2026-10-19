// Wallet: EIP-1193 connect on Robinhood Chain. On a phone without an in-app browser,
// offers to reopen ORVYN inside a wallet app (no WalletConnect project needed).
(() => {
  const C = window.ORVYN || {};
  let address = null;
  const subs = new Set();
  const emit = () => subs.forEach((f) => f(address));
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const mobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  function sheet() {
    let el = document.querySelector(".wsheet");
    if (!el) {
      const href = location.href, hostPath = location.host + location.pathname + location.search;
      el = document.createElement("div");
      el.className = "wsheet";
      el.innerHTML = `
        <div class="wsheet-scrim" data-wclose></div>
        <div class="wsheet-card" role="dialog" aria-modal="true" aria-label="Open in a wallet">
          <p class="micro">Connect a wallet</p>
          <h3>Open ORVYN in your wallet app</h3>
          <p class="wsheet-note">Your browser has no wallet. Pick the app you use and ORVYN reopens inside it.</p>
          <div class="wsheet-list">
            <a href="https://metamask.app.link/dapp/${hostPath}">MetaMask</a>
            <a href="https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}">Trust Wallet</a>
            <a href="okx://wallet/dapp/url?dappUrl=${encodeURIComponent(href)}">OKX Wallet</a>
            <a href="https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(href)}">Coinbase Wallet</a>
          </div>
          <button class="btn btn-ghost" type="button" data-wclose>Close</button>
        </div>`;
      document.body.appendChild(el);
      el.addEventListener("click", (e) => { if (e.target.closest("[data-wclose]")) el.classList.remove("on"); });
    }
    requestAnimationFrame(() => el.classList.add("on"));
  }

  async function ensureChain(eth) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: C.chain.hex }] });
    } catch (err) {
      if (err.code !== 4902) throw err;
      await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: C.chain.hex, chainName: C.chain.name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [C.chain.rpc, C.chain.rpcFallback].filter(Boolean), blockExplorerUrls: [C.chain.explorer] }] });
    }
  }

  async function connect({ quiet = false } = {}) {
    const eth = window.ethereum;
    if (!eth) {
      if (mobile()) sheet(); else toast("No wallet found — install MetaMask or Rabby");
      return null;
    }
    try {
      const [a] = await eth.request({ method: "eth_requestAccounts" });
      await ensureChain(eth);
      address = a.toLowerCase(); emit();
      if (!quiet) toast("Connected to " + C.chain.name);
      return address;
    } catch (e) {
      if (!quiet) toast(e.code === 4001 ? "Connection cancelled" : "Could not connect the wallet");
      return null;
    }
  }

  window.ethereum?.on?.("accountsChanged", (acc) => { address = acc[0]?.toLowerCase() || null; emit(); });
  // reflect an already-authorised wallet without prompting
  window.ethereum?.request?.({ method: "eth_accounts" }).then((acc) => { if (acc?.[0]) { address = acc[0].toLowerCase(); emit(); } }).catch(() => {});

  window.OrvynWallet = {
    connect, ensureChain, short,
    get address() { return address; },
    disconnect() { address = null; emit(); },
    onChange(f) { subs.add(f); f(address); return () => subs.delete(f); },
  };
})();
