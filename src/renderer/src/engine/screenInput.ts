export interface ZoneFrame {
  active: boolean
  hue: Int16Array
  saturation: Int8Array
  lightness: Int8Array
  imagedata: Uint8ClampedArray
}

const ZW = 28
const ZH = 20
const IW = 160
const IH = 100

/** Captures the selected screen and reduces it to a 28x20 HSL zone grid + 160x100 image. */
export class ScreenInput {
  private stream?: MediaStream
  private video?: HTMLVideoElement
  private canvas = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D
  error: string | null = null

  constructor() {
    this.canvas.width = IW
    this.canvas.height = IH
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  }

  get running(): boolean {
    return !!this.video
  }

  async start(): Promise<boolean> {
    if (this.video) return true
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, width: 640, height: 400 },
        audio: false
      })
      const video = document.createElement('video')
      video.muted = true
      video.srcObject = stream
      await video.play()
      this.stream = stream
      this.video = video
      this.error = null
      return true
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.stop()
      return false
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = undefined
    if (this.video) this.video.srcObject = null
    this.video = undefined
  }

  read(): ZoneFrame | null {
    const v = this.video
    if (!v || v.readyState < 2) return null
    this.ctx.drawImage(v, 0, 0, IW, IH)
    const img = this.ctx.getImageData(0, 0, IW, IH)
    const px = img.data
    const hue = new Int16Array(ZW * ZH)
    const saturation = new Int8Array(ZW * ZH)
    const lightness = new Int8Array(ZW * ZH)
    for (let zy = 0; zy < ZH; zy++) {
      const y0 = Math.floor((zy * IH) / ZH)
      const y1 = Math.floor(((zy + 1) * IH) / ZH)
      for (let zx = 0; zx < ZW; zx++) {
        const x0 = Math.floor((zx * IW) / ZW)
        const x1 = Math.floor(((zx + 1) * IW) / ZW)
        let r = 0
        let g = 0
        let b = 0
        let n = 0
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * IW + x) * 4
            r += px[i]
            g += px[i + 1]
            b += px[i + 2]
            n++
          }
        }
        const [h, s, l] = rgbToHsl(r / n, g / n, b / n)
        const z = zy * ZW + zx
        hue[z] = h
        saturation[z] = s
        lightness[z] = l
      }
    }
    return { active: true, hue, saturation, lightness, imagedata: px }
  }
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}
