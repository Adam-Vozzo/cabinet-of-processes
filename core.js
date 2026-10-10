/* ==========================================================================
   CABINET CORE — module registry, parameter helpers, seeded RNG, recipe
   codes and small p5 helpers shared by every algorithm module.
   No DOM work happens here; the shell (ui.js) and the test harness both
   build on top of it.
   ========================================================================== */
(function (root) {
  'use strict';

  const FORMATS = [
    { id: 'portrait', label: 'Portrait 4:5', short: '4:5', a: 0.8 },
    { id: 'square', label: 'Square 1:1', short: '1:1', a: 1.0 },
    { id: 'landscape', label: 'Landscape 3:2', short: '3:2', a: 1.5 },
    { id: 'panorama', label: 'Panorama 2:1', short: '2:1', a: 2.0 },
  ];

  /* ---------- seeded RNG: sfc32 seeded through splitmix32 ---------- */
  function rng(seed) {
    let s = (seed >>> 0) ^ 0x9e3779b9;
    const split = () => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    let a = split(), b = split(), c = split(), d = split();
    const R = function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    R.range = (lo, hi) => lo + (hi - lo) * R();
    R.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * R());          // inclusive
    R.pick = (arr) => arr[Math.floor(R() * arr.length)];
    R.gauss = () => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    R.chance = (p) => R() < p;
    return R;
  }

  /* ---------- fullscreen-quad vertex shader for WebGL2 fragment modules ---------- */
  const VERT = `#version 300 es
precision highp float;
in vec3 aPosition;
void main() {
  vec4 p = vec4(aPosition, 1.0);
  p.xy = p.xy * 2.0 - 1.0;
  gl_Position = p;
}`;

  // 2D simplex noise + helpers you can paste into fragment shaders (MIT, Ashima Arts)
  const GLSL_NOISE = `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

  /* ---------- registry ---------- */
  const modules = [];
  const byId = {};

  function register(m) {
    if (!m || !m.id) throw new Error('Cabinet.register: module needs an id');
    m.params = m.params || [];
    m.params.forEach((p) => {
      if (p.type === 'select') { p.min = 0; p.max = p.options.length - 1; p.step = 1; }
      if (p.step == null) p.step = 0.01;
    });
    m.paramBy = Object.fromEntries(m.params.map((p) => [p.k, p]));
    m.formats = m.formats && m.formats.length ? m.formats : [0, 1, 2, 3];
    m.palettes = m.palettes && m.palettes.length ? m.palettes : [{ name: 'Default', colors: ['#111111', '#eeeeee'] }];
    m.group = m.group || 'process';
    m.renderer = m.renderer === 'webgl' ? 'webgl' : '2d';
    m.order = m.order == null ? modules.length : m.order;
    const existing = byId[m.id];
    if (existing) modules[modules.indexOf(existing)] = m; else modules.push(m);
    byId[m.id] = m;
    modules.sort((a, b) => (a.group === b.group ? a.order - b.order : a.group === 'process' ? -1 : 1));
    return m;
  }

  /* ---------- parameter helpers ---------- */
  function snap(p, v) {
    v = Number(v);
    if (!Number.isFinite(v)) v = p.def;
    v = Math.min(p.max, Math.max(p.min, v));
    const n = Math.round((v - p.min) / p.step);
    return +(p.min + n * p.step).toFixed(6);
  }

  function defaults(m) {
    const d = m.defaults || {};
    const o = {
      seed: d.seed != null ? d.seed : 1,
      format: d.format != null ? d.format : m.formats[0],
      palette: d.palette != null ? d.palette : 0,
    };
    m.params.forEach((p) => (o[p.k] = p.def));
    return o;
  }

  function sanitize(m, o) {
    const d = defaults(m);
    if (!o || typeof o !== 'object') return d;
    if (Number.isFinite(o.seed)) d.seed = Math.max(0, Math.min(999999, Math.round(o.seed)));
    if (Number.isInteger(o.format) && m.formats.includes(o.format)) d.format = o.format;
    if (Number.isInteger(o.palette) && o.palette >= 0 && o.palette < m.palettes.length) d.palette = o.palette;
    m.params.forEach((p) => { if (o[p.k] != null && Number.isFinite(Number(o[p.k]))) d[p.k] = snap(p, o[p.k]); });
    return d;
  }

  function nameFrom(p, v) {
    let w = p.names[0][1];
    for (const [t, n] of p.names) if (v >= t - 1e-9) w = n;
    return w;
  }

  function fmtNum(p, v) {
    if (p.step >= 1) return String(Math.round(v));
    const dec = p.step >= 0.1 ? 1 : 2;
    return (+v).toFixed(dec);
  }

  function traitName(m, k, P) {
    if (k === 'palette') return (m.palettes[P.palette] || {}).name || '';
    if (k === 'format') return FORMATS[P.format].label;
    if (m.traitName) {
      const c = m.traitName(k, P);
      if (c != null) return String(c);
    }
    const p = m.paramBy[k];
    if (!p) return '';
    if (p.type === 'select') return p.options[P[k]] != null ? p.options[P[k]] : '';
    if (p.names) return nameFrom(p, P[k]);
    return fmtNum(p, P[k]) + (p.unit || '');
  }

  function sheet(m, P) {
    if (m.sheet) return m.sheet(P);
    const rows = [['Palette', traitName(m, 'palette', P)]];
    if (m.formats.length > 1) rows.push(['Format', traitName(m, 'format', P)]);
    m.params.slice(0, 12).forEach((p) => rows.push([p.label, traitName(m, p.k, P)]));
    return rows;
  }

  function caption(m, P) {
    return m.caption ? m.caption(P) : `${traitName(m, 'palette', P)}.`;
  }

  function pickWeighted(R, w) {
    const t = w.reduce((a, b) => a + b, 0);
    let x = R() * t;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
    return w.length - 1;
  }

  /* Randomize: the module's randomize(R, seed) returns any subset of keys
     (including format/palette); missing params are drawn uniformly.
     Settings (p.setting: output quality, not a trait) keep their default here
     and are never rolled or nudged; the shell carries the current value over. */
  function randomize(m, seed) {
    const R = rng((seed * 2654435761) >>> 0);
    for (let i = 0; i < 12; i++) R();   // warm up: decorrelates nearby seeds' first draws
    const o = defaults(m);
    o.seed = seed;
    o.format = m.formats[pickWeighted(R, m.formatOdds || m.formats.map(() => 1))];
    o.palette = pickWeighted(R, m.paletteOdds || m.palettes.map(() => 1));
    const r = (m.randomize && m.randomize(R, seed)) || {};
    m.params.forEach((p) => {
      const v = p.k in r ? r[p.k]
        : p.setting ? p.def
        : p.type === 'select' ? Math.floor(R() * p.options.length)
        : p.min + R() * (p.max - p.min);
      o[p.k] = snap(p, v);
    });
    if (Number.isInteger(r.format) && m.formats.includes(r.format)) o.format = r.format;
    if (Number.isInteger(r.palette) && r.palette >= 0 && r.palette < m.palettes.length) o.palette = r.palette;
    return o;
  }

  function mutate(m, P, salt) {
    const R = rng(((P.seed + 1) * 7919 + salt * 104729) >>> 0);
    const o = Object.assign({}, P);
    let changed = 0;
    const traits = m.params.filter((p) => !p.setting);
    traits.forEach((p) => {
      if (R() < 0.35) {
        changed++;
        if (p.type === 'select') { if (R() < 0.5) o[p.k] = Math.floor(R() * p.options.length); return; }
        const span = p.max - p.min;
        const g = (R() + R() + R() - 1.5) * 0.28 * span;
        o[p.k] = snap(p, P[p.k] + (p.step >= 1 ? Math.round(g) || (R() < 0.5 ? -p.step : p.step) : g));
      }
    });
    if (!changed && traits.length) {
      const p = traits[Math.floor(R() * traits.length)];
      o[p.k] = snap(p, P[p.k] + (R() - 0.5) * 0.3 * (p.max - p.min));
    }
    if (R() < 0.1 && m.palettes.length > 1) o.palette = Math.floor(R() * m.palettes.length);
    return o;
  }

  /* ---------- recipe codes: CAB1.<id>.<seed>.<format><palette>.<values> ---------- */
  function width36(p) {
    const n = Math.round((p.max - p.min) / p.step) + 1;
    return Math.max(1, Math.ceil(Math.log(n) / Math.log(36)));
  }
  function encode(m, P) {
    const vals = m.params.map((p) => Math.round((P[p.k] - p.min) / p.step).toString(36).padStart(width36(p), '0')).join('');
    return `CAB1.${m.id}.${P.seed}.${P.format.toString(36)}${P.palette.toString(36)}.${vals || '0'}`;
  }
  function decode(str) {
    const mm = String(str).trim().match(/^CAB1\.([a-z0-9-]+)\.(\d+)\.([0-9a-z])([0-9a-z])\.([0-9a-z]+)$/i);
    if (!mm) return null;
    const m = byId[mm[1].toLowerCase()];
    if (!m) return null;
    const o = defaults(m);
    o.seed = parseInt(mm[2], 10) % 1000000;
    o.format = parseInt(mm[3], 36);
    o.palette = parseInt(mm[4], 36);
    const body = mm[5].toLowerCase();
    let i = 0;
    m.params.forEach((p) => {
      const w = width36(p);
      const chunk = body.slice(i, i + w);
      i += w;
      if (chunk.length === w) o[p.k] = snap(p, p.min + parseInt(chunk, 36) * p.step);
    });
    return { module: m, P: sanitize(m, o) };
  }

  /* ---------- p5 helpers ---------- */
  // Render a fragment shader once into a fresh W×H canvas (for exportAt()).
  function shaderStill(p, frag, setUniforms, W, H) {
    const g = p.createGraphics(W, H, p.WEBGL);
    g.pixelDensity(1);
    const sh = g.createShader(VERT, frag);
    g.noStroke();
    g.shader(sh);
    setUniforms(sh, W, H);
    g.rect(0, 0, W, H);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(g.elt, 0, 0, W, H);
    g.remove();
    return c;
  }
  // Size of the drawing buffer in device pixels (what gl_FragCoord measures).
  function bufferSize(p) {
    if (p._renderer && p._renderer.GL) { const gl = p._renderer.GL; return [gl.drawingBufferWidth, gl.drawingBufferHeight]; }
    // the canvas's own size: width × density is fractional at 125 %, 150 %… display scaling
    const c = p.drawingContext.canvas;
    return [c.width, c.height];
  }
  function hexRGB(h) {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function hex255(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // A time budget helper for incremental simulations: while (budget()) { ...step... }
  function budget(ms) {
    const t0 = performance.now();
    return () => performance.now() - t0 < ms;
  }

  root.Cabinet = {
    FORMATS, VERT, GLSL_NOISE, modules, byId,
    rng, register, snap, defaults, sanitize, traitName, sheet, caption, nameFrom,
    randomize, mutate, encode, decode, pickWeighted,
    shaderStill, bufferSize, hexRGB, hex255, budget,
  };
})(typeof window !== 'undefined' ? window : globalThis);
