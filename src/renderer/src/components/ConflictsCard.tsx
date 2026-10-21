import { useState } from 'react'
import { useApp } from '../store'
import type { RunningConflict } from '../types'
import { IconAlert, IconCheck, IconRefresh, IconX } from './icons'

function ConflictRow(props: { conflict: RunningConflict; ignored: boolean }) {
  const { conflict, ignored } = props
  const { ignoredConflicts, setSettings } = useApp.getState()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [needsAdmin, setNeedsAdmin] = useState(false)
  const hasSystem = conflict.processes.some((p) => p.system)

  const close = async (elevated: boolean): Promise<void> => {
    const what = elevated ? 'as administrator (Windows will ask for permission)' : 'now'
    if (!confirm(`Close ${conflict.name} ${what}?\n\nUnsaved settings in that app may be lost. It may start again at your next login — see the tip below.`)) return
    setBusy(true)
    setMessage(null)
    const res = await window.lumora.conflicts.close(conflict.id, elevated)
    setBusy(false)
    if (res.ok) {
      setMessage({ ok: true, text: `${conflict.name} closed.` })
      return
    }
    if (res.needsAdmin.length) {
      setNeedsAdmin(true)
      setMessage({ ok: false, text: `Some parts run as a Windows service (${res.needsAdmin.join(', ')}) and need administrator rights to stop.` })
    } else if (res.failed.length) {
      setMessage({
        ok: false,
        text: `Could not close ${res.failed.join(', ')}. It may have restarted itself — use its own settings or Task Manager.`
      })
    }
  }

  return (
    <div className="conflict-row" style={{ opacity: ignored ? 0.6 : 1 }}>
      <div className="field-row">
        <b>{conflict.name}</b>
        {ignored ? (
          <button className="btn sm ghost" onClick={() => setSettings({ ignoredConflicts: ignoredConflicts.filter((i) => i !== conflict.id) })}>
            Stop ignoring
          </button>
        ) : (
          <span className="badge warn">
            running
          </span>
        )}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {conflict.processes.map((p) => (
          <span key={p.pid} className="game-chip" style={{ paddingRight: 10 }} title={p.system ? 'Windows service — needs administrator to stop' : `PID ${p.pid}`}>
            {p.name}
            {p.system && <span className="faint"> · service</span>}
          </span>
        ))}
      </div>
      <p className="small muted">{conflict.hint}</p>
      {!ignored && (
        <div className="row wrap">
          <button className="btn sm primary" disabled={busy} onClick={() => close(false)}>
            {busy ? 'Closing…' : 'Close it'}
          </button>
          {(needsAdmin || (hasSystem && !conflict.processes.some((p) => !p.system))) && (
            <button className="btn sm" disabled={busy} onClick={() => close(true)}>
              Close as administrator
            </button>
          )}
          <button className="btn sm ghost" onClick={() => window.lumora.system.openTaskManager()}>
            Open Task Manager
          </button>
          <button className="btn sm ghost" onClick={() => setSettings({ ignoredConflicts: [...ignoredConflicts, conflict.id] })}>
            Ignore
          </button>
        </div>
      )}
      {message && (
        <p className="small" style={{ color: message.ok ? 'var(--ok)' : 'var(--warn)' }}>
          {message.text}
        </p>
      )}
    </div>
  )
}

/** Devices page card: other RGB apps that fight Lumora for the same LEDs. */
export function ConflictsCard() {
  const conflicts = useApp((s) => s.conflicts)
  const ignored = useApp((s) => s.ignoredConflicts)
  const extra = useApp((s) => s.extraConflictProcesses)
  const setSettings = useApp((s) => s.setSettings)
  const [checking, setChecking] = useState(false)
  const [newName, setNewName] = useState('')
  const [manage, setManage] = useState(false)
  const active = conflicts.filter((c) => !ignored.includes(c.id))
  const quiet = conflicts.filter((c) => ignored.includes(c.id))

  const addExtra = (): void => {
    const n = newName.trim().toLowerCase()
    if (!n) return
    setSettings({ extraConflictProcesses: [...new Set([...extra, n.endsWith('.exe') ? n : `${n}.exe`])] })
    setNewName('')
  }

  return (
    <div className={`card stack${active.length ? ' conflict-card' : ''}`}>
      <div className="field-row">
        <h2 className="row" style={{ gap: 8 }}>
          {active.length > 0 && <IconAlert width={16} height={16} style={{ color: 'var(--warn)' }} />}
          {active.length ? 'Conflicting RGB software' : 'RGB software conflicts'}
        </h2>
        <button
          className="btn sm ghost"
          disabled={checking}
          onClick={async () => {
            setChecking(true)
            useApp.getState().setConflicts(await window.lumora.conflicts.recheck())
            setChecking(false)
          }}
        >
          <IconRefresh /> {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {active.length ? (
        <p className="small muted">
          These apps also control RGB lighting. While they run, your lights may flicker or ignore Lumora. Close them (or turn off their lighting
          control), then reconnect OpenRGB.
        </p>
      ) : (
        <p className="row small muted" style={{ gap: 8 }}>
          <IconCheck width={14} height={14} style={{ color: 'var(--ok)', flex: 'none' }} />
          No conflicting RGB software is running. Lumora checks every 15 seconds and will notify you.
        </p>
      )}
      {active.map((c) => (
        <ConflictRow key={c.id} conflict={c} ignored={false} />
      ))}
      {quiet.map((c) => (
        <ConflictRow key={c.id} conflict={c} ignored />
      ))}
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setManage((v) => !v)}>
        {manage ? 'Hide' : 'Add other programs to watch…'}
      </button>
      {manage && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small faint">Lumora knows common vendor apps (MSI, ASUS, Gigabyte, ASRock, Corsair, Razer, Logitech, SteelSeries, NZXT…). Add any other program name here.</p>
          <div className="row wrap" style={{ gap: 6 }}>
            {extra.map((n) => (
              <span key={n} className="game-chip">
                {n}
                <button onClick={() => setSettings({ extraConflictProcesses: extra.filter((x) => x !== n) })} aria-label={`Remove ${n}`}>
                  <IconX width={11} height={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="row">
            <input
              className="input"
              placeholder="program.exe"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addExtra()}
              style={{ flex: 1 }}
            />
            <button className="btn sm" onClick={addExtra} disabled={!newName.trim()}>
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
