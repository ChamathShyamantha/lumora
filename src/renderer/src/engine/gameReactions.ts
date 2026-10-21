/**
 * Game Reactions — lighting that responds to what happens in a game, using
 * only screen capture (no game memory, hooks or injection, so it's safe with
 * anti-cheat like Vanguard/EAC). Detectors run on the 160x100 downscaled
 * screen ~30x per second and produce colour overlays that are blended over
 * whatever effect is playing.
 */

export interface Rect {
  /** Fractions of the screen, 0..1 */
  x: number
  y: number
  w: number
  h: number
}

export type RuleCondition = 'brighter' | 'darker' | 'colour' | 'change'

export interface CustomRule {
  id: string
  name: string
  enabled: boolean
  rect: Rect
  condition: RuleCondition
  /** 0..100 — brightness level for brighter/darker, change size for change */
  threshold: number
  /** Used by the "colour" condition */
  targetColor: string
  /** 0..100 — how close the region colour must be to targetColor */
  tolerance: number
  color: string
  mode: 'flash' | 'hold'
  durationMs: number
  strength: number
}

export interface DetectorSettings {
  enabled: boolean
  /** 0..100 */
  sensitivity: number
  /** 0..100 */
  strength: number
  color: string
}

export interface GameReactionsConfig {
  enabled: boolean
  onlyInGames: boolean
  games: string[]
  flash: DetectorSettings
  damage: DetectorSettings
  rules: CustomRule[]
}

export const DEFAULT_GAMES = [
  'VALORANT-Win64-Shipping.exe',
  'VALORANT.exe',
  'cs2.exe',
  'FortniteClient-Win64-Shipping.exe',
  'r5apex.exe',
  'Overwatch.exe',
  'RainbowSix.exe',
  'TslGame.exe'
]

export const DEFAULT_GAME_REACTIONS: GameReactionsConfig = {
  enabled: false,
  onlyInGames: true,
  games: DEFAULT_GAMES,
  flash: { enabled: true, sensitivity: 60, strength: 100, color: '#ffffff' },
  damage: { enabled: true, sensitivity: 50, strength: 80, color: '#ff1a1a' },
  rules: []
}

export interface Readout {
  whiteness: number
  flashBaseline: number
  flash: number
  edgeRed: number
  damageBaseline: number
  damage: number
  rules: Record<string, { value: number; active: boolean; color: [number, number, number] }>
}

interface Overlay {
  rgb: [number, number, number]
  /** 0..1 */
  a: number
}

const W = 160
const H = 100

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255]
}

function regionStats(img: Uint8ClampedArray, r: Rect): { rgb: [number, number, number]; brightness: number } {
  const x0 = Math.max(0, Math.floor(r.x * W))
  const y0 = Math.max(0, Math.floor(r.y * H))
  const x1 = Math.min(W, Math.max(x0 + 1, Math.ceil((r.x + r.w) * W)))
  const y1 = Math.min(H, Math.max(y0 + 1, Math.ceil((r.y + r.h) * H)))
  let rs = 0
  let gs = 0
  let bs = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4
      rs += img[i]
      gs += img[i + 1]
      bs += img[i + 2]
      n++
    }
  }
  const rgb: [number, number, number] = n ? [rs / n, gs / n, bs / n] : [0, 0, 0]
  return { rgb, brightness: (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 }
}

export class GameReactions {
  config: GameReactionsConfig = DEFAULT_GAME_REACTIONS
  private flashActive = false
  private flashLevel = 0
  private flashBaseline = 0
  private flashSince = 0
  private damageLevel = 0
  private damageAt = -Infinity
  private damageBaseline = 0
  private lastUpdate = 0
  private firstFrame = true
  private ruleState = new Map<string, { ema: number; active: boolean; level: number; firedAt: number }>()
  /** Test pulses triggered from the UI */
  private tests: { rgb: [number, number, number]; at: number; ms: number }[] = []
  readout: Readout = { whiteness: 0, flashBaseline: 0, flash: 0, edgeRed: 0, damageBaseline: 0, damage: 0, rules: {} }

  /** Analyse one screen frame (160x100 RGBA). */
  update(img: Uint8ClampedArray, now: number): void {
    const cfg = this.config
    const dt = this.lastUpdate ? Math.min(0.2, (now - this.lastUpdate) / 1000) : 1 / 30
    this.lastUpdate = now

    // --- flashbang: a sudden jump in near-white, low-saturation pixels in the middle of the screen
    let white = 0
    let total = 0
    for (let y = 10; y < 90; y += 2) {
      for (let x = 24; x < 136; x += 2) {
        const i = (y * W + x) * 4
        const r = img[i]
        const g = img[i + 1]
        const b = img[i + 2]
        const mx = Math.max(r, g, b)
        const mn = Math.min(r, g, b)
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        if (lum > 0.82 && (mx === 0 ? 0 : (mx - mn) / mx) < 0.22) white++
        total++
      }
    }
    const whiteness = white / total
    const s = cfg.flash.sensitivity / 100
    if (this.firstFrame) {
      // Start from whatever is on screen now, so an already-white screen isn't mistaken for a flash.
      this.flashBaseline = whiteness
    }
    if (!this.flashActive) {
      const trigger = 0.75 - 0.35 * s
      if (cfg.flash.enabled && whiteness > trigger && whiteness - this.flashBaseline > 0.25) {
        this.flashActive = true
        this.flashSince = now
      } else this.flashBaseline += (whiteness - this.flashBaseline) * Math.min(1, dt * 1.5)
    }
    if (this.flashActive) {
      // follow the screen as the flash wears off
      const target = Math.min(1, Math.max(0, (whiteness - 0.12) / 0.6))
      this.flashLevel += (target - this.flashLevel) * Math.min(1, dt * 12)
      if (whiteness < 0.18) this.flashActive = false
      // Real flashes wear off within a few seconds; a screen that stays white is part of the scene.
      if (now - this.flashSince > 4000) {
        this.flashActive = false
        this.flashBaseline = whiteness
      }
    } else {
      this.flashLevel *= Math.exp(-dt * 6)
    }

    // --- damage: red rising at the screen edges (most shooters tint the edges when you're hit)
    let red = 0
    let edgeN = 0
    for (let y = 0; y < H; y += 2) {
      const edgeRow = y < 12 || y >= H - 12
      for (let x = 0; x < W; x += 2) {
        if (!edgeRow && x >= 16 && x < W - 16) continue
        const i = (y * W + x) * 4
        red += Math.max(0, img[i] - Math.max(img[i + 1], img[i + 2]))
        edgeN++
      }
    }
    const edgeRed = red / edgeN / 255
    if (this.firstFrame) this.damageBaseline = edgeRed
    const ds = cfg.damage.sensitivity / 100
    if (cfg.damage.enabled && edgeRed > 0.06 && edgeRed - this.damageBaseline > 0.13 - 0.09 * ds && now - this.damageAt > 250) {
      this.damageAt = now
      this.damageLevel = 1
    }
    this.damageBaseline += (edgeRed - this.damageBaseline) * Math.min(1, dt * 0.8)
    this.damageLevel *= Math.exp(-dt * 2.2)

    // --- custom HUD rules
    const rules: Readout['rules'] = {}
    for (const rule of cfg.rules) {
      let st = this.ruleState.get(rule.id)
      const { rgb, brightness } = regionStats(img, rule.rect)
      if (!st) {
        st = { ema: brightness, active: false, level: 0, firedAt: -Infinity }
        this.ruleState.set(rule.id, st)
      }
      let value = 0
      let active = false
      switch (rule.condition) {
        case 'brighter':
          value = brightness * 100
          active = value > rule.threshold
          break
        case 'darker':
          value = brightness * 100
          active = value < rule.threshold
          break
        case 'colour': {
          const t = hexRgb(rule.targetColor)
          const dist = Math.hypot(rgb[0] - t[0], rgb[1] - t[1], rgb[2] - t[2]) / 441.7
          value = (1 - dist) * 100
          active = dist * 100 < rule.tolerance
          break
        }
        case 'change':
          value = Math.abs(brightness - st.ema) * 100
          active = value > rule.threshold
          st.ema += (brightness - st.ema) * Math.min(1, dt * 1.2)
          break
      }
      active = active && rule.enabled
      if (rule.mode === 'flash') {
        if (active && !st.active) {
          st.firedAt = now
          st.level = 1
        }
        st.level = Math.max(0, 1 - (now - st.firedAt) / Math.max(50, rule.durationMs))
      } else {
        st.level += ((active ? 1 : 0) - st.level) * Math.min(1, dt * 10)
      }
      st.active = active
      rules[rule.id] = { value, active, color: rgb.map(Math.round) as [number, number, number] }
    }
    for (const id of [...this.ruleState.keys()]) if (!cfg.rules.some((r) => r.id === id)) this.ruleState.delete(id)

    this.firstFrame = false
    this.readout = {
      whiteness,
      flashBaseline: this.flashBaseline,
      flash: this.flashLevel,
      edgeRed,
      damageBaseline: this.damageBaseline,
      damage: this.damageLevel,
      rules
    }
  }

  /** Fire a preview pulse (UI "Test" buttons). */
  test(color: string, ms = 900): void {
    this.tests.push({ rgb: hexRgb(color), at: performance.now(), ms })
  }

  /** Clear detector state (e.g. when reactions are switched off or screen capture stops). */
  reset(): void {
    this.flashActive = false
    this.flashLevel = 0
    this.damageLevel = 0
    this.firstFrame = true
    this.lastUpdate = 0
    this.ruleState.clear()
  }

  private overlays(now: number): Overlay[] {
    const cfg = this.config
    const out: Overlay[] = []
    for (const rule of cfg.rules) {
      const st = this.ruleState.get(rule.id)
      if (st && st.level > 0.01) out.push({ rgb: hexRgb(rule.color), a: st.level * (rule.strength / 100) })
    }
    if (cfg.damage.enabled && this.damageLevel > 0.01) out.push({ rgb: hexRgb(cfg.damage.color), a: this.damageLevel * (cfg.damage.strength / 100) })
    if (cfg.flash.enabled && this.flashLevel > 0.01) out.push({ rgb: hexRgb(cfg.flash.color), a: this.flashLevel * (cfg.flash.strength / 100) })
    this.tests = this.tests.filter((t) => now - t.at < t.ms)
    for (const t of this.tests) out.push({ rgb: t.rgb, a: Math.max(0, 1 - (now - t.at) / t.ms) })
    return out
  }

  /** True when any overlay is visible right now. */
  hasOverlay(now: number): boolean {
    return this.overlays(now).length > 0
  }

  /** Blend active overlays into packed-RGB LED colours (in place). Brightness is applied by the caller. */
  apply(out: Uint8Array, now: number, brightness: number): void {
    const ov = this.overlays(now)
    if (!ov.length) return
    for (let i = 0; i < out.length; i += 3) {
      let r = out[i]
      let g = out[i + 1]
      let b = out[i + 2]
      for (const o of ov) {
        r += (o.rgb[0] * brightness - r) * o.a
        g += (o.rgb[1] * brightness - g) * o.a
        b += (o.rgb[2] * brightness - b) * o.a
      }
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
    }
  }
}
