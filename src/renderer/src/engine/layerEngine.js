// Lumora layer engine — renders a stack of procedural layers described by the
// JSON in <script id="lumora-layers">. Embedded verbatim in effects made with
// the visual editor, so saved files run on their own.
(function () {
  'use strict';
  var W = 320, H = 200;
  var canvas = document.querySelector('canvas');
  var ctx = canvas.getContext('2d');
  var cfgEl = document.getElementById('lumora-layers');
  var config = cfgEl ? JSON.parse(cfgEl.textContent || '{}') : { layers: [] };
  var states = {};
  var layerCanvases = {};
  var lastT = 0;
  var beatEnv = 0;
  var lfoPhase = 0;

  var BLEND = {
    normal: 'source-over', add: 'lighter', screen: 'screen', multiply: 'multiply',
    overlay: 'overlay', difference: 'difference', lighten: 'lighten', darken: 'darken',
    dodge: 'color-dodge', hue: 'hue', color: 'color'
  };

  window.addEventListener('lumora-message', function (e) {
    var m = e.detail;
    if (m && m.type === 'layers' && m.config) config = m.config;
  });

  // ---------- helpers ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexToRgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hsl(h, s, l, a) { return 'hsla(' + (((h % 360) + 360) % 360) + ',' + s + '%,' + l + '%,' + (a === undefined ? 1 : a) + ')'; }

  var lutCache = {};
  // 256-entry RGB lookup through a list of colours; cyclic wraps back to the first colour.
  function lut(colors, cyclic) {
    var key = colors.join(',') + (cyclic ? 'c' : '');
    if (lutCache[key]) return lutCache[key];
    var stops = colors.map(hexToRgb);
    if (cyclic) stops = stops.concat([stops[0]]);
    var out = new Uint8Array(256 * 3);
    for (var i = 0; i < 256; i++) {
      var f = (i / 255) * (stops.length - 1);
      var k = Math.min(stops.length - 2, Math.floor(f));
      var u = f - k;
      for (var c = 0; c < 3; c++) out[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * u;
    }
    lutCache[key] = out;
    return out;
  }
  function lutColor(table, t, a) {
    var i = (Math.floor((((t % 1) + 1) % 1) * 255)) * 3;
    return 'rgba(' + table[i] + ',' + table[i + 1] + ',' + table[i + 2] + ',' + (a === undefined ? 1 : a) + ')';
  }
  // Gradient spanning the whole canvas along an angle (degrees).
  function axisGradient(c, angle) {
    var r = angle * Math.PI / 180, dx = Math.cos(r), dy = Math.sin(r);
    var L = Math.abs(160 * dx) + Math.abs(100 * dy);
    return c.createLinearGradient(160 - dx * L, 100 - dy * L, 160 + dx * L, 100 + dy * L);
  }
  function shapedGradient(c, style, angle) {
    if (style === 'radial') return c.createRadialGradient(160, 100, 0, 160, 100, 190);
    if (style === 'conic') return c.createConicGradient(angle * Math.PI / 180, 160, 100);
    return axisGradient(c, angle);
  }

  // Small fast value-noise for clouds/aurora.
  var perm = new Uint8Array(512);
  (function () {
    var p = []; for (var i = 0; i < 256; i++) p.push(i);
    var seed = 1337;
    for (var j = 255; j > 0; j--) { seed = (seed * 16807) % 2147483647; var k = seed % (j + 1); var t = p[j]; p[j] = p[k]; p[k] = t; }
    for (var n = 0; n < 512; n++) perm[n] = p[n & 255];
  })();
  function fade(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    xi &= 255; yi &= 255;
    var a = perm[perm[xi] + yi] / 255, b = perm[perm[xi + 1] + yi] / 255;
    var c = perm[perm[xi] + yi + 1] / 255, d = perm[perm[xi + 1] + yi + 1] / 255;
    var u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) { return (vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15); }

  // Low-resolution pixel buffer, upscaled smoothly onto the layer.
  var LW = 80, LH = 50;
  var lowCanvas = document.createElement('canvas'); lowCanvas.width = LW; lowCanvas.height = LH;
  var lowCtx = lowCanvas.getContext('2d');
  var lowImg = lowCtx.createImageData(LW, LH);
  function blitLow(c) {
    lowCtx.putImageData(lowImg, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(lowCanvas, 0, 0, W, H);
  }

  // ---------- modulation ----------
  function sources(audio) {
    var on = audio && audio.active;
    return {
      bass: on ? audio.bass : 0, mid: on ? audio.mid : 0, treble: on ? audio.treble : 0,
      level: on ? audio.level : 0, beat: beatEnv, lfo: 0.5 + 0.5 * Math.sin(lfoPhase)
    };
  }
  // Apply modulators: value moves by amount% of the parameter's range.
  function modulated(layer, src) {
    var p = {}, k;
    for (k in layer.params) p[k] = layer.params[k];
    p.opacity = layer.opacity === undefined ? 100 : layer.opacity;
    var mods = layer.mods || [];
    for (var i = 0; i < mods.length; i++) {
      var m = mods[i];
      if (typeof p[m.param] !== 'number') continue;
      var range = m.range || 100;
      p[m.param] += (m.amount / 100) * (src[m.source] || 0) * range;
    }
    return p;
  }

  // ---------- layer renderers ----------
  var R = {};

  R.solid = function (c, p) { c.fillStyle = p.color; c.fillRect(0, 0, W, H); };

  R.gradient = function (c, p, s, dt) {
    s.phase = (s.phase || 0) + dt * p.speed / 100;
    var table = lut(p.colors && p.colors.length ? p.colors : ['#ff0080', '#00c0ff'], true);
    var g = shapedGradient(c, p.style, p.angle);
    var reps = clamp(p.scale, 10, 400) / 100, n = 24;
    for (var i = 0; i <= n; i++) g.addColorStop(i / n, lutColor(table, (i / n) * reps - s.phase));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };

  R.rainbow = function (c, p, s, dt) {
    s.phase = (s.phase || 0) + dt * p.speed / 100;
    var g = shapedGradient(c, p.style, p.angle);
    var reps = clamp(p.scale, 10, 400) / 100, n = 30;
    for (var i = 0; i <= n; i++) g.addColorStop(i / n, hsl(((i / n) * reps - s.phase) * 360, clamp(p.saturation, 0, 100), 50));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };

  R.wave = function (c, p, s, dt) {
    s.phase = (s.phase || 0) + dt * p.speed / 50;
    var a = hexToRgb(p.color), b = hexToRgb(p.color2);
    var g = p.style === 'radial' ? c.createRadialGradient(160, 100, 0, 160, 100, 190) : axisGradient(c, p.angle);
    var f = clamp(p.frequency, 0.5, 30), n = Math.min(160, Math.ceil(f * 8));
    var sharp = 1 + clamp(p.sharpness, 0, 100) / 12;
    for (var i = 0; i <= n; i++) {
      var u = i / n, v = Math.pow(0.5 + 0.5 * Math.sin((u * f - s.phase) * Math.PI * 2), sharp);
      g.addColorStop(u, 'rgb(' + Math.round(b[0] + (a[0] - b[0]) * v) + ',' + Math.round(b[1] + (a[1] - b[1]) * v) + ',' + Math.round(b[2] + (a[2] - b[2]) * v) + ')');
    }
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };

  R.stripes = function (c, p, s, dt) {
    s.phase = (s.phase || 0) + dt * p.speed / 100;
    var a = hexToRgb(p.color), b = hexToRgb(p.color2), count = Math.max(1, Math.round(p.count));
    var soft = Math.max(0.02, clamp(p.softness, 0, 100) / 100);
    var g = axisGradient(c, p.angle), n = Math.min(480, count * 16);
    for (var i = 0; i <= n; i++) {
      var u = i / n, f = ((u * count - s.phase) % 1 + 1) % 1;
      var tri = Math.abs(f - 0.5) * 2;
      var v = clamp((tri - 0.5) / soft + 0.5, 0, 1);
      g.addColorStop(u, 'rgb(' + Math.round(b[0] + (a[0] - b[0]) * v) + ',' + Math.round(b[1] + (a[1] - b[1]) * v) + ',' + Math.round(b[2] + (a[2] - b[2]) * v) + ')');
    }
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };

  R.plasma = function (c, p, s, dt) {
    s.phase = (s.phase || 0) + dt * p.speed / 40;
    var table = lut(p.colors && p.colors.length ? p.colors : ['#ff0080', '#7000ff', '#00e0ff'], true);
    var sc = clamp(p.scale, 10, 300) / 100, t = s.phase, d = lowImg.data, i = 0;
    for (var y = 0; y < LH; y++) {
      for (var x = 0; x < LW; x++) {
        var u = x / LW * 6 / sc, v = y / LH * 4 / sc;
        var val = Math.sin(u + t) + Math.sin(v * 1.3 - t * 0.8) + Math.sin((u + v) * 0.7 + t * 0.6) + Math.sin(Math.sqrt(u * u + v * v) * 1.2 - t);
        var k = (Math.floor(((val / 8 + 0.5) % 1 + 1) % 1 * 255)) * 3;
        d[i++] = table[k]; d[i++] = table[k + 1]; d[i++] = table[k + 2]; d[i++] = 255;
      }
    }
    blitLow(c);
  };

  R.noise = function (c, p, s, dt) {
    s.phase = (s.phase || 0) + dt * p.speed / 60;
    var a = hexToRgb(p.color), b = hexToRgb(p.color2), sc = 3 / (clamp(p.scale, 10, 300) / 100);
    var contrast = 0.6 + clamp(p.contrast, 0, 100) / 40, d = lowImg.data, i = 0, t = s.phase;
    for (var y = 0; y < LH; y++) {
      for (var x = 0; x < LW; x++) {
        var n = fbm(x / LW * sc + t, y / LH * sc * 0.7 - t * 0.4);
        n = clamp((n - 0.5) * contrast + 0.5, 0, 1);
        var e = n * n;
        d[i++] = e * (a[0] * n + b[0] * (1 - n)); d[i++] = e * (a[1] * n + b[1] * (1 - n));
        d[i++] = e * (a[2] * n + b[2] * (1 - n)); d[i++] = 255;
      }
    }
    blitLow(c);
  };

  var FIRE = {
    fire: ['#000000', '#5a0000', '#d01000', '#ff7a00', '#ffd23c', '#ffffff'],
    ice: ['#000000', '#001a4d', '#0060ff', '#40c8ff', '#c8f4ff', '#ffffff'],
    toxic: ['#000000', '#033000', '#0aa000', '#7aff00', '#e6ff8c', '#ffffff'],
    purple: ['#000000', '#2a0040', '#8000c0', '#ff30ff', '#ffb0ff', '#ffffff']
  };
  R.fire = function (c, p, s, dt) {
    var w = LW, h = LH;
    if (!s.heat) s.heat = new Float32Array(w * h);
    var heat = s.heat, table = lut(FIRE[p.palette] || FIRE.fire, false);
    var steps = Math.max(1, Math.round(dt * (20 + p.speed * 0.6)));
    var intensity = clamp(p.intensity, 0, 150) / 100;
    for (var st = 0; st < steps; st++) {
      for (var x = 0; x < w; x++) heat[(h - 1) * w + x] = Math.random() < 0.6 ? intensity * (0.7 + Math.random() * 0.5) : 0;
      for (var y = 0; y < h - 1; y++) {
        for (var x2 = 0; x2 < w; x2++) {
          var below = (y + 1) * w;
          var v = (heat[below + ((x2 - 1 + w) % w)] + heat[below + x2] + heat[below + ((x2 + 1) % w)] + heat[Math.min(h - 1, y + 2) * w + x2]) / 4.04;
          heat[y * w + x2] = Math.max(0, v - 0.006);
        }
      }
    }
    var d = lowImg.data;
    for (var i = 0; i < w * h; i++) {
      var k = Math.floor(clamp(heat[i], 0, 1) * 255) * 3;
      d[i * 4] = table[k]; d[i * 4 + 1] = table[k + 1]; d[i * 4 + 2] = table[k + 2]; d[i * 4 + 3] = 255;
    }
    blitLow(c);
  };

  R.sparkles = function (c, p, s, dt) {
    c.clearRect(0, 0, W, H);
    if (!s.list) s.list = [];
    var want = clamp(p.density, 0, 100) * 0.6, base = hexToRgb(p.color);
    s.acc = (s.acc || 0) + dt * want * (0.4 + p.speed / 60);
    while (s.acc > 1) { s.acc -= 1; s.list.push({ x: Math.random() * W, y: Math.random() * H, life: 0, hue: Math.random() * 360 }); }
    var rate = 0.3 + p.speed / 50, size = clamp(p.size, 1, 60);
    s.list = s.list.filter(function (q) { return q.life < 1; });
    for (var i = 0; i < s.list.length; i++) {
      var q = s.list[i]; q.life += dt * rate;
      var a = Math.sin(clamp(q.life, 0, 1) * Math.PI);
      var g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, size);
      var col = p.rainbow ? hsl(q.hue, 100, 60, a) : rgba(base, a);
      g.addColorStop(0, col); g.addColorStop(1, p.rainbow ? hsl(q.hue, 100, 50, 0) : rgba(base, 0));
      c.fillStyle = g; c.fillRect(q.x - size, q.y - size, size * 2, size * 2);
    }
  };

  R.ripples = function (c, p, s, dt) {
    c.clearRect(0, 0, W, H);
    if (!s.list) s.list = [];
    s.acc = (s.acc || 0) + dt * clamp(p.rate, 0, 100) / 25;
    if (s.beat) { s.acc += 1; s.beat = false; }
    while (s.acc > 1) {
      s.acc -= 1;
      var center = p.origin === 'center';
      s.list.push({ x: center ? 160 : Math.random() * W, y: center ? 100 : Math.random() * H, r: 0, hue: Math.random() * 360 });
    }
    var base = hexToRgb(p.color), sp = 40 + p.speed * 2.5, th = clamp(p.thickness, 1, 60);
    s.list = s.list.filter(function (q) { return q.r < 260; });
    for (var i = 0; i < s.list.length; i++) {
      var q = s.list[i]; q.r += dt * sp;
      var a = clamp(1 - q.r / 260, 0, 1);
      c.lineWidth = th;
      c.strokeStyle = p.rainbow ? hsl(q.hue, 100, 60, a) : rgba(base, a);
      c.beginPath(); c.arc(q.x, q.y, q.r, 0, Math.PI * 2); c.stroke();
    }
  };

  R.orbs = function (c, p, s, dt) {
    c.clearRect(0, 0, W, H);
    var count = Math.max(1, Math.round(p.count));
    if (!s.list) s.list = [];
    while (s.list.length < count) s.list.push({ x: Math.random() * W, y: Math.random() * H, a: Math.random() * Math.PI * 2, hue: Math.random() * 360 });
    s.list.length = count;
    var sp = p.speed * 1.6, size = clamp(p.size, 5, 200), base = hexToRgb(p.color);
    for (var i = 0; i < count; i++) {
      var o = s.list[i];
      o.x += Math.cos(o.a) * sp * dt; o.y += Math.sin(o.a) * sp * dt;
      if (o.x < 0 || o.x > W) { o.a = Math.PI - o.a; o.x = clamp(o.x, 0, W); }
      if (o.y < 0 || o.y > H) { o.a = -o.a; o.y = clamp(o.y, 0, H); }
      o.hue += dt * 20;
      var g = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, size);
      g.addColorStop(0, p.rainbow ? hsl(o.hue, 100, 60) : rgba(base, 1));
      g.addColorStop(1, p.rainbow ? hsl(o.hue, 100, 50, 0) : rgba(base, 0));
      c.fillStyle = g; c.fillRect(o.x - size, o.y - size, size * 2, size * 2);
    }
  };

  R.scanner = function (c, p, s, dt) {
    c.clearRect(0, 0, W, H);
    s.phase = (s.phase || 0) + dt * p.speed / 60;
    var pos = 0.5 - 0.5 * Math.cos(s.phase * Math.PI);
    var width = clamp(p.width, 1, 100) / 200, base = hexToRgb(p.color);
    var g = axisGradient(c, p.angle);
    g.addColorStop(0, rgba(base, 0));
    g.addColorStop(clamp(pos - width, 0, 1), rgba(base, 0));
    g.addColorStop(clamp(pos, 0, 1), rgba(base, 1));
    g.addColorStop(clamp(pos + width, 0, 1), rgba(base, 0));
    g.addColorStop(1, rgba(base, 0));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  };

  R.spectrum = function (c, p, s, dt, audio) {
    c.clearRect(0, 0, W, H);
    var bars = 32, bw = W / bars, gain = clamp(p.gain, 10, 300) / 100;
    if (!s.vals) s.vals = new Float32Array(bars);
    var on = audio && audio.active;
    s.t = (s.t || 0) + dt;
    var a = hexToRgb(p.color), b = hexToRgb(p.color2);
    for (var i = 0; i < bars; i++) {
      var target = on ? (audio.freq[i * 2] + audio.freq[i * 2 + 1]) / 2 * gain : 0.15 + 0.12 * Math.sin(s.t * 2 + i * 0.5);
      s.vals[i] += (clamp(target, 0, 1) - s.vals[i]) * Math.min(1, dt * 18);
      var v = s.vals[i], u = i / (bars - 1);
      c.fillStyle = 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * u) + ',' + Math.round(a[1] + (b[1] - a[1]) * u) + ',' + Math.round(a[2] + (b[2] - a[2]) * u) + ')';
      var h = v * H;
      if (p.style === 'center') c.fillRect(i * bw + 1, (H - h) / 2, bw - 2, h);
      else if (p.style === 'mirror') {
        var half = bars / 2, idx = i < half ? half - 1 - i : i - half, vv = s.vals[idx];
        c.fillRect(i * bw + 1, H - vv * H, bw - 2, vv * H);
      } else c.fillRect(i * bw + 1, H - h, bw - 2, h);
    }
  };

  R.pulse = function (c, p) {
    var lvl = clamp(p.level, 0, 100) / 100, base = hexToRgb(p.color);
    c.clearRect(0, 0, W, H);
    if (p.shape === 'circle') {
      var r = 20 + lvl * 200;
      var g = c.createRadialGradient(160, 100, 0, 160, 100, r);
      g.addColorStop(0, rgba(base, 1)); g.addColorStop(1, rgba(base, 0));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    } else {
      c.fillStyle = rgba(base, lvl); c.fillRect(0, 0, W, H);
    }
  };

  // ---------- main loop ----------
  function getCanvas(id) {
    var lc = layerCanvases[id];
    if (!lc) { lc = document.createElement('canvas'); lc.width = W; lc.height = H; layerCanvases[id] = lc; }
    return lc;
  }

  function frame(now) {
    var t = now / 1000, dt = lastT ? Math.min(0.1, t - lastT) : 1 / 60;
    lastT = t;
    var speed = (config.speed === undefined ? 100 : config.speed) / 100;
    dt *= speed;
    var audio = typeof engine !== 'undefined' ? engine.audio : null;
    if (audio && audio.beat) beatEnv = 1;
    beatEnv *= Math.exp(-dt * 5);
    lfoPhase += dt * Math.PI;
    var src = sources(audio);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = config.background || '#000000';
    ctx.fillRect(0, 0, W, H);

    var layers = config.layers || [];
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      if (!layer.visible || !R[layer.type]) continue;
      var st = states[layer.id] || (states[layer.id] = {});
      if (audio && audio.beat) st.beat = true;
      var p = modulated(layer, src);
      var lc = getCanvas(layer.id), lctx = lc.getContext('2d');
      lctx.globalCompositeOperation = 'source-over';
      lctx.globalAlpha = 1;
      try { R[layer.type](lctx, p, st, dt, audio); } catch (err) { /* keep other layers running */ }
      ctx.globalAlpha = clamp(p.opacity, 0, 100) / 100;
      ctx.globalCompositeOperation = BLEND[layer.blend] || 'source-over';
      ctx.drawImage(lc, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
