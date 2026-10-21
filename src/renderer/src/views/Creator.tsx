import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, selectLayout } from '../store'
import { connectionFor } from '../engine/aiProviders'
import { AiPrompt, openAnyChat } from '../components/AiPrompt'
import { AI_EXAMPLES, cancelDesign, designEffect, type AiMode } from '../engine/aiDesigner'
import { lighting } from '../engine/lighting'
import {
  BLEND_MODES,
  LAYER_TYPES,
  MOD_SOURCES,
  TEMPLATES,
  createLayer,
  generateLayersHtml,
  layerType,
  newId,
  paramRange,
  parseLayersHtml,
  usesAudio,
  type Layer,
  type LayerConfig,
  type ParamSpec
} from '../engine/layers'
import { FramePreview } from '../components/FramePreview'
import { SetupPreview } from '../components/SetupPreview'
import { ColorField, ColorSwatch, SelectField, Slider, ToggleField } from '../components/controls'
import type { ShowToast } from '../components/Toast'
import { IconCopy, IconDown, IconDownload, IconEye, IconEyeOff, IconMusic, IconPlus, IconSave, IconTrash, IconUp, IconX, IconCode } from '../components/icons'

function swatchFor(layer: Layer): string {
  const p = layer.params
  if (layer.type === 'solid') return String(p.color)
  if (Array.isArray(p.colors)) return `linear-gradient(135deg, ${p.colors.join(',')})`
  if (typeof p.color === 'string' && typeof p.color2 === 'string') return `linear-gradient(135deg, ${p.color}, ${p.color2})`
  if (typeof p.color === 'string' && !p.rainbow) return `radial-gradient(circle, ${p.color}, #0b0d12 80%)`
  return layerType(layer.type)?.swatch ?? '#333'
}

function AudioMeter() {
  const [bands, setBands] = useState<number[]>(new Array(16).fill(0))
  useEffect(() => {
    const t = window.setInterval(() => {
      const a = lighting().lastAudio
      if (!a?.active) return setBands(new Array(16).fill(0))
      setBands(Array.from({ length: 16 }, (_, i) => (a.freq[i * 4] + a.freq[i * 4 + 1] + a.freq[i * 4 + 2] + a.freq[i * 4 + 3]) / 4))
    }, 66)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div className="meter" title="Live audio">
      {bands.map((b, i) => (
        <span key={i} style={{ height: `${Math.max(4, b * 100)}%` }} />
      ))}
    </div>
  )
}

function ParamControl(props: { spec: ParamSpec; value: Layer['params'][string]; onChange: (v: Layer['params'][string]) => void }) {
  const { spec, value, onChange } = props
  switch (spec.kind) {
    case 'number':
      return <Slider label={spec.label} value={Number(value)} min={spec.min ?? 0} max={spec.max ?? 100} step={spec.step} onChange={onChange} />
    case 'color':
      return <ColorField label={spec.label} value={String(value)} onChange={onChange} />
    case 'boolean':
      return <ToggleField label={spec.label} on={Boolean(value)} onChange={onChange} />
    case 'select':
      return <SelectField label={spec.label} value={String(value)} options={spec.options ?? []} onChange={onChange} />
    case 'colors': {
      const list = Array.isArray(value) ? value : []
      return (
        <div className="field">
          <span className="field-label">{spec.label}</span>
          <div className="row wrap">
            {list.map((c, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <ColorSwatch value={c} onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))} />
                {list.length > 2 && (
                  <button
                    className="btn sm icon ghost"
                    style={{ position: 'absolute', top: -10, right: -10, width: 18, height: 18, borderRadius: 9, background: '#222838' }}
                    title="Remove colour"
                    onClick={() => onChange(list.filter((_, j) => j !== i))}
                  >
                    <IconX width={10} height={10} />
                  </button>
                )}
              </div>
            ))}
            {list.length < 6 && (
              <button
                className="btn sm icon"
                title="Add colour"
                onClick={() => onChange([...list, `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`])}
              >
                <IconPlus />
              </button>
            )}
          </div>
        </div>
      )
    }
  }
}

export function Creator(props: { toast: ShowToast }) {
  const editing = useApp((s) => s.editing)
  const { setEditing, setEffects, setActiveEffect, setView } = useApp.getState()

  const initial = useMemo(() => (editing?.mode === 'layers' ? parseLayersHtml(editing.html) : null), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [config, setConfig] = useState<LayerConfig | null>(initial?.config ?? null)
  const [name, setName] = useState(initial?.name ?? 'My Effect')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [effectId, setEffectId] = useState<string | undefined>(editing?.mode === 'layers' ? editing.id : undefined)
  const [selected, setSelected] = useState<string | null>(initial?.config.layers.at(-1)?.id ?? null)
  const [simulate, setSimulate] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [undo, setUndo] = useState<{ config: LayerConfig; name: string } | null>(null)
  const audioOn = config ? usesAudio(config) : false
  const loadedAudio = useRef<boolean | null>(null)

  /** Ask the configured AI for a new design, or (refine) a change to the current one. */
  const runAi = (prompt: string, mode: AiMode, refine: boolean): { done: Promise<string | null>; cancel: () => void } => {
    const s = useApp.getState()
    const { id, done } = designEffect({
      conn: connectionFor(s.aiProvider, s.aiConfigs),
      mode,
      prompt,
      devices: selectLayout(s),
      current: refine && config ? { name, config } : undefined
    })
    return {
      cancel: () => cancelDesign(id),
      done: done.then((res) => {
        if (!res.ok) return res.error
        if (res.mode === 'code') {
          setEditing({ html: res.html, mode: 'code' })
          setView('code')
          return null
        }
        if (refine && config) setUndo({ config, name })
        else setName(res.name)
        if (!refine || !description) setDescription(res.description)
        setConfig(res.config)
        setSelected(res.config.layers.at(-1)?.id ?? null)
        setDirty(true)
        props.toast(refine ? 'Updated by AI' : `Designed “${res.name}”`)
        return null
      })
    }
  }

  // Drive the lighting engine with the effect being built.
  useEffect(() => {
    if (!config) return
    if (loadedAudio.current !== audioOn) {
      loadedAudio.current = audioOn
      lighting().load(generateLayersHtml(name, description, config), {})
    } else {
      lighting().post({ type: 'layers', config })
    }
  }, [config, audioOn]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    lighting().setSimulateAudio(simulate)
  }, [simulate])

  useEffect(
    () => () => {
      lighting().setSimulateAudio(false)
      setEditing(null)
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const update = (fn: (c: LayerConfig) => LayerConfig): void => {
    setConfig((c) => (c ? fn(c) : c))
    setDirty(true)
  }
  const updateLayer = (id: string, patch: Partial<Layer>): void =>
    update((c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
  const setParam = (layer: Layer, key: string, value: Layer['params'][string]): void =>
    updateLayer(layer.id, { params: { ...layer.params, [key]: value } })

  const save = async (asNew: boolean): Promise<string | undefined> => {
    if (!config) return undefined
    const html = generateLayersHtml(name.trim() || 'My Effect', description, config)
    const id = await window.lumora.effects.save(name.trim() || 'My Effect', html, asNew ? undefined : effectId)
    setEffectId(id)
    setDirty(false)
    setEffects(await window.lumora.effects.list())
    props.toast(`Saved “${name}” to your effects`)
    return id
  }

  const useNow = async (): Promise<void> => {
    const id = dirty || !effectId ? await save(false) : effectId
    if (id) setActiveEffect(id)
    setView('library')
  }

  // ---------- template chooser ----------
  if (!config) {
    return (
      <div className="view">
        <div className="view-head">
          <h1>Visual Creator</h1>
          <span className="faint">Stack layers, pick colours, make it dance to music — no code needed.</span>
        </div>
        <div style={{ marginBottom: 26, maxWidth: 900 }}>
          <AiPrompt
            placeholder="Describe the effect you want… e.g. “slow purple waves that pulse with the bass”"
            submitLabel="Create with AI"
            examples={AI_EXAMPLES}
            showMode
            onSubmit={(prompt, mode) => runAi(prompt, mode, false)}
          />
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={openAnyChat}>
            No API key? Use ChatGPT, Claude, Gemini or any AI chat instead →
          </button>
        </div>
        <h3 style={{ marginBottom: 12 }}>Or start from a template</h3>
        <div className="template-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              className="template-tile"
              onClick={() => {
                const c = t.build()
                setConfig(c)
                setName(t.name === 'Blank' ? 'My Effect' : `My ${t.name}`)
                setDescription(t.description)
                setSelected(c.layers.at(-1)?.id ?? null)
                setDirty(true)
              }}
            >
              <b>{t.name}</b>
              <span className="small muted">{t.description}</span>
            </button>
          ))}
        </div>
        <p className="faint small" style={{ marginTop: 22 }}>
          Tip: open any of your saved creations from the Effects page and press <b>Edit</b> to keep working on it.
        </p>
      </div>
    )
  }

  const layer = config.layers.find((l) => l.id === selected) ?? null
  const spec = layer ? layerType(layer.type) : undefined
  const numericParams = spec ? spec.params.filter((p) => p.kind === 'number') : []
  const visualOrder = [...config.layers].reverse()

  const move = (id: string, dir: -1 | 1): void =>
    update((c) => {
      // dir is in visual order (up = towards the top of the stack = later in array)
      const i = c.layers.findIndex((l) => l.id === id)
      const j = i - dir
      if (j < 0 || j >= c.layers.length) return c
      const layers = [...c.layers]
      ;[layers[i], layers[j]] = [layers[j], layers[i]]
      return { ...c, layers }
    })

  return (
    <div className="editor">
      {/* ---------- layers ---------- */}
      <div className="editor-col left">
        <div className="field-row">
          <h3>Layers</h3>
          <button className="btn sm" onClick={() => setShowAdd((v) => !v)}>
            <IconPlus /> Add
          </button>
        </div>
        {showAdd && (
          <div className="add-grid">
            {LAYER_TYPES.map((t) => (
              <button
                key={t.type}
                className="add-tile"
                title={t.description}
                onClick={() => {
                  const l = createLayer(t.type, config.layers.length ? { blend: ['sparkles', 'ripples', 'orbs', 'spectrum', 'pulse', 'scanner'].includes(t.type) ? 'add' : 'normal' } : {})
                  update((c) => ({ ...c, layers: [...c.layers, l] }))
                  setSelected(l.id)
                  setShowAdd(false)
                }}
              >
                <span className="layer-swatch" style={{ background: t.swatch }} />
                {t.name}
              </button>
            ))}
          </div>
        )}
        <div className="layer-list">
          {visualOrder.map((l, vi) => (
            <div
              key={l.id}
              className={`layer-item${l.id === selected ? ' selected' : ''}${l.visible ? '' : ' hidden-layer'}`}
              onClick={() => setSelected(l.id)}
            >
              <span className="layer-swatch" style={{ background: swatchFor(l) }} />
              <span className="layer-name">
                <b>{l.name}</b>
                <span>
                  {layerType(l.type)?.name}
                  {l.blend !== 'normal' ? ` · ${BLEND_MODES.find((b) => b.value === l.blend)?.label}` : ''}
                  {l.mods.length ? ' · music-linked' : ''}
                </span>
              </span>
              <button className="btn sm icon" title="Move up" disabled={vi === 0} onClick={(e) => (e.stopPropagation(), move(l.id, 1))}>
                <IconUp />
              </button>
              <button
                className="btn sm icon"
                title="Move down"
                disabled={vi === visualOrder.length - 1}
                onClick={(e) => (e.stopPropagation(), move(l.id, -1))}
              >
                <IconDown />
              </button>
              <button
                className="btn sm icon"
                title={l.visible ? 'Hide' : 'Show'}
                onClick={(e) => (e.stopPropagation(), updateLayer(l.id, { visible: !l.visible }))}
              >
                {l.visible ? <IconEye /> : <IconEyeOff />}
              </button>
            </div>
          ))}
          {config.layers.length === 0 && <div className="empty small">Add a layer to begin.</div>}
        </div>
        <p className="small faint">Top layers are drawn over lower ones. Use “Add (glow)” blend for light effects on top.</p>
      </div>

      {/* ---------- preview ---------- */}
      <div className="editor-col">
        <div className="editor-toolbar">
          <input
            className="title-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setDirty(true)
            }}
            placeholder="Effect name"
          />
          <button className="btn" onClick={() => save(false)} disabled={!dirty && !!effectId}>
            <IconSave /> {effectId ? 'Save' : 'Save to my effects'}
          </button>
          {effectId && (
            <button className="btn ghost" onClick={() => save(true)}>
              Save copy
            </button>
          )}
          <button className="btn primary" onClick={useNow}>
            Use this effect
          </button>
        </div>
        <AiPrompt
          compact
          placeholder="Ask AI to change it… e.g. “more purple”, “add sparkles on the beat”, “slower and calmer”"
          submitLabel="Apply"
          onSubmit={(prompt) => runAi(prompt, 'layers', true)}
        />
        {undo && (
          <div className="row small">
            <span className="muted">AI changed your effect.</span>
            <button
              className="btn sm ghost"
              onClick={() => {
                setConfig(undo.config)
                setName(undo.name)
                setSelected(undo.config.layers.at(-1)?.id ?? null)
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
        <FramePreview />
        <div className="row wrap">
          <button className={`btn sm${simulate ? ' primary' : ''}`} onClick={() => setSimulate((v) => !v)} title="Preview music reactions with a fake beat">
            <IconMusic /> {simulate ? 'Simulating music' : 'Simulate music'}
          </button>
          <div style={{ width: 140 }}>
            <AudioMeter />
          </div>
          <div className="grow" style={{ flex: 1 }} />
          <button
            className="btn sm ghost"
            onClick={async () => {
              if (await window.lumora.effects.exportFile(name, generateLayersHtml(name, description, config))) props.toast('Exported')
            }}
          >
            <IconDownload /> Export
          </button>
          <button
            className="btn sm ghost"
            title="Turn this into an HTML/JS effect you can edit by hand"
            onClick={() => {
              setEditing({ html: generateLayersHtml(name, description, config), mode: 'code' })
              setView('code')
            }}
          >
            <IconCode /> Open as code
          </button>
        </div>
        <SetupPreview />
      </div>

      {/* ---------- inspector ---------- */}
      <div className="editor-col right">
        {layer && spec ? (
          <>
            <div className="field-row">
              <input className="input" value={layer.name} onChange={(e) => updateLayer(layer.id, { name: e.target.value })} style={{ flex: 1 }} />
              <button
                className="btn icon"
                title="Duplicate layer"
                onClick={() => {
                  const copy = { ...structuredClone(layer), id: newId(), name: `${layer.name} copy` }
                  update((c) => {
                    const i = c.layers.findIndex((l) => l.id === layer.id)
                    const layers = [...c.layers]
                    layers.splice(i + 1, 0, copy)
                    return { ...c, layers }
                  })
                  setSelected(copy.id)
                }}
              >
                <IconCopy />
              </button>
              <button
                className="btn icon danger"
                title="Delete layer"
                onClick={() => {
                  update((c) => ({ ...c, layers: c.layers.filter((l) => l.id !== layer.id) }))
                  setSelected(null)
                }}
              >
                <IconTrash />
              </button>
            </div>
            <div className="card stack">
              <h3>{spec.name}</h3>
              {spec.params.map((p) => (
                <ParamControl key={p.key} spec={p} value={layer.params[p.key] ?? p.default} onChange={(v) => setParam(layer, p.key, v)} />
              ))}
            </div>
            <div className="card stack">
              <h3>Blending</h3>
              <Slider label="Opacity" value={layer.opacity} min={0} max={100} suffix="%" onChange={(v) => updateLayer(layer.id, { opacity: v })} />
              <SelectField label="Blend mode" value={layer.blend} options={BLEND_MODES} onChange={(v) => updateLayer(layer.id, { blend: v as Layer['blend'] })} />
            </div>
            <div className="card stack">
              <div className="field-row">
                <h3>React to music</h3>
                <button
                  className="btn sm"
                  onClick={() => {
                    const param = numericParams.find((p) => p.key === 'speed')?.key ?? numericParams[0]?.key ?? 'opacity'
                    updateLayer(layer.id, {
                      mods: [...layer.mods, { param, source: 'bass', amount: 50, range: paramRange(layer.type, param) }]
                    })
                    if (!simulate && lighting().status.audio !== 'on') setSimulate(true)
                  }}
                >
                  <IconPlus /> Link
                </button>
              </div>
              {layer.mods.length === 0 && (
                <p className="small faint">Link a setting to bass, beats or volume and it will move with your music.</p>
              )}
              {layer.mods.map((m, i) => {
                const setMod = (patch: Partial<typeof m>): void =>
                  updateLayer(layer.id, { mods: layer.mods.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                return (
                  <div key={i} className="mod-item">
                    <select
                      className="select"
                      value={m.param}
                      onChange={(e) => setMod({ param: e.target.value, range: paramRange(layer.type, e.target.value) })}
                    >
                      <option value="opacity">Opacity</option>
                      {numericParams.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <select className="select" value={m.source} onChange={(e) => setMod({ source: e.target.value as typeof m.source })}>
                      {MOD_SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn sm icon ghost"
                      title="Remove link"
                      onClick={() => updateLayer(layer.id, { mods: layer.mods.filter((_, j) => j !== i) })}
                    >
                      <IconX />
                    </button>
                    <div className="full">
                      <Slider label="Amount" value={m.amount} min={-100} max={100} suffix="%" onChange={(v) => setMod({ amount: v })} />
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="card stack">
            <h3>Effect</h3>
            <label className="field">
              <span className="field-label">Description</span>
              <textarea
                className="input"
                style={{ height: 70, padding: 8, resize: 'vertical' }}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setDirty(true)
                }}
              />
            </label>
            <ColorField label="Background" value={config.background} onChange={(v) => update((c) => ({ ...c, background: v }))} />
            <Slider label="Overall speed" value={config.speed} min={0} max={300} suffix="%" onChange={(v) => update((c) => ({ ...c, speed: v }))} />
            <p className="small faint">Select a layer on the left to change it.</p>
          </div>
        )}
        {layer && (
          <button className="btn ghost sm" onClick={() => setSelected(null)}>
            Effect settings (background, speed)
          </button>
        )}
      </div>
    </div>
  )
}
