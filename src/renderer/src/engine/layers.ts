import layerEngineSource from './layerEngine.js?raw'

export type ParamKind = 'number' | 'color' | 'colors' | 'select' | 'boolean'

export interface ParamSpec {
  key: string
  label: string
  kind: ParamKind
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  default: number | string | boolean | string[]
}

export type ModSource = 'bass' | 'mid' | 'treble' | 'level' | 'beat' | 'lfo'

export interface Modulator {
  param: string
  source: ModSource
  amount: number // -100..100 (% of the parameter's range)
  range?: number
}

export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply' | 'overlay' | 'difference' | 'lighten' | 'darken' | 'dodge' | 'hue' | 'color'

export interface Layer {
  id: string
  type: string
  name: string
  visible: boolean
  opacity: number
  blend: BlendMode
  params: Record<string, number | string | boolean | string[]>
  mods: Modulator[]
}

export interface LayerConfig {
  version: 1
  background: string
  speed: number
  layers: Layer[]
}

export interface LayerType {
  type: string
  name: string
  description: string
  /** Preview swatch (CSS background) for the add-layer menu. */
  swatch: string
  audio?: boolean
  params: ParamSpec[]
}

const n = (key: string, label: string, def: number, min = 0, max = 100, step = 1): ParamSpec => ({
  key,
  label,
  kind: 'number',
  default: def,
  min,
  max,
  step
})
const color = (key: string, label: string, def: string): ParamSpec => ({ key, label, kind: 'color', default: def })
const select = (key: string, label: string, def: string, options: [string, string][]): ParamSpec => ({
  key,
  label,
  kind: 'select',
  default: def,
  options: options.map(([value, l]) => ({ value, label: l }))
})
const bool = (key: string, label: string, def: boolean): ParamSpec => ({ key, label, kind: 'boolean', default: def })
const shapeStyle = select('style', 'Shape', 'linear', [
  ['linear', 'Linear'],
  ['radial', 'Radial'],
  ['conic', 'Spin']
])

export const LAYER_TYPES: LayerType[] = [
  {
    type: 'rainbow',
    name: 'Rainbow',
    description: 'Full-spectrum colour bands',
    swatch: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
    params: [shapeStyle, n('angle', 'Angle', 0, 0, 360), n('speed', 'Speed', 30, -200, 200), n('scale', 'Bands', 100, 10, 400), n('saturation', 'Saturation', 100)]
  },
  {
    type: 'gradient',
    name: 'Gradient',
    description: 'Smooth blend of your colours',
    swatch: 'linear-gradient(90deg,#ff2d95,#7a3cff,#00c8ff)',
    params: [
      { key: 'colors', label: 'Colours', kind: 'colors', default: ['#ff2d95', '#7a3cff', '#00c8ff'] },
      shapeStyle,
      n('angle', 'Angle', 0, 0, 360),
      n('speed', 'Speed', 15, -200, 200),
      n('scale', 'Repeat', 100, 10, 400)
    ]
  },
  {
    type: 'solid',
    name: 'Solid',
    description: 'One flat colour',
    swatch: '#00b4ff',
    params: [color('color', 'Colour', '#00b4ff')]
  },
  {
    type: 'wave',
    name: 'Wave',
    description: 'Rolling bands between two colours',
    swatch: 'repeating-linear-gradient(90deg,#00e5ff 0 10px,#2a0060 10px 20px)',
    params: [
      color('color', 'Colour', '#00e5ff'),
      color('color2', 'Background', '#120030'),
      select('style', 'Shape', 'linear', [
        ['linear', 'Linear'],
        ['radial', 'Radial']
      ]),
      n('angle', 'Angle', 0, 0, 360),
      n('frequency', 'Waves', 3, 0.5, 20, 0.5),
      n('speed', 'Speed', 40, -200, 200),
      n('sharpness', 'Sharpness', 30)
    ]
  },
  {
    type: 'stripes',
    name: 'Stripes',
    description: 'Moving two-colour stripes',
    swatch: 'repeating-linear-gradient(45deg,#ffd000 0 8px,#ff0060 8px 16px)',
    params: [
      color('color', 'Colour A', '#ffd000'),
      color('color2', 'Colour B', '#ff0060'),
      n('count', 'Stripes', 4, 1, 30),
      n('angle', 'Angle', 45, 0, 360),
      n('speed', 'Speed', 30, -200, 200),
      n('softness', 'Softness', 20)
    ]
  },
  {
    type: 'plasma',
    name: 'Plasma',
    description: 'Liquid swirling colour field',
    swatch: 'radial-gradient(circle at 30% 30%,#ff0080,#7000ff 50%,#00e0ff)',
    params: [
      { key: 'colors', label: 'Colours', kind: 'colors', default: ['#ff0080', '#7000ff', '#00e0ff'] },
      n('speed', 'Speed', 30, 0, 200),
      n('scale', 'Size', 100, 10, 300)
    ]
  },
  {
    type: 'noise',
    name: 'Clouds',
    description: 'Drifting aurora / smoke',
    swatch: 'radial-gradient(circle at 60% 40%,#00ffa0,#003040 70%)',
    params: [
      color('color', 'Colour', '#00ffa0'),
      color('color2', 'Colour 2', '#2050ff'),
      n('speed', 'Speed', 25, 0, 200),
      n('scale', 'Size', 100, 10, 300),
      n('contrast', 'Contrast', 40)
    ]
  },
  {
    type: 'fire',
    name: 'Fire',
    description: 'Rising flames',
    swatch: 'linear-gradient(0deg,#ffd23c,#ff7a00 30%,#d01000 60%,#000)',
    params: [
      select('palette', 'Palette', 'fire', [
        ['fire', 'Fire'],
        ['ice', 'Ice'],
        ['toxic', 'Toxic'],
        ['purple', 'Purple']
      ]),
      n('intensity', 'Intensity', 90, 0, 150),
      n('speed', 'Speed', 50)
    ]
  },
  {
    type: 'sparkles',
    name: 'Sparkles',
    description: 'Twinkling points of light',
    swatch: 'radial-gradient(circle,#fff 0 2px,transparent 3px) 0 0/12px 12px,#111',
    params: [color('color', 'Colour', '#ffffff'), bool('rainbow', 'Rainbow', false), n('density', 'Amount', 40), n('size', 'Size', 14, 1, 60), n('speed', 'Speed', 40)]
  },
  {
    type: 'ripples',
    name: 'Ripples',
    description: 'Expanding rings (also on every beat)',
    swatch: 'repeating-radial-gradient(circle,#00c8ff 0 2px,transparent 3px 9px),#050510',
    params: [
      color('color', 'Colour', '#00c8ff'),
      bool('rainbow', 'Rainbow', true),
      n('rate', 'Frequency', 25),
      n('speed', 'Speed', 40),
      n('thickness', 'Thickness', 14, 1, 60),
      select('origin', 'Start from', 'random', [
        ['random', 'Random spots'],
        ['center', 'Centre']
      ])
    ]
  },
  {
    type: 'orbs',
    name: 'Orbs',
    description: 'Glowing balls drifting around',
    swatch: 'radial-gradient(circle at 35% 50%,#ff3ca0 0 18%,transparent 40%),radial-gradient(circle at 70% 40%,#3cf 0 16%,transparent 38%),#080812',
    params: [color('color', 'Colour', '#ff3ca0'), bool('rainbow', 'Rainbow', true), n('count', 'Count', 4, 1, 12), n('size', 'Size', 60, 5, 200), n('speed', 'Speed', 40)]
  },
  {
    type: 'scanner',
    name: 'Scanner',
    description: 'A bar sweeping back and forth',
    swatch: 'linear-gradient(90deg,transparent 30%,#f02 50%,transparent 70%),#100',
    params: [color('color', 'Colour', '#ff1a2e'), n('width', 'Width', 25, 1, 100), n('angle', 'Angle', 0, 0, 360), n('speed', 'Speed', 40)]
  },
  {
    type: 'spectrum',
    name: 'Music Bars',
    description: 'Audio spectrum bars',
    swatch: 'linear-gradient(90deg,#00e5ff,#ff00c8)',
    audio: true,
    params: [
      color('color', 'Low colour', '#00e5ff'),
      color('color2', 'High colour', '#ff00c8'),
      select('style', 'Style', 'bottom', [
        ['bottom', 'From bottom'],
        ['center', 'From centre'],
        ['mirror', 'Mirrored']
      ]),
      n('gain', 'Sensitivity', 100, 10, 300)
    ]
  },
  {
    type: 'pulse',
    name: 'Pulse',
    description: 'A glow — connect it to the music',
    swatch: 'radial-gradient(circle,#fff,#7a3cff 40%,#000 75%)',
    params: [
      color('color', 'Colour', '#7a3cff'),
      select('shape', 'Shape', 'circle', [
        ['circle', 'Circle'],
        ['full', 'Everything']
      ]),
      n('level', 'Level', 20)
    ]
  }
]

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'add', label: 'Add (glow)' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'difference', label: 'Difference' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'darken', label: 'Darken' },
  { value: 'dodge', label: 'Colour dodge' },
  { value: 'hue', label: 'Hue' },
  { value: 'color', label: 'Colour' }
]

export const MOD_SOURCES: { value: ModSource; label: string }[] = [
  { value: 'bass', label: 'Bass' },
  { value: 'mid', label: 'Mids' },
  { value: 'treble', label: 'Treble' },
  { value: 'level', label: 'Volume' },
  { value: 'beat', label: 'Beat hit' },
  { value: 'lfo', label: 'Slow wobble' }
]

export function layerType(type: string): LayerType | undefined {
  return LAYER_TYPES.find((t) => t.type === type)
}

let idCounter = 0
export function newId(): string {
  idCounter++
  return `l${Date.now().toString(36)}${idCounter}`
}

export function createLayer(type: string, overrides: Partial<Layer> & { params?: Layer['params'] } = {}): Layer {
  const spec = layerType(type) ?? LAYER_TYPES[0]
  const params: Layer['params'] = {}
  for (const p of spec.params) params[p.key] = Array.isArray(p.default) ? [...p.default] : p.default
  return {
    id: newId(),
    type: spec.type,
    name: spec.name,
    visible: true,
    opacity: 100,
    blend: 'normal',
    mods: [],
    ...overrides,
    params: { ...params, ...(overrides.params ?? {}) }
  }
}

/** Parameter range used to scale modulation amounts. */
export function paramRange(type: string, key: string): number {
  if (key === 'opacity') return 100
  const p = layerType(type)?.params.find((x) => x.key === key)
  return p && p.min !== undefined && p.max !== undefined ? p.max - p.min : 100
}

export function usesAudio(config: LayerConfig): boolean {
  return config.layers.some(
    (l) => l.visible && (layerType(l.type)?.audio || l.mods.some((m) => m.source !== 'lfo'))
  )
}

export interface Template {
  name: string
  description: string
  build: () => LayerConfig
}

const cfg = (layers: Layer[], background = '#000000'): LayerConfig => ({ version: 1, background, speed: 100, layers })

export const TEMPLATES: Template[] = [
  { name: 'Blank', description: 'Start from nothing', build: () => cfg([createLayer('solid', { params: { color: '#101018' } })]) },
  {
    name: 'Neon Night',
    description: 'Cyan waves with white sparkles',
    build: () =>
      cfg([
        createLayer('wave', { params: { color: '#00e5ff', color2: '#2a0050', frequency: 2.5, speed: 35, angle: 20 } }),
        createLayer('sparkles', { blend: 'add', params: { density: 35, size: 12 } })
      ])
  },
  {
    name: 'Sunset Drift',
    description: 'Warm gradient under slow clouds',
    build: () =>
      cfg([
        createLayer('gradient', { params: { colors: ['#ff6a00', '#ff2d78', '#6a1bff'], angle: 90, speed: 8 } }),
        createLayer('noise', { blend: 'overlay', opacity: 70, params: { color: '#ffd6a0', color2: '#401060', speed: 15 } })
      ])
  },
  {
    name: 'Party Mode',
    description: 'Spinning rainbow, bars and beat ripples',
    build: () =>
      cfg([
        createLayer('rainbow', {
          opacity: 55,
          params: { style: 'conic', speed: 40 },
          mods: [{ param: 'speed', source: 'bass', amount: 40 }]
        }),
        createLayer('spectrum', { blend: 'add', params: { style: 'mirror' } }),
        createLayer('ripples', { blend: 'add', params: { rate: 0, origin: 'center', speed: 70 } })
      ])
  },
  {
    name: 'Deep Ocean',
    description: 'Calm blue clouds and drifting orbs',
    build: () =>
      cfg([
        createLayer('noise', { params: { color: '#00b4ff', color2: '#002060', speed: 18, scale: 140 } }),
        createLayer('orbs', { blend: 'screen', opacity: 60, params: { rainbow: false, color: '#40ffd0', count: 3, size: 70, speed: 15 } })
      ])
  },
  {
    name: 'Campfire',
    description: 'Flames with floating embers',
    build: () =>
      cfg([
        createLayer('fire', { params: { intensity: 95, speed: 45 } }),
        createLayer('sparkles', { blend: 'add', params: { color: '#ffa040', density: 20, size: 8, speed: 30 } })
      ])
  },
  {
    name: 'Bass Drop',
    description: 'Purple glow that punches with the bass',
    build: () =>
      cfg([
        createLayer('plasma', { opacity: 45, params: { colors: ['#30006a', '#8000ff', '#ff00a0'], speed: 20 } }),
        createLayer('pulse', {
          blend: 'add',
          params: { color: '#b040ff', shape: 'circle', level: 10 },
          mods: [{ param: 'level', source: 'bass', amount: 90 }]
        })
      ])
  }
]

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function generateLayersHtml(name: string, description: string, config: LayerConfig): string {
  const json = JSON.stringify(config, null, 1).replace(/</g, '\\u003c')
  const inputs = usesAudio(config) ? '\n  <meta inputs="audio" />' : ''
  return `<head>
  <title>${escAttr(name)}</title>
  <meta description="${escAttr(description)}" />
  <meta publisher="Lumora Creator" />
  <meta tags="custom${usesAudio(config) ? ',audio' : ''}" />${inputs}
</head>
<body style="margin:0;padding:0;background:#000;overflow:hidden">
  <canvas width="320" height="200"></canvas>
  <script type="application/json" id="lumora-layers">${json}</script>
  <script>
${layerEngineSource}
  </script>
</body>
`
}

export function parseLayersHtml(html: string): { name: string; description: string; config: LayerConfig } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const el = doc.getElementById('lumora-layers')
  if (!el) return null
  try {
    const config = JSON.parse(el.textContent ?? '') as LayerConfig
    if (!Array.isArray(config.layers)) return null
    return {
      name: doc.querySelector('title')?.textContent?.trim() ?? 'My Effect',
      description: doc.querySelector('meta[description]')?.getAttribute('description') ?? '',
      config
    }
  } catch {
    return null
  }
}
