import { app, BrowserWindow, ipcMain, protocol, session, desktopCapturer, Tray, Menu, nativeImage, shell, Notification, powerMonitor } from 'electron'
import { join } from 'node:path'
import { appendFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import {
  listEffects,
  saveEffect,
  deleteEffect,
  importEffects,
  exportEffect,
  openUserFolder,
  watchUserEffects
} from './effects'
import { OpenRgbManager } from './openrgb'
import { ConflictWatcher, type RunningConflict } from './conflicts'
import { initUpdater, checkForUpdates, installUpdate, updateStatus } from './updater'
import { aiStatus, setKey, clearKey, generate, cancel, listModels, type AiRequest, type AiConnection } from './ai'

const EFFECT_SCHEME = 'lumora-effect'

// Crash/diagnostic log in the app data folder (lumora.log).
function logLine(...parts: unknown[]): void {
  try {
    const line = `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? p.stack ?? p.message : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`
    appendFileSync(join(app.getPath('userData'), 'lumora.log'), line)
  } catch {
    /* logging must never throw */
  }
}
process.on('uncaughtException', (err) => logLine('uncaughtException', err))
process.on('unhandledRejection', (err) => logLine('unhandledRejection', err))
app.on('render-process-gone', (_e, _wc, details) => logLine('render-process-gone', details))
app.on('child-process-gone', (_e, details) => logLine('child-process-gone', details))
app.on('will-quit', () => logLine('will-quit'))
process.on('exit', (code) => logLine('process exit', code))

// Opt-in local DevTools port for automated UI testing (never enabled by default).
if (process.env['LUMORA_DEBUG_PORT']) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env['LUMORA_DEBUG_PORT'])
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
}

// Effects run from a dedicated scheme so they get their own strict CSP
// (no network, no access to the app) independent of the app's own policy.
protocol.registerSchemesAsPrivileged([
  { scheme: EFFECT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: false } }
])

const EFFECT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:'
].join('; ')

/** Effect documents staged by the renderer, keyed by slot ("main", "editor", "thumb", ...). */
const stagedDocs = new Map<string, string>()

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let closeToTray = true
let quitting = false
let selectedScreenId: string | null = null
const openrgb = new OpenRgbManager()
let ignoredConflicts = new Set<string>()
let conflictsStarted = false
/** Power behaviour, configured from the renderer's settings. */
let power = { offOnSleep: true, offOnLock: false, offOnExit: true }
const darkReasons = new Set<string>()
const startHidden = process.argv.includes('--hidden')

/** Lights off while the PC sleeps / is locked; back on when it returns. */
function setDark(reason: string, dark: boolean): void {
  const wasDark = darkReasons.size > 0
  if (dark) darkReasons.add(reason)
  else darkReasons.delete(reason)
  const isDark = darkReasons.size > 0
  if (isDark) openrgb.blackout()
  openrgb.setPaused(isDark)
  if (isDark !== wasDark) {
    logLine('lights', isDark ? `off (${[...darkReasons].join(', ')})` : 'on')
    send('power:state', { dark: isDark })
  }
}
const conflicts = new ConflictWatcher((running, newlyFound) => {
  send('conflicts:changed', running)
  notifyConflicts(newlyFound.filter((c) => !ignoredConflicts.has(c.id)))
})

function notifyConflicts(found: RunningConflict[]): void {
  if (!found.length || !Notification.isSupported()) return
  const names = found.map((c) => c.name).join(', ')
  const n = new Notification({
    title: found.length === 1 ? 'Another RGB app is running' : 'Other RGB apps are running',
    body: `${names} may fight Lumora for your lights. Click to review.`,
    icon: makeIcon(64)
  })
  n.on('click', () => {
    showWindow()
    send('navigate', 'devices')
  })
  n.show()
}

/** Small hue-ring icon drawn in code so the app needs no binary assets. */
function makeIcon(size: number): Electron.NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c
      const dy = y - c
      const r = Math.sqrt(dx * dx + dy * dy) / c
      const i = (y * size + x) * 4
      if (r > 1) continue
      const hue = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1
      const [rr, gg, bb] = hsvToRgb(hue, 0.85, 1)
      const ring = r > 0.45 ? 1 : 0.15
      const edge = Math.min(1, (1 - r) * c)
      buf[i] = bb * ring
      buf[i + 1] = gg * ring
      buf[i + 2] = rr * ring
      buf[i + 3] = 255 * edge
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q]
  ][i % 6]
  return [r * 255, g * 255, b * 255]
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    // Started at login with --hidden: run the lights from the tray without showing the window.
    show: !startHidden,
    width: 1400,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0b0d12',
    title: 'Lumora',
    icon: makeIcon(64),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Lighting must keep animating while the window is hidden or minimised.
      backgroundThrottling: false
    }
  })

  mainWindow.on('close', (e) => {
    if (closeToTray && !quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // The main window only ever shows the app itself — block any other navigation.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!allowed) e.preventDefault()
  })

  // Open external links in the browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Scenes and lights state shown in the tray menu (sent by the renderer). */
let trayState: { scenes: { id: string; name: string }[]; lightsOff: boolean } = { scenes: [], lightsOff: false }

function buildTrayMenu(): void {
  if (!tray) return
  const sceneItems: Electron.MenuItemConstructorOptions[] = trayState.scenes.length
    ? trayState.scenes.map((s) => ({ label: s.name, click: () => send('tray:action', { type: 'scene', id: s.id }) }))
    : [{ label: 'No scenes yet', enabled: false }]
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Lumora', click: () => showWindow() },
      { type: 'separator' },
      {
        label: trayState.lightsOff ? 'Turn lights on' : 'Turn lights off',
        click: () => send('tray:action', { type: 'toggleLights' })
      },
      { label: 'Scenes', submenu: sceneItems },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
}

function createTray(): void {
  tray = new Tray(makeIcon(32))
  tray.setToolTip('Lumora')
  buildTrayMenu()
  tray.on('click', () => showWindow())
}

function showWindow(): void {
  if (!mainWindow) return createWindow()
  mainWindow.show()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

function send(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args)
}

function registerIpc(): void {
  ipcMain.handle('effects:list', () => listEffects())
  ipcMain.handle('effects:save', (_e, name: string, html: string, id?: string) => saveEffect(name, html, id))
  ipcMain.handle('effects:delete', (_e, id: string) => deleteEffect(id))
  ipcMain.handle('effects:import', () => (mainWindow ? importEffects(mainWindow) : []))
  ipcMain.handle('effects:export', (_e, name: string, html: string) =>
    mainWindow ? exportEffect(mainWindow, name, html) : false
  )
  ipcMain.handle('effects:openFolder', () => openUserFolder())

  ipcMain.handle('effect:stage', (_e, slot: string, html: string) => {
    if (!/^[a-z0-9-]{1,32}$/.test(slot)) throw new Error('bad slot')
    stagedDocs.set(slot, html)
    return `${EFFECT_SCHEME}://doc/${slot}?v=${Date.now()}`
  })

  ipcMain.handle('openrgb:connect', (_e, host: string, port: number) => openrgb.connect(host, port))
  ipcMain.handle('openrgb:disconnect', () => {
    openrgb.disconnect()
    send('openrgb:changed', openrgb.snapshot())
  })
  ipcMain.handle('openrgb:state', () => openrgb.snapshot())
  ipcMain.handle('openrgb:rescan', () => openrgb.refresh())
  ipcMain.on('openrgb:update', (_e, id: number, rgb: Uint8Array) => openrgb.update(id, rgb))

  ipcMain.handle('capture:screens', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })
  ipcMain.handle('capture:selectScreen', (_e, id: string | null) => {
    selectedScreenId = id
  })

  // Game Reactions: which programs are running (names only — never touches game processes).
  ipcMain.handle(
    'system:runningApps',
    () =>
      new Promise<string[]>((resolve) => {
        execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
          if (err) return resolve([])
          const names = new Set<string>()
          for (const line of stdout.split(/\r?\n/)) {
            const m = /^"([^"]+)"/.exec(line)
            if (m) names.add(m[1].toLowerCase())
          }
          resolve([...names])
        })
      })
  )
  // Full screenshot of the capture monitor, for drawing custom HUD regions.
  ipcMain.handle('capture:snapshot', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } })
    const source = sources.find((s) => s.id === selectedScreenId) ?? sources[0]
    return source ? source.thumbnail.toDataURL() : null
  })

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:status', () => updateStatus())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:install', () =>
    installUpdate(() => {
      quitting = true
      if (power.offOnExit) openrgb.blackout()
    })
  )
  ipcMain.handle('tray:update', (_e, state: typeof trayState) => {
    trayState = state
    buildTrayMenu()
  })
  ipcMain.handle('power:configure', (_e, cfg: typeof power) => {
    power = { ...power, ...cfg }
  })
  ipcMain.handle('app:getAutostart', () => {
    const s = app.getLoginItemSettings({ args: ['--hidden'] })
    return { supported: app.isPackaged, enabled: s.openAtLogin, minimized: s.openAtLogin && (s.launchItems?.some((i) => i.args?.includes('--hidden')) ?? true) }
  })
  ipcMain.handle('app:setAutostart', (_e, enabled: boolean, minimized: boolean) => {
    // Only meaningful for the installed app; in development it would register electron.exe.
    if (!app.isPackaged) return { supported: false, enabled: false, minimized }
    app.setLoginItemSettings({ openAtLogin: false, args: ['--hidden'] })
    app.setLoginItemSettings({ openAtLogin: false })
    app.setLoginItemSettings({ openAtLogin: enabled, args: minimized ? ['--hidden'] : [] })
    return { supported: true, enabled, minimized }
  })

  ipcMain.handle('app:setCloseToTray', (_e, value: boolean) => {
    closeToTray = value
  })
  ipcMain.handle('app:openExternal', (_e, url: string) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
  })

  ipcMain.handle('ai:status', () => aiStatus())
  ipcMain.handle('ai:setKey', (_e, conn: AiConnection, key: string) => setKey(conn, key))
  ipcMain.handle('ai:clearKey', (_e, provider: string) => clearKey(provider))
  ipcMain.handle('ai:listModels', (_e, conn: AiConnection) => listModels(conn))
  ipcMain.handle('ai:generate', (_e, req: AiRequest) => generate(req))
  ipcMain.handle('ai:cancel', (_e, id: string) => cancel(id))

  ipcMain.handle('conflicts:list', () => conflicts.running)
  ipcMain.handle('conflicts:recheck', () => conflicts.poll())
  ipcMain.handle('conflicts:close', (_e, id: string, elevated: boolean) => conflicts.close(id, elevated))
  ipcMain.handle('conflicts:configure', (_e, ignored: string[], extra: string[]) => {
    ignoredConflicts = new Set(ignored)
    conflicts.setExtra(extra)
    // Start watching only once the renderer has told us what to ignore.
    if (!conflictsStarted) {
      conflictsStarted = true
      conflicts.start()
    }
  })
  ipcMain.handle('system:openTaskManager', () => {
    execFile('taskmgr.exe', [], { windowsHide: false }, () => undefined)
  })

  openrgb.onChange((status, devices) => send('openrgb:changed', { status, devices }))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(() => {
    logLine('app ready', `electron ${process.versions.electron}`)
    app.setAppUserModelId('app.lumora')

    protocol.handle(EFFECT_SCHEME, (request) => {
      const slot = new URL(request.url).pathname.replace(/^\//, '')
      const html = stagedDocs.get(slot)
      if (html === undefined) return new Response('Not found', { status: 404 })
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': EFFECT_CSP }
      })
    })

    // Screen + system-audio capture for "screen ambience" and audio-reactive effects.
    session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] })
        const source = sources.find((s) => s.id === selectedScreenId) ?? sources[0]
        callback({ video: source, audio: request.audioRequested ? 'loopback' : undefined })
      } catch {
        callback({})
      }
    })

    registerIpc()
    createWindow()
    createTray()
    initUpdater({
      onStatus: (s) => send('update:status', s),
      onNotificationClick: () => {
        showWindow()
        send('navigate', 'settings')
      },
      log: logLine
    })

    // Sleep / lock / Windows shutdown → lights off (if enabled in Settings).
    powerMonitor.on('suspend', () => power.offOnSleep && setDark('sleep', true))
    powerMonitor.on('resume', () => setDark('sleep', false))
    powerMonitor.on('lock-screen', () => power.offOnLock && setDark('lock', true))
    powerMonitor.on('unlock-screen', () => setDark('lock', false))
    mainWindow?.on('session-end', () => power.offOnExit && openrgb.blackout())
    watchUserEffects(() => send('effects:changed'))
  })

  app.on('before-quit', () => {
    quitting = true
    conflicts.stop()
    if (power.offOnExit) openrgb.blackout()
    openrgb.disconnect()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !closeToTray) app.quit()
  })
}
