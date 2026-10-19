// Read Blockscout's API through a real browser (curl gets the Cloudflare challenge).
//   node tools/bs-api.mjs /api/v2/addresses/0x…  [more paths]
import os from 'node:os'
import puppeteer from 'puppeteer-core'
const CHROME = process.env.CHROME || `${os.homedir()}/.cache/puppeteer/chrome/mac_arm-151.0.7922.71/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--user-data-dir=/tmp/orvyn-bs'] })
const pg = await b.newPage()
await pg.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36')
await pg.goto('https://robinhoodchain.blockscout.com/', { waitUntil: 'networkidle2', timeout: 60000 })
// long fields (bytecode, source, abi) are cut so the answer stays readable
const get = u => pg.evaluate(async u => {
  const r = await fetch(u), t = await r.text()
  try { return [r.status, JSON.stringify(JSON.parse(t), (k, v) => typeof v === 'string' && v.length > 200 ? v.slice(0, 60) + '…' : Array.isArray(v) && v.length > 20 ? `[${v.length} items]` : v, 1)] } catch { return [r.status, t.slice(0, 2000)] }
}, u)
for (const u of process.argv.slice(2)) { const [s, t] = await get(u); console.log('==', u, s); console.log(t) }
await b.close()
