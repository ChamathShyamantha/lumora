import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EffectFile, HardwareDevice, OpenRgbStatus, RunningConflict } from './types'
import { parseEffectMeta, type EffectMeta, type PropValue } from './engine/effectMeta'
import { DEFAULT_GAME_REACTIONS, type GameReactionsConfig } from './engine/gameReactions'
import { OFF_SCENE_ID, newSceneId, type AutomationRule, type Scene } from './engine/scenes'
import { createVirtual, defaultPlacement, fromHardware, type DeviceDef, type LayoutDevice, type Placement } from './engine/devices'

export type View = 'library' | 'create' | 'code' | 'games' | 'scenes' | 'layout' | 'devices' | 'settings'

export interface LibraryEffect extends EffectFile {
  meta: EffectMeta
}

interface PersistedState {
  activeEffectId: string | null
  propValues: Record<string, Record<string, PropValue>>
  favorites: string[]
  brightness: number
  /** Per-effect brightness (0-100), keyed by effect id; missing = 100 */
  effectBrightness: Record<string, number>
  /** Device key → effect id for devices that run their own effect */
  deviceEffects: Record<string, string>
  scenes: Scene[]
  rules: AutomationRule[]
  automationEnabled: boolean
  virtualDevices: DeviceDef[]
  placements: Record<string, Placement>
  openrgbHost: string
  openrgbPort: number
  openrgbAutoConnect: boolean
  audioSensitivity: number
  screenId: string | null
  closeToTray: boolean
  lightsOffOnSleep: boolean
  safeMode: boolean
  lightsOffOnLock: boolean
  lightsOffOnExit: boolean
  fps: number
  aiProvider: string
  gameReactions: GameReactionsConfig
  ignoredConflicts: string[]
  extraConflictProcesses: string[]
  aiConfigs: Record<string, { baseUrl: string; model: string }>
}

interface RuntimeState {
  view: View
  effects: LibraryEffect[]
  hardware: HardwareDevice[]
  openrgbStatus: OpenRgbStatus
  /** Other RGB software currently running (from the main process watcher) */
  conflicts: RunningConflict[]
  /** Lights switched off by the user or a "Lights off" scene */
  lightsOff: boolean
  /** Which automation rule is in control, and the user's setup from before it took over */
  automation: { ruleId: string | null; snapshot: { effectId: string | null; brightness: number; deviceEffects: Record<string, string>; lightsOff: boolean } | null }
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
  setEffectBrightness(effectId: string, v: number): void
  setDeviceEffect(deviceKey: string, effectId: string | null): void
  addVirtual(presetId: string): void
  removeDevice(key: string): void
  updatePlacement(key: string, patch: Partial<Placement>): void
  setHardware(status: OpenRgbStatus, devices: HardwareDevice[]): void
  setSettings(patch: Partial<PersistedState>): void
  setEditing(editing: RuntimeState['editing']): void
  setConflicts(conflicts: RunningConflict[]): void
  setLightsOff(off: boolean): void
  saveScene(name: string): string
  updateScene(id: string, patch: Partial<Scene>): void
  deleteScene(id: string): void
  applyScene(id: string): void
  setRules(rules: AutomationRule[]): void
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
      effectBrightness: {},
      deviceEffects: {},
      scenes: [],
      rules: [],
      automationEnabled: true,
      lightsOff: false,
      automation: { ruleId: null, snapshot: null },
      virtualDevices: initialVirtual,
      placements: { [initialVirtual[0].key]: { ...defaultPlacement(initialVirtual[0], 0), x: 30, y: 40, scale: 17.3 } },
      openrgbHost: '127.0.0.1',
      openrgbPort: 6742,
      openrgbAutoConnect: true,
      audioSensitivity: 1,
      screenId: null,
      closeToTray: true,
      lightsOffOnSleep: true,
      safeMode: false,
      lightsOffOnLock: false,
      lightsOffOnExit: true,
      fps: 60,
      aiProvider: 'anthropic',
      gameReactions: DEFAULT_GAME_REACTIONS,
      ignoredConflicts: [],
      extraConflictProcesses: [],
      conflicts: [],
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
      setDeviceEffect: (deviceKey, effectId) =>
        set((s) => {
          const next = { ...s.deviceEffects }
          if (effectId) next[deviceKey] = effectId
          else delete next[deviceKey]
          return { deviceEffects: next }
        }),
      setEffectBrightness: (effectId, v) =>
        set((s) => {
          const next = { ...s.effectBrightness }
          if (v >= 100) delete next[effectId]
          else next[effectId] = v
          return { effectBrightness: next }
        }),
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
      setEditing: (editing) => set({ editing }),
      setConflicts: (conflicts) => set({ conflicts }),
      setLightsOff: (lightsOff) => set({ lightsOff }),
      saveScene: (name) => {
        const s = get()
        const id = newSceneId()
        const scene: Scene = {
          id,
          name: name.trim() || 'Scene ' + (s.scenes.length + 1),
          effectId: s.activeEffectId ?? 'builtin/Rainbow Wave.html',
          brightness: s.brightness,
          deviceEffects: { ...s.deviceEffects }
        }
        set({ scenes: [...s.scenes, scene] })
        return id
      },
      updateScene: (id, patch) => set((s) => ({ scenes: s.scenes.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteScene: (id) =>
        set((s) => ({ scenes: s.scenes.filter((x) => x.id !== id), rules: s.rules.filter((r) => r.sceneId !== id) })),
      applyScene: (id) =>
        set((s) => {
          if (id === OFF_SCENE_ID) return { lightsOff: true }
          const scene = s.scenes.find((x) => x.id === id)
          if (!scene) return {}
          return { activeEffectId: scene.effectId, brightness: scene.brightness, deviceEffects: { ...scene.deviceEffects }, lightsOff: false }
        }),
      setRules: (rules) => set({ rules })
    }),
    {
      name: 'lumora-state',
      version: 1,
      partialize: (s): PersistedState => ({
        activeEffectId: s.activeEffectId,
        propValues: s.propValues,
        favorites: s.favorites,
        brightness: s.brightness,
        effectBrightness: s.effectBrightness,
        deviceEffects: s.deviceEffects,
        scenes: s.scenes,
        rules: s.rules,
        automationEnabled: s.automationEnabled,
        virtualDevices: s.virtualDevices,
        placements: s.placements,
        openrgbHost: s.openrgbHost,
        openrgbPort: s.openrgbPort,
        openrgbAutoConnect: s.openrgbAutoConnect,
        audioSensitivity: s.audioSensitivity,
        screenId: s.screenId,
        closeToTray: s.closeToTray,
        lightsOffOnSleep: s.lightsOffOnSleep,
        safeMode: s.safeMode,
        lightsOffOnLock: s.lightsOffOnLock,
        lightsOffOnExit: s.lightsOffOnExit,
        fps: s.fps,
        aiProvider: s.aiProvider,
        gameReactions: s.gameReactions,
        ignoredConflicts: s.ignoredConflicts,
        extraConflictProcesses: s.extraConflictProcesses,
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
