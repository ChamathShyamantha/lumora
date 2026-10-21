import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { lighting, type InputStatus } from '../engine/lighting'
import { VIRTUAL_PRESETS, fromHardware } from '../engine/devices'
import { Slider, Toggle, ToggleField } from '../components/controls'
import { IconPlus, IconRefresh, IconTrash } from '../components/icons'

export function Devices() {
  const s = useApp()
  const [host, setHost] = useState(s.openrgbHost)
  const [port, setPort] = useState(String(s.openrgbPort))
  const [screens, setScreens] = useState<{ id: string; name: string }[]>([])
  const [inputs, setInputs] = useState<InputStatus>(lighting().status)
  useEffect(() => lighting().onStatus(setInputs), [])
  useEffect(() => {
    void window.lumora.capture.screens().then(setScreens)
  }, [])

  const status = s.openrgbStatus
  const connect = (): void => {
    const p = parseInt(port, 10) || 6742
    s.setSettings({ openrgbHost: host.trim() || '127.0.0.1', openrgbPort: p })
    void window.lumora.openrgb.connect(host.trim() || '127.0.0.1', p)
  }

  return (
    <div className="view">
      <div className="view-head">
        <h1>Devices</h1>
        <span className="faint">Real hardware via OpenRGB, plus virtual devices to preview on any PC.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div className="stack">
          <div className="card stack">
            <div className="field-row">
              <h2>Hardware (OpenRGB)</h2>
              <span className="row small">
                <span className={`dot ${status.state === 'connected' ? 'ok' : status.state === 'connecting' ? 'warn' : status.error ? 'bad' : ''}`} />
                {status.state === 'connected' ? 'Connected' : status.state === 'connecting' ? 'Connecting…' : 'Not connected'}
              </span>
            </div>
            <p className="small muted">
              Lumora talks to your RGB hardware through OpenRGB — a free, open-source app that supports thousands of keyboards, mice, RAM,
              motherboards, fans and strips.
            </p>
            {status.state === 'disconnected' && status.error && (
              <p className="small" style={{ color: 'var(--bad)' }}>
                {status.error}
              </p>
            )}
            <div className="row">
              <input className="input" value={host} onChange={(e) => setHost(e.target.value)} style={{ flex: 1 }} aria-label="Host" />
              <input className="input" value={port} onChange={(e) => setPort(e.target.value)} style={{ width: 80 }} aria-label="Port" />
              {status.state === 'connected' ? (
                <button className="btn" onClick={() => window.lumora.openrgb.disconnect()}>
                  Disconnect
                </button>
              ) : (
                <button className="btn primary" onClick={connect} disabled={status.state === 'connecting'}>
                  Connect
                </button>
              )}
            </div>
            <ToggleField label="Connect automatically on start" on={s.openrgbAutoConnect} onChange={(v) => s.setSettings({ openrgbAutoConnect: v })} />
            {status.state !== 'connected' && (
              <ol className="steps small">
                <li>
                  Download OpenRGB from{' '}
                  <a href="#" onClick={(e) => (e.preventDefault(), window.lumora.app.openExternal('https://openrgb.org'))}>
                    openrgb.org
                  </a>{' '}
                  and run it once so it detects your devices.
                </li>
                <li>
                  Open the <b>SDK Server</b> tab and press <b>Start Server</b> (tick “start at login” to keep it on).
                </li>
                <li>
                  Close other RGB apps (vendor tools fight over the same devices), then press <b>Connect</b>.
                </li>
              </ol>
            )}
          </div>

          {status.state === 'connected' && (
            <div className="card stack">
              <div className="field-row">
                <h2>Detected hardware</h2>
                <button className="btn sm" onClick={() => window.lumora.openrgb.rescan()}>
                  <IconRefresh /> Rescan
                </button>
              </div>
              {s.hardware.length === 0 && <p className="small muted">OpenRGB found no devices on this PC.</p>}
              <div className="device-list">
                {s.hardware.map((h) => {
                  const def = fromHardware(h)
                  const enabled = s.placements[def.key]?.enabled ?? true
                  return (
                    <div key={def.key} className="device-row">
                      <div className="grow">
                        <div className="name">{h.name}</div>
                        <div className="small faint">
                          {h.ledCount} LEDs · {h.zones.length} zone{h.zones.length === 1 ? '' : 's'}
                          {h.vendor ? ` · ${h.vendor}` : ''}
                        </div>
                      </div>
                      <Toggle on={enabled} onChange={(v) => s.updatePlacement(def.key, { enabled: v })} label={`Enable ${h.name}`} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card stack">
            <h2>Virtual devices</h2>
            <p className="small muted">Preview effects on simulated hardware — great for designing effects on a laptop.</p>
            <div className="device-list">
              {s.virtualDevices.map((d) => (
                <div key={d.key} className="device-row">
                  <div className="grow">
                    <div className="name">{d.name}</div>
                    <div className="small faint">{d.leds.length} LEDs</div>
                  </div>
                  <Toggle
                    on={s.placements[d.key]?.enabled ?? true}
                    onChange={(v) => s.updatePlacement(d.key, { enabled: v })}
                    label={`Enable ${d.name}`}
                  />
                  <button className="btn sm icon ghost danger" title="Remove" onClick={() => s.removeDevice(d.key)}>
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
            <div className="row wrap">
              {VIRTUAL_PRESETS.map((p) => (
                <button key={p.id} className="btn sm" onClick={() => s.addVirtual(p.id)}>
                  <IconPlus /> {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="card stack">
            <h2>Inputs</h2>
            <div className="field-row">
              <span className="field-label">System audio</span>
              <span className="row small">
                <span className={`dot ${inputs.audio === 'on' ? 'ok' : inputs.audio === 'error' ? 'bad' : ''}`} />
                {inputs.audio === 'on' ? 'Listening' : inputs.audio === 'error' ? 'Unavailable' : 'Starts with music effects'}
              </span>
            </div>
            {inputs.audioError && <p className="small" style={{ color: 'var(--bad)' }}>{inputs.audioError}</p>}
            <Slider
              label="Music sensitivity"
              value={s.audioSensitivity}
              min={0.2}
              max={3}
              step={0.05}
              suffix="×"
              onChange={(v) => s.setSettings({ audioSensitivity: v })}
            />
            <div className="field-row">
              <span className="field-label">Screen capture</span>
              <span className="row small">
                <span className={`dot ${inputs.screen === 'on' ? 'ok' : inputs.screen === 'error' ? 'bad' : ''}`} />
                {inputs.screen === 'on' ? 'Capturing' : inputs.screen === 'error' ? 'Unavailable' : 'Starts with screen effects'}
              </span>
            </div>
            <label className="field">
              <span className="field-label">Monitor for screen effects</span>
              <select
                className="select"
                value={s.screenId ?? ''}
                onChange={async (e) => {
                  const id = e.target.value || null
                  s.setSettings({ screenId: id })
                  await window.lumora.capture.selectScreen(id)
                  await lighting().restartScreen()
                }}
              >
                <option value="">Primary display</option>
                {screens.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
