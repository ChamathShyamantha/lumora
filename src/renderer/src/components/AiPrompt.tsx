import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import type { AiStatus } from '../types'
import type { AiMode } from '../engine/aiDesigner'
import { connectionFor, providerById } from '../engine/aiProviders'
import { IconWand, IconX } from './icons'

/** Jump to the Code Editor with the "use any AI chat" dialog open. */
export function openAnyChat(): void {
  const { setEditing, setView } = useApp.getState()
  setEditing({ html: '', mode: 'code', openChat: true })
  setView('code')
}

export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null)
  useEffect(() => {
    void window.lumora.ai.status().then(setStatus)
  }, [])
  return status
}

/**
 * Prompt box for the AI designer. `onSubmit` resolves to an error message
 * (shown inline) or null on success.
 */
export function AiPrompt(props: {
  placeholder: string
  submitLabel: string
  examples?: string[]
  showMode?: boolean
  compact?: boolean
  onSubmit: (prompt: string, mode: AiMode) => { done: Promise<string | null>; cancel: () => void }
}) {
  const status = useAiStatus()
  const setView = useApp((s) => s.setView)
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<AiMode>('layers')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const cancelRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500)
    return () => window.clearInterval(t)
  }, [busy])

  const providerId = useApp((s) => s.aiProvider)
  const configs = useApp((s) => s.aiConfigs)
  const provider = providerById(providerId)
  const conn = connectionFor(providerId, configs)
  const missingKey = !!status && provider.needsKey && !status.keys[provider.id]
  const missingModel = !conn.model
  if (status && (missingKey || missingModel)) {
    return (
      <div className={`ai-box${props.compact ? ' compact' : ''}`}>
        <div className="row">
          <IconWand className="ai-icon" />
          <div className="stack" style={{ gap: 2, flex: 1 }}>
            <b>Design effects with AI</b>
            <span className="small muted">
              Describe what you want and an AI builds it. Works with Claude, ChatGPT, Gemini, OpenRouter, local Ollama and more —{' '}
              {missingKey ? `add your ${provider.name} key` : 'pick a model'} in Settings to turn it on.
            </span>
          </div>
          <button className="btn sm" onClick={openAnyChat} title="No API key needed — copy a prompt into ChatGPT, Claude, Gemini…">
            Use any AI chat
          </button>
          <button className="btn primary sm" onClick={() => setView('settings')}>
            Set up AI
          </button>
        </div>
      </div>
    )
  }

  const submit = (): void => {
    const text = prompt.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    setElapsed(0)
    const { done, cancel } = props.onSubmit(text, mode)
    cancelRef.current = cancel
    void done.then((err) => {
      setBusy(false)
      if (err) setError(err)
      else setPrompt('')
    })
  }

  return (
    <div className={`ai-box${props.compact ? ' compact' : ''}${busy ? ' busy' : ''}`}>
      <div className="ai-input-row">
        <IconWand className="ai-icon" />
        <textarea
          className="ai-input"
          rows={props.compact ? 1 : 2}
          placeholder={props.placeholder}
          value={prompt}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {busy ? (
          <button className="btn sm" onClick={() => cancelRef.current()}>
            <IconX /> Stop · {elapsed}s
          </button>
        ) : (
          <button className="btn primary sm" onClick={submit} disabled={!prompt.trim()}>
            {props.submitLabel}
          </button>
        )}
      </div>
      {busy && <div className="ai-progress" />}
      {props.showMode && !busy && (
        <div className="row wrap small" style={{ gap: 8 }}>
          <div className="segmented" style={{ width: 'auto' }}>
            <button className={mode === 'layers' ? 'on' : ''} onClick={() => setMode('layers')} title="Editable in the Visual Creator">
              Layers (editable)
            </button>
            <button className={mode === 'code' ? 'on' : ''} onClick={() => setMode('code')} title="AI writes code — more creative, edit in the Code Editor">
              Code (more creative)
            </button>
          </div>
        </div>
      )}
      {props.examples && !busy && (
        <div className="row wrap" style={{ gap: 6 }}>
          {props.examples.map((ex) => (
            <button key={ex} className="chip" style={{ textTransform: 'none' }} onClick={() => setPrompt(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="small" style={{ color: 'var(--bad)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
