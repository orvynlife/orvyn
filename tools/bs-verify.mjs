// Verify ORVYN contracts on Blockscout too (they are exact matches on Sourcify already), through a real browser
// because the explorer sits behind Cloudflare. Standard JSON input comes from forge (--show-standard-json-input).
//   node tools/bs-verify.mjs <address> <contract name> <standard-input.json>
import fs from 'node:fs'
import os from 'node:os'
import puppeteer from 'puppeteer-core'
const CHROME = process.env.CHROME || `${os.homedir()}/.cache/puppeteer/chrome/mac_arm-151.0.7922.71/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const [addr, name, file] = process.argv.slice(2)
const input = fs.readFileSync(file, 'utf8')
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--user-data-dir=/tmp/orvyn-bs'] })
const pg = await b.newPage()
await pg.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36')
await pg.goto('https://robinhoodchain.blockscout.com/', { waitUntil: 'networkidle2', timeout: 60000 })
const out = await pg.evaluate(async (addr, name, input) => {
  const fd = new FormData()
  fd.append('compiler_version', 'v0.8.26+commit.8a97fa7a')
  fd.append('contract_name', name)
  fd.append('autodetect_constructor_args', 'true')
  fd.append('license_type', 'mit')
  fd.append('files[0]', new Blob([input], { type: 'application/json' }), 'input.json')
  const r = await fetch(`/api/v2/smart-contracts/${addr}/verification/via/standard-input`, { method: 'POST', body: fd })
  return r.status + ' ' + (await r.text()).slice(0, 500)
}, addr, name, input)
console.log(out)
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 5000))
  const v = await pg.evaluate(async a => { const r = await fetch(`/api/v2/smart-contracts/${a}`); const j = await r.json(); return { verified: j.is_verified, full: j.is_fully_verified, name: j.name } }, addr)
  console.log(JSON.stringify(v)); if (v.verified) break
}
await b.close()
