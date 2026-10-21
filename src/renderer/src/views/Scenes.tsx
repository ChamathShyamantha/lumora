import { useState } from 'react'
import { useApp } from '../store'
import { OFF_SCENE_ID, describeTrigger, newSceneId, type AutomationRule, type Trigger } from '../engine/scenes'
import { Toggle } from '../components/controls'
import type { ShowToast } from '../components/Toast'
import { IconDown, IconPlay, IconPlus, IconTrash, IconUp } from '../components/icons'

function RuleRow(props: {
  rule: AutomationRule
  index: number
  count: number
  active: boolean
  onChange: (patch: Partial<AutomationRule>) => void
  onMove: (dir: -1 | 1) => void
  onDelete: () => void
}) {
  const { rule } = props
  const scenes = useApp((s) => s.scenes)
  const [running, setRunning] = useState<string[] | null>(null)
  const setTrigger = (t: Trigger): void => props.onChange({ trigger: t })

  return (
    <div className="rule-row" style={{ borderColor: props.active ? 'rgba(255,255,255,0.45)' : undefined, opacity: rule.enabled ? 1 : 0.55 }}>
      <div className="rule-line">
        <span className="rule-word">When</span>
        <select
          className="select"
          value={rule.trigger.type}
          onChange={(e) =>
            setTrigger(e.target.value === 'app' ? { type: 'app', exe: '' } : { type: 'time', from: '23:00', to: '07:00' })
          }
        >
          <option value="app">an app is running</option>
          <option value="time">it's between</option>
        </select>
        {rule.trigger.type === 'app' ? (
          <>
            <input
              className="input mono"
              placeholder="game.exe"
              value={rule.trigger.exe}
              onChange={(e) => setTrigger({ type: 'app', exe: e.target.value })}
              style={{ width: 230 }}
            />
            <button className="btn sm ghost" onClick={async () => setRunning(await window.lumora.system.runningApps())}>
              Pick…
            </button>
          </>
        ) : (
          <>
            <input
              className="input"
              type="time"
              value={rule.trigger.from}
              onChange={(e) => rule.trigger.type === 'time' && setTrigger({ ...rule.trigger, from: e.target.value })}
            />
            <span className="rule-word">and</span>
            <input
              className="input"
              type="time"
              value={rule.trigger.to}
              onChange={(e) => rule.trigger.type === 'time' && setTrigger({ ...rule.trigger, to: e.target.value })}
            />
          </>
        )}
        <span className="rule-word">switch to</span>
        <select className="select" value={rule.sceneId} onChange={(e) => props.onChange({ sceneId: e.target.value })}>
          <option value={OFF_SCENE_ID}>Lights off</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        {props.active && <span className="badge">Active now</span>}
        <button className="btn sm icon ghost" title="Higher priority" disabled={props.index === 0} onClick={() => props.onMove(-1)}>
          <IconUp />
        </button>
        <button className="btn sm icon ghost" title="Lower priority" disabled={props.index === props.count - 1} onClick={() => props.onMove(1)}>
          <IconDown />
        </button>
        <Toggle on={rule.enabled} onChange={(v) => props.onChange({ enabled: v })} label="Rule enabled" />
        <button className="btn sm icon ghost danger" title="Delete rule" onClick={props.onDelete}>
          <IconTrash />
        </button>
      </div>
      {running && rule.trigger.type === 'app' && (
        <select
          className="select"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) setTrigger({ type: 'app', exe: e.target.value })
            setRunning(null)
          }}
        >
          <option value="">Choose a running program…</option>
          {running
            .filter((r) => r.endsWith('.exe'))
            .map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
        </select>
      )}
    </div>
  )
}

export function Scenes(props: { toast: ShowToast }) {
  const s = useApp()
  const [name, setName] = useState('')
  const effectName = (id: string): string => s.effects.find((e) => e.id === id)?.meta.title ?? 'Missing effect'
  const activeRule = s.rules.find((r) => r.id === s.automation.ruleId) ?? null
  const sceneName = (id: string): string => (id === OFF_SCENE_ID ? 'Lights off' : (s.scenes.find((x) => x.id === id)?.name ?? '—'))

  const updateRule = (id: string, patch: Partial<AutomationRule>): void => s.setRules(s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const moveRule = (index: number, dir: -1 | 1): void => {
    const rules = [...s.rules]
    const j = index + dir
    if (j < 0 || j >= rules.length) return
    ;[rules[index], rules[j]] = [rules[j], rules[index]]
    s.setRules(rules)
  }

  return (
    <div className="view" style={{ maxWidth: 1120 }}>
      <div className="view-head">
        <h1>Scenes</h1>
        <span className="muted">Save setups and switch between them — by hand, from the tray, or automatically.</span>
      </div>

      <div className="card stack">
        <div className="field-row">
          <h2>Saved scenes</h2>
          <div className="row">
            <input
              className="input"
              placeholder="Name, e.g. Gaming"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  s.saveScene(name)
                  setName('')
                  props.toast('Scene saved')
                }
              }}
              style={{ width: 220 }}
            />
            <button
              className="btn primary"
              onClick={() => {
                s.saveScene(name)
                setName('')
                props.toast('Scene saved')
              }}
            >
              <IconPlus /> Save current setup
            </button>
          </div>
        </div>
        <p className="small muted">A scene stores the playing effect, master brightness and which devices run their own effect.</p>
        {s.scenes.length === 0 ? (
          <div className="empty small">No scenes yet. Set up your lights how you like them, name it, and press Save current setup.</div>
        ) : (
          <div className="scene-grid">
            {s.scenes.map((sc) => (
              <div key={sc.id} className="scene-card">
                <input className="title-input" value={sc.name} onChange={(e) => s.updateScene(sc.id, { name: e.target.value })} />
                <span className="small muted">
                  {effectName(sc.effectId)} · {sc.brightness}%
                  {Object.keys(sc.deviceEffects).length ? ` · ${Object.keys(sc.deviceEffects).length} device effect(s)` : ''}
                </span>
                <div className="row">
                  <button
                    className="btn sm"
                    onClick={() => {
                      s.applyScene(sc.id)
                      props.toast(`Switched to ${sc.name}`)
                    }}
                  >
                    <IconPlay /> Apply
                  </button>
                  <button
                    className="btn sm ghost"
                    title="Replace this scene with what's playing now"
                    onClick={() => {
                      s.updateScene(sc.id, { effectId: s.activeEffectId ?? sc.effectId, brightness: s.brightness, deviceEffects: { ...s.deviceEffects } })
                      props.toast(`${sc.name} updated`)
                    }}
                  >
                    Update from current
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    className="btn sm icon ghost danger"
                    title="Delete scene"
                    onClick={() => confirm(`Delete scene "${sc.name}"? Automations using it are removed too.`) && s.deleteScene(sc.id)}
                  >
                    <IconTrash />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card stack">
        <div className="field-row">
          <div className="stack" style={{ gap: 2 }}>
            <h2>Automations</h2>
            <span className="small muted">
              {!s.automationEnabled
                ? 'Off — scenes only change when you pick them.'
                : activeRule
                  ? `Now: ${sceneName(activeRule.sceneId)}, because ${describeTrigger(activeRule.trigger)}. Your own setup comes back when it stops.`
                  : 'No rule applies right now — your own selection is playing.'}
            </span>
          </div>
          <Toggle on={s.automationEnabled} onChange={(v) => s.setSettings({ automationEnabled: v })} label="Automations" />
        </div>
        <p className="small faint">Rules are checked every 5 seconds from top to bottom; the first one that applies wins.</p>
        {s.rules.map((r, i) => (
          <RuleRow
            key={r.id}
            rule={r}
            index={i}
            count={s.rules.length}
            active={s.automation.ruleId === r.id}
            onChange={(p) => updateRule(r.id, p)}
            onMove={(d) => moveRule(i, d)}
            onDelete={() => s.setRules(s.rules.filter((x) => x.id !== r.id))}
          />
        ))}
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              s.setRules([
                ...s.rules,
                { id: newSceneId(), enabled: true, sceneId: s.scenes[0]?.id ?? OFF_SCENE_ID, trigger: { type: 'app', exe: '' } }
              ])
            }
          >
            <IconPlus /> Add rule
          </button>
          {s.scenes.length === 0 && <span className="small faint">Tip: save a scene first so rules have something to switch to.</span>}
        </div>
      </div>
    </div>
  )
}
