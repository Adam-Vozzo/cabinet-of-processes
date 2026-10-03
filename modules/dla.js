/* DLA — diffusion-limited aggregation (Witten & Sander 1981). Random walkers
   are released just outside the aggregate and wander until they touch it; they
   stick with the sticking probability, otherwise they keep walking. Walkers far
   from the aggregate take long jumps (outside its radius, and inside empty
   4/16/64-cell blocks), which is statistically the same as walking there.
   The lattice has a fixed resolution per format, so a recipe looks the same at
   any screen size; drawing is vector so exports are crisp. */
(function () {
  'use strict';
  const C = window.Cabinet;
  const TAU = Math.PI * 2;

  const SEEDS = ['Point', 'Frost', 'Rim', 'Scatter', 'Fracture'];
  const RENDERS = ['Dots', 'Lines'];

  // stops run from the first particles to arrive to the last
  const PALETTES = [
    { name: 'Manganese dendrite', colors: ['#17100b', '#4a3120', '#8a6a48', '#e9dcc0'], bg: '#e9dcc0', stops: ['#120b07', '#2c1d12', '#4a3120', '#6d5036'], limestone: true, rule: '#5b4630' },
    { name: 'Frost on window', colors: ['#f4fbff', '#9cc6e4', '#4d7697', '#162332'], bg: '#162332', stops: ['#ffffff', '#d7ecfa', '#9cc6e4', '#5f8fb4'], glow: 0.55, dark: true, glass: true, rule: '#4d6a84' },
    { name: 'Copper electrodeposit', colors: ['#ffc58a', '#c8662e', '#6a2a12', '#0f3340'], bg: '#0f3340', stops: ['#3f170a', '#8a3a18', '#c8662e', '#f0a060', '#ffd9a8'], glow: 0.3, dark: true, rule: '#2f6b7b' },
    { name: 'Neon', colors: ['#18f0ff', '#ff2bd6', '#ffe93b', '#07060f'], bg: '#07060f', stops: ['#ffe93b', '#ff2bd6', '#7b3cff', '#18f0ff'], glow: 0.7, dark: true, rule: '#3a2a66' },
    { name: 'Cyanotype', colors: ['#f6f2e4', '#b9cde2', '#1f4f8a', '#16386b'], bg: '#1a4178', stops: ['#fbf8ee', '#e8eef0', '#bfd2e6'], dark: true, cyanotype: true, rule: '#8fb0d6' },
    { name: 'Tree of Diana', colors: ['#f5f5f2', '#a9adb5', '#5c616b', '#0d0d10'], bg: '#0d0d10', stops: ['#ffffff', '#d9dbe0', '#a9adb5', '#6d727c'], glow: 0.25, dark: true, rule: '#3a3c44' },
    { name: 'Lichtenberg', colors: ['#fff1c1', '#ffb347', '#c2541b', '#1a1109'], bg: '#1a1109', stops: ['#fff6d8', '#ffd27a', '#ff9a3c', '#c2541b'], glow: 0.6, dark: true, rule: '#5a3a1a' },
  ];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function gradRGB(stops, t) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    const A = hexRGB(stops[i]), B = hexRGB(stops[i + 1]);
    return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
  }
  const css = (c, a) => a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  /* ------------------------------------------------------------------ ground */
  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const n = 256, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n), R = C.rng(4421);
    for (let i = 0; i < n * n; i++) { const v = 128 + (R() + R() + R() - 1.5) * 70; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return (GRAIN = c);
  }
  function ground(ctx, pal, W, H, seed) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    const R = C.rng(seed ^ 0x3c6e);
    if (pal.limestone) {
      // limestone: soft mottling, a few iron-stained patches and fine speckle
      for (let i = 0; i < 26; i++) {
        const x = R() * W, y = R() * H, r = (0.08 + R() * 0.3) * Math.max(W, H);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const warm = R() < 0.5;
        g.addColorStop(0, warm ? 'rgba(196,160,110,0.10)' : 'rgba(255,250,236,0.14)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = 'rgba(90,70,50,0.18)';
      const n = Math.round(W * H / 900);
      for (let i = 0; i < n; i++) { const s = (0.4 + R() * 0.8) * Math.max(1, H / 900); ctx.fillRect(R() * W, R() * H, s, s); }
    }
    if (pal.glass) {
      const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
      g.addColorStop(0, 'rgba(120,160,200,0.18)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,20,30,0.3)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    if (pal.cyanotype) {
      // uneven brush-coated sensitiser
      for (let i = 0; i < 14; i++) {
        const y = R() * H, h = (0.05 + R() * 0.2) * H;
        ctx.fillStyle = `rgba(${R() < 0.5 ? '10,30,70' : '50,90,150'},${0.06 + R() * 0.08})`;
        ctx.fillRect(0, y, W, h);
      }
    }
    ctx.save();
    ctx.globalAlpha = pal.dark ? 0.06 : 0.08;
    ctx.globalCompositeOperation = pal.dark ? 'screen' : 'multiply';
    const pat = ctx.createPattern(grainTile(), 'repeat'), s = Math.max(1, H / 900);
    if (pat.setTransform) pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.dark ? 'rgba(0,0,0,0.38)' : 'rgba(70,45,15,0.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------------------------ model */
  function stickP(v) { return 0.012 * Math.pow(1 / 0.012, v); }   // log scale 0.012 … 1
  function simKey(P) { return [P.seed, P.format, P.seedShape, P.grain, P.extent, P.margin, P.stick, P.drift, P.driftAngle].join(','); }

  function newState(P) {
    const a = C.FORMATS[P.format].a;
    const cells = 200000 + 320000 * P.grain;
    const GH = Math.round(Math.sqrt(cells / a)), GW = Math.round(GH * a);
    const mg = Math.round(GH * (P.margin < 0.02 ? 0.01 : 0.03 + 0.08 * P.margin));
    const N = GW * GH, CAP = 70000;
    const s = {
      key: simKey(P), GW, GH, mg, a,
      grid: new Uint8Array(N), idx: new Int32Array(N).fill(-1),
      px: new Int16Array(CAP), py: new Int16Array(CAP), par: new Int32Array(CAP), tt: new Float32Array(CAP), CAP,
      n: 0, done: false, steps: 0,
      rs: ((P.seed * 2654435761) ^ 0x9e3779b9) >>> 0 || 1,
      lv: [4, 16, 64].map((B) => { const bw = Math.ceil(GW / B), bh = Math.ceil(GH / B); return { B, bw, bh, c: new Uint16Array(bw * bh) }; }),
      shape: P.seedShape,
    };
    const p = stickP(P.stick);
    s.p = p;
    // drift: lattice step probabilities ∝ exp(β cos(φ − θ))
    const th = P.driftAngle * Math.PI / 180, beta = 0.5 * P.drift * P.drift;   // Péclet length ≈ 1/|drift| cells
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const w = dirs.map(([dx, dy]) => Math.exp(beta * (dx * Math.cos(th) + dy * Math.sin(th))));
    const tot = w.reduce((x, y) => x + y, 0);
    s.cum = [w[0] / tot, (w[0] + w[1]) / tot, (w[0] + w[1] + w[2]) / tot];
    s.mx = (w[0] - w[2]) / tot; s.my = (w[1] - w[3]) / tot;   // mean drift per step
    const R = C.rng(P.seed ^ 0x51f3);
    const x0 = mg, y0 = mg, x1 = GW - 1 - mg, y1 = GH - 1 - mg;
    s.box = [x0, y0, x1, y1];
    s.cx = GW / 2; s.cy = GH / 2;
    const half = Math.min(x1 - x0, y1 - y0) / 2;
    const ext = 0.55 + 0.43 * P.extent;
    if (P.seedShape === 0) {
      s.cx = Math.round(GW / 2 + (R() - 0.5) * 0.04 * GW); s.cy = Math.round(GH / 2 + (R() - 0.5) * 0.04 * GH);
      occupy(s, s.cx, s.cy, -1, 0);
      s.rmax = 1;
      s.target = Math.min(s.cx - x0, x1 - s.cx, s.cy - y0, y1 - s.cy) * ext;
    } else if (P.seedShape === 1) {
      for (let x = x0; x <= x1; x++) occupy(s, x, y1, -1, 0);
      s.top = y1;
      s.target = y1 - (y1 - y0) * (0.5 + 0.47 * P.extent);
      s.wrap = true;          // the pane continues past the plate: periodic sides
    } else if (P.seedShape === 2) {
      const rr = half * 0.98;
      s.rim = rr;
      const k = Math.ceil(TAU * rr * 1.5);
      let prev = -1;
      for (let i = 0; i < k; i++) {
        const t = i / k * TAU, x = Math.round(s.cx + Math.cos(t) * rr), y = Math.round(s.cy + Math.sin(t) * rr);
        if (!s.grid[y * GW + x]) prev = occupy(s, x, y, -1, 0);
      }
      s.rmin = rr;
      s.target = rr * (1 - ext * 0.92);
    } else {
      if (P.seedShape === 3) {
        const k = 3 + Math.floor(R() * 5), pts = [];
        let tries = 0;
        while (pts.length < k && tries++ < 3000) {
          const x = Math.round(x0 + (x1 - x0) * (0.1 + 0.8 * R())), y = Math.round(y0 + (y1 - y0) * (0.1 + 0.8 * R()));
          if (pts.every(([u, v]) => Math.hypot(u - x, v - y) > half * 0.5)) pts.push([x, y]);
        }
        for (const [x, y] of pts) occupy(s, x, y, -1, 0);
      } else {
        // a fracture: a jagged crack across the slab, dendrites grow out of it on both sides
        const ang = (R() - 0.5) * 1.2 + (a > 1.2 ? 0 : Math.PI / 2 * (R() < 0.5 ? 1 : 0));
        let x = s.cx - Math.cos(ang) * GW, y = s.cy - Math.sin(ang) * GH;
        let dir = ang, guard = 0;
        const L = Math.hypot(GW, GH) * 2;
        for (let t = 0; t < L && guard++ < 20000; t += 0.7) {
          dir += (R() - 0.5) * 0.5 + (ang - dir) * 0.08;
          x += Math.cos(dir) * 0.7; y += Math.sin(dir) * 0.7;
          const ix = Math.round(x), iy = Math.round(y);
          if (ix < x0 || ix > x1 || iy < y0 || iy > y1) continue;
          if (!s.grid[iy * GW + ix]) occupy(s, ix, iy, -1, 0);
        }
      }
      s.bath = true;
      const area = (x1 - x0) * (y1 - y0);
      s.target = Math.round(area * (0.03 + 0.07 * P.extent) * (0.7 + 0.6 * (1 - P.stick)));
      s.n0 = s.n;
    }
    s.seedCount = s.n;
    // pacing: aim for ~300 frames of growth
    const est = estimateN(P, s);
    s.est = est;
    s.perFrame = Math.max(30, Math.ceil(est / 300));
    s.killPad = 0;
    return s;
  }
  function estimateN(P, s) {
    const dens = 1 + 1.6 * (1 - P.stick) * (1 - P.stick);
    if (s.bath) return s.target;
    if (P.seedShape === 0) return Math.pow(s.target, 1.71) * 0.55 * dens;
    if (P.seedShape === 1) return (s.box[2] - s.box[0]) * (s.box[3] - s.target) * 0.11 * dens;
    return Math.PI * (s.rim * s.rim - s.target * s.target) * 0.1 * dens;
  }

  function occupy(s, x, y, parent, t) {
    const i = s.n++;
    const c = y * s.GW + x;
    s.grid[c] = 1; s.idx[c] = i;
    s.px[i] = x; s.py[i] = y; s.par[i] = parent; s.tt[i] = t;
    for (const L of s.lv) L.c[((y / L.B) | 0) * L.bw + ((x / L.B) | 0)]++;
    return i;
  }

  // xorshift32 for the walkers (deterministic, fast)
  function rnd(s) { let x = s.rs; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rs = x >>> 0; return s.rs / 4294967296; }

  function progressT(s) {
    if (s.shape === 0) return clamp(s.rmax / s.target, 0, 1);
    if (s.shape === 1) return clamp((s.box[3] - s.top) / (s.box[3] - s.target), 0, 1);
    if (s.shape === 2) return clamp((s.rim - s.rmin) / (s.rim - s.target), 0, 1);
    return clamp((s.n - s.n0) / (s.target), 0, 1);
  }

  function launch(s, W) {
    const GW = s.GW, GH = s.GH;
    if (s.shape === 0) {
      const t = rnd(s) * TAU, r = s.rmax + 5;
      W.x = s.cx + Math.cos(t) * r; W.y = s.cy + Math.sin(t) * r;
    } else if (s.shape === 1) {
      W.x = s.box[0] + rnd(s) * (s.box[2] - s.box[0]); W.y = s.top - 6;
    } else if (s.shape === 2) {
      const t = rnd(s) * TAU, r = Math.max(1, s.rmin - 6);
      W.x = s.cx + Math.cos(t) * r; W.y = s.cy + Math.sin(t) * r;
    } else {
      // bath: anywhere on the slab that is not right next to the aggregate
      const L = s.lv[0];
      for (let k = 0; k < 50; k++) {
        const x = s.box[0] + rnd(s) * (s.box[2] - s.box[0]), y = s.box[1] + rnd(s) * (s.box[3] - s.box[1]);
        if (!L.c[((y / L.B) | 0) * L.bw + ((x / L.B) | 0)]) { W.x = x; W.y = y; break; }
        W.x = x; W.y = y;
      }
    }
    W.x = Math.round(W.x); W.y = Math.round(W.y);
  }

  // largest empty block radius around (x,y): 64, 16, 4 or 0
  function freeRadius(s, x, y) {
    for (let li = 2; li >= 0; li--) {
      const L = s.lv[li], bx = (x / L.B) | 0, by = (y / L.B) | 0;
      if (s.wrap && (x - 2 * L.B < s.box[0] || x + 2 * L.B > s.box[2])) continue;
      let ok = true;
      for (let j = by - 1; j <= by + 1 && ok; j++) {
        if (j < 0 || j >= L.bh) continue;
        for (let i = bx - 1; i <= bx + 1; i++) {
          if (i < 0 || i >= L.bw) continue;
          if (L.c[j * L.bw + i]) { ok = false; break; }
        }
      }
      if (ok) return L.B;
    }
    return 0;
  }

  const N8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  // walk one particle until it sticks; returns the new particle index or -1 if the step cap hit
  function walkOne(s) {
    const GW = s.GW, GH = s.GH, grid = s.grid, box = s.box, W = s.W || (s.W = { x: 0, y: 0 });
    launch(s, W);
    let x = W.x, y = W.y, guard = 0;
    const bath = s.bath, shape = s.shape, mx = s.mx, my = s.my, cum = s.cum, p = s.p;
    for (;;) {
      if (++guard > 400000) return -1;
      // far field
      if (shape === 0) {
        const dx = x - s.cx, dy = y - s.cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > s.rmax * 2.2 + 60 + s.killPad) { launch(s, W); x = W.x; y = W.y; continue; }
        if (d > s.rmax + 12) { const j = d - s.rmax - 6; const t = rnd(s) * TAU, bb = Math.min(3, j * 1.2); let ux = Math.cos(t) + mx * bb, uy = Math.sin(t) + my * bb; const l = Math.hypot(ux, uy) || 1; x = Math.round(x + ux / l * j); y = Math.round(y + uy / l * j); continue; }
      } else if (shape === 1) {
        if (y < s.top - 70) { launch(s, W); x = W.x; y = W.y; continue; }
        if (y < s.top - 12) { const j = s.top - y - 6; const t = rnd(s) * TAU, bb = Math.min(3, j * 1.2); let ux = Math.cos(t) + mx * bb, uy = Math.sin(t) + my * bb; const l = Math.hypot(ux, uy) || 1; x = Math.round(x + ux / l * j); y = Math.round(y + uy / l * j); x = wrapX(s, x); continue; }
      }
      // empty-block jumps
      const fr = (x >= 0 && x < GW && y >= 0 && y < GH) ? freeRadius(s, x, y) : 64;
      if (fr > 0) {
        const j = fr - 1, t = rnd(s) * TAU, bb = Math.min(3, j * 1.2);
        let ux = Math.cos(t) + mx * bb, uy = Math.sin(t) + my * bb; const l = Math.hypot(ux, uy) || 1;
        let jx = Math.round(x + ux / l * j), jy = Math.round(y + uy / l * j);
        if (shape === 1) { jx = wrapX(s, jx); if (jy > box[3]) jy = box[3] - 1; }
        else if (bath || shape === 2) { jx = clamp(jx, box[0], box[2]); jy = clamp(jy, box[1], box[3]); }
        if (jx >= 0 && jx < GW && jy >= 0 && jy < GH && grid[jy * GW + jx]) continue;
        x = jx; y = jy;
        continue;
      }
      // near the aggregate: check contact
      let touch = -1;
      for (let k = 0; k < 8; k++) {
        let nx = x + N8[k][0];
        const ny = y + N8[k][1];
        if (shape === 1) nx = wrapX(s, nx);
        if (nx < 0 || nx >= GW || ny < 0 || ny >= GH) continue;
        if (grid[ny * GW + nx]) { touch = s.idx[ny * GW + nx]; break; }
      }
      if (touch >= 0 && x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && !grid[y * GW + x]) {
        if (rnd(s) < p) return stick(s, x, y, touch);
      }
      // one lattice step, biased by the drift
      const r = rnd(s);
      let nx = x, ny = y;
      if (r < cum[0]) nx++; else if (r < cum[1]) ny++; else if (r < cum[2]) nx--; else ny--;
      if (shape === 1) { nx = wrapX(s, nx); if (ny > box[3]) ny = y; }
      else if (bath || shape === 2) { if (nx < box[0] || nx > box[2]) nx = x; if (ny < box[1] || ny > box[3]) ny = y; }
      if (nx >= 0 && nx < GW && ny >= 0 && ny < GH && grid[ny * GW + nx]) continue;
      x = nx; y = ny;
    }
  }
  function wrapX(s, x) {
    const x0 = s.box[0], w = s.box[2] - x0 + 1;
    return x0 + (((x - x0) % w) + w) % w;
  }
  function stick(s, x, y, parent) {
    // attach to the nearest orthogonal neighbour when there is one
    for (let k = 0; k < 4; k++) {
      let nx = x + N8[k][0];
      const ny = y + N8[k][1];
      if (s.wrap) nx = wrapX(s, nx);
      if (nx >= 0 && nx < s.GW && ny >= 0 && ny < s.GH && s.grid[ny * s.GW + nx]) { parent = s.idx[ny * s.GW + nx]; break; }
    }
    const i = occupy(s, x, y, parent, progressT(s));
    if (s.shape === 0) { const d = Math.hypot(x - s.cx, y - s.cy); if (d > s.rmax) s.rmax = d; }
    else if (s.shape === 1) { if (y < s.top) s.top = y; }
    else if (s.shape === 2) { const d = Math.hypot(x - s.cx, y - s.cy); if (d < s.rmin) s.rmin = d; }
    return i;
  }

  function checkDone(s) {
    if (s.n >= s.CAP - 2) return true;
    if (s.shape === 0) return s.rmax >= s.target;
    if (s.shape === 1) return s.top <= s.target;
    if (s.shape === 2) return s.rmin <= s.target;
    return s.n - s.n0 >= s.target;
  }
  function grow(s, count, ms) {
    const t0 = performance.now();
    let k = 0;
    while (!s.done && k < count && (k & 15 || performance.now() - t0 < ms)) {
      if (walkOne(s) < 0) s.killPad += 10;
      k++;
      if (checkDone(s)) s.done = true;
    }
    return k;
  }

  /* ------------------------------------------------------------------ measure */
  // box-counting dimension of the aggregate (sizes 2…32 cells)
  function fit(xs, ys) {
    const m = xs.length, mx = xs.reduce((a, b) => a + b) / m, my = ys.reduce((a, b) => a + b) / m;
    let num = 0, den = 0;
    for (let i = 0; i < m; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    return num / den;
  }
  // mass–radius dimension N(r) ∝ r^D, fitted over the well-grown interior (0.08…0.5 of the radius)
  function massRadiusDim(s) {
    const n = s.n, d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.hypot(s.px[i] - s.cx, s.py[i] - s.cy);
    d.sort();
    const xs = [], ys = [];
    for (let f = 0.08; f <= 0.5; f *= 1.25) {
      const r = s.rmax * f;
      let lo = 0, hi = n;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (d[mid] <= r) lo = mid + 1; else hi = mid; }
      if (lo > 8) { xs.push(Math.log(r)); ys.push(Math.log(lo)); }
    }
    return xs.length > 3 ? fit(xs, ys) : 1.7;
  }
  function boxDim(s) {
    if (s.shape === 0) return massRadiusDim(s);
    const GW = s.GW, GH = s.GH, xs = [], ys = [];
    for (let b = 4; b <= 64; b *= 2) {
      const bw = Math.ceil(GW / b), seen = new Uint8Array(bw * Math.ceil(GH / b));
      let n = 0;
      for (let i = s.seedCount; i < s.n; i++) { const c = ((s.py[i] / b) | 0) * bw + ((s.px[i] / b) | 0); if (!seen[c]) { seen[c] = 1; n++; } }
      xs.push(Math.log(1 / b)); ys.push(Math.log(Math.max(1, n)));
    }
    return fit(xs, ys);
  }
  const MEASURED = new Map();
  function measure(s) {
    const m = { D: boxDim(s), n: s.n - s.seedCount };
    MEASURED.set(s.key, m);
    if (MEASURED.size > 200) MEASURED.delete(MEASURED.keys().next().value);
    return m;
  }
  // typical measured values on this lattice (mass–radius for a point, box counting otherwise)
  function predictD(P) { const p = stickP(P.stick); return clamp([1.61, 1.52, 1.52, 1.56, 1.62][P.seedShape] + 0.22 * Math.pow(1 - p, 3), 1.4, 1.95); }
  // habit follows the sticking probability: low p lets walkers into the fjords
  function habit(P) { const p = stickP(P.stick); return p >= 0.3 ? 'Fractal' : p >= 0.07 ? 'Bushy' : 'Compact'; }

  /* ------------------------------------------------------------------ drawing */
  function colorT(P, t) {
    const nb = P.bands < 0.02 ? 0 : Math.round(1 + 11 * P.bands);
    if (!nb) return t;
    const u = t * nb, f = u - Math.floor(u);
    return f < 0.5 ? f * 2 : 2 - f * 2;       // ping-pong: arrival rings without hard seams
  }
  function descendants(s) {
    const n = s.n, d = new Float32Array(n);
    for (let i = n - 1; i >= 0; i--) { d[i] += 1; const p = s.par[i]; if (p >= 0) d[p] += d[i]; }
    return d;
  }

  // full vector render at W×H (final frame and export)
  function drawAll(ctx, P, s, W, H) {
    const pal = PALETTES[P.palette];
    ground(ctx, pal, W, H, P.seed);
    const k = W / s.GW;              // lattice cell in pixels (x and y share the scale)
    const ox = k / 2, oy = H / s.GH / 2;
    if (pal.glow && P.glow > 0.02) glow(ctx, P, s, W, H, pal);
    if (P.render === 1) drawLines(ctx, P, s, k, pal, W, H);
    else drawDots(ctx, P, s, k, pal);
    frameRule(ctx, P, s, W, H, pal);
  }
  const NCOL = 28;
  function colorBins(P, pal) { const out = []; for (let i = 0; i < NCOL; i++) out.push(css(gradRGB(pal.stops, i / (NCOL - 1)))); return out; }
  function drawDots(ctx, P, s, k, pal) {
    const cols = colorBins(P, pal), paths = cols.map(() => new Path2D());
    const r = Math.max(0.35, k * (0.42 + 0.5 * P.weight));
    for (let i = s.seedShape === 1 ? 0 : 0; i < s.n; i++) {
      const b = Math.round(colorT(P, s.tt[i]) * (NCOL - 1));
      const x = (s.px[i] + 0.5) * k, y = (s.py[i] + 0.5) * k;
      const q = paths[b];
      q.moveTo(x + r, y); q.arc(x, y, r, 0, TAU);
    }
    for (let b = 0; b < NCOL; b++) { ctx.fillStyle = cols[b]; ctx.fill(paths[b]); }
  }
  // Lines: walk the aggregate as a tree, following the heaviest child so each branch is one
  // continuous polyline; runs are cut only where the colour or width bin changes (no bead-like caps).
  function drawLines(ctx, P, s, k, pal, W, H) {
    const cols = colorBins(P, pal), d = descendants(s), n = s.n, par = s.par;
    const NW = 10, w0 = Math.max(0.5, k * (0.45 + 0.9 * P.weight)), gam = 2.3;
    let dmax = 1; for (let i = 0; i < n; i++) if (par[i] >= 0 && d[i] > dmax) dmax = d[i];
    const lwm = Math.log(Math.max(1.001, Math.pow(dmax, 1 / gam))), wcap = k * 7;
    const wbin = (i) => Math.min(NW - 1, Math.floor(Math.log(Math.pow(d[i], 1 / gam)) / lwm * NW));
    const cbin = (i) => Math.round(colorT(P, s.tt[i]) * (NCOL - 1));
    const linked = (a, b) => Math.abs(s.px[a] - s.px[b]) <= 2;
    const start = new Int32Array(n + 1), kids = new Int32Array(n);
    for (let i = 0; i < n; i++) if (par[i] >= 0) start[par[i] + 1]++;
    for (let i = 0; i < n; i++) start[i + 1] += start[i];
    const fill = start.slice(0, n);
    for (let i = 0; i < n; i++) if (par[i] >= 0) kids[fill[par[i]]++] = i;
    const paths = new Array(NCOL * NW);
    const X = (i) => (s.px[i] + 0.5) * k, Y = (i) => (s.py[i] + 0.5) * k;
    const stack = [];
    for (let i = 0; i < n; i++) if (par[i] < 0) stack.push(i);
    while (stack.length) {
      const c = stack.pop();
      let cur = c, key = -1, q = null;
      if (par[c] >= 0 && linked(par[c], c)) { key = wbin(c) * NCOL + cbin(c); q = paths[key] || (paths[key] = new Path2D()); q.moveTo(X(par[c]), Y(par[c])); q.lineTo(X(c), Y(c)); }
      for (;;) {
        const k0 = start[cur], k1 = start[cur + 1];
        if (k0 === k1) break;
        let best = kids[k0];
        for (let t = k0 + 1; t < k1; t++) if (d[kids[t]] > d[best]) best = kids[t];
        for (let t = k0; t < k1; t++) if (kids[t] !== best) stack.push(kids[t]);
        if (!linked(cur, best)) { stack.push(best); break; }
        // a run keeps its colour until its width bin changes, so thick trunks carry no seams
        const wb = wbin(best);
        if (key < 0 || ((key / NCOL) | 0) !== wb) { key = wb * NCOL + cbin(best); q = paths[key] || (paths[key] = new Path2D()); q.moveTo(X(cur), Y(cur)); }
        q.lineTo(X(best), Y(best));
        cur = best;
      }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let wb = 0; wb < NW; wb++) {
      ctx.lineWidth = Math.min(wcap, w0 * Math.exp(lwm * (wb + 0.5) / NW));
      for (let b = 0; b < NCOL; b++) { const q = paths[wb * NCOL + b]; if (!q) continue; ctx.strokeStyle = cols[b]; ctx.stroke(q); }
    }
  }
  function glow(ctx, P, s, W, H, pal) {
    const f = 0.09, gw = Math.max(8, Math.round(W * f)), gh = Math.max(8, Math.round(H * f));
    const off = document.createElement('canvas'); off.width = gw; off.height = gh;
    const g = off.getContext('2d'), im = g.createImageData(gw, gh), kx = gw / s.GW, ky = gh / s.GH;
    const acc = new Float32Array(gw * gh * 3);
    for (let i = 0; i < s.n; i++) {
      const c = gradRGB(pal.stops, colorT(P, s.tt[i]));
      const j = (Math.min(gh - 1, (s.py[i] * ky) | 0) * gw + Math.min(gw - 1, (s.px[i] * kx) | 0)) * 3;
      acc[j] += c[0]; acc[j + 1] += c[1]; acc[j + 2] += c[2];
    }
    const norm = 1 / Math.max(1, 1 / (kx * ky) * 0.18);
    for (let i = 0; i < gw * gh; i++) { im.data[i * 4] = Math.min(255, acc[i * 3] * norm); im.data[i * 4 + 1] = Math.min(255, acc[i * 3 + 1] * norm); im.data[i * 4 + 2] = Math.min(255, acc[i * 3 + 2] * norm); im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    const off2 = document.createElement('canvas'); off2.width = Math.max(4, gw >> 2); off2.height = Math.max(4, gh >> 2);
    off2.getContext('2d').drawImage(off, 0, 0, off2.width, off2.height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = pal.glow * P.glow;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.drawImage(off2, 0, 0, W, H);
    ctx.restore();
  }
  function frameRule(ctx, P, s, W, H, pal) {
    if (P.margin < 0.3) return;
    const k = W / s.GW, m = s.mg * k * 0.5;
    ctx.strokeStyle = pal.rule; ctx.globalAlpha = 0.8;
    ctx.lineWidth = Math.max(1, H / 900);
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ module */
  C.register({
    id: 'dla',
    name: 'DLA',
    group: 'process',
    order: 8,
    renderer: '2d',
    animated: true,
    restartDelay: 110,
    subtitle: 'Diffusion-limited aggregation',
    about: 'Particles random-walk on a lattice until they touch the aggregate, then stick with the sticking probability (Witten & Sander, 1981). Tips catch walkers before the fjords between them can, so branches screen each other and the cluster grows fractal, with dimension near 1.71; a lower sticking probability lets walkers slip into the gaps and fills it out. The same law draws manganese dendrites on limestone, frost on glass, electrodeposited copper and Lichtenberg figures; colour records arrival time.',
    formats: [0, 1, 2, 3],
    formatOdds: [2, 2.5, 1.3, 0.6],
    defaults: { seed: 1981, format: 1, palette: 0 },
    palettes: PALETTES,
    paletteOdds: [3, 1.8, 1.6, 1, 1.4, 1.2, 1.2],
    params: [
      { k: 'seedShape', g: 'Seed', label: 'Seed', type: 'select', options: SEEDS, def: 0 },
      { k: 'extent', g: 'Seed', label: 'Extent', min: 0, max: 1, step: 0.01, def: 0.7, names: [[0, 'Nucleus'], [0.3, 'Spray'], [0.65, 'Spread'], [0.9, 'Filling']] },
      { k: 'grain', g: 'Seed', label: 'Lattice', min: 0, max: 1, step: 0.01, def: 0.5, names: [[0, 'Coarse'], [0.35, 'Medium'], [0.7, 'Fine']] },
      { k: 'margin', g: 'Seed', label: 'Margin', min: 0, max: 1, step: 0.01, def: 0.35, names: [[0, 'Full bleed'], [0.02, 'Narrow'], [0.3, 'Plate'], [0.7, 'Wide']] },
      { k: 'stick', g: 'Physics', label: 'Sticking probability', min: 0, max: 1, step: 0.01, def: 1 },
      { k: 'drift', g: 'Physics', label: 'Drift', min: 0, max: 1, step: 0.01, def: 0, names: [[0, 'Still'], [0.05, 'Breeze'], [0.3, 'Current'], [0.65, 'Gale']] },
      { k: 'driftAngle', g: 'Physics', label: 'Drift bearing', min: 0, max: 355, step: 5, def: 90 },
      { k: 'render', g: 'Drawing', label: 'Render', type: 'select', options: RENDERS, def: 0 },
      { k: 'bands', g: 'Drawing', label: 'Arrival bands', min: 0, max: 1, step: 0.01, def: 0, names: [[0, 'Gradient'], [0.02, 'Single'], [0.2, 'Banded'], [0.6, 'Fine rings']] },
      { k: 'weight', g: 'Drawing', label: 'Weight', min: 0, max: 1, step: 0.01, def: 0.4, names: [[0, 'Hairline'], [0.25, 'Fine'], [0.55, 'Solid'], [0.85, 'Heavy']] },
      { k: 'glow', g: 'Drawing', label: 'Glow', min: 0, max: 1, step: 0.01, def: 0.5, names: [[0, 'None'], [0.02, 'Faint'], [0.4, 'Glowing'], [0.8, 'Blazing']] },
    ],

    randomize(R) {
      const g = (lo, hi) => lo + (hi - lo) * (R() + R()) / 2;
      const o = {};
      o.seedShape = C.pickWeighted(R, [3, 1.8, 1.4, 1.2, 1.3]);
      o.extent = g(0.45, 0.95);
      o.grain = g(0.2, 0.9);
      o.margin = R() < 0.15 ? R.range(0, 0.02) : g(0.2, 0.7);
      o.stick = R() < 0.62 ? g(0.75, 1) : R() < 0.75 ? g(0.4, 0.75) : g(0.12, 0.4);
      o.drift = R() < 0.6 ? 0 : R() < 0.7 ? g(0.1, 0.45) : g(0.45, 0.8);
      o.driftAngle = R() * 360;
      if (o.seedShape === 0) { o.extent = g(0.7, 1); o.drift = Math.min(o.drift, 0.35); }
      if (o.seedShape === 2) o.drift = R() < 0.8 ? 0 : g(0.05, 0.25);
      if (o.seedShape === 1) { o.stick = Math.max(o.stick, g(0.35, 0.9)); o.drift = Math.min(o.drift, g(0.1, 0.4)); if (o.drift > 0) o.driftAngle = (R() < 0.5 ? 0 : 180) + g(-35, 35) + 360; }
      o.driftAngle %= 360;
      o.render = R() < 0.45 ? 1 : 0;
      o.bands = R() < 0.5 ? 0 : g(0.05, 0.6);
      o.weight = g(0.2, 0.7);
      o.glow = g(0.2, 0.8);
      return o;
    },

    traitName(k, P) {
      if (k === 'stick') { const p = stickP(P.stick); return `${habit(P)} p ${p < 0.1 ? p.toFixed(3) : p.toFixed(2)}`; }
      if (k === 'driftAngle') { const d = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][Math.round(P.driftAngle / 45) % 8]; return `toward ${d}`; }
      return null;
    },
    caption(P) {
      const m = MEASURED.get(simKey(P));
      const D = m ? m.D : predictD(P);
      const pal = PALETTES[P.palette].name;
      const hab = habit(P).toLowerCase();
      const what = ['a point', 'the bottom edge', 'a circular rim, growing inward', 'scattered nuclei', 'a fracture'][P.seedShape];
      const drift = P.drift >= 0.05 ? `, drifting ${C.traitName(this, 'driftAngle', P)}` : '';
      const count = m ? `, ${m.n.toLocaleString('en')} particles` : '';
      return `${pal}: ${hab} aggregate from ${what}${drift}; D ${m ? '' : '≈ '}${D.toFixed(2)}${count}.`;
    },
    sheet(P) {
      const m = MEASURED.get(simKey(P));
      const D = m ? m.D : predictD(P);
      const p = stickP(P.stick);
      return [
        ['Habit', habit(P)],
        ['Palette', PALETTES[P.palette].name],
        ['Seed', SEEDS[P.seedShape]],
        ['Fractal dimension', m ? `${D.toFixed(2)} (${P.seedShape === 0 ? 'mass–radius' : 'box count'})` : `≈ ${D.toFixed(2)}`],
        ['Sticking p', p < 0.1 ? p.toFixed(3) : p.toFixed(2)],
        ['Drift', P.drift < 0.05 ? 'Still' : `${C.traitName(this, 'drift', P)}, ${C.traitName(this, 'driftAngle', P)}`],
        ['Particles', m ? m.n.toLocaleString('en') : '…'],
        ['Lattice', C.traitName(this, 'grain', P)],
        ['Render', `${RENDERS[P.render]}, ${C.traitName(this, 'bands', P).toLowerCase()}`],
        ['Extent', C.traitName(this, 'extent', P)],
      ];
    },

    setup(p) { return {}; },
    start(p, P, st) {
      st.s = newState(P);
      st.layer = null; st.drawn = 0; st.frames = 0;
    },
    frame(p, P, st) {
      const s = st.s;
      if (!s) return false;
      st.frames++;
      grow(s, s.perFrame, 10);
      if (st.frames % 15 === 0) {
        const pr = Math.max(0.02, progressT(s));
        const left = st.frames * (1 - pr) / pr;          // frames still needed at this rate
        if (st.frames + left > 330) s.perFrame = Math.ceil(s.perFrame * 1.35);
        else if (st.frames + left < 220) s.perFrame = Math.max(8, Math.floor(s.perFrame * 0.75));
      }
      const ctx = p.drawingContext, W = p.width, H = p.height, pal = PALETTES[P.palette];
      if (s.done) {
        drawAll(ctx, P, s, W, H);
        if (!MEASURED.has(s.key)) measure(s);
        return false;
      }
      // live view: the ground is cached once, particles accumulate on a layer
      const pd = p.pixelDensity(), LW = Math.round(W * pd), LH = Math.round(H * pd);
      if (!st.layer || st.layer.width !== LW || st.layer.height !== LH || st.owner !== s) {
        st.bg = document.createElement('canvas'); st.bg.width = LW; st.bg.height = LH;
        const b = st.bg.getContext('2d'); b.scale(pd, pd); ground(b, pal, W, H, P.seed); frameRule(b, P, s, W, H, pal);
        st.layer = document.createElement('canvas'); st.layer.width = LW; st.layer.height = LH;
        st.owner = s; st.drawn = 0;
      }
      const L = st.layer.getContext('2d');
      L.setTransform(pd, 0, 0, pd, 0, 0);
      const k = W / s.GW;
      if (P.render === 1) {
        L.lineCap = 'round'; L.lineWidth = Math.max(0.6, k * (0.45 + 0.9 * P.weight));
        for (let i = st.drawn; i < s.n; i++) {
          const q = s.par[i]; if (q < 0 || Math.abs(s.px[q] - s.px[i]) > 2) continue;
          L.strokeStyle = css(gradRGB(pal.stops, colorT(P, s.tt[i])));
          L.beginPath(); L.moveTo((s.px[q] + 0.5) * k, (s.py[q] + 0.5) * k); L.lineTo((s.px[i] + 0.5) * k, (s.py[i] + 0.5) * k); L.stroke();
        }
      } else {
        const r = Math.max(0.35, k * (0.42 + 0.5 * P.weight));
        for (let i = st.drawn; i < s.n; i++) {
          L.fillStyle = css(gradRGB(pal.stops, colorT(P, s.tt[i])));
          L.beginPath(); L.arc((s.px[i] + 0.5) * k, (s.py[i] + 0.5) * k, r, 0, TAU); L.fill();
        }
      }
      st.drawn = s.n;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(st.bg, 0, 0); ctx.drawImage(st.layer, 0, 0); ctx.restore();
      return true;
    },
    progress(st) { return st.s ? progressT(st.s) : 0; },
    exportAt(p, P, W, H, st) {
      let s = st.s;
      if (!s || s.key !== simKey(P)) s = newState(P);
      while (!s.done) grow(s, 1e9, 1e9);
      if (!MEASURED.has(s.key)) measure(s);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      drawAll(c.getContext('2d'), P, s, W, H);
      return c;
    },
  });
})();
