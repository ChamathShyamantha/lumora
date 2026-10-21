# Lumora

A free, open RGB lighting studio for Windows. Every effect is free, and you can
make your own: visually (no code), or in HTML/JS with live preview.

## Run it

```bash
npm install
node node_modules/electron/install.js   # only if npm skipped Electron's download
npm run dev
```

`npm run build` produces the bundled app in `out/`.

## What's inside

| Area | Where |
|---|---|
| Effect runtime (sandboxed iframe, frame clock, `engine` API) | `src/renderer/src/engine/bootstrap.js`, `effectHost.ts` |
| Lighting pipeline (frame → LED sampling → preview + OpenRGB) | `src/renderer/src/engine/lighting.ts`, `devices.ts` |
| System audio + screen capture | `audioInput.ts`, `screenInput.ts`, `src/main/index.ts` |
| Visual creator (layers, blend modes, music links) | `engine/layerEngine.js`, `engine/layers.ts`, `views/Creator.tsx` |
| Code editor | `views/CodeEditor.tsx` |
| OpenRGB bridge | `src/main/openrgb.ts` |
| Built-in effects (18) | `resources/effects/*.html` |
| Effect format docs | `docs/EFFECT_API.md` |

## Real hardware

Lumora drives hardware through [OpenRGB](https://openrgb.org) (free). Start
OpenRGB, enable its **SDK Server**, and Lumora connects automatically on
`127.0.0.1:6742`. Without OpenRGB, effects play on virtual devices you can add
and arrange in **Devices** and **Layout**.

## AI effect designer (optional)

Pick a provider in **Settings → AI effect designer**, then describe an effect
in the Visual Creator ("slow purple waves that pulse with the bass"). The AI
designs it as editable layers (or, in Code mode, writes a full HTML effect).
While editing, the "Ask AI to change it" bar refines the current effect, with
one-click undo. The Code Editor has the same bar for code.

Providers: Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq,
DeepSeek, Mistral, xAI, local **Ollama** / **LM Studio** (free, no key), or any
custom OpenAI-compatible server. Model lists are fetched live from the provider.

- Keys are validated, then stored encrypted per provider with Windows DPAPI
  (`safeStorage`). They never reach the UI process and are only sent to the
  provider they belong to.
- Output uses a JSON schema generated from the layer definitions. For
  OpenAI-compatible servers Lumora tries strict JSON-schema mode, then JSON
  mode, then plain text, so weaker/local models still work. Every value is
  range-checked before use.
- Claude requests opt into Anthropic's server-side refusal fallback
  (`fallbacks: "default"`), except on Haiku, which has none.
- Code: `src/main/ai.ts` (providers, key storage),
  `src/renderer/src/engine/aiDesigner.ts` (prompts, schema, sanitising),
  `src/renderer/src/engine/aiProviders.ts` (provider presets).

### No API key? Use any AI chat

**Code Editor → Use any AI chat** (or "No API key?" in the Visual Creator)
builds a ready-to-paste prompt containing the effect API, your connected
devices and where they sit on the canvas, and the reply format. Paste it into
ChatGPT, Claude, Gemini, Copilot or any chat, describe your idea, then paste the
whole reply back: Lumora extracts the HTML (code fences, chatter and all),
checks it, and loads it into the editor with undo. Tick "include my current
code" to have the chat modify an existing effect.
Code: `src/renderer/src/engine/chatPrompt.ts`, `components/ChatPromptPanel.tsx`.

## Game Reactions

Lights react to in-game events on top of the current effect: **flashbang**
(screen suddenly white → white flash that fades with it), **taking damage**
(red at the screen edges → red pulse) and **custom HUD triggers** (draw a box
on a screenshot of your game; react when that area turns a colour, gets
brighter/darker or changes suddenly). Can run only while listed games are
running (e.g. `VALORANT-Win64-Shipping.exe`).

It uses screen capture only (never game memory, files or injection), so it is
safe with anti-cheat. Use borderless/windowed fullscreen so the game is
visible to screen capture. Code: `src/renderer/src/engine/gameReactions.ts`,
`views/GameReactions.tsx`.

## Scenes & automations

Save the current setup (effect, master brightness, per-device effects) as a
scene, switch from the **Scenes** page or the tray menu, and add rules that
switch automatically: *when `VALORANT-Win64-Shipping.exe` is running → Gaming*,
*between 23:30 and 07:00 → Lights off*. Rules are checked every 5 s top to
bottom; when none applies, your own selection comes back.
Code: `engine/scenes.ts`, `views/Scenes.tsx`, `useAutomation` in `App.tsx`.

## Per-device effects

In **Layout**, pick an effect per device ("Same as main effect" by default). A
device with its own effect shows that whole effect fitted to the device; each
distinct effect runs in its own sandbox.

## Power, accessibility, updates

- Lights off when the PC sleeps / locks / Lumora quits (Settings → Power &
  startup); start with Windows minimised to the tray; a lights on/off button in
  the top bar and tray.
- **Photosensitivity-safe mode** rate-limits every LED (a full black↔white
  swing takes ≥0.2 s), keeping flashing under ~2.5/s for any effect.
- **Auto-updates** via `electron-updater` from the public `lumora-releases`
  GitHub releases (requires `latest.yml` in each release, which `npm run dist`
  produces). Downloads in the background; "Restart to update" installs.

## Conflicting RGB software

Vendor apps (MSI Center/Mystic Light, ASUS Armoury Crate, Gigabyte RGB Fusion,
ASRock Polychrome, Corsair iCUE, Razer Synapse, Logitech G HUB, SteelSeries GG,
NZXT CAM, SignalRGB…) keep sending their own colours to the same hardware.
Lumora checks running process names every 15 seconds, shows a Windows
notification and a warning in the top bar, and lists them under **Devices**
with **Close it** (asks first; Windows-service parts need an administrator
prompt), **Open Task Manager**, **Ignore**, and tips to stop them starting at
login. Add your own program names there too. Nothing is closed automatically.
Code: `src/main/conflicts.ts`, `components/ConflictsCard.tsx`.

## Your effects

Saved to `%APPDATA%\lumora\effects` as plain `.html` files. Lumora reloads them
when they change on disk, so you can also edit them in any editor. Share an
effect by sending the file; import with **Effects → Import**.

## Security

Effects run in a sandboxed frame with a strict content policy: scripts only,
no network, no access to the app or your files. Shared effects can't phone home.

## Testing hook

Setting `LUMORA_DEBUG_PORT` opens a local DevTools port for automated UI tests.
It is off unless that variable is set.
