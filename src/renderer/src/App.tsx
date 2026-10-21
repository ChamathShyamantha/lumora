import { useEffect, useRef, useState } from 'react'
import { useApp, selectLayout, effectValues, type View } from './store'
import { lighting } from './engine/lighting'
import { IconCode, IconDevices, IconLayers, IconLayout, IconLibrary, IconSettings, IconSun } from './components/icons'
import { Library } from './views/Library'
import { Creator } from './views/Creator'
import { CodeEditor } from './views/CodeEditor'
import { LayoutView } from './views/LayoutView'
import { Devices } from './views/Devices'
import { Settings } from './views/Settings'
import { Toast, useToast } from './components/Toast'

const NAV: { view: View; label: string; icon: typeof IconLibrary; section?: string }[] = [
  { view: 'library', label: 'Effects', icon: IconLibrary },
  { view: 'create', label: 'Visual Creator', icon: IconLayers, section: 'Create' },
  { view: 'code', label: 'Code Editor', icon: IconCode },
  { view: 'layout', label: 'Layout', icon: IconLayout, section: 'Setup' },
  { view: 'devices', label: 'Devices', icon: IconDevices },
  { view: 'settings', label: 'Settings', icon: IconSettings }
]

async function reloadEffects(): Promise<void> {
  useApp.getState().setEffects(await window.lumora.effects.list())
}

/** Keeps the lighting engine in step with the store. */
function useLightingSync(): void {
  const loaded = useRef<{ id: string | null; html: string }>({ id: null, html: '' })

  // layout + brightness + sensitivity
  useEffect(() => {
    const apply = (): void => {
      const s = useApp.getState()
      lighting().setLayout(selectLayout(s))
      lighting().setBrightness(s.brightness)
      lighting().setAudioSensitivity(s.audioSensitivity)
    }
    apply()
    return useApp.subscribe((s, prev) => {
      if (
        s.virtualDevices !== prev.virtualDevices ||
        s.hardware !== prev.hardware ||
        s.placements !== prev.placements ||
        s.brightness !== prev.brightness ||
        s.audioSensitivity !== prev.audioSensitivity
      )
        apply()
    })
  }, [])

  // active library effect (editors drive the engine themselves while open)
  useEffect(() => {
    const apply = (): void => {
      const s = useApp.getState()
      if (s.view === 'create' || s.view === 'code') {
        loaded.current = { id: null, html: '' }
        return
      }
      const effect = s.effects.find((e) => e.id === s.activeEffectId)
      if (!effect) return
      const values = effectValues(effect, s.propValues[effect.id])
      if (loaded.current.id === effect.id && loaded.current.html === effect.html) {
        // same document: only push changed values
        for (const [k, v] of Object.entries(values)) lighting().setProp(k, v)
        return
      }
      loaded.current = { id: effect.id, html: effect.html }
      lighting().load(effect.html, values)
    }
    apply()
    return useApp.subscribe((s, prev) => {
      if (s.view !== prev.view || s.activeEffectId !== prev.activeEffectId || s.effects !== prev.effects || s.propValues !== prev.propValues) apply()
    })
  }, [])
}

function useBoot(): void {
  useEffect(() => {
    void reloadEffects()
    const offEffects = window.lumora.effects.onChanged(() => void reloadEffects())
    const offRgb = window.lumora.openrgb.onChanged((snap) => useApp.getState().setHardware(snap.status, snap.devices))
    void window.lumora.openrgb.state().then((snap) => useApp.getState().setHardware(snap.status, snap.devices))
    const s = useApp.getState()
    void window.lumora.app.setCloseToTray(s.closeToTray)
    void window.lumora.capture.selectScreen(s.screenId)
    if (s.openrgbAutoConnect) void window.lumora.openrgb.connect(s.openrgbHost, s.openrgbPort)
    return () => {
      offEffects()
      offRgb()
    }
  }, [])
}

export function App() {
  useBoot()
  useLightingSync()
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const brightness = useApp((s) => s.brightness)
  const setBrightness = useApp((s) => s.setBrightness)
  const activeTitle = useApp((s) => {
    if (s.view === 'create' || s.view === 'code') return s.editing ? 'Editing…' : 'Editor preview'
    return s.effects.find((e) => e.id === s.activeEffectId)?.meta.title ?? '—'
  })
  const rgb = useApp((s) => s.openrgbStatus)
  const hwCount = useApp((s) => s.hardware.length)
  const [inputs, setInputs] = useState(lighting().status)
  useEffect(() => lighting().onStatus(setInputs), [])
  const toast = useToast()

  return (
    <div className="shell">
      <div className="brand">
        <span className="brand-mark" />
        Lumora
      </div>
      <header className="topbar">
        <div className="now">
          <span className="now-label">Playing</span>
          <span className="now-title">{activeTitle}</span>
          {inputs.audio === 'on' && <span className="badge audio">♪ audio</span>}
          {inputs.screen === 'on' && <span className="badge screen">▣ screen</span>}
          {(inputs.audio === 'error' || inputs.screen === 'error') && (
            <span className="badge" style={{ color: 'var(--bad)' }} title={inputs.audioError ?? inputs.screenError}>
              capture failed
            </span>
          )}
        </div>
        <div className="spacer" />
        <button className="status-pill" onClick={() => setView('devices')} title="Hardware connection">
          <span className={`dot ${rgb.state === 'connected' ? 'ok' : rgb.state === 'connecting' ? 'warn' : ''}`} />
          {rgb.state === 'connected' ? `OpenRGB · ${hwCount} device${hwCount === 1 ? '' : 's'}` : rgb.state === 'connecting' ? 'Connecting…' : 'Preview only'}
        </button>
        <div className="brightness" title="Master brightness">
          <IconSun />
          <input
            type="range"
            min={0}
            max={100}
            value={brightness}
            style={{ ['--fill' as string]: `${brightness}%` }}
            onChange={(e) => setBrightness(parseInt(e.target.value, 10))}
          />
          <span className="field-value" style={{ width: 34, textAlign: 'right' }}>
            {brightness}%
          </span>
        </div>
      </header>
      <nav className="sidebar">
        {NAV.map((n) => (
          <div key={n.view} style={{ display: 'contents' }}>
            {n.section && <div className="nav-section">{n.section}</div>}
            <button className={`nav-item${view === n.view ? ' active' : ''}`} onClick={() => setView(n.view)}>
              <n.icon />
              {n.label}
            </button>
          </div>
        ))}
        <div className="sidebar-foot">
          Free &amp; open. Every effect included.
          <br />
          Make your own in the Creator.
        </div>
      </nav>
      <main className="main">
        {view === 'library' && <Library toast={toast.show} />}
        {view === 'create' && <Creator toast={toast.show} />}
        {view === 'code' && <CodeEditor toast={toast.show} />}
        {view === 'layout' && <LayoutView />}
        {view === 'devices' && <Devices />}
        {view === 'settings' && <Settings toast={toast.show} />}
      </main>
      <Toast message={toast.message} />
    </div>
  )
}
