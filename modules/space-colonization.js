/* Space Colonization — Runions et al. 2005 (leaf venation) / 2007 (trees).
   Attractor points ("auxin sources") fill an envelope. Each attractor pulls
   its nearest vein node (open venation) or every node in its relative
   neighbourhood (closed venation); pulled nodes grow one segment toward the
   mean direction; attractors inside the kill distance are removed. Branch
   radii follow the pipe model: r^γ = Σ child r^γ. All geometry lives in
   virtual units (height 1000) so exportAt redraws it crisply at any size. */
(function () {
  'use strict';
  const C = window.Cabinet;
  const TAU = Math.PI * 2;
  const VH = 1000;
  const MAX_NODES = 60000;

  const FORMS = ['Tree', 'Leaf', 'Roots', 'Lightning', 'Sea fan', 'Mycelium'];
  const TREE = 0, LEAF = 1, ROOTS = 2, BOLT = 3, FAN = 4, MYC = 5;

  const PALETTES = [
    { name: 'Botanical ink', colors: ['#1c1915', '#5b5246', '#a23f2b', '#f1ece0'], bg: '#f1ece0', ink: '#1c1915', tip: '#6a6154', accent: '#a23f2b', blade: '#ddd6c1', rule: '#1c1915' },
    { name: 'Herbarium', colors: ['#4e3a22', '#7e7440', '#c28a2e', '#e7dfc8'], bg: '#e7dfc8', ink: '#4e3a22', tip: '#7e7440', accent: '#c28a2e', blade: '#cfc591', rule: '#6b5a3c' },
    { name: 'Blueprint', colors: ['#f2f6fb', '#9fc0e6', '#ffffff', '#1b4a86'], bg: '#1b4a86', ink: '#f2f6fb', tip: '#9fc0e6', accent: '#ffffff', blade: '#24589a', rule: '#cfe0f5', grid: '#3a68a3', dark: true },
    { name: 'Gold on black', colors: ['#e2b85a', '#8c6a2c', '#f6e3a4', '#0f0e0c'], bg: '#0f0e0c', ink: '#e2b85a', tip: '#7d5f27', accent: '#f6e3a4', blade: '#1d1a14', rule: '#6d5526', glow: 0.35, dark: true },
    { name: 'Sumi', colors: ['#0e0e0e', '#5a5a58', '#b8322a', '#ebe5d6'], bg: '#ebe5d6', ink: '#0e0e0e', tip: '#6e6c66', accent: '#b8322a', blade: '#dcd5c2', rule: '#2a2a28', bleed: 0.13 },
    { name: 'Verdigris', colors: ['#24584b', '#79a592', '#c4552e', '#e9e5d9'], bg: '#e9e5d9', ink: '#24584b', tip: '#85ad9a', accent: '#c4552e', blade: '#d3dccd', rule: '#24584b' },
    { name: 'Neon', colors: ['#ff2fd2', '#2ef2ff', '#d8ff3a', '#0b0618'], bg: '#0b0618', ink: '#ff2fd2', tip: '#2ef2ff', accent: '#d8ff3a', blade: '#150c2a', rule: '#5b2a86', glow: 0.8, dark: true },
  ];

  /* ------------------------------------------------------------------ utils */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    const A = hexRGB(a), B = hexRGB(b);
    return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
  }
  function rgba(h, a) { const c = hexRGB(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function ihash(i) { i = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); i ^= i >>> 13; i = Math.imul(i, 0xc2b2ae35); i ^= i >>> 16; return (i >>> 0) / 4294967296; }

  let GRAIN = null;   // shared paper-grain tile (fixed seed, created once)
  function grainTile() {
    if (GRAIN) return GRAIN;
    const n = 256, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n), R = C.rng(7741);
    for (let i = 0; i < n * n; i++) {
      const v = 128 + (R() + R() + R() - 1.5) * 70;
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    GRAIN = c;
    return c;
  }
  function paper(ctx, pal, W, H) {
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    const s = Math.max(1, H / 900);
    ctx.save();
    ctx.globalAlpha = pal.dark ? 0.05 : 0.07;
    ctx.globalCompositeOperation = pal.dark ? 'screen' : 'multiply';
    const pat = ctx.createPattern(grainTile(), 'repeat');
    if (pat.setTransform) pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.dark ? 'rgba(0,0,0,0.35)' : 'rgba(60,40,10,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------------------------ geometry */
  function derived(P) {
    const D = (3.2 + 8.8 * P.internode) * (P.form === LEAF ? 0.8 : 1);   // segment length (virtual units)
    const dk = D * (1.35 + 4.2 * P.kill);                    // kill distance
    let di = dk * 1.4 + 16 + 250 * P.influence * P.influence; // influence radius
    if (P.form === LEAF) di = di * 1.6 + 90;               // a blade's sources reach their nearest vein
    if (P.venation === 1) di = Math.min(di, dk * 7 + 20);
    const perArea = (4 + 70 * Math.pow(P.density, 1.5)) * (P.form === LEAF ? 1.5 : 1);   // attractors per 100×100 units
    const rt = 0.45 + 1.9 * P.weight * P.weight;               // tip radius
    return { D, dk, di, perArea, rt };
  }

  // Leaf blade: half-width as a function of t (0 = base, 1 = apex)
  function leafShape(R) {
    const kind = C.pickWeighted(R, [3, 2, 2, 1.5, 1.2]);    // ovate, elliptic, lanceolate, obovate, lobed
    const a = [0.62, 1.0, 0.8, 1.55, 0.9][kind];
    const b = [0.75, 0.9, 1.25, 0.8, 0.7][kind];
    const wr = [0.42, 0.34, 0.2, 0.36, 0.44][kind] * R.range(0.85, 1.15);
    const teeth = R() < 0.55 ? R.int(26, 52) : 0;
    const serr = teeth ? R.range(0.015, 0.045) : 0;
    const lobes = kind === 4 ? R.int(3, 5) : 0;
    const asym = R.range(-0.05, 0.05);
    const tipAc = R.range(0.0, 0.5);
    return { kind, a, b, wr, teeth, serr, lobes, asym, tipAc };
  }
  function leafHalf(sh, t, side) {
    if (t <= 0 || t >= 1) return 0;
    let w = Math.pow(Math.sin(Math.PI * Math.pow(t, sh.a)), sh.b);
    w *= 1 - sh.tipAc * Math.pow(t, 6);                          // acuminate tip
    if (sh.lobes) w *= 0.62 + 0.38 * Math.pow(Math.abs(Math.cos(Math.PI * sh.lobes * Math.pow(t, 0.9))), 0.7);
    if (sh.teeth) { const f = (t * sh.teeth) % 1; w *= 1 - sh.serr * (1 - f) * 1.1; }
    return sh.wr * w * (side < 0 ? 1 + sh.asym : 1 - sh.asym);
  }

  // Build the specimen: envelope, root nodes, axis, drawing transform
  function layout(P) {
    const R = C.rng(P.seed ^ 0x51f3);
    const a = C.FORMATS[P.format].a, VW = VH * a;
    const m = VH * (P.margin < 0.02 ? 0.015 : 0.03 + 0.1 * P.margin);
    const box = { x0: m, y0: m, x1: VW - m, y1: VH - m };
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    const E = { VW, m, box, form: P.form, R, rot: 0, tx: 0, ty: 0, dynamic: false, roots: [], axis: [0, -1], radial: false };
    const fourier = (n, amp) => { const c = []; for (let k = 2; k <= n; k++) c.push([k, R.range(0, TAU), amp * R.range(0.3, 1) / Math.sqrt(k - 1)]); return (th) => { let s = 1; for (const [k, ph, am] of c) s += am * Math.cos(k * th + ph); return s; }; };

    if (P.form === TREE) {
      const cx = VW / 2 + R.range(-0.04, 0.04) * bw;
      const top = box.y0 + bh * 0.02, bot = box.y0 + bh * R.range(0.56, 0.74);
      const ry = (bot - top) / 2, cy = top + ry;
      const rx = Math.min(bw / 2 * 0.98, ry * R.range(0.8, 1.35) * Math.max(1, a * 0.9));
      const rf = fourier(6, 0.16);
      const vase = R.range(-0.25, 0.3);
      E.inside = (x, y) => { const dx = (x - cx) / rx, dy = (y - cy) / ry; const w = 1 + vase * -dy; const r = Math.hypot(dx / w, dy); return r < rf(Math.atan2(dy, dx / w)) * 0.93; };
      E.bbox = [cx - rx * 1.4, top - ry * 0.3, cx + rx * 1.4, bot + ry * 0.2];
      E.area = Math.PI * rx * ry;
      E.roots = [[cx + R.range(-0.02, 0.02) * bw, box.y1 - bh * 0.015]];
      E.axis = [0, -1];
      E.ground = [cx, box.y1 - bh * 0.015, rx * 0.9];
      E.densityMul = 2.2;
    } else if (P.form === LEAF) {
      const sh = leafShape(R);
      E.leaf = sh;
      E.dynamic = true;
      // local coords: base at (0,0), apex at (0,-L). Fit to the box after rotation.
      const land = a > 1.2;
      E.rot = land ? (R() < 0.5 ? -1 : 1) * R.range(0.95, 1.35) : R.range(-0.2, 0.2);
      const pet = 0.1;
      // measure extents of the rotated leaf
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      const cr = Math.cos(E.rot), sr = Math.sin(E.rot);
      const addPt = (x, y) => { const X = x * cr - y * sr, Y = x * sr + y * cr; minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y); };
      for (let i = 0; i <= 60; i++) { const t = i / 60; addPt(leafHalf(sh, t, 1), -t); addPt(-leafHalf(sh, t, -1), -t); }
      addPt(0, pet);
      const L = Math.min(bw * 0.94 / (maxX - minX), bh * 0.94 / (maxY - minY));
      E.L = L;
      E.tx = VW / 2 - (minX + maxX) / 2 * L;
      E.ty = VH / 2 - (minY + maxY) / 2 * L;
      E.inside = (x, y) => { const t = -y / L; if (t <= 0.004 || t >= 0.995) return false; return Math.abs(x) < leafHalf(sh, t, x < 0 ? -1 : 1) * L * 0.96; };
      E.bbox = [-L * 0.8, -L * 1.02, L * 0.8, L * (pet + 0.02)];
      E.area = 0;
      for (let i = 0; i < 200; i++) { const t = (i + 0.5) / 200; E.area += (leafHalf(sh, t, 1) + leafHalf(sh, t, -1)) * L * L / 200; }
      E.roots = [[0, L * pet]];
      E.axis = [0, -1];
      E.petiole = L * pet;
    } else if (P.form === ROOTS) {
      const cx = VW / 2 + R.range(-0.03, 0.03) * bw;
      const gy = box.y0 + bh * R.range(0.1, 0.16);
      const depth = box.y1 - gy - bh * 0.01;
      const rx = Math.min(bw / 2 * 0.98, depth * R.range(0.75, 1.2) * Math.max(1, a * 0.85));
      const rf = fourier(7, 0.2);
      const tap = R.range(0.2, 0.7);
      E.inside = (x, y) => { if (y < gy + 8) return false; const dy = (y - gy) / depth, dx = (x - cx) / rx; const w = Math.pow(1 - dy, tap) + 0.02; return Math.abs(dx) < w * rf(dy * 3 + (dx > 0 ? 1 : 0)) * 0.97 && dy < 1; };
      E.bbox = [cx - rx * 1.3, gy, cx + rx * 1.3, box.y1];
      E.area = rx * depth * 1.2;
      E.roots = [[cx, gy]];
      E.axis = [0, 1];
      E.soil = [gy, cx];
      E.density = (x, y) => 1.25 - 0.7 * (y - gy) / depth;    // roots are densest near the surface
    } else if (P.form === BOLT) {
      const cx = box.x0 + bw * R.range(0.3, 0.7);
      const gx = clamp(cx + Math.min(bw, bh) * R.range(-0.25, 0.25), box.x0 + bw * 0.15, box.x1 - bw * 0.15);
      const top = box.y0 + 2, bot = box.y1 - bh * 0.03;
      const spread = Math.min(bw * 0.48, bh * R.range(0.22, 0.4));
      const wob = fourier(5, 0.5);
      E.inside = (x, y) => { const t = (y - top) / (bot - top); if (t < 0.01 || t > 1) return false; const c = cx + (gx - cx) * t + spread * 0.3 * (wob(t * 4) - 1); return Math.abs(x - c) < spread * (0.12 + 0.88 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25) / 2), 0.8)); };
      E.bbox = [box.x0, top, box.x1, bot];
      E.area = spread * 1.1 * (bot - top);
      E.roots = [[cx, top]];
      E.axis = [0, 1];
      E.densityMul = 0.5;
      E.strike = [gx, bot];
      E.horizon = bot;
    } else if (P.form === FAN) {
      const cx = VW / 2 + R.range(-0.03, 0.03) * bw;
      const by = box.y1 - bh * 0.02;
      const ry = bh * R.range(0.86, 0.95), rx = Math.min(bw * 0.49, ry * R.range(0.8, 1.2) * Math.max(1, a * 0.8));
      const rf = fourier(8, 0.12);
      E.inside = (x, y) => { const dx = (x - cx) / rx, dy = (by - y) / ry; if (dy < 0.06) return false; const r = Math.hypot(dx, dy); const th = Math.atan2(dy, dx); const open = Math.min(1, Math.sin(th) * 3.5); return r < rf(th) * 0.97 * open && r > 0.08; };
      E.bbox = [cx - rx * 1.2, by - ry * 1.2, cx + rx * 1.2, by];
      E.area = Math.PI * rx * ry * 0.45;
      E.roots = [[cx, by]];
      E.axis = [0, -1];
      E.holdfast = [cx, by];
    } else {
      const cx = VW / 2, cy = VH / 2;
      const rad = Math.min(bw, bh) * 0.49;
      E.inside = (x, y) => Math.hypot(x - cx, y - cy) < rad * 0.97;
      E.bbox = [cx - rad, cy - rad, cx + rad, cy + rad];
      E.area = Math.PI * rad * rad;
      const k = C.pickWeighted(R, [3, 2, 2, 1]) + 1;
      if (k === 1) E.roots.push([cx + R.range(-0.1, 0.1) * rad, cy + R.range(-0.1, 0.1) * rad]);
      else for (let i = 0; i < k; i++) { const th = i / k * TAU + R.range(-0.5, 0.5), rr = rad * R.range(0.25, 0.6); E.roots.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]); }
      E.radial = true;
      E.dish = [cx, cy, rad];
      E.densityMul = 0.8;
    }
    if (P.form !== LEAF) { const ins = E.inside; E.inside = (x, y) => x > box.x0 + 3 && x < box.x1 - 3 && y > box.y0 + 1 && y < box.y1 - 1 && ins(x, y); }
    return E;
  }

  /* ------------------------------------------------------------------ spatial grid */
  function makeGrid(bb, cell) {
    const gw = Math.max(1, Math.ceil((bb[2] - bb[0]) / cell)), gh = Math.max(1, Math.ceil((bb[3] - bb[1]) / cell));
    const cells = new Array(gw * gh);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    return { x0: bb[0], y0: bb[1], cell, gw, gh, cells };
  }
  function gIdx(g, x, y) {
    const i = clamp(Math.floor((x - g.x0) / g.cell), 0, g.gw - 1), j = clamp(Math.floor((y - g.y0) / g.cell), 0, g.gh - 1);
    return j * g.gw + i;
  }
  function gRange(g, x, y, r) {
    return [clamp(Math.floor((x - r - g.x0) / g.cell), 0, g.gw - 1), clamp(Math.floor((y - r - g.y0) / g.cell), 0, g.gh - 1),
      clamp(Math.floor((x + r - g.x0) / g.cell), 0, g.gw - 1), clamp(Math.floor((y + r - g.y0) / g.cell), 0, g.gh - 1)];
  }

  /* ------------------------------------------------------------------ simulation */
  function simKey(P) { return [P.seed, P.format, P.form, P.venation, P.margin, P.density, P.influence, P.kill, P.internode, P.tropism, P.jitter].join(','); }

  function newState(P) {
    const E = layout(P);
    const d = derived(P);
    const s = {
      key: simKey(P), E, d, R: C.rng((P.seed * 31 + 7) ^ 0x2c1b),
      nx: [], ny: [], par: [], kids: [], root: [], dx: [], dy: [],
      ax: [], ay: [], alive: [], near: [], nd: [], rn: [], dirty: [],
      aliveCount: 0, links: [], iter: 0, done: false, influenced: false, trunk: true,
      S: E.dynamic ? 0.1 : 1, insertIters: 0, stall: 0, closed: P.venation === 1,
    };
    const bb = E.bbox, pad = 60;
    const gbb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    s.ng = makeGrid(gbb, Math.max(10, d.dk));
    s.ag = makeGrid(gbb, Math.max(14, Math.min(60, d.di / 3)));
    for (const r of E.roots) addNode(s, r[0], r[1], -1, 0, 0);
    if (E.form === LEAF) {  // petiole chain up to the blade base
      const n = Math.max(2, Math.round(E.petiole / (d.D * 0.8)));
      for (let i = 1; i <= n; i++) addNode(s, 0, E.petiole * (1 - i / n), s.nx.length - 1, 0, -1);
    }
    s.phase = 0;
    return s;
  }

  function addNode(s, x, y, parent, ddx, ddy) {
    const i = s.nx.length;
    s.nx.push(x); s.ny.push(y); s.par.push(parent); s.kids.push(0); s.dx.push(ddx); s.dy.push(ddy);
    s.root.push(parent < 0 ? i : s.root[parent]);
    if (parent >= 0) s.kids[parent]++;
    s.ng.cells[gIdx(s.ng, x, y)].push(i);
    return i;
  }
  function addAttractor(s, x, y) {
    const i = s.ax.length;
    s.ax.push(x); s.ay.push(y); s.alive.push(1); s.near.push(-1); s.nd.push(1e9); s.rn.push(null); s.dirty.push(1);
    s.ag.cells[gIdx(s.ag, x, y)].push(i);
    s.aliveCount++;
    return i;
  }
  function kill(s, a) { if (s.alive[a]) { s.alive[a] = 0; s.aliveCount--; s.rn[a] = null; } }

  // Static forms: scatter all attractors at once (rejection sampling in the envelope)
  function scatter(s, P) {
    const E = s.E, R = C.rng((P.seed * 17 + 3) ^ 0x7a11);
    const n = Math.round(E.area / 1e4 * s.d.perArea * (E.densityMul || 1));
    const [x0, y0, x1, y1] = E.bbox;
    let tries = 0;
    while (s.ax.length < n && tries < n * 60) {
      tries++;
      const x = R.range(x0, x1), y = R.range(y0, y1);
      if (!E.inside(x, y)) continue;
      if (E.density && R() > E.density(x, y) / 1.3) continue;
      addAttractor(s, x, y);
    }
    if (E.strike) {   // lightning: a line of attractors along the ground so a leader connects
      for (let i = 0; i < 14; i++) addAttractor(s, E.strike[0] + R.range(-60, 60), E.strike[1] - R.range(0, 12));
    }
    for (let i = 0; i < s.nx.length; i++) updateNear(s, i);
  }

  // Leaf: dart-throw new attractors into the (growing) blade, Poisson-disk style
  function insertLeafAttractors(s, P) {
    const E = s.E, R = s.R, S = s.S;
    const bs = Math.sqrt(1e4 / s.d.perArea) * 0.95 / S;   // birth distance (normalized units)
    const bv = s.d.dk * 0.9 / S;
    const [x0, y0, x1, y1] = E.bbox;
    const tries = 360;
    for (let k = 0; k < tries; k++) {
      const x = R.range(x0, x1), y = R.range(y0, y1);
      if (!E.inside(x, y)) continue;
      if (anyWithin(s.ag, s.ax, s.ay, x, y, bs, s.alive)) continue;
      if (anyWithin(s.ng, s.nx, s.ny, x, y, bv, null)) continue;
      const a = addAttractor(s, x, y);
      nearFor(s, a);
    }
  }
  function anyWithin(g, X, Y, x, y, r, alive) {
    const [i0, j0, i1, j1] = gRange(g, x, y, r), r2 = r * r;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = g.cells[j * g.gw + i];
      for (let q = 0; q < c.length; q++) { const k = c[q]; if (alive && !alive[k]) continue; const dx = X[k] - x, dy = Y[k] - y; if (dx * dx + dy * dy < r2) return true; }
    }
    return false;
  }
  // nearest node for a new attractor
  function nearFor(s, a) {
    const r = s.d.di / s.S, x = s.ax[a], y = s.ay[a];
    const [i0, j0, i1, j1] = gRange(s.ng, x, y, r);
    let best = -1, bd = r * r;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = s.ng.cells[j * s.ng.gw + i];
      for (let q = 0; q < c.length; q++) { const k = c[q]; const dx = s.nx[k] - x, dy = s.ny[k] - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = k; } }
    }
    s.near[a] = best; s.nd[a] = best < 0 ? 1e9 : Math.sqrt(bd);
    if (best >= 0 && s.nd[a] < s.d.dk / s.S && !s.closed) kill(s, a);
  }
  // a new node updates the nearest-node records of attractors around it (open venation)
  function updateNear(s, n) {
    const S = s.S, r = s.d.di / S, dk = s.d.dk / S, x = s.nx[n], y = s.ny[n];
    const g = s.ag, [i0, j0, i1, j1] = gRange(g, x, y, r), r2 = r * r;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = g.cells[j * g.gw + i];
      for (let q = 0; q < c.length; q++) {
        const a = c[q];
        if (!s.alive[a]) continue;
        const dx = s.ax[a] - x, dy = s.ay[a] - y, dd = dx * dx + dy * dy;
        if (dd > r2) continue;
        s.dirty[a] = 1;
        const d = Math.sqrt(dd);
        if (d < s.nd[a]) { s.nd[a] = d; s.near[a] = n; }
        if (d < dk && s.closed !== true) kill(s, a);
      }
    }
  }

  // Closed venation: relative neighbourhood of attractor a among its K nearest nodes
  const KN = 18, candI = new Int32Array(KN), candD = new Float64Array(KN);
  function relNeighbours(s, a) {
    const S = s.S, r = s.d.di / S, x = s.ax[a], y = s.ay[a];
    const g = s.ng, [i0, j0, i1, j1] = gRange(g, x, y, r);
    let n = 0, worst = r * r;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = g.cells[j * g.gw + i];
      for (let q = 0; q < c.length; q++) {
        const k = c[q], dx = s.nx[k] - x, dy = s.ny[k] - y, dd = dx * dx + dy * dy;
        if (dd >= worst && n === KN) continue;
        if (dd > r * r) continue;
        // insert sorted
        let p = n < KN ? n++ : KN - 1;
        while (p > 0 && candD[p - 1] > dd) { candD[p] = candD[p - 1]; candI[p] = candI[p - 1]; p--; }
        candD[p] = dd; candI[p] = k;
        if (n === KN) worst = candD[KN - 1];
      }
    }
    const out = [];
    for (let v = 0; v < n; v++) {
      const vi = candI[v], dv = candD[v];
      let ok = true;
      for (let u = 0; u < v; u++) {
        const ui = candI[u], ddx = s.nx[ui] - s.nx[vi], ddy = s.ny[ui] - s.ny[vi];
        if (ddx * ddx + ddy * ddy < dv) { ok = false; break; }
      }
      if (ok) out.push(vi);
    }
    return out;
  }

  function step(s, P) {
    const E = s.E, d = s.d, R = s.R;
    const S = s.S, D = d.D / S, dk = d.dk / S, di = d.di / S;
    const closed = P.venation === 1;
    s.closed = closed;
    if (E.dynamic) {
      if (s.S < 1) s.S = Math.min(1, s.S * 1.0105);
      else s.insertIters++;
      if (s.insertIters < 25) insertLeafAttractors(s, P);
      // the apex is an auxin maximum: keep a source there while the blade expands (midrib)
      if (s.S < 1 && (s.apex == null || !s.alive[s.apex])) {
        const ay = -E.L * 0.975, a = addAttractor(s, 0, ay);
        nearFor(s, a);
        if (!s.alive[a] || s.nd[a] < s.d.dk * 1.3 / s.S) { if (s.alive[a]) kill(s, a); } else s.apex = a;
      }
    }
    const N = s.nx.length;
    const sx = new Float64Array(N), sy = new Float64Array(N), cnt = new Uint16Array(N);
    let any = false;
    const na = s.ax.length;
    for (let a = 0; a < na; a++) {
      if (!s.alive[a]) continue;
      if (!closed) {
        const n = s.near[a];
        if (n < 0 || s.nd[a] > di) continue;
        const dx = s.ax[a] - s.nx[n], dy = s.ay[a] - s.ny[n], l = Math.hypot(dx, dy) || 1;
        sx[n] += dx / l; sy[n] += dy / l; cnt[n]++; any = true;
      } else {
        if (s.dirty[a] || !s.rn[a]) { s.rn[a] = relNeighbours(s, a); s.dirty[a] = 0; }
        const rn = s.rn[a];
        if (!rn.length) continue;
        let arrived = 0;
        for (const n of rn) {
          const dx = s.ax[a] - s.nx[n], dy = s.ay[a] - s.ny[n], l = Math.hypot(dx, dy) || 1;
          if (l < dk) { arrived++; continue; }
          sx[n] += dx / l; sy[n] += dy / l; cnt[n]++; any = true;
        }
        if (arrived === rn.length) {
          // every vein growing toward this source has reached it: fuse them (anastomosis)
          if (rn.length > 1) {
            const v0 = rn[0];
            for (let q = 1; q < rn.length; q++) {
              const v = rn[q];
              if (s.par[v] === v0 || s.par[v0] === v) continue;
              if (Math.hypot(s.nx[v] - s.nx[v0], s.ny[v] - s.ny[v0]) < dk * 2.2) s.links.push(v0, v);
            }
          }
          kill(s, a);
        }
      }
    }
    s.influenced = s.influenced || any;
    const added = [];
    const tStrength = 0.55 * P.tropism + (E.form === BOLT ? 0.35 : 0), jit = P.jitter * P.jitter * (E.form === BOLT ? 2.2 : 1.4);
    if (any) {
      for (let n = 0; n < N; n++) {
        if (!cnt[n]) continue;
        let vx = sx[n], vy = sy[n], l = Math.hypot(vx, vy);
        if (l < 1e-6) { const th = R() * TAU; vx = Math.cos(th); vy = Math.sin(th); } else { vx /= l; vy /= l; }
        let ax = E.axis[0], ay = E.axis[1];
        if (E.radial) { const r0 = s.root[n]; ax = s.nx[n] - s.nx[r0]; ay = s.ny[n] - s.ny[r0]; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al; }
        vx += ax * tStrength; vy += ay * tStrength;
        if (jit > 0) { const th = R() * TAU, m = jit * R(); vx += Math.cos(th) * m; vy += Math.sin(th) * m; }
        l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
        const x = s.nx[n] + vx * D, y = s.ny[n] + vy * D;
        // refuse near-duplicates (a node pulled equally both ways keeps re-growing the same twig)
        if (anyWithin(s.ng, s.nx, s.ny, x, y, D * 0.35, null)) { s.stuck = (s.stuck || 0) + 1; killNearOf(s, n); continue; }
        added.push(addNode(s, x, y, n, vx, vy));
      }
    } else if (!s.influenced && !E.dynamic) {
      // trunk phase: extend the leader until the crown comes within reach
      for (let r = 0; r < E.roots.length; r++) {
        let n = s.lead ? s.lead[r] : r;
        const vx0 = E.radial ? Math.cos(r * 2.4) : E.axis[0], vy0 = E.radial ? Math.sin(r * 2.4) : E.axis[1];
        const th = R() * TAU, m = 0.12 + P.jitter * 0.3;
        let vx = vx0 + Math.cos(th) * m, vy = vy0 + Math.sin(th) * m;
        const l = Math.hypot(vx, vy); vx /= l; vy /= l;
        const k = addNode(s, s.nx[n] + vx * D, s.ny[n] + vy * D, n, vx, vy);
        added.push(k);
        (s.lead = s.lead || [])[r] = k;
      }
    }
    for (const n of added) updateNear(s, n);
    s.iter++;
    if (added.length === 0) s.stall++; else s.stall = 0;
    const growing = E.dynamic && (s.S < 1 || s.insertIters < 25);
    if ((!growing && (s.aliveCount === 0 || s.stall > 2)) || s.nx.length > MAX_NODES || s.iter > 1400) s.done = true;
    return added.length;
  }
  function killNearOf(s, n) {
    // attractors whose nearest node is n but which n can't reach without duplicating: drop them
    const x = s.nx[n], y = s.ny[n], r = s.d.di / s.S;
    const g = s.ag, [i0, j0, i1, j1] = gRange(g, x, y, r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const a of g.cells[j * g.gw + i]) {
      if (!s.alive[a]) continue;
      if (s.near[a] === n || (s.rn[a] && s.rn[a].indexOf(n) >= 0 && s.rn[a].length === 1)) kill(s, a);
    }
  }

  /* ------------------------------------------------------------------ pipe model */
  function radii(s, P) {
    const N = s.nx.length, g = P.gamma, rt = s.d.rt;
    const acc = new Float64Array(N), r = new Float32Array(N);
    const tipv = Math.pow(rt, g);
    const rmax = VH * (P.form === MYC ? 0.012 : P.form === BOLT ? 0.012 : 0.05);
    for (let i = N - 1; i >= 0; i--) {
      if (s.kids[i] === 0) acc[i] += tipv;
      let v = Math.pow(acc[i], 1 / g);
      v = v / Math.sqrt(1 + (v / rmax) * (v / rmax));
      r[i] = v;
      const p = s.par[i];
      if (p >= 0) acc[p] += acc[i];
    }
    if (P.form === BOLT) {
      // return stroke: the channel from the cloud to the lowest point carries the current
      let lo = 0;
      for (let i = 1; i < N; i++) if (s.ny[i] > s.ny[lo]) lo = i;
      const ch = new Uint8Array(N);
      for (let i = lo; i >= 0; i = s.par[i]) ch[i] = 1;
      const main = rt * 2.6 + 1.2;
      for (let i = 0; i < N; i++) r[i] = ch[i] ? main * (1 - 0.35 * i / N) : Math.min(r[i] * 0.8, main * 0.6);
      s.channel = ch;
      s.channelEnd = lo;
    }
    s.r = r;
    s.rmaxSeen = 0;
    for (let i = 0; i < N; i++) if (r[i] > s.rmaxSeen) s.rmaxSeen = r[i];
    return r;
  }

  /* ------------------------------------------------------------------ drawing */
  function strahler(s) {
    const N = s.nx.length, o = new Uint8Array(N), top = new Uint8Array(N), ties = new Uint8Array(N);
    for (let i = N - 1; i >= 0; i--) {
      if (s.kids[i] === 0) o[i] = 1;
      else o[i] = ties[i] >= 2 ? top[i] + 1 : top[i];
      const p = s.par[i];
      if (p >= 0) { if (o[i] > top[p]) { top[p] = o[i]; ties[p] = 1; } else if (o[i] === top[p]) ties[p]++; }
    }
    let mx = 0; for (let i = 0; i < N; i++) if (o[i] > mx) mx = o[i];
    return mx;
  }

  function drawScene(ctx, P, s, W, H, final) {
    const pal = PALETTES[P.palette], E = s.E;
    const k = H / VH;
    paper(ctx, pal, W, H);
    const r = radii(s, P);
    const sc = E.dynamic ? 1 / s.S : 1;   // keep line widths in world units while the leaf grows
    const xf = (c, kk) => { c.scale(kk, kk); c.translate(E.tx, E.ty); if (E.rot) c.rotate(E.rot); if (E.dynamic) c.scale(s.S, s.S); };
    ctx.save();
    ctx.scale(k, k);
    if (pal.grid) drawGridLines(ctx, pal, E);
    drawSetting(ctx, pal, E, s, P, 'under');
    ctx.restore();
    if (E.form === LEAF) { ctx.save(); xf(ctx, k); drawBlade(ctx, pal, E, s); ctx.restore(); }
    if (pal.glow) drawGlow(ctx, P, s, sc, pal, W, H, k, xf);
    ctx.save();
    xf(ctx, k);
    drawBranches(ctx, P, s, r, sc, pal);
    if (P.tips) drawTips(ctx, P, s, r, sc, pal);
    ctx.restore();
    ctx.save();
    ctx.scale(k, k);
    drawSetting(ctx, pal, E, s, P, 'over');
    ctx.restore();
    if (P.margin >= 0.3) {
      ctx.strokeStyle = rgba(pal.rule, 0.8);
      ctx.lineWidth = Math.max(1, 1.1 * k);
      const m = E.m * k * 0.55;
      ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    }
  }

  function drawGridLines(ctx, pal, E) {
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = 0; x <= E.VW; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, VH); }
    for (let y = 0; y <= VH; y += 50) { ctx.moveTo(0, y); ctx.lineTo(E.VW, y); }
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let x = 0; x <= E.VW; x += 250) { ctx.moveTo(x, 0); ctx.lineTo(x, VH); }
    for (let y = 0; y <= VH; y += 250) { ctx.moveTo(0, y); ctx.lineTo(E.VW, y); }
    ctx.stroke();
  }

  function drawSetting(ctx, pal, E, s, P, layer) {
    if (layer === 'under') {
      if (E.dish) {
        const [cx, cy, rad] = E.dish;
        ctx.fillStyle = pal.dark ? rgba(pal.blade, 0.9) : rgba(pal.blade, 0.45);
        ctx.beginPath(); ctx.arc(cx, cy, rad * 1.01, 0, TAU); ctx.fill();
      }
      if (E.soil) {
        const [gy, cx] = E.soil;
        ctx.fillStyle = rgba(pal.blade, pal.dark ? 0.6 : 0.4);
        ctx.fillRect(E.box.x0, gy, E.box.x1 - E.box.x0, E.box.y1 - gy);
      }
      return;
    }
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    if (E.dish) {
      const [cx, cy, rad] = E.dish;
      ctx.lineWidth = 2.2; ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(cx, cy, rad * 1.01, 0, TAU); ctx.stroke();
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(cx, cy, rad * 1.035, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (E.soil) {
      const [gy] = E.soil;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(E.box.x0, gy); ctx.lineTo(E.box.x1, gy); ctx.stroke();
      // ground symbol: short oblique hatches above the line
      ctx.lineWidth = 1.1; ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (let x = E.box.x0 + 6; x < E.box.x1 - 6; x += 14) { ctx.moveTo(x, gy - 1); ctx.lineTo(x + 7, gy - 9); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (E.ground) {
      const [cx, gy, w] = E.ground;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - w * 0.6, gy); ctx.lineTo(cx + w * 0.6, gy); ctx.stroke();
      ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(cx - w * 0.35, gy + 6); ctx.lineTo(cx + w * 0.4, gy + 6); ctx.moveTo(cx - w * 0.15, gy + 12); ctx.lineTo(cx + w * 0.2, gy + 12); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (E.horizon) {
      ctx.lineWidth = 1.6; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(E.box.x0, E.horizon); ctx.lineTo(E.box.x1, E.horizon); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (E.holdfast) {
      const [cx, by] = E.holdfast, rr = s.r ? s.r[0] : 5;
      ctx.beginPath(); ctx.ellipse(cx, by, rr * 2.2, rr * 0.9, 0, 0, TAU); ctx.fill();
    }
  }

  function bladePath(ctx, E) {
    const sh = E.leaf, L = E.L, n = 240;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i <= n; i++) { const t = i / n; ctx.lineTo(leafHalf(sh, t, 1) * L, -t * L); }
    for (let i = n; i >= 0; i--) { const t = i / n; ctx.lineTo(-leafHalf(sh, t, -1) * L, -t * L); }
    ctx.closePath();
  }
  function drawBlade(ctx, pal, E, s) {
    bladePath(ctx, E);
    ctx.fillStyle = rgba(pal.blade, pal.dark ? 0.9 : 0.55);
    ctx.fill();
    ctx.strokeStyle = rgba(pal.ink, 0.55);
    ctx.lineWidth = 1.1 / s.S;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Branches as polylines: walk the tree depth-first, following the thickest child so a limb
  // stays one continuous chain; chains are cut where the radius bucket changes. Each bucket is
  // one stroked path (round caps and joins), thin buckets first so limbs sit on top.
  const NB = 22;
  function chains(s, r) {
    const N = s.nx.length, par = s.par;
    const start = new Int32Array(N + 1), kids = new Int32Array(N);
    for (let i = 0; i < N; i++) if (par[i] >= 0) start[par[i] + 1]++;
    for (let i = 0; i < N; i++) start[i + 1] += start[i];
    const fill = start.slice(0, N);
    for (let i = 0; i < N; i++) if (par[i] >= 0) kids[fill[par[i]]++] = i;
    const out = [];
    const stack = [];
    for (let i = 0; i < N; i++) if (par[i] < 0) stack.push(i);
    while (stack.length) {
      const c = stack.pop();
      let chain = par[c] >= 0 ? [par[c], c] : [c];
      let cur = c;
      for (;;) {
        const k0 = start[cur], k1 = start[cur + 1];
        if (k0 === k1) break;
        let best = kids[k0];
        for (let q = k0 + 1; q < k1; q++) if (r[kids[q]] > r[best]) best = kids[q];
        for (let q = k0; q < k1; q++) if (kids[q] !== best) stack.push(kids[q]);
        chain.push(best);
        cur = best;
      }
      if (chain.length > 1) out.push(chain);
    }
    return out;
  }
  function drawBranches(ctx, P, s, r, sc, pal) {
    const rt = s.d.rt, rmax = Math.max(s.rmaxSeen, rt * 1.5), lr = Math.log(rmax / rt) || 1;
    const X = s.nx, Y = s.ny;
    const bucket = (v) => clamp(Math.round(Math.log(Math.max(v, rt) / rt) / lr * (NB - 1)), 0, NB - 1);
    const paths = []; for (let b = 0; b < NB; b++) paths.push(null);
    const smooth = P.form !== BOLT;
    const emit = (b, pts) => {
      const q = paths[b] || (paths[b] = new Path2D());
      q.moveTo(X[pts[0]], Y[pts[0]]);
      if (!smooth || pts.length < 3) { for (let k = 1; k < pts.length; k++) q.lineTo(X[pts[k]], Y[pts[k]]); return; }
      for (let k = 1; k < pts.length - 1; k++) q.quadraticCurveTo(X[pts[k]], Y[pts[k]], (X[pts[k]] + X[pts[k + 1]]) / 2, (Y[pts[k]] + Y[pts[k + 1]]) / 2);
      q.lineTo(X[pts[pts.length - 1]], Y[pts[pts.length - 1]]);
    };
    for (const ch of chains(s, r)) {
      let b0 = bucket(r[ch[1]]), seg = [ch[0], ch[1]];
      for (let k = 2; k < ch.length; k++) {
        const b = bucket(r[ch[k]]);
        if (b !== b0) { emit(b0, seg); seg = [ch[k - 1]]; b0 = b; }
        seg.push(ch[k]);
      }
      emit(b0, seg);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (pal.bleed) {   // ink bleeding into absorbent paper around the heavier strokes
      ctx.strokeStyle = rgba(pal.ink, pal.bleed);
      for (let b = 3; b < NB; b++) {
        if (!paths[b]) continue;
        const w = 2 * rt * Math.exp(b / (NB - 1) * lr) * sc;
        ctx.lineWidth = w * 1.6 + 2.2 * sc; ctx.stroke(paths[b]);
        ctx.lineWidth = w * 2.6 + 4 * sc; ctx.stroke(paths[b]);
      }
    }
    for (let b = 0; b < NB; b++) {
      if (!paths[b]) continue;
      ctx.strokeStyle = mix(pal.tip, pal.ink, Math.pow(b / (NB - 1), 0.55));
      ctx.lineWidth = 2 * rt * Math.exp(b / (NB - 1) * lr) * sc;
      ctx.stroke(paths[b]);
    }
    if (s.links.length) {   // anastomoses (closed venation)
      ctx.strokeStyle = mix(pal.tip, pal.ink, 0.2);
      ctx.lineWidth = rt * 2 * sc;
      ctx.beginPath();
      for (let q = 0; q < s.links.length; q += 2) { const a = s.links[q], b = s.links[q + 1]; ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[b], Y[b]); }
      ctx.stroke();
    }
  }

  function drawGlow(ctx, P, s, sc, pal, W, H, k, xf) {
    const f = 0.25, gw = Math.max(8, Math.round(W * f)), gh = Math.max(8, Math.round(H * f));
    const off = document.createElement('canvas'); off.width = gw; off.height = gh;
    const g = off.getContext('2d');
    xf(g, k * f);
    g.strokeStyle = pal.ink; g.lineCap = 'round'; g.lineJoin = 'round';
    const X = s.nx, Y = s.ny, N = s.nx.length;
    g.beginPath();
    for (let i = 0; i < N; i++) { const p = s.par[i]; if (p < 0) continue; g.moveTo(X[p], Y[p]); g.lineTo(X[i], Y[i]); }
    g.lineWidth = (s.d.rt * 3 + 2.5) * sc;
    g.stroke();
    const off2 = document.createElement('canvas'); off2.width = Math.max(4, Math.round(gw / 4)); off2.height = Math.max(4, Math.round(gh / 4));
    off2.getContext('2d').drawImage(off, 0, 0, off2.width, off2.height);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = pal.glow * 0.7;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.globalAlpha = Math.min(1, pal.glow * 1.2);
    ctx.drawImage(off2, 0, 0, W, H);
    ctx.restore();
  }

  function drawTips(ctx, P, s, r, sc, pal) {
    const N = s.nx.length, X = s.nx, Y = s.ny, form = P.form;
    const big = P.tips === 2;
    ctx.save();
    for (let i = 0; i < N; i++) {
      if (s.kids[i] !== 0 || s.par[i] < 0) continue;
      const h = ihash(i * 7 + P.seed);
      const dx = s.dx[i], dy = s.dy[i], ang = Math.atan2(dy, dx);
      const x = X[i], y = Y[i];
      if (form === BOLT) {
        if (big && !(s.channel && s.channel[i])) continue;
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.arc(x, y, (big ? 4 : 1.8) * sc, 0, TAU); ctx.fill();
        continue;
      }
      if (!big) {
        if (form === FAN) {           // octocoral polyps: eight tentacles
          if (h > 0.7) continue;
          const rr = 2.6 * sc;
          ctx.strokeStyle = pal.accent; ctx.lineWidth = 0.7 * sc;
          ctx.beginPath();
          for (let q = 0; q < 8; q++) { const t = q / 8 * TAU; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); }
          ctx.stroke();
          continue;
        }
        if (form === MYC) {           // sporangia on hyphal tips
          if (h > 0.25) continue;
          ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(x + dx * 2 * sc, y + dy * 2 * sc, 1.9 * sc, 0, TAU); ctx.fill();
          continue;
        }
        if (form === ROOTS) {         // root hairs
          ctx.strokeStyle = mix(pal.tip, pal.bg, 0.2); ctx.lineWidth = 0.45 * sc;
          ctx.beginPath();
          for (let q = 0; q < 6; q++) { const t = ang + (q % 2 ? 1 : -1) * (0.9 + 0.4 * ihash(i + q)), bx = x - dx * q * 1.4 * sc, by = y - dy * q * 1.4 * sc; ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(t) * 4 * sc, by + Math.sin(t) * 4 * sc); }
          ctx.stroke();
          continue;
        }
        // buds (tree) / hydathodes (leaf)
        const sz = (form === LEAF ? 1.1 : 2.1 + h * 0.9) * sc;
        ctx.fillStyle = form === LEAF ? pal.ink : mix(pal.accent, pal.ink, 0.25 + 0.3 * h);
        ctx.beginPath(); ctx.ellipse(x + dx * sz * 0.6, y + dy * sz * 0.6, sz * 1.5, sz, ang, 0, TAU); ctx.fill();
        continue;
      }
      // "blossoms"
      if (form === TREE) {
        if (h > 0.42) continue;
        const rr = (2.6 + 1.6 * ihash(i + 99)) * sc, rot = h * TAU;
        ctx.fillStyle = mix(pal.accent, pal.bg, 0.15 + 0.35 * ihash(i + 5));
        ctx.beginPath();
        for (let q = 0; q < 5; q++) { const t = rot + q / 5 * TAU; ctx.moveTo(x, y); ctx.ellipse(x + Math.cos(t) * rr, y + Math.sin(t) * rr, rr * 1.05, rr * 0.7, t, 0, TAU); }
        ctx.fill();
        ctx.fillStyle = pal.dark ? pal.bg : pal.ink;
        ctx.beginPath(); ctx.arc(x, y, rr * 0.35, 0, TAU); ctx.fill();
      } else if (form === LEAF) {     // galls
        if (h > 0.035) continue;
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.arc(x, y, (5 + 5 * ihash(i + 3)) * sc, 0, TAU); ctx.fill();
      } else if (form === ROOTS) {    // nodules
        if (h > 0.5) continue;
        const p = s.par[s.par[i]] >= 0 ? s.par[s.par[i]] : s.par[i];
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.arc(X[p], Y[p], (r[p] + 1.8 + 1.5 * h) * sc, 0, TAU); ctx.fill();
      } else if (form === FAN) {      // open polyps, bigger
        if (h > 0.55) continue;
        ctx.fillStyle = pal.accent;
        const rr = 3.2 * sc;
        ctx.beginPath();
        for (let q = 0; q < 8; q++) { const t = q / 8 * TAU + h; ctx.moveTo(x, y); ctx.ellipse(x + Math.cos(t) * rr, y + Math.sin(t) * rr, rr * 0.9, rr * 0.35, t, 0, TAU); }
        ctx.fill();
      } else {                        // fruiting: bigger sporangia
        if (h > 0.3) continue;
        ctx.fillStyle = pal.accent;
        ctx.beginPath(); ctx.arc(x + dx * 3 * sc, y + dy * 3 * sc, (2.4 + 2 * ihash(i + 1)) * sc, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------ run */
  function init(s, P) {
    if (!s.E.dynamic) scatter(s, P);
    s.phase = 1;
    // pacing: aim for ~4 s of visible growth at 60 fps whatever the segment length
    let far = 0;
    const [x0, y0, x1, y1] = s.E.bbox;
    for (const r of s.E.roots) for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]]) far = Math.max(far, Math.hypot(x - r[0], y - r[1]));
    const est = s.E.dynamic ? 260 : far / s.d.D * (s.E.roots.length > 1 ? 0.6 : 0.95);
    s.rate = clamp(est / 250, 0.35, 4);
    s.acc = 0;
  }
  function runSome(s, P, ms) {
    const t0 = performance.now();
    s.acc += s.rate;
    let n = Math.floor(s.acc);
    s.acc -= n;
    while (n-- > 0 && !s.done && performance.now() - t0 < ms) step(s, P);
  }
  function finish(s, P) { if (s.phase === 0) init(s, P); let guard = 0; while (!s.done && guard++ < 5000) step(s, P); }

  // measured traits, cached per simulation key so names can come from the finished geometry
  const MEASURED = new Map();
  function measure(s, P) {
    let tips = 0; for (let i = 0; i < s.nx.length; i++) if (s.kids[i] === 0) tips++;
    const m = { nodes: s.nx.length, tips, order: strahler(s), loops: s.links.length / 2 };
    MEASURED.set(s.key, m);
    if (MEASURED.size > 200) MEASURED.delete(MEASURED.keys().next().value);
    return m;
  }

  /* ------------------------------------------------------------------ names */
  function tropismName(P) {
    const t = P.tropism, f = P.form;
    const pick = (arr) => { let w = arr[0][1]; for (const [th, n] of arr) if (t >= th) w = n; return w; };
    if (f === TREE) return pick([[-1, 'Weeping'], [-0.45, 'Pendulous'], [-0.12, 'Spreading'], [0.15, 'Ascending'], [0.55, 'Fastigiate']]);
    if (f === ROOTS) return pick([[-1, 'Plagiotropic'], [-0.3, 'Spreading'], [0.15, 'Gravitropic'], [0.55, 'Taproot']]);
    if (f === BOLT) return pick([[-1, 'Meandering'], [-0.2, 'Stepped'], [0.3, 'Direct']]);
    if (f === LEAF) return pick([[-1, 'Recurved'], [-0.3, 'Wide-angled'], [0.1, 'Acute'], [0.5, 'Acrodromous']]);
    if (f === FAN) return pick([[-1, 'Flabellate'], [-0.2, 'Fan'], [0.3, 'Whip']]);
    return pick([[-1, 'Contorted'], [-0.25, 'Diffuse'], [0.2, 'Radiating']]);
  }
  const TIP_NAMES = {
    [TREE]: ['None', 'Buds', 'Blossom'], [LEAF]: ['None', 'Hydathodes', 'Galls'], [ROOTS]: ['None', 'Root hairs', 'Nodules'],
    [BOLT]: ['None', 'Streamers', 'Beads'], [FAN]: ['None', 'Polyps', 'Open polyps'], [MYC]: ['None', 'Sporangia', 'Fruiting'],
  };
  function gammaName(g) {
    const w = g < 1.8 ? 'Massive' : g < 2.25 ? 'Leonardo' : g < 2.7 ? 'Tapered' : g < 3.3 ? 'Murray' : 'Slender';
    return `${w} γ ${g.toFixed(2)}`;
  }

  C.register({
    id: 'space-colonization',
    name: 'Space Colonization',
    group: 'process',
    order: 6,
    renderer: '2d',
    animated: true,
    restartDelay: 90,
    subtitle: 'Branching by competition',
    about: 'Attractor points fill an envelope; each one pulls the nearest vein node, which grows a short segment toward the mean of its pulls, and attractors are removed once a vein comes within the kill distance (Runions et al., leaf venation 2005 and trees 2007). Closed venation lets every node in an attractor’s relative neighbourhood answer, so veins meet and fuse into loops. Branch thickness follows the pipe model, r^γ = Σ r_child^γ: γ = 2 is Leonardo’s rule for trees, γ = 3 is Murray’s law for vessels.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 2, 1.4, 0.5],
    defaults: { seed: 2718, format: 0, palette: 0 },   // form/venation defaults below give a reticulate leaf skeleton
    palettes: PALETTES,
    paletteOdds: [2.6, 2, 1.4, 1.6, 1.5, 1.4, 1],
    params: [
      { k: 'form', g: 'Specimen', label: 'Form', type: 'select', options: FORMS, def: 1 },
      { k: 'venation', g: 'Specimen', label: 'Venation', type: 'select', options: ['Open', 'Closed'], def: 1 },
      { k: 'margin', g: 'Specimen', label: 'Margin', min: 0, max: 1, step: 0.01, def: 0.35, names: [[0, 'Full bleed'], [0.02, 'Narrow'], [0.3, 'Plate'], [0.7, 'Wide']] },
      { k: 'density', g: 'Attractors', label: 'Attractor density', min: 0, max: 1, step: 0.01, def: 0.75, names: [[0, 'Sparse'], [0.25, 'Open'], [0.55, 'Dense'], [0.85, 'Saturated']] },
      { k: 'influence', g: 'Attractors', label: 'Influence radius', min: 0, max: 1, step: 0.01, def: 0.4, names: [[0, 'Near-sighted'], [0.3, 'Local'], [0.6, 'Reaching'], [0.85, 'Far-sighted']] },
      { k: 'kill', g: 'Attractors', label: 'Kill distance', min: 0, max: 1, step: 0.01, def: 0.18, names: [[0, 'Crowded'], [0.25, 'Close'], [0.55, 'Spaced'], [0.8, 'Sparse']] },
      { k: 'internode', g: 'Growth', label: 'Segment length', min: 0, max: 1, step: 0.01, def: 0.15, names: [[0, 'Fine'], [0.25, 'Short'], [0.55, 'Long'], [0.85, 'Coarse']] },
      { k: 'tropism', g: 'Growth', label: 'Tropism', min: -1, max: 1, step: 0.01, def: 0.2 },
      { k: 'jitter', g: 'Growth', label: 'Jitter', min: 0, max: 1, step: 0.01, def: 0.1, names: [[0, 'Straight'], [0.15, 'Supple'], [0.4, 'Wavering'], [0.7, 'Gnarled']] },
      { k: 'gamma', g: 'Drawing', label: 'Pipe exponent', min: 1.6, max: 4, step: 0.05, def: 2.7 },
      { k: 'weight', g: 'Drawing', label: 'Twig weight', min: 0, max: 1, step: 0.01, def: 0.3, names: [[0, 'Hairline'], [0.25, 'Fine'], [0.55, 'Bold'], [0.85, 'Heavy']] },
      { k: 'tips', g: 'Drawing', label: 'Tips', type: 'select', options: ['None', 'Buds', 'Blossoms'], def: 0 },
    ],

    randomize(R) {
      const form = C.pickWeighted(R, [3, 2.2, 1.6, 1.1, 1.3, 1.4]);
      const o = { form };
      const g = (lo, hi) => lo + (hi - lo) * (R() + R()) / 2;
      o.venation = form === LEAF ? (R() < 0.55 ? 1 : 0) : form === FAN ? (R() < 0.7 ? 1 : 0) : form === MYC ? (R() < 0.25 ? 1 : 0) : (R() < 0.08 ? 1 : 0);
      if (form === BOLT) o.venation = 0;
      o.margin = R() < 0.15 ? R.range(0, 0.02) : g(0.25, 0.7);
      o.density = g(0.25, 0.85);
      o.influence = g(0.15, 0.8);
      o.kill = g(0.1, 0.55);
      o.internode = g(0.1, 0.5);
      o.jitter = g(0.05, 0.45);
      o.tropism = g(-0.3, 0.5);
      o.gamma = g(2.0, 3.1);
      o.weight = g(0.2, 0.6);
      o.tips = 0;
      if (form === TREE) { o.venation = 0; o.gamma = g(1.85, 2.7); o.density = g(0.4, 0.95); o.kill = g(0.04, 0.35); o.influence = g(0.25, 0.85); o.internode = g(0.06, 0.35); o.tips = C.pickWeighted(R, [2, 1.2, 1.4]); o.tropism = R() < 0.15 ? g(-0.9, -0.4) : g(-0.1, 0.6); }
      if (form === LEAF) { o.gamma = g(2.2, 3.2); o.weight = g(0.1, 0.4); o.internode = g(0.05, 0.3); o.jitter = g(0, 0.2); o.tips = R() < 0.1 ? 2 : 0; o.influence = g(0.2, 0.6); o.density = g(0.5, 0.95); o.kill = g(0.05, 0.4); }
      if (form === ROOTS) { o.tropism = g(0, 0.7); o.tips = C.pickWeighted(R, [2, 1, 1]); o.gamma = g(1.9, 2.6); }
      if (form === BOLT) { o.format = R() < 0.6 ? 0 : 1; o.jitter = g(0.35, 0.8); o.density = g(0.35, 0.85); o.tropism = g(0.1, 0.8); o.gamma = g(3, 3.8); o.weight = g(0.05, 0.35); o.internode = g(0.2, 0.55); o.tips = R() < 0.25 ? 2 : 0; }
      if (form === FAN) { o.tips = C.pickWeighted(R, [2, 1, 1]); o.tropism = g(-0.3, 0.3); }
      if (form === MYC) { o.gamma = g(3.0, 3.9); o.weight = g(0.05, 0.3); o.jitter = g(0.25, 0.6); o.tropism = g(0.1, 0.6); o.tips = C.pickWeighted(R, [2, 1, 0.6]); o.density = g(0.55, 0.95); o.internode = g(0.05, 0.3); o.kill = g(0.05, 0.3); }
      return o;
    },

    traitName(k, P) {
      if (k === 'tropism') return tropismName(P);
      if (k === 'gamma') return gammaName(P.gamma);
      if (k === 'tips') return TIP_NAMES[P.form][P.tips];
      if (k === 'venation') return P.venation ? (P.form === MYC ? 'Anastomosing' : P.form === FAN || P.form === LEAF ? 'Reticulate' : 'Closed') : 'Open';
      return null;
    },

    caption(P) {
      const t = (k) => C.traitName(this, k, P).toLowerCase();
      const pal = PALETTES[P.palette].name;
      const m = MEASURED.get(simKey(P));
      const ord = m ? `, Strahler order ${m.order}` : '';
      const nouns = {
        [TREE]: `${t('tropism')} tree crown`, [LEAF]: `leaf with ${P.venation ? 'reticulate' : 'open'} venation`,
        [ROOTS]: `${t('tropism')} root system`, [BOLT]: `${t('tropism')} lightning leader`,
        [FAN]: `${P.venation ? 'reticulate' : 'open'} sea fan`, [MYC]: `${P.venation ? 'anastomosing' : 'free'} mycelium`,
      };
      const tips = P.tips ? ` with ${TIP_NAMES[P.form][P.tips].toLowerCase()}` : '';
      const noun = nouns[P.form];
      return `${pal}: ${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}${tips}, grown toward ${t('density')} attractors${ord}.`;
    },

    sheet(P) {
      const m = MEASURED.get(simKey(P));
      const d = derived(P);
      return [
        ['Form', FORMS[P.form]],
        ['Venation', C.traitName(this, 'venation', P)],
        ['Palette', PALETTES[P.palette].name],
        ['Attractors', C.traitName(this, 'density', P)],
        ['Influence', `${C.traitName(this, 'influence', P)} (${Math.round(d.di)})`],
        ['Kill distance', `${C.traitName(this, 'kill', P)} (${Math.round(d.dk)})`],
        ['Segment', `${C.traitName(this, 'internode', P)} (${d.D.toFixed(1)})`],
        ['Tropism', tropismName(P)],
        ['Pipe model', gammaName(P.gamma)],
        ['Strahler order', m ? String(m.order) : '…'],
        ['Tips', m ? `${m.tips.toLocaleString('en')}` : '…'],
        ['Segments', m ? `${m.nodes.toLocaleString('en')}${m.loops ? `, ${m.loops} loops` : ''}` : '…'],
      ];
    },

    setup(p) { return { s: null }; },
    start(p, P, st) {
      st.s = newState(P);
    },
    frame(p, P, st) {
      const s = st.s;
      if (!s) return false;
      if (s.phase === 0) init(s, P);
      else if (!s.done) runSome(s, P, 10);
      const ctx = p.drawingContext;
      drawScene(ctx, P, s, p.width, p.height, s.done);
      if (s.done && !s.measured) { s.measured = measure(s, P); }
      return !s.done;
    },
    progress(st) {
      const s = st.s;
      if (!s || !s.ax.length) return 0;
      if (s.E.dynamic && s.S < 1) return 0.6 * Math.log(s.S / 0.1) / Math.log(10);
      return (s.E.dynamic ? 0.6 : 0) + (s.E.dynamic ? 0.4 : 1) * (1 - s.aliveCount / s.ax.length);
    },
    exportAt(p, P, W, H, st) {
      let s = st.s;
      if (!s || s.key !== simKey(P)) s = newState(P);
      finish(s, P);
      if (!MEASURED.has(s.key)) measure(s, P);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawScene(c.getContext('2d'), P, s, W, H, true);
      return c;
    },
  });
})();
