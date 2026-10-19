// ORVYN — edit brand, CA and socials here only.
window.ORVYN = {
  name: "ORVYN",
  ticker: "$ORVYN",
  ca: "COMINGSOON",            // paste the full contract address after launch
  buyUrl: "https://ponsfamily.com/launchpad/{CA}",
  chartUrl: "https://dexscreener.com/robinhood/{CA}",
  x: "https://x.com/orvynlife",
  chain: {
    id: 4663, hex: "0x1237", name: "Robinhood Chain",
    rpc: "https://robinhood-rpc.publicnode.com",      // first: the official RPC is intercepted on some Indonesian ISPs
    rpcFallback: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
  },
  feeSplitterFactory: "0x1CFC861DDE51c158f3EF12F41C78A6201F00AFEE", // verified on Sourcify (exact match)
  showExamples: true,          // example agents carry an EXAMPLE badge; set false once real agents exist
};
