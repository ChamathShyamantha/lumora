import type { HardwareDevice } from '../types'

/** One LED cell in device grid units. Order = hardware LED index. */
export interface LedCell {
  x: number
  y: number
  w: number
  h: number
  label?: string
}

export type DeviceKind = 'keyboard' | 'mouse' | 'fan' | 'strip' | 'monitor' | 'mousepad' | 'matrix' | 'other'

export interface DeviceDef {
  key: string
  name: string
  kind: DeviceKind
  source: 'virtual' | 'openrgb'
  hardwareId?: number
  gridW: number
  gridH: number
  leds: LedCell[]
  /** Round LEDs are drawn as dots, square ones as keys. */
  shape: 'dot' | 'key'
}

export interface Placement {
  x: number // canvas px of device top-left (before rotation)
  y: number
  scale: number // canvas px per grid unit
  rotation: number // degrees, around device centre
  enabled: boolean
}

export type LayoutDevice = DeviceDef & Placement

// ---------- virtual presets ----------

function keyboard(): Omit<DeviceDef, 'key' | 'name' | 'source'> {
  const rows: [string, number][][] = [
    [['Esc', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1], ['Del', 2]],
    [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['⌫', 2]],
    [['Tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.5]],
    [['Caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['Enter', 2.25]],
    [['Shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['Shift', 2.75]],
    [['Ctrl', 1.25], ['Fn', 1], ['Win', 1.25], ['Alt', 1.25], ['', 4.25], ['Alt', 1], ['Ctrl', 1], ['←', 1], ['↑', 1], ['↓', 1], ['→', 1]]
  ]
  const leds: LedCell[] = []
  rows.forEach((row, y) => {
    let x = 0
    for (const [label, w] of row) {
      leds.push({ x: x + 0.06, y: y + 0.06, w: w - 0.12, h: 0.88, label })
      x += w
    }
  })
  return { kind: 'keyboard', gridW: 15, gridH: 6, leds, shape: 'key' }
}

function ring(count: number, radius: number, kind: DeviceKind): Omit<DeviceDef, 'key' | 'name' | 'source'> {
  const size = radius * 2 + 1
  const c = size / 2
  const leds = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2
    return { x: c + Math.cos(a) * radius - 0.5, y: c + Math.sin(a) * radius - 0.5, w: 1, h: 1 }
  })
  return { kind, gridW: size, gridH: size, leds, shape: 'dot' }
}

function strip(count: number): Omit<DeviceDef, 'key' | 'name' | 'source'> {
  return {
    kind: 'strip',
    gridW: count,
    gridH: 1,
    leds: Array.from({ length: count }, (_, i) => ({ x: i, y: 0, w: 1, h: 1 })),
    shape: 'dot'
  }
}

/** LEDs around the edge of a w×h rectangle, clockwise from top-left. */
function perimeter(w: number, h: number, kind: DeviceKind): Omit<DeviceDef, 'key' | 'name' | 'source'> {
  const leds: LedCell[] = []
  for (let x = 0; x < w; x++) leds.push({ x, y: 0, w: 1, h: 1 })
  for (let y = 1; y < h - 1; y++) leds.push({ x: w - 1, y, w: 1, h: 1 })
  for (let x = w - 1; x >= 0; x--) leds.push({ x, y: h - 1, w: 1, h: 1 })
  for (let y = h - 2; y >= 1; y--) leds.push({ x: 0, y, w: 1, h: 1 })
  return { kind, gridW: w, gridH: h, leds, shape: 'dot' }
}

function mouse(): Omit<DeviceDef, 'key' | 'name' | 'source'> {
  const leds: LedCell[] = [
    { x: 1, y: 0.6, w: 1, h: 1, label: 'Wheel' },
    { x: 1, y: 3.6, w: 1, h: 1, label: 'Logo' },
    ...Array.from({ length: 4 }, (_, i) => ({ x: 0, y: 1 + i, w: 1, h: 1 })),
    ...Array.from({ length: 4 }, (_, i) => ({ x: 2, y: 1 + i, w: 1, h: 1 }))
  ]
  return { kind: 'mouse', gridW: 3, gridH: 5.6, leds, shape: 'dot' }
}

export const VIRTUAL_PRESETS: { id: string; name: string; make: () => Omit<DeviceDef, 'key' | 'name' | 'source'> }[] = [
  { id: 'keyboard', name: 'Laptop Keyboard', make: keyboard },
  { id: 'mouse', name: 'Gaming Mouse', make: mouse },
  { id: 'fan', name: '120mm RGB Fan', make: () => ring(16, 4, 'fan') },
  { id: 'strip', name: 'LED Strip (30)', make: () => strip(30) },
  { id: 'strip60', name: 'LED Strip (60)', make: () => strip(60) },
  { id: 'monitor', name: 'Monitor Backlight', make: () => perimeter(24, 14, 'monitor') },
  { id: 'mousepad', name: 'RGB Mousepad', make: () => perimeter(18, 8, 'mousepad') }
]

export function createVirtual(presetId: string, existingKeys: string[]): DeviceDef {
  const preset = VIRTUAL_PRESETS.find((p) => p.id === presetId) ?? VIRTUAL_PRESETS[0]
  let n = 1
  while (existingKeys.includes(`virtual:${preset.id}:${n}`)) n++
  return {
    ...preset.make(),
    key: `virtual:${preset.id}:${n}`,
    name: n > 1 ? `${preset.name} ${n}` : preset.name,
    source: 'virtual'
  }
}

// ---------- OpenRGB devices ----------

const ORGB_KIND: Record<number, DeviceKind> = { 5: 'keyboard', 6: 'mouse', 7: 'mousepad', 4: 'strip', 3: 'fan' }

export function fromHardware(d: HardwareDevice): DeviceDef {
  const leds: LedCell[] = new Array(d.ledCount)
  let offset = 0
  let row = 0
  let gridW = 1
  for (const z of d.zones) {
    if (z.type === 2 && z.matrix && z.matrix.width > 0) {
      const { width, height, keys } = z.matrix
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = keys[y]?.[x]
          if (idx == null || idx >= z.ledsCount) continue
          const label = d.ledNames[offset + idx]?.replace(/^Key:\s*/, '')
          leds[offset + idx] = { x: x + 0.06, y: row + y + 0.06, w: 0.88, h: 0.88, label }
        }
      }
      // Any zone LEDs missing from the matrix go on a line below it.
      let extra = 0
      for (let i = 0; i < z.ledsCount; i++) {
        if (!leds[offset + i]) leds[offset + i] = { x: extra++, y: row + height, w: 1, h: 1 }
      }
      gridW = Math.max(gridW, width, extra)
      row += height + (extra ? 1 : 0) + 1
    } else {
      const count = Math.max(1, z.ledsCount)
      for (let i = 0; i < z.ledsCount; i++) leds[offset + i] = { x: i, y: row, w: 1, h: 1 }
      gridW = Math.max(gridW, count)
      row += 2
    }
    offset += z.ledsCount
  }
  // LEDs not covered by any zone (shouldn't happen, but stay safe)
  for (let i = 0; i < leds.length; i++) if (!leds[i]) leds[i] = { x: i % gridW, y: row, w: 1, h: 1 }
  const isMatrix = d.zones.some((z) => z.type === 2)
  return {
    key: `openrgb:${d.name}:${d.id}`,
    name: d.name,
    kind: ORGB_KIND[d.type] ?? (isMatrix ? 'matrix' : 'other'),
    source: 'openrgb',
    hardwareId: d.id,
    gridW,
    gridH: Math.max(1, row - 1),
    leds,
    shape: isMatrix ? 'key' : 'dot'
  }
}

// ---------- placement + sampling ----------

export function defaultPlacement(def: DeviceDef, index: number): Placement {
  const maxW = 280
  const maxH = 150
  const scale = Math.max(2, Math.min(maxW / def.gridW, maxH / def.gridH, 18))
  const w = def.gridW * scale
  const h = def.gridH * scale
  const jitter = (index % 4) * 12
  return { x: Math.round((320 - w) / 2) + jitter, y: Math.round((200 - h) / 2) + jitter, scale, rotation: 0, enabled: true }
}

/** Placement that fits the device to the whole 320x200 canvas (used when it runs its own effect). */
export function fitPlacement(d: DeviceDef): Placement {
  const scale = Math.min(304 / d.gridW, 184 / d.gridH)
  return { x: (320 - d.gridW * scale) / 2, y: (200 - d.gridH * scale) / 2, scale, rotation: 0, enabled: true }
}

/** Canvas-space centre of every LED (x0,y0,x1,y1,…). */
export function ledCanvasPoints(d: LayoutDevice): Float32Array {
  const pts = new Float32Array(d.leds.length * 2)
  const cx = (d.gridW * d.scale) / 2
  const cy = (d.gridH * d.scale) / 2
  const rad = (d.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  d.leds.forEach((l, i) => {
    const lx = (l.x + l.w / 2) * d.scale - cx
    const ly = (l.y + l.h / 2) * d.scale - cy
    pts[i * 2] = d.x + cx + lx * cos - ly * sin
    pts[i * 2 + 1] = d.y + cy + lx * sin + ly * cos
  })
  return pts
}

/** Average a 3x3 neighbourhood for each LED; returns packed RGB. */
export function sampleLeds(frame: Uint8ClampedArray, pts: Float32Array, out: Uint8Array, brightness: number): void {
  const n = pts.length / 2
  for (let i = 0; i < n; i++) {
    const px = Math.round(pts[i * 2])
    const py = Math.round(pts[i * 2 + 1])
    let r = 0
    let g = 0
    let b = 0
    let c = 0
    for (let dy = -1; dy <= 1; dy++) {
      const y = py + dy
      if (y < 0 || y >= 200) continue
      for (let dx = -1; dx <= 1; dx++) {
        const x = px + dx
        if (x < 0 || x >= 320) continue
        const o = (y * 320 + x) * 4
        r += frame[o]
        g += frame[o + 1]
        b += frame[o + 2]
        c++
      }
    }
    const k = c ? brightness / c : 0
    out[i * 3] = r * k
    out[i * 3 + 1] = g * k
    out[i * 3 + 2] = b * k
  }
}
