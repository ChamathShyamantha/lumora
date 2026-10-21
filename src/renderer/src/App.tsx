import { useEffect, useRef, useState } from 'react'
import { useApp, selectLayout, effectValues, type View } from './store'
import { lighting } from './engine/lighting'
import { rgbToHsl } from './engine/screenInput'
import { findActiveRule } from './engine/scenes'
import { IconScenes, IconPower, IconAlert, IconMusic, IconMonitor, IconGamepad, IconCode, IconDevices, IconLayers, IconLayout, IconLibrary, IconSettings, IconSun } from './components/icons'
import { Library } from './views/Library'
import { Creator } from './views/Creator'
import { CodeEditor } from './views/CodeEditor'
import { LayoutView } from './views/LayoutView'
import { Devices } from './views/Devices'
import { Settings } from './views/Settings'
import { GameReactions } from './views/GameReactions'
import { Scenes } from './views/Scenes'
import { UpdatePill } from './components/Updates'
import { Toast, useToast } from './components/Toast'

const NAV: { view: View; label: string; icon: typeof IconLibrary; section?: string }[] = [
  { view: 'library', label: 'Effects', icon: IconLibrary },
  { view: 'create', label: 'Visual Creator', icon: IconLayers, section: 'Create' },
  { view: 'code', label: 'Code Editor', icon: IconCode },
  { view: 'scenes', label: 'Scenes', icon: IconScenes, section: 'Play' },
  { view: 'games', label: 'Game Reactions', icon: IconGamepad },
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
      // Editors preview at full effect brightness; the library uses the effect's own level.
      const editing = s.view === 'create' || s.view === 'code'
      lighting().setEffectBrightness(editing || !s.activeEffectId ? 100 : (s.effectBrightness[s.activeEffectId] ?? 100))
      lighting().setAudioSensitivity(s.audioSensitivity)
      lighting().setSafeMode(s.safeMode)
    }
    apply()
    return useApp.subscribe((s, prev) => {
      if (
        s.virtualDevices !== prev.virtualDevices ||
        s.hardware !== prev.hardware ||
        s.placements !== prev.placements ||
        s.brightness !== prev.brightness ||
        s.effectBrightness !== prev.effectBrightness ||
        s.activeEffectId !== prev.activeEffectId ||
        s.view !== prev.view ||
        s.audioSensitivity !== prev.audioSensitivity ||
        s.safeMode !== prev.safeMode
      )
        apply()
    })
  }, [])

  // per-device effects
  useEffect(() => {
    const apply = (): void => {
      const s = useApp.getState()
      const deviceKeys = new Set(selectLayout(s).map((d) => d.key))
      const inEditor = s.view === 'create' || s.view === 'code'
      const assignments = Object.entries(s.deviceEffects)
        .filter(([key, id]) => deviceKeys.has(key) && (inEditor || id !== s.activeEffectId))
        .flatMap(([deviceKey, effectId]) => {
          const effect = s.effects.find((e) => e.id === effectId)
          if (!effect) return []
          return [{ deviceKey, effectId, html: effect.html, values: effectValues(effect, s.propValues[effectId]), brightness: s.effectBrightness[effectId] ?? 100 }]
        })
      lighting().setDeviceEffects(assignments)
    }
    apply()
    return useApp.subscribe((s, prev) => {
      if (
        s.deviceEffects !== prev.deviceEffects ||
        s.effects !== prev.effects ||
        s.propValues !== prev.propValues ||
        s.effectBrightness !== prev.effectBrightness ||
        s.activeEffectId !== prev.activeEffectId ||
        s.view !== prev.view ||
        s.virtualDevices !== prev.virtualDevices ||
        s.hardware !== prev.hardware
      )
        apply()
    })
  }, [])

  // lights on/off (button, tray, "Lights off" scene)
  useEffect(() => {
    lighting().setOff('user', useApp.getState().lightsOff)
    return useApp.subscribe((s, prev) => {
      if (s.lightsOff !== prev.lightsOff) lighting().setOff('user', s.lightsOff)
    })
  }, [])

  // game reactions: config + "is a listed game running?" polling
  useEffect(() => {
    let timer: number | undefined
    const apply = (): void => {
      const cfg = useApp.getState().gameReactions
      lighting().setGameReactions(cfg)
      window.clearInterval(timer)
      timer = undefined
      if (cfg.enabled && cfg.onlyInGames) {
        const poll = async (): Promise<void> => {
          const running = new Set(await window.lumora.system.runningApps())
          const games = useApp.getState().gameReactions.games.map((g) => g.toLowerCase())
          lighting().setGameActive(games.some((g) => running.has(g)))
        }
        void poll()
        timer = window.setInterval(() => void poll(), 5000)
      }
    }
    apply()
    const unsub = useApp.subscribe((s, prev) => {
      if (s.gameReactions !== prev.gameReactions) apply()
    })
    return () => {
      unsub()
      window.clearInterval(timer)
    }
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

/**
 * The UI's only accent colour comes from the lights: twice a second, take the
 * dominant (saturation-weighted) colour of the effect frame and expose it as --live.
 */
function useLiveAccent(): void {
  useEffect(() => {
    let last = 0
    const root = document.documentElement.style
    return lighting().onFrame(({ frame }) => {
      const now = performance.now()
      if (now - last < 500) return
      last = now
      let r = 0
      let g = 0
      let b = 0
      let w = 0
      for (let i = 0; i < frame.length; i += 4 * 37) {
        const pr = frame[i]
        const pg = frame[i + 1]
        const pb = frame[i + 2]
        const mx = Math.max(pr, pg, pb)
        const weight = mx === 0 ? 0 : ((mx - Math.min(pr, pg, pb)) / mx) * (mx / 255) + 0.02
        r += pr * weight
        g += pg * weight
        b += pb * weight
        w += weight
      }
      if (!w) return
      const [h, s, l] = rgbToHsl(r / w, g / w, b / w)
      const neutral = s < 12 || l < 6
      const color = neutral ? 'hsl(0 0% 62%)' : `hsl(${h} ${Math.min(100, s + 15)}% 64%)`
      root.setProperty('--live', color)
      root.setProperty('--live-soft', neutral ? 'rgba(156,156,157,0.18)' : `hsl(${h} ${Math.min(100, s + 15)}% 60% / 0.35)`)
    })
  }, [])
}

/**
 * Automations: every 5 s find the highest-priority rule that applies (an app is
 * running / it is within a time range) and switch to its scene. When no rule
 * applies any more, restore what the user had before.
 */
function useAutomation(): void {
  useEffect(() => {
    let busy = false
    const tick = async (): Promise<void> => {
      if (busy) return
      busy = true
      try {
        const s = useApp.getState()
        const rules = s.automationEnabled ? s.rules : []
        const needApps = rules.some((r) => r.enabled && r.trigger.type === 'app')
        const running = needApps ? new Set(await window.lumora.system.runningApps()) : new Set<string>()
        const match = findActiveRule(rules, running, new Date())
        const st = useApp.getState()
        const current = st.automation.ruleId
        if ((match?.id ?? null) === current) return
        if (match) {
          // remember the user's own setup the first time automation takes over
          const snapshot = st.automation.snapshot ?? {
            effectId: st.activeEffectId,
            brightness: st.brightness,
            deviceEffects: st.deviceEffects,
            lightsOff: st.lightsOff
          }
          useApp.setState({ automation: { ruleId: match.id, snapshot } })
          st.applyScene(match.sceneId)
        } else {
          const snap = st.automation.snapshot
          useApp.setState({ automation: { ruleId: null, snapshot: null } })
          if (snap) {
            useApp.setState({
              activeEffectId: snap.effectId,
              brightness: snap.brightness,
              deviceEffects: snap.deviceEffects,
              lightsOff: snap.lightsOff
            })
          }
        }
      } finally {
        busy = false
      }
    }
    void tick()
    const t = window.setInterval(() => void tick(), 5000)
    const unsub = useApp.subscribe((s, prev) => {
      if (s.rules !== prev.rules || s.automationEnabled !== prev.automationEnabled) void tick()
    })
    return () => {
      window.clearInterval(t)
      unsub()
    }
  }, [])
}

/** Keep the tray menu's scene list and lights toggle current; handle its clicks. */
function useTray(): void {
  useEffect(() => {
    const push = (): void => {
      const s = useApp.getState()
      void window.lumora.tray.update({ scenes: s.scenes.map((x) => ({ id: x.id, name: x.name })), lightsOff: s.lightsOff })
    }
    push()
    const unsub = useApp.subscribe((s, prev) => {
      if (s.scenes !== prev.scenes || s.lightsOff !== prev.lightsOff) push()
    })
    const off = window.lumora.tray.onAction((a) => {
      const s = useApp.getState()
      if (a.type === 'toggleLights') s.setLightsOff(!s.lightsOff)
      else if (a.type === 'scene' && a.id) s.applyScene(a.id)
    })
    return () => {
      unsub()
      off()
    }
  }, [])
}

function useBoot(): void {
  useEffect(() => {
    void reloadEffects()
    const offEffects = window.lumora.effects.onChanged(() => void reloadEffects())
    const offRgb = window.lumora.openrgb.onChanged((snap) => useApp.getState().setHardware(snap.status, snap.devices))
    const offConflicts = window.lumora.conflicts.onChanged((running) => useApp.getState().setConflicts(running))
    const offNav = window.lumora.onNavigate((v) => useApp.getState().setView(v as View))
    const offPower = window.lumora.power.onState(({ dark }) => lighting().setOff('power', dark))
    const pushPower = (): void => {
      const st = useApp.getState()
      void window.lumora.power.configure({ offOnSleep: st.lightsOffOnSleep, offOnLock: st.lightsOffOnLock, offOnExit: st.lightsOffOnExit })
    }
    pushPower()
    const offPowerCfg = useApp.subscribe((st, prev) => {
      if (st.lightsOffOnSleep !== prev.lightsOffOnSleep || st.lightsOffOnLock !== prev.lightsOffOnLock || st.lightsOffOnExit !== prev.lightsOffOnExit) pushPower()
    })
    const pushConflictConfig = (): void => {
      const st = useApp.getState()
      void window.lumora.conflicts.configure(st.ignoredConflicts, st.extraConflictProcesses)
    }
    pushConflictConfig()
    void window.lumora.conflicts.list().then((running) => useApp.getState().setConflicts(running))
    const offConflictCfg = useApp.subscribe((st, prev) => {
      if (st.ignoredConflicts !== prev.ignoredConflicts || st.extraConflictProcesses !== prev.extraConflictProcesses) pushConflictConfig()
    })
    void window.lumora.openrgb.state().then((snap) => useApp.getState().setHardware(snap.status, snap.devices))
    const s = useApp.getState()
    void window.lumora.app.setCloseToTray(s.closeToTray)
    void window.lumora.capture.selectScreen(s.screenId)
    if (s.openrgbAutoConnect) void window.lumora.openrgb.connect(s.openrgbHost, s.openrgbPort)
    return () => {
      offEffects()
      offRgb()
      offConflicts()
      offNav()
      offPower()
      offPowerCfg()
      offConflictCfg()
    }
  }, [])
}

export function App() {
  useBoot()
  useLightingSync()
  useAutomation()
  useTray()
  useLiveAccent()
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const brightness = useApp((s) => s.brightness)
  const lightsOff = useApp((s) => s.lightsOff)
  const setBrightness = useApp((s) => s.setBrightness)
  const activeTitle = useApp((s) => {
    if (s.view === 'create' || s.view === 'code') return s.editing ? 'Editing…' : 'Editor preview'
    return s.effects.find((e) => e.id === s.activeEffectId)?.meta.title ?? '—'
  })
  const rgb = useApp((s) => s.openrgbStatus)
  const hwCount = useApp((s) => s.hardware.length)
  const conflicts = useApp((s) => s.conflicts)
  const ignored = useApp((s) => s.ignoredConflicts)
  const activeConflicts = conflicts.filter((c) => !ignored.includes(c.id))
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
          {inputs.audio === 'on' && (
            <span className="badge audio">
              <IconMusic /> Audio
            </span>
          )}
          {inputs.screen === 'on' && (
            <span className="badge screen">
              <IconMonitor /> Screen
            </span>
          )}
          {(inputs.audio === 'error' || inputs.screen === 'error') && (
            <span className="badge" style={{ color: 'var(--bad)' }} title={inputs.audioError ?? inputs.screenError}>
              capture failed
            </span>
          )}
        </div>
        <div className="spacer" />
        {activeConflicts.length > 0 && (
          <button
            className="status-pill conflict-pill"
            onClick={() => setView('devices')}
            title={`Running: ${activeConflicts.map((c) => c.name).join(', ')}`}
          >
            <IconAlert /> {activeConflicts.length === 1 ? activeConflicts[0].name : `${activeConflicts.length} RGB apps`} running
          </button>
        )}
        <UpdatePill />
        <button className="status-pill" onClick={() => setView('devices')} title="Hardware connection">
          <span className={`dot ${rgb.state === 'connected' ? 'ok' : rgb.state === 'connecting' ? 'warn' : ''}`} />
          {rgb.state === 'connected' ? `OpenRGB · ${hwCount} device${hwCount === 1 ? '' : 's'}` : rgb.state === 'connecting' ? 'Connecting…' : 'Preview only'}
        </button>
        <button
          className={`btn icon ghost${lightsOff ? ' lights-off' : ''}`}
          title={lightsOff ? 'Turn lights on' : 'Turn lights off'}
          aria-pressed={lightsOff}
          onClick={() => useApp.getState().setLightsOff(!lightsOff)}
        >
          <IconPower />
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
          Lumora 0.1 · free &amp; open source
        </div>
      </nav>
      <main className="main">
        {view === 'library' && <Library toast={toast.show} />}
        {view === 'create' && <Creator toast={toast.show} />}
        {view === 'code' && <CodeEditor toast={toast.show} />}
        {view === 'scenes' && <Scenes toast={toast.show} />}
        {view === 'games' && <GameReactions />}
        {view === 'layout' && <LayoutView />}
        {view === 'devices' && <Devices />}
        {view === 'settings' && <Settings toast={toast.show} />}
      </main>
      <Toast message={toast.message} />
    </div>
  )
}
