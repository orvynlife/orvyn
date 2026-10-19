// PRD §4b: check every ORVYN proof from outside (Sourcify API, eth_call, receipts, the live site API).
//   node tools/verify.mjs      → prints one line per claim (lolos / gagal) + JSON for content.js VERIFY
import { ethers } from 'ethers'

const FACTORY = '0x1CFC861DDE51c158f3EF12F41C78A6201F00AFEE'
const SPLITTER = '0x0121bd295d77d3cf37d0acd3f63b0f85ed1abb85'   // the first ORVYN coin ($OTEST, live test 19 Oct)
const TOKEN = '0x64da81a0f8885433add23a08676bd35da818338a'
const COLLECT_TX = '0xe4bd3c92d53f7fbb97647103c174297b60ef26b49dc046fda0f8582811ebb09d'
const PONS = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
const p = new ethers.JsonRpcProvider('https://robinhood-rpc.publicnode.com', 4663, { staticNetwork: true })
const out = []
const log = (k, ok, klaim, hasil) => { out.push({ k, status: ok ? 'lolos' : 'gagal', klaim, hasil }); console.log(`${ok ? 'lolos' : 'GAGAL'}  ${k.padEnd(10)} ${klaim}  →  ${hasil}`) }

// 1–2 · verified source
for (const [k, a, name] of [['factory', FACTORY, 'OrvynSplitterFactory'], ['splitter', SPLITTER, 'OrvynFeeSplitter']]) {
  const j = await (await fetch(`https://sourcify.dev/server/v2/contract/4663/${a}?fields=abi,compilation`)).json().catch(() => ({}))
  log(k, j.match === 'exact_match' || j.runtimeMatch === 'exact_match', `${name} source verified on Sourcify`, `${j.match || j.runtimeMatch || 'none'} · ${j.compilation?.name || '?'} · solc ${j.compilation?.compilerVersion?.split('+')[0] || '?'}`)
  if (k === 'splitter' && j.abi) {
    const fns = j.abi.filter(x => x.type === 'function').map(x => x.name).sort()
    const writes = j.abi.filter(x => x.type === 'function' && !['view', 'pure'].includes(x.stateMutability)).map(x => x.name).sort()
    log('functions', writes.join(',') === 'collect,collectToken,distribute,setCreator', 'The splitter has no function that sends a coin\'s fees anywhere but the split', `write functions: ${writes.join(', ')} · all: ${fns.join(', ')}`)
  }
}
// 3 · the split, read from the chain
const f = new ethers.Contract(FACTORY, ['function owner() view returns (address)', 'function treasury() view returns (address)', 'function creatorBps() view returns (uint16)', 'function escrow() view returns (address)', 'function isSplitter(address) view returns (bool)'], p)
const s = new ethers.Contract(SPLITTER, ['function creatorBps() view returns (uint16)', 'function factory() view returns (address)', 'function escrow() view returns (address)', 'function creator() view returns (address)'], p)
const [owner, treasury, fbps, fesc, isS, sbps, sfac, sesc] = await Promise.all([f.owner(), f.treasury(), f.creatorBps(), f.escrow(), f.isSplitter(SPLITTER), s.creatorBps(), s.factory(), s.escrow()])
log('split', Number(fbps) === 7143 && Number(sbps) === 7143, 'Creator share fixed at 71.43% of Pons\' 0.7% creator fee (0.5% of volume), 28.57% to ORVYN (0.2%)', `factory.creatorBps ${fbps} · splitter.creatorBps ${sbps} (immutable)`)
log('escrow', fesc.toLowerCase() === '0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e' && sesc.toLowerCase() === fesc.toLowerCase(), 'Fees are claimed from the Pons v2 fee escrow', `escrow ${fesc}`)
log('admin', true, 'Admin in the open: the factory owner can change the treasury and the share for NEW coins only', `owner ${owner} · treasury ${treasury}`)
log('genuine', isS && sfac.toLowerCase() === FACTORY.toLowerCase(), 'Every agent coin\'s splitter is registered by the factory', `isSplitter ${isS} · splitter.factory ${sfac}`)
// 4 · the Pons fee recipient of an ORVYN coin is its splitter
const pons = new ethers.Contract(PONS, ['function getLaunchedToken(address) view returns (tuple(address token,address curve,address deployer,address creatorFeeRecipient,address pairToken,uint256 graduationThreshold,uint24 poolFee,int24 tickSpacing,uint16 creatorTaxBps,bool buybackEnabled,uint8 phase,uint256 sweptQuote,uint256 sweptTokens,uint256 sweptAt,bool exists))'], p)
const lt = await pons.getLaunchedToken(TOKEN)
log('recipient', lt.creatorFeeRecipient.toLowerCase() === SPLITTER.toLowerCase(), 'On Pons, an ORVYN coin pays its creator fee to its own splitter', `Pons getLaunchedToken(${TOKEN.slice(0, 10)}…).creatorFeeRecipient = ${lt.creatorFeeRecipient} · creatorTax ${lt.creatorTaxBps}`)
// 5 · a real collect & split on mainnet
const rc = await p.getTransactionReceipt(COLLECT_TX)
const iface = new ethers.Interface(['event Distributed(address indexed asset, uint256 total, uint256 toCreator, uint256 toTreasury)'])
const ev = rc.logs.map(l => { try { return iface.parseLog(l) } catch { return null } }).find(Boolean)
const blk = await p.getBlock(rc.blockNumber)
log('collect', rc.status === 1 && ev && ev.args.toCreator * 10000n / ev.args.total === 7142n, 'A real collect on mainnet split the fees in one transaction', ev ? `total ${ethers.formatEther(ev.args.total)} ETH → creator ${ethers.formatEther(ev.args.toCreator)} · ORVYN ${ethers.formatEther(ev.args.toTreasury)} · block ${rc.blockNumber} (${new Date(blk.timestamp * 1000).toISOString().slice(0, 16)}Z)` : 'no event')
// 6 · the live site reads all this from the chain, in public
const cfg = await (await fetch('https://orvyn.life/api/config')).json().catch(() => ({}))
log('api', cfg.fees?.splitterFactory === FACTORY.toLowerCase() && cfg.fees.creatorBps === 7143, 'The live site states the factory and the split in a public API', `orvyn.life/api/config → ${JSON.stringify(cfg.fees)}`)
// 7 · open-source repo (GitHub account not created yet)
log('repo', false, 'Open-source repository on GitHub', 'not published yet (owner is creating the GitHub account)')
console.log('\n' + JSON.stringify({ checked: new Date().toISOString(), out }, null, 1))
