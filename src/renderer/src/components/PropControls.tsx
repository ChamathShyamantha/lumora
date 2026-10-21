import type { EffectProp, PropValue } from '../engine/effectMeta'
import { ColorField, SelectField, Slider, ToggleField } from './controls'

/** Auto-generated controls for an effect's <meta property> declarations. */
export function PropControls(props: {
  props: EffectProp[]
  values: Record<string, PropValue>
  onChange: (name: string, value: PropValue) => void
}) {
  if (props.props.length === 0) return <p className="small faint">This effect has no adjustable settings.</p>
  return (
    <div className="stack">
      {props.props.map((p) => {
        const v = props.values[p.name] ?? p.default
        switch (p.type) {
          case 'number':
          case 'hue':
            return (
              <Slider
                key={p.name}
                label={p.label}
                title={p.tooltip}
                value={Number(v)}
                min={p.min}
                max={p.max}
                step={p.step ?? ((p.max - p.min) <= 2 ? 0.01 : 1)}
                onChange={(x) => props.onChange(p.name, x)}
              />
            )
          case 'color':
            return <ColorField key={p.name} label={p.label} title={p.tooltip} value={String(v)} onChange={(x) => props.onChange(p.name, x)} />
          case 'boolean':
            return <ToggleField key={p.name} label={p.label} on={Boolean(v)} onChange={(x) => props.onChange(p.name, x)} />
          case 'combobox':
            return (
              <SelectField
                key={p.name}
                label={p.label}
                value={String(v)}
                options={p.values.map((x) => ({ value: x, label: x }))}
                onChange={(x) => props.onChange(p.name, x)}
              />
            )
          default:
            return (
              <label key={p.name} className="field">
                <span className="field-label">{p.label}</span>
                <input className="input" value={String(v)} onChange={(e) => props.onChange(p.name, e.target.value)} />
              </label>
            )
        }
      })}
    </div>
  )
}
