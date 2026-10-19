// Put the $ORVYN contract on the site once the owner has launched it on Pons (PONSLAUNCHER):
//   node tools/set-ca.mjs 0x…   [--force]
// Checks on chain first (a contract, launched by the Pons v2 factory, symbol ORVYN), then writes public/config.js (ca).
// The board (/_board/) picks the CA up from config.js by itself. If ./deploy.sh exists, it ships the config and reads it back.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const ROOT = new URL('..', import.meta.url).pathname
const CA = process.argv[2], WANT = 'ORVYN', FACTORY = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
if (!/^0x[0-9a-fA-F]{40}$/.test(CA || '')) { console.log('usage: node tools/set-ca.mjs 0x… (42 characters) [--force]'); process.exit(2) }
async function rpc (method, params) {
  for (const u of ['https://robinhood-rpc.publicnode.com', 'https://robinhood.drpc.org']) {
    try { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); const j = await r.json(); if ('result' in j) return j.result } catch {}
  }
  throw new Error('RPC unreachable')
}
const code = await rpc('eth_getCode', [CA, 'latest'])
if (!code || code === '0x') { console.log('✗ not a contract on Robinhood Chain (a wallet, or a typo) — nothing changed'); process.exit(1) }
const str = hex => { try { const b = Buffer.from(hex.slice(2), 'hex'); const len = Number(BigInt('0x' + b.subarray(32, 64).toString('hex'))); return b.subarray(64, 64 + len).toString('utf8') } catch { return '?' } }
const sym = str(await rpc('eth_call', [{ to: CA, data: '0x95d89b41' }, 'latest']).catch(() => '0x'))
const name = str(await rpc('eth_call', [{ to: CA, data: '0x06fdde03' }, 'latest']).catch(() => '0x'))
// getLaunchedToken(token).exists — the last word of the returned struct (same check as the other Pons projects)
const lt = await rpc('eth_call', [{ to: FACTORY, data: '0x3cf28b5a' + CA.slice(2).toLowerCase().padStart(64, '0') }, 'latest']).catch(() => '0x')
const isPons = !!lt && lt.length >= 2 + 64 * 15 && BigInt('0x' + lt.slice(2 + 14 * 64, 2 + 15 * 64)) === 1n
console.log(`token: ${name} ($${sym}) · launched by Pons v2: ${isPons ? 'yes' : 'NO'}`)
if (!isPons) { console.log('✗ not a Pons v2 token — nothing changed'); process.exit(1) }
if (sym.replace(/^\$+/, '').toUpperCase() !== WANT && !process.argv.includes('--force')) { console.log(`✗ on-chain ticker is "${sym}", not ${WANT} — nothing changed (add --force if that is right)`); process.exit(1) }
const file = ROOT + 'public/config.js', before = readFileSync(file, 'utf8')
const next = before.replace(/^(\s*ca:\s*)"[^"]*"/m, `$1"${CA}"`)
if (next === before && !before.includes(CA)) { console.log('✗ could not find the ca field in public/config.js'); process.exit(1) }
writeFileSync(file, next)
console.log(`✓ public/config.js: ca = ${CA} (chip, Buy and board update by themselves)`)
if (existsSync(ROOT + 'deploy.sh')) {
  console.log(execFileSync(ROOT + 'deploy.sh', ['config'], { encoding: 'utf8', cwd: ROOT }).trim())
  const live = execFileSync('curl', ['-s', '-m', '20', 'https://orvyn.life/config.js'], { encoding: 'utf8' })
  console.log(live.includes(CA) ? '✓ LIVE: orvyn.life/config.js carries the CA' : '⚠ the live config.js does not show the CA yet')
} else console.log('(site not deployed yet — config.js updated locally only)')
