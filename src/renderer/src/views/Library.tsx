import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp, effectValues, type LibraryEffect } from '../store'
import { thumbnails } from '../engine/thumbnails'
import { PropControls } from '../components/PropControls'
import { Slider } from '../components/controls'
import { SetupPreview } from '../components/SetupPreview'
import type { ShowToast } from '../components/Toast'
import { IconGrid, IconMusic, IconMonitor, IconCopy, IconDownload, IconEdit, IconFolder, IconStar, IconTrash, IconUpload, IconPlay, IconX, IconWand } from '../components/icons'

// ---------- taxonomy (matches docs/EFFECT_API.md) ----------

const CATEGORIES = ['Classic', 'Nature', 'Space', 'Retro & Gaming', 'Abstract', 'Party & Music', 'Cozy & Seasonal', 'Wellness & Focus', 'Screen Sync']
const MINE = 'My Creations'
const OTHER = 'Other'
const ENERGIES: { value: 'calm' | 'lively' | 'intense'; label: string }[] = [
  { value: 'calm', label: 'Calm' },
  { value: 'lively', label: 'Lively' },
  { value: 'intense', label: 'Intense' }
]
const PALETTES: { value: string; label: string; swatch: string }[] = [
  { value: 'warm', label: 'Warm', swatch: 'linear-gradient(135deg,#ff3d00,#ffb300)' },
  { value: 'cool', label: 'Cool', swatch: 'linear-gradient(135deg,#0047ff,#00e5ff)' },
  { value: 'rainbow', label: 'Rainbow', swatch: 'linear-gradient(135deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)' },
  { value: 'neon', label: 'Neon', swatch: 'linear-gradient(135deg,#ff00c8,#00ffe1)' },
  { value: 'pastel', label: 'Pastel', swatch: 'linear-gradient(135deg,#ffb3d9,#b3e5ff)' },
  { value: 'natural', label: 'Natural', swatch: 'linear-gradient(135deg,#2e7d32,#c8a24a)' },
  { value: 'mono', label: 'Mono', swatch: 'linear-gradient(135deg,#222,#eee)' }
]
type Browse = 'all' | 'favorites' | 'mine' | 'music' | 'screen'
type Sort = 'category' | 'name' | 'newest'

function sectionOf(e: LibraryEffect): string {
  if (e.source === 'user' && !CATEGORIES.includes(e.meta.category)) return MINE
  return CATEGORIES.includes(e.meta.category) ? e.meta.category : OTHER
}

// ---------- cards ----------

function useThumb(effect: LibraryEffect): string | undefined {
  const [url, setUrl] = useState(() => thumbnails().get(effect.id, effect.html))
  useEffect(() => {
    const t = thumbnails()
    const cached = t.get(effect.id, effect.html)
    setUrl(cached)
    if (cached) return
    const off = t.onReady((id, u) => {
      if (id === effect.id) setUrl(u)
    })
    t.request(effect.id, effect.html, effectValues(effect))
    return off
  }, [effect])
  return url
}

function EffectCard(props: { effect: LibraryEffect; active: boolean; favorite: boolean; onApply: () => void; onFavorite: () => void }) {
  const { effect } = props
  const thumb = useThumb(effect)
  return (
    <div
      className={`effect-card${props.active ? ' active' : ''}`}
      onClick={props.onApply}
      onKeyDown={(e) => e.key === 'Enter' && props.onApply()}
      role="button"
      tabIndex={0}
      title={effect.meta.description}
    >
      {thumb ? <img className="effect-thumb" src={thumb} alt="" draggable={false} /> : <div className="effect-thumb loading" />}
      {props.active && (
        <span className="playing-flag">
          <IconPlay width={10} height={10} /> Playing
        </span>
      )}
      <div className="effect-actions">
        <button
          className={`fav${props.favorite ? ' on' : ''}`}
          title={props.favorite ? 'Remove from favourites' : 'Add to favourites'}
          onClick={(e) => {
            e.stopPropagation()
            props.onFavorite()
          }}
        >
          <IconStar filled={props.favorite} />
        </button>
      </div>
      <div className="effect-info">
        <span className="effect-name">{effect.meta.title}</span>
        <span className="effect-sub">
          {effect.source === 'user' && <span className="badge custom">Mine</span>}
          {effect.meta.needsAudio && (
            <span className="badge audio">
              <IconMusic /> Music
            </span>
          )}
          {effect.meta.needsScreen && (
            <span className="badge screen">
              <IconMonitor /> Screen
            </span>
          )}
          {effect.meta.energy && <span className={`badge energy-${effect.meta.energy}`}>{effect.meta.energy}</span>}
        </span>
      </div>
    </div>
  )
}

function FilterButton(props: { on: boolean; onClick: () => void; label: string; count?: number; swatch?: string; icon?: ReactNode }) {
  return (
    <button className={`filter-item${props.on ? ' on' : ''}`} onClick={props.onClick}>
      {props.icon}
      {props.swatch && <span className="filter-swatch" style={{ background: props.swatch }} />}
      <span className="filter-label">{props.label}</span>
      {props.count !== undefined && <span className="filter-count">{props.count}</span>}
    </button>
  )
}

// ---------- view ----------

export function Library(props: { toast: ShowToast }) {
  const effects = useApp((s) => s.effects)
  const activeId = useApp((s) => s.activeEffectId)
  const favorites = useApp((s) => s.favorites)
  const propValues = useApp((s) => s.propValues)
  const effectBrightness = useApp((s) => s.effectBrightness)
  const deviceEffects = useApp((s) => s.deviceEffects)
  const { setActiveEffect, toggleFavorite, setProp, resetProps, setEditing, setView } = useApp.getState()

  const [query, setQuery] = useState('')
  const [browse, setBrowse] = useState<Browse>('all')
  const [category, setCategory] = useState<string | null>(null)
  const [energies, setEnergies] = useState<string[]>([])
  const [palettes, setPalettes] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('category')

  const toggle = (list: string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const filtersActive = browse !== 'all' || category !== null || energies.length > 0 || palettes.length > 0 || query.trim() !== ''
  const clearFilters = (): void => {
    setBrowse('all')
    setCategory(null)
    setEnergies([])
    setPalettes([])
    setQuery('')
  }

  // Everything except the facet being counted, so counts show "what you'd get".
  const matches = (e: LibraryEffect, skip?: 'browse' | 'category' | 'energy' | 'palette'): boolean => {
    const q = query.trim().toLowerCase()
    if (q && !`${e.meta.title} ${e.meta.description} ${e.meta.tags.join(' ')} ${e.meta.category}`.toLowerCase().includes(q)) return false
    if (skip !== 'browse') {
      if (browse === 'favorites' && !favorites.includes(e.id)) return false
      if (browse === 'mine' && e.source !== 'user') return false
      if (browse === 'music' && !e.meta.needsAudio) return false
      if (browse === 'screen' && !e.meta.needsScreen) return false
    }
    if (skip !== 'category' && category && sectionOf(e) !== category) return false
    if (skip !== 'energy' && energies.length && !energies.includes(e.meta.energy)) return false
    if (skip !== 'palette' && palettes.length && !palettes.includes(e.meta.palette)) return false
    return true
  }

  const shown = effects.filter((e) => matches(e))
  const sections = useMemo(() => {
    const all = [...CATEGORIES, MINE, OTHER]
    return all.filter((c) => effects.some((e) => sectionOf(e) === c))
  }, [effects])

  const groups: { title: string | null; items: LibraryEffect[] }[] = useMemo(() => {
    if (sort === 'name') return [{ title: null, items: [...shown].sort((a, b) => a.meta.title.localeCompare(b.meta.title)) }]
    if (sort === 'newest') return [{ title: null, items: [...shown].sort((a, b) => b.mtime - a.mtime) }]
    return sections
      .map((c) => ({ title: c, items: shown.filter((e) => sectionOf(e) === c).sort((a, b) => a.meta.title.localeCompare(b.meta.title)) }))
      .filter((g) => g.items.length > 0)
  }, [shown, sort, sections])

  const active = effects.find((e) => e.id === activeId)
  const values = active ? effectValues(active, propValues[active.id]) : {}

  const customize = (e: LibraryEffect): void => {
    setEditing({ id: e.source === 'user' ? e.id : undefined, html: e.html, mode: e.meta.isLayers ? 'layers' : 'code' })
    setView(e.meta.isLayers ? 'create' : 'code')
  }

  const remove = async (e: LibraryEffect): Promise<void> => {
    if (!confirm(`Move "${e.meta.title}" to the Recycle Bin?`)) return
    await window.lumora.effects.remove(e.id)
    if (activeId === e.id) setActiveEffect('builtin/Rainbow Wave.html')
    props.toast('Moved to Recycle Bin')
  }

  const importFiles = async (): Promise<void> => {
    const ids = await window.lumora.effects.importFiles()
    if (ids.length) {
      props.toast(`Imported ${ids.length} effect${ids.length > 1 ? 's' : ''}`)
      setActiveEffect(ids[0])
    }
  }

  const surprise = (): void => {
    const pool = shown.filter((e) => e.id !== activeId)
    if (!pool.length) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    setActiveEffect(pick.id)
    props.toast(`Now playing: ${pick.meta.title}`)
  }

  const browseItems: { value: Browse; label: string; icon: ReactNode; count: number }[] = [
    { value: 'all', label: 'All effects', icon: <IconGrid />, count: effects.filter((e) => matches(e, 'browse')).length },
    { value: 'favorites', label: 'Favourites', icon: <IconStar />, count: effects.filter((e) => matches(e, 'browse') && favorites.includes(e.id)).length },
    { value: 'mine', label: 'My effects', icon: <IconEdit />, count: effects.filter((e) => matches(e, 'browse') && e.source === 'user').length },
    { value: 'music', label: 'Reacts to music', icon: <IconMusic />, count: effects.filter((e) => matches(e, 'browse') && e.meta.needsAudio).length },
    { value: 'screen', label: 'Screen sync', icon: <IconMonitor />, count: effects.filter((e) => matches(e, 'browse') && e.meta.needsScreen).length }
  ]

  return (
    <div className="view-split">
      <div className="library">
        <aside className="filter-rail">
          <div className="filter-group">
            {browseItems.map((b) => (
              <FilterButton key={b.value} on={browse === b.value} onClick={() => setBrowse(b.value)} label={b.label} icon={b.icon} count={b.count} />
            ))}
          </div>
          <div className="filter-group">
            <h3>Category</h3>
            {sections.map((c) => (
              <FilterButton
                key={c}
                on={category === c}
                onClick={() => setCategory(category === c ? null : c)}
                label={c}
                count={effects.filter((e) => matches(e, 'category') && sectionOf(e) === c).length}
              />
            ))}
          </div>
          <div className="filter-group">
            <h3>Energy</h3>
            <div className="row wrap" style={{ gap: 6 }}>
              {ENERGIES.map((en) => (
                <button key={en.value} className={`chip${energies.includes(en.value) ? ' on' : ''}`} onClick={() => setEnergies(toggle(energies, en.value))}>
                  {en.label}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <h3>Colours</h3>
            {PALETTES.map((p) => (
              <FilterButton
                key={p.value}
                on={palettes.includes(p.value)}
                onClick={() => setPalettes(toggle(palettes, p.value))}
                label={p.label}
                swatch={p.swatch}
                count={effects.filter((e) => matches(e, 'palette') && e.meta.palette === p.value).length}
              />
            ))}
          </div>
          {filtersActive && (
            <button className="btn sm ghost" onClick={clearFilters}>
              <IconX /> Clear filters
            </button>
          )}
        </aside>

        <div className="library-main">
          <div className="view-head">
            <h1>Effects</h1>
            <span className="faint">
              {shown.length === effects.length ? `${effects.length} effects · all free` : `${shown.length} of ${effects.length}`}
            </span>
          </div>
          <div className="library-toolbar">
            <input className="input" placeholder="Search… e.g. fire, retro, calm" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
              <option value="category">By category</option>
              <option value="name">A–Z</option>
              <option value="newest">Newest</option>
            </select>
            <button className="btn" onClick={surprise} title="Play a random effect from the current filters" disabled={!shown.length}>
              <IconWand /> Surprise me
            </button>
            <button className="btn icon" onClick={importFiles} title="Import .html effect files">
              <IconUpload />
            </button>
            <button className="btn icon" onClick={() => window.lumora.effects.openFolder()} title="Open my effects folder">
              <IconFolder />
            </button>
          </div>

          {shown.length === 0 ? (
            <div className="empty">
              {browse === 'mine' && effects.every((e) => e.source !== 'user') ? (
                'You have not made any effects yet — try the Visual Creator!'
              ) : (
                <>
                  No effects match these filters.{' '}
                  <button className="btn sm" style={{ marginLeft: 8 }} onClick={clearFilters}>
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.title ?? 'all'} className="effect-section">
                {g.title && (
                  <h2 className="section-title">
                    {g.title} <span className="faint">{g.items.length}</span>
                  </h2>
                )}
                <div className="effect-grid">
                  {g.items.map((e) => (
                    <EffectCard
                      key={e.id}
                      effect={e}
                      active={e.id === activeId}
                      favorite={favorites.includes(e.id)}
                      onApply={() => setActiveEffect(e.id)}
                      onFavorite={() => toggleFavorite(e.id)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <aside className="side-panel">
        <SetupPreview />
        {active ? (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 18 }}>{active.meta.title}</h2>
              {active.meta.description && <p className="muted small">{active.meta.description}</p>}
              <p className="faint small">
                {[active.meta.category || (active.source === 'user' ? MINE : ''), active.meta.publisher && `by ${active.meta.publisher}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="row wrap">
              <button className="btn sm" onClick={() => customize(active)}>
                {active.source === 'user' ? <IconEdit /> : <IconCopy />}
                {active.source === 'user' ? 'Edit' : 'Customize'}
              </button>
              <button
                className="btn sm"
                onClick={async () => {
                  if (await window.lumora.effects.exportFile(active.meta.title, active.html)) props.toast('Effect exported')
                }}
              >
                <IconDownload /> Export
              </button>
              {active.source === 'user' && (
                <button className="btn sm danger" onClick={() => remove(active)}>
                  <IconTrash /> Delete
                </button>
              )}
            </div>
            <div className="card stack">
              <div className="field-row">
                <h3>Settings</h3>
                {(propValues[active.id] || effectBrightness[active.id] !== undefined) && (
                  <button
                    className="btn ghost sm"
                    onClick={() => {
                      resetProps(active.id)
                      useApp.getState().setEffectBrightness(active.id, 100)
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              <Slider
                label="Brightness"
                title="Brightness of this effect only — the top-bar slider dims everything"
                value={effectBrightness[active.id] ?? 100}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => useApp.getState().setEffectBrightness(active.id, v)}
              />
              <PropControls
                // The universal Brightness slider above replaces an effect's own 0–100 brightness control.
                // Other effect-level "Brightness" controls are shown as "Intensity" so there's only one Brightness.
                props={active.meta.props
                  .filter((p) => !(p.name.toLowerCase() === 'brightness' && p.type === 'number' && p.min === 0 && p.max === 100))
                  .map((p) => (p.label.trim().toLowerCase() === 'brightness' && !active.meta.props.some((q) => q.label.trim().toLowerCase() === 'intensity') ? { ...p, label: p.min < 0 ? 'Brightness offset' : 'Intensity' } : p))}
                values={values}
                onChange={(name, v) => setProp(active.id, name, v)}
              />
            </div>
            {Object.keys(deviceEffects).length > 0 && (
              <p className="small faint">
                {Object.keys(deviceEffects).length === 1 ? '1 device runs' : `${Object.keys(deviceEffects).length} devices run`} its own effect —{' '}
                <a href="#" onClick={(e) => (e.preventDefault(), setView('layout'))}>
                  change in Layout
                </a>
                .
              </p>
            )}
            {active.meta.needsAudio && (
              <p className="small faint">Reacts to whatever is playing on your PC. Adjust sensitivity in Devices → Inputs.</p>
            )}
            {active.meta.needsScreen && <p className="small faint">Mirrors your screen colours. Choose the monitor in Devices → Inputs.</p>}
          </>
        ) : (
          <p className="muted">Pick an effect to start.</p>
        )}
      </aside>
    </div>
  )
}
