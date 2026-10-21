# Lumora Effect API

A Lumora effect is **one self-contained `.html` file**. It draws on a canvas;
Lumora samples that canvas at each LED's position on your device layout and
sends the colours to your hardware (or the virtual preview).

The format follows the same conventions used by other canvas-based RGB apps
(meta-tag properties, global variables, `on<prop>Changed` callbacks), so
many existing community effects run unchanged.

## Minimal effect

```html
<head>
  <title>Pulse</title>
  <meta description="A soft breathing glow." />
  <meta publisher="Your Name" />
  <meta tags="calm,simple" />
  <meta property="color" label="Color" type="color" default="#00c8ff" />
  <meta property="speed" label="Speed" type="number" min="1" max="100" default="40" />
</head>
<body style="margin:0;background:#000">
  <canvas id="c" width="320" height="200"></canvas>
</body>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  let t = 0;
  function update() {
    t += speed / 1000;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 320, 200);
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 320, 200);
    requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
</script>
```

## Canvas

- Draw on a **320 × 200** canvas. The first `<canvas>` in the document is
  captured; other sizes are scaled to 320 × 200.
- `requestAnimationFrame` is driven by Lumora at a steady rate (default 60 fps)
  and keeps running when the window is minimised. Always schedule the next
  frame from your update function.
- Effects run in a sandbox: **no network access, no access to the app**.
  Everything (images, fonts) must be inline (`data:` URIs).

## Metadata

| Tag | Purpose |
|---|---|
| `<title>` | Effect name |
| `<meta description="…">` | One-line description shown in the library |
| `<meta publisher="…">` | Author |
| `<meta tags="a,b">` | Comma-separated free-form tags, used by search (e.g. `fireflies`, `sync`, `summer`) |
| `<meta category="…">` | Library section, one of: `Classic`, `Nature`, `Space`, `Retro & Gaming`, `Abstract`, `Party & Music`, `Cozy & Seasonal`, `Wellness & Focus`, `Screen Sync` |
| `<meta energy="…">` | `calm`, `lively` or `intense` — how much motion/flashing |
| `<meta palette="…">` | Default look: `warm`, `cool`, `rainbow`, `neon`, `pastel`, `natural` or `mono` |

Built-in effects must pass `npm run verify:effects` (checks the metadata and
runs every control combination in a mock canvas).

## Properties (user controls)

```html
<meta property="name" label="Label" type="…" default="…" tooltip="…" />
```

Each property becomes a **global variable** with the same name. When the user
changes it, Lumora updates the variable and calls `on<name>Changed()` if you
defined it. Lumora also calls every `on<name>Changed()` **once at startup**,
after the page has loaded, so you can do all derived setup there.

| `type` | Extra attributes | JS value |
|---|---|---|
| `number` | `min`, `max`, `step` (optional) | `number` |
| `hue` | `min`/`max` default 0–360 | `number` |
| `color` | — | `"#rrggbb"` string |
| `boolean` | `default="0"` or `"1"` (also `true`/`false`) | `true` / `false` |
| `combobox` | `values="A,B,C"` | selected `string` |
| `text` | — | `string` |

## Live inputs — the `engine` object

Lumora only starts audio or screen capture when an effect's source mentions
`engine.audio` or `engine.zone`.

### `engine.audio` (system audio)

| Field | Type | Range |
|---|---|---|
| `active` | boolean | true when audio capture is running |
| `level` | number | 0–1 overall loudness (smoothed) |
| `bass`, `mid`, `treble` | number | 0–1 band energy (smoothed) |
| `freq` | `Float32Array(64)` | 0–1 per band, low → high frequencies (log-spaced) |
| `beat` | boolean | true on the frame a beat was detected |
| `beatCount` | number | increments on every beat |

### `engine.zone` (screen colours)

The screen is divided into a **28 × 20** grid (560 zones, row-major).

| Field | Type | Range |
|---|---|---|
| `active` | boolean | true when screen capture is running |
| `width`, `height` | number | 28, 20 |
| `hue` | `Int16Array(560)` | 0–360 |
| `saturation` | `Int8Array(560)` | 0–100 |
| `lightness` | `Int8Array(560)` | 0–100 |
| `imagedata` | `Uint8ClampedArray(160*100*4)` | RGBA, a 160 × 100 downscaled screen image |

### Other

| Field | Meaning |
|---|---|
| `engine.time` | seconds since the effect started |
| `engine.width`, `engine.height` | 320, 200 |
| `engine.fps` | host frame rate |

## Tips for good-looking effects

- LEDs are sampled from small areas, so **broad shapes and smooth gradients**
  look better than thin lines or text.
- Keep a dark background; pure black means LED off.
- Use HSL colours for easy rainbow/hue animation.
- Make speed frame-rate independent: use `engine.time` or the timestamp passed
  to your `requestAnimationFrame` callback.
