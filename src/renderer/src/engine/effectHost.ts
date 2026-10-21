import bootstrapSource from './bootstrap.js?raw'
import type { PropValue } from './effectMeta'

export interface HostOptions {
  fps?: number
  /** Capture a frame every N ticks. */
  captureEvery?: number
}

export interface EffectLog {
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  time: number
}

// UTF-8 safe base64 (btoa alone only accepts Latin-1).
const bootstrapB64 = btoa(String.fromCharCode(...new TextEncoder().encode(bootstrapSource)))

/** Escape JSON for safe embedding inside an inline <script>. */
function scriptJson(value: unknown): string {
  const bs = String.fromCharCode(92)
  return JSON.stringify(value)
    .replace(/</g, bs + "u003c")
    .split(String.fromCharCode(0x2028)).join(bs + "u2028")
    .split(String.fromCharCode(0x2029)).join(bs + "u2029")
}

/**
 * Build the document that actually runs: the bootstrap goes on the same first
 * line as the effect source so error line numbers match the effect file.
 */
export function composeEffectDocument(html: string, props: Record<string, PropValue>, opts: HostOptions): string {
  const init = { props, fps: opts.fps ?? 60, captureEvery: opts.captureEvery ?? 2 }
  return (
    `<!doctype html><meta charset="utf-8"><script>window.__LUMORA_INIT__=${scriptJson(init)};` +
    `eval(new TextDecoder().decode(Uint8Array.from(atob('${bootstrapB64}'),function(c){return c.charCodeAt(0)})))</script>` +
    html
  )
}

type FrameListener = (pixels: Uint8ClampedArray) => void

/**
 * Runs one effect inside a sandboxed iframe (scripts only — no same-origin,
 * no network) and streams its 320x200 frames back.
 */
export class EffectHost {
  readonly iframe: HTMLIFrameElement
  private frameListeners = new Set<FrameListener>()
  private logListeners = new Set<(log: EffectLog) => void>()
  private readyListeners = new Set<() => void>()
  private loadToken = 0
  lastFrame: Uint8ClampedArray | null = null

  constructor(
    private readonly slot: string,
    private readonly opts: HostOptions = {}
  ) {
    const f = document.createElement('iframe')
    f.setAttribute('sandbox', 'allow-scripts')
    f.setAttribute('aria-hidden', 'true')
    f.tabIndex = -1
    f.width = '320'
    f.height = '200'
    // Kept inside the viewport (but invisible) so the browser never parks it.
    Object.assign(f.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '320px',
      height: '200px',
      border: '0',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-1'
    })
    document.body.appendChild(f)
    this.iframe = f
    window.addEventListener('message', this.onMessage)
  }

  private onMessage = (e: MessageEvent): void => {
    if (e.source !== this.iframe.contentWindow) return
    const m = e.data
    if (!m || m.__lumora !== 1) return
    if (m.type === 'frame') {
      const px = new Uint8ClampedArray(m.data as ArrayBuffer)
      this.lastFrame = px
      for (const l of this.frameListeners) l(px)
    } else if (m.type === 'ready') {
      for (const l of this.readyListeners) l()
    } else if (m.type === 'log' || m.type === 'error') {
      const log: EffectLog = {
        level: m.type === 'error' ? 'error' : m.level,
        message: m.type === 'error' && m.line ? `${m.message} (line ${m.line})` : String(m.message),
        time: Date.now()
      }
      for (const l of this.logListeners) l(log)
    }
  }

  async load(html: string, props: Record<string, PropValue>): Promise<void> {
    const token = ++this.loadToken
    const doc = composeEffectDocument(html, props, this.opts)
    const url = await window.lumora.stage(this.slot, doc)
    if (token !== this.loadToken) return
    this.iframe.src = url
  }

  clear(): void {
    this.loadToken++
    this.iframe.src = 'about:blank'
    this.lastFrame = null
  }

  post(message: Record<string, unknown>, transfer: Transferable[] = []): void {
    this.iframe.contentWindow?.postMessage({ ...message, __lumora: 1 }, '*', transfer)
  }

  setProp(name: string, value: PropValue): void {
    this.post({ type: 'prop', name, value })
  }

  onFrame(l: FrameListener): () => void {
    this.frameListeners.add(l)
    return () => this.frameListeners.delete(l)
  }

  onLog(l: (log: EffectLog) => void): () => void {
    this.logListeners.add(l)
    return () => this.logListeners.delete(l)
  }

  onReady(l: () => void): () => void {
    this.readyListeners.add(l)
    return () => this.readyListeners.delete(l)
  }

  destroy(): void {
    window.removeEventListener('message', this.onMessage)
    this.iframe.remove()
    this.frameListeners.clear()
    this.logListeners.clear()
    this.readyListeners.clear()
  }
}
