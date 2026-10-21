// Verifies Lumora built-in effects: metadata contract + script execution in a mock canvas environment.
import fs from 'node:fs';
import path from 'node:path';

// Usage: node scripts/verify-effects.mjs [dir] [file.html ...]
const DIR = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..', 'resources', 'effects');
const only = process.argv.slice(3);
const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.html') && (!only.length || only.includes(f))).sort();

// Library filter taxonomy (keep in sync with docs/EFFECT_API.md and the Library view).
export const CATEGORIES = ['Classic', 'Nature', 'Space', 'Retro & Gaming', 'Abstract', 'Party & Music', 'Cozy & Seasonal', 'Wellness & Focus', 'Screen Sync'];
export const ENERGY = ['calm', 'lively', 'intense'];
export const PALETTES = ['warm', 'cool', 'rainbow', 'neon', 'pastel', 'natural', 'mono'];

const attrs = (tag) => {
  const o = {};
  for (const m of tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = m[2];
  return o;
};

const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)|hsla?\([^)]*\)|black|white|transparent)$/i;

function makeEnv(issues) {
  const stats = { draws: 0 };
  const checkNums = (name, args) => {
    for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) issues.add(`${name}() called with non-finite arg ${a}`);
  };
  const checkColor = (name, v) => {
    if (typeof v === 'string' && !COLOR_RE.test(v.trim())) issues.add(`${name} set to invalid color "${v}"`);
  };
  function gradient(kind, args) {
    checkNums(kind, args);
    if (kind === 'createRadialGradient' && (args[2] < 0 || args[5] < 0)) throw new Error(`IndexSizeError: negative radius in createRadialGradient(${args.join(',')})`);
    return {
      addColorStop(off, col) {
        if (typeof off !== 'number' || !Number.isFinite(off) || off < 0 || off > 1) throw new Error(`IndexSizeError: addColorStop offset ${off}`);
        if (typeof col !== 'string' || !COLOR_RE.test(col.trim())) throw new Error(`SyntaxError: addColorStop color "${col}"`);
      }
    };
  }
  function imageData(w, h) {
    if (typeof w === 'object' && w) { h = w.height; w = w.width; }
    if (!(w > 0 && h > 0)) throw new Error(`IndexSizeError: imageData ${w}x${h}`);
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }
  function makeCtx() {
    const store = {
      createLinearGradient: (...a) => gradient('createLinearGradient', a),
      createRadialGradient: (...a) => gradient('createRadialGradient', a),
      createConicGradient: (...a) => gradient('createConicGradient', a),
      getImageData: (x, y, w, h) => imageData(w, h),
      createImageData: (w, h) => imageData(w, h),
      measureText: () => ({ width: 10 }),
      putImageData: (img, ...a) => { checkNums('putImageData', a); if (!img || !img.data) throw new TypeError('putImageData: not ImageData'); stats.draws++; },
      drawImage: (img, ...a) => { checkNums('drawImage', a); if (!img) throw new TypeError('drawImage: no image'); stats.draws++; },
      fillRect: (...a) => { checkNums('fillRect', a); stats.draws++; },
      strokeRect: (...a) => { checkNums('strokeRect', a); stats.draws++; },
      fill: () => { stats.draws++; },
      stroke: () => { stats.draws++; },
      moveTo: (...a) => checkNums('moveTo', a),
      lineTo: (...a) => checkNums('lineTo', a),
      arc: (...a) => { checkNums('arc', a); if (a[2] < 0) throw new Error('IndexSizeError: negative arc radius'); }
    };
    return new Proxy(store, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p === 'symbol') return undefined;
        return () => undefined;
      },
      set(t, p, v) {
        if (p === 'fillStyle' || p === 'strokeStyle' || p === 'shadowColor') checkColor(p, v);
        if (p === 'globalAlpha' || p === 'lineWidth') checkNums(p, [v]);
        t[p] = v;
        return true;
      }
    });
  }
  function makeCanvas(w = 300, h = 150) {
    let ctx = null;
    return { width: w, height: h, style: {}, getContext: (k) => (k === '2d' ? (ctx = ctx || makeCtx()) : null) };
  }
  const main = makeCanvas(320, 200);
  const document = {
    getElementById: () => main,
    querySelector: () => main,
    querySelectorAll: () => [main],
    getElementsByTagName: () => [main],
    createElement: (t) => (String(t).toLowerCase() === 'canvas' ? makeCanvas() : { style: {} }),
    body: { appendChild() {} }
  };
  let queue = [];
  const raf = (cb) => { if (typeof cb !== 'function') throw new TypeError('rAF needs a function'); queue.push(cb); return queue.length; };
  return { document, raf, stats, takeQueue: () => { const q = queue; queue = []; return q; } };
}

function makeEngine(active) {
  const N = 560;
  const audio = { active, level: 0, bass: 0, mid: 0, treble: 0, freq: new Float32Array(64), beat: false, beatCount: 0 };
  const zone = { active, width: 28, height: 20, hue: new Int16Array(N), saturation: new Int8Array(N), lightness: new Int8Array(N), imagedata: new Uint8ClampedArray(160 * 100 * 4) };
  const engine = { audio, zone, time: 0, width: 320, height: 200, fps: 60 };
  engine.tick = (frame) => {
    engine.time = frame / 60;
    if (!active) return;
    for (let i = 0; i < 64; i++) audio.freq[i] = Math.random();
    audio.level = Math.random(); audio.bass = Math.random(); audio.mid = Math.random(); audio.treble = Math.random();
    audio.beat = frame % 20 === 0;
    if (audio.beat) audio.beatCount++;
    for (let i = 0; i < N; i++) { zone.hue[i] = (Math.random() * 360) | 0; zone.saturation[i] = (Math.random() * 101) | 0; zone.lightness[i] = (Math.random() * 101) | 0; }
    for (let i = 0; i < zone.imagedata.length; i++) zone.imagedata[i] = (Math.random() * 256) | 0;
  };
  return engine;
}

function convert(p) {
  const d = p.default;
  switch (p.type) {
    case 'number': case 'hue': return Number(d);
    case 'boolean': return d === '1' || d === 'true';
    default: return d;
  }
}

let failures = 0;
const summary = [];
for (const file of files) {
  const errors = [];
  const issues = new Set();
  const html = fs.readFileSync(path.join(DIR, file), 'utf8');
  const title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1];
  if (!title) errors.push('missing <title>');
  else if (title.trim() + '.html' !== file) errors.push(`title "${title}" does not match file name`);
  if (!/<meta\s+description="[^"]+"/i.test(html)) errors.push('missing <meta description>');
  if (!/<meta\s+publisher="Lumora"/i.test(html)) errors.push('missing <meta publisher="Lumora">');
  if (!/<meta\s+tags="[^"]+"/i.test(html)) errors.push('missing <meta tags>');
  const metaVal = (k) => (new RegExp('<meta\\s+' + k + '="([^"]*)"', 'i').exec(html) || [])[1];
  if (!CATEGORIES.includes(metaVal('category'))) errors.push(`<meta category> must be one of: ${CATEGORIES.join(' | ')} (got "${metaVal('category')}")`);
  if (!ENERGY.includes(metaVal('energy'))) errors.push(`<meta energy> must be one of: ${ENERGY.join(' | ')} (got "${metaVal('energy')}")`);
  if (!PALETTES.includes(metaVal('palette'))) errors.push(`<meta palette> must be one of: ${PALETTES.join(' | ')} (got "${metaVal('palette')}")`);
  const canvases = html.match(/<canvas[^>]*>/gi) || [];
  if (canvases.length !== 1 || !/width="320"/.test(canvases[0]) || !/height="200"/.test(canvases[0])) errors.push('expected exactly one 320x200 canvas');
  if (/<script[^>]+src=/i.test(html) || /<link[^>]+href=/i.test(html)) errors.push('external resource referenced');
  if (/https?:\/\//i.test(html)) errors.push('URL found in file');
  if (/VortxEngine/i.test(html)) errors.push('references VortxEngine');

  const props = [];
  for (const m of html.matchAll(/<meta\s+property=[^>]*>/gi)) {
    const a = attrs(m[0]);
    props.push(a);
    for (const k of ['property', 'label', 'type', 'default']) if (a[k] === undefined) errors.push(`property ${a.property || '?'} missing ${k}`);
    if (!['number', 'hue', 'color', 'boolean', 'combobox', 'text'].includes(a.type)) errors.push(`property ${a.property} has unknown type ${a.type}`);
    if (a.type === 'combobox') {
      const vals = (a.values || '').split(',');
      if (!a.values) errors.push(`combobox ${a.property} missing values`);
      else if (!vals.includes(a.default)) errors.push(`combobox ${a.property} default "${a.default}" not in values`);
    }
    if (a.type === 'number' || a.type === 'hue') {
      const mn = Number(a.min ?? 0), mx = Number(a.max ?? 360), dv = Number(a.default);
      if (a.type === 'number' && (a.min === undefined || a.max === undefined)) errors.push(`number ${a.property} missing min/max`);
      if (!Number.isFinite(dv) || dv < mn || dv > mx) errors.push(`number ${a.property} default ${a.default} outside ${mn}..${mx}`);
    }
    if (a.type === 'color' && !/^#[0-9a-f]{6}$/i.test(a.default || '')) errors.push(`color ${a.property} default not #rrggbb`);
    if (a.type === 'boolean' && !['0', '1', 'true', 'false'].includes(a.default)) errors.push(`boolean ${a.property} bad default`);
  }
  if (props.length < 2 || props.length > 6) errors.push(`has ${props.length} controls (expected 2-6)`);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`expected 1 inline script, found ${scripts.length}`);
  const src = scripts[0] ? scripts[0][1] : '';
  const handlerNames = props.map((p) => `on${p.property}Changed`);
  for (const h of handlerNames) if (!new RegExp(`function\\s+${h}\\s*\\(`).test(src)) issues.add(`no ${h}() handler`);
  const usesAudio = /engine\.audio/.test(src), usesZone = /engine\.zone/.test(src);

  const setProps = (vals) => { for (const p of props) globalThis[p.property] = vals[p.property]; };
  const defaults = Object.fromEntries(props.map((p) => [p.property, convert(p)]));

  function runPass(active, label, opts = {}) {
    const env = makeEnv(issues);
    const engine = makeEngine(active);
    setProps(defaults);
    let handlers;
    try {
      const body = src + `\n;return {${handlerNames.map((h) => `${JSON.stringify(h)}: typeof ${h} === 'function' ? ${h} : undefined`).join(',')}};`;
      const fn = new Function('document', 'window', 'engine', 'requestAnimationFrame', 'console', body);
      handlers = fn(env.document, globalThis, engine, env.raf, { log() {}, warn() {}, error() {} });
    } catch (e) { errors.push(`[${label}] script load: ${e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e}`); return; }
    let ts = 1000, frame = 0;
    const runFrames = (n, step = 1000 / 60) => {
      for (let i = 0; i < n; i++) {
        engine.tick(frame++);
        ts += step;
        const q = env.takeQueue();
        if (q.length === 0) throw new Error('requestAnimationFrame loop stopped');
        for (const cb of q) cb(ts);
      }
    };
    try {
      runFrames(3); // frames before handlers run (robustness)
      for (const h of handlerNames) if (handlers[h]) handlers[h]();
      const before = env.stats.draws;
      runFrames(120);
      if (env.stats.draws === before) issues.add(`[${label}] nothing drawn in 120 frames`);
      if (opts.vary) {
        for (const p of props) {
          const tests = [];
          if (p.type === 'combobox') tests.push(...p.values.split(','));
          else if (p.type === 'boolean') tests.push(!defaults[p.property]);
          else if (p.type === 'number' || p.type === 'hue') tests.push(Number(p.min ?? 0), Number(p.max ?? 360));
          else if (p.type === 'color') tests.push('#000000', '#ffffff', '#12ab9f');
          for (const v of tests) {
            globalThis[p.property] = v;
            if (handlers[`on${p.property}Changed`]) handlers[`on${p.property}Changed`]();
            runFrames(15);
          }
          globalThis[p.property] = defaults[p.property];
          if (handlers[`on${p.property}Changed`]) handlers[`on${p.property}Changed`]();
        }
        runFrames(5, 0); // zero dt
        runFrames(3, 5000); // huge dt jump
        runFrames(10, 1000 / 144); // high refresh
      }
    } catch (e) {
      errors.push(`[${label}] runtime: ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
    }
  }

  runPass(true, 'active', { vary: true });
  runPass(false, 'inactive', { vary: true });
  for (const p of props) delete globalThis[p.property];

  const ok = errors.length === 0;
  if (!ok) failures++;
  summary.push(`${ok ? 'PASS' : 'FAIL'}  ${file}  (${props.length} props${usesAudio ? ', audio' : ''}${usesZone ? ', zone' : ''})`);
  for (const e of errors) summary.push(`   ERROR: ${e}`);
  for (const w of issues) summary.push(`   WARN: ${w}`);
}
console.log(summary.join('\n'));
console.log(`\n${files.length - failures}/${files.length} effects passed`);
process.exit(failures ? 1 : 0);
