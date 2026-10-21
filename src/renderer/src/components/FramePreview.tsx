import { useEffect, useRef } from 'react'
import { lighting } from '../engine/lighting'

/** Shows the raw 320x200 effect canvas, live. */
export function FramePreview(props: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    return lighting().onFrame(({ frame }) => {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(frame), 320, 200), 0, 0)
    })
  }, [])
  return (
    <div className={`preview-frame ${props.className ?? ''}`}>
      <canvas ref={ref} width={320} height={200} />
    </div>
  )
}
