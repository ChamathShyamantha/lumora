import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { selectLayout, useApp } from '../store'
import { defaultPlacement } from '../engine/devices'
import { SetupPreview } from '../components/SetupPreview'
import { Slider, ToggleField } from '../components/controls'
import { IconRotate } from '../components/icons'

export function LayoutView() {
  const state = useApp(useShallow((s) => ({ virtualDevices: s.virtualDevices, hardware: s.hardware, placements: s.placements })))
  const devices = useMemo(() => selectLayout(state), [state])
  const updatePlacement = useApp((s) => s.updatePlacement)
  const setView = useApp((s) => s.setView)
  const effects = useApp((s) => s.effects)
  const deviceEffects = useApp((s) => s.deviceEffects)
  const setDeviceEffect = useApp((s) => s.setDeviceEffect)
  const effectName = (id: string | undefined): string | null => (id ? (effects.find((e) => e.id === id)?.meta.title ?? null) : null)
  const grouped = useMemo(() => {
    const map = new Map<string, typeof effects>()
    for (const e of effects) {
      const cat = e.meta.category || (e.source === 'user' ? 'My Creations' : 'Other')
      map.set(cat, [...(map.get(cat) ?? []), e])
    }
    return [...map.entries()]
  }, [effects])
  const [selectedKey, setSelectedKey] = useState<string | null>(devices[0]?.key ?? null)
  const [showFrame, setShowFrame] = useState(true)
  const selected = devices.find((d) => d.key === selectedKey)

  const autoArrange = (): void => {
    const n = devices.length
    if (!n) return
    const cols = Math.ceil(Math.sqrt(n))
    const rows = Math.ceil(n / cols)
    const cw = 320 / cols
    const ch = 200 / rows
    devices.forEach((d, i) => {
      const scale = Math.max(1.5, Math.min((cw - 10) / d.gridW, (ch - 10) / d.gridH, 18))
      const col = i % cols
      const row = Math.floor(i / cols)
      updatePlacement(d.key, {
        scale,
        rotation: 0,
        x: Math.round(col * cw + (cw - d.gridW * scale) / 2),
        y: Math.round(row * ch + (ch - d.gridH * scale) / 2)
      })
    })
  }

  return (
    <div className="view-split">
      <div className="view">
        <div className="view-head">
          <h1>Layout</h1>
          <span className="faint">Place your devices on the effect canvas. Drag to move, scroll to resize.</span>
          <div className="grow" />
          <ToggleField label="Show effect" on={showFrame} onChange={setShowFrame} />
          <button className="btn" onClick={autoArrange}>
            Auto-arrange
          </button>
        </div>
        <SetupPreview interactive showFrame={showFrame} selectedKey={selectedKey} onSelect={setSelectedKey} />
        <p className="small faint" style={{ marginTop: 10 }}>
          Each LED takes the colour of the effect underneath it. Spreading devices out across the canvas makes waves travel across your whole
          setup; overlapping them makes them match.
        </p>
      </div>
      <aside className="side-panel">
        <h3>Devices in layout</h3>
        <div className="device-list">
          {devices.map((d) => (
            <div key={d.key} className={`device-row${d.key === selectedKey ? ' selected' : ''}`} onClick={() => setSelectedKey(d.key)}>
              <span className={`dot ${d.enabled ? 'ok' : ''}`} />
              <div className="grow">
                <div className="name">{d.name}</div>
                <div className="small faint">
                  {d.leds.length} LEDs · {effectName(deviceEffects[d.key]) ?? 'main effect'}
                </div>
              </div>
            </div>
          ))}
          {devices.length === 0 && (
            <div className="empty small">
              No devices. <a onClick={() => setView('devices')}>Add some in Devices</a>.
            </div>
          )}
        </div>
        {selected && (
          <div className="card stack">
            <h3>{selected.name}</h3>
            <ToggleField label="Enabled" on={selected.enabled} onChange={(v) => updatePlacement(selected.key, { enabled: v })} />
            <label className="field">
              <span className="field-label">Effect</span>
              <select
                className="select"
                value={deviceEffects[selected.key] ?? ''}
                onChange={(e) => setDeviceEffect(selected.key, e.target.value || null)}
              >
                <option value="">Same as main effect</option>
                {grouped.map(([cat, list]) => (
                  <optgroup key={cat} label={cat}>
                    {list.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.meta.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="small faint">
                {deviceEffects[selected.key]
                  ? 'This device runs its own effect, filling the whole effect on this device (its position on the canvas no longer matters). Settings and brightness are the ones you set for that effect in Effects.'
                  : 'Follows whatever you play in Effects.'}
              </span>
            </label>
            <Slider label="Size" value={selected.scale} min={1} max={60} step={0.1} onChange={(v) => updatePlacement(selected.key, { scale: v })} />
            <Slider label="Rotation" value={selected.rotation} min={-180} max={180} suffix="°" onChange={(v) => updatePlacement(selected.key, { rotation: v })} />
            <Slider label="Left" value={selected.x} min={-100} max={320} onChange={(v) => updatePlacement(selected.key, { x: v })} />
            <Slider label="Top" value={selected.y} min={-100} max={200} onChange={(v) => updatePlacement(selected.key, { y: v })} />
            <div className="row">
              <button
                className="btn sm"
                onClick={() => updatePlacement(selected.key, { rotation: ((selected.rotation + 90 + 180) % 360) - 180 })}
              >
                <IconRotate /> Rotate 90°
              </button>
              <button className="btn sm ghost" onClick={() => updatePlacement(selected.key, defaultPlacement(selected, 0))}>
                Reset
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
