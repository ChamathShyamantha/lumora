/* Lumora effect bootstrap — runs inside the sandboxed effect frame before the
   effect's own scripts. Injected (base64) by compose.ts; window.__LUMORA_INIT__
   holds { props, fps, captureEvery }. Keep this file free of line comments
   and always terminate statements with semicolons. */
(function () {
  'use strict';
  var INIT = window.__LUMORA_INIT__ || {};
  var props = INIT.props || {};
  var fps = INIT.fps || 60;
  var captureEvery = INIT.captureEvery || 2;
  var host = window.parent;

  function post(msg, transfer) {
    msg.__lumora = 1;
    try {
      host.postMessage(msg, '*', transfer || []);
    } catch (e) {
      /* host gone */
    }
  }

  Object.keys(props).forEach(function (k) {
    window[k] = props[k];
  });

  var engine = {
    width: 320,
    height: 200,
    fps: fps,
    time: 0,
    audio: {
      active: false,
      level: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      density: 0,
      width: 0,
      freq: new Float32Array(64),
      beat: false,
      beatCount: 0
    },
    zone: {
      active: false,
      width: 28,
      height: 20,
      hue: new Int16Array(560),
      saturation: new Int8Array(560),
      lightness: new Int8Array(560),
      imagedata: new Uint8ClampedArray(160 * 100 * 4)
    }
  };
  window.engine = engine;

  var lastError = 0;
  function report(message, line) {
    var now = Date.now();
    if (now - lastError < 500) return;
    lastError = now;
    post({ type: 'error', message: String(message), line: line || 0 });
  }
  window.addEventListener('error', function (e) {
    report(e.message, e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    report(e.reason && e.reason.message ? e.reason.message : String(e.reason), 0);
  });

  ['log', 'info', 'warn', 'error'].forEach(function (level) {
    var original = console[level];
    var count = 0;
    var windowStart = Date.now();
    console[level] = function () {
      try {
        original.apply(console, arguments);
      } catch (e) {
        /* ignore */
      }
      var now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > 20) return;
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        try {
          parts.push(typeof a === 'string' ? a : JSON.stringify(a));
        } catch (e) {
          parts.push(String(a));
        }
      }
      post({ type: 'log', level: level, message: parts.join(' ').slice(0, 500) });
    };
  });

  function callHandler(name) {
    var fn = window['on' + name + 'Changed'];
    if (typeof fn === 'function') {
      try {
        fn();
      } catch (e) {
        report(e && e.message ? e.message : String(e), 0);
      }
    }
  }

  var queue = [];
  var nextId = 1;
  window.requestAnimationFrame = function (cb) {
    var id = nextId++;
    queue.push({ id: id, cb: cb });
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    queue = queue.filter(function (q) {
      return q.id !== id;
    });
  };

  var capCanvas = document.createElement('canvas');
  capCanvas.width = 320;
  capCanvas.height = 200;
  var capCtx = capCanvas.getContext('2d', { willReadFrequently: true });

  function capture() {
    var cv = document.querySelector('canvas');
    if (!cv || !cv.width || !cv.height) return;
    capCtx.globalAlpha = 1;
    capCtx.globalCompositeOperation = 'source-over';
    capCtx.filter = 'none';
    capCtx.fillStyle = '#000';
    capCtx.fillRect(0, 0, 320, 200);
    capCtx.filter = (cv.style && cv.style.filter) || 'none';
    try {
      capCtx.drawImage(cv, 0, 0, 320, 200);
    } catch (e) {
      return;
    }
    capCtx.filter = 'none';
    var img = capCtx.getImageData(0, 0, 320, 200);
    post({ type: 'frame', data: img.data.buffer }, [img.data.buffer]);
  }

  var start = performance.now();
  var frame = 0;
  var paused = false;
  var interval = 1000 / fps;
  var nextAt = 0;

  function tick() {
    var now = performance.now();
    if (!paused) {
      engine.time = (now - start) / 1000;
      var run = queue;
      queue = [];
      for (var i = 0; i < run.length; i++) {
        try {
          run[i].cb(now);
        } catch (e) {
          report(e && e.message ? e.message : String(e), 0);
        }
      }
      engine.audio.beat = false;
      frame++;
      if (frame % captureEvery === 0) capture();
    }
    nextAt += interval;
    var delay = nextAt - performance.now();
    if (delay < -interval * 4) {
      nextAt = performance.now();
      delay = 0;
    }
    setTimeout(tick, Math.max(0, delay));
  }

  window.addEventListener('message', function (e) {
    if (e.source !== host) return;
    var m = e.data;
    if (!m || !m.__lumora) return;
    var a = engine.audio;
    var z = engine.zone;
    switch (m.type) {
      case 'prop':
        window[m.name] = m.value;
        callHandler(m.name);
        break;
      case 'audio':
        a.active = m.active;
        a.level = m.level;
        a.bass = m.bass;
        a.mid = m.mid;
        a.treble = m.treble;
        a.density = m.density;
        a.width = m.width;
        if (m.freq) a.freq.set(m.freq);
        if (m.beat) {
          a.beat = true;
          a.beatCount++;
        }
        break;
      case 'zone':
        z.active = m.active;
        if (m.hue) z.hue.set(m.hue);
        if (m.saturation) z.saturation.set(m.saturation);
        if (m.lightness) z.lightness.set(m.lightness);
        if (m.imagedata) z.imagedata.set(new Uint8ClampedArray(m.imagedata));
        break;
      case 'pause':
        paused = !!m.paused;
        break;
      default:
        window.dispatchEvent(new CustomEvent('lumora-message', { detail: m }));
    }
  });

  function begin() {
    Object.keys(props).forEach(callHandler);
    post({ type: 'ready' });
    start = performance.now();
    nextAt = performance.now();
    tick();
  }
  if (document.readyState === 'complete') setTimeout(begin, 0);
  else window.addEventListener('load', begin);
})();
