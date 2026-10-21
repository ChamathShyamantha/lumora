import effectApiDoc from '../../../../docs/EFFECT_API.md?raw'
import {
  BLEND_MODES,
  LAYER_TYPES,
  MOD_SOURCES,
  createLayer,
  paramRange,
  type Layer,
  type LayerConfig,
  type ParamSpec
} from './layers'
import { parseEffectMeta } from './effectMeta'
import type { LayoutDevice } from './devices'
import type { AiConnection, AiResult } from '../types'

export type AiMode = 'layers' | 'code'

export const AI_EXAMPLES = [
  'Calm ocean at night with slow drifting blue waves',
  'Cyberpunk neon rain in pink and cyan',
  'Red and purple glow that punches with the bass',
  'Cozy campfire with floating embers',
  'Northern lights over a dark sky',
  'Party mode: fast rainbow that explodes on every beat'
]

const HEX = /^#[0-9a-f]{6}$/i

// ---------- schema (structured outputs) ----------

function paramSchema(p: ParamSpec): Record<string, unknown> {
  switch (p.kind) {
    case 'number':
      return { type: 'number', description: `${p.label}: ${p.min} to ${p.max}` }
    case 'color':
      return { type: 'string', description: `${p.label}: hex colour like #ff2d95` }
    case 'boolean':
      return { type: 'boolean', description: p.label }
    case 'select':
      return { type: 'string', enum: (p.options ?? []).map((o) => o.value), description: p.label }
    case 'colors':
      return { type: 'array', items: { type: 'string' }, description: `${p.label}: 2 to 6 hex colours` }
  }
}

function layerVariant(t: (typeof LAYER_TYPES)[number]): Record<string, unknown> {
  const numeric = t.params.filter((p) => p.kind === 'number').map((p) => p.key)
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: [t.type] },
      name: { type: 'string', description: 'Short friendly layer name' },
      visible: { type: 'boolean' },
      opacity: { type: 'number', description: '0 to 100' },
      blend: { type: 'string', enum: BLEND_MODES.map((b) => b.value) },
      params: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(t.params.map((p) => [p.key, paramSchema(p)])),
        required: t.params.map((p) => p.key)
      },
      mods: {
        type: 'array',
        description: 'Music/LFO links. Empty unless the effect should react.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            param: { type: 'string', enum: ['opacity', ...numeric] },
            source: { type: 'string', enum: MOD_SOURCES.map((s) => s.value) },
            amount: { type: 'number', description: '-100 to 100 (% of the parameter range)' }
          },
          required: ['param', 'source', 'amount']
        }
      }
    },
    required: ['type', 'name', 'visible', 'opacity', 'blend', 'params', 'mods']
  }
}

const LAYERS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Catchy effect name, max 4 words' },
    description: { type: 'string', description: 'One sentence describing the look' },
    background: { type: 'string', description: 'Hex colour behind all layers, usually #000000' },
    speed: { type: 'number', description: 'Overall speed %, 0 to 300, normally 100' },
    layers: { type: 'array', description: 'Bottom layer first, 1 to 6 layers', items: { anyOf: LAYER_TYPES.map(layerVariant) } }
  },
  required: ['name', 'description', 'background', 'speed', 'layers']
}

const CODE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Catchy effect name, max 4 words' },
    description: { type: 'string', description: 'One sentence describing the look' },
    html: { type: 'string', description: 'The complete effect HTML file' }
  },
  required: ['name', 'description', 'html']
}

// ---------- prompts (kept byte-stable so the system prompt caches) ----------

function describeLayerTypes(): string {
  return LAYER_TYPES.map((t) => {
    const params = t.params
      .map((p) => {
        if (p.kind === 'number') return `${p.key} (${p.label}, ${p.min}..${p.max}, default ${p.default})`
        if (p.kind === 'select') return `${p.key} (${p.label}: ${(p.options ?? []).map((o) => o.value).join('|')})`
        if (p.kind === 'colors') return `${p.key} (list of 2-6 hex colours)`
        return `${p.key} (${p.label}, ${p.kind})`
      })
      .join('; ')
    return `- ${t.type}: ${t.description}${t.audio ? ' [uses music]' : ''}. Params: ${params}`
  }).join('\n')
}

const LAYERS_SYSTEM = `You design lighting effects for Lumora, an RGB lighting app. An effect is a stack of procedural layers drawn on a 320x200 canvas; every LED on the user's keyboard, fans and strips takes the colour of the canvas pixel under it. You output the layer stack as JSON.

How it renders
- Layers are composited bottom (first in the array) to top. Each layer has opacity 0-100 and a blend mode: ${BLEND_MODES.map((b) => b.value).join(', ')}.
- "add" (glow) and "screen" are the right blends for light-like layers on top (sparkles, ripples, orbs, music bars, pulse, scanner). Fully opaque base layers (gradient, rainbow, plasma, clouds, fire, wave, stripes, solid) normally go at the bottom with "normal".
- Speeds are in each type's own units; around 20-50 is calm, 80+ is energetic. Negative speeds reverse direction where allowed.
- "mods" link a numeric parameter (or opacity) to a live source: bass, mid, treble, level (volume), beat (a spike on every beat that decays), lfo (slow sine wobble, works without music). amount is -100..100 percent of that parameter's range. Use music sources only when the user wants it to react to music/sound/beat; lfo is good for subtle breathing.

Layer types
${describeLayerTypes()}

What looks good on LEDs
- LEDs are sampled sparsely: broad shapes, smooth gradients and saturated colours read well; tiny details vanish. Black means the LED is off, so keep some light everywhere unless darkness is the point.
- 1-4 layers is usually best. A base layer plus one or two accents beats a crowded stack.
- Match the mood the user describes: palette, energy, speed. Pick colours deliberately (provide real hex values).
- Every parameter must be filled with a sensible value within its range.

When asked to modify an existing effect, change only what the request asks for and keep the rest of the design as it is.`

export const CODE_SYSTEM = `You write lighting effects for Lumora, an RGB lighting app. An effect is ONE self-contained HTML file that animates a 320x200 canvas; every LED on the user's devices takes the colour of the canvas pixel under it. Output the complete file in the "html" field.

Here is the full effect API:

${effectApiDoc}

Requirements
- Follow the API exactly: <title>, <meta description>, <meta publisher="Lumora AI">, <meta tags>, 2-6 <meta property> controls with sensible defaults, one 320x200 <canvas>, inline <script> only. No external resources or network.
- Animate with requestAnimationFrame and the timestamp it passes (frame-rate independent). Schedule the next frame first so one error can't stop the loop.
- Guard optional inputs: typeof engine !== 'undefined'. If you use engine.audio, still look good when it is silent.
- Broad, smooth, saturated shapes look best on LEDs; black is "off".
- Write clean, original code.

When asked to modify an existing effect, keep its structure and change only what the request asks for.`

export function devicesSummary(devices: LayoutDevice[]): string {
  const on = devices.filter((d) => d.enabled)
  if (!on.length) return 'The user has no devices set up yet.'
  return (
    'The user\'s devices and where they sit on the 320x200 canvas:\n' +
    on
      .map((d) => {
        const w = Math.round(d.gridW * d.scale)
        const h = Math.round(d.gridH * d.scale)
        return `- ${d.name} (${d.kind}, ${d.leds.length} LEDs) at x=${Math.round(d.x)}..${Math.round(d.x) + w}, y=${Math.round(d.y)}..${Math.round(d.y) + h}`
      })
      .join('\n')
  )
}

// ---------- sanitising model output ----------

function sanitizeParam(p: ParamSpec, raw: unknown): Layer['params'][string] {
  switch (p.kind) {
    case 'number': {
      const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(p.default)
      return Math.min(p.max ?? 100, Math.max(p.min ?? 0, n))
    }
    case 'color':
      return typeof raw === 'string' && HEX.test(raw) ? raw.toLowerCase() : String(p.default)
    case 'boolean':
      return typeof raw === 'boolean' ? raw : Boolean(p.default)
    case 'select':
      return typeof raw === 'string' && (p.options ?? []).some((o) => o.value === raw) ? raw : String(p.default)
    case 'colors': {
      const list = Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string' && HEX.test(c)).map((c) => c.toLowerCase()) : []
      return list.length >= 2 ? list.slice(0, 6) : [...(p.default as string[])]
    }
  }
}

interface RawLayer {
  type?: unknown
  name?: unknown
  visible?: unknown
  opacity?: unknown
  blend?: unknown
  params?: Record<string, unknown>
  mods?: { param?: unknown; source?: unknown; amount?: unknown }[]
}

export function sanitizeLayersOutput(data: unknown): { name: string; description: string; config: LayerConfig } {
  const d = (data ?? {}) as { name?: unknown; description?: unknown; background?: unknown; speed?: unknown; layers?: RawLayer[] }
  const layers: Layer[] = []
  for (const raw of Array.isArray(d.layers) ? d.layers.slice(0, 8) : []) {
    const spec = LAYER_TYPES.find((t) => t.type === raw?.type)
    if (!spec) continue
    const params: Layer['params'] = {}
    for (const p of spec.params) params[p.key] = sanitizeParam(p, raw.params?.[p.key])
    const numeric = new Set(['opacity', ...spec.params.filter((p) => p.kind === 'number').map((p) => p.key)])
    const sources = new Set(MOD_SOURCES.map((s) => s.value as string))
    const mods = (Array.isArray(raw.mods) ? raw.mods : [])
      .filter((m) => typeof m?.param === 'string' && numeric.has(m.param) && typeof m.source === 'string' && sources.has(m.source))
      .slice(0, 4)
      .map((m) => ({
        param: m.param as string,
        source: m.source as Layer['mods'][number]['source'],
        amount: Math.max(-100, Math.min(100, typeof m.amount === 'number' ? m.amount : 50)),
        range: paramRange(spec.type, m.param as string)
      }))
    layers.push(
      createLayer(spec.type, {
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : spec.name,
        visible: raw.visible !== false,
        opacity: Math.max(0, Math.min(100, typeof raw.opacity === 'number' ? raw.opacity : 100)),
        blend: BLEND_MODES.some((b) => b.value === raw.blend) ? (raw.blend as Layer['blend']) : 'normal',
        params,
        mods
      })
    )
  }
  if (!layers.length) throw new Error('The AI design had no usable layers. Try again or rephrase.')
  return {
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 60) : 'AI Effect',
    description: typeof d.description === 'string' ? d.description.trim().slice(0, 200) : '',
    config: {
      version: 1,
      background: typeof d.background === 'string' && HEX.test(d.background) ? d.background.toLowerCase() : '#000000',
      speed: Math.max(0, Math.min(300, typeof d.speed === 'number' ? d.speed : 100)),
      layers
    }
  }
}

function sanitizeCodeOutput(data: unknown): { name: string; description: string; html: string } {
  const d = (data ?? {}) as { name?: unknown; description?: unknown; html?: unknown }
  const html = typeof d.html === 'string' ? d.html.trim() : ''
  if (!/<canvas[\s>]/i.test(html) || !/<script[\s>]/i.test(html)) throw new Error('The AI did not return a valid effect file. Try again.')
  const meta = parseEffectMeta(html)
  return {
    name: meta.title !== 'Untitled' ? meta.title : typeof d.name === 'string' ? d.name : 'AI Effect',
    description: typeof d.description === 'string' ? d.description : meta.description,
    html
  }
}

// ---------- public API ----------

export interface DesignRequest {
  conn: AiConnection
  mode: AiMode
  prompt: string
  devices: LayoutDevice[]
  /** When refining: the current effect to modify. */
  current?: { name: string; config?: LayerConfig; html?: string }
}

export type DesignResult =
  | { ok: true; mode: 'layers'; name: string; description: string; config: LayerConfig; usage: { input: number; output: number } }
  | { ok: true; mode: 'code'; name: string; description: string; html: string; usage: { input: number; output: number } }
  | { ok: false; error: string; code: string }

let reqCounter = 0

export function designEffect(req: DesignRequest): { id: string; done: Promise<DesignResult> } {
  const id = `ai${Date.now()}-${++reqCounter}`
  const parts = [devicesSummary(req.devices)]
  if (req.current?.config) {
    parts.push(`Current effect "${req.current.name}" (modify this):\n${JSON.stringify({ background: req.current.config.background, speed: req.current.config.speed, layers: req.current.config.layers.map(({ id: _id, ...l }) => l) })}`)
  } else if (req.current?.html) {
    parts.push(`Current effect file (modify this):\n${req.current.html}`)
  }
  parts.push(`${req.current ? 'Change request' : 'Effect the user wants'}: ${req.prompt.trim()}`)

  const isCode = req.mode === 'code'
  const done = window.lumora.ai
    .generate({
      id,
      conn: req.conn,
      system: isCode ? CODE_SYSTEM : LAYERS_SYSTEM,
      prompt: parts.join('\n\n'),
      schema: isCode ? CODE_SCHEMA : LAYERS_SCHEMA,
      effort: isCode ? 'high' : 'medium',
      maxTokens: isCode ? 32000 : 16000
    })
    .then((res: AiResult): DesignResult => {
      if (!res.ok) return res
      try {
        if (isCode) return { ok: true, mode: 'code', usage: res.usage, ...sanitizeCodeOutput(res.data) }
        return { ok: true, mode: 'layers', usage: res.usage, ...sanitizeLayersOutput(res.data) }
      } catch (err) {
        return { ok: false, code: 'bad_output', error: err instanceof Error ? err.message : String(err) }
      }
    })
  return { id, done }
}

export function cancelDesign(id: string): void {
  void window.lumora.ai.cancel(id)
}
