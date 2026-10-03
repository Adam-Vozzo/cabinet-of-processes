/* Differential Growth — a closed curve of nodes held together by springs to its
   neighbours, pushed apart by every other node within the repulsion radius
   (spatial hash), smoothed toward its neighbours' midpoint, and split wherever an
   edge grows longer than the maximum. Length grows faster than the space around
   it, so the curve buckles: coral, gyri, lettuce edges. "Rings" keeps a snapshot
   every so often and draws them nested, like growth rings or contour lines.
   Everything is simulated in virtual units (height 1000). */
(function () {
  'use strict';
  const C = window.Cabinet;
  const TAU = Math.PI * 2;
  const VH = 1000;

  const STARTS = ['Circle', 'Cells', 'Line', 'Ring'];
  const BOUNDS = ['None', 'Circle', 'Frame'];
  const STYLES = ['Rings', 'Banded', 'Filled', 'Outline'];

  // stops run from the oldest ring (inside) to the newest (outside)
  const PALETTES = [
    { name: 'Contour', colors: ['#7a4a22', '#b98b52', '#dcc59a', '#f3ecdc'], bg: '#f3ecdc', ink: '#5e3717', stops: ['#8c6a3f', '#a0522d', '#5e3717'], bands: ['#e9dfc3', '#d6c79a', '#c1a36b', '#a87c48', '#86592f'], fill: '#c9ad7a', rule: '#5e3717' },
    { name: 'Agate', colors: ['#2b2a5c', '#8c83c2', '#f1ecf6', '#b5562b'], bg: '#efeae3', ink: '#231f4d', stops: ['#b5562b', '#6a5fa8', '#231f4d'], bands: ['#f7f2f6', '#c8bfe3', '#8c83c2', '#4d468d', '#2b2a5c', '#b5562b', '#f1ecf6'], fill: '#4d468d', rule: '#231f4d' },
    { name: 'Heartwood', colors: ['#6b3f1d', '#c48a4a', '#ecd3a2', '#f5ead2'], bg: '#f5ead2', ink: '#4f2c12', stops: ['#c48a4a', '#8a5427', '#4f2c12'], bands: ['#f0d9aa', '#e7c68d', '#dcb274', '#c9955a', '#a8703d'], fill: '#b77b43', rule: '#6b3f1d' },
    { name: 'Brain coral', colors: ['#d97a5b', '#f2c4a4', '#2e6f73', '#0f2e36'], bg: '#0f2e36', ink: '#f6d2b8', stops: ['#2e6f73', '#d97a5b', '#f6d2b8'], bands: ['#f6d2b8', '#eaa98a', '#d97a5b', '#b85a44', '#7b3a33'], fill: '#e59274', rule: '#5b8d8f', dark: true },
    { name: 'Sumi', colors: ['#111111', '#6f6d68', '#c8c3b8', '#eeeae0'], bg: '#eeeae0', ink: '#111111', stops: ['#b7b2a6', '#6f6d68', '#111111'], bands: ['#eeeae0', '#d7d2c6', '#b3aea3', '#7d7a73', '#3e3d3a'], fill: '#161616', rule: '#2a2a28' },
    { name: 'Kale', colors: ['#27472f', '#6f9a54', '#c9dca0', '#eef0e2'], bg: '#eef0e2', ink: '#1f3a26', stops: ['#a9c47e', '#4f7d40', '#1f3a26'], bands: ['#e3edc9', '#c9dca0', '#9fbf74', '#6f9a54', '#3f6a3a'], fill: '#4f7d40', rule: '#27472f' },
    { name: 'Nudibranch', colors: ['#ff6a1f', '#8a3cff', '#26d7ff', '#0b0716'], bg: '#0b0716', ink: '#9ff0ff', stops: ['#ff6a1f', '#e0247e', '#8a3cff', '#26d7ff'], bands: ['#fff2a8', '#ffb65c', '#ff6a1f', '#e0247e', '#8a3cff', '#3c1b8a'], fill: '#8a3cff', rule: '#4b2a7a', dark: true, glow: true },
    { name: 'Riso', colors: ['#ff48b0', '#0078bf', '#ffe800', '#f4f0e6'], bg: '#f4f0e6', ink: '#0060a8', stops: ['#ff48b0', '#e0409c', '#0078bf'], bands: ['#ffe800', '#ff48b0', '#0078bf'], fill: '#ff48b0', rule: '#0078bf', riso: true },
  ];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function grad(stops, t) {
    t = clamp(t, 0, 1) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
    const A = hexRGB(stops[i]), B = hexRGB(stops[i + 1]);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`;
  }
  function rgba(h, a) { const c = hexRGB(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  let GRAIN = null;
  function grainTile() {
    if (GRAIN) return GRAIN;
    const n = 256, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n), R = C.rng(9127);
    for (let i = 0; i < n * n; i++) { const v = 128 + (R() + R() + R() - 1.5) * 70; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return (GRAIN = c);
  }
  function paper(ctx, pal, W, H) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = pal.dark ? 0.05 : 0.07;
    ctx.globalCompositeOperation = pal.dark ? 'screen' : 'multiply';
    const pat = ctx.createPattern(grainTile(), 'repeat'), s = Math.max(1, H / 900);
    if (pat.setTransform) pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,10,0.09)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------------------------ model */
  function derived(P) {
    const R = 6 + 16 * P.repulsion;                         // repulsion radius (virtual units)
    const maxEdge = R * (0.32 + 0.5 * P.edge);               // split edges longer than this
    // node budget: enough line to cover a share of the plate at this fold spacing
    const a = C.FORMATS[P.format].a, m = VH * (P.margin < 0.02 ? 0.02 : 0.035 + 0.09 * P.margin);
    const plate = (VH * a - 2 * m) * (VH - 2 * m);
    const frac = 0.1 + 0.5 * P.extent;
    const cap = Math.round(clamp(frac * plate / (0.5 * R * 0.62 * maxEdge), 900, 7000));
    return { R, maxEdge, cap };
  }
  function simKey(P) { return [P.seed, P.format, P.start, P.boundary, P.margin, P.repulsion, P.repulsionForce, P.edge, P.growth, P.attraction, P.alignment, P.extent, P.patch, P.zone].join(','); }

  function newState(P) {
    const a = C.FORMATS[P.format].a, VW = VH * a;
    const m = VH * (P.margin < 0.02 ? 0.02 : 0.035 + 0.09 * P.margin);
    const box = { x0: m, y0: m, x1: VW - m, y1: VH - m };
    const d = derived(P);
    const R = C.rng(P.seed ^ 0x51f3);
    const cap = d.cap, CAP = cap + 64;
    const s = {
      key: simKey(P), VW, m, box, d, R, cap,
      X: new Float64Array(CAP), Y: new Float64Array(CAP), nxt: new Int32Array(CAP), prv: new Int32Array(CAP),
      DX: new Float64Array(CAP), DY: new Float64Array(CAP), CR: new Float32Array(CAP), pin: new Uint8Array(CAP),
      n: 0, heads: [], open: [], iter: 0, done: false, relax: 0, rings: [], nextRing: 0, lastRingN: 0,
      cx: VW / 2, cy: VH / 2,
    };
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0, mn = Math.min(bw, bh);
    s.bound = P.boundary === 1 ? { kind: 1, cx: VW / 2, cy: VH / 2, r: mn * 0.49 } : P.boundary === 2 ? { kind: 2 } : { kind: 0 };
    const circle = (cx, cy, r, jit) => {
      const k = Math.max(12, Math.round(TAU * r / Math.min(d.maxEdge * 0.7, d.R * 0.42)));
      const first = s.n;
      for (let i = 0; i < k; i++) {
        const t = i / k * TAU, rr = r * (1 + jit * (R() - 0.5));
        addNode(s, cx + Math.cos(t) * rr, cy + Math.sin(t) * rr);
      }
      for (let i = 0; i < k; i++) { s.nxt[first + i] = first + (i + 1) % k; s.prv[first + i] = first + (i - 1 + k) % k; }
      s.heads.push(first); s.open.push(false);
    };
    if (P.start === 0) {
      circle(VW / 2 + R.range(-0.02, 0.02) * bw, VH / 2 + R.range(-0.02, 0.02) * bh, Math.max(d.R * 2.2, mn * 0.05), 0.02);
    } else if (P.start === 1) {
      const k = C.pickWeighted(R, [0, 0, 1, 2, 2, 2, 1.5, 1, 1, 0.6]);
      const pts = [];
      let tries = 0;
      const lim = s.bound.kind === 1 ? s.bound.r * 0.7 : null;
      while (pts.length < k && tries++ < 2000) {
        const x = box.x0 + bw * R.range(0.18, 0.82), y = box.y0 + bh * R.range(0.18, 0.82);
        if (lim && Math.hypot(x - s.bound.cx, y - s.bound.cy) > lim) continue;
        if (pts.every(([u, v]) => Math.hypot(u - x, v - y) > mn * 0.22)) pts.push([x, y]);
      }
      for (const [x, y] of pts) circle(x, y, Math.max(d.R * 1.6, mn * R.range(0.02, 0.035)), 0.04);
    } else if (P.start === 2) {
      // a baseline pinned at both ends: grows upward like a ruffled edge (a chord of the wall if there is one)
      let y = box.y0 + bh * R.range(0.45, 0.55), x0 = box.x0 + bw * 0.03, x1 = box.x1 - bw * 0.03, floor = null;
      if (s.bound.kind === 1) { const B = s.bound, h = B.r * 0.55, w = Math.sqrt(B.r * B.r - h * h) * 0.97; y = B.cy + h; x0 = B.cx - w; x1 = B.cx + w; floor = y; }
      const sp = Math.min(d.maxEdge * 0.7, d.R * 0.42);
      const k = Math.max(8, Math.round((x1 - x0) / sp));
      const first = s.n;
      for (let i = 0; i <= k; i++) addNode(s, x0 + (x1 - x0) * i / k, y - (i > 0 && i < k ? R.range(0, 0.6) : 0));
      for (let i = 0; i <= k; i++) { s.nxt[first + i] = i < k ? first + i + 1 : -1; s.prv[first + i] = i > 0 ? first + i - 1 : -1; }
      s.pin[first] = s.pin[first + k] = 1;
      s.heads.push(first); s.open.push(true);
      s.floor = floor;
      s.plateBound = true;
    } else {
      circle(VW / 2, VH / 2, mn * R.range(0.3, 0.36), 0.01);
    }
    // smooth growth-rate field ("patchiness")
    const waves = [];
    for (let i = 0; i < 5; i++) { const th = R() * TAU, f = R.range(1.5, 4.5) / VH * TAU; waves.push([Math.cos(th) * f, Math.sin(th) * f, R() * TAU]); }
    s.field = (x, y) => { let v = 0; for (const [kx, ky, ph] of waves) v += Math.sin(kx * x + ky * y + ph); return v / 5 * 2.2; };
    s.n0 = Math.max(1, s.n);
    s.ringPlan = ringPlan(s, P);
    snapshot(s);
    return s;
  }
  function addNode(s, x, y) { const i = s.n++; s.X[i] = x; s.Y[i] = y; s.nxt[i] = -1; s.prv[i] = -1; return i; }

  // ring snapshots at node-count thresholds (denser toward the centre)
  function ringPlan(s, P) {
    const k = Math.round(5 + 45 * P.rings * P.rings);
    const n0 = s.n, out = [];
    for (let i = 1; i <= k; i++) out.push(Math.round(n0 + (s.cap - n0) * Math.pow(i / k, 1.35)));
    return out;
  }
  function snapshot(s) {
    const curves = [];
    for (let c = 0; c < s.heads.length; c++) {
      const h = s.heads[c], pts = [];
      let i = h, guard = 0;
      if (s.open[c]) { while (s.prv[i] >= 0 && guard++ < 1e5) i = s.prv[i]; }
      const start = i;
      guard = 0;
      do { pts.push(s.X[i], s.Y[i]); i = s.nxt[i]; } while (i >= 0 && i !== start && guard++ < 1e5);
      curves.push({ pts: Float32Array.from(pts), open: s.open[c] });
    }
    s.rings.push(curves);
    s.lastRingN = s.n;
    return curves;
  }

  function step(s, P) {
    const n = s.n, X = s.X, Y = s.Y, nxt = s.nxt, prv = s.prv, DX = s.DX, DY = s.DY, CR = s.CR;
    const R = s.d.R, R2 = R * R, maxEdge = s.d.maxEdge, rest = maxEdge * 0.55;
    // spatial hash (cell = R)
    const x0 = -VH * 0.5, y0 = -VH * 0.5, gw = Math.ceil((s.VW + VH) / R) + 1, gh = Math.ceil(2 * VH / R) + 1;
    if (!s.head || s.head.length !== gw * gh) s.head = new Int32Array(gw * gh);
    const head = s.head; head.fill(-1);
    if (!s.link || s.link.length < s.X.length) s.link = new Int32Array(s.X.length);
    const link = s.link;
    for (let i = 0; i < n; i++) {
      const cx = clamp(((X[i] - x0) / R) | 0, 0, gw - 1), cy = clamp(((Y[i] - y0) / R) | 0, 0, gh - 1), c = cy * gw + cx;
      link[i] = head[c]; head[c] = i;
    }
    const kRep = 0.18 * R * (0.5 + P.repulsionForce), kAtt = 0.25 + 0.6 * P.attraction, kAl = 0.05 + 0.45 * P.alignment;
    const maxStep = R * 0.3;
    for (let i = 0; i < n; i++) {
      let fx = 0, fy = 0;
      const a = prv[i], b = nxt[i], xi = X[i], yi = Y[i];
      // springs to neighbours
      if (a >= 0) { const dx = X[a] - xi, dy = Y[a] - yi, d = Math.sqrt(dx * dx + dy * dy); if (d > rest) { const f = kAtt * (d - rest) / d * 0.5; fx += dx * f; fy += dy * f; } }
      if (b >= 0) { const dx = X[b] - xi, dy = Y[b] - yi, d = Math.sqrt(dx * dx + dy * dy); if (d > rest) { const f = kAtt * (d - rest) / d * 0.5; fx += dx * f; fy += dy * f; } }
      // alignment: toward the neighbours' midpoint
      if (a >= 0 && b >= 0) { fx += ((X[a] + X[b]) * 0.5 - xi) * kAl; fy += ((Y[a] + Y[b]) * 0.5 - yi) * kAl; }
      // repulsion from every other node within R
      const cx = clamp(((xi - x0) / R) | 0, 0, gw - 1), cy = clamp(((yi - y0) / R) | 0, 0, gh - 1);
      let rx = 0, ry = 0, crowd = 0;
      for (let v = cy - 1; v <= cy + 1; v++) {
        if (v < 0 || v >= gh) continue;
        for (let u = cx - 1; u <= cx + 1; u++) {
          if (u < 0 || u >= gw) continue;
          for (let k = head[v * gw + u]; k >= 0; k = link[k]) {
            if (k === i || k === a || k === b) continue;
            const dx = xi - X[k], dy = yi - Y[k], d2 = dx * dx + dy * dy;
            if (d2 >= R2 || d2 < 1e-9) continue;
            const d = Math.sqrt(d2), w = (R - d) / R;
            rx += dx / d * w; ry += dy / d * w; crowd += w;
          }
        }
      }
      fx += rx * kRep; fy += ry * kRep;
      const l = Math.hypot(fx, fy);
      if (l > maxStep) { fx *= maxStep / l; fy *= maxStep / l; }
      DX[i] = fx; DY[i] = fy;
      CR[i] = crowd;
    }
    const B = s.bound, box = s.box;
    for (let i = 0; i < n; i++) {
      if (s.pin[i]) continue;
      let x = X[i] + DX[i], y = Y[i] + DY[i];
      if (B.kind === 1) { const dx = x - B.cx, dy = y - B.cy, d = Math.hypot(dx, dy); if (d > B.r) { x = B.cx + dx / d * B.r; y = B.cy + dy / d * B.r; } }
      else if (B.kind === 2 || s.plateBound) { x = clamp(x, box.x0, box.x1); y = clamp(y, box.y0, box.y1); }
      else { const e = s.m * 0.5 + 10; x = clamp(x, e, s.VW - e); y = clamp(y, e, VH - e); }   // an unseen wall at the plate edge
      if (s.floor != null && y > s.floor) y = s.floor;
      X[i] = x; Y[i] = y;
    }
    // split long edges; random growth inserts extra nodes
    if (s.n < s.cap) {
      const g = 0.003 + P.growth * P.growth * 0.045, patch = P.patch, Rr = s.R, zone = P.zone;
      for (let i = 0; i < n && s.n < s.cap; i++) {
        const b = nxt[i];
        if (b < 0) continue;
        const dx = X[b] - X[i], dy = Y[b] - Y[i], d2 = dx * dx + dy * dy;
        let split = d2 > maxEdge * maxEdge;
        if (!split && g > 0 && d2 > rest * rest * 0.36) {
          let f = patch > 0 ? Math.max(0, 1 + patch * s.field(X[i], Y[i])) : 1;
          // marginal growth: tissue buried among other folds stops adding length
          if (zone > 0) f *= 1 - zone + zone * clamp(1.25 - (CR[i] + CR[b]) * 0.5 / 1.6, 0, 1);
          split = Rr() < g * f;
        }
        if (split) {
          const k = addNode(s, (X[i] + X[b]) / 2, (Y[i] + Y[b]) / 2);
          nxt[i] = k; prv[k] = i; nxt[k] = b; prv[b] = k;
        }
      }
    } else s.relax++;
    s.iter++;
    if (s.iter % 150 === 0) { if (s.n < (s.nMark || 0) * 1.04 && s.n < s.cap) s.relax += 25; s.nMark = s.n; }
    while (s.nextRing < s.ringPlan.length && s.n >= s.ringPlan[s.nextRing]) { s.nextRing++; snapshot(s); s.newRing = true; }
    if (s.relax > 50 || s.iter > 1500) {
      s.done = true;
      if (s.lastRingN === s.n && s.rings.length > 1) s.rings.pop();   // replace with the relaxed shape
      snapshot(s);
      s.newRing = true;
    }
  }

  /* ------------------------------------------------------------------ measure */
  function curveStats(pts, open) {
    let per = 0, area = 0;
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (open && j === 0) break;
      const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[j * 2], y1 = pts[j * 2 + 1];
      per += Math.hypot(x1 - x0, y1 - y0);
      area += x0 * y1 - x1 * y0;
    }
    return { per, area: Math.abs(area) / 2, chord: open ? Math.hypot(pts[pts.length - 2] - pts[0], pts[pts.length - 1] - pts[1]) : 0 };
  }
  const MEASURED = new Map();
  function measure(s, P) {
    const last = s.rings[s.rings.length - 1];
    let q = 0, per = 0, area = 0, ruffle = 0;
    for (const c of last) {
      const st = curveStats(c.pts, c.open);
      per += st.per; area += st.area;
      if (c.open) ruffle = st.per / Math.max(1, st.chord);
      else q += st.per * st.per / (4 * Math.PI * Math.max(1, st.area));
    }
    q = last.length && !last[0].open ? q / last.length : 0;
    let fill = null;
    if (s.bound.kind) {
      let far = 0;
      for (const c of last) for (let i = 0; i < c.pts.length; i += 2) {
        const x = c.pts[i], y = c.pts[i + 1];
        far = Math.max(far, s.bound.kind === 1 ? Math.hypot(x - s.bound.cx, y - s.bound.cy) / s.bound.r
          : Math.max(Math.abs(x - s.VW / 2) / ((s.box.x1 - s.box.x0) / 2), Math.abs(y - VH / 2) / ((s.box.y1 - s.box.y0) / 2)));
      }
      fill = far;
    }
    const m = { q, ruffle, nodes: s.n, per, rings: s.rings.length, fill };
    MEASURED.set(s.key, m);
    if (MEASURED.size > 200) MEASURED.delete(MEASURED.keys().next().value);
    return m;
  }
  // rough prediction used until the curve has actually grown (calibrated on test runs)
  function predict(P) {
    const d = derived(P);
    const L = d.cap * d.maxEdge * 0.62;
    if (P.start === 2) return { ruffle: L / (VH * 0.85 * C.FORMATS[P.format].a), q: 0 };
    const cells = P.start === 1 ? 5 : 1;
    return { q: Math.max(1, L / cells / (2 * Math.PI * d.R) * 0.9), ruffle: 0 };
  }

  // convolution Q = perimeter² / (4π·area): 1 for a circle, ≈ L / 2πR once the line is folded
  function convolutionName(q) { return q < 1.5 ? 'Smooth' : q < 4 ? 'Lobed' : q < 15 ? 'Folded' : q < 60 ? 'Meandering' : 'Labyrinthine'; }
  function lookName(P, m) {
    if (P.start === 2) { const r = m.ruffle; return r < 3 ? 'Ripple' : r < 10 ? 'Frill' : r < 28 ? 'Lettuce' : 'Kale'; }
    const q = m.q;
    if (P.start === 1) return q < 4 ? 'Cell colony' : q < 20 ? 'Budding colony' : 'Coral colony';
    if (P.start === 3) return q < 4 ? 'Collar' : q < 20 ? 'Ruff' : 'Lace';
    if (P.boundary === 1 && q >= 30 && (m.fill == null || m.fill > 0.8)) return 'Gyri';
    if (P.boundary === 2 && q >= 60 && (m.fill == null || m.fill > 0.8)) return 'Labyrinth';
    return q < 1.5 ? 'Pebble' : q < 4 ? 'Amoeba' : q < 15 ? 'Lobed coral' : q < 60 ? 'Meander' : 'Brain coral';
  }
  function traits(P) { const m = MEASURED.get(simKey(P)); return { m: m || predict(P), measured: !!m }; }

  /* ------------------------------------------------------------------ drawing */
  function tracePath(ctx, c, k) {
    const p = c.pts, n = p.length / 2;
    if (n < 2) return;
    // midpoint-smoothed closed/open curve
    if (c.open) {
      ctx.moveTo(p[0] * k, p[1] * k);
      for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(p[i * 2] * k, p[i * 2 + 1] * k, (p[i * 2] + p[i * 2 + 2]) / 2 * k, (p[i * 2 + 1] + p[i * 2 + 3]) / 2 * k);
      ctx.lineTo(p[n * 2 - 2] * k, p[n * 2 - 1] * k);
      return;
    }
    ctx.moveTo((p[0] + p[2]) / 2 * k, (p[1] + p[3]) / 2 * k);
    for (let i = 1; i <= n; i++) {
      const a = i % n, b = (i + 1) % n;
      ctx.quadraticCurveTo(p[a * 2] * k, p[a * 2 + 1] * k, (p[a * 2] + p[b * 2]) / 2 * k, (p[a * 2 + 1] + p[b * 2 + 1]) / 2 * k);
    }
    ctx.closePath();
  }
  function ringPath(ctx, curves, k, s, closeOpen) {
    ctx.beginPath();
    for (const c of curves) {
      tracePath(ctx, c, k);
      if (c.open && closeOpen) {
        const p = c.pts;
        if (s.floor != null) { ctx.lineTo(p[p.length - 2] * k, (s.floor + 2) * k); ctx.lineTo(p[0] * k, (s.floor + 2) * k); }
        ctx.closePath();
      }
    }
  }
  function lw(P, k, pal) { return (0.45 + 2.6 * P.weight * P.weight) * k * (pal && pal.riso ? 1.5 : 1); }

  // draw ring i (0 = oldest) of total
  function drawRing(ctx, P, s, i, total, k, pal) {
    const curves = s.rings[i], t = total > 1 ? i / (total - 1) : 1;
    const style = P.style;
    if (style === 1) {
      ringPath(ctx, curves, k, s, true);
      const bands = pal.bands;
      ctx.fillStyle = pal.riso ? rgba(bands[i % bands.length], 0.5) : bands[i % bands.length];
      ctx.fill();
      ctx.strokeStyle = pal.riso ? rgba(pal.ink, 0.8) : rgba(pal.ink, 0.55);
      ctx.lineWidth = lw(P, k) * 0.6;
      ctx.stroke();
    } else {
      ringPath(ctx, curves, k, s, false);
      ctx.strokeStyle = grad(pal.stops, t);
      ctx.globalAlpha = pal.riso ? 0.9 : 0.55 + 0.45 * t;
      ctx.lineWidth = lw(P, k, pal) * (0.7 + 0.3 * t);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  function drawLive(ctx, P, s, k, pal, final) {
    const curves = s.done ? s.rings[s.rings.length - 1] : liveCurves(s);
    const style = P.style;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (style === 2) {
      ringPath(ctx, curves, k, s, true);
      ctx.fillStyle = pal.fill; ctx.fill();
      // growth lines faintly inside the flesh
      ctx.save(); ctx.clip();
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < s.rings.length - 1; i++) { ringPath(ctx, s.rings[i], k, s, false); ctx.strokeStyle = pal.dark ? '#ffffff' : pal.bg; ctx.lineWidth = lw(P, k) * 0.6; ctx.stroke(); }
      ctx.restore();
      ringPath(ctx, curves, k, s, false);
      ctx.strokeStyle = pal.ink; ctx.lineWidth = lw(P, k); ctx.stroke();
    } else if (style === 3) {
      ringPath(ctx, curves, k, s, false);
      ctx.strokeStyle = pal.ink; ctx.lineWidth = lw(P, k) * 1.4; ctx.stroke();
    } else if (style === 1) {
      if (!s.done) { ringPath(ctx, curves, k, s, true); ctx.fillStyle = pal.bands[s.rings.length % pal.bands.length]; ctx.fill(); }
      ringPath(ctx, curves, k, s, false);
      ctx.strokeStyle = pal.ink; ctx.lineWidth = lw(P, k) * 1.1; ctx.stroke();
    } else {
      ringPath(ctx, curves, k, s, false);
      ctx.strokeStyle = pal.stops[pal.stops.length - 1]; ctx.lineWidth = lw(P, k) * 1.25; ctx.stroke();
    }
  }
  function liveCurves(s) {
    if (s.liveIter === s.iter && s.live) return s.live;
    const out = [];
    for (let c = 0; c < s.heads.length; c++) {
      let i = s.heads[c], guard = 0;
      if (s.open[c]) while (s.prv[i] >= 0 && guard++ < 1e5) i = s.prv[i];
      const st = i, pts = [];
      guard = 0;
      do { pts.push(s.X[i], s.Y[i]); i = s.nxt[i]; } while (i >= 0 && i !== st && guard++ < 1e5);
      out.push({ pts, open: s.open[c] });
    }
    s.live = out; s.liveIter = s.iter;
    return out;
  }
  function drawSetting(ctx, P, s, k, pal) {
    const B = s.bound;
    ctx.strokeStyle = rgba(pal.rule, 0.7);
    ctx.lineWidth = Math.max(1, 1.2 * k);
    if (B.kind === 1) { ctx.beginPath(); ctx.arc(B.cx * k, B.cy * k, (B.r + 6) * k, 0, TAU); ctx.stroke(); }
    if (s.floor != null) { ctx.beginPath(); ctx.moveTo(s.box.x0 * k, (s.floor + 2) * k); ctx.lineTo(s.box.x1 * k, (s.floor + 2) * k); ctx.stroke(); }
  }
  function drawFrameRule(ctx, P, s, W, H, pal) {
    if (P.margin < 0.3 && s.bound.kind !== 2) return;
    const k = H / VH, m = s.bound.kind === 2 ? (s.m - 6) * k : s.m * k * 0.5;
    ctx.strokeStyle = rgba(pal.rule, 0.75);
    ctx.lineWidth = Math.max(1, 1.1 * k);
    ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  }

  // full vector render (final frame and export)
  function drawAll(ctx, P, s, W, H) {
    const pal = PALETTES[P.palette], k = H / VH;
    paper(ctx, pal, W, H);
    drawFrameRule(ctx, P, s, W, H, pal);
    drawSetting(ctx, P, s, k, pal);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (pal.riso) ctx.globalCompositeOperation = 'multiply';
    const total = s.rings.length;
    if (P.style === 0) {
      if (pal.glow) glow(ctx, P, s, W, H, pal);
      for (let i = 0; i < total; i++) drawRing(ctx, P, s, i, total, k, pal);
    } else if (P.style === 1) {
      for (let i = total - 1; i >= 0; i--) drawRing(ctx, P, s, i, total, k, pal);
    }
    ctx.restore();
    drawLive(ctx, P, s, k, pal, true);
  }
  function glow(ctx, P, s, W, H, pal) {
    const f = 0.2, off = document.createElement('canvas');
    off.width = Math.max(4, Math.round(W * f)); off.height = Math.max(4, Math.round(H * f));
    const g = off.getContext('2d'), k = H / VH * f;
    g.lineJoin = 'round';
    for (let i = Math.max(0, s.rings.length - 4); i < s.rings.length; i++) { ringPath(g, s.rings[i], k, s, false); g.strokeStyle = grad(pal.stops, i / Math.max(1, s.rings.length - 1)); g.lineWidth = Math.max(1, 3 * k); g.stroke(); }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.2; ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ module */
  C.register({
    id: 'differential-growth',
    name: 'Differential Growth',
    group: 'process',
    order: 7,
    renderer: '2d',
    animated: true,
    restartDelay: 90,
    subtitle: 'Buckling by growth',
    about: 'A loop of nodes is held together by springs to its neighbours, smoothed toward their midpoint, and pushed apart by every other node within the repulsion radius; any edge that stretches past the maximum length splits in two. The line grows faster than the room around it, so it buckles the way lettuce leaves, brain coral and cortical gyri do. Rings are snapshots of the growing line drawn nested like growth rings, and the look is named from the measured convolution (perimeter² / 4π·area).',
    formats: [0, 1, 2, 3],
    formatOdds: [2.5, 2.5, 1.4, 0.6],
    defaults: { seed: 1618, format: 1, palette: 2 },
    palettes: PALETTES,
    paletteOdds: [2.5, 1.6, 1.8, 1.4, 1.6, 1.2, 0.9, 0.9],
    params: [
      { k: 'start', g: 'Seed', label: 'Start', type: 'select', options: STARTS, def: 0 },
      { k: 'boundary', g: 'Seed', label: 'Boundary', type: 'select', options: BOUNDS, def: 0 },
      { k: 'extent', g: 'Seed', label: 'Extent', min: 0, max: 1, step: 0.01, def: 0.55, names: [[0, 'Bud'], [0.25, 'Colony'], [0.55, 'Sprawl'], [0.85, 'Flood']] },
      { k: 'margin', g: 'Seed', label: 'Margin', min: 0, max: 1, step: 0.01, def: 0.35, names: [[0, 'Full bleed'], [0.02, 'Narrow'], [0.3, 'Plate'], [0.7, 'Wide']] },
      { k: 'repulsion', g: 'Forces', label: 'Repulsion radius', min: 0, max: 1, step: 0.01, def: 0.5, names: [[0, 'Fine'], [0.25, 'Medium'], [0.55, 'Coarse'], [0.8, 'Bold']] },
      { k: 'repulsionForce', g: 'Forces', label: 'Repulsion', min: 0, max: 1, step: 0.01, def: 0.5, names: [[0, 'Soft'], [0.35, 'Firm'], [0.7, 'Hard']] },
      { k: 'attraction', g: 'Forces', label: 'Attraction', min: 0, max: 1, step: 0.01, def: 0.45, names: [[0, 'Slack'], [0.35, 'Elastic'], [0.7, 'Taut']] },
      { k: 'alignment', g: 'Forces', label: 'Alignment', min: 0, max: 1, step: 0.01, def: 0.45, names: [[0, 'Jagged'], [0.25, 'Supple'], [0.6, 'Smooth'], [0.85, 'Fluid']] },
      { k: 'edge', g: 'Growth', label: 'Max edge length', min: 0, max: 1, step: 0.01, def: 0.4, names: [[0, 'Fine'], [0.35, 'Even'], [0.7, 'Coarse']] },
      { k: 'growth', g: 'Growth', label: 'Growth rate', min: 0, max: 1, step: 0.01, def: 0.35, names: [[0, 'Stretch only'], [0.05, 'Slow'], [0.3, 'Steady'], [0.6, 'Vigorous'], [0.85, 'Rampant']] },
      { k: 'zone', g: 'Growth', label: 'Growth zone', min: 0, max: 1, step: 0.01, def: 0.8, names: [[0, 'Diffuse'], [0.35, 'Mixed'], [0.7, 'Marginal']] },
      { k: 'patch', g: 'Growth', label: 'Patchiness', min: 0, max: 1, step: 0.01, def: 0.2, names: [[0, 'Uniform'], [0.2, 'Mottled'], [0.55, 'Patchy'], [0.85, 'Zoned']] },
      { k: 'style', g: 'Drawing', label: 'Style', type: 'select', options: STYLES, def: 0 },
      { k: 'rings', g: 'Drawing', label: 'Rings', min: 0, max: 1, step: 0.01, def: 0.4, names: [[0, 'Few'], [0.3, 'Annual'], [0.6, 'Close'], [0.85, 'Laminated']] },
      { k: 'weight', g: 'Drawing', label: 'Stroke weight', min: 0, max: 1, step: 0.01, def: 0.3, names: [[0, 'Hairline'], [0.25, 'Fine'], [0.55, 'Pen'], [0.85, 'Brush']] },
    ],

    randomize(R) {
      const g = (lo, hi) => lo + (hi - lo) * (R() + R()) / 2;
      const o = {};
      o.start = C.pickWeighted(R, [3, 2, 1.3, 1.2]);
      o.boundary = C.pickWeighted(R, [3, 1.3, 1]);
      o.style = C.pickWeighted(R, [4, 2.2, 1.2, 0.6]);
      o.extent = g(0.3, 0.95);
      o.margin = R() < 0.12 ? R.range(0, 0.02) : g(0.2, 0.7);
      o.repulsion = g(0.12, 0.8);
      o.repulsionForce = g(0.3, 0.8);
      o.attraction = g(0.2, 0.8);
      o.alignment = g(0.2, 0.8);
      o.edge = g(0.2, 0.7);
      o.growth = R() < 0.12 ? R.range(0, 0.05) : g(0.12, 0.7);
      if (o.start === 2) { o.repulsion = g(0.3, 0.8); o.boundary = R() < 0.2 ? 2 : 0; }
      o.patch = R() < 0.4 ? g(0, 0.15) : g(0.2, 0.9);
      o.zone = R() < 0.25 ? g(0, 0.4) : g(0.55, 1);
      o.rings = g(0.2, 0.8);
      o.weight = g(0.1, 0.5);
      if (o.style === 1) o.rings = g(0.1, 0.55);
      if (o.style >= 2) o.weight = g(0.25, 0.6);
      return o;
    },

    traitName(k, P) {
      if (k === 'rings') return `${Math.round(5 + 45 * P.rings * P.rings)} rings`;
      return null;
    },
    caption(P) {
      const { m } = traits(P);
      const pal = PALETTES[P.palette].name;
      const look = lookName(P, m);
      const where = ['in open water', 'inside a circular wall', 'inside the frame'][P.boundary];
      const how = P.start === 2 ? `a pinned baseline ruffled to ${m.ruffle.toFixed(1)}× its length` : P.start === 1 ? 'a colony of cells' : P.start === 3 ? 'a wide ring' : 'a single cell';
      const style = ['drawn as growth rings', 'in banded layers', 'filled', 'in outline'][P.style];
      return `${look} in ${pal}: ${how} grown ${where}, ${style}.`;
    },
    sheet(P) {
      const { m, measured } = traits(P);
      const d = derived(P);
      const approx = measured ? '' : '≈ ';
      return [
        ['Look', lookName(P, m)],
        ['Palette', PALETTES[P.palette].name],
        ['Start', STARTS[P.start]],
        ['Boundary', BOUNDS[P.boundary]],
        [P.start === 2 ? 'Ruffle' : 'Convolution', P.start === 2 ? `${approx}${m.ruffle.toFixed(1)}×` : `${convolutionName(m.q)} (${approx}${m.q.toFixed(1)})`],
        ['Repulsion radius', `${C.traitName(this, 'repulsion', P)} (${d.R.toFixed(1)})`],
        ['Max edge', `${C.traitName(this, 'edge', P)} (${d.maxEdge.toFixed(1)})`],
        ['Growth', C.traitName(this, 'growth', P)],
        ['Patchiness', C.traitName(this, 'patch', P)],
        ['Nodes', measured ? m.nodes.toLocaleString('en') : `≤ ${d.cap.toLocaleString('en')}`],
        ['Style', `${STYLES[P.style]}${P.style < 2 ? ', ' + C.traitName(this, 'rings', P) : ''}`],
      ];
    },

    setup(p) { return { s: null, layer: null }; },
    start(p, P, st) {
      st.s = newState(P);
      st.drawn = 0;
      st.frames = 0;
      st.layerKey = null;
    },
    frame(p, P, st) {
      const s = st.s;
      if (!s) return false;
      const t0 = performance.now();
      let it = 0;
      st.frames = (st.frames || 0) + 1;
      const per = Math.min(16, 1 + Math.floor(st.frames / 60));
      while (!s.done && it < per && performance.now() - t0 < 11) { step(s, P); it++; }
      const ctx = p.drawingContext, W = p.width, H = p.height, k = H / VH, pal = PALETTES[P.palette];
      if (s.done) { drawAll(ctx, P, s, W, H); if (!MEASURED.has(s.key)) measure(s, P); return false; }
      // incremental: rings are immutable, so they live on a cached layer
      const pd = p.pixelDensity(), lw_ = Math.round(W * pd), lh_ = Math.round(H * pd);
      if (!st.layer || st.lw !== lw_ || st.lh !== lh_ || st.layerKey !== s) {
        st.layer = document.createElement('canvas'); st.layer.width = P.style === 1 ? lw_ : 1; st.layer.height = P.style === 1 ? lh_ : 1;
        st.lw = lw_; st.lh = lh_;
        st.bgLayer = document.createElement('canvas'); st.bgLayer.width = lw_; st.bgLayer.height = lh_;
        const b = st.bgLayer.getContext('2d'); b.scale(pd, pd); paper(b, pal, W, H); drawFrameRule(b, P, s, W, H, pal); drawSetting(b, P, s, k, pal);
        st.layerKey = s; st.drawn = 0;
      }
      // Rings draw straight onto the paper layer (one blit per frame); Banded needs its own layer
      const L = (P.style === 1 ? st.layer : st.bgLayer).getContext('2d');
      L.setTransform(pd, 0, 0, pd, 0, 0);
      L.lineJoin = 'round'; L.lineCap = 'round';
      const est = Math.max(s.rings.length, s.ringPlan.length + 1);
      while (st.drawn < s.rings.length) {
        if (P.style === 0) { L.globalCompositeOperation = pal.riso ? 'multiply' : 'source-over'; drawRing(L, P, s, st.drawn, est, k, pal); }
        else if (P.style === 1) { L.globalCompositeOperation = 'destination-over'; drawRing(L, P, s, st.drawn, est, k, pal); }
        st.drawn++;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(st.bgLayer, 0, 0);
      ctx.restore();
      if (P.style === 1) {
        drawLive(ctx, P, s, k, pal, false);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(st.layer, 0, 0); ctx.restore();
      } else drawLive(ctx, P, s, k, pal, false);
      return true;
    },
    progress(st) { const s = st.s; return s ? Math.min(1, 0.92 * Math.log(s.n / s.n0) / Math.log(s.cap / s.n0) + s.relax / 50 * 0.08) : 0; },
    exportAt(p, P, W, H, st) {
      let s = st.s;
      if (!s || s.key !== simKey(P)) s = newState(P);
      let guard = 0;
      while (!s.done && guard++ < 4000) step(s, P);
      if (!MEASURED.has(s.key)) measure(s, P);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawAll(c.getContext('2d'), P, s, W, H);
      return c;
    },
  });
})();
