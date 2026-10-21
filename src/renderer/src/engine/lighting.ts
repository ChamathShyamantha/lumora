import { EffectHost, type EffectLog } from './effectHost'
import { AudioInput, silentAudio, synthAudio, type AudioFrame } from './audioInput'
import { ScreenInput } from './screenInput'
import { fitPlacement, ledCanvasPoints, sampleLeds, type LayoutDevice } from './devices'
import { parseEffectMeta, type PropValue } from './effectMeta'
import { GameReactions, type GameReactionsConfig } from './gameReactions'

export interface LedFrame {
  frame: Uint8ClampedArray
  /** Packed RGB per device key (brightness applied). */
  colors: Map<string, Uint8Array>
}

export interface InputStatus {
  audio: 'off' | 'on' | 'error'
  screen: 'off' | 'on' | 'error'
  audioError?: string
  screenError?: string
}

type Listener<T> = (v: T) => void

/** A device that runs its own effect instead of the main one. */
export interface DeviceEffectAssignment {
  deviceKey: string
  effectId: string
  html: string
  values: Record<string, PropValue>
  /** 0..100 */
  brightness: number
}

interface ExtraEffect {
  host: EffectHost
  slot: string
  html: string
  values: Record<string, PropValue>
  brightness: number
  frame: Uint8ClampedArray | null
  needsAudio: boolean
  needsScreen: boolean
}

/**
 * The single running lighting pipeline:
 * effect sandbox → 320x200 frame → per-LED sampling → virtual preview + OpenRGB.
 */
class LightingEngine {
  readonly host: EffectHost
  private audio = new AudioInput()
  private screen = new ScreenInput()
  private devices: { device: LayoutDevice; pts: Float32Array; fitPts: Float32Array; out: Uint8Array; smooth: Float32Array | null }[] = []
  /** Photosensitivity-safe mode: limit how fast any LED may change. */
  private safeMode = false
  private lastFrameAt = 0
  private brightness = 1
  /** Per-effect brightness, multiplied with the master brightness. */
  private effectBrightness = 1
  /** Reasons the lights are off (PC asleep/locked, "Lights off" scene or button). */
  private offReasons = new Set<string>()
  private get dark(): boolean {
    return this.offReasons.size > 0
  }
  private frameListeners = new Set<Listener<LedFrame>>()
  private statusListeners = new Set<Listener<InputStatus>>()
  private needsAudio = false
  private needsScreen = false
  private mainNeeds = { audio: false, screen: false }
  /** Effects running on individual devices, keyed by effect id. */
  private extras = new Map<string, ExtraEffect>()
  private deviceEffect = new Map<string, string>()
  /** Game Reactions: detectors + whether a listed game is currently running */
  readonly reactions = new GameReactions()
  private gameActive = false
  private inputTimer: number | undefined
  private tickCount = 0
  private simulateAudio = false
  private synthBeat = { v: 0 }
  lastAudio: AudioFrame | null = null
  status: InputStatus = { audio: 'off', screen: 'off' }
  currentHtml = ''

  constructor() {
    this.host = new EffectHost('main', { fps: 60, captureEvery: 2 })
    this.host.onFrame((px) => this.handleFrame(px))
    this.inputTimer = window.setInterval(() => this.pumpInputs(), 1000 / 60)
  }

  /** Load an effect document (library effect, visual-editor output or code). */
  load(html: string, values: Record<string, PropValue>): void {
    this.currentHtml = html
    const meta = parseEffectMeta(html)
    this.mainNeeds = { audio: meta.needsAudio, screen: meta.needsScreen }
    this.updateInputs()
    void this.host.load(html, values)
  }

  setProp(name: string, value: PropValue): void {
    this.host.setProp(name, value)
  }

  post(message: Record<string, unknown>): void {
    this.host.post(message)
  }

  onLog(l: Listener<EffectLog>): () => void {
    return this.host.onLog(l)
  }

  /**
   * Give individual devices their own effect. Each distinct effect runs in its
   * own sandbox; devices without an assignment follow the main effect.
   */
  setDeviceEffects(assignments: DeviceEffectAssignment[]): void {
    this.deviceEffect = new Map(assignments.map((a) => [a.deviceKey, a.effectId]))
    const wanted = new Map<string, DeviceEffectAssignment>()
    for (const a of assignments) wanted.set(a.effectId, a)
    // drop effects no device uses any more
    for (const [id, ex] of this.extras) {
      if (!wanted.has(id)) {
        ex.host.destroy()
        this.extras.delete(id)
      }
    }
    for (const [id, a] of wanted) {
      let ex = this.extras.get(id)
      if (!ex) {
        const used = new Set([...this.extras.values()].map((e) => e.slot))
        let n = 0
        while (used.has(`dev${n}`)) n++
        const host = new EffectHost(`dev${n}`, { fps: 60, captureEvery: 2 })
        const meta = parseEffectMeta(a.html)
        const created: ExtraEffect = {
          host,
          slot: `dev${n}`,
          html: a.html,
          values: { ...a.values },
          brightness: a.brightness,
          frame: null,
          needsAudio: meta.needsAudio,
          needsScreen: meta.needsScreen
        }
        host.onFrame((px) => {
          created.frame = px
        })
        void host.load(a.html, a.values)
        this.extras.set(id, created)
        ex = created
      } else if (ex.html !== a.html) {
        const meta = parseEffectMeta(a.html)
        ex.html = a.html
        ex.values = { ...a.values }
        ex.needsAudio = meta.needsAudio
        ex.needsScreen = meta.needsScreen
        void ex.host.load(a.html, a.values)
      } else {
        for (const [k, v] of Object.entries(a.values)) {
          if (ex.values[k] !== v) ex.host.setProp(k, v)
        }
        ex.values = { ...a.values }
      }
      ex.brightness = a.brightness
    }
    this.updateInputs()
  }

  private updateInputs(): void {
    let audio = this.mainNeeds.audio
    let screen = this.mainNeeds.screen
    for (const ex of this.extras.values()) {
      audio ||= ex.needsAudio
      screen ||= ex.needsScreen
    }
    void this.setInputs(audio, screen)
  }

  /** Send a message to the main effect and every per-device effect. */
  private broadcast(message: Record<string, unknown>): void {
    this.host.post(message)
    for (const ex of this.extras.values()) ex.host.post(message)
  }

  setSafeMode(on: boolean): void {
    this.safeMode = on
    for (const d of this.devices) d.smooth = null
  }

  /** Turn all output off for a reason (e.g. 'power', 'user'); on again when no reason remains. */
  setOff(reason: string, off: boolean): void {
    if (off) this.offReasons.add(reason)
    else this.offReasons.delete(reason)
  }

  setEffectBrightness(percent: number): void {
    this.effectBrightness = Math.max(0, Math.min(1, percent / 100))
  }

  setBrightness(percent: number): void {
    this.brightness = Math.max(0, Math.min(1, percent / 100))
  }

  setAudioSensitivity(v: number): void {
    this.audio.sensitivity = v
  }

  setLayout(devices: LayoutDevice[]): void {
    this.devices = devices
      .filter((d) => d.enabled)
      .map((d) => ({
        device: d,
        pts: ledCanvasPoints(d),
        // a device running its own effect fills that effect's whole canvas
        fitPts: ledCanvasPoints({ ...d, ...fitPlacement(d) }),
        out: new Uint8Array(d.leds.length * 3),
        smooth: null
      }))
  }

  onFrame(l: Listener<LedFrame>): () => void {
    this.frameListeners.add(l)
    return () => this.frameListeners.delete(l)
  }

  onStatus(l: Listener<InputStatus>): () => void {
    this.statusListeners.add(l)
    l(this.status)
    return () => this.statusListeners.delete(l)
  }

  private emitStatus(): void {
    for (const l of this.statusListeners) l(this.status)
  }

  private get reactionsActive(): boolean {
    const c = this.reactions.config
    return c.enabled && (!c.onlyInGames || this.gameActive)
  }

  setGameReactions(config: GameReactionsConfig): void {
    const wasActive = this.reactionsActive
    this.reactions.config = config
    if (wasActive !== this.reactionsActive) this.refreshScreen()
  }

  setGameActive(active: boolean): void {
    if (active === this.gameActive) return
    const wasActive = this.reactionsActive
    this.gameActive = active
    if (wasActive !== this.reactionsActive) this.refreshScreen()
  }

  get isGameActive(): boolean {
    return this.gameActive
  }

  get areReactionsActive(): boolean {
    return this.reactionsActive
  }

  private refreshScreen(): void {
    if (!this.reactionsActive) this.reactions.reset()
    void this.setInputs(this.needsAudio, this.needsScreen)
  }

  private async setInputs(audio: boolean, effectScreen: boolean): Promise<void> {
    this.needsAudio = audio
    this.needsScreen = effectScreen
    const screen = effectScreen || this.reactionsActive
    if (audio && !this.audio.running) {
      const ok = await this.audio.start()
      this.status = { ...this.status, audio: ok ? 'on' : 'error', audioError: this.audio.error ?? undefined }
    } else if (!audio && this.audio.running) {
      this.audio.stop()
      this.status = { ...this.status, audio: 'off', audioError: undefined }
    }
    if (screen && !this.screen.running) {
      const ok = await this.screen.start()
      this.status = { ...this.status, screen: ok ? 'on' : 'error', screenError: this.screen.error ?? undefined }
    } else if (!screen && this.screen.running) {
      this.screen.stop()
      this.status = { ...this.status, screen: 'off', screenError: undefined }
    }
    this.emitStatus()
  }

  /** Restart screen capture (e.g. after picking a different monitor). */
  async restartScreen(): Promise<void> {
    if (!this.screen.running) return
    this.screen.stop()
    await this.setInputs(this.needsAudio, this.needsScreen)
  }

  /** Feed a fake groove instead of system audio (preview/design without music). */
  setSimulateAudio(on: boolean): void {
    this.simulateAudio = on
    if (!on && !this.audio.running) this.broadcast({ type: 'audio', ...silentAudio(), freq: new Array(64).fill(0) })
  }

  private pumpInputs(): void {
    this.tickCount++
    if (this.simulateAudio) {
      const a = synthAudio(performance.now() / 1000, this.synthBeat)
      this.lastAudio = a
      this.broadcast({ type: 'audio', ...a, freq: Array.from(a.freq) })
    } else if (this.needsAudio && this.audio.running) {
      const a = this.audio.read(performance.now())
      this.lastAudio = a
      this.broadcast({ type: 'audio', ...a, freq: Array.from(a.freq) })
    }
    if (this.screen.running && this.tickCount % 2 === 0 && (this.needsScreen || this.reactionsActive)) {
      const z = this.screen.read()
      if (z && this.reactionsActive) this.reactions.update(z.imagedata, performance.now())
      if (z && this.needsScreen) {
        const zone = { type: 'zone', active: true, hue: z.hue, saturation: z.saturation, lightness: z.lightness }
        const buf = z.imagedata.slice().buffer
        this.host.post({ ...zone, imagedata: buf }, [buf])
        for (const ex of this.extras.values()) {
          if (!ex.needsScreen) continue
          const copy = z.imagedata.slice().buffer
          ex.host.post({ ...zone, imagedata: copy }, [copy])
        }
      }
    }
  }

  private handleFrame(px: Uint8ClampedArray): void {
    const colors = new Map<string, Uint8Array>()
    const now = performance.now()
    const dt = this.lastFrameAt ? Math.min(0.1, (now - this.lastFrameAt) / 1000) : 1 / 30
    this.lastFrameAt = now
    // Safe mode: a full black↔white swing takes ≥0.2 s, so flashing stays under 3 per second (WCAG 2.3.1).
    const maxStep = (255 * dt) / 0.2
    const overlay = this.reactions.hasOverlay(now)
    for (const d of this.devices) {
      // Devices with their own effect sample that effect's latest frame.
      const ex = this.extras.get(this.deviceEffect.get(d.device.key) ?? '')
      const source = ex ? ex.frame : px
      const level = ex ? ex.brightness / 100 : this.effectBrightness
      if (source) sampleLeds(source, ex ? d.fitPts : d.pts, d.out, this.dark ? 0 : this.brightness * level)
      else d.out.fill(0)
      // Game reactions follow only the master brightness, so a flash stays bright on a dimmed effect.
      if (overlay && !this.dark) this.reactions.apply(d.out, now, this.brightness)
      if (this.safeMode) {
        if (!d.smooth || d.smooth.length !== d.out.length) d.smooth = Float32Array.from(d.out)
        for (let i = 0; i < d.out.length; i++) {
          const delta = d.out[i] - d.smooth[i]
          d.smooth[i] += delta > maxStep ? maxStep : delta < -maxStep ? -maxStep : delta
          d.out[i] = d.smooth[i]
        }
      }
      colors.set(d.device.key, d.out)
      if (d.device.source === 'openrgb' && d.device.hardwareId !== undefined) {
        window.lumora.openrgb.update(d.device.hardwareId, d.out)
      }
    }
    const frame: LedFrame = { frame: px, colors }
    for (const l of this.frameListeners) l(frame)
  }

  dispose(): void {
    window.clearInterval(this.inputTimer)
    this.audio.stop()
    this.screen.stop()
    this.host.destroy()
    for (const ex of this.extras.values()) ex.host.destroy()
    this.extras.clear()
  }
}

let instance: LightingEngine | null = null
export function lighting(): LightingEngine {
  if (!instance) instance = new LightingEngine()
  return instance
}
