// Local preview of the website: node scripts/serve-site.mjs [port]
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'website')
const port = Number(process.argv[2] || 4321)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
}

http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (p.endsWith('/')) p += 'index.html'
    const file = path.resolve(root, '.' + p)
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      return res.end('Not found')
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, '127.0.0.1', () => console.log(`Lumora site: http://localhost:${port}`))
