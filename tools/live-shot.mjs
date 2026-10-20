// Screenshot of the live site's lists and one agent page (for a quick visual check).
//   node tools/live-shot.mjs [agentId]   → media/qa/live-*.png
import os from 'node:os'
import puppeteer from 'puppeteer-core'
const CHROME = process.env.CHROME || `${os.homedir()}/.cache/puppeteer/chrome/mac_arm-151.0.7922.71/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const OUT = new URL('../media/qa/', import.meta.url).pathname, id = process.argv[2]
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--user-data-dir=/tmp/orvyn-live-' + process.pid] })
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
await p.goto('https://orvyn.life/app', { waitUntil: 'networkidle0', timeout: 60000 }); await new Promise(r => setTimeout(r, 2500))
await p.$eval('#trending', e => e.scrollIntoView({ block: 'start' })); await p.evaluate(() => scrollBy(0, -80)); await new Promise(r => setTimeout(r, 1200))
await p.screenshot({ path: OUT + 'live-trending.png' })
if (id) { await p.goto('https://orvyn.life/agent/' + id, { waitUntil: 'networkidle0', timeout: 60000 }); await new Promise(r => setTimeout(r, 2500)); await p.screenshot({ path: OUT + 'live-agent.png' }) }
await b.close()
