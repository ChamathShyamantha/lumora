import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { AI_PROVIDERS, ANTHROPIC_MODELS, connectionFor, providerById } from '../engine/aiProviders'
import type { AiStatus } from '../types'
import type { ShowToast } from './Toast'
import { IconRefresh } from './icons'

/** Settings card: choose an LLM provider, store its key, pick a model. */
export function AiSettings(props: { toast: ShowToast }) {
  const providerId = useApp((s) => s.aiProvider)
  const configs = useApp((s) => s.aiConfigs)
  const setSettings = useApp((s) => s.setSettings)
  const provider = providerById(providerId)
  const conn = connectionFor(providerId, configs)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [models, setModels] = useState<string[]>([])
  const storedKey = status?.keys[provider.id]

  useEffect(() => {
    void window.lumora.ai.status().then(setStatus)
  }, [])
  useEffect(() => {
    setModels([])
    setMessage(null)
    setKey('')
  }, [providerId])

  const updateConfig = (patch: Partial<{ baseUrl: string; model: string }>): void =>
    setSettings({ aiConfigs: { ...configs, [provider.id]: { baseUrl: conn.baseUrl, model: conn.model, ...patch } } })

  const saveKey = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const res = await window.lumora.ai.setKey(conn, key)
    setBusy(false)
    if (!res.ok) return setMessage({ ok: false, text: res.error })
    setKey('')
    setModels(res.models)
    setStatus(await window.lumora.ai.status())
    setMessage({ ok: true, text: `Key saved — ${res.models.length} models available.` })
    props.toast('AI design is on')
  }

  const loadModels = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const res = await window.lumora.ai.listModels(conn)
    setBusy(false)
    if (!res.ok) return setMessage({ ok: false, text: res.error })
    setModels(res.models)
    setMessage({
      ok: true,
      text: res.models.length ? `Connected — ${res.models.length} models found.` : 'Connected, but the server listed no models.'
    })
    if (!conn.model && res.models[0]) updateConfig({ model: res.models[0] })
  }

  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(conn.baseUrl)
  const remoteHttp = /^http:\/\//i.test(conn.baseUrl) && !isLocal
  const ready = (!provider.needsKey || !!storedKey) && !!conn.model

  return (
    <div className="card stack">
      <div className="field-row">
        <h2>AI effect designer</h2>
        <span className="row small">
          <span className={`dot ${ready ? 'ok' : ''}`} />
          {ready ? `On · ${conn.model}` : 'Off'}
        </span>
      </div>
      <p className="small muted">
        Describe an effect in your own words and an AI designs it — in the Visual Creator or as code. Use any provider with your own key, or a
        free local model with Ollama or LM Studio.
      </p>

      <label className="field">
        <span className="field-label">Provider</span>
        <select className="select" value={provider.id} onChange={(e) => setSettings({ aiProvider: e.target.value })}>
          {AI_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {status?.keys[p.id] ? '  ✓' : ''}
            </option>
          ))}
        </select>
      </label>
      {provider.hint && <p className="small faint">{provider.hint}</p>}

      {provider.editableUrl && (
        <label className="field">
          <span className="field-label">Server URL</span>
          <input className="input" value={conn.baseUrl} onChange={(e) => updateConfig({ baseUrl: e.target.value })} spellCheck={false} />
          {remoteHttp && (
            <span className="small" style={{ color: 'var(--warn)' }}>
              This is plain http to another computer — what you send (including a key) is not encrypted.
            </span>
          )}
        </label>
      )}

      <div className="field">
        <span className="field-label">API key{provider.needsKey ? '' : ' (optional)'}</span>
        {storedKey ? (
          <div className="row">
            <span className="small muted" style={{ flex: 1 }}>
              Saved key ending …{storedKey}
            </span>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (!confirm(`Remove your ${provider.name} key from this PC?`)) return
                await window.lumora.ai.clearKey(provider.id)
                setStatus(await window.lumora.ai.status())
              }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="row">
            <input
              className="input"
              type="password"
              placeholder={provider.needsKey ? 'Paste your API key' : 'Only if your server needs one'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && key.trim()) void saveKey()
              }}
              style={{ flex: 1 }}
              autoComplete="off"
              spellCheck={false}
              aria-label={`${provider.name} API key`}
            />
            <button className="btn primary" onClick={saveKey} disabled={!key.trim() || busy}>
              {busy ? 'Checking…' : 'Save key'}
            </button>
          </div>
        )}
        {provider.keyUrl && !storedKey && (
          <span className="small faint">
            Get a key:{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault()
                void window.lumora.app.openExternal(provider.keyUrl!)
              }}
            >
              {new URL(provider.keyUrl).hostname}
            </a>
            . {status?.encrypted ? 'Stored encrypted on this PC' : 'Stored on this PC'} and only sent to {provider.name}.
          </span>
        )}
      </div>

      <div className="field">
        <div className="field-row">
          <span className="field-label">Model</span>
          <button className="btn sm ghost" onClick={loadModels} disabled={busy || (provider.needsKey && !storedKey)}>
            <IconRefresh /> {provider.kind === 'anthropic' ? 'Show all models' : 'Load models'}
          </button>
        </div>
        {provider.kind === 'anthropic' && models.length === 0 ? (
          <select className="select" value={conn.model} onChange={(e) => updateConfig({ model: e.target.value })}>
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
            {conn.model && !ANTHROPIC_MODELS.some((m) => m.value === conn.model) && <option value={conn.model}>{conn.model}</option>}
          </select>
        ) : (
          <>
            <input
              className="input"
              list="ai-models"
              value={conn.model}
              placeholder={models.length ? 'Pick or type a model' : 'Type a model name, or press Load models'}
              onChange={(e) => updateConfig({ model: e.target.value })}
              spellCheck={false}
            />
            <datalist id="ai-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </>
        )}
      </div>
      {message && (
        <p className="small" style={{ color: message.ok ? 'var(--ok)' : 'var(--bad)' }}>
          {message.text}
        </p>
      )}
      <p className="small faint">You pay your provider directly for what you use (local models are free). Stronger models design noticeably better effects.</p>
    </div>
  )
}
