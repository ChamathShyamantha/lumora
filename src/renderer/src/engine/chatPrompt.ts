import { CODE_SYSTEM, devicesSummary } from './aiDesigner'
import { parseEffectMeta } from './effectMeta'
import type { LayoutDevice } from './devices'

/**
 * "Bring your own chat": a self-contained prompt the user pastes into any AI
 * chat (ChatGPT, Claude.ai, Gemini, Copilot…), plus extraction of the HTML
 * effect from whatever that chat replies.
 */

export function buildChatPrompt(opts: { devices: LayoutDevice[]; idea: string; currentHtml?: string }): string {
  const rules = CODE_SYSTEM.replace(' Output the complete file in the "html" field.', '')
  const parts = [
    rules,
    devicesSummary(opts.devices) +
      '\nDesign for this setup: think about which parts of the canvas actually have LEDs, and make the effect look good across them.',
    'How to reply: send the COMPLETE effect as one HTML file inside a single ```html code block. ' +
      'No partial snippets or "rest stays the same" placeholders — I will paste your code block straight into the Lumora app. ' +
      'After the code block you may add one or two short sentences about the controls.'
  ]
  if (opts.currentHtml?.trim()) {
    parts.push(`Here is my current effect. Modify it as I describe and return the full updated file:\n\n\`\`\`html\n${opts.currentHtml.trim()}\n\`\`\``)
  }
  const idea = opts.idea.trim()
  parts.push(
    idea
      ? `${opts.currentHtml?.trim() ? 'The change I want' : 'The effect I want'}: ${idea}`
      : `${opts.currentHtml?.trim() ? 'The change I want' : 'The effect I want'} is described in my next message. Reply "Ready — describe your effect" and wait for it.`
  )
  return parts.join('\n\n')
}

export type ExtractResult = { ok: true; html: string; title: string } | { ok: false; error: string }

/** Pull the effect HTML out of a chat reply (code fences, chatter, partial wrapping). */
export function extractHtmlFromReply(reply: string): ExtractResult {
  const text = reply.replace(/\r\n/g, '\n').trim()
  if (!text) return { ok: false, error: 'Paste the AI’s reply first.' }

  const candidates: string[] = []
  const fence = /```[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)```/g
  for (let m = fence.exec(text); m; m = fence.exec(text)) {
    if (/<canvas[\s>]/i.test(m[2])) candidates.push(m[2])
  }
  if (!candidates.length) {
    // No fences: take everything from the first document-ish tag to the last closing tag.
    const start = text.search(/<!doctype|<html|<head|<title|<meta|<body|<canvas/i)
    const endTag = Math.max(text.lastIndexOf('</html>') + 7, text.lastIndexOf('</script>') + 9, text.lastIndexOf('</body>') + 7)
    if (start >= 0 && endTag > start) candidates.push(text.slice(start, endTag))
  }
  // Prefer the longest complete-looking block (chats sometimes show a snippet first).
  const html = candidates.sort((a, b) => b.length - a.length).find((c) => /<script[\s>]/i.test(c))?.trim()

  if (!html) {
    if (!/<canvas/i.test(text)) return { ok: false, error: 'No effect code found. Make sure you copied the whole reply, including the code block.' }
    return { ok: false, error: 'The code is missing its <script>. Ask the chat for the complete file.' }
  }
  if (/rest (of the|stays|remains)|\.\.\.\s*(unchanged|same)|\/\/\s*\.\.\./i.test(html)) {
    return { ok: false, error: 'The reply has placeholders instead of full code. Ask the chat: “send the complete file”.' }
  }
  return { ok: true, html, title: parseEffectMeta(html).title }
}

export const CHAT_LINKS = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
  { name: 'Copilot', url: 'https://copilot.microsoft.com/' }
]
