import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { ToggleField } from './controls'

/** Settings card: lights off on sleep/lock/quit, start with Windows, close to tray. */
export function PowerSettings() {
  const s = useApp()
  const [autostart, setAutostart] = useState<{ supported: boolean; enabled: boolean; minimized: boolean } | null>(null)
  useEffect(() => {
    void window.lumora.app.getAutostart().then(setAutostart)
  }, [])

  const updateAutostart = async (enabled: boolean, minimized: boolean): Promise<void> => {
    setAutostart(await window.lumora.app.setAutostart(enabled, minimized))
  }

  return (
    <div className="card stack">
      <h2>Power &amp; startup</h2>
      <ToggleField
        label="Turn lights off when the PC sleeps"
        on={s.lightsOffOnSleep}
        onChange={(v) => s.setSettings({ lightsOffOnSleep: v })}
        hint="They come back when you wake it."
      />
      <ToggleField
        label="Turn lights off when the PC is locked"
        on={s.lightsOffOnLock}
        onChange={(v) => s.setSettings({ lightsOffOnLock: v })}
        hint="Win + L. They come back when you sign in."
      />
      <ToggleField
        label="Turn lights off when Lumora quits or Windows shuts down"
        on={s.lightsOffOnExit}
        onChange={(v) => s.setSettings({ lightsOffOnExit: v })}
        hint="Otherwise devices keep showing the last colour."
      />
      <ToggleField
        label="Keep running in the tray when closed"
        on={s.closeToTray}
        hint="Your lights keep animating after you close the window. Quit from the tray icon."
        onChange={(v) => {
          s.setSettings({ closeToTray: v })
          void window.lumora.app.setCloseToTray(v)
        }}
      />
      {autostart && (
        <>
          <ToggleField
            label="Start Lumora with Windows"
            on={autostart.enabled}
            onChange={(v) => void updateAutostart(v, autostart.minimized || !autostart.enabled)}
            hint={autostart.supported ? undefined : 'Available in the installed app (not in development mode).'}
          />
          {autostart.enabled && (
            <ToggleField
              label="Start minimised to the tray"
              on={autostart.minimized}
              onChange={(v) => void updateAutostart(true, v)}
              hint="Lights start at login without opening the window."
            />
          )}
        </>
      )}
    </div>
  )
}
