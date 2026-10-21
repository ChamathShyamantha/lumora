import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EffectFile, HardwareDevice, OpenRgbStatus } from './types'
import { parseEffectMeta, type EffectMeta, type PropValue } from './engine/effectMeta'
import { createVirtual, defaultPlacement, fromHardware, type DeviceDef, type LayoutDevice, type Placement } from './engine/devices'

export type View = 'library' | 'create' | 'code' | 'layout' | 'devices' | 'settings'

export interface LibraryEffect extends EffectFile {
  meta: EffectMeta
}

interface PersistedState {
  activeEffectId: string | null
  propValues: Record<string, Record<string, PropValue>>
  favorites: string[]
  brightness: number
  virtualDevices: DeviceDef[]
  placements: Record<string, Placement>
  openrgbHost: string
  openrgbPort: number
  openrgbAutoConnect: boolean
  audioSensitivity: number
  screenId: string | null
  closeToTray: boolean
  fps: number
  aiProvider: string
  aiConfigs: Record<string, { baseUrl: string; model: string }>
}

interface RuntimeState {
  view: View
  effects: LibraryEffect[]
  hardware: HardwareDevice[]
  openrgbStatus: OpenRgbStatus
  /** Effect being edited (visual editor or code editor). */
  editing: { id?: string; html: string; mode: 'layers' | 'code'; openChat?: boolean } | null
}

interface Actions {
  setView(view: View): void
  setEffects(files: EffectFile[]): void
  setActiveEffect(id: string | null): void
  setProp(effectId: string, name: string, value: PropValue): void
  resetProps(effectId: string): void
  toggleFavorite(id: string): void
  setBrightness(v: number): void
  addVirtual(presetId: string): void
  removeDevice(key: string): void
  updatePlacement(key: string, patch: Partial<Placement>): void
  setHardware(status: OpenRgbStatus, devices: HardwareDevice[]): void
  setSettings(patch: Partial<PersistedState>): void
  setEditing(editing: RuntimeState['editing']): void
}

export type AppState = PersistedState & RuntimeState & Actions

const initialVirtual = [createVirtual('keyboard', [])]

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      activeEffectId: 'builtin/Rainbow Wave.html',
      propValues: {},
      favorites: [],
      brightness: 100,
      virtualDevices: initialVirtual,
      placements: { [initialVirtual[0].key]: { ...defaultPlacement(initialVirtual[0], 0), x: 30, y: 40, scale: 17.3 } },
      openrgbHost: '127.0.0.1',
      openrgbPort: 6742,
      openrgbAutoConnect: true,
      audioSensitivity: 1,
      screenId: null,
      closeToTray: true,
      fps: 60,
      aiProvider: 'anthropic',
      aiConfigs: {},

      view: 'library',
      effects: [],
      hardware: [],
      openrgbStatus: { state: 'disconnected' },
      editing: null,

      setView: (view) => set({ view }),
      setEffects: (files) =>
        set({
          effects: files
            .map((f) => ({ ...f, meta: parseEffectMeta(f.html, f.file.replace(/\.html$/i, '')) }))
            .sort((a, b) => (a.source === b.source ? a.meta.title.localeCompare(b.meta.title) : a.source === 'user' ? -1 : 1))
        }),
      setActiveEffect: (id) => set({ activeEffectId: id }),
      setProp: (effectId, name, value) =>
        set((s) => ({ propValues: { ...s.propValues, [effectId]: { ...s.propValues[effectId], [name]: value } } })),
      resetProps: (effectId) =>
        set((s) => {
          const next = { ...s.propValues }
          delete next[effectId]
          return { propValues: next }
        }),
      toggleFavorite: (id) =>
        set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id] })),
      setBrightness: (brightness) => set({ brightness }),
      addVirtual: (presetId) => {
        const keys = get().virtualDevices.map((d) => d.key)
        const def = createVirtual(presetId, keys)
        set((s) => ({
          virtualDevices: [...s.virtualDevices, def],
          placements: { ...s.placements, [def.key]: defaultPlacement(def, s.virtualDevices.length) }
        }))
      },
      removeDevice: (key) =>
        set((s) => {
          const placements = { ...s.placements }
          delete placements[key]
          return { virtualDevices: s.virtualDevices.filter((d) => d.key !== key), placements }
        }),
      updatePlacement: (key, patch) =>
        set((s) => {
          const device = selectLayout(s).find((d) => d.key === key)
          if (!device) return {}
          const { x, y, scale, rotation, enabled } = device
          return { placements: { ...s.placements, [key]: { x, y, scale, rotation, enabled, ...patch } } }
        }),
      setHardware: (openrgbStatus, hardware) =>
        set((s) => {
          const placements = { ...s.placements }
          hardware.map(fromHardware).forEach((def, i) => {
            if (!placements[def.key]) placements[def.key] = defaultPlacement(def, s.virtualDevices.length + i)
          })
          return { openrgbStatus, hardware, placements }
        }),
      setSettings: (patch) => set(patch),
      setEditing: (editing) => set({ editing })
    }),
    {
      name: 'lumora-state',
      version: 1,
      partialize: (s): PersistedState => ({
        activeEffectId: s.activeEffectId,
        propValues: s.propValues,
        favorites: s.favorites,
        brightness: s.brightness,
        virtualDevices: s.virtualDevices,
        placements: s.placements,
        openrgbHost: s.openrgbHost,
        openrgbPort: s.openrgbPort,
        openrgbAutoConnect: s.openrgbAutoConnect,
        audioSensitivity: s.audioSensitivity,
        screenId: s.screenId,
        closeToTray: s.closeToTray,
        fps: s.fps,
        aiProvider: s.aiProvider,
        aiConfigs: s.aiConfigs
      })
    }
  )
)

/** All devices currently in the layout (virtual + connected hardware) with placements. */
export function selectLayout(s: Pick<AppState, 'virtualDevices' | 'hardware' | 'placements'>): LayoutDevice[] {
  const defs = [...s.virtualDevices, ...s.hardware.map(fromHardware)]
  return defs.map((d, i) => ({ ...d, ...(s.placements[d.key] ?? defaultPlacement(d, i)) }))
}

export function effectValues(effect: LibraryEffect, stored?: Record<string, PropValue>): Record<string, PropValue> {
  const values: Record<string, PropValue> = {}
  for (const p of effect.meta.props) values[p.name] = stored && p.name in stored ? stored[p.name] : p.default
  return values
}
