import { useEffect, useMemo, useRef } from 'react'
import { lighting, type LedFrame } from '../engine/lighting'
import type { LayoutDevice } from '../engine/devices'
import { selectLayout, useApp } from '../store'
import { useShallow } from 'zustand/react/shallow'

interface Props {
  /** Draw the effect canvas underneath the devices (layout mode). */
  showFrame?: boolean
  interactive?: boolean
  selectedKey?: string | null
  onSelect?: (key: string | null) => void
  className?: string
}

const SCALE = 3 // backing-store pixels per canvas unit

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
}

/**
 * Renders every device in the layout with its live LED colours — the
 * "virtual setup". In interactive mode devices can be dragged and scaled.
 */
export function SetupPreview(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const layoutState = useApp(useShallow((s) => ({ virtualDevices: s.virtualDevices, hardware: s.hardware, placements: s.placements })))
  const devices = useMemo(() => selectLayout(layoutState), [layoutState])
  const updatePlacement = useApp((s) => s.updatePlacement)
  const latest = useRef<{ devices: LayoutDevice[]; frame: LedFrame | null; props: Props }>({ devices, frame: null, props })
  latest.current.devices = devices
  latest.current.props = props

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = 320
    frameCanvas.height = 200
    const fctx = frameCanvas.getContext('2d')!

    const draw = (): void => {
      const { devices, frame, props } = latest.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      if (props.showFrame && frame) {
        fctx.putImageData(new ImageData(new Uint8ClampedArray(frame.frame), 320, 200), 0, 0)
        ctx.globalAlpha = 0.35
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(frameCanvas, 0, 0)
        ctx.globalAlpha = 1
      }
      for (const d of devices) {
        const colors = frame?.colors.get(d.key)
        const w = d.gridW * d.scale
        const h = d.gridH * d.scale
        ctx.save()
        ctx.translate(d.x + w / 2, d.y + h / 2)
        ctx.rotate((d.rotation * Math.PI) / 180)
        ctx.translate(-w / 2, -h / 2)
        ctx.globalAlpha = d.enabled ? 1 : 0.35

        // device body
        const pad = d.scale * 0.35
        roundRect(ctx, -pad, -pad, w + pad * 2, h + pad * 2, d.kind === 'fan' ? (w + pad * 2) / 2 : d.scale * 0.6)
        ctx.fillStyle = 'rgba(18,21,30,0.92)'
        ctx.fill()
        ctx.lineWidth = 0.6
        ctx.strokeStyle = props.selectedKey === d.key ? '#8b5cff' : 'rgba(255,255,255,0.08)'
        if (props.selectedKey === d.key) ctx.lineWidth = 1.2
        ctx.stroke()

        // glow pass
        ctx.globalCompositeOperation = 'lighter'
        for (let i = 0; i < d.leds.length; i++) {
          const l = d.leds[i]
          const r = colors ? colors[i * 3] : 0
          const g = colors ? colors[i * 3 + 1] : 0
          const b = colors ? colors[i * 3 + 2] : 0
          if (r + g + b < 12) continue
          const cx = (l.x + l.w / 2) * d.scale
          const cy = (l.y + l.h / 2) * d.scale
          const rad = Math.max(l.w, l.h) * d.scale * 1.1
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
          grad.addColorStop(0, `rgba(${r},${g},${b},0.45)`)
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
          ctx.fillStyle = grad
          ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
        }
        ctx.globalCompositeOperation = 'source-over'

        // LEDs / keys
        for (let i = 0; i < d.leds.length; i++) {
          const l = d.leds[i]
          const r = colors ? colors[i * 3] : 30
          const g = colors ? colors[i * 3 + 1] : 32
          const b = colors ? colors[i * 3 + 2] : 40
          const x = l.x * d.scale
          const y = l.y * d.scale
          const lw = l.w * d.scale
          const lh = l.h * d.scale
          ctx.fillStyle = `rgb(${Math.max(r, 22)},${Math.max(g, 24)},${Math.max(b, 30)})`
          if (d.shape === 'key') {
            roundRect(ctx, x, y, lw, lh, d.scale * 0.18)
            ctx.fill()
            if (l.label && d.scale >= 9) {
              ctx.fillStyle = 'rgba(0,0,0,0.55)'
              ctx.font = `600 ${Math.min(d.scale * 0.34, lw * 0.4)}px Segoe UI, sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(l.label, x + lw / 2, y + lh / 2)
            }
          } else {
            ctx.beginPath()
            ctx.arc(x + lw / 2, y + lh / 2, Math.min(lw, lh) * 0.36, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()

        if (props.interactive && props.selectedKey === d.key) {
          ctx.fillStyle = '#b89cff'
          ctx.font = '600 5px Segoe UI, sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'bottom'
          ctx.fillText(d.name, Math.max(2, d.x), Math.max(6, d.y - 2))
        }
      }
    }

    let pending = false
    const unsub = lighting().onFrame((f) => {
      latest.current.frame = f
      if (!pending) {
        pending = true
        requestAnimationFrame(() => {
          pending = false
          draw()
        })
      }
    })
    draw()
    return unsub
  }, [])

  // ----- interaction -----
  const drag = useRef<{ key: string; dx: number; dy: number } | null>(null)

  const toCanvas = (e: React.PointerEvent | React.WheelEvent): [number, number] => {
    const rect = ref.current!.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * 320, ((e.clientY - rect.top) / rect.height) * 200]
  }

  const hit = (x: number, y: number): LayoutDevice | undefined => {
    const list = latest.current.devices
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i]
      const w = d.gridW * d.scale
      const h = d.gridH * d.scale
      const cx = d.x + w / 2
      const cy = d.y + h / 2
      const rad = (-d.rotation * Math.PI) / 180
      const lx = (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad)
      const ly = (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad)
      if (Math.abs(lx) <= w / 2 + 3 && Math.abs(ly) <= h / 2 + 3) return d
    }
    return undefined
  }

  const handlers = props.interactive
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          const [x, y] = toCanvas(e)
          const d = hit(x, y)
          props.onSelect?.(d?.key ?? null)
          if (d) {
            drag.current = { key: d.key, dx: x - d.x, dy: y - d.y }
            ;(e.target as Element).setPointerCapture(e.pointerId)
          }
        },
        onPointerMove: (e: React.PointerEvent) => {
          if (!drag.current) return
          const [x, y] = toCanvas(e)
          updatePlacement(drag.current.key, { x: Math.round(x - drag.current.dx), y: Math.round(y - drag.current.dy) })
        },
        onPointerUp: () => {
          drag.current = null
        },
        onWheel: (e: React.WheelEvent) => {
          const [x, y] = toCanvas(e)
          const d = hit(x, y)
          if (!d) return
          const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06
          const scale = Math.max(1, Math.min(60, d.scale * factor))
          // keep the device centred while scaling
          const cx = d.x + (d.gridW * d.scale) / 2
          const cy = d.y + (d.gridH * d.scale) / 2
          updatePlacement(d.key, { scale, x: Math.round(cx - (d.gridW * scale) / 2), y: Math.round(cy - (d.gridH * scale) / 2) })
        }
      }
    : {}

  return (
    <canvas
      ref={ref}
      className={`setup-canvas ${props.className ?? ''}`}
      width={320 * SCALE}
      height={200 * SCALE}
      style={{ cursor: props.interactive ? 'grab' : 'default' }}
      {...handlers}
    />
  )
}
