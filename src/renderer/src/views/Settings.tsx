import { useApp } from '../store'
import { Slider, ToggleField } from '../components/controls'
import { AiSettings } from '../components/AiSettings'
import type { ShowToast } from '../components/Toast'
import { IconFolder } from '../components/icons'

export function Settings(props: { toast: ShowToast }) {
  const s = useApp()
  return (
    <div className="view" style={{ maxWidth: 760 }}>
      <div className="view-head">
        <h1>Settings</h1>
      </div>
      <div className="card stack">
        <h2>Lighting</h2>
        <Slider label="Master brightness" value={s.brightness} min={0} max={100} suffix="%" onChange={s.setBrightness} />
      </div>
      <AiSettings toast={props.toast} />
      <div className="card stack">
        <h2>App</h2>
        <ToggleField
          label="Keep running in the tray when closed"
          on={s.closeToTray}
          hint="Your lights keep animating after you close the window. Quit from the tray icon."
          onChange={(v) => {
            s.setSettings({ closeToTray: v })
            void window.lumora.app.setCloseToTray(v)
          }}
        />
      </div>
      <div className="card stack">
        <h2>My effects</h2>
        <p className="small muted">
          Your effects are plain <span className="kbd">.html</span> files. Edit them in any editor — Lumora reloads them automatically — and
          share them by sending the file.
        </p>
        <div className="row">
          <button className="btn" onClick={() => window.lumora.effects.openFolder()}>
            <IconFolder /> Open effects folder
          </button>
        </div>
      </div>
      <div className="card stack">
        <h2>Reset</h2>
        <div className="row wrap">
          <button
            className="btn danger"
            onClick={() => {
              if (!confirm('Reset all effect settings to their defaults?')) return
              s.setSettings({ propValues: {} })
              props.toast('Effect settings reset')
            }}
          >
            Reset effect settings
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (!confirm('Reset device positions?')) return
              s.setSettings({ placements: {} })
              props.toast('Layout reset')
            }}
          >
            Reset layout
          </button>
        </div>
      </div>
      <p className="small faint" style={{ marginTop: 18 }}>
        Lumora 0.1.0 · Free and open source (MIT). Every effect is free — forever.
      </p>
    </div>
  )
}
