export interface EffectFile {
  id: string
  source: 'builtin' | 'user'
  file: string
  html: string
  mtime: number
}

export interface HardwareDevice {
  id: number
  name: string
  vendor: string
  type: number
  ledCount: number
  ledNames: string[]
  zones: {
    name: string
    type: number
    ledsCount: number
    matrix?: { width: number; height: number; keys: (number | null)[][] }
  }[]
}

export type OpenRgbStatus =
  | { state: 'disconnected'; error?: string }
  | { state: 'connecting' }
  | { state: 'connected'; host: string; port: number }

export interface OpenRgbSnapshot {
  status: OpenRgbStatus
  devices: HardwareDevice[]
}

export interface AiConnection {
  provider: string
  kind: 'anthropic' | 'openai'
  baseUrl: string
  model: string
}

export interface AiStatus {
  /** provider id → last 4 characters of its stored key */
  keys: Record<string, string>
  encrypted: boolean
}

export interface AiRequest {
  id: string
  conn: AiConnection
  system: string
  prompt: string
  schema: Record<string, unknown>
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  maxTokens: number
}

export type AiResult =
  | { ok: true; data: unknown; model: string; usage: { input: number; output: number } }
  | { ok: false; error: string; code: string }

export interface RunningConflict {
  id: string
  name: string
  hint: string
  custom: boolean
  processes: { name: string; pid: number; system: boolean }[]
}

export type UpdateStatus =
  | { state: 'dev' }
  | { state: 'idle' | 'checking' | 'up-to-date'; checkedAt?: number }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

declare global {
  interface Window {
    lumora: {
      effects: {
        list(): Promise<EffectFile[]>
        save(name: string, html: string, id?: string): Promise<string>
        remove(id: string): Promise<void>
        importFiles(): Promise<string[]>
        exportFile(name: string, html: string): Promise<boolean>
        openFolder(): Promise<void>
        onChanged(cb: () => void): () => void
      }
      stage(slot: string, html: string): Promise<string>
      openrgb: {
        connect(host: string, port: number): Promise<void>
        disconnect(): Promise<void>
        state(): Promise<OpenRgbSnapshot>
        rescan(): Promise<void>
        update(id: number, rgb: Uint8Array): void
        onChanged(cb: (snapshot: OpenRgbSnapshot) => void): () => void
      }
      capture: {
        screens(): Promise<{ id: string; name: string }[]>
        selectScreen(id: string | null): Promise<void>
        snapshot(): Promise<string | null>
      }
      system: {
        runningApps(): Promise<string[]>
        openTaskManager(): Promise<void>
      }
      conflicts: {
        list(): Promise<RunningConflict[]>
        recheck(): Promise<RunningConflict[]>
        close(id: string, elevated: boolean): Promise<{ ok: boolean; needsAdmin: string[]; failed: string[] }>
        configure(ignored: string[], extra: string[]): Promise<void>
        onChanged(cb: (running: RunningConflict[]) => void): () => void
      }
      onNavigate(cb: (view: string) => void): () => void
      ai: {
        status(): Promise<AiStatus>
        setKey(conn: AiConnection, key: string): Promise<{ ok: true; models: string[] } | { ok: false; error: string }>
        clearKey(provider: string): Promise<void>
        listModels(conn: AiConnection): Promise<{ ok: true; models: string[] } | { ok: false; error: string; code: string }>
        generate(req: AiRequest): Promise<AiResult>
        cancel(id: string): Promise<void>
      }
      updates: {
        version(): Promise<string>
        status(): Promise<UpdateStatus>
        check(): Promise<UpdateStatus>
        install(): Promise<void>
        onStatus(cb: (s: UpdateStatus) => void): () => void
      }
      tray: {
        update(state: { scenes: { id: string; name: string }[]; lightsOff: boolean }): Promise<void>
        onAction(cb: (a: { type: string; id?: string }) => void): () => void
      }
      power: {
        configure(cfg: { offOnSleep: boolean; offOnLock: boolean; offOnExit: boolean }): Promise<void>
        onState(cb: (state: { dark: boolean }) => void): () => void
      }
      app: {
        getAutostart(): Promise<{ supported: boolean; enabled: boolean; minimized: boolean }>
        setAutostart(enabled: boolean, minimized: boolean): Promise<{ supported: boolean; enabled: boolean; minimized: boolean }>
        setCloseToTray(value: boolean): Promise<void>
        openExternal(url: string): Promise<void>
      }
    }
  }
}
