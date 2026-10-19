# ORVYN

**Give an idea a mind.** ORVYN is a launchpad for autonomous agent coins on Robinhood Chain: describe an agent in one sentence, give it a face and a coin on [Pons](https://ponsfamily.com), and talk to it.

Live at **[orvyn.life](https://orvyn.life)** · [@orvynlife](https://x.com/orvynlife)

## Fees — fixed on chain

Every trade of an agent coin pays Pons' 1% trading fee:

| Share | Goes to |
|---|---|
| 0.3% | Pons |
| **0.5%** | **the agent's creator**, forever |
| 0.2% | ORVYN (pays for the agents' AI and runs the platform) |

The creator's 0.7% Pons fee is paid into a `OrvynFeeSplitter` created for that one coin. Anyone can call `collect()`; the contract sweeps the curve, claims the Pons fee escrow and pays out 71.43% / 28.57%. The split is fixed when the coin launches. No function exists to move a coin's fees anywhere else — only the creator can change the wallet that receives their share.

| Contract | Address (Robinhood Chain, 4663) |
|---|---|
| `OrvynSplitterFactory` | [`0x1CFC861DDE51c158f3EF12F41C78A6201F00AFEE`](https://sourcify.dev/#/lookup/0x1CFC861DDE51c158f3EF12F41C78A6201F00AFEE) — verified, exact match |
| Pons v2 fee escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` |

## Repository

```
contracts/   Foundry: OrvynFeeSplitter, OrvynSplitterFactory, unit + Pons fork tests, deploy script
src/         Node server (no framework): agents store, launch verification, market data, AI, admin API
public/      Site: hero (Three.js glass orb), launchpad app, agent pages, legal pages
tools/       Screenshots, end-to-end tests (fork and live), social card and logo renders
data/        agents.example.json — the example agents a fresh install starts with
```

### Run locally

```bash
npm install
npm run serve            # http://localhost:9170
```

AI features stay off until keys are set in the environment (`OPENROUTER_API_KEY`, `MESHY_API_KEY`); see `src/ai.mjs`. Launch verification requires `SPLITTER_FACTORY`.

### Contracts

```bash
cd contracts
forge install foundry-rs/forge-std --no-git
forge test                                   # unit tests + fork tests against the live Pons contracts
```

### End-to-end on a fork (no real funds)

```bash
node tools/fork-e2e.mjs   # anvil fork → deploy factory → create agent → launch → trade → collect & split
```

## Security

Found a problem with the contracts or the site? Message [@orvynlife](https://x.com/orvynlife) on X before disclosing it publicly.

## License

Contracts in `contracts/src` are MIT (see the SPDX headers). Everything else — site, server, artwork, the ORVYN name and the Orvy character — © ORVYN, all rights reserved.
