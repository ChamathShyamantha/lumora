// Renders a preview image of every built-in effect for the website, using the
// app's real effect bootstrap in headless Edge/Chrome.
// Usage: node scripts/render-previews.mjs [slug ...]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const effectsDir = path.join(root, 'resources', 'effects')
const outDir = path.join(root, 'website', 'assets', 'effects')
const bootstrap = fs.readFileSync(path.join(root, 'src', 'renderer', 'src', 'engine', 'bootstrap.js'), 'utf8')
const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => fs.existsSync(p))
if (!browser) throw new Error('Edge or Chrome is required')

const only = process.argv.slice(2)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lumora-previews-'))
fs.mkdirSync(outDir, { recursive: true })

const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]))
function defaults(html) {
  const props = {}
  for (const m of html.matchAll(/<meta\s+property=[^>]*>/gi)) {
    const a = attrs(m[0])
    const d = a.default ?? ''
    props[a.property] =
      a.type === 'number' || a.type === 'hue' ? Number(d) : a.type === 'boolean' ? d === '1' || d === 'true' : d
  }
  return props
}

// Simulated music and screen input so reactive effects show their real look.
const fakeInputs = `<script>
(function(){
  var t0 = performance.now(), lastBeat = 0;
  setInterval(function(){
    var t = (performance.now() - t0) / 1000, phase = (t % 0.5) / 0.5, kick = Math.exp(-phase * 7);
    var beat = t - lastBeat >= 0.5; if (beat) lastBeat = t - (t % 0.5);
    var freq = []; for (var i = 0; i < 64; i++) { var u = i / 64; freq.push(Math.min(1, 0.55 * Math.exp(-u * 2.2) * (0.5 + kick) + 0.25 * (0.5 + 0.5 * Math.sin(t * 6 + i * 0.7)) * u)); }
    window.postMessage({ __lumora: 1, type: 'audio', active: true, level: 0.5 + kick * 0.3, bass: 0.25 + kick * 0.7, mid: 0.4, treble: 0.3, density: 0.4, width: 0.4, freq: freq, beat: beat }, '*');
    var hue = [], sat = [], lit = [];
    for (var z = 0; z < 560; z++) { var x = z % 28, y = Math.floor(z / 28); hue.push(Math.round((x * 9 + y * 4 + t * 20) % 360)); sat.push(70); lit.push(30 + Math.round(20 * Math.sin(x / 4 + t))); }
    window.postMessage({ __lumora: 1, type: 'zone', active: true, hue: hue, saturation: sat, lightness: lit }, '*');
  }, 33);
})();
</script>`

const files = fs.readdirSync(effectsDir).filter((f) => f.endsWith('.html'))
let done = 0
for (const file of files) {
  const html = fs.readFileSync(path.join(effectsDir, file), 'utf8')
  const title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1].trim()
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (only.length && !only.includes(slug)) continue
  const init = JSON.stringify({ props: defaults(html), fps: 60, captureEvery: 1000000 }).replace(/</g, '\\u003c')
  const page =
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style>` +
    `<script>window.__LUMORA_INIT__=${init};</script><script>${bootstrap}</script>${fakeInputs}` +
    html
  const pagePath = path.join(work, `${slug}.html`)
  fs.writeFileSync(pagePath, page)
  const png = path.join(outDir, `${slug}.png`)
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    // Throwaway profile: never touch (or get auto-signed into) a real browser profile.
    `--user-data-dir=${path.join(work, 'profile')}`,
    '--no-first-run',
    '--window-size=320,200',
    '--virtual-time-budget=4000',
    `--screenshot=${png}`,
    pathToFileURL(pagePath).href
  ], { stdio: 'ignore', timeout: 60000 })
  done++
  process.stdout.write(`\r${done} rendered`)
}
fs.rmSync(work, { recursive: true, force: true })
console.log(`\nPreviews written to ${outDir}`)
