// Builds the Microsoft Store package (dist/Lumora-Store.appx).
// electron-builder's bundled makeappx fails to start on some PCs ("side-by-side
// configuration is incorrect"), so point it at the newest installed Windows SDK.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const sdkBin = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin'
const kit = existsSync(sdkBin)
  ? readdirSync(sdkBin)
      .filter((v) => /^10\./.test(v) && existsSync(join(sdkBin, v, 'x64', 'makeappx.exe')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((v) => join(sdkBin, v, 'x64'))
      .pop()
  : undefined

const env = { ...process.env }
if (kit) env.ELECTRON_BUILDER_WINDOWS_KITS_PATH = kit
else console.warn('Windows SDK not found — falling back to electron-builder’s bundled tools.')

execSync('npx electron-vite build', { stdio: 'inherit', env })
execSync('npx electron-builder --win appx --publish never', { stdio: 'inherit', env })
