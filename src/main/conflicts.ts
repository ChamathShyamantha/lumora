import { execFile } from 'node:child_process'

/**
 * Detects other RGB software that fights Lumora/OpenRGB for control of the
 * same LEDs (vendor apps keep re-sending their own colours). Only process
 * names are read; nothing is closed unless the user asks.
 */

export interface ConflictApp {
  id: string
  name: string
  /** Lower-case executable names */
  processes: string[]
  /** How to stop it from coming back */
  hint: string
}

export const KNOWN_CONFLICTS: ConflictApp[] = [
  {
    id: 'msi',
    name: 'MSI Center / Mystic Light',
    processes: ['ledkeeper2.exe', 'ledkeeper.exe', 'msi center.exe', 'msi.centralserver.exe', 'mysticlight.exe', 'dragon center.exe'],
    hint: 'In MSI Center, remove the Mystic Light feature, or disable “MSI Central Service” / “Mystic Light” startup in Task Manager → Startup apps.'
  },
  {
    id: 'asus',
    name: 'ASUS Armoury Crate / Aura',
    processes: ['lightingservice.exe', 'armourycrate.exe', 'armourycrate.service.exe', 'armourycrate.usersessionhelper.exe', 'aurawallpaperservice.exe', 'aura.exe'],
    hint: 'Its “LightingService” restarts automatically. Uninstall the Aura/Lighting component in Armoury Crate, or set the “ASUS Com Service” / lighting services to Manual.'
  },
  {
    id: 'gigabyte',
    name: 'Gigabyte RGB Fusion / Control Center',
    processes: ['rgbfusion.exe', 'rgbfusion2.exe', 'gcc.exe', 'gigabytecontrolcenter.exe'],
    hint: 'Disable RGB Fusion in Gigabyte Control Center or remove it from Task Manager → Startup apps.'
  },
  {
    id: 'asrock',
    name: 'ASRock Polychrome',
    processes: ['polychromergb.exe', 'asrpolychromergb.exe', 'polychromesync.exe'],
    hint: 'Close Polychrome and disable it in Task Manager → Startup apps.'
  },
  {
    id: 'corsair',
    name: 'Corsair iCUE',
    processes: ['icue.exe', 'corsair.service.exe', 'corsairdevicecontrolservice.exe', 'cue.exe'],
    hint: 'In iCUE settings turn off “Start on system startup”, or enable iCUE’s SDK so other apps can control the lights.'
  },
  {
    id: 'razer',
    name: 'Razer Synapse',
    processes: ['razer synapse 3.exe', 'razer synapse.exe', 'razercentralservice.exe', 'razer synapse service.exe', 'razer synapse service process.exe'],
    hint: 'Turn off “Launch on startup” in Synapse settings, or quit it from the tray.'
  },
  {
    id: 'logitech',
    name: 'Logitech G HUB',
    processes: ['lghub.exe', 'lghub_agent.exe', 'lghub_system_tray.exe'],
    hint: 'In G HUB settings, turn off “Always start on login” and quit it from the tray.'
  },
  {
    id: 'steelseries',
    name: 'SteelSeries GG / Engine',
    processes: ['steelseriesgg.exe', 'steelseriesggclient.exe', 'steelseriesengine.exe', 'steelseriesengine3.exe'],
    hint: 'Quit SteelSeries GG from the tray and disable it in Task Manager → Startup apps.'
  },
  {
    id: 'nzxt',
    name: 'NZXT CAM',
    processes: ['nzxt cam.exe', 'cam.exe'],
    hint: 'Quit CAM from the tray and turn off “Launch on startup” in its settings.'
  },
  {
    id: 'coolermaster',
    name: 'Cooler Master MasterPlus',
    processes: ['masterplus.exe', 'masterplusapp.exe'],
    hint: 'Quit MasterPlus and disable it in Task Manager → Startup apps.'
  },
  {
    id: 'thermaltake',
    name: 'Thermaltake TT RGB Plus',
    processes: ['tt rgb plus.exe', 'ttrgbplus.exe'],
    hint: 'Quit TT RGB Plus and disable it in Task Manager → Startup apps.'
  },
  {
    id: 'lianli',
    name: 'Lian Li L-Connect',
    processes: ['l-connect 3.exe', 'l-connect.exe'],
    hint: 'Quit L-Connect and disable it in Task Manager → Startup apps.'
  },
  {
    id: 'hyperx',
    name: 'HyperX NGENUITY',
    processes: ['ngenuity2.exe', 'hyperx ngenuity.exe'],
    hint: 'Quit NGENUITY and disable it in Task Manager → Startup apps.'
  },
  {
    id: 'alienware',
    name: 'Alienware Command Center',
    processes: ['awcc.exe', 'awcc.background.server.exe'],
    hint: 'Turn off AlienFX lighting control in Command Center, or disable it at startup.'
  },
  {
    id: 'signalrgb',
    name: 'SignalRGB',
    processes: ['signalrgb.exe', 'signalrgblauncher.exe'],
    hint: 'Only one RGB studio should run at a time. Quit SignalRGB from its tray icon.'
  }
]

export interface RunningConflict {
  id: string
  name: string
  hint: string
  custom: boolean
  processes: { name: string; pid: number; system: boolean }[]
}

interface ProcessRow {
  name: string
  pid: number
  /** Running in the Services session (SYSTEM) — stopping it needs admin. */
  system: boolean
}

function listProcesses(): Promise<ProcessRow[]> {
  return new Promise((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([])
      const rows: ProcessRow[] = []
      for (const line of stdout.split(/\r?\n/)) {
        const cols = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1))
        if (!cols || cols.length < 3) continue
        rows.push({ name: cols[0].toLowerCase(), pid: Number(cols[1]), system: cols[2].toLowerCase() === 'services' })
      }
      resolve(rows)
    })
  })
}

export class ConflictWatcher {
  private timer: NodeJS.Timeout | undefined
  private extra: string[] = []
  running: RunningConflict[] = []

  constructor(private readonly onChange: (running: RunningConflict[], newlyFound: RunningConflict[]) => void) {}

  setExtra(names: string[]): void {
    this.extra = names.map((n) => n.trim().toLowerCase()).filter(Boolean)
    void this.poll()
  }

  start(intervalMs = 15000): void {
    void this.poll()
    this.timer = setInterval(() => void this.poll(), intervalMs)
  }

  stop(): void {
    clearInterval(this.timer)
  }

  async poll(): Promise<RunningConflict[]> {
    const rows = await listProcesses()
    const apps: ConflictApp[] = [
      ...KNOWN_CONFLICTS,
      ...this.extra.map((n) => ({ id: `custom:${n}`, name: n, processes: [n], hint: 'Added by you.' }))
    ]
    const found: RunningConflict[] = []
    for (const app of apps) {
      const procs = rows.filter((r) => app.processes.includes(r.name))
      if (procs.length) found.push({ id: app.id, name: app.name, hint: app.hint, custom: app.id.startsWith('custom:'), processes: procs })
    }
    const before = new Set(this.running.map((r) => r.id))
    const newlyFound = found.filter((f) => !before.has(f.id))
    const changed = found.length !== this.running.length || newlyFound.length > 0
    this.running = found
    if (changed) this.onChange(found, newlyFound)
    return found
  }

  /**
   * Close one conflicting app. User-session processes are ended directly;
   * system-service processes need an elevated taskkill (Windows shows a UAC prompt).
   */
  async close(id: string, elevated: boolean): Promise<{ ok: boolean; needsAdmin: string[]; failed: string[] }> {
    const app = this.running.find((r) => r.id === id)
    if (!app) return { ok: true, needsAdmin: [], failed: [] }
    const needsAdmin: string[] = []
    const failed: string[] = []
    const userProcs = app.processes.filter((p) => !p.system)
    const sysProcs = app.processes.filter((p) => p.system)
    for (const p of userProcs) {
      const ok = await new Promise<boolean>((res) =>
        execFile('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true }, (err) => res(!err))
      )
      if (!ok) failed.push(p.name)
    }
    if (sysProcs.length) {
      if (!elevated) needsAdmin.push(...sysProcs.map((p) => p.name))
      else {
        const args = sysProcs.flatMap((p) => ['/PID', String(p.pid)]).concat(['/T', '/F'])
        const argList = args.map((a) => `'${a}'`).join(',')
        await new Promise<void>((res) =>
          execFile(
            'powershell',
            ['-NoProfile', '-NonInteractive', '-Command', `Start-Process taskkill -ArgumentList ${argList} -Verb RunAs -WindowStyle Hidden -Wait`],
            { windowsHide: true },
            () => res()
          )
        )
      }
    }
    await this.poll()
    const still = this.running.find((r) => r.id === id)
    if (still && elevated) failed.push(...still.processes.map((p) => p.name))
    return { ok: !still, needsAdmin, failed: [...new Set(failed)] }
  }
}
