import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { selectLayout, useApp } from '../store'
import { buildChatPrompt, CHAT_LINKS, extractHtmlFromReply } from '../engine/chatPrompt'
import { IconCopy, IconX } from './icons'

/**
 * "Use any AI chat": copy a ready-made prompt (effect API + the user's devices)
 * into ChatGPT/Claude/Gemini/etc., then paste the reply back.
 */
export function ChatPromptPanel(props: { currentHtml?: string; onLoad: (html: string) => void; onClose: () => void }) {
  const layoutState = useApp(useShallow((s) => ({ virtualDevices: s.virtualDevices, hardware: s.hardware, placements: s.placements })))
  const devices = useMemo(() => selectLayout(layoutState), [layoutState])
  const [idea, setIdea] = useState('')
  const [includeCode, setIncludeCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)

  const prompt = useMemo(
    () => buildChatPrompt({ devices, idea, currentHtml: includeCode ? props.currentHtml : undefined }),
    [devices, idea, includeCode, props.currentHtml]
  )
  const enabledDevices = devices.filter((d) => d.enabled)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Could not copy automatically — select the prompt preview and press Ctrl+C.')
    }
  }

  const load = (text: string): void => {
    const res = extractHtmlFromReply(text)
    if (!res.ok) return setError(res.error)
    setError(null)
    props.onLoad(res.html)
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-label="Use any AI chat">
        <div className="field-row">
          <h2 style={{ fontSize: 18 }}>Make an effect with any AI chat</h2>
          <button className="btn icon ghost" onClick={props.onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <p className="small muted">
          No API key needed. Copy this prompt into ChatGPT, Claude, Gemini or any other chat — it already explains Lumora’s effect format and
          your devices. Then paste the reply back here.
        </p>

        <div className="modal-step">
          <span className="step-num">1</span>
          <div className="stack" style={{ flex: 1, gap: 10 }}>
            <b>Copy the prompt</b>
            <textarea
              className="input"
              style={{ height: 64, padding: 8, resize: 'vertical' }}
              placeholder="Optional: describe your effect here (or tell the chat after pasting)… e.g. “lava lamp in orange and teal that speeds up with the music”"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
            />
            {props.currentHtml && (
              <label className="row small" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={includeCode} onChange={(e) => setIncludeCode(e.target.checked)} />
                Include my current code so the chat modifies it (instead of starting fresh)
              </label>
            )}
            <div className="row wrap">
              <button className="btn primary" onClick={copy}>
                <IconCopy /> {copied ? 'Copied!' : 'Copy prompt'}
              </button>
              <span className="small faint">Open:</span>
              {CHAT_LINKS.map((c) => (
                <button key={c.name} className="btn sm ghost" onClick={() => window.lumora.app.openExternal(c.url)}>
                  {c.name} ↗
                </button>
              ))}
            </div>
            <details>
              <summary className="small muted" style={{ cursor: 'pointer' }}>
                Preview prompt · {enabledDevices.length} device{enabledDevices.length === 1 ? '' : 's'} included · {Math.round(prompt.length / 1000)}k characters
              </summary>
              <textarea className="input prompt-preview" readOnly value={prompt} />
            </details>
          </div>
        </div>

        <div className="modal-step">
          <span className="step-num">2</span>
          <div className="stack" style={{ flex: 1, gap: 10 }}>
            <b>Paste the chat’s reply</b>
            <textarea
              className="input"
              style={{ height: 110, padding: 8, resize: 'vertical', fontFamily: 'Cascadia Mono, Consolas, monospace', fontSize: 12 }}
              placeholder="Paste the whole reply — Lumora finds the code in it."
              value={reply}
              onChange={(e) => {
                setReply(e.target.value)
                setError(null)
              }}
            />
            <div className="row wrap">
              <button className="btn primary" onClick={() => load(reply)} disabled={!reply.trim()}>
                Load into editor
              </button>
              <button
                className="btn ghost"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText()
                    setReply(text)
                    load(text)
                  } catch {
                    setError('Could not read the clipboard — paste into the box with Ctrl+V.')
                  }
                }}
              >
                Paste from clipboard &amp; load
              </button>
            </div>
            {error && (
              <p className="small" style={{ color: 'var(--bad)' }}>
                {error}
              </p>
            )}
            <p className="small faint">Want changes? Keep chatting there (“make it slower”, “add a colour picker”) and paste the new reply.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
