;(function () {
  'use strict'
  var cfg = window.LUMORA_SITE || {}
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var $ = function (s, r) { return (r || document).querySelector(s) }
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)) }

  // ───────── config wiring ─────────
  $$('[data-download]').forEach(function (a) {
    a.href = cfg.downloadUrl || '#download'
    a.setAttribute('download', '')
  })
  $$('[data-releases]').forEach(function (a) { a.href = cfg.releasesUrl || '#' })
  $$('[data-portfolio]').forEach(function (a) { a.href = cfg.portfolioUrl || '#' })
  $$('[data-github]').forEach(function (a) { a.href = cfg.githubUrl || '#' })
  $$('[data-linkedin]').forEach(function (a) {
    if (cfg.linkedinUrl) a.href = cfg.linkedinUrl
    else a.remove()
  })
  $$('[data-author]').forEach(function (el) { if (cfg.author) el.textContent = cfg.author })
  $$('[data-tagline]').forEach(function (el) { if (cfg.authorTagline) el.textContent = cfg.authorTagline })
  $$('[data-meta]').forEach(function (el) {
    el.textContent = 'v' + (cfg.version || '0.1.0') + ' · Windows 10 & 11 · ' + (cfg.installerSizeMB || 109) + ' MB · Free forever'
  })
  $$('[data-meta-long]').forEach(function (el) {
    el.textContent = 'Version ' + (cfg.version || '0.1.0') + ' · Windows 10 & 11 (64-bit) · about ' + (cfg.installerSizeMB || 109) + ' MB'
  })
  var kofiBtn = $('[data-kofi]')
  if (cfg.kofiUrl) {
    kofiBtn.href = cfg.kofiUrl
  } else {
    kofiBtn.hidden = true
    var soon = $('[data-kofi-soon]')
    soon.hidden = false
    soon.innerHTML = 'Ko-fi page coming soon — meanwhile, a ⭐ on <a href="' + (cfg.githubUrl || '#') + '" target="_blank" rel="noopener">GitHub</a> helps too!'
  }
  $('#year').textContent = new Date().getFullYear()

  // ───────── helpers ─────────
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
    function f(t) {
      t = (t + 1) % 1
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
    }
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
  }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k] }
  function ramp(stops, k) {
    k = clamp(k, 0, 0.9999) * (stops.length - 1)
    var i = Math.floor(k)
    return mix(stops[i], stops[i + 1], k - i)
  }
  var perm = []
  for (var i = 0; i < 512; i++) perm.push((Math.sin(i * 12.9898) * 43758.5453) % 1)
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    function r(a, b) { return Math.abs(perm[((a * 57 + b * 131) % 509 + 509) % 509]) }
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    var a = r(xi, yi), b = r(xi + 1, yi), c = r(xi, yi + 1), d = r(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }

  // ───────── effects: colour at (x 0..15, y 0..6, time) ─────────
  var flies = []
  for (var f = 0; f < 90; f++) flies.push({ phase: Math.random() * Math.PI * 2, rate: 1.6 + Math.random() * 0.5 })
  var lastFlyT = 0
  function stepFlies(t) {
    var dt = Math.min(0.1, t - lastFlyT); lastFlyT = t
    var cyc = (t % 40) / 40, k = cyc < 0.85 ? cyc * 1.6 : 0
    var mx = 0, my = 0
    flies.forEach(function (fl) { mx += Math.cos(fl.phase); my += Math.sin(fl.phase) })
    var mean = Math.atan2(my, mx)
    flies.forEach(function (fl) {
      fl.phase += dt * (fl.rate + k * Math.sin(mean - fl.phase))
      if (cyc > 0.97) fl.phase += Math.random() * 0.6
    })
  }
  var FIRE = [[0, 0, 0], [90, 0, 0], [210, 30, 0], [255, 120, 0], [255, 210, 70], [255, 250, 220]]
  var EFFECTS = {
    rainbow: function (x, y, t) { return hsl(x * 22 + y * 8 - t * 110, 100, 55) },
    aurora: function (x, y, t) {
      var band = Math.sin(x * 0.45 + t * 0.9 + Math.sin(y * 0.8 + t * 0.6) * 1.4)
      var v = clamp(0.5 + 0.5 * band, 0, 1)
      var base = mix([4, 10, 40], [10, 30, 80], y / 6)
      var col = mix([40, 255, 160], [150, 90, 255], 0.5 + 0.5 * Math.sin(x * 0.2 + t * 0.4))
      return mix(base, col, Math.pow(v, 1.6))
    },
    synthwave: function (x, y, t) {
      var sky = mix([255, 60, 170], [80, 20, 160], y / 6)
      var sun = Math.exp(-((x - 7.5) * (x - 7.5)) / 10 - ((y - 1.4) * (y - 1.4)) / 2)
      var c = mix(sky, [255, 190, 60], clamp(sun * 1.4, 0, 1))
      var line = (y + t * 1.6) % 1.5 < 0.32 && y > 2.4 ? 1 : 0
      return mix(c, [40, 240, 255], line * 0.85)
    },
    fire: function (x, y, t) {
      var heat = vnoise(x * 0.55, y * 0.7 + t * 2.4) * 0.75 + vnoise(x * 1.3, y * 1.4 + t * 3.2) * 0.35
      heat *= Math.pow(y / 6, 1.15) * 1.35
      return ramp(FIRE, clamp(heat, 0, 1))
    },
    fireflies: function (x, y, t, idx) {
      var base = mix([6, 14, 30], [10, 40, 25], y / 6)
      var fl = flies[idx % flies.length]
      var flash = Math.pow(Math.max(0, Math.sin(fl.phase)), 14)
      return mix(base, [190, 255, 70], flash)
    },
    ocean: function (x, y, t) {
      var base = [2, 12, 34]
      var crest = (x + y * 0.6 - t * 4.5) % 18
      crest = crest < 0 ? crest + 18 : crest
      var glow = Math.exp(-crest * 0.55) + 0.18 * Math.exp(-Math.abs(crest - 9) * 0.8)
      var sparkle = vnoise(x * 3 + t * 2, y * 3) > 0.92 ? 0.7 : 0
      return mix(base, [40, 230, 255], clamp(glow + sparkle, 0, 1))
    }
  }

  // ───────── hero keyboard ─────────
  var ROWS = [
    [['Esc', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1], ['Del', 2]],
    [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['⌫', 2]],
    [['Tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.5]],
    [['Caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['Enter', 2.25]],
    [['Shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['Shift', 2.75]],
    [['Ctrl', 1.25], ['Fn', 1], ['Win', 1.25], ['Alt', 1.25], ['', 4.25], ['Alt', 1], ['Ctrl', 1], ['←', 1], ['↑', 1], ['↓', 1], ['→', 1]]
  ]
  var keys = []
  ROWS.forEach(function (row, y) {
    var x = 0
    row.forEach(function (k) {
      keys.push({ label: k[0], x: x, y: y, w: k[1], cx: x + k[1] / 2, cy: y + 0.5 })
      x += k[1]
    })
  })
  var PAD = 0.3, GW = 15 + PAD * 2, GH = 6 + PAD * 2

  var kb = $('#kb'), glow = $('#kbGlow')
  var kctx = kb.getContext('2d'), gctx = glow.getContext('2d')
  var current = 'rainbow', userPicked = false, ripples = [], lastSpawn = 0

  function resize() {
    var r = kb.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
    kb.width = Math.round(r.width * dpr); kb.height = Math.round(r.height * dpr)
    glow.width = Math.round(r.width / 4); glow.height = Math.round(r.height / 4)
  }
  window.addEventListener('resize', resize)
  resize()

  function select(fx) {
    current = fx
    $$('.effect-switch button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.fx === fx)) })
  }
  $$('.effect-switch button').forEach(function (b) {
    b.addEventListener('click', function () { userPicked = true; select(b.dataset.fx) })
  })
  select(current)

  function toGrid(e) {
    var r = kb.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * GW - PAD, y: ((e.clientY - r.top) / r.height) * GH - PAD }
  }
  kb.addEventListener('pointermove', function (e) {
    var now = performance.now() / 1000
    if (now - lastSpawn < 0.12) return
    lastSpawn = now
    var p = toGrid(e)
    ripples.push({ x: p.x, y: p.y, t0: now, hue: (now * 80) % 360, power: 0.7 })
  })
  kb.addEventListener('pointerdown', function (e) {
    var p = toGrid(e), now = performance.now() / 1000
    ripples.push({ x: p.x, y: p.y, t0: now, hue: Math.random() * 360, power: 1.3 })
  })

  function roundRect(c, x, y, w, h, r) {
    c.beginPath()
    if (c.roundRect) c.roundRect(x, y, w, h, r)
    else c.rect(x, y, w, h)
  }

  var start = performance.now(), lastSwitch = 0
  var order = ['rainbow', 'aurora', 'synthwave', 'fire', 'fireflies', 'ocean']
  function drawKeyboard(now) {
    var t = (now - start) / 1000
    if (!userPicked && !reduceMotion && t - lastSwitch > 7) {
      lastSwitch = t
      select(order[(order.indexOf(current) + 1) % order.length])
    }
    if (current === 'fireflies') stepFlies(t)
    var W = kb.width, H = kb.height, u = W / GW
    kctx.clearRect(0, 0, W, H)
    // chassis
    var grad = kctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#191c27'); grad.addColorStop(1, '#0c0e15')
    kctx.fillStyle = grad
    roundRect(kctx, 0, 0, W, H, u * 0.55); kctx.fill()
    kctx.strokeStyle = 'rgba(255,255,255,0.08)'; kctx.lineWidth = Math.max(1, u * 0.03); kctx.stroke()

    gctx.clearRect(0, 0, glow.width, glow.height)
    var gu = glow.width / GW
    var now2 = now / 1000
    ripples = ripples.filter(function (r) { return now2 - r.t0 < 2.2 })
    var fx = EFFECTS[current]
    keys.forEach(function (k, idx) {
      var c = fx(k.cx, k.cy, t, idx)
      for (var j = 0; j < ripples.length; j++) {
        var rp = ripples[j], age = now2 - rp.t0
        var d = Math.hypot(k.cx - rp.x, (k.cy - rp.y) * 1.2)
        var ring = Math.exp(-Math.pow(d - age * 7, 2) / 0.9) * (1 - age / 2.2) * rp.power
        if (ring > 0.01) c = mix(c, hsl(rp.hue + d * 12, 100, 62), clamp(ring, 0, 1))
      }
      var x = (k.x + PAD + 0.06) * u, y = (k.y + PAD + 0.06) * u, w = (k.w - 0.12) * u, h = 0.88 * u
      // key cap: lit colour with a darker top face
      kctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'
      roundRect(kctx, x, y, w, h, u * 0.14); kctx.fill()
      kctx.fillStyle = 'rgba(10,11,18,0.42)'
      roundRect(kctx, x + u * 0.07, y + u * 0.05, w - u * 0.14, h - u * 0.2, u * 0.11); kctx.fill()
      if (k.label && u > 22) {
        kctx.fillStyle = 'rgba(255,255,255,0.78)'
        kctx.font = '600 ' + Math.min(u * 0.26, w * 0.32) + 'px Inter, sans-serif'
        kctx.textAlign = 'center'; kctx.textBaseline = 'middle'
        kctx.fillText(k.label, x + w / 2, y + h * 0.42)
      }
      gctx.fillStyle = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'
      gctx.fillRect((k.x + PAD) * gu, (k.y + PAD) * gu, k.w * gu, gu)
    })
  }

  // ───────── prompt demo ─────────
  var demos = [
    {
      text: 'Slow purple waves that punch with the bass',
      layers: [['Wave', 'linear-gradient(90deg,#8b5cff,#1a0636)', 'Normal'], ['Pulse', 'radial-gradient(circle,#fff,#b040ff 45%,#000 80%)', '♪ Bass'], ['Sparkles', 'radial-gradient(circle,#fff 0 3px,transparent 4px) 0 0/12px 12px,#160a2c', 'Add']],
      fx: function (x, y, t) {
        var beat = Math.exp(-((t % 0.6) / 0.6) * 5)
        var w = 0.5 + 0.5 * Math.sin(x * 0.35 - t * 1.4 + y * 0.2)
        return mix([20, 4, 50], [150, 70, 255], clamp(w * 0.8 + beat * 0.5 * Math.exp(-Math.pow((x - 16) / 9, 2)), 0, 1))
      }
    },
    {
      text: 'Cozy campfire with floating embers',
      layers: [['Fire', 'linear-gradient(0deg,#ffd23c,#ff7a00 35%,#d01000 70%,#000)', 'Normal'], ['Embers', 'radial-gradient(circle,#ffa040 0 3px,transparent 4px) 0 0/14px 14px,#1a0800', 'Add']],
      fx: function (x, y, t) {
        var heat = vnoise(x * 0.3, y * 0.5 + t * 2.2) * 0.8 + vnoise(x * 0.8, y + t * 3) * 0.3
        heat *= Math.pow(y / 12, 1.2) * 1.4
        var ember = vnoise(x * 2 + 40, y * 2 - t * 3) > 0.94 ? 0.6 : 0
        return mix(ramp(FIRE, clamp(heat, 0, 1)), [255, 170, 60], ember)
      }
    },
    {
      text: 'Cyberpunk neon rain in pink and cyan',
      layers: [['Gradient', 'linear-gradient(90deg,#ff2d95,#7a3cff,#00e5ff)', 'Normal'], ['Digital rain', 'repeating-linear-gradient(90deg,#0ff 0 2px,transparent 2px 8px),#050510', 'Screen'], ['Glow', 'radial-gradient(circle,#ff2d95,#000 75%)', '♪ Beat']],
      fx: function (x, y, t) {
        var base = mix([255, 45, 149], [0, 229, 255], x / 32)
        var col = (x * 7.3) % 1
        var drop = (y / 12 + t * (0.6 + col) + col * 5) % 1
        var rain = drop > 0.82 ? (drop - 0.82) * 5.5 : 0
        return mix(mix([6, 4, 20], base, 0.35), [240, 250, 255], clamp(rain, 0, 1))
      }
    }
  ]
  var typedEl = $('#typed'), layersEl = $('#pdLayers'), pd = $('#pdCanvas'), pdc = pd.getContext('2d')
  var small = document.createElement('canvas'); small.width = 32; small.height = 12
  var sctx = small.getContext('2d'), simg = sctx.createImageData(32, 12)
  var demoIdx = 0, demoFx = demos[0].fx

  function runDemo() {
    var d = demos[demoIdx % demos.length]
    demoIdx++
    demoFx = d.fx
    layersEl.innerHTML = ''
    typedEl.textContent = ''
    var i = 0
    var timer = setInterval(function () {
      typedEl.textContent = d.text.slice(0, ++i)
      if (i >= d.text.length) {
        clearInterval(timer)
        setTimeout(function () {
          d.layers.forEach(function (l, n) {
            setTimeout(function () {
              var row = document.createElement('div')
              row.className = 'pd-layer'
              row.innerHTML = '<i style="background:' + l[1] + '"></i><b></b><small></small>'
              row.querySelector('b').textContent = l[0]
              row.querySelector('small').textContent = l[2]
              layersEl.appendChild(row)
            }, n * 260)
          })
          setTimeout(runDemo, 5200)
        }, 450)
      }
    }, reduceMotion ? 0 : 38)
  }
  if (reduceMotion) {
    typedEl.textContent = demos[0].text
  } else {
    runDemo()
  }

  function drawDemo(now) {
    var t = (now - start) / 1000
    for (var y = 0; y < 12; y++) {
      for (var x = 0; x < 32; x++) {
        var c = demoFx(x, y, t), o = (y * 32 + x) * 4
        simg.data[o] = c[0]; simg.data[o + 1] = c[1]; simg.data[o + 2] = c[2]; simg.data[o + 3] = 255
      }
    }
    sctx.putImageData(simg, 0, 0)
    pdc.imageSmoothingEnabled = true
    pdc.drawImage(small, 0, 0, pd.width, pd.height)
  }

  // ───────── loop (pauses when off-screen) ─────────
  var heroVisible = true, demoVisible = false
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) { heroVisible = e[0].isIntersecting }).observe($('#stage'))
    new IntersectionObserver(function (e) { demoVisible = e[0].isIntersecting }).observe(pd)
  }
  function loop(now) {
    if (heroVisible) drawKeyboard(now)
    if (demoVisible) drawDemo(now)
    if (!reduceMotion) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  // ───────── effects catalog: marquee + gallery ─────────
  fetch('/effects.json')
    .then(function (r) { return r.json() })
    .then(function (list) {
      $('#fxCount').textContent = list.length
      buildMarquee(list)
      buildGallery(list)
    })
    .catch(function () { /* gallery stays empty offline */ })

  function chip(e) {
    var el = document.createElement('span')
    el.className = 'chip'
    el.innerHTML = '<img alt="" loading="lazy" /><span></span>'
    el.querySelector('img').src = '/assets/effects/' + e.slug + '.png'
    el.querySelector('span').textContent = e.title
    return el
  }
  function buildMarquee(list) {
    var shuffled = list.slice().sort(function () { return Math.random() - 0.5 })
    var half = Math.ceil(shuffled.length / 2)
    ;[[$('#marqueeA'), shuffled.slice(0, half)], [$('#marqueeB'), shuffled.slice(half)]].forEach(function (pair) {
      // two copies so the -50% translate loops seamlessly
      pair[1].concat(pair[1]).forEach(function (e) { pair[0].appendChild(chip(e)) })
    })
  }

  var ORDER = ['Classic', 'Nature', 'Space', 'Retro & Gaming', 'Abstract', 'Party & Music', 'Cozy & Seasonal', 'Wellness & Focus', 'Screen Sync']
  function buildGallery(list) {
    var tabs = $('#fxTabs'), gallery = $('#gallery')
    var cats = ['All'].concat(ORDER.filter(function (c) { return list.some(function (e) { return e.category === c }) }))
    function show(cat) {
      $$('button', tabs).forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.cat === cat)) })
      gallery.innerHTML = ''
      list
        .filter(function (e) { return cat === 'All' || e.category === cat })
        .forEach(function (e, n) {
          var card = document.createElement('figure')
          card.className = 'fx'
          card.tabIndex = 0
          card.style.animationDelay = Math.min(n * 25, 600) + 'ms'
          card.innerHTML =
            '<img alt="" loading="lazy" width="320" height="200" />' +
            '<figcaption class="fx-info"><b></b><span></span></figcaption>' +
            '<div class="fx-desc"></div>' +
            (e.music ? '<span class="fx-badge">♪ Music</span>' : e.screen ? '<span class="fx-badge">▣ Screen</span>' : '')
          var img = card.querySelector('img')
          img.src = '/assets/effects/' + e.slug + '.png'
          img.alt = e.title + ' effect preview'
          card.querySelector('b').textContent = e.title
          card.querySelector('.fx-info span').textContent = e.category + ' · ' + e.energy
          card.querySelector('.fx-desc').textContent = e.description
          gallery.appendChild(card)
        })
    }
    cats.forEach(function (c) {
      var b = document.createElement('button')
      b.setAttribute('role', 'tab')
      b.dataset.cat = c
      var count = c === 'All' ? list.length : list.filter(function (e) { return e.category === c }).length
      b.innerHTML = '<span class="label"></span><span></span>'
      b.querySelector('.label').textContent = c
      b.lastChild.textContent = count
      b.addEventListener('click', function () { show(c) })
      tabs.appendChild(b)
    })
    show('All')
  }

  // ───────── scroll reveal ─────────
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) }
      })
    }, { threshold: 0.12 })
    $$('.section-head, .feature, .create-copy, .prompt-demo, .compare-col, .download-card, .maker, .kofi').forEach(function (el) {
      el.classList.add('reveal')
      io.observe(el)
    })
  }
})()
