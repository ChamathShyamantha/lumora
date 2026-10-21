import { EffectHost } from './effectHost'
import { synthAudio } from './audioInput'
import type { PropValue } from './effectMeta'

const CACHE_KEY = 'lumora-thumbs-v2'
type Listener = (id: string, url: string) => void

function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

/** Renders each effect for a moment in a hidden sandbox and snapshots it. */
class ThumbnailQueue {
  private host: EffectHost | null = null
  private cache: Record<string, string> = {}
  private queue: { id: string; key: string; html: string; values: Record<string, PropValue>; retried?: boolean }[] = []
  private busy = false
  private listeners = new Set<Listener>()
  private canvas = document.createElement('canvas')

  constructor() {
    this.canvas.width = 160
    this.canvas.height = 100
    try {
      this.cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
    } catch {
      this.cache = {}
    }
  }

  get(id: string, html: string): string | undefined {
    return this.cache[`${id}:${hash(html)}`]
  }

  request(id: string, html: string, values: Record<string, PropValue>): void {
    const key = `${id}:${hash(html)}`
    if (this.cache[key] || this.queue.some((q) => q.key === key)) return
    // The effect file changed: drop its outdated thumbnails.
    for (const k of Object.keys(this.cache)) if (k.startsWith(`${id}:`)) delete this.cache[k]
    this.queue.push({ id, key, html, values })
    void this.pump()
  }

  onReady(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private async pump(): Promise<void> {
    if (this.busy) return
    this.busy = true
    if (!this.host) this.host = new EffectHost('thumb', { fps: 30, captureEvery: 3 })
    const host = this.host
    while (this.queue.length) {
      const job = this.queue.shift()!
      // Only count frames from this document: a late frame from the previous
      // effect can still arrive while the next one is loading.
      let ready = false
      let frames = 0
      let frame: Uint8ClampedArray | null = null
      const offReady = host.onReady(() => {
        ready = true
      })
      const offFrame = host.onFrame((px) => {
        if (!ready) return
        frames++
        frame = px
      })
      await host.load(job.html, job.values)
      const beat = { v: 0 }
      const start = performance.now()
      // Animate ~1.2s (after real frames arrive) with a simulated groove so audio effects show something.
      await new Promise<void>((resolve) => {
        const timer = window.setInterval(() => {
          const a = synthAudio(performance.now() / 1000, beat)
          host.post({ type: 'audio', ...a, freq: Array.from(a.freq) })
          const elapsed = performance.now() - start
          if ((frames >= 12 && elapsed > 1200) || elapsed > 5000) {
            window.clearInterval(timer)
            resolve()
          }
        }, 33)
      })
      offReady()
      offFrame()
      if (!frame && !job.retried) {
        this.queue.push({ ...job, retried: true })
        continue
      }
      if (frame) {
        const full = document.createElement('canvas')
        full.width = 320
        full.height = 200
        full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame), 320, 200), 0, 0)
        const ctx = this.canvas.getContext('2d')!
        ctx.drawImage(full, 0, 0, 160, 100)
        const url = this.canvas.toDataURL('image/webp', 0.8)
        this.cache[job.key] = url
        this.persist()
        for (const l of this.listeners) l(job.id, url)
      }
    }
    host.clear()
    this.busy = false
  }

  private persist(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache))
    } catch {
      /* storage full: thumbnails just regenerate next time */
    }
  }
}

let instance: ThumbnailQueue | null = null
export function thumbnails(): ThumbnailQueue {
  if (!instance) instance = new ThumbnailQueue()
  return instance
}
