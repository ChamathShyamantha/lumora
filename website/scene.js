// Lumora hero scene: a full RGB battlestation where every LED samples one shared
// effect field — exactly how the app maps devices onto its effect canvas.
// Exposes window.LumoraScene.init(effects, helpers).
;(function () {
  'use strict'
  var SW = 1000, SH = 600

  function ring(cx, cy, r, n, start) {
    var out = []
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + (start || -Math.PI / 2)
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
    }
    return out
  }
  function line(x0, y0, x1, y1, n) {
    var out = []
    for (var i = 0; i < n; i++) {
      var k = n === 1 ? 0.5 : i / (n - 1)
      out.push({ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k })
    }
    return out
  }
  function perimeter(x0, y0, x1, y1, step) {
    var out = [], w = x1 - x0, h = y1 - y0
    var nx = Math.max(2, Math.round(w / step)), ny = Math.max(2, Math.round(h / step))
    for (var i = 0; i < nx; i++) out.push({ x: x0 + (w * i) / nx, y: y0 })
    for (var j = 0; j < ny; j++) out.push({ x: x1, y: y0 + (h * j) / ny })
    for (var k = 0; k < nx; k++) out.push({ x: x1 - (w * k) / nx, y: y1 })
    for (var m = 0; m < ny; m++) out.push({ x: x0, y: y1 - (h * m) / ny })
    return out
  }

  // ---- keyboard layout (same as the app's virtual laptop keyboard) ----
  var ROWS = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
    [1.25, 1, 1.25, 1.25, 4.25, 1, 1, 1, 1, 1, 1]
  ]
  var KB = { x: 172, y: 488, u: 22.6, rowH: 12.4 }
  var keys = []
  ROWS.forEach(function (row, r) {
    var x = 0
    row.forEach(function (w) {
      keys.push({ x: KB.x + x * KB.u, y: KB.y + r * KB.rowH, w: w * KB.u, h: KB.rowH, cx: KB.x + (x + w / 2) * KB.u, cy: KB.y + (r + 0.5) * KB.rowH })
      x += w
    })
  })

  // ---- devices ----
  var FRONT = [125, 225, 325]
  var devices = [
    { id: 'backlight', name: 'Monitor backlight', info: 'Screen-synced ambience', box: [150, 60, 560, 300], leds: perimeter(168, 74, 542, 286, 22), glowR: 30, hidden: true },
    { id: 'keyboard', name: 'Keyboard', info: 'Per-key RGB', box: [160, 476, 526, 568], leds: keys.map(function (k) { return { x: k.cx, y: k.cy } }), glowR: 9 },
    { id: 'mouse', name: 'Mouse', info: 'Logo, wheel & side strips', box: [592, 484, 634, 542],
      leds: [{ x: 613, y: 497 }, { x: 613, y: 526 }].concat(line(598, 496, 598, 530, 4), line(628, 496, 628, 530, 4)), glowR: 8 },
    { id: 'pad', name: 'RGB mousepad', info: 'Glowing edge', box: [560, 474, 762, 568], leds: perimeter(562, 476, 760, 566, 15), glowR: 9 },
    { id: 'underglow', name: 'Desk underglow', info: 'Addressable LED strip', box: [30, 574, 970, 600], leds: line(36, 590, 964, 590, 52), glowR: 16 },
    { id: 'fans', name: 'Front fans', info: '3 fans · 16 LEDs each', box: [736, 84, 810, 366],
      leds: [].concat(ring(772, FRONT[0], 33, 16), ring(772, FRONT[1], 33, 16), ring(772, FRONT[2], 33, 16)), glowR: 10 },
    { id: 'rear', name: 'Rear exhaust fan', info: '12 LEDs', box: [884, 76, 948, 138], leds: ring(916, 106, 26, 12), glowR: 9 },
    { id: 'strip', name: 'Case LED strip', info: 'Top of the case', box: [744, 56, 948, 72], leds: line(750, 64, 942, 64, 18), glowR: 9 },
    { id: 'aio', name: 'AIO pump', info: 'CPU cooler ring', box: [850, 170, 888, 210], leds: ring(869, 190, 14, 12), glowR: 7 },
    { id: 'ram', name: 'RAM', info: '4 sticks · 5 LEDs each', box: [894, 150, 948, 222],
      leds: [].concat(line(902, 156, 902, 178, 5), line(914, 156, 914, 178, 5), line(926, 156, 926, 178, 5), line(938, 156, 938, 178, 5)), glowR: 6 },
    { id: 'gpu', name: 'Graphics card', info: 'Light bar & logo', box: [798, 286, 950, 340], leds: line(806, 291, 942, 291, 14).concat([{ x: 874, y: 318 }]), glowR: 8 },
    { id: 'mobo', name: 'Motherboard', info: 'Chipset & header zones', box: [820, 380, 944, 404], leds: line(828, 392, 936, 392, 9), glowR: 8 }
  ]
  var totalLeds = devices.reduce(function (n, d) { return n + d.leds.length }, 0)
  var hitOrder = devices.slice().sort(function (a, b) {
    return (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) - (b.box[2] - b.box[0]) * (b.box[3] - b.box[1])
  })

  function init(opts) {
    var EFFECTS = opts.effects, mix = opts.mix, hsl = opts.hsl, clamp = opts.clamp
    var wrap = document.getElementById('sceneWrap')
    var cv = document.getElementById('scene'), gl = document.getElementById('sceneGlow')
    var ctx = cv.getContext('2d'), gctx = gl.getContext('2d')
    var tip = document.getElementById('sceneTip'), hud = document.getElementById('hudText')
    var state = { fx: 'rainbow', music: false, reveal: false, hover: null, ripples: [], lastBeat: 0, lastSpawn: 0 }
    var colors = devices.map(function (d) { return d.leds.map(function () { return [0, 0, 0] }) })
    hud.textContent = devices.length + ' devices · ' + totalLeds + ' LEDs in sync'

    function resize() {
      var r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(r.width * dpr)
      cv.height = Math.round(r.height * dpr)
      gl.width = Math.round(r.width / 3)
      gl.height = Math.round(r.height / 3)
    }
    window.addEventListener('resize', resize)
    resize()

    function toScene(e) {
      var r = cv.getBoundingClientRect()
      return { x: ((e.clientX - r.left) / r.width) * SW, y: ((e.clientY - r.top) / r.height) * SH, px: e.clientX - r.left, py: e.clientY - r.top }
    }
    cv.addEventListener('pointermove', function (e) {
      var p = toScene(e), now = performance.now() / 1000
      var hit = null
      for (var i = 0; i < hitOrder.length; i++) {
        var b = hitOrder[i].box
        if (p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3]) { hit = hitOrder[i]; break }
      }
      state.hover = hit
      if (hit) {
        tip.hidden = false
        tip.innerHTML = '<b></b><span></span>'
        tip.firstChild.textContent = hit.name
        tip.lastChild.textContent = hit.info + ' · ' + hit.leds.length + ' LEDs'
        tip.style.left = p.px + 'px'
        tip.style.top = p.py + 'px'
      } else tip.hidden = true
      if (now - state.lastSpawn > 0.11) {
        state.lastSpawn = now
        state.ripples.push({ x: p.x, y: p.y, t0: now, hue: (now * 70) % 360, power: 0.75 })
      }
      // subtle parallax tilt
      var r = wrap.getBoundingClientRect()
      wrap.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 5 + 'deg')
      wrap.style.setProperty('--rx', -((e.clientY - r.top) / r.height - 0.5) * 4 + 'deg')
    })
    cv.addEventListener('pointerleave', function () {
      state.hover = null
      tip.hidden = true
      wrap.style.setProperty('--rx', '0deg')
      wrap.style.setProperty('--ry', '0deg')
    })
    cv.addEventListener('pointerdown', function (e) {
      var p = toScene(e)
      state.ripples.push({ x: p.x, y: p.y, t0: performance.now() / 1000, hue: Math.random() * 360, power: 1.4 })
    })

    function rr(c, x, y, w, h, r) {
      c.beginPath()
      if (c.roundRect) c.roundRect(x, y, w, h, r)
      else c.rect(x, y, w, h)
    }
    function css(c, a) {
      return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')'
    }

    var spin = 0, lastT = 0
    function draw(now, t) {
      var dt = Math.min(0.1, t - lastT)
      lastT = t
      var W = cv.width, H = cv.height, s = W / SW
      var tSec = now / 1000

      // music: simulated 120 BPM groove
      var gain = 1, kick = 0
      if (state.music) {
        var phase = (t % 0.5) / 0.5
        kick = Math.exp(-phase * 6)
        gain = 0.45 + 0.75 * kick
        if (t - state.lastBeat >= 0.5) {
          state.lastBeat = t - (t % 0.5)
          state.ripples.push({ x: 845, y: 230, t0: tSec, hue: (t * 45) % 360, power: 1.1 })
        }
      }
      state.ripples = state.ripples.filter(function (r) { return tSec - r.t0 < 2.2 })

      // sample every LED from the shared effect field (+ ripples)
      var fx = EFFECTS[state.fx], idx = 0, sum = [0, 0, 0]
      devices.forEach(function (d, di) {
        d.leds.forEach(function (l, li) {
          var c = fx((l.x / SW) * 16, (l.y / SH) * 6.6, t, idx++)
          for (var j = 0; j < state.ripples.length; j++) {
            var rp = state.ripples[j], age = tSec - rp.t0
            var dist = Math.hypot(l.x - rp.x, l.y - rp.y)
            var k = Math.exp(-Math.pow(dist - age * 430, 2) / 1600) * (1 - age / 2.2) * rp.power
            if (k > 0.01) c = mix(c, hsl(rp.hue + dist * 0.3, 100, 62), clamp(k, 0, 1))
          }
          c = [Math.min(255, c[0] * gain), Math.min(255, c[1] * gain), Math.min(255, c[2] * gain)]
          colors[di][li] = c
          sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]
        })
      })
      var avg = [sum[0] / totalLeds, sum[1] / totalLeds, sum[2] / totalLeds]

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, W, H)
      ctx.setTransform(s, 0, 0, s, 0, 0)

      // room: wall + ambient wash from the average LED colour
      var wall = ctx.createLinearGradient(0, 0, 0, 470)
      wall.addColorStop(0, '#07080e')
      wall.addColorStop(1, '#0c0e17')
      ctx.fillStyle = wall
      ctx.fillRect(0, 0, SW, 470)
      var wash = ctx.createRadialGradient(560, 300, 40, 560, 300, 620)
      wash.addColorStop(0, css(avg, 0.32))
      wash.addColorStop(1, css(avg, 0))
      ctx.fillStyle = wash
      ctx.fillRect(0, 0, SW, 470)

      // "how it works": the shared effect canvas every LED samples from
      if (state.reveal) {
        var cols = 50, rows = 30, cw = SW / cols, ch = SH / rows
        for (var gy = 0; gy < rows; gy++) {
          for (var gx = 0; gx < cols; gx++) {
            var fc = fx(((gx + 0.5) / cols) * 16, ((gy + 0.5) / rows) * 6.6, t, gx + gy * cols)
            ctx.fillStyle = css(fc, 0.42)
            ctx.fillRect(gx * cw, gy * ch, cw - 1, ch - 1)
          }
        }
      }

      // monitor backlight halo (behind the monitor)
      colors[0].forEach(function (c, i) {
        var l = devices[0].leds[i]
        var g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 60)
        g.addColorStop(0, css(c, 0.5))
        g.addColorStop(1, css(c, 0))
        ctx.fillStyle = g
        ctx.fillRect(l.x - 60, l.y - 60, 120, 120)
      })

      // desk
      var desk = ctx.createLinearGradient(0, 468, 0, 600)
      desk.addColorStop(0, '#15161f')
      desk.addColorStop(1, '#08090d')
      ctx.fillStyle = desk
      ctx.fillRect(0, 468, SW, 132)
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(0, 468, SW, 1.5)
      var spill = ctx.createLinearGradient(0, 468, 0, 600)
      spill.addColorStop(0, css(avg, 0.16))
      spill.addColorStop(1, css(avg, 0))
      ctx.fillStyle = spill
      ctx.fillRect(0, 468, SW, 132)

      // monitor
      ctx.fillStyle = '#0b0c12'
      rr(ctx, 336, 300, 38, 86, 4); ctx.fill()
      rr(ctx, 286, 382, 138, 12, 6); ctx.fill()
      ctx.fillStyle = '#0a0b11'
      rr(ctx, 150, 60, 410, 240, 10); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.2; ctx.stroke()
      var scr = ctx.createLinearGradient(158, 68, 552, 292)
      scr.addColorStop(0, '#0e1020'); scr.addColorStop(1, '#090a12')
      ctx.fillStyle = scr
      rr(ctx, 158, 68, 394, 224, 6); ctx.fill()
      // a tiny Lumora UI on screen: effect tiles coloured live
      ctx.fillStyle = 'rgba(255,255,255,0.75)'
      ctx.font = '600 11px Inter, sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      ctx.fillText('Lumora', 188, 86)
      ctx.beginPath(); ctx.arc(178, 86, 5, 0, Math.PI * 2); ctx.strokeStyle = css(hsl(t * 60, 90, 60)); ctx.lineWidth = 2.2; ctx.stroke()
      for (var ty = 0; ty < 2; ty++) {
        for (var tx = 0; tx < 4; tx++) {
          var X = 176 + tx * 92, Y = 104 + ty * 92
          var tg = ctx.createLinearGradient(X, Y, X + 82, Y + 60)
          tg.addColorStop(0, css(EFFECTS[['rainbow', 'aurora', 'synthwave', 'fire', 'ocean', 'rainbow', 'synthwave', 'aurora'][ty * 4 + tx]](tx * 4, ty * 3, t + tx, tx + ty)))
          tg.addColorStop(1, css(EFFECTS[['aurora', 'ocean', 'fire', 'synthwave', 'rainbow', 'aurora', 'fire', 'ocean'][ty * 4 + tx]](tx * 4 + 3, ty * 3 + 2, t + ty, tx)))
          ctx.globalAlpha = 0.75
          ctx.fillStyle = tg
          rr(ctx, X, Y, 82, 58, 6); ctx.fill()
          ctx.globalAlpha = 1
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          rr(ctx, X, Y + 64, 50, 6, 3); ctx.fill()
        }
      }

      // pc case
      ctx.fillStyle = '#0b0c12'
      rr(ctx, 720, 40, 245, 428, 10); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.2; ctx.stroke()
      ctx.fillStyle = '#08090e'
      rr(ctx, 734, 54, 218, 400, 6); ctx.fill()
      // internals
      ctx.fillStyle = '#10121b'
      rr(ctx, 818, 140, 128, 260, 4); ctx.fill() // motherboard
      ctx.fillStyle = '#151824'
      rr(ctx, 798, 286, 150, 50, 5); ctx.fill() // gpu body
      ctx.fillStyle = '#0d0f17'
      rr(ctx, 734, 410, 218, 44, 0); ctx.fill() // psu shroud
      ctx.fillStyle = '#1a1d2a'
      for (var ram = 0; ram < 4; ram++) { rr(ctx, 898 + ram * 12, 152, 8, 66, 2); ctx.fill() }
      ctx.fillStyle = '#141722'
      ctx.beginPath(); ctx.arc(869, 190, 20, 0, Math.PI * 2); ctx.fill()
      // fans
      spin += dt * (state.music ? 9 + kick * 10 : 7)
      function fan(cx, cy, r, ledColors) {
        ctx.fillStyle = '#0f111a'
        rr(ctx, cx - r - 6, cy - r - 6, (r + 6) * 2, (r + 6) * 2, 6); ctx.fill()
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin)
        ctx.fillStyle = 'rgba(40,44,60,0.85)'
        for (var b = 0; b < 7; b++) {
          ctx.rotate((Math.PI * 2) / 7)
          ctx.beginPath(); ctx.ellipse(r * 0.45, 0, r * 0.42, r * 0.14, 0.5, 0, Math.PI * 2); ctx.fill()
        }
        ctx.restore()
        ctx.fillStyle = '#0b0c12'
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2); ctx.fill()
        var n = ledColors.length
        ctx.lineWidth = 4.5
        for (var i = 0; i < n; i++) {
          var a0 = (i / n) * Math.PI * 2 - Math.PI / 2 - Math.PI / n, a1 = a0 + (Math.PI * 2) / n + 0.02
          ctx.strokeStyle = css(ledColors[i])
          ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke()
        }
      }
      for (var f = 0; f < 3; f++) fan(772, FRONT[f], 33, colors[5].slice(f * 16, f * 16 + 16))
      fan(916, 106, 26, colors[6])
      // ring + bars
      ctx.lineWidth = 3
      colors[8].forEach(function (c, i) {
        var a0 = (i / 12) * Math.PI * 2 - Math.PI / 2 - Math.PI / 12
        ctx.strokeStyle = css(c); ctx.beginPath(); ctx.arc(869, 190, 14, a0, a0 + Math.PI / 6 + 0.02); ctx.stroke()
      })
      function dots(di, r) {
        devices[di].leds.forEach(function (l, i) {
          ctx.fillStyle = css(colors[di][i])
          ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill()
        })
      }
      // case strip, ram, gpu bar, motherboard
      ctx.lineCap = 'round'
      ctx.lineWidth = 5
      for (var si = 0; si < colors[7].length - 1; si++) {
        var a = devices[7].leds[si], bpt = devices[7].leds[si + 1]
        ctx.strokeStyle = css(colors[7][si]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(bpt.x, bpt.y); ctx.stroke()
      }
      for (var ri = 0; ri < 4; ri++) {
        for (var rl = 0; rl < 5; rl++) {
          ctx.fillStyle = css(colors[9][ri * 5 + rl])
          ctx.fillRect(898 + ri * 12, 152 + rl * 5.4, 8, 5)
        }
      }
      ctx.lineWidth = 4
      for (var gi = 0; gi < 13; gi++) {
        var p0 = devices[10].leds[gi], p1 = devices[10].leds[gi + 1]
        ctx.strokeStyle = css(colors[10][gi]); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke()
      }
      ctx.fillStyle = css(colors[10][14])
      ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('LUMORA', 874, 319)
      dots(11, 3)
      ctx.lineCap = 'butt'
      // glass reflection
      var glass = ctx.createLinearGradient(734, 54, 952, 454)
      glass.addColorStop(0, 'rgba(255,255,255,0.06)')
      glass.addColorStop(0.35, 'rgba(255,255,255,0)')
      glass.addColorStop(0.55, 'rgba(255,255,255,0.03)')
      glass.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = glass
      rr(ctx, 734, 54, 218, 400, 6); ctx.fill()

      // mousepad
      ctx.fillStyle = '#0c0d13'
      rr(ctx, 560, 474, 202, 94, 10); ctx.fill()
      ctx.lineWidth = 3.5
      var pl = devices[3].leds
      for (var pi = 0; pi < pl.length; pi++) {
        var q0 = pl[pi], q1 = pl[(pi + 1) % pl.length]
        ctx.strokeStyle = css(colors[3][pi]); ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke()
      }
      // keyboard
      ctx.fillStyle = '#0d0e15'
      rr(ctx, 162, 478, 364, 90, 8); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1; ctx.stroke()
      keys.forEach(function (k, i) {
        var c = colors[1][i]
        ctx.fillStyle = css(c)
        rr(ctx, k.x + 1.2, k.y + 1.2, k.w - 2.4, k.h - 2.4, 2.4); ctx.fill()
        ctx.fillStyle = 'rgba(8,9,14,0.45)'
        rr(ctx, k.x + 2.6, k.y + 2, k.w - 5.2, k.h - 6, 2); ctx.fill()
      })
      // mouse
      ctx.fillStyle = '#0e0f17'
      ctx.beginPath(); ctx.ellipse(613, 513, 17, 27, 0, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke()
      dots(2, 2.6)
      // underglow strip
      dots(4, 2.6)

      // hover highlight
      if (state.hover) {
        var b = state.hover.box
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2
        rr(ctx, b[0] - 4, b[1] - 4, b[2] - b[0] + 8, b[3] - b[1] + 8, 8); ctx.stroke()
        ctx.setLineDash([])
      }
      if (state.reveal) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        devices.forEach(function (d) { d.leds.forEach(function (l) { ctx.fillRect(l.x - 1, l.y - 1, 2, 2) }) })
      }

      // glow layer (blurred by CSS)
      var gs = gl.width / SW
      gctx.setTransform(1, 0, 0, 1, 0, 0)
      gctx.clearRect(0, 0, gl.width, gl.height)
      gctx.setTransform(gs, 0, 0, gs, 0, 0)
      devices.forEach(function (d, di) {
        if (d.hidden) return
        d.leds.forEach(function (l, i) {
          gctx.fillStyle = css(colors[di][i])
          gctx.beginPath(); gctx.arc(l.x, l.y, d.glowR, 0, Math.PI * 2); gctx.fill()
        })
      })
    }

    return {
      draw: draw,
      setEffect: function (fx) { state.fx = fx },
      setMusic: function (on) { state.music = on },
      setReveal: function (on) { state.reveal = on },
      deviceCount: devices.length,
      ledCount: totalLeds
    }
  }

  window.LumoraScene = { init: init }
})()
