import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import { oneDark } from '@codemirror/theme-one-dark'
import { useApp, selectLayout } from '../store'
import { connectionFor } from '../engine/aiProviders'
import { AiPrompt } from '../components/AiPrompt'
import { cancelDesign, designEffect } from '../engine/aiDesigner'
import { lighting } from '../engine/lighting'
import type { EffectLog } from '../engine/effectHost'
import { parseEffectMeta, type PropValue } from '../engine/effectMeta'
import { FramePreview } from '../components/FramePreview'
import { PropControls } from '../components/PropControls'
import type { ShowToast } from '../components/Toast'
import { IconChat, IconDownload, IconMusic, IconPlus, IconSave } from '../components/icons'
import { ChatPromptPanel } from '../components/ChatPromptPanel'

const STARTER = `<head>
  <title>My Code Effect</title>
  <meta description="Describe your effect here." />
  <meta publisher="Me" />
  <meta tags="custom" />
  <!-- Each property becomes a global variable + a control in the app. -->
  <meta property="color1" label="Colour 1" type="color" default="#ff2d95" />
  <meta property="color2" label="Colour 2" type="color" default="#21d4fd" />
  <meta property="speed" label="Speed" type="number" min="1" max="100" default="40" />
  <meta property="react" label="React to music" type="boolean" default="1" />
</head>
<body style="margin:0;background:#000">
  <canvas id="c" width="320" height="200"></canvas>
</body>
<script>
  const ctx = document.getElementById('c').getContext('2d');

  function update(now) {
    const t = now / 1000 * speed / 25;
    // engine.audio.bass is 0..1 when music is playing
    const boost = react ? engine.audio.bass : 0;

    for (let i = 0; i < 8; i++) {
      const g = ctx.createLinearGradient(0, 0, 320, 0);
      const x = (i / 8 + t * 0.1) % 1;
      g.addColorStop(0, color1);
      g.addColorStop(x, color2);
      g.addColorStop(1, color1);
      ctx.fillStyle = g;
      ctx.fillRect(0, i * 25, 320, 25);
    }

    if (boost > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + boost * 0.5 + ')';
      ctx.fillRect(0, 0, 320, 200);
    }
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
</script>
`

const REFERENCE: [string, string][] = [
  ['<meta property="x" type="number" min max default>', 'Slider → global x'],
  ['type="color" | "boolean" | "combobox" values="A,B" | "hue" | "text"', 'Other control types'],
  ['function onxChanged() {}', 'Called when x changes (and once at start)'],
  ['engine.audio.level / bass / mid / treble', '0–1 music energy'],
  ['engine.audio.freq[0..63]', 'Spectrum, low → high'],
  ['engine.audio.beat', 'true on the frame a beat hits'],
  ['engine.zone.hue/saturation/lightness[0..559]', '28×20 screen colour grid'],
  ['engine.time', 'Seconds since start'],
  ['Canvas 320 × 200', 'LEDs sample this canvas']
]

export function CodeEditor(props: { toast: ShowToast }) {
  const editing = useApp((s) => s.editing)
  const { setEditing, setEffects, setActiveEffect, setView } = useApp.getState()
  const initial = useMemo(() => (editing?.mode === 'code' ? editing : null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [code, setCode] = useState(initial?.html || STARTER)
  const [effectId, setEffectId] = useState<string | undefined>(initial?.id)
  const [values, setValues] = useState<Record<string, PropValue>>({})
  const [logs, setLogs] = useState<EffectLog[]>([])
  const [dirty, setDirty] = useState(!initial?.id)
  const [simulate, setSimulate] = useState(false)
  const [showRef, setShowRef] = useState(!initial)
  const meta = useMemo(() => parseEffectMeta(code), [code])
  const [undo, setUndo] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(editing?.mode === 'code' && editing.openChat === true)

  const askAi = (prompt: string): { done: Promise<string | null>; cancel: () => void } => {
    const s = useApp.getState()
    const before = code
    const { id, done } = designEffect({
      conn: connectionFor(s.aiProvider, s.aiConfigs),
      mode: 'code',
      prompt,
      devices: selectLayout(s),
      current: { name: meta.title, html: before }
    })
    return {
      cancel: () => cancelDesign(id),
      done: done.then((res) => {
        if (!res.ok) return res.error
        if (res.mode !== 'code') return 'Unexpected response.'
        setUndo(before)
        setCode(res.html)
        setDirty(true)
        props.toast('Code updated by AI')
        return null
      })
    }
  }

  // Live-run the code shortly after typing stops.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const next: Record<string, PropValue> = {}
      for (const p of meta.props) next[p.name] = p.name in values ? values[p.name] : p.default
      setValues(next)
      setLogs([])
      lighting().load(code, next)
    }, 550)
    return () => window.clearTimeout(t)
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => lighting().onLog((l) => setLogs((prev) => [...prev.slice(-60), l])), [])
  useEffect(() => lighting().setSimulateAudio(simulate), [simulate])
  useEffect(
    () => () => {
      lighting().setSimulateAudio(false)
      setEditing(null)
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const save = async (asNew: boolean): Promise<string> => {
    const id = await window.lumora.effects.save(meta.title, code, asNew ? undefined : effectId)
    setEffectId(id)
    setDirty(false)
    setEffects(await window.lumora.effects.list())
    props.toast(`Saved “${meta.title}”`)
    return id
  }

  return (
    <div className="code-layout">
      {chatOpen && (
        <ChatPromptPanel
          currentHtml={code}
          onClose={() => setChatOpen(false)}
          onLoad={(html) => {
            setUndo(code)
            setCode(html)
            setDirty(true)
            setChatOpen(false)
            props.toast(`Loaded “${parseEffectMeta(html).title}” from your AI chat`)
          }}
        />
      )}
      <div className="code-pane">
        <div className="editor-toolbar">
          <b style={{ fontSize: 16 }}>{meta.title}</b>
          {dirty && <span className="faint small">unsaved</span>}
          <div style={{ flex: 1 }} />
          <button className="btn sm" onClick={() => setChatOpen(true)} title="Copy a ready-made prompt into ChatGPT, Claude, Gemini… and paste the reply back">
            <IconChat /> Use any AI chat
          </button>
          <button
            className="btn sm ghost"
            onClick={() => {
              if (dirty && !confirm('Discard your changes and start a new effect?')) return
              setCode(STARTER)
              setEffectId(undefined)
              setDirty(true)
            }}
          >
            <IconPlus /> New
          </button>
          <button className="btn sm" onClick={() => save(false)}>
            <IconSave /> Save
          </button>
          {effectId && (
            <button className="btn sm ghost" onClick={() => save(true)}>
              Save copy
            </button>
          )}
          <button
            className="btn sm ghost"
            onClick={async () => {
              if (await window.lumora.effects.exportFile(meta.title, code)) props.toast('Exported')
            }}
          >
            <IconDownload /> Export
          </button>
          <button
            className="btn sm primary"
            onClick={async () => {
              const id = dirty || !effectId ? await save(false) : effectId
              setActiveEffect(id)
              setView('library')
            }}
          >
            Use this effect
          </button>
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }} className="stack">
          <AiPrompt
            compact
            placeholder="Ask AI to write or change the code… e.g. “add a speed slider”, “make the waves bounce to the beat”"
            submitLabel="Apply"
            onSubmit={askAi}
          />
          {undo !== null && (
            <div className="row small">
              <span className="muted">AI rewrote the code.</span>
              <button
                className="btn sm ghost"
                onClick={() => {
                  setCode(undo)
                  setUndo(null)
                }}
              >
                Undo
              </button>
              <button className="btn sm ghost" onClick={() => setUndo(null)}>
                Keep
              </button>
            </div>
          )}
        </div>
        <div className="code-host">
          <CodeMirror
            value={code}
            height="100%"
            theme={oneDark}
            extensions={[htmlLang()]}
            onChange={(v) => {
              setCode(v)
              setDirty(true)
            }}
            basicSetup={{ foldGutter: true, highlightActiveLine: true }}
          />
        </div>
      </div>
      <aside className="side-panel">
        <FramePreview />
        <div className="row wrap">
          <button className={`btn sm${simulate ? ' primary' : ''}`} onClick={() => setSimulate((v) => !v)}>
            <IconMusic /> {simulate ? 'Simulating music' : 'Simulate music'}
          </button>
          <button className="btn sm ghost" onClick={() => setShowRef((v) => !v)}>
            {showRef ? 'Hide' : 'Show'} API reference
          </button>
        </div>
        {showRef && (
          <div className="card stack" style={{ gap: 8 }}>
            {REFERENCE.map(([k, v]) => (
              <div key={k} className="stack" style={{ gap: 2 }}>
                <code className="small" style={{ color: '#b89cff' }}>
                  {k}
                </code>
                <span className="small faint">{v}</span>
              </div>
            ))}
            <span className="small faint">Full guide: docs/EFFECT_API.md</span>
          </div>
        )}
        <div className="card stack">
          <h3>Controls</h3>
          <PropControls
            props={meta.props}
            values={values}
            onChange={(name, v) => {
              setValues((s) => ({ ...s, [name]: v }))
              lighting().setProp(name, v)
            }}
          />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h3>Console</h3>
          <div className="console">
            {logs.length === 0 ? (
              <span className="faint">No messages. console.log() output and errors appear here.</span>
            ) : (
              logs.map((l, i) => (
                <span key={i} className={l.level}>
                  {l.message}
                </span>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
