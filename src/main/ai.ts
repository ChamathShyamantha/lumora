import Anthropic from '@anthropic-ai/sdk'
import { app, safeStorage } from 'electron'
import { promises as fs, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * LLM integration for the AI effect designer. Two backends:
 *  - "anthropic": Claude via the official SDK
 *  - "openai": any OpenAI-compatible chat API (OpenAI, Gemini, OpenRouter,
 *    Groq, DeepSeek, Mistral, xAI, Ollama, LM Studio, custom servers)
 *
 * API keys live only in the main process, encrypted with the OS keychain
 * (DPAPI on Windows) via safeStorage, one per provider. The renderer only
 * learns whether a key is set and its last 4 characters.
 */

export interface AiConnection {
  /** Preset id, e.g. "anthropic", "openai", "ollama", "custom" — keys are stored per id. */
  provider: string
  kind: 'anthropic' | 'openai'
  baseUrl: string
  model: string
}

export interface AiStatus {
  /** provider id → last 4 chars of its stored key */
  keys: Record<string, string>
  encrypted: boolean
}

export interface AiRequest {
  id: string
  conn: AiConnection
  system: string
  prompt: string
  schema: Record<string, unknown>
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  maxTokens: number
}

type ErrorCode = 'no_key' | 'auth' | 'rate_limit' | 'refusal' | 'truncated' | 'network' | 'cancelled' | 'bad_output' | 'api' | 'no_model'

export type AiResult =
  | { ok: true; data: unknown; model: string; usage: { input: number; output: number } }
  | { ok: false; error: string; code: ErrorCode }

const fail = (code: ErrorCode, error: string): Extract<AiResult, { ok: false }> => ({ ok: false, code, error })

// ---------- key storage ----------

const keysPath = (): string => join(app.getPath('userData'), 'ai-keys.json')
let keyCache: Record<string, string> | null = null
const inflight = new Map<string, AbortController>()

async function loadKeys(): Promise<Record<string, string>> {
  if (keyCache) return keyCache
  keyCache = {}
  try {
    if (existsSync(keysPath())) {
      const stored = JSON.parse(await fs.readFile(keysPath(), 'utf8')) as Record<string, string>
      for (const [id, b64] of Object.entries(stored)) {
        const buf = Buffer.from(b64, 'base64')
        keyCache[id] = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
      }
    }
  } catch {
    keyCache = {}
  }
  return keyCache
}

async function saveKeys(keys: Record<string, string>): Promise<void> {
  const out: Record<string, string> = {}
  for (const [id, key] of Object.entries(keys)) {
    out[id] = (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(key) : Buffer.from(key, 'utf8')).toString('base64')
  }
  await fs.writeFile(keysPath(), JSON.stringify(out))
  keyCache = keys
}

export async function aiStatus(): Promise<AiStatus> {
  const keys = await loadKeys()
  return {
    keys: Object.fromEntries(Object.entries(keys).map(([id, k]) => [id, k.slice(-4)])),
    encrypted: safeStorage.isEncryptionAvailable()
  }
}

/** Validate the key by listing models, then store it encrypted for this provider. */
export async function setKey(conn: AiConnection, key: string): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const trimmed = key.trim()
  if (!trimmed) return { ok: false, error: 'Enter an API key.' }
  const res = await listModelsWith(conn, trimmed)
  if (!res.ok) return res.code === 'auth' ? { ok: false, error: 'The provider rejected this key. Copy it again from your provider’s dashboard.' } : res
  await saveKeys({ ...(await loadKeys()), [conn.provider]: trimmed })
  return { ok: true, models: res.models }
}

export async function clearKey(provider: string): Promise<void> {
  const keys = { ...(await loadKeys()) }
  delete keys[provider]
  await saveKeys(keys)
}

export function cancel(id: string): void {
  inflight.get(id)?.abort()
}

// ---------- shared helpers ----------

function normalizeBase(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function validBaseUrl(url: string): boolean {
  try {
    // http is allowed for local/LAN servers (Ollama, LM Studio); the UI warns for remote http.
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function httpError(status: number, detail: string): Extract<AiResult, { ok: false }> {
  if (status === 401 || status === 403) return fail('auth', 'The provider rejected the API key (or it can’t use this model).')
  if (status === 404) return fail('no_model', `Not found — check the model name and server URL. ${detail}`.trim())
  if (status === 429) return fail('rate_limit', 'Rate limited or out of credit — wait a moment or check your plan.')
  return fail('api', `Provider error ${status}: ${detail}`.slice(0, 400))
}

/** Pull a JSON object out of model text (tolerates ```json fences and chatter). */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced ? fenced[1] : text
  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1))
    throw new Error('no json')
  }
}

// ---------- model listing ----------

export async function listModels(conn: AiConnection): Promise<{ ok: true; models: string[] } | Extract<AiResult, { ok: false }>> {
  const key = (await loadKeys())[conn.provider]
  return listModelsWith(conn, key)
}

async function listModelsWith(
  conn: AiConnection,
  key: string | undefined
): Promise<{ ok: true; models: string[] } | Extract<AiResult, { ok: false }>> {
  try {
    if (conn.kind === 'anthropic') {
      if (!key) return fail('no_key', 'Add your Anthropic API key first.')
      const client = new Anthropic({ apiKey: key, maxRetries: 1 })
      const models: string[] = []
      for await (const m of client.models.list()) models.push(m.id)
      return { ok: true, models }
    }
    const base = normalizeBase(conn.baseUrl)
    if (!validBaseUrl(base)) return fail('api', 'Enter a valid server URL (https://… or http://localhost:…).')
    const res = await fetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} })
    if (!res.ok) return httpError(res.status, (await res.text().catch(() => '')).slice(0, 200))
    const json = (await res.json()) as { data?: { id?: string; name?: string }[]; models?: { id?: string; name?: string }[] }
    const list = json.data ?? json.models ?? []
    return { ok: true, models: list.map((m) => String(m.id ?? m.name ?? '')).filter(Boolean).sort() }
  } catch (err) {
    return describeError(err)
  }
}

function describeError(err: unknown): Extract<AiResult, { ok: false }> {
  if (err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === 'AbortError')) return fail('cancelled', 'Cancelled.')
  if (err instanceof Anthropic.AuthenticationError) return fail('auth', 'The API key was rejected. Check it in Settings → AI.')
  if (err instanceof Anthropic.PermissionDeniedError) return fail('auth', 'This API key is not allowed to use that model.')
  if (err instanceof Anthropic.NotFoundError) return fail('no_model', 'That model was not found. Pick another in Settings → AI.')
  if (err instanceof Anthropic.RateLimitError) return fail('rate_limit', 'Rate limited — wait a moment and try again.')
  if (err instanceof Anthropic.BadRequestError) return fail('api', `Request rejected: ${err.message}`)
  if (err instanceof Anthropic.APIConnectionError) return fail('network', 'Could not reach Anthropic. Check your internet connection.')
  if (err instanceof Anthropic.APIError) return fail('api', `Anthropic API error ${err.status ?? ''}: ${err.message}`)
  if (err instanceof TypeError) return fail('network', 'Could not reach the AI server. Check the URL, your connection, or that the local server is running.')
  return fail('api', err instanceof Error ? err.message : String(err))
}

// ---------- generation ----------

export async function generate(req: AiRequest): Promise<AiResult> {
  const key = (await loadKeys())[req.conn.provider]
  if (!req.conn.model.trim()) return fail('no_model', 'Choose a model in Settings → AI first.')
  const controller = new AbortController()
  inflight.set(req.id, controller)
  try {
    if (req.conn.kind === 'anthropic') {
      if (!key) return fail('no_key', 'Add your Anthropic API key in Settings → AI first.')
      return await generateAnthropic(req, key, controller.signal)
    }
    return await generateOpenAiCompatible(req, key, controller.signal)
  } catch (err) {
    return describeError(err)
  } finally {
    inflight.delete(req.id)
  }
}

async function generateAnthropic(req: AiRequest, apiKey: string, signal: AbortSignal): Promise<AiResult> {
  const client = new Anthropic({ apiKey })
  const model = req.conn.model
  // Server-side refusal fallback ("default" routes a policy decline to Anthropic's
  // recommended model) — offered for Opus/Sonnet/Fable; Haiku has none.
  const fallback = /haiku/i.test(model) ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: req.maxTokens,
      ...fallback,
      cache_control: { type: 'ephemeral' },
      system: req.system,
      messages: [{ role: 'user', content: req.prompt }],
      output_config: { effort: req.effort, format: { type: 'json_schema', schema: req.schema } }
    },
    { signal }
  )
  const message = await stream.finalMessage()
  if (message.stop_reason === 'refusal') return fail('refusal', 'The model declined this request. Try describing the effect differently.')
  if (message.stop_reason === 'max_tokens') return fail('truncated', 'The design was too large and got cut off. Try a simpler description.')
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  try {
    return { ok: true, data: JSON.parse(text), model: message.model, usage: { input: message.usage.input_tokens, output: message.usage.output_tokens } }
  } catch {
    return fail('bad_output', 'The model returned something unexpected. Please try again.')
  }
}

type ResponseFormat = 'json_schema' | 'json_object' | 'none'

/**
 * OpenAI-compatible chat completions. Structured-output support varies between
 * providers, so try strict JSON schema first, then JSON mode, then plain text —
 * the schema is always also described in the prompt.
 */
async function generateOpenAiCompatible(req: AiRequest, key: string | undefined, signal: AbortSignal): Promise<AiResult> {
  const base = normalizeBase(req.conn.baseUrl)
  if (!validBaseUrl(base)) return fail('api', 'The AI server URL in Settings → AI is not valid.')
  const system = `${req.system}\n\nRespond with ONLY a JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(req.schema)}`

  let last: AiResult = fail('api', 'No response.')
  for (const format of ['json_schema', 'json_object', 'none'] as ResponseFormat[]) {
    const body: Record<string, unknown> = {
      model: req.conn.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: req.prompt }
      ]
    }
    if (format === 'json_schema') body.response_format = { type: 'json_schema', json_schema: { name: 'lumora_effect', strict: true, schema: req.schema } }
    if (format === 'json_object') body.response_format = { type: 'json_object' }

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      last = httpError(res.status, detail)
      // 400/422 usually means "this provider doesn't support that response_format" — try the next mode.
      if ((res.status === 400 || res.status === 422) && format !== 'none') continue
      return last
    }
    const json = (await res.json()) as {
      model?: string
      choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = json.choices?.[0]
    if (choice?.message?.refusal) return fail('refusal', 'The model declined this request. Try describing the effect differently.')
    if (choice?.finish_reason === 'length') return fail('truncated', 'The model ran out of output room. Try a simpler description or a model with a larger output limit.')
    const text = choice?.message?.content ?? ''
    try {
      return {
        ok: true,
        data: extractJson(text),
        model: json.model ?? req.conn.model,
        usage: { input: json.usage?.prompt_tokens ?? 0, output: json.usage?.completion_tokens ?? 0 }
      }
    } catch {
      last = fail('bad_output', 'The model did not return valid JSON. Try again, or pick a stronger model.')
      if (format === 'none') return last
    }
  }
  return last
}
