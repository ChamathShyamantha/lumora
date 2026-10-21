export interface AudioFrame {
  active: boolean
  level: number
  bass: number
  mid: number
  treble: number
  density: number
  width: number
  freq: Float32Array
  beat: boolean
}

const BANDS = 64

export function silentAudio(): AudioFrame {
  return { active: false, level: 0, bass: 0, mid: 0, treble: 0, density: 0, width: 0, freq: new Float32Array(BANDS), beat: false }
}

/** A fake 120 BPM groove so audio effects can be designed without music playing. */
export function synthAudio(t: number, prevBeatAt: { v: number }): AudioFrame {
  const beatLen = 0.5
  const phase = (t % beatLen) / beatLen
  const kick = Math.exp(-phase * 7)
  const beat = t - prevBeatAt.v >= beatLen
  if (beat) prevBeatAt.v = t - (t % beatLen)
  const freq = new Float32Array(BANDS)
  for (let i = 0; i < BANDS; i++) {
    const u = i / BANDS
    const body = 0.55 * Math.exp(-u * 2.2) * (0.5 + kick)
    const shimmer = 0.25 * (0.5 + 0.5 * Math.sin(t * 6 + i * 0.7)) * u
    freq[i] = Math.min(1, body + shimmer + 0.08 * Math.random())
  }
  const bass = Math.min(1, 0.25 + kick * 0.7)
  const mid = 0.35 + 0.15 * Math.sin(t * 2.3)
  const treble = 0.25 + 0.15 * Math.sin(t * 5.1)
  return { active: true, level: (bass + mid + treble) / 3, bass, mid, treble, density: 0.4, width: 0.4, freq, beat }
}

/**
 * Captures system audio (Windows loopback via getDisplayMedia) and turns it
 * into smoothed bands, a 64-bin log spectrum and simple beat detection.
 */
export class AudioInput {
  private ctx?: AudioContext
  private stream?: MediaStream
  private analyser?: AnalyserNode
  private spectrum = new Float32Array(0)
  private timeData = new Float32Array(0)
  private bandEdges: number[] = []
  private smooth = silentAudio()
  private bassHistory: number[] = []
  private lastBeat = 0
  sensitivity = 1
  error: string | null = null

  get running(): boolean {
    return !!this.analyser
  }

  async start(): Promise<boolean> {
    if (this.analyser) return true
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
      stream.getVideoTracks().forEach((t) => t.stop())
      if (stream.getAudioTracks().length === 0) throw new Error('No system audio track available')
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.55
      src.connect(analyser)
      this.ctx = ctx
      this.stream = stream
      this.analyser = analyser
      this.spectrum = new Float32Array(analyser.frequencyBinCount)
      this.timeData = new Float32Array(analyser.fftSize)
      const binHz = ctx.sampleRate / analyser.fftSize
      // log-spaced band edges 30 Hz .. 16 kHz
      this.bandEdges = Array.from({ length: BANDS + 1 }, (_, i) => {
        const hz = 30 * Math.pow(16000 / 30, i / BANDS)
        return Math.max(1, Math.round(hz / binHz))
      })
      this.error = null
      return true
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.stop()
      return false
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => undefined)
    this.ctx = undefined
    this.stream = undefined
    this.analyser = undefined
    this.smooth = silentAudio()
  }

  /** Call once per frame. */
  read(now: number): AudioFrame {
    const a = this.analyser
    if (!a) return silentAudio()
    a.getFloatFrequencyData(this.spectrum)
    a.getFloatTimeDomainData(this.timeData)

    const gain = this.sensitivity
    const freq = new Float32Array(BANDS)
    for (let b = 0; b < BANDS; b++) {
      const lo = this.bandEdges[b]
      const hi = Math.max(lo + 1, this.bandEdges[b + 1])
      let sum = 0
      let n = 0
      for (let i = lo; i < hi && i < this.spectrum.length; i++) {
        sum += this.spectrum[i]
        n++
      }
      const db = n ? sum / n : -120
      // -85 dB .. -25 dB → 0..1, with a slight treble tilt so highs aren't starved
      const tilt = (b / BANDS) * 8
      freq[b] = clamp01(((db + tilt + 85) / 60) * gain)
    }

    let rms = 0
    for (let i = 0; i < this.timeData.length; i++) rms += this.timeData[i] * this.timeData[i]
    rms = Math.sqrt(rms / this.timeData.length)

    const avg = (from: number, to: number): number => {
      let s = 0
      for (let i = from; i < to; i++) s += freq[i]
      return s / (to - from)
    }
    const bass = avg(0, 14)
    const mid = avg(14, 40)
    const treble = avg(40, BANDS)
    const level = clamp01(rms * 4 * gain)

    let density = 0
    for (let i = 0; i < BANDS; i++) if (freq[i] > 0.35) density++
    density /= BANDS

    let width = 0
    let weight = 0
    for (let i = 0; i < BANDS; i++) {
      width += freq[i] * i
      weight += freq[i]
    }
    width = weight > 0 ? width / weight / BANDS : 0

    const s = this.smooth
    const k = 0.45
    s.bass += (bass - s.bass) * k
    s.mid += (mid - s.mid) * k
    s.treble += (treble - s.treble) * k
    s.level += (level - s.level) * k
    s.density += (density - s.density) * k
    s.width += (width - s.width) * k

    // Beat: bass energy spike over its recent average.
    this.bassHistory.push(bass)
    if (this.bassHistory.length > 45) this.bassHistory.shift()
    const mean = this.bassHistory.reduce((x, y) => x + y, 0) / this.bassHistory.length
    const beat = bass > 0.22 && bass > mean * 1.3 && now - this.lastBeat > 200
    if (beat) this.lastBeat = now

    return {
      active: true,
      level: s.level,
      bass: s.bass,
      mid: s.mid,
      treble: s.treble,
      density: s.density,
      width: s.width,
      freq,
      beat
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
