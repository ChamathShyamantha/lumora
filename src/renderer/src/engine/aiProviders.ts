import type { AiConnection } from '../types'

export interface AiProvider {
  id: string
  name: string
  kind: AiConnection['kind']
  baseUrl: string
  /** false = local servers that work without a key */
  needsKey: boolean
  /** Users may edit the URL (custom / local servers). */
  editableUrl: boolean
  keyUrl?: string
  defaultModel?: string
  hint?: string
}

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: '',
    needsKey: true,
    editableUrl: false,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    defaultModel: 'claude-opus-5-5',
    hint: 'Claude Opus 5.5 gives the best designs; Sonnet 5.5 and Haiku 5.5 are faster and cheaper.'
  },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, editableUrl: false, keyUrl: 'https://platform.openai.com/api-keys' },
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    needsKey: true,
    editableUrl: false,
    keyUrl: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (hundreds of models)',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    editableUrl: false,
    keyUrl: 'https://openrouter.ai/keys',
    hint: 'One key for models from many companies, including free ones.'
  },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, editableUrl: false, keyUrl: 'https://console.groq.com/keys' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true, editableUrl: false, keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'mistral', name: 'Mistral', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', needsKey: true, editableUrl: false, keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'xai', name: 'xAI (Grok)', kind: 'openai', baseUrl: 'https://api.x.ai/v1', needsKey: true, editableUrl: false, keyUrl: 'https://console.x.ai' },
  {
    id: 'ollama',
    name: 'Ollama (local, free)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    editableUrl: true,
    hint: 'Runs on your PC, no key or internet needed. Install from ollama.com and pull a model first. Bigger models design better effects.'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (local, free)',
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    editableUrl: true,
    hint: 'Start LM Studio’s local server with a model loaded.'
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    kind: 'openai',
    baseUrl: 'http://localhost:8000/v1',
    needsKey: false,
    editableUrl: true,
    hint: 'Any server that speaks the OpenAI chat-completions API. The key is optional.'
  }
]

export const ANTHROPIC_MODELS = [
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5 — best results' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — faster, cheaper' },
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — quickest, cheapest' }
]

export function providerById(id: string): AiProvider {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0]
}

export interface ProviderConfig {
  baseUrl: string
  model: string
}

export function connectionFor(providerId: string, configs: Record<string, ProviderConfig>): AiConnection {
  const p = providerById(providerId)
  const cfg = configs[p.id]
  return {
    provider: p.id,
    kind: p.kind,
    baseUrl: p.editableUrl ? (cfg?.baseUrl || p.baseUrl) : p.baseUrl,
    model: cfg?.model || p.defaultModel || ''
  }
}
