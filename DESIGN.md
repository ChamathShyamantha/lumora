# Lumora — DESIGN.md

Lumora's interface is a quiet, monochrome instrument panel. **Colour belongs to
the lights**: saturated colour appears only in effect previews, LED renders and
the live accent sampled from the playing effect — never as decoration on the
chrome. (Based on Raycast's dark desktop system, with Linear's restraint.)

## Tokens

### Surfaces (elevation = surface ladder, never shadows)
| Token | Value | Use |
|---|---|---|
| `--canvas` | `#07080a` | App background, sidebar, top bar |
| `--surface` | `#0d0d0d` | Cards, panels, side panels |
| `--surface-2` | `#121314` | Inputs, tertiary buttons, active nav/tab, hovered rows |
| `--surface-3` | `#18191b` | Pressed/selected, keycaps, chips |
| `--hairline` | `#222426` | Every 1px card/divider border |
| `--hairline-strong` | `rgba(255,255,255,0.14)` | Focused inputs, selected cards |

### Text
| Token | Value | Use |
|---|---|---|
| `--ink` | `#f4f4f6` | Titles, primary text, active states |
| `--body` | `#cdcdcd` | Body copy |
| `--mute` | `#9c9c9d` | Labels, secondary text |
| `--ash` | `#6a6b6c` | Captions, disabled |

### Action & accent
| Token | Value | Use |
|---|---|---|
| `--primary` | `#ffffff` (text `#000`) | The one primary action per view |
| `--live` | sampled from the current effect | Brand mark glow, "playing" dot, active-nav tick. Nothing else. |

### Semantic (status only — dots, short messages)
`--ok #59d499` · `--warn #ffc533` · `--bad #ff6161` · `--info #57c1ff`, each with a
15% "soft" fill for badges.

## Typography
- **Inter Variable** with `font-feature-settings: "calt","kern","liga","ss03"`
  (single-storey `g`). **JetBrains Mono** for code, process names and hex values.
- Base 13.5px; desktop density.

| Role | Size / weight / tracking |
|---|---|
| Page title | 22px / 600 / -0.4px |
| Section title | 15px / 600 / -0.1px |
| Body | 13.5px / 400 / 0 |
| Label | 13px / 500 |
| Caption | 12px / 400 / +0.1px |
| Eyebrow | 11px / 600 / +0.6px, uppercase |

## Shape & spacing
- Radius: 6 (chips/rows) · 8 (buttons, inputs) · 10 (cards) · 14 (preview frames) · full (pills, toggles).
- Spacing on a 4px base: 4 · 8 · 12 · 16 · 20 · 24 · 32.
- Card padding 16–20px. No drop shadows anywhere except modals.

## Components
- **Button primary**: white, black text, 32px, radius 8. One per view.
- **Button secondary**: `--surface-2` + hairline. **Ghost**: transparent, `--mute` text → `--ink` on hover.
- **Inputs**: `--surface-2`, hairline, focus → `--hairline-strong` (no coloured ring).
- **Toggle**: off `--surface-3`; on white track with black knob.
- **Slider**: thin `--surface-3` track, white fill, white thumb.
- **Chips / filters**: transparent pill, `--mute` text; active = `--surface-2` + `--ink`.
- **Badges**: 11px, `--surface-2`, `--mute`; status variants use soft semantic fills.
- **Icons**: 1.8px stroke line icons. No emoji in the UI.

## Don't
- No gradients on chrome, no purple, no glow on buttons.
- No coloured text for emphasis — use weight or `--ink`.
- No emoji glyphs (⚠ ♪ ★ ✓) — use the icon set.
