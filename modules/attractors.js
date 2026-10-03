/* Attractors — strange-attractor density plots. Millions of iterations of a 2D map are binned
   into a histogram and tone-mapped. A quality gate measures each parameter set (Lyapunov
   exponent, box-counting dimension, coverage) and nudges degenerate ones to a nearby good one;
   the measured numbers also name the character. The twist is Prism: three orbits at slightly
   split parameters printed as three inks, so the attractor's sensitivity shows as colour fringes. */
(function () {
  'use strict';
  const C = window.Cabinet;
  const TAU = Math.PI * 2;

  const FAMILIES = ['Clifford', 'De Jong', 'Svensson', 'Bedhead', 'Gumowski–Mira', 'Icon'];
  const USES = [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 0, 0], [1, 1, 1, 1], [1, 1, 1, 1]];
  const COEF_LABEL = [['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd'], ['a', 'b', '', ''], ['μ', 'α', 'x₀', 'y₀'], ['λ', 'α', 'β', 'γ']];

  /* ---------------- maps ----------------
     k = Float64Array [k0..k3, n, omega]; s = Float64Array [x, y] updated in place.
     One hot function keeps V8's feedback warm across analyses and renders. */
  function step(fam, s, k) {
    const x = s[0], y = s[1];
    switch (fam) {
      case 0: s[0] = Math.sin(k[0] * y) + k[2] * Math.cos(k[0] * x); s[1] = Math.sin(k[1] * x) + k[3] * Math.cos(k[1] * y); return;
      case 1: s[0] = Math.sin(k[0] * y) - Math.cos(k[1] * x); s[1] = Math.sin(k[2] * x) - Math.cos(k[3] * y); return;
      case 2: s[0] = k[3] * Math.sin(k[0] * x) - Math.sin(k[1] * y); s[1] = k[2] * Math.cos(k[0] * x) + Math.cos(k[1] * y); return;
      case 3: s[0] = Math.sin((x * y) / k[1]) * y + Math.cos(k[0] * x - y); s[1] = x + Math.sin(y) / k[1]; return;
      case 4: {
        const mu = k[0], al = k[1];
        const fx = mu * x + (2 * (1 - mu) * x * x) / (1 + x * x);
        const nx = y + al * (1 - 0.05 * y * y) * y + fx;
        s[0] = nx; s[1] = -x + mu * nx + (2 * (1 - mu) * nx * nx) / (1 + nx * nx);
        return;
      }
      default: {
        const n = k[4];
        let pr = 1, pi = 0;
        for (let i = 1; i < n; i++) { const t = pr * x - pi * y; pi = pr * y + pi * x; pr = t; }
        const p = k[0] + k[1] * (x * x + y * y) + k[2] * (x * pr - y * pi);
        s[0] = p * x - k[5] * y + k[3] * pr;
        s[1] = p * y + k[5] * x - k[3] * pi;
      }
    }
  }

  // slider values (a..d in −3..3) → actual coefficients and start point
  function coeffs(fam, a, b, c, d, P) {
    const k = new Float64Array(6);
    let x0 = 0.1, y0 = 0.1;
    k[4] = 1;
    switch (fam) {
      case 3: k[0] = a / 3; k[1] = b / 3; if (Math.abs(k[1]) < 0.06) k[1] = k[1] < 0 ? -0.06 : 0.06; x0 = 1; y0 = 1; break;
      case 4: k[0] = a / 3; k[1] = b * 0.01; x0 = c * 3; y0 = d * 3; break;
      case 5: k[0] = a * 0.9; k[1] = b; k[2] = c * 0.4; k[3] = d * 0.3; k[4] = Math.max(1, P.symmetry); k[5] = P.group === 1 ? 0 : 0.12; x0 = 0.01; y0 = 0.003; break;
      default: k[0] = a; k[1] = b; k[2] = c; k[3] = d;
    }
    return { k, x0, y0 };
  }

  /* ---------------- quality gate ---------------- */
  const S1 = new Float64Array(2), S2 = new Float64Array(2);
  const AX = new Float32Array(24000), AY = new Float32Array(24000), SRT = new Float32Array(24000);
  const G96 = new Uint16Array(96 * 96), G24 = new Uint8Array(24 * 24);
  function sorted(src, m) { SRT.set(src.subarray(0, m)); return SRT.subarray(0, m).sort(); }
  const qAt = (v, q) => v[Math.min(v.length - 1, Math.floor(q * v.length))];

  function analyse(fam, cf, M) {
    const k = cf.k;
    S1[0] = cf.x0; S1[1] = cf.y0;
    for (let i = 0; i < 600; i++) { step(fam, S1, k); if (!(Math.abs(S1[0]) + Math.abs(S1[1]) < 1e4)) return { ok: false, why: 'diverges' }; }
    const d0 = 1e-7;
    S2[0] = S1[0] + d0; S2[1] = S1[1];
    let ly = 0, hop = 0;
    for (let i = 0; i < M; i++) {
      const px = S1[0], py = S1[1];
      step(fam, S1, k); step(fam, S2, k);
      const x = S1[0], y = S1[1];
      if (!(Math.abs(x) + Math.abs(y) < 1e4)) return { ok: false, why: 'diverges' };
      let dx = S2[0] - x, dy = S2[1] - y, dd = Math.sqrt(dx * dx + dy * dy);
      if (!(dd > 0)) { dd = d0 * 1e-3; dx = dd; dy = 0; }
      ly += Math.log(dd / d0);
      S2[0] = x + (dx * d0) / dd; S2[1] = y + (dy * d0) / dd;
      AX[i] = x; AY[i] = y;
      hop += Math.abs(x - px) + Math.abs(y - py);
    }
    ly /= M;
    let v = sorted(AX, M);
    const bx0 = qAt(v, 0.002), bx1 = qAt(v, 0.998);
    v = sorted(AY, M);
    const by0 = qAt(v, 0.002), by1 = qAt(v, 0.998);
    const bw = bx1 - bx0, bh = by1 - by0;
    if (!(bw > 1e-6 && bh > 1e-6)) return { ok: false, why: 'collapses' };
    const L = Math.max(bw, bh), ox = (bx0 + bx1) / 2 - L / 2, oy = (by0 + by1) / 2 - L / 2;
    G96.fill(0); G24.fill(0);
    let n96 = 0, n24 = 0;
    for (let i = 0; i < M; i++) {
      const u = (AX[i] - ox) / L, v = (AY[i] - oy) / L;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const i96 = Math.floor(v * 96) * 96 + Math.floor(u * 96);
      if (!G96[i96]++) n96++;
      const i24 = Math.floor(v * 24) * 24 + Math.floor(u * 24);
      if (!G24[i24]) { G24[i24] = 1; n24++; }
    }
    let sum = 0, sum2 = 0;
    for (let i = 0; i < G96.length; i++) { const g = G96[i]; if (g) { sum += g; sum2 += g * g; } }
    const mean = sum / n96, cv = Math.sqrt(Math.max(0, sum2 / n96 - mean * mean)) / mean;
    const D = Math.log(n96 / Math.max(1, n24)) / Math.log(4);
    const cells = Math.ceil((bw / L) * 96) * Math.ceil((bh / L) * 96);
    const cov = n96 / cells;
    // radius about the bbox centre (for kaleidoscopes) and about the origin (for icons)
    const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
    for (let i = 0; i < M; i++) { const x = AX[i], y = AY[i], dx = x - cx, dy = y - cy; AX[i] = dx * dx + dy * dy; AY[i] = x * x + y * y; }
    const rc = Math.sqrt(qAt(sorted(AX, M), 0.997)), ro = Math.sqrt(qAt(sorted(AY, M), 0.997));
    const A = { ok: true, ly, D, cov, cv, n96, bx0, bx1, by0, by1, cx, cy, rc, ro, hop: hop / M };
    const chaotic = ly > 0.02 && D > 1.15;
    const dense = D > 1.4 && n96 > 1500;
    if (n96 < 450 || !(chaotic || dense)) { A.ok = false; A.why = n96 < 450 ? 'collapses' : 'too regular'; }
    else if (cov > 0.86 && cv < 0.42) { A.ok = false; A.why = 'noise'; }
    return A;
  }

  // how print-worthy a measured set is (for randomize)
  function beauty(A, fam, o) {
    if (!A.ok) return 0;
    let s = 1;
    // overlapping copies pile up: kaleidoscopes and icons want airy sets
    if (fam !== 5 && o.symmetry > 1) { if (A.cov > 0.45) s *= 0.4; if (A.cov > 0.6) s *= 0.3; }
    if (fam === 5 && A.cov > 0.56) s *= 0.4;
    if (A.D < 1.35) s *= 0.35; else if (A.D < 1.5) s *= 0.7;
    if (fam === 4 && (A.D < 1.55 || A.cov < 0.2)) s *= 0.2;
    if (fam === 5 && Math.max(A.bx1 - A.bx0, A.by1 - A.by0) / 2 / A.ro < 0.45) s *= 0.3;
    if (A.cov > 0.6) s *= 0.5;
    if (A.cov > 0.72) s *= 0.3;
    if (A.cov < 0.1) s *= 0.5;
    if (A.cv < 0.95) s *= 0.5;
    if (A.cv < 0.75) s *= 0.4;
    if (A.ly > 1.8) s *= 0.35;
    if (A.cv > 3) s *= 0.4;
    const asp = (A.bx1 - A.bx0) / (A.by1 - A.by0);
    if (asp > 4 || asp < 0.25) s *= 0.3;
    return s;
  }

  function characterOf(A) {
    if (!A || !A.ok) return 'Unsettled';
    if (A.ly < 0.06) return 'Shell';
    if (A.D < 1.45) return 'Filament';
    if (A.cov < 0.32) return 'Lace';
    if (A.cov > 0.66 && A.cv < 1.0) return 'Nebula';
    if (A.cv > 1.35) return 'Veil';
    return 'Silk';
  }

  const PRESETS = [
    [-1.4, 1.6, 1.0, 0.7], [1.4, -2.3, 2.4, -2.1], [1.4, 1.56, 1.4, -2.2],
    [-2.43, -2.76, 0, 0], [-1.488, 0.8, 0.3, 0.2], [-2.3, 2.0, 0.25, 0.33],
  ];

  // the set actually drawn: the sliders if they are good, else the nearest good set found by a
  // deterministic search, else the family's preset. Cached.
  const CACHE = new Map();
  function resolve(P) {
    const fam = P.family;
    const key = [fam, P.a, P.b, P.c, P.d, fam === 5 ? P.symmetry + ':' + P.group : ''].join('|');
    let r = CACHE.get(key);
    if (r) return r;
    let vals = [P.a, P.b, P.c, P.d];
    let cf = coeffs(fam, vals[0], vals[1], vals[2], vals[3], P);
    let A = analyse(fam, cf, 16000);
    let nudged = false;
    if (!A.ok) {
      const R = C.rng((Math.round((P.a + 3) * 1000) * 73856093) ^ (Math.round((P.b + 3) * 1000) * 19349663) ^ (Math.round((P.c + 3) * 1000) * 83492791) ^ (Math.round((P.d + 3) * 1000) * 2654435761) ^ fam);
      const use = USES[fam];
      let found = null;
      for (let t = 0; t < 140 && !found; t++) {
        const rad = 0.04 + t * 0.012;
        const v = vals.map((x, i) => (use[i] ? Math.max(-3, Math.min(3, Math.round((x + (R() * 2 - 1) * rad * 3) * 1000) / 1000)) : x));
        const c2 = coeffs(fam, v[0], v[1], v[2], v[3], P);
        const A2 = analyse(fam, c2, 6000);
        if (A2.ok) { const A3 = analyse(fam, c2, 16000); if (A3.ok) found = { v, cf: c2, A: A3 }; }
      }
      if (!found) {
        const v = PRESETS[fam].slice();
        const c2 = coeffs(fam, v[0], v[1], v[2], v[3], Object.assign({}, P, { symmetry: fam === 5 ? 5 : P.symmetry }));
        found = { v, cf: c2, A: analyse(fam, c2, 16000) };
      }
      vals = found.v; cf = found.cf; A = found.A; nudged = true;
    }
    r = { fam, vals, cf, A, nudged, character: characterOf(A) };
    if (CACHE.size > 400) CACHE.clear();
    CACHE.set(key, r);
    return r;
  }

  /* ---------------- colour ---------------- */
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const gam = (c) => { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(1, c)) * 255; };
  function toLab(hex) {
    const [r, g, b] = C.hex255(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromLab(L, A, B) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
  }
  // n RGB triples along a ramp (cyclic or not), mixed in OKLab
  function ramp(hexes, n, cyclic) {
    const labs = hexes.map(toLab), k = labs.length, out = [];
    for (let i = 0; i < n; i++) {
      const t = cyclic ? (i / n) * k : (i / (n - 1)) * (k - 1);
      let a = Math.floor(t), f = t - a;
      if (!cyclic && a >= k - 1) { a = k - 2; f = 1; }
      const b = cyclic ? (a + 1) % k : a + 1;
      a %= k;
      out.push(fromLab(labs[a][0] + (labs[b][0] - labs[a][0]) * f, labs[a][1] + (labs[b][1] - labs[a][1]) * f, labs[a][2] + (labs[b][2] - labs[a][2]) * f));
    }
    return out;
  }
  const pack = (r, g, b) => ((255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;

  const PALETTES = [
    { name: 'Synthwave', dark: true, bg: '#0b0221', ramp: ['#0b0221', '#2b0b5a', '#7b1fa2', '#ff2e97', '#ff9e5e', '#fff1c9'], hues: ['#ff2e97', '#ffb04a', '#3ee6ff', '#7b5cff'], prism: ['#ff2e97', '#26d9ff', '#ffc233'] },
    { name: 'Blackbody', dark: true, bg: '#050308', ramp: ['#050308', '#2c0a4f', '#7a1d6c', '#c43a4e', '#f07a26', '#fbc33a', '#fffbe0'], hues: ['#ff4a1c', '#ffc23a', '#ff2d6f', '#9b2cff'], prism: ['#ff3b1f', '#ffc43d', '#b0205a'] },
    { name: 'Neon', dark: true, bg: '#04050a', ramp: ['#04050a', '#07215e', '#0a5cff', '#00d9ff', '#b8fff4', '#ffffff'], hues: ['#ff1f7a', '#ffe600', '#00ff9c', '#00c8ff', '#b026ff'], prism: ['#ff2a55', '#20ff80', '#2a6bff'] },
    { name: 'Aurora', dark: true, bg: '#02090f', ramp: ['#02090f', '#063346', '#067b73', '#27d3a0', '#c6f67a', '#f7fff0'], hues: ['#1ee3a4', '#1a8fd6', '#ef4f7a', '#ffd166'], prism: ['#22e3a0', '#2f7dff', '#ff4f8a'] },
    { name: 'Gold leaf', dark: true, bg: '#0b0907', ramp: ['#0b0907', '#2e2110', '#6f4d1c', '#b8862f', '#e9c877', '#fff7df'], hues: ['#e3b04b', '#fff0c2', '#a8672a', '#d9a441'], prism: ['#ffcf6b', '#f2e6c2', '#c46a2a'] },
    { name: 'Cyanotype', dark: true, bg: '#0f335c', ramp: ['#0f335c', '#1a4878', '#3f73a6', '#9cc0de', '#e9f2f8', '#ffffff'], hues: ['#ffffff', '#9fd0f2', '#d6e6f3', '#6fa6d6'], prism: ['#b9e2ff', '#ffffff', '#6f9ee0'] },
    { name: 'Graphite', dark: false, bg: '#f1eee7', ramp: ['#f1eee7', '#c9c5bc', '#8d8981', '#4a4844', '#1c1b1a', '#050505'], hues: ['#2d2c2a', '#6a5238', '#34495a', '#57483f'], prism: ['#00a0c6', '#e0457b', '#f2c500'] },
    { name: 'Porcelain', dark: false, bg: '#f5f2ea', ramp: ['#f5f2ea', '#c9d3e6', '#6d86c0', '#23459a', '#0f2466', '#07123a'], hues: ['#1f3f95', '#3c6fc2', '#0d1f5c', '#5b4fa8'], prism: ['#2a52b8', '#6fb8e6', '#1a1f5c'] },
    { name: 'Risograph', dark: false, bg: '#f3eee2', ramp: ['#f3eee2', '#ffc2de', '#ff48b0', '#a8468f', '#0078bf', '#16305e'], hues: ['#ff48b0', '#0078bf', '#ffb800', '#00a95c'], prism: ['#ff48b0', '#0078bf', '#ffe800'] },
  ];
  PALETTES.forEach((p) => { p.colors = p.ramp.slice(2, 6).concat([p.bg]); });

  const COLOURINGS = ['Density', 'Velocity', 'Direction', 'Prism'];
  const SYM_NAMES = ['None', 'Twofold', 'Trefoil', 'Quatrefoil', 'Cinquefoil', 'Hexafoil', 'Septfoil', 'Octofoil'];

  /* ---------------- accumulation ---------------- */
  // hits per pixel on average (exposure) → iterations; icons & kaleidoscopes plot several copies each step
  function copiesOf(P) { return P.symmetry <= 1 ? 1 : P.symmetry * (P.group === 1 ? 2 : 1); }
  function setupAccum(P, W, H, res) {
    const fam = res.fam, A = res.A, chans = P.colouring === 3 ? 3 : 1;
    const ncopy = copiesOf(P);
    // view: map attractor coords → pixels
    let M = [];
    if (fam === 5 || P.symmetry > 1) {
      const cx = fam === 5 ? 0 : A.cx, cy = fam === 5 ? 0 : A.cy;
      let r = A.rc;
      if (fam === 5) r = A.ro * 1.01;
      const sc = (P.framing * Math.min(W, H)) / (2 * r);
      // an icon's map is n-fold equivariant, so the rotated copies are its conjugate attractors
      const n = Math.max(1, P.symmetry), mir = P.group === 1 && n > 1;
      const base = fam === 5 ? -Math.PI / 2 : 0;
      for (let m = 0; m < (mir ? 2 : 1); m++) for (let i = 0; i < n; i++) {
        const th = base + (i * TAU) / n, c = Math.cos(th) * sc, s = Math.sin(th) * sc, f = m ? -1 : 1;
        // p' = R(th) * diag(1, f) * (p - c) + centre
        const m00 = c, m01 = -s * f, m10 = s, m11 = c * f;
        M.push([m00, m01, m10, m11, W / 2 - (m00 * cx + m01 * cy), H / 2 - (m10 * cx + m11 * cy)]);
      }
    } else {
      const bw = A.bx1 - A.bx0, bh = A.by1 - A.by0, cx = (A.bx0 + A.bx1) / 2, cy = (A.by0 + A.by1) / 2;
      const s0 = Math.min(W / bw, H / bh), s1 = Math.min(W / bh, H / bw);
      const rot = s1 > s0 * 1.12;
      const sc = (rot ? s1 : s0) * P.framing * 0.94;
      const m = rot ? [0, -sc, sc, 0] : [sc, 0, 0, -sc];   // y up
      M.push([m[0], m[1], m[2], m[3], W / 2 - (m[0] * cx + m[1] * cy), H / 2 - (m[2] * cx + m[3] * cy)]);
    }
    const mats = new Float64Array(M.length * 6);
    M.forEach((r, i) => mats.set(r, i * 6));
    // prism: three orbits at parameters split along a seeded direction
    const ks = [];
    const Rr = C.rng((P.seed ^ 0x6d2b79f5) >>> 0);
    let dir = USES[fam].map((u) => (u ? Rr.gauss() : 0));
    const dn = Math.hypot(...dir) || 1;
    dir = dir.map((v) => v / dn);
    for (let ch = 0; ch < chans; ch++) {
      const o = chans === 1 ? 0 : (ch - 1) * P.spread * 0.03;
      const v = res.vals.map((x, i) => x + dir[i] * o);
      ks.push(coeffs(fam, v[0], v[1], v[2], v[3], P));
    }
    const N = W * H;
    const acc = {
      W, H, fam, mats, ncopy: M.length, chans, mode: P.colouring,
      cnt: [], cs: null, sn: null,
      // start exactly where the analysis started, so coexisting attractors can't swap in
      states: ks.map((c) => { const s = new Float64Array([c.x0, c.y0]); for (let i = 0; i < 600; i++) step(fam, s, c.k); return s; }),
      ks: ks.map((c) => c.k),
      hopNorm: 1 / (A.hop * 2.2 + 1e-9),
      done: 0,
      target: Math.round(((P.exposure * N) / M.length) * (chans === 3 ? 0.55 : 1)),
    };
    for (let ch = 0; ch < chans; ch++) acc.cnt.push(new Float32Array(N));
    if (P.colouring === 1 || P.colouring === 2) { acc.cs = new Float32Array(N); if (P.colouring === 2) acc.sn = new Float32Array(N); }
    return acc;
  }

  // run n iterations (per channel)
  function accumulate(acc, n) {
    const { W, H, fam, mats, ncopy } = acc;
    for (let ch = 0; ch < acc.chans; ch++) {
      const s = acc.states[ch], k = acc.ks[ch], cnt = acc.cnt[ch], cs = acc.cs, sn = acc.sn, mode = acc.mode, hn = acc.hopNorm;
      for (let i = 0; i < n; i++) {
        const px = s[0], py = s[1];
        step(fam, s, k);
        const x = s[0], y = s[1];
        if (!(Math.abs(x) + Math.abs(y) < 1e4)) { s[0] = 0.1 + i * 1e-7; s[1] = 0.1; continue; }
        let hx = x - px, hy = y - py, hl = 0;
        if (mode === 2) { hl = Math.sqrt(hx * hx + hy * hy) || 1; hx /= hl; hy /= hl; }
        else if (mode === 1) hl = Math.min(1, (Math.abs(hx) + Math.abs(hy)) * hn);
        for (let c = 0, o = 0; c < ncopy; c++, o += 6) {
          const u = mats[o] * x + mats[o + 1] * y + mats[o + 4], v = mats[o + 2] * x + mats[o + 3] * y + mats[o + 5];
          if (u < 0 || v < 0 || u >= W || v >= H) continue;
          const idx = (v | 0) * W + (u | 0);
          cnt[idx] += 1;
          if (mode === 2) {
            const dx = mats[o] * hx + mats[o + 1] * hy, dy = mats[o + 2] * hx + mats[o + 3] * hy;
            const dl = Math.sqrt(dx * dx + dy * dy) || 1;
            cs[idx] += dx / dl; sn[idx] += dy / dl;
          } else if (mode === 1) cs[idx] += hl;
        }
      }
    }
    acc.done += n;
  }

  /* ---------------- tone mapping ---------------- */
  const QS = new Float32Array(30000);
  function refLevel(cnt) {
    const N = cnt.length, st = Math.max(1, Math.floor(N / 120000));
    let m = 0;
    for (let i = (st >> 1); i < N && m < QS.length; i += st) if (cnt[i] > 0) QS[m++] = cnt[i];
    if (m < 10) return [1, 1];
    const v = QS.subarray(0, m).sort();
    // cap the range at a few decades above the median so concentrated sets don't vanish
    const p998 = v[Math.floor(0.998 * (m - 1))], p90 = v[Math.floor(0.9 * (m - 1))], med = v[m >> 1];
    return [Math.max(1, Math.min(p998, Math.max(p90, med * 90))), med];
  }
  // count → 0..1 tone (log with knee, then gamma), as a lookup table over integer counts
  function toneLUT([ref, med], gammaV) {
    const size = Math.min(1 << 20, Math.ceil(ref) + 2);
    const lut = new Float32Array(size);
    const knee = Math.max(0.25, Math.min(ref / 70, med * 0.8));
    const den = Math.log(1 + ref / knee);
    for (let c = 1; c < size; c++) lut[c] = Math.pow(Math.min(1, Math.log(1 + c / knee) / den), gammaV);
    return lut;
  }

  function makeLook(P) {
    const pal = PALETTES[P.palette] || PALETTES[0];
    const bg = C.hex255(pal.bg);
    const look = { pal, bg, dark: pal.dark };
    look.rampC = ramp(pal.ramp, 1024, false).map((c) => pack(c[0], c[1], c[2]));
    const hues = ramp(pal.hues, 64, true);
    // hue × tone table
    const T = new Uint32Array(64 * 65);
    for (let h = 0; h < 64; h++) for (let t = 0; t <= 64; t++) {
      const e = t / 64, hc = hues[h];
      let r, g, b;
      if (pal.dark) {
        const a = Math.min(1, e * 1.3), w = Math.max(0, (e - 0.8) / 0.2) * 0.75;
        r = bg[0] + (hc[0] - bg[0]) * a; g = bg[1] + (hc[1] - bg[1]) * a; b = bg[2] + (hc[2] - bg[2]) * a;
        r += (255 - r) * w; g += (255 - g) * w; b += (255 - b) * w;
      } else {
        const a = Math.min(1, e * 1.15), dk = Math.max(0, (e - 0.75) / 0.25) * 0.55;
        r = (bg[0] + (hc[0] - bg[0]) * a) * (1 - dk); g = (bg[1] + (hc[1] - bg[1]) * a) * (1 - dk); b = (bg[2] + (hc[2] - bg[2]) * a) * (1 - dk);
      }
      T[h * 65 + t] = pack(r, g, b);
    }
    look.hueT = T;
    look.prism = pal.prism.map((h) => { const c = C.hex255(h); return [c[0], c[1], c[2], c[0] / 255, c[1] / 255, c[2] / 255]; });
    return look;
  }

  // accumulator → ImageData (with glow computed at quarter resolution), in two stages so each
  // fits a frame: tones (+ glow source and blur), then compose
  function tonemap(acc, P, look, img, scratch) { toneStage(acc, P, scratch); composeStage(acc, P, look, img, scratch); }
  function toneStage(acc, P, scratch) {
    const { W, H } = acc, N = W * H;
    const gammaV = 1 / P.gamma;
    const chans = acc.chans;
    const glow = P.glow;
    const gw = Math.ceil(W / 4), gh = Math.ceil(H / 4);
    let G = null;
    if (glow > 0.01) {
      G = scratch.g && scratch.g.length === gw * gh ? scratch.g : (scratch.g = new Float32Array(gw * gh));
      G.fill(0);
    }
    // per-channel tone (log with knee + gamma, via LUT); accumulate the glow source on the way
    const tones = [];
    for (let ch = 0; ch < chans; ch++) {
      const cnt = acc.cnt[ch], lut = toneLUT(refLevel(cnt), gammaV), L = lut.length - 1;
      const T = scratch.t[ch] && scratch.t[ch].length === N ? scratch.t[ch] : (scratch.t[ch] = new Float32Array(N));
      for (let y = 0, i = 0; y < H; y++) {
        const gy = (y >> 2) * gw;
        for (let x = 0; x < W; x++, i++) {
          const c = cnt[i];
          const t = c <= 0 ? 0 : c >= L ? 1 : lut[c | 0];
          T[i] = t;
          if (G !== null && t > 0) G[gy + (x >> 2)] += t;
        }
      }
      tones.push(T);
    }
    if (G) {
      const tmp = scratch.g2 && scratch.g2.length === gw * gh ? scratch.g2 : (scratch.g2 = new Float32Array(gw * gh));
      const norm = 1 / (16 * chans);
      for (let i = 0; i < G.length; i++) G[i] *= norm;
      const r = Math.max(1, Math.round(gh * 0.018));
      for (let pass = 0; pass < 3; pass++) { boxBlur(G, tmp, gw, gh, r, true); boxBlur(tmp, G, gw, gh, r, false); }
      if (!scratch.X0 || scratch.X0.length !== W) {
        scratch.X0 = new Int32Array(W); scratch.X1 = new Int32Array(W); scratch.AX = new Float32Array(W);
        for (let x = 0; x < W; x++) {
          const fx = (x + 0.5) / 4 - 0.5, x0 = Math.floor(fx);
          scratch.AX[x] = fx - x0;
          scratch.X0[x] = Math.max(0, Math.min(gw - 1, x0)); scratch.X1[x] = Math.max(0, Math.min(gw - 1, x0 + 1));
        }
      }
    }
    scratch.tones = tones; scratch.G = G;
  }
  function composeStage(acc, P, look, img, scratch) {
    const { W, H } = acc, out = new Uint32Array(img.data.buffer);
    const tones = scratch.tones, G = scratch.G, glow = P.glow;
    const gw = Math.ceil(W / 4), gh = Math.ceil(H / 4);
    const X0 = scratch.X0, X1 = scratch.X1, AXw = scratch.AX;
    const gk = glow * 1.6;
    const mode = P.colouring;
    const T0 = tones[0], T1 = tones[1], T2 = tones[2];
    const [p0, p1, p2] = look.prism, bg = look.bg, dark = look.dark;
    const cnt = acc.cnt[0], rampC = look.rampC, hueT = look.hueT, cs = acc.cs, sn = acc.sn;
    const cyc = 1 + Math.round(P.spread * 2), vgain = 0.6 + P.spread * 1.6;
    for (let y = 0; y < H; y++) {
      let ra = 0, rb = 0, ay = 0;
      if (G) {
        const fy = (y + 0.5) / 4 - 0.5, y0 = Math.floor(fy);
        ay = fy - y0;
        ra = Math.max(0, Math.min(gh - 1, y0)) * gw; rb = Math.max(0, Math.min(gh - 1, y0 + 1)) * gw;
      }
      for (let x = 0, i = y * W; x < W; x++, i++) {
        let g = 0;
        if (G !== null) {
          const ax = AXw[x], a0 = G[ra + X0[x]], a1 = G[ra + X1[x]], b0 = G[rb + X0[x]], b1 = G[rb + X1[x]];
          const top = a0 + (a1 - a0) * ax, bot = b0 + (b1 - b0) * ax;
          g = (top + (bot - top) * ay) * gk;
        }
        if (mode === 3) {
          let a = T0[i] + g, b = T1[i] + g, c = T2[i] + g;
          if (a > 1) a = 1; if (b > 1) b = 1; if (c > 1) c = 1;
          let r, gg, bb;
          if (dark) {
            a *= 0.72; b *= 0.72; c *= 0.72;
            r = bg[0] + a * p0[0] + b * p1[0] + c * p2[0]; gg = bg[1] + a * p0[1] + b * p1[1] + c * p2[1]; bb = bg[2] + a * p0[2] + b * p1[2] + c * p2[2];
            const m = r > gg ? (r > bb ? r : bb) : (gg > bb ? gg : bb);
            if (m > 255) { const k = ((m - 255) / m) * 0.6; r += (255 - r) * k; gg += (255 - gg) * k; bb += (255 - bb) * k; }
            if (r > 255) r = 255; if (gg > 255) gg = 255; if (bb > 255) bb = 255;
          } else {
            const f0 = 1 - Math.pow(a, 1.25) * 0.76, f1 = 1 - Math.pow(b, 1.25) * 0.76, f2 = 1 - Math.pow(c, 1.25) * 0.76;
            r = bg[0] * (f0 + (1 - f0) * p0[3]) * (f1 + (1 - f1) * p1[3]) * (f2 + (1 - f2) * p2[3]);
            gg = bg[1] * (f0 + (1 - f0) * p0[4]) * (f1 + (1 - f1) * p1[4]) * (f2 + (1 - f2) * p2[4]);
            bb = bg[2] * (f0 + (1 - f0) * p0[5]) * (f1 + (1 - f1) * p1[5]) * (f2 + (1 - f2) * p2[5]);
          }
          out[i] = ((255 << 24) | (bb << 16) | (gg << 8) | r) >>> 0;
          continue;
        }
        let t = T0[i] + g;
        if (t > 1) t = 1;
        if (mode === 0) { out[i] = rampC[(t * 1023) | 0]; continue; }
        if (cnt[i] === 0) { out[i] = hueT[(t * 64) | 0]; continue; }
        let h;
        if (mode === 2) { const a = Math.atan2(sn[i], cs[i]) / TAU + 0.5; h = ((a * cyc) % 1) * 64; }
        else { h = Math.min(0.999, Math.pow(cs[i] / cnt[i], 1 / vgain)) * 64; }
        out[i] = hueT[(h | 0) * 65 + ((t * 64) | 0)];
      }
    }
  }
  // 2×2-binned view of an accumulator for quick progressive previews
  function binned(acc, S) {
    const W = acc.W >> 1, H = acc.H >> 1, N = W * H, W0 = acc.W;
    const bin = (src, key) => {
      const d = S[key] && S[key].length === N ? S[key] : (S[key] = new Float32Array(N));
      for (let y = 0, i = 0; y < H; y++) {
        const r0 = 2 * y * W0, r1 = r0 + W0;
        for (let x = 0; x < W; x++, i++) { const j = 2 * x; d[i] = src[r0 + j] + src[r0 + j + 1] + src[r1 + j] + src[r1 + j + 1]; }
      }
      return d;
    };
    return {
      W, H, chans: acc.chans,
      cnt: acc.cnt.map((c, i) => bin(c, 'bc' + i)),
      cs: acc.cs ? bin(acc.cs, 'bcs') : null, sn: acc.sn ? bin(acc.sn, 'bsn') : null,
    };
  }
  function boxBlur(src, dst, w, h, r, horiz) {
    const inv = 1 / (2 * r + 1);
    if (horiz) {
      for (let y = 0; y < h; y++) {
        const row = y * w; let acc = 0;
        for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
          dst[row + x] = acc * inv;
          acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
        }
      }
    } else {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += src[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
          dst[y * w + x] = acc * inv;
          acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x];
        }
      }
    }
  }

  const accKey = (P) => [P.seed, P.format, P.family, P.a, P.b, P.c, P.d, P.symmetry, P.group, P.exposure, P.framing, P.colouring, P.spread].join('|');

  /* ---------------- internal resolution ---------------- */
  const PIX = 1.0e6;
  function internalSize(P) {
    const a = C.FORMATS[P.format].a;
    const H = Math.round(Math.sqrt(PIX / a));
    return [Math.round(H * a), H];
  }

  /* ---------------- params ---------------- */
  const PARAMS = [
    { k: 'family', g: 'Map', label: 'Family', type: 'select', options: FAMILIES, def: 0 },
    { k: 'a', g: 'Map', label: 'a', min: -3, max: 3, step: 0.001, def: -1.4 },
    { k: 'b', g: 'Map', label: 'b', min: -3, max: 3, step: 0.001, def: 1.6 },
    { k: 'c', g: 'Map', label: 'c', min: -3, max: 3, step: 0.001, def: 1.0 },
    { k: 'd', g: 'Map', label: 'd', min: -3, max: 3, step: 0.001, def: 0.7 },
    { k: 'symmetry', g: 'Symmetry', label: 'Symmetry', min: 1, max: 8, step: 1, def: 1 },
    { k: 'group', g: 'Symmetry', label: 'Group', type: 'select', options: ['Cyclic', 'Dihedral'], def: 0 },
    { k: 'exposure', g: 'Exposure', label: 'Density', min: 2, max: 60, step: 1, def: 16, names: [[2, 'Grainy'], [6, 'Fine grain'], [14, 'Smooth'], [32, 'Silken']] },
    { k: 'gamma', g: 'Exposure', label: 'Gamma', min: 0.4, max: 3, step: 0.05, def: 1.1, names: [[0.4, 'Inky'], [0.8, 'Deep'], [1.05, 'Balanced'], [1.5, 'Lifted'], [2.2, 'Luminous']] },
    { k: 'glow', g: 'Exposure', label: 'Glow', min: 0, max: 1, step: 0.01, def: 0.18, names: [[0, 'None'], [0.08, 'Halation'], [0.35, 'Bloom'], [0.7, 'Corona']] },
    { k: 'framing', g: 'Exposure', label: 'Framing', min: 0.5, max: 1.4, step: 0.01, def: 0.86, names: [[0.5, 'Floating'], [0.72, 'Matted'], [0.95, 'Filling'], [1.12, 'Cropped']] },
    { k: 'colouring', g: 'Colour', label: 'Colouring', type: 'select', options: COLOURINGS, def: 3 },
    { k: 'spread', g: 'Colour', label: 'Spread', min: 0, max: 1, step: 0.01, def: 0.6 },
  ];
  const PB = Object.fromEntries(PARAMS.map((p) => [p.k, p]));
  const fmt = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(3);
  function effective(res, i) {
    const k = res.cf.k;
    switch (res.fam) {
      case 3: return k[i];
      case 4: return i < 2 ? k[i] : [res.cf.x0, res.cf.y0][i - 2];
      default: return k[i];
    }
  }
  function symName(P) {
    if (P.symmetry <= 1) return P.family === 5 ? 'Asymmetric' : 'None';
    const w = SYM_NAMES[P.symmetry - 1];
    return P.group === 1 ? `${w}, mirrored` : w;
  }
  function spreadName(P) {
    if (P.colouring === 0) return '— (Prism, hue modes)';
    if (P.colouring === 3) return C.nameFrom({ names: [[0, 'Aligned'], [0.12, 'Fringed'], [0.45, 'Split'], [0.8, 'Scattered']] }, P.spread) + ` · Δ${(P.spread * 0.03).toFixed(3)}`;
    if (P.colouring === 2) return ['One turn', 'Two turns', 'Three turns'][Math.round(P.spread * 2)];
    return C.nameFrom({ names: [[0, 'Soft'], [0.4, 'Graded'], [0.75, 'Hard']] }, P.spread);
  }

  C.register({
    id: 'attractors',
    name: 'Attractors',
    group: 'classic',
    order: 3,
    renderer: '2d',
    animated: true,
    restartDelay: 120,
    subtitle: 'Strange attractor exposures',
    about: 'A point is sent millions of times through a small trigonometric map (Clifford Pickover’s, Peter de Jong’s, Johnny Svensson’s, Ivan Emke’s Bedhead, Gumowski and Mira’s, or Field and Golubitsky’s symmetric icons) and every landing is counted, like a long photographic exposure. Each parameter set is measured first: its Lyapunov exponent, fractal dimension and coverage decide whether it is chaotic enough to draw, and name its character; degenerate sets are nudged to the nearest good one. Prism runs three orbits at slightly split parameters as three inks, so the colour fringes show where the attractor is sensitive.',
    formats: [0, 1, 2, 3],
    formatOdds: [2, 3, 1.5, 0.6],
    defaults: { seed: 1, format: 1, palette: 0 },
    palettes: PALETTES,
    paletteOdds: [2, 1.6, 1.6, 1.2, 1.3, 1, 1.2, 1, 1.2],
    params: PARAMS,

    randomize(R) {
      const fam = C.pickWeighted(R, [3, 2.4, 2, 1, 1, 1.8]);
      const o = { family: fam };
      o.symmetry = fam === 5 ? R.pick([3, 3, 4, 5, 5, 6, 7, 8]) : R.chance(0.6) ? 1 : R.pick([2, 3, 3, 4, 5, 6, 8]);
      o.group = R.chance(fam === 5 ? 0.6 : 0.35) ? 1 : 0;
      o.colouring = C.pickWeighted(R, [3, 1.4, 2, 2.4]);
      o.palette = C.pickWeighted(R, [2, 1.6, 1.6, 1.2, 1.3, 1, 1.2, 1, 1.2]);
      o.spread = o.colouring === 3 ? (R.chance(0.2) ? R.range(0.12, 0.35) : R.range(0.35, 1)) : R.range(0.1, 0.9);
      o.exposure = Math.round(R.chance(0.15) ? R.range(3, 7) : R.range(9, 24));
      o.gamma = PALETTES[o.palette].dark ? R.range(0.85, 1.6) : R.range(0.8, 1.4);
      o.glow = R.chance(0.3) ? R.range(0, 0.08) : R.range(0.15, 0.6);
      o.framing = o.symmetry > 1 || fam === 5 ? R.range(0.82, 1.02) : R.chance(0.15) ? R.range(1.05, 1.3) : R.range(0.78, 0.98);
      // search for a good, print-worthy set
      let best = null, bs = 0, bestA = null;
      for (let t = 0; t < 160 && bs < 0.99; t++) {
        const v = [0, 1, 2, 3].map(() => Math.round(R.range(-3, 3) * 1000) / 1000);
        if (fam === 3) { v[0] = Math.round(R.range(-2.5, 2.5) * 1000) / 1000; v[1] = Math.round((R() < 0.5 ? -1 : 1) * R.range(2.1, 3) * 1000) / 1000; }
        if (fam === 4) { v[1] = Math.round(R.range(0.3, 1) * 1000) / 1000; v[2] = Math.round(R.range(-1.5, 1.5) * 1000) / 1000; v[3] = Math.round(R.range(-1.5, 1.5) * 1000) / 1000; }
        const cf = coeffs(fam, v[0], v[1], v[2], v[3], o);
        const A = analyse(fam, cf, 6000);
        if (!A.ok) continue;
        const A2 = analyse(fam, cf, 16000);
        const s = beauty(A2, fam, o) * (0.85 + 0.15 * R());
        if (s > bs) { bs = s; best = v; bestA = A2; }
      }
      if (best) { o.a = best[0]; o.b = best[1]; o.c = best[2]; o.d = best[3]; if (bestA.cov < 0.35 && o.framing > 1) o.framing = R.range(0.8, 0.95); }
      else { const v = PRESETS[fam]; o.a = v[0]; o.b = v[1]; o.c = v[2]; o.d = v[3]; if (fam === 5) o.symmetry = 5; }
      return o;
    },

    traitName(k, P) {
      if (k === 'family') return `${FAMILIES[P.family]} · ${resolve(P).character}`;
      if (k === 'a' || k === 'b' || k === 'c' || k === 'd') {
        const i = 'abcd'.indexOf(k), res = resolve(P);
        if (!USES[P.family][i]) return '— unused';
        const v = effective(res, i), lab = COEF_LABEL[P.family][i];
        return `${lab === k ? '' : lab + ' '}${fmt(v)}${res.nudged ? ' (nudged)' : ''}`;
      }
      if (k === 'symmetry') return symName(P);
      if (k === 'group') return P.family === 5 ? (P.group === 1 ? 'Dihedral (ω = 0)' : 'Cyclic (ω = 0.12)') : P.symmetry <= 1 ? '— (no symmetry)' : ['Cyclic', 'Dihedral'][P.group];
      if (k === 'spread') return spreadName(P);
      return null;
    },
    caption(P) {
      const res = resolve(P);
      const sym = P.family === 5 ? `${P.symmetry}-fold ` : P.symmetry > 1 ? `${SYM_NAMES[P.symmetry - 1].toLowerCase()} ` : '';
      const col = ['', ', coloured by velocity', ', coloured by heading', ', split into three inks'][P.colouring];
      const head = `${sym}${FAMILIES[P.family]}`;
      return `${/^[aeiou]/i.test(head) ? 'An' : 'A'} ${head} attractor of ${res.character.toLowerCase()} character in ${PALETTES[P.palette].name}${col}.`;
    },
    sheet(P) {
      const res = resolve(P), A = res.A;
      const co = [0, 1, 2, 3].filter((i) => USES[P.family][i]).map((i) => (P.family <= 3 ? '' : COEF_LABEL[P.family][i] + ' ') + fmt(effective(res, i))).join(', ');
      return [
        ['Family', FAMILIES[P.family]],
        ['Character', res.character],
        ['Coefficients', co + (res.nudged ? ' (nudged)' : '')],
        ['Lyapunov λ', A.ok ? A.ly.toFixed(3) + ' per step' : '—'],
        ['Dimension', A.ok ? `≈ ${A.D.toFixed(2)}` : '—'],
        ['Coverage', A.ok ? `${Math.round(A.cov * 100)}%` : '—'],
        ['Symmetry', symName(P)],
        ['Colouring', COLOURINGS[P.colouring]],
        ['Density', `${C.nameFrom(PB.exposure, P.exposure)} (${P.exposure} hits/px)`],
        ['Glow', C.nameFrom(PB.glow, P.glow)],
        ['Palette', PALETTES[P.palette].name],
      ];
    },

    setup() { return { scratch: { t: [] }, half: { t: [] } }; },
    start(p, P, st) {
      // a change of palette, gamma or glow only re-tones a finished exposure; Replay re-exposes
      const key = accKey(P), same = st.lastP && JSON.stringify(st.lastP) === JSON.stringify(P);
      st.look = makeLook(P);
      st.frameN = 0;
      if (!same && st.acc && st.accKey === key && st.acc.done >= st.acc.target) st.phase = 'tone';
      else { st.res = null; st.acc = null; st.phase = 'init'; }
      st.accKey = key; st.lastP = Object.assign({}, P);
    },
    frame(p, P, st) {
      const more = C.budget(10);
      const blit = (cv) => {
        const ctx = p.drawingContext;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(cv, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      };
      const canvasFor = (key, W, H) => {
        let o = st[key];
        if (!o || o.cv.width !== W || o.cv.height !== H) {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const cx = cv.getContext('2d');
          o = st[key] = { cv, cx, img: cx.createImageData(W, H) };
        }
        return o;
      };
      if (st.phase === 'init') {
        st.res = resolve(P);
        const [W, H] = internalSize(P);
        st.acc = setupAccum(P, W, H, st.res);
        const ctx = p.drawingContext; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = st.look.pal.bg; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
        st.phase = 'acc';
        return true;
      }
      const acc = st.acc;
      if (st.phase === 'acc') {
        st.frameN++;
        if (st.frameN % 4 === 0) {
          const b = binned(acc, st.half);
          const o = canvasFor('halfCv', b.W, b.H);
          tonemap(b, P, st.look, o.img, st.half);
          o.cx.putImageData(o.img, 0, 0);
          blit(o.cv);
        } else {
          while (acc.done < acc.target && more()) accumulate(acc, Math.min(20000, acc.target - acc.done));
        }
        if (acc.done >= acc.target) st.phase = 'tone';
        return true;
      }
      if (st.phase === 'tone') { toneStage(acc, P, st.scratch); st.phase = 'compose'; return true; }
      const o = canvasFor('fullCv', acc.W, acc.H);
      composeStage(acc, P, st.look, o.img, st.scratch);
      o.cx.putImageData(o.img, 0, 0);
      blit(o.cv);
      st.phase = 'done';
      return false;
    },
    progress(st) { return st.acc ? st.acc.done / st.acc.target : 0; },
    exportAt(p, P, W, H) {
      return new Promise((resolveP) => {
        const res = resolve(P);
        const acc = setupAccum(P, W, H, res);
        const [iw, ih] = internalSize(P);
        // keep grain similar to the preview without scaling iterations by the full pixel ratio
        acc.target = Math.round(acc.target * Math.pow((iw * ih) / (W * H), 0.35));
        const look = makeLook(P);
        const tick = () => {
          const t0 = performance.now();
          while (acc.done < acc.target && performance.now() - t0 < 60) accumulate(acc, Math.min(50000, acc.target - acc.done));
          if (acc.done < acc.target) { setTimeout(tick, 0); return; }
          const c = document.createElement('canvas'); c.width = W; c.height = H;
          const cx = c.getContext('2d'), img = cx.createImageData(W, H);
          tonemap(acc, P, look, img, { t: [] });
          cx.putImageData(img, 0, 0);
          resolveP(c);
        };
        tick();
      });
    },
  });
})();
