import type { ReactNode } from 'react'

export function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  suffix?: string
  title?: string
}) {
  const { label, value, min, max, step, onChange, suffix, title } = props
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  const shown = Number.isInteger(step ?? 1) ? Math.round(value) : value.toFixed(1)
  return (
    <label className="field" title={title}>
      <div className="field-row">
        <span className="field-label">{label}</span>
        <span className="field-value">
          {shown}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}

export function ColorField(props: { label: string; value: string; onChange: (v: string) => void; title?: string }) {
  return (
    <div className="field-row" title={props.title}>
      <span className="field-label">{props.label}</span>
      <div className="row">
        <span className="small faint" style={{ fontFamily: 'Cascadia Mono, Consolas, monospace' }}>
          {props.value.toUpperCase()}
        </span>
        <ColorSwatch value={props.value} onChange={props.onChange} />
      </div>
    </div>
  )
}

export function ColorSwatch(props: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="swatch-input" style={{ background: props.value }}>
      <input type="color" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  )
}

export function Toggle(props: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      className={`toggle${props.on ? ' on' : ''}`}
      onClick={() => props.onChange(!props.on)}
    />
  )
}

export function ToggleField(props: { label: string; on: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-row">
        <span className="field-label">{props.label}</span>
        <Toggle on={props.on} onChange={props.onChange} label={props.label} />
      </div>
      {props.hint && <span className="small faint">{props.hint}</span>}
    </div>
  )
}

export function SelectField(props: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  if (props.options.length <= 3 && props.options.every((o) => o.label.length < 12)) {
    return (
      <div className="field">
        <span className="field-label">{props.label}</span>
        <div className="segmented">
          {props.options.map((o) => (
            <button key={o.value} type="button" className={o.value === props.value ? 'on' : ''} onClick={() => props.onChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <select className="select" value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
