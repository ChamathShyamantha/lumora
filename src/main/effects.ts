import { app, dialog, shell, BrowserWindow } from 'electron'
import { promises as fs, watch, existsSync, mkdirSync, type FSWatcher } from 'node:fs'
import { join, basename, extname } from 'node:path'

export interface EffectFile {
  id: string
  source: 'builtin' | 'user'
  file: string
  html: string
  mtime: number
}

export function builtinDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'effects')
    : join(app.getAppPath(), 'resources', 'effects')
}

export function userDir(): string {
  const dir = join(app.getPath('userData'), 'effects')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Resolve an effect id ("builtin/x.html" | "user/x.html") to a path, refusing traversal. */
function resolveId(id: string): { source: 'builtin' | 'user'; path: string } {
  const [source, ...rest] = id.split('/')
  const file = rest.join('/')
  if ((source !== 'builtin' && source !== 'user') || file !== basename(file) || extname(file).toLowerCase() !== '.html') {
    throw new Error(`Invalid effect id: ${id}`)
  }
  return { source, path: join(source === 'builtin' ? builtinDir() : userDir(), file) }
}

async function readDir(dir: string, source: 'builtin' | 'user'): Promise<EffectFile[]> {
  let names: string[] = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: EffectFile[] = []
  for (const file of names) {
    if (extname(file).toLowerCase() !== '.html') continue
    const path = join(dir, file)
    try {
      const [html, stat] = await Promise.all([fs.readFile(path, 'utf8'), fs.stat(path)])
      out.push({ id: `${source}/${file}`, source, file, html, mtime: stat.mtimeMs })
    } catch {
      // unreadable file: skip
    }
  }
  return out
}

export async function listEffects(): Promise<EffectFile[]> {
  const [builtin, user] = await Promise.all([readDir(builtinDir(), 'builtin'), readDir(userDir(), 'user')])
  return [...builtin, ...user]
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80)
  return cleaned || 'Untitled Effect'
}

async function uniquePath(dir: string, base: string): Promise<string> {
  let candidate = join(dir, `${base}.html`)
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${base} ${i}.html`)
  return candidate
}

/** Save a user effect. Overwrites when `id` is an existing user effect, else creates a new file. */
export async function saveEffect(name: string, html: string, id?: string): Promise<string> {
  if (id) {
    const target = resolveId(id)
    if (target.source === 'user') {
      await fs.writeFile(target.path, html, 'utf8')
      return id
    }
  }
  const path = await uniquePath(userDir(), safeFileName(name))
  await fs.writeFile(path, html, 'utf8')
  return `user/${basename(path)}`
}

export async function deleteEffect(id: string): Promise<void> {
  const target = resolveId(id)
  if (target.source !== 'user') throw new Error('Built-in effects cannot be deleted')
  await shell.trashItem(target.path)
}

export async function importEffects(win: BrowserWindow): Promise<string[]> {
  const res = await dialog.showOpenDialog(win, {
    title: 'Import effects',
    filters: [{ name: 'Effect', extensions: ['html'] }],
    properties: ['openFile', 'multiSelections']
  })
  const ids: string[] = []
  for (const src of res.filePaths) {
    const html = await fs.readFile(src, 'utf8')
    const dest = await uniquePath(userDir(), safeFileName(basename(src, extname(src))))
    await fs.writeFile(dest, html, 'utf8')
    ids.push(`user/${basename(dest)}`)
  }
  return ids
}

export async function exportEffect(win: BrowserWindow, name: string, html: string): Promise<boolean> {
  const res = await dialog.showSaveDialog(win, {
    title: 'Export effect',
    defaultPath: `${safeFileName(name)}.html`,
    filters: [{ name: 'Effect', extensions: ['html'] }]
  })
  if (res.canceled || !res.filePath) return false
  await fs.writeFile(res.filePath, html, 'utf8')
  return true
}

export function openUserFolder(): void {
  void shell.openPath(userDir())
}

/** Notify the renderer when files in the user effects folder change (e.g. edited in VS Code). */
export function watchUserEffects(onChange: () => void): FSWatcher | undefined {
  let timer: NodeJS.Timeout | undefined
  try {
    return watch(userDir(), () => {
      clearTimeout(timer)
      timer = setTimeout(onChange, 250)
    })
  } catch {
    return undefined
  }
}
