export type PropType = 'number' | 'hue' | 'color' | 'boolean' | 'combobox' | 'text'
export type PropValue = number | string | boolean

export interface EffectProp {
  name: string
  label: string
  type: PropType
  tooltip?: string
  min: number
  max: number
  step?: number
  values: string[]
  default: PropValue
}

export interface EffectMeta {
  title: string
  description: string
  publisher: string
  tags: string[]
  /** Library section (see EFFECT_API.md); '' when the effect doesn't declare one. */
  category: string
  energy: '' | 'calm' | 'lively' | 'intense'
  palette: string
  props: EffectProp[]
  needsAudio: boolean
  needsScreen: boolean
  /** True for effects authored with the visual layer editor. */
  isLayers: boolean
}

const KNOWN_TYPES: PropType[] = ['number', 'hue', 'color', 'boolean', 'combobox', 'text']

function attr(el: Element, name: string): string | null {
  return el.getAttribute(name)
}

export function coerceValue(prop: Pick<EffectProp, 'type' | 'values' | 'min' | 'max'>, raw: unknown): PropValue {
  switch (prop.type) {
    case 'boolean':
      if (typeof raw === 'boolean') return raw
      return raw === 1 || raw === '1' || String(raw).toLowerCase() === 'true'
    case 'number':
    case 'hue': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
      return Number.isFinite(n) ? n : prop.min
    }
    case 'color': {
      const s = String(raw ?? '').trim()
      if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase()
      if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + [...s.slice(1)].map((c) => c + c).join('')).toLowerCase()
      return '#ffffff'
    }
    case 'combobox': {
      const s = String(raw ?? '')
      return prop.values.includes(s) ? s : (prop.values[0] ?? s)
    }
    default:
      return String(raw ?? '')
  }
}

export function parseEffectMeta(html: string, fallbackTitle = 'Untitled'): EffectMeta {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const metas = Array.from(doc.querySelectorAll('meta'))
  const find = (key: string): string => metas.map((m) => attr(m, key)).find((v) => v != null) ?? ''

  const props: EffectProp[] = []
  for (const m of metas) {
    const name = attr(m, 'property')
    if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) continue
    const rawType = (attr(m, 'type') ?? 'text').toLowerCase()
    const type: PropType = (KNOWN_TYPES as string[]).includes(rawType)
      ? (rawType as PropType)
      : rawType === 'textfield'
        ? 'text'
        : 'text'
    const values = (attr(m, 'values') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    const min = parseFloat(attr(m, 'min') ?? '')
    const max = parseFloat(attr(m, 'max') ?? '')
    const step = parseFloat(attr(m, 'step') ?? '')
    const base = {
      type,
      values,
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : type === 'hue' ? 360 : 100
    }
    props.push({
      name,
      label: attr(m, 'label') ?? name,
      tooltip: attr(m, 'tooltip') ?? undefined,
      step: Number.isFinite(step) ? step : undefined,
      ...base,
      default: coerceValue(base, attr(m, 'default') ?? (type === 'boolean' ? '0' : ''))
    })
  }

  const isLayers = !!doc.getElementById('lumora-layers')
  // Layer effects always embed the engine (which mentions engine.audio), so
  // for them only the explicit <meta inputs> declaration counts.
  const scripts = isLayers
    ? ''
    : Array.from(doc.querySelectorAll('script'))
        .map((s) => s.textContent ?? '')
        .join('\n')

  return {
    title: doc.querySelector('title')?.textContent?.trim() || fallbackTitle,
    description: find('description'),
    publisher: find('publisher'),
    tags: find('tags')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    category: find('category').trim(),
    energy: (['calm', 'lively', 'intense'].includes(find('energy').trim()) ? find('energy').trim() : '') as EffectMeta['energy'],
    palette: find('palette').trim().toLowerCase(),
    props,
    needsAudio: /engine\s*\.\s*audio/.test(scripts) || find('inputs').includes('audio'),
    needsScreen: /engine\s*\.\s*zone/.test(scripts) || find('inputs').includes('screen'),
    isLayers
  }
}
