/** Scenes (saved lighting setups) and automation rules that switch between them. */

export const OFF_SCENE_ID = 'off'

export interface Scene {
  id: string
  name: string
  /** Effect to play. */
  effectId: string
  /** Master brightness 0..100 */
  brightness: number
  /** Device key → effect id for devices that run their own effect */
  deviceEffects: Record<string, string>
}

export type Trigger = { type: 'app'; exe: string } | { type: 'time'; from: string; to: string }

export interface AutomationRule {
  id: string
  enabled: boolean
  /** A scene id, or OFF_SCENE_ID for "Lights off" */
  sceneId: string
  trigger: Trigger
}

function minutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
}

/** True if `now` falls in [from, to). Ranges may cross midnight (e.g. 23:00–07:00). */
export function timeMatches(from: string, to: string, now: Date): boolean {
  const a = minutes(from)
  const b = minutes(to)
  if (a === null || b === null || a === b) return false
  const t = now.getHours() * 60 + now.getMinutes()
  return a < b ? t >= a && t < b : t >= a || t < b
}

/** The first enabled rule (list order = priority) whose trigger is true right now. */
export function findActiveRule(rules: AutomationRule[], runningApps: Set<string>, now: Date): AutomationRule | null {
  for (const r of rules) {
    if (!r.enabled) continue
    if (r.trigger.type === 'app' && r.trigger.exe.trim() && runningApps.has(r.trigger.exe.trim().toLowerCase())) return r
    if (r.trigger.type === 'time' && timeMatches(r.trigger.from, r.trigger.to, now)) return r
  }
  return null
}

export function describeTrigger(t: Trigger): string {
  return t.type === 'app' ? `${t.exe || 'an app'} is running` : `it's between ${t.from} and ${t.to}`
}

export function newSceneId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
