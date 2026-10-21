import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { lighting } from '../engine/lighting'
import type { CustomRule, DetectorSettings, GameReactionsConfig, Readout, Rect, RuleCondition } from '../engine/gameReactions'
import { ColorField, SelectField, Slider, Toggle, ToggleField } from '../components/controls'
import { IconPlus, IconTrash, IconX } from '../components/icons'

function useReadout(): { readout: Readout; active: boolean; gameActive: boolean } {
  const [state, setState] = useState(() => ({
    readout: lighting().reactions.readout,
    active: lighting().areReactionsActive,
    gameActive: lighting().isGameActive
  }))
  useEffect(() => {
    const t = window.setInterval(
      () => setState({ readout: lighting().reactions.readout, active: lighting().areReactionsActive, gameActive: lighting().isGameActive }),
      100
    )
    return () => window.clearInterval(t)
  }, [])
  return state
}

/** Horizontal meter with an optional marker (e.g. the adaptive baseline). */
function Meter(props: { value: number; marker?: number; color: string; label: string }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="field-row small">
        <span className="faint">{props.label}</span>
        <span className="faint" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(props.value * 100)}%
        </span>
      </div>
      <div className="meter-bar">
        <span style={{ width: `${Math.min(100, props.value * 100)}%`, background: props.color }} />
        {props.marker !== undefined && <i style={{ left: `${Math.min(100, props.marker * 100)}%` }} title="Recent average" />}
      </div>
    </div>
  )
}

function DetectorCard(props: {
  title: string
  description: string
  settings: DetectorSettings
  onChange: (patch: Partial<DetectorSettings>) => void
  meter: { value: number; marker: number; label: string }
  level: number
}) {
  const { settings } = props
  return (
    <div className="card stack">
      <div className="field-row">
        <div className="stack" style={{ gap: 2 }}>
          <h2>{props.title}</h2>
          <span className="small muted">{props.description}</span>
        </div>
        <Toggle on={settings.enabled} onChange={(v) => props.onChange({ enabled: v })} label={props.title} />
      </div>
      <Meter value={props.meter.value} marker={props.meter.marker} color={settings.color} label={props.meter.label} />
      <div className="reaction-level" style={{ opacity: 0.25 + props.level * 0.75, background: settings.color, boxShadow: `0 0 ${props.level * 30}px ${settings.color}` }} />
      <Slider label="Sensitivity" value={settings.sensitivity} min={0} max={100} onChange={(v) => props.onChange({ sensitivity: v })} />
      <Slider label="Strength" value={settings.strength} min={0} max={100} suffix="%" onChange={(v) => props.onChange({ strength: v })} />
      <ColorField label="Colour" value={settings.color} onChange={(v) => props.onChange({ color: v })} />
      <button className="btn sm" onClick={() => lighting().reactions.test(settings.color)}>
        Test on my lights
      </button>
    </div>
  )
}

/** Drag a rectangle on a screenshot to choose a HUD region. */
function RegionPicker(props: { initial?: Rect; onPick: (r: Rect) => void; onClose: () => void }) {
  const [shot, setShot] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rect, setRect] = useState<Rect | null>(props.initial ?? null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const imgRef = useRef<HTMLDivElement>(null)

  const capture = async (): Promise<void> => {
    setError(null)
    const url = await window.lumora.capture.snapshot()
    if (url) setShot(url)
    else setError('Could not take a screenshot.')
  }
  useEffect(() => {
    void capture()
  }, [])

  const pos = (e: React.PointerEvent): { x: number; y: number } => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" style={{ width: 'min(1000px, 100%)' }}>
        <div className="field-row">
          <h2 style={{ fontSize: 18 }}>Select the HUD area to watch</h2>
          <button className="btn icon ghost" onClick={props.onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <p className="small muted">
          Open your game so the HUD element is on screen, press <b>Retake screenshot</b> (you have 3 seconds to switch to the game), then drag a box
          around the element — e.g. the health bar, ability icon or bomb/spike indicator. Keep the box tight.
        </p>
        <div
          ref={imgRef}
          className="region-shot"
          onPointerDown={(e) => {
            const p = pos(e)
            drag.current = p
            setRect({ x: p.x, y: p.y, w: 0, h: 0 })
            ;(e.target as Element).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            const p = pos(e)
            const s = drag.current
            setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
          }}
          onPointerUp={() => {
            drag.current = null
          }}
        >
          {shot ? <img src={shot} alt="Screenshot" draggable={false} /> : <div className="empty">{error ?? 'Taking screenshot…'}</div>}
          {rect && rect.w > 0 && (
            <div className="region-box" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />
          )}
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              setShot(null)
              window.setTimeout(() => void capture(), 3000)
            }}
          >
            Retake screenshot (3s)
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn primary" disabled={!rect || rect.w < 0.005 || rect.h < 0.005} onClick={() => rect && props.onPick(rect)}>
            Use this area
          </button>
        </div>
      </div>
    </div>
  )
}

const CONDITIONS: { value: RuleCondition; label: string }[] = [
  { value: 'colour', label: 'Turns a colour' },
  { value: 'brighter', label: 'Gets brighter than' },
  { value: 'darker', label: 'Gets darker than' },
  { value: 'change', label: 'Changes suddenly' }
]

function RuleCard(props: {
  rule: CustomRule
  live?: Readout['rules'][string]
  onChange: (patch: Partial<CustomRule>) => void
  onDelete: () => void
  onPickRegion: () => void
}) {
  const { rule, live } = props
  const liveHex = live ? '#' + live.color.map((c) => c.toString(16).padStart(2, '0')).join('') : '#000000'
  return (
    <div className="card stack">
      <div className="field-row">
        <input className="input" value={rule.name} onChange={(e) => props.onChange({ name: e.target.value })} style={{ flex: 1 }} />
        <Toggle on={rule.enabled} onChange={(v) => props.onChange({ enabled: v })} label="Enabled" />
        <button className="btn sm icon ghost danger" onClick={props.onDelete} title="Delete trigger">
          <IconTrash />
        </button>
      </div>
      <div className="row small">
        <span className="dot" style={{ background: live?.active ? 'var(--ok)' : undefined }} />
        <span className="muted">
          {live ? (live.active ? 'Triggered now' : 'Watching') : 'Starts when Game Reactions are active'} · region colour
        </span>
        <span className="filter-swatch" style={{ background: liveHex }} title={liveHex} />
        <button className="btn sm ghost" onClick={props.onPickRegion}>
          Change area
        </button>
      </div>
      <SelectField label="When the area…" value={rule.condition} options={CONDITIONS} onChange={(v) => props.onChange({ condition: v as RuleCondition })} />
      {rule.condition === 'colour' ? (
        <>
          <div className="field-row">
            <ColorField label="Target colour" value={rule.targetColor} onChange={(v) => props.onChange({ targetColor: v })} />
            <button className="btn sm ghost" onClick={() => props.onChange({ targetColor: liveHex })} disabled={!live}>
              Use current
            </button>
          </div>
          <Slider label="Tolerance" value={rule.tolerance} min={2} max={60} onChange={(v) => props.onChange({ tolerance: v })} />
        </>
      ) : (
        <Slider
          label={rule.condition === 'change' ? 'Change needed' : 'Brightness level'}
          value={rule.threshold}
          min={1}
          max={100}
          onChange={(v) => props.onChange({ threshold: v })}
        />
      )}
      {live && <Meter value={live.value / 100} color="var(--ink)" label="Live value" />}
      <div className="field-row">
        <span className="field-label">Then light up</span>
        <div className="segmented" style={{ width: 200 }}>
          <button className={rule.mode === 'flash' ? 'on' : ''} onClick={() => props.onChange({ mode: 'flash' })}>
            Flash once
          </button>
          <button className={rule.mode === 'hold' ? 'on' : ''} onClick={() => props.onChange({ mode: 'hold' })}>
            While true
          </button>
        </div>
      </div>
      <ColorField label="Colour" value={rule.color} onChange={(v) => props.onChange({ color: v })} />
      {rule.mode === 'flash' && (
        <Slider label="Flash length" value={rule.durationMs} min={100} max={3000} step={50} suffix=" ms" onChange={(v) => props.onChange({ durationMs: v })} />
      )}
      <Slider label="Strength" value={rule.strength} min={0} max={100} suffix="%" onChange={(v) => props.onChange({ strength: v })} />
      <button className="btn sm" onClick={() => lighting().reactions.test(rule.color)}>
        Test on my lights
      </button>
    </div>
  )
}

export function GameReactions() {
  const cfg = useApp((s) => s.gameReactions)
  const setSettings = useApp((s) => s.setSettings)
  const { readout, active, gameActive } = useReadout()
  const [newGame, setNewGame] = useState('')
  const [running, setRunning] = useState<string[] | null>(null)
  const [picker, setPicker] = useState<{ ruleId?: string; initial?: Rect } | null>(null)

  const update = (patch: Partial<GameReactionsConfig>): void => setSettings({ gameReactions: { ...cfg, ...patch } })
  const updateRule = (id: string, patch: Partial<CustomRule>): void =>
    update({ rules: cfg.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  const status = !cfg.enabled ? 'Off' : active ? (cfg.onlyInGames ? 'Active — game detected' : 'Active') : 'Waiting for a listed game to start'

  return (
    <div className="view" style={{ maxWidth: 1180 }}>
      {picker && (
        <RegionPicker
          initial={picker.initial}
          onClose={() => setPicker(null)}
          onPick={(rect) => {
            if (picker.ruleId) updateRule(picker.ruleId, { rect })
            else
              update({
                rules: [
                  ...cfg.rules,
                  {
                    id: `r${Date.now().toString(36)}`,
                    name: `HUD trigger ${cfg.rules.length + 1}`,
                    enabled: true,
                    rect,
                    condition: 'colour',
                    threshold: 60,
                    targetColor: '#ff3030',
                    tolerance: 18,
                    color: '#ff6a00',
                    mode: 'flash',
                    durationMs: 700,
                    strength: 90
                  }
                ]
              })
            setPicker(null)
          }}
        />
      )}

      <div className="view-head">
        <h1>Game Reactions</h1>
        <span className="row small">
          <span className={`dot ${active ? 'ok' : cfg.enabled ? 'warn' : ''}`} />
          {status}
        </span>
        <div className="grow" />
        <Toggle on={cfg.enabled} onChange={(v) => update({ enabled: v })} label="Game Reactions" />
      </div>
      <p className="muted small" style={{ maxWidth: 820, marginBottom: 18 }}>
        Your lights react to what happens in your game — flashbangs, getting hit, HUD changes — on top of your current effect. It works by
        watching your screen only: it never reads game files or memory, so it’s safe with anti-cheat (Vanguard, EAC). Use{' '}
        <b>borderless / windowed fullscreen</b> — exclusive fullscreen can hide the game from screen capture.
      </p>

      <div className="reactions-grid">
        <DetectorCard
          title="Flashbang"
          description="Screen suddenly goes white → your lights flash and fade with it."
          settings={cfg.flash}
          onChange={(p) => update({ flash: { ...cfg.flash, ...p } })}
          meter={{ value: readout.whiteness, marker: readout.flashBaseline, label: 'White on screen' }}
          level={readout.flash}
        />
        <DetectorCard
          title="Taking damage"
          description="Red rises at the screen edges → a red pulse."
          settings={cfg.damage}
          onChange={(p) => update({ damage: { ...cfg.damage, ...p } })}
          meter={{ value: Math.min(1, readout.edgeRed * 3), marker: Math.min(1, readout.damageBaseline * 3), label: 'Red at edges' }}
          level={readout.damage}
        />
        <div className="card stack">
          <h2>When to run</h2>
          <ToggleField
            label="Only while a game is running"
            on={cfg.onlyInGames}
            onChange={(v) => update({ onlyInGames: v })}
            hint={cfg.onlyInGames ? (gameActive ? 'A listed game is running.' : 'None of the listed games is running.') : 'Always on while enabled.'}
          />
          {cfg.onlyInGames && (
            <>
              <div className="row wrap" style={{ gap: 6 }}>
                {cfg.games.map((g) => (
                  <span key={g} className="game-chip">
                    {g}
                    <button onClick={() => update({ games: cfg.games.filter((x) => x !== g) })} aria-label={`Remove ${g}`}>
                      <IconX width={11} height={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="row">
                <input
                  className="input"
                  placeholder="game.exe"
                  value={newGame}
                  onChange={(e) => setNewGame(e.target.value)}
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newGame.trim()) {
                      update({ games: [...new Set([...cfg.games, newGame.trim()])] })
                      setNewGame('')
                    }
                  }}
                />
                <button
                  className="btn sm"
                  disabled={!newGame.trim()}
                  onClick={() => {
                    update({ games: [...new Set([...cfg.games, newGame.trim()])] })
                    setNewGame('')
                  }}
                >
                  <IconPlus /> Add
                </button>
              </div>
              <button className="btn sm ghost" onClick={async () => setRunning(await window.lumora.system.runningApps())}>
                Pick from running programs…
              </button>
              {running && (
                <select
                  className="select"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) update({ games: [...new Set([...cfg.games, e.target.value])] })
                    setRunning(null)
                  }}
                >
                  <option value="">Choose a running program…</option>
                  {running.filter((r) => r.endsWith('.exe')).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      </div>

      <div className="view-head" style={{ marginTop: 26 }}>
        <h2 style={{ fontSize: 17 }}>Custom HUD triggers</h2>
        <span className="small muted">Watch any part of the screen — health bar, ability icon, bomb/spike indicator — and react when it changes.</span>
        <div className="grow" />
        <button className="btn primary" onClick={() => setPicker({})}>
          <IconPlus /> Add trigger
        </button>
      </div>
      {cfg.rules.length === 0 ? (
        <div className="empty small">No custom triggers yet. Add one and draw a box around a HUD element in a screenshot of your game.</div>
      ) : (
        <div className="reactions-grid">
          {cfg.rules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              live={readout.rules[r.id]}
              onChange={(p) => updateRule(r.id, p)}
              onDelete={() => update({ rules: cfg.rules.filter((x) => x.id !== r.id) })}
              onPickRegion={() => setPicker({ ruleId: r.id, initial: r.rect })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
