import { EffectHost, type EffectLog } from './effectHost'
import { AudioInput, silentAudio, synthAudio, type AudioFrame } from './audioInput'
import { ScreenInput } from './screenInput'
import { ledCanvasPoints, sampleLeds, type LayoutDevice } from './devices'
import { parseEffectMeta, type PropValue } from './effectMeta'

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

/**
 * The single running lighting pipeline:
 * effect sandbox → 320x200 frame → per-LED sampling → virtual preview + OpenRGB.
 */
class LightingEngine {
  readonly host: EffectHost
  private audio = new AudioInput()
  private screen = new ScreenInput()
  private devices: { device: LayoutDevice; pts: Float32Array; out: Uint8Array }[] = []
  private brightness = 1
  private frameListeners = new Set<Listener<LedFrame>>()
  private statusListeners = new Set<Listener<InputStatus>>()
  private needsAudio = false
  private needsScreen = false
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
    void this.setInputs(meta.needsAudio, meta.needsScreen)
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

  setBrightness(percent: number): void {
    this.brightness = Math.max(0, Math.min(1, percent / 100))
  }

  setAudioSensitivity(v: number): void {
    this.audio.sensitivity = v
  }

  setLayout(devices: LayoutDevice[]): void {
    this.devices = devices
      .filter((d) => d.enabled)
      .map((d) => ({ device: d, pts: ledCanvasPoints(d), out: new Uint8Array(d.leds.length * 3) }))
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

  private async setInputs(audio: boolean, screen: boolean): Promise<void> {
    this.needsAudio = audio
    this.needsScreen = screen
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
    if (!on && !this.audio.running) this.host.post({ type: 'audio', ...silentAudio(), freq: new Array(64).fill(0) })
  }

  private pumpInputs(): void {
    this.tickCount++
    if (this.simulateAudio) {
      const a = synthAudio(performance.now() / 1000, this.synthBeat)
      this.lastAudio = a
      this.host.post({ type: 'audio', ...a, freq: Array.from(a.freq) })
    } else if (this.needsAudio && this.audio.running) {
      const a = this.audio.read(performance.now())
      this.lastAudio = a
      this.host.post({ type: 'audio', ...a, freq: Array.from(a.freq) })
    }
    if (this.needsScreen && this.screen.running && this.tickCount % 2 === 0) {
      const z = this.screen.read()
      if (z) {
        const buf = z.imagedata.slice().buffer
        this.host.post(
          { type: 'zone', active: true, hue: z.hue, saturation: z.saturation, lightness: z.lightness, imagedata: buf },
          [buf]
        )
      }
    }
  }

  private handleFrame(px: Uint8ClampedArray): void {
    const colors = new Map<string, Uint8Array>()
    for (const d of this.devices) {
      sampleLeds(px, d.pts, d.out, this.brightness)
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
  }
}

let instance: LightingEngine | null = null
export function lighting(): LightingEngine {
  if (!instance) instance = new LightingEngine()
  return instance
}
