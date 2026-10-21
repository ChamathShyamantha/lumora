// Regenerates website/effects.json from the built-in effect files.
// Usage: node scripts/build-site-catalog.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'resources', 'effects')
const meta = (html, key) => (new RegExp(`<meta\\s+${key}="([^"]*)"`, 'i').exec(html) || [])[1] || ''

const list = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.html'))
  .map((f) => {
    const html = fs.readFileSync(path.join(dir, f), 'utf8')
    const title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1].trim()
    return {
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      description: meta(html, 'description'),
      category: meta(html, 'category'),
      energy: meta(html, 'energy'),
      palette: meta(html, 'palette'),
      music: /engine\.audio/.test(html),
      screen: /engine\.zone/.test(html)
    }
  })
  .sort((a, b) => a.title.localeCompare(b.title))

fs.writeFileSync(path.join(root, 'website', 'effects.json'), JSON.stringify(list, null, 1) + '\n')
const counts = {}
for (const e of list) counts[e.category] = (counts[e.category] || 0) + 1
console.log(`${list.length} effects`, counts)
