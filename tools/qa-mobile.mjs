// PRD §1.3 phone checks on the running site: no sideways scroll, CA chip visible without scrolling (placeholder AND a
// full 42-character address), X link reachable, console clean, small tap targets listed. Screenshots → media/qa/.
//   node tools/qa-mobile.mjs            (BASE=https://orvyn.life to check the live site)
import fs from 'node:fs'
import os from 'node:os'
import puppeteer from 'puppeteer-core'
const CHROME = process.env.CHROME || `${os.homedir()}/.cache/puppeteer/chrome/mac_arm-151.0.7922.71/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`
const BASE = process.env.BASE || 'http://127.0.0.1:9170'
const OUT = new URL('../media/qa/', import.meta.url).pathname
const FAKE_CA = '0x1234567890abcdef1234567890abcdef12345678'
fs.mkdirSync(OUT, { recursive: true })
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--user-data-dir=/tmp/orvyn-qa-' + process.pid] })
let bad = 0
const PAGES = [['home', '/'], ['app', '/app'], ['terms', '/terms'], ['404', '/nothing-here']]
for (const withCa of [false, true]) for (const [name, url] of PAGES) for (const [w, dpr] of [[360, 3], [390, 3], [414, 2], [768, 2], [1440, 1]]) {
  if (withCa && !['home', 'app'].includes(name)) continue
  const p = await b.newPage(), errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push(m.text()) })
  if (withCa) {
    await p.setRequestInterception(true)
    p.on('request', async r => {
      if (!r.url().endsWith('/config.js')) return r.continue()
      const src = await (await fetch(r.url())).text()
      r.respond({ status: 200, contentType: 'application/javascript', body: src.replace(/ca: "[^"]*"/, `ca: "${FAKE_CA}"`) })
    })
  }
  await p.setViewport({ width: w, height: w < 600 ? 780 : 1000, deviceScaleFactor: dpr, isMobile: w < 600, hasTouch: w < 600 })
  await p.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await new Promise(r => setTimeout(r, name === 'home' ? 4500 : 2500))
  const r = await p.evaluate(() => {
    const vis = e => e && getComputedStyle(e).display !== 'none' && !e.hidden && e.getBoundingClientRect().width > 0
    const ca = [...document.querySelectorAll('.h-top .ca-chip, .tb-ca, .ca-strip')].find(vis)
    const cr = ca?.getBoundingClientRect()
    const xs = [...document.querySelectorAll('[data-x], a[href*="x.com/orvynlife"]')].filter(vis)
    const small = [...document.querySelectorAll('a, button')].filter(vis).filter(e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 && (r.width < 32 || r.height < 32) }).map(e => (e.className || e.textContent.trim().slice(0, 14) || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + '×' + Math.round(e.getBoundingClientRect().height))
    const fs = [...document.querySelectorAll('p, li, td')].filter(vis).map(e => parseFloat(getComputedStyle(e).fontSize)).filter(Boolean)
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      caVisible: !ca ? null : cr.top >= 0 && cr.bottom <= innerHeight && cr.right <= innerWidth + 1,
      caText: ca?.innerText.replace(/\s+/g, ' ').trim(), caFits: !ca || ca.querySelector('[data-ca-text]').scrollWidth <= ca.querySelector('[data-ca-text]').clientWidth + 1,
      x: xs.length > 0, minFont: fs.length ? Math.min(...fs) : 0, small: [...new Set(small)].slice(0, 5),
      inputs16: [...document.querySelectorAll('input, textarea')].filter(vis).every(i => parseFloat(getComputedStyle(i).fontSize) >= 16 || innerWidth > 600),
    }
  })
  const tag = `${name}${withCa ? '-ca' : ''}-${w}`
  await p.screenshot({ path: `${OUT}${tag}.png` })
  const needCa = ['home', 'app'].includes(name)
  const fail = r.overflow || (needCa && (!r.caVisible || !r.caFits)) || (withCa && needCa && !r.caText?.includes(FAKE_CA)) || errs.length || !r.inputs16
  if (fail) bad++
  console.log(`${fail ? 'FAIL' : 'ok  '} ${tag.padEnd(14)}@${dpr}x overflow:${r.overflow} ca:${r.caVisible} fits:${r.caFits} "${r.caText || ''}" x:${r.x} minFont:${r.minFont} in16:${r.inputs16}${r.small.length ? '  small: ' + r.small.join(', ') : ''}${errs.length ? '  ERR ' + errs.slice(0, 2).join(' | ') : ''}`)
  await p.close()
}
await b.close(); process.exit(bad ? 1 : 0)
