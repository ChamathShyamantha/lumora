// Draws the Lumora app icon (glowing hue ring) and writes build/icon.png +
// website/assets/icon.png. No image libraries needed.
// Usage: node scripts/make-icon.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function hsv(h, s, v) {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6]
}

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const c = size / 2
  const ss = 3 // supersampling
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const dx = (x + (sx + 0.5) / ss - c) / c
          const dy = (y + (sy + 0.5) / ss - c) / c
          const d = Math.sqrt(dx * dx + dy * dy)
          const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1.25) % 1
          const [cr, cg, cb] = hsv(hue, 0.82, 1)
          // rounded-square dark tile
          const q = Math.max(Math.abs(dx), Math.abs(dy))
          const corner = Math.hypot(Math.max(Math.abs(dx) - 0.62, 0), Math.max(Math.abs(dy) - 0.62, 0))
          const inTile = q < 0.62 || corner < 0.32
          let pr = 0, pg = 0, pb = 0, pa = 0
          if (inTile) {
            pr = 14; pg = 15; pb = 24; pa = 1
          }
          // glow + ring
          const ring = Math.exp(-Math.pow((d - 0.56) / 0.07, 2))
          const glow = Math.exp(-Math.pow((d - 0.56) / 0.22, 2)) * 0.55
          const k = Math.min(1, ring + glow)
          if (inTile) {
            pr = pr * (1 - k) + cr * 255 * k
            pg = pg * (1 - k) + cg * 255 * k
            pb = pb * (1 - k) + cb * 255 * k
            // soft white core highlight on the ring
            const hot = ring * 0.35
            pr += (255 - pr) * hot; pg += (255 - pg) * hot; pb += (255 - pb) * hot
          }
          r += pr; g += pg; b += pb; a += pa
        }
      }
      const n = ss * ss
      const i = (y * size + x) * 4
      px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; px[i + 3] = (a / n) * 255
    }
  }
  return px
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const icon512 = png(512, render(512))
fs.mkdirSync(path.join(root, 'build'), { recursive: true })
fs.writeFileSync(path.join(root, 'build', 'icon.png'), icon512)
fs.mkdirSync(path.join(root, 'website', 'assets'), { recursive: true })
fs.writeFileSync(path.join(root, 'website', 'assets', 'icon.png'), png(192, render(192)))
fs.writeFileSync(path.join(root, 'website', 'favicon.png'), png(48, render(48)))
console.log('icons written')
