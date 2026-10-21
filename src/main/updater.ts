import { app, Notification } from 'electron'
import electronUpdater from 'electron-updater'

/**
 * Auto-updates from the public GitHub releases repo (configured under
 * "publish" in package.json). Downloads in the background; the user chooses
 * when to restart. Only active in the installed app.
 */

export type UpdateStatus =
  | { state: 'dev' }
  | { state: 'idle' | 'checking' | 'up-to-date'; checkedAt?: number }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

const { autoUpdater } = electronUpdater

let status: UpdateStatus = { state: app.isPackaged ? 'idle' : 'dev' }
let notifyRenderer: (s: UpdateStatus) => void = () => undefined
let onReadyClick: () => void = () => undefined
let timer: NodeJS.Timeout | undefined

function set(next: UpdateStatus): void {
  status = next
  notifyRenderer(status)
}

export function updateStatus(): UpdateStatus {
  return status
}

export function initUpdater(opts: { onStatus: (s: UpdateStatus) => void; onNotificationClick: () => void; log: (...a: unknown[]) => void }): void {
  notifyRenderer = opts.onStatus
  onReadyClick = opts.onNotificationClick
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-not-available', () => set({ state: 'up-to-date', checkedAt: Date.now() }))
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => {
    if (status.state === 'downloading') set({ ...status, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'ready', version: info.version })
    if (Notification.isSupported()) {
      const n = new Notification({ title: `Lumora ${info.version} is ready`, body: 'Restart Lumora to finish updating. Click to open.' })
      n.on('click', () => onReadyClick())
      n.show()
    }
  })
  autoUpdater.on('error', (err) => {
    opts.log('updater error', err)
    set({ state: 'error', message: err?.message ?? String(err) })
  })

  // First check shortly after start, then every 6 hours.
  setTimeout(() => void checkForUpdates(), 15_000)
  timer = setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status
  if (status.state === 'downloading' || status.state === 'ready') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    set({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return status
}

/** Quit and run the downloaded installer. */
export function installUpdate(beforeQuit: () => void): void {
  if (status.state !== 'ready') return
  clearInterval(timer)
  beforeQuit()
  autoUpdater.quitAndInstall(true, true)
}
