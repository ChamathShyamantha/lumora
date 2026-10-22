import { Client } from 'openrgb-sdk'
import type { RGBColor } from 'openrgb-sdk/dist/device'

/** Serializable device description sent to the renderer. */
export interface HardwareDevice {
  id: number
  name: string
  vendor: string
  type: number
  ledCount: number
  ledNames: string[]
  zones: {
    name: string
    type: number // 0 single, 1 linear, 2 matrix
    ledsCount: number
    matrix?: { width: number; height: number; keys: (number | null)[][] }
  }[]
}

export type OpenRgbStatus =
  | { state: 'disconnected'; error?: string }
  | { state: 'connecting' }
  | { state: 'connected'; host: string; port: number }

type Listener = (status: OpenRgbStatus, devices: HardwareDevice[]) => void

export class OpenRgbManager {
  private client?: Client
  private devices: HardwareDevice[] = []
  private status: OpenRgbStatus = { state: 'disconnected' }
  private listener?: Listener
  private colorBuffers = new Map<number, RGBColor[]>()

  onChange(listener: Listener): void {
    this.listener = listener
  }

  snapshot(): { status: OpenRgbStatus; devices: HardwareDevice[] } {
    return { status: this.status, devices: this.devices }
  }

  private emit(): void {
    this.listener?.(this.status, this.devices)
  }

  async connect(host: string, port: number): Promise<void> {
    this.disconnect()
    this.status = { state: 'connecting' }
    this.emit()
    const client = new Client('Lumora', port, host)
    try {
      await client.connect(3000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.status = {
        state: 'disconnected',
        error:
          message === 'timeout' || /ECONNREFUSED/.test(message)
            ? `Could not reach OpenRGB at ${host}:${port}. Start OpenRGB and enable its SDK Server.`
            : message
      }
      this.emit()
      return
    }
    this.client = client
    client.on('disconnect', () => {
      if (this.client !== client) return
      this.client = undefined
      this.devices = []
      this.status = { state: 'disconnected', error: 'OpenRGB closed the connection.' }
      this.emit()
    })
    client.on('error', () => {
      /* surfaced via disconnect */
    })
    client.on('deviceListUpdated', () => {
      if (this.client === client) void this.refresh()
    })
    this.status = { state: 'connected', host, port }
    await this.refresh()
  }

  async refresh(): Promise<void> {
    const client = this.client
    if (!client) return
    try {
      // Read devices one by one so a single device the SDK can't parse
      // doesn't hide all the others.
      const raw: Awaited<ReturnType<Client['getControllerData']>>[] = []
      const count = await client.getControllerCount()
      for (let i = 0; i < count; i++) {
        try {
          raw.push(await client.getControllerData(i))
        } catch (err) {
          console.warn(`OpenRGB: skipped device ${i}:`, err)
        }
      }
      this.devices = raw.map((d) => ({
        id: d.deviceId,
        name: d.name,
        vendor: d.vendor ?? '',
        type: d.type,
        ledCount: d.leds.length,
        ledNames: d.leds.map((l) => l.name),
        zones: d.zones.map((z) => ({
          name: z.name,
          type: z.type,
          ledsCount: z.ledsCount,
          matrix: z.matrix
            ? {
                width: z.matrix.width,
                height: z.matrix.height,
                keys: z.matrix.keys.map((row) => row.map((k) => (k === undefined ? null : k)))
              }
            : undefined
        }))
      }))
      this.colorBuffers.clear()
      // Switch every device to direct (per-LED) control.
      for (const d of raw) {
        try {
          client.setCustomMode(d.deviceId)
        } catch {
          /* some devices have no direct mode */
        }
      }
    } catch (err) {
      this.devices = []
      this.status = { state: 'disconnected', error: err instanceof Error ? err.message : String(err) }
    }
    this.emit()
  }

  /** `rgb` is packed [r,g,b, r,g,b, ...] for every LED of the device. */
  update(deviceId: number, rgb: Uint8Array): void {
    if (this.paused) return
    const client = this.client
    if (!client?.isConnected) return
    const device = this.devices.find((d) => d.id === deviceId)
    if (!device) return
    let buf = this.colorBuffers.get(deviceId)
    if (!buf || buf.length !== device.ledCount) {
      buf = Array.from({ length: device.ledCount }, () => ({ red: 0, green: 0, blue: 0 }))
      this.colorBuffers.set(deviceId, buf)
    }
    const n = Math.min(device.ledCount, Math.floor(rgb.length / 3))
    for (let i = 0; i < n; i++) {
      const c = buf[i]
      c.red = rgb[i * 3]
      c.green = rgb[i * 3 + 1]
      c.blue = rgb[i * 3 + 2]
    }
    try {
      client.updateLeds(deviceId, buf)
    } catch {
      /* transient socket errors surface via disconnect */
    }
  }

  /** While paused (PC asleep/locked), frames from the renderer are ignored. */
  private paused = false

  setPaused(paused: boolean): void {
    this.paused = paused
  }

  /** Turn every LED off right now (sleep, lock, quit). */
  blackout(): void {
    const client = this.client
    if (!client?.isConnected) return
    for (const d of this.devices) {
      try {
        client.updateLeds(
          d.id,
          Array.from({ length: d.ledCount }, () => ({ red: 0, green: 0, blue: 0 }))
        )
      } catch {
        /* ignore */
      }
    }
  }

  disconnect(): void {
    const client = this.client
    this.client = undefined
    this.devices = []
    if (client) {
      try {
        client.disconnect()
      } catch {
        /* ignore */
      }
    }
    this.status = { state: 'disconnected' }
  }
}
