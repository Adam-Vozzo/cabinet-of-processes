/* Culture — the Physarum tab's slime-mould agents (Jeff Jones's model), grown from an inoculum and
   printed as a stained slide under the microscope. The print follows the method vanity_ibex
   (Jakob Bock) described for his Houdini particle renders: every agent is splatted additively at
   full resolution, with a point size set by how crowded the grid is around it; the brightness is
   then smoothed to the size of a cell, and its slope moves each pixel uphill a few times. Each
   small bump swallows the pixels around it and becomes a cell, while the valleys between them
   barely move and print pale, as membranes. CPU and typed arrays, developed in tiles. */
(function () {
  const C = window.Cabinet;
  const TAU = Math.PI * 2;
  const engine = () => C.physarum;          // physarum.js loads after this file

  /* ---------------- palettes: stains ---------------- */
  // mode 'ink': stains absorb (Beer–Lambert) on the pale light of a brightfield slide.
  // mode 'light': fluorophores glow on black. stains: one per strain. dark: beyond the field stop.
  const PALETTES = [
    { name: 'Pond water', mode: 'ink', bg: '#dcdbd1', stains: ['#7b8a22', '#d47b9c', '#c87a28'], dark: '#141412' },
    { name: 'H&E', mode: 'ink', bg: '#f4edf0', stains: ['#5a3d92', '#e57ea8', '#a9406f'], dark: '#120f14' },
    { name: 'Gram', mode: 'ink', bg: '#efede7', stains: ['#4a2a7a', '#d84f6e', '#8a6aa0'], dark: '#121014' },
    { name: 'Giemsa', mode: 'ink', bg: '#edf0f3', stains: ['#35579b', '#d57aa8', '#7a3e92'], dark: '#0e1015' },
    { name: 'Trichrome', mode: 'ink', bg: '#f1ece4', stains: ['#c1323d', '#3a71b2', '#33281f'], dark: '#141110' },
    { name: 'Spore stain', mode: 'ink', bg: '#ecefe7', stains: ['#2c8a57', '#d4577b', '#8aa53a'], dark: '#0f1210' },
    { name: 'Lugol’s iodine', mode: 'ink', bg: '#efe6d0', stains: ['#9a5a1c', '#d39b36', '#5a391a'], dark: '#15110b' },
    { name: 'Golgi silver', mode: 'ink', bg: '#e6d6a4', stains: ['#1d1916', '#5b4430', '#8d6b3c'], dark: '#120f0a' },
    { name: 'Fluorescence', mode: 'light', bg: '#030406', stains: ['#3d7bff', '#3dff7e', '#ff4a62'], dark: '#000000' },
  ];
  PALETTES.forEach((p) => { p.colors = [p.bg, ...p.stains]; p.paper = p.bg; });

  const INOC = ['Spots', 'Streak', 'Lawn', 'Single colony'];
  // objective: how far the slide is magnified. The colony grows on a grid this many times
  // coarser each way, so the same frame holds fewer, fatter strands of bigger cells
  const OBJ = ['10×', '20×', '40×'], ZOOM = [1, 1.6, 2.5];
  const FIELD = ['Full field', 'Vignetted', 'Field stop'];

  const PARAMS = [
    { k: 'inoc', g: 'Culture', label: 'Inoculation', type: 'select', options: INOC, def: 2 },
    { k: 'species', g: 'Culture', label: 'Strains', min: 1, max: 3, step: 1, def: 2,
      names: [[1, 'Pure culture'], [2, 'Two strains'], [3, 'Three strains']] },
    // agents per grid cell
    { k: 'pop', g: 'Culture', label: 'Population', min: 0.03, max: 1.5, step: 0.005, def: 0.4, scale: 'log' },
    { k: 'rivalry', g: 'Culture', label: 'Rivalry', min: 0, max: 2, step: 0.01, def: 0.6,
      names: [[0, 'Indifferent'], [0.15, 'Wary'], [0.7, 'Territorial'], [1.3, 'Hostile']] },
    { k: 'steps', g: 'Culture', label: 'Incubation', min: 40, max: 2000, step: 10, def: 350, scale: 'log' },

    { k: 'sa', g: 'Motility', label: 'Sensor angle', min: 5, max: 90, step: 0.5, def: 87, unit: '°' },
    { k: 'so', g: 'Motility', label: 'Sensor reach', min: 3, max: 32, step: 0.5, def: 9 },
    { k: 'ra', g: 'Motility', label: 'Turn', min: 5, max: 90, step: 0.5, def: 9, unit: '°' },
    { k: 'wander', g: 'Motility', label: 'Wander', min: 0, max: 1, step: 0.01, def: 0,
      names: [[0, 'Strict'], [0.05, 'Steady'], [0.35, 'Wandering'], [0.7, 'Erratic']] },

    { k: 'deposit', g: 'Attractant', label: 'Secretion', min: 0, max: 1, step: 0.01, def: 0.4 },
    { k: 'decay', g: 'Attractant', label: 'Decay', min: 0.02, max: 0.4, step: 0.005, def: 0.06 },
    // how much of the attractant prints, scattered as granules of slime around the strands
    { k: 'slime', g: 'Attractant', label: 'Slime', min: 0, max: 1, step: 0.01, def: 0.6,
      names: [[0, 'None'], [0.08, 'Trace'], [0.3, 'Veiled'], [0.7, 'Thick']] },

    // in grid cells: the smoothing that decides how big a cell grows
    { k: 'cell', g: 'Mount', label: 'Cell size', min: 0.4, max: 3, step: 0.01, def: 1.2,
      names: [[0.4, 'Minute'], [0.8, 'Small'], [1.4, 'Medium'], [2.2, 'Large']] },
    { k: 'wall', g: 'Mount', label: 'Membranes', min: 0, max: 1, step: 0.01, def: 0.5,
      names: [[0, 'Absent'], [0.08, 'Faint'], [0.35, 'Defined'], [0.7, 'Crisp']] },
    { k: 'gran', g: 'Mount', label: 'Granules', min: 0, max: 1, step: 0.01, def: 0.4,
      names: [[0, 'Fine'], [0.35, 'Grainy'], [0.7, 'Coarse']] },
    { k: 'stain', g: 'Mount', label: 'Stain', min: 0, max: 1, step: 0.01, def: 0.5,
      names: [[0, 'Pale'], [0.25, 'Even'], [0.6, 'Heavy'], [0.85, 'Overstained']] },
    { k: 'field', g: 'Mount', label: 'Field', type: 'select', options: FIELD, def: 1 },
    { k: 'obj', g: 'Mount', label: 'Objective', type: 'select', options: OBJ, def: 1 },
  ];
  const PB = Object.fromEntries(PARAMS.map((p) => [p.k, p]));

  // The colony depends on everything except how long it grows and how it is mounted, so a grown
  // colony can be carried on, or printed again with another stain.
  const NONCORE = ['steps', 'slime', 'cell', 'wall', 'gran', 'stain', 'field', 'palette'];
  const coreKey = (P) => JSON.stringify(Object.assign({}, P, Object.fromEntries(NONCORE.map((k) => [k, 0]))));

  /* ---------------- the culture ---------------- */
  function simParams(P) {
    return { seed: P.seed, format: P.format, margin: 0, cells: Math.round(190000 / (ZOOM[P.obj] * ZOOM[P.obj])), sa: P.sa, ra: P.ra, so: P.so, ss: 1, wander: P.wander,
      deposit: P.deposit, decay: P.decay, pop: P.pop, species: P.species, rivalry: P.rivalry,
      spawn: P.inoc === 3 ? 3 : 0 };
  }
  function makeCulture(P) {
    const S = engine().makeSim(simParams(P));
    // drops and streaks sense bilinearly, so a round colony doesn't grow four spokes along the grid
    if (P.inoc <= 1) S.bil = true;
    if (P.inoc === 0) spots(S, P);
    else if (P.inoc === 1) streaks(S, P);
    return S;
  }
  // agents are seated with the engine's own trig (Math.sin isn't bit-identical across browsers,
  // and the colony is chaotic enough to show it)
  function seat(S, i, px, py, a) {
    const { gw, gh } = S, E = engine();
    px %= gw; if (px < 0) px += gw;
    py %= gh; if (py < 0) py += gh;
    S.x[i] = px >= gw ? 0 : px; S.y[i] = py >= gh ? 0 : py;
    S.hx[i] = E.dcos(a); S.hy[i] = E.dsin(a);
  }

  // spot inoculation: a few drops of each strain, placed apart; a strain's agents are shared
  // among its drops in proportion to their area, heading roughly outward as a drop spreads
  function spots(S, P) {
    const { gw, gh, K, N, sp } = S;
    const R = C.rng((P.seed * 7919 + 0x2c1b) >>> 0);
    const s = Math.min(gw, gh);
    const want = Math.max(K, R.int(3, 7));
    const pts = [];
    for (let tries = 0; pts.length < want && tries < 3000; tries++) {
      const r = s * R.range(0.045, 0.1) * (tries > 1500 ? 0.6 : 1);
      const cx = R.range(0.12, 0.88) * gw, cy = R.range(0.12, 0.88) * gh;
      if (pts.every((q) => Math.sqrt((q.x - cx) * (q.x - cx) + (q.y - cy) * (q.y - cy)) > (q.r + r) * 1.6)) pts.push({ x: cx, y: cy, r, k: pts.length % K });
    }
    const byK = [];
    for (let k = 0; k < K; k++) {
      const own = pts.filter((q) => q.k === k);
      const list = own.length ? own : pts;
      const tot = list.reduce((a, q) => a + q.r * q.r, 0);
      let acc = 0;
      byK.push({ list, cum: list.map((q) => (acc += q.r * q.r / tot)) });
    }
    const E = engine();
    for (let i = 0; i < N; i++) {
      const b = byK[sp[i]], u = R();
      let j = 0; while (j < b.cum.length - 1 && u > b.cum[j]) j++;
      const q = b.list[j], t = R() * TAU, rr = Math.sqrt(R()) * q.r;
      seat(S, i, q.x + E.dcos(t) * rr, q.y + E.dsin(t) * rr, t + (R() - 0.5) * 1.6);
    }
  }

  // a dilution streak per strain: the loop drags the inoculum across the plate in a zigzag and it
  // thins along the way, so the last strokes leave isolated colonies
  function streaks(S, P) {
    const { gw, gh, K, N, sp } = S, E = engine();
    const R = C.rng((P.seed * 104729 + 0x51ea) >>> 0);
    const s = Math.min(gw, gh);
    const paths = [];
    for (let k = 0; k < K; k++) {
      const strokes = R.int(4, 7), len = s * R.range(0.22, 0.4), gap = s * R.range(0.045, 0.075);
      const th = R() * TAU, dx = E.dcos(th), dy = E.dsin(th), nx = -dy, ny = dx;
      const pts = [];
      for (let j = 0; j <= strokes; j++) pts.push([dx * gap * j + nx * (j % 2 ? len : 0), dy * gap * j + ny * (j % 2 ? len : 0)]);
      // centre the zigzag somewhere it fits
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const ox = R.range(0.1 * gw - bx0, Math.max(0.1 * gw - bx0, 0.9 * gw - bx1));
      const oy = R.range(0.1 * gh - by0, Math.max(0.1 * gh - by0, 0.9 * gh - by1));
      const seg = [];
      let total = 0;
      for (let j = 0; j < strokes; j++) {
        const a = [pts[j][0] + ox, pts[j][1] + oy], b = [pts[j + 1][0] + ox, pts[j + 1][1] + oy];
        const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        seg.push({ a, b, l, at: total }); total += l;
      }
      paths.push({ seg, total, w: s * R.range(0.008, 0.016) });
    }
    // (a sum of three uniforms stands in for a gaussian, and u³ for the thinning: no Math.log)
    const gauss = () => (R() + R() + R() - 1.5) * 2;
    for (let i = 0; i < N; i++) {
      const pth = paths[sp[i]], u = R();
      const d = u * u * u * pth.total;
      let q = pth.seg[0];
      for (const g of pth.seg) { if (d >= g.at) q = g; else break; }
      const f = Math.min(1, (d - q.at) / q.l);
      seat(S, i, q.a[0] + (q.b[0] - q.a[0]) * f + gauss() * pth.w, q.a[1] + (q.b[1] - q.a[1]) * f + gauss() * pth.w, R() * TAU);
    }
  }

  /* ---------------- printing ---------------- */
  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // the trail's reference level: a high percentile of where there is any
  function trailRef(S) {
    const { T } = S, n = T.length, stride = Math.max(1, Math.floor(n / 50000)), smp = [];
    for (let i = 0; i < n; i += stride) if (T[i] > 1e-4) smp.push(T[i]);
    if (!smp.length) return 1;
    smp.sort((a, b) => a - b);
    return smp[Math.floor(smp.length * 0.985)];
  }
  // What goes under the microscope: the agents, and the slime they leave. The attractant is
  // scattered as granules, up to a few per cell where it is thick, so it prints as a grainy veil
  // that breaks into cells like the strands themselves.
  // Each granule weighs a share of the strands' own crowding, so Slime reads the same whatever
  // the population: at its thickest, the veil is about as dense as half a strand. Rival strains'
  // veils overlap, so each is thinner when there are more of them.
  const SLIME = 3;             // granules per cell where the trail is at its reference level
  function crowdRef(gw, gh, N, x, y) {
    const D = new Uint16Array(gw * gh);
    for (let i = 0; i < N; i++) { const o = (y[i] | 0) * gw + (x[i] | 0); if (D[o] < 65535) D[o]++; }
    const stride = Math.max(1, Math.floor(N / 20000)), smp = new Float32Array(Math.ceil(N / stride));
    for (let i = 0, j = 0; i < N; i += stride, j++) smp[j] = D[(y[i] | 0) * gw + (x[i] | 0)];
    smp.sort();
    return Math.max(1, smp[Math.floor(smp.length * 0.97)] || 0);
  }
  function slimeOf(S, P) {
    return { kk: SLIME / trailRef(S), wg: P.slime * 0.55 * crowdRef(S.gw, S.gh, S.N, S.x, S.y) / SLIME / Math.sqrt(S.K) };
  }
  function specimen(S, P) {
    const { gw, gh, K, N, x, y, sp, T } = S;
    if (P.slime <= 0) return { gw, gh, K, N, x, y, sp, w: null };
    const { kk, wg } = slimeOf(S, P), n = gw * gh;
    const count = (c, s) => { const l = T[c * K + s] * kk; return ((l < SLIME ? l : SLIME) + hash2(c, s + 17)) | 0; };
    let G = 0;
    for (let c = 0; c < n; c++) for (let s = 0; s < K; s++) G += count(c, s);
    const X = new Float32Array(N + G), Y = new Float32Array(N + G), SP = new Uint8Array(N + G), Wt = new Float32Array(N + G);
    X.set(x); Y.set(y); SP.set(sp); Wt.fill(1, 0, N); Wt.fill(wg, N);
    let q = N;
    for (let c = 0; c < n; c++) {
      const i = c % gw, j = (c / gw) | 0;
      for (let s = 0; s < K; s++) for (let g = count(c, s); g > 0; g--, q++) {
        X[q] = i + hash2(c, s * 64 + g * 2 + 101); Y[q] = j + hash2(c, s * 64 + g * 2 + 102); SP[q] = s;
      }
    }
    return { gw, gh, K, N: N + G, x: X, y: Y, sp: SP, w: Wt };
  }
  // binomial 3×3 blur at grid resolution, clamped edges; result back in a
  function binom(a, t, w, h) {
    for (let j = 0; j < h; j++) {
      const o = j * w;
      for (let i = 0; i < w; i++) t[o + i] = a[o + (i ? i - 1 : 0)] + 2 * a[o + i] + a[o + (i < w - 1 ? i + 1 : i)];
    }
    for (let j = 0; j < h; j++) {
      const o = j * w, u = j ? -w : 0, d = j < h - 1 ? w : 0;
      for (let i = 0; i < w; i++) a[o + i] = (t[o + i + u] + 2 * t[o + i] + t[o + i + d]) / 16;
    }
  }
  // box blur of radius r, clamped edges: along rows a → t, then along columns t → a. The column
  // pass runs row by row with a running sum per column, so it reads memory in order.
  function boxRows(a, t, w, h, r) {
    const inv = 1 / (2 * r + 1);
    for (let j = 0; j < h; j++) {
      const o = j * w;
      let acc = a[o] * (r + 1);
      for (let k = 1; k <= r; k++) acc += a[o + Math.min(w - 1, k)];
      for (let i = 0; i < w; i++) {
        t[o + i] = acc * inv;
        acc += a[o + Math.min(w - 1, i + r + 1)] - a[o + Math.max(0, i - r)];
      }
    }
  }
  function boxCols(t, a, w, h, r, acc) {
    const inv = 1 / (2 * r + 1);
    for (let i = 0; i < w; i++) acc[i] = t[i] * (r + 1);
    for (let k = 1; k <= r; k++) { const o = Math.min(h - 1, k) * w; for (let i = 0; i < w; i++) acc[i] += t[o + i]; }
    for (let j = 0; j < h; j++) {
      const o = j * w, add = Math.min(h - 1, j + r + 1) * w, sub = Math.max(0, j - r) * w;
      for (let i = 0; i < w; i++) { a[o + i] = acc[i] * inv; acc[i] += t[add + i] - t[sub + i]; }
    }
  }
  function boxBlur(a, t, w, h, r) { boxRows(a, t, w, h, r); boxCols(t, a, w, h, r, new Float32Array(w)); }
  function bilin(a, w, h, x, y) {
    x -= 0.5; y -= 0.5;
    if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
    if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, o = y0 * w + x0;
    return (a[o] * (1 - fx) + a[o + 1] * fx) * (1 - fy) + (a[o + w] * (1 - fx) + a[o + w + 1] * fx) * fy;
  }

  // Crowding: agents per grid cell, smoothed. It sets each agent's point size (a lone agent
  // prints as a broad faint disc, one in a packed tube as a small dense one), the exposure
  // reference, and the local level the slope is measured against.
  function prepare(S, P) {
    const { gw, gh, N, x, y, w } = S;
    const D = new Float32Array(gw * gh), T = new Float32Array(gw * gh);
    for (let i = 0; i < N; i++) D[(y[i] | 0) * gw + (x[i] | 0)] += w ? w[i] : 1;
    binom(D, T, gw, gh); binom(D, T, gw, gh);
    const stride = Math.max(1, Math.floor(N / 20000)), smp = new Float32Array(Math.ceil(N / stride));
    for (let i = 0, j = 0; i < N; i += stride, j++) smp[j] = D[(y[i] | 0) * gw + (x[i] | 0)];
    smp.sort();
    const ref = Math.max(0.5, smp[Math.floor(smp.length * 0.97)] || 0);
    const base = 0.55 + 1.3 * P.gran, rmin = 0.45, rmax = base * 3.2;
    const rad = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const d = bilin(D, gw, gh, x[i], y[i]) / ref;
      const r = base / Math.sqrt(d + 0.06);
      rad[i] = r < rmin ? rmin : r > rmax ? rmax : r;
    }
    const Lv = D.slice();
    for (let k = 0; k < 3; k++) boxBlur(Lv, T, gw, gh, 3);
    for (let i = 0; i < Lv.length; i++) Lv[i] += 0.05 * ref;
    return { ref, rad, rmax, Lv };
  }

  // e^−x, tabulated for the stain: 0 ≤ x ≤ EMAX
  const EN = 4096, EMAX = 12, EXP = new Float32Array(EN + 2);
  for (let i = 0; i <= EN + 1; i++) EXP[i] = Math.exp(-i / EN * EMAX);
  const EK = EN / EMAX;
  function expn(x) {
    let f = x * EK;
    if (f >= EN) return EXP[EN];
    const i = f | 0;
    f -= i;
    return EXP[i] + (EXP[i + 1] - EXP[i]) * f;
  }

  function makeLook(P, ref, grain) {
    const pal = PALETTES[P.palette], ink = pal.mode === 'ink';
    const K = P.species;
    const cols = new Float32Array(9);
    pal.stains.slice(0, K).forEach((h, s) => {
      const c = C.hexRGB(h);
      for (let q = 0; q < 3; q++) cols[s * 3 + q] = ink ? -Math.log(Math.max(0.02, c[q])) : c[q];
    });
    const f = P.field, a = C.FORMATS[P.format].a;
    // the field stop's radius in frame heights (0: none); the vignette falls off toward it, or
    // without one toward the corners
    const stop = f === 2 ? 0.485 * Math.min(1, a) : 0, rv = stop || 0.5 * Math.sqrt(a * a + 1);
    return {
      ink, K, cols, bg: C.hexRGB(pal.bg), dark: C.hexRGB(pal.dark),
      kv: 0.5 * Math.pow(5, P.stain) / ref,
      a, stop, irv2: 1 / (rv * rv), vig: [0.07, 0.42, 0.3][f],
      grain: grain === false ? 0 : ink ? 0.016 : 0.02,
    };
  }

  // one pixel: stain amounts t[0..K) (agents per cell) at frame position (u, v) → rgba at d[o]
  function paint(L, t, u, v, d, o, gx, gy) {
    const { K, cols, kv } = L;
    let e0 = 0, e1 = 0, e2 = 0;
    for (let s = 0; s < K; s++) {
      const q = t[s] * kv;
      // ink keeps darkening past the swatch in the densest knots; light saturates
      const w = L.ink ? q / (1 + 0.55 * q) : 1 - expn(q);
      e0 += w * cols[s * 3]; e1 += w * cols[s * 3 + 1]; e2 += w * cols[s * 3 + 2];
    }
    const bg = L.bg;
    let r, g, b;
    if (L.ink) { r = bg[0] * expn(e0); g = bg[1] * expn(e1); b = bg[2] * expn(e2); }
    else { r = bg[0] + (1 - bg[0]) * (1 - expn(e0 * 1.3)); g = bg[1] + (1 - bg[1]) * (1 - expn(e1 * 1.3)); b = bg[2] + (1 - bg[2]) * (1 - expn(e2 * 1.3)); }
    // the microscope's field: light falls off toward the edge, and a field stop crops it round
    const dx = (u - 0.5) * L.a, dy = v - 0.5, r2 = dx * dx + dy * dy;
    const q = r2 * L.irv2, vf = 1 - L.vig * q * q;
    r *= vf; g *= vf; b *= vf;
    if (L.stop) {
      const e = (Math.sqrt(r2) - L.stop) / 0.006;
      if (e > -1) {
        const m = e >= 1 ? 1 : (e + 1) / 2, k = m * m * (3 - 2 * m);
        r += (L.dark[0] - r) * k; g += (L.dark[1] - g) * k; b += (L.dark[2] - b) * k;
      }
    }
    if (L.grain > 0) {
      const n = (hash2(gx, gy) + hash2(gx + 7, gy + 11) - 1) * L.grain;
      r += n; g += n; b += n;
    }
    d[o] = r * 255; d[o + 1] = g * 255; d[o + 2] = b * 255; d[o + 3] = 255;
  }

  // The print, W × H, developed in tiles into the RGBA array out. A generator: it yields now and
  // then so the work can be spread over frames, and yields { x0, y0, x1, y1 } as each tile is done.
  // The heavy loops live in plain functions below, which the engine optimises better.
  const ITER = 4, SLOPE = 3;
  function* develop(S, A, L, P, W, H, out) {
    const { gw, gh, K, N, x, y } = S;
    const sx = W / gw, sy = H / gh, s = Math.sqrt(sx * sy);
    const sig = Math.max(0.6, P.cell * s);
    const rb = Math.max(1, Math.round(sig - 0.5));          // three box passes ≈ a gaussian of sig px
    const step = P.wall * P.cell * 0.8 * s;                 // px per uphill step
    // a tile needs a margin wide enough for the largest point, the blur and the climb
    const halo = Math.ceil(A.rmax * s + 3 * rb + ITER * step + 3);
    const TS = Math.max(256, Math.min(1024, 6 * halo));
    const tx = Math.ceil(W / TS), ty = Math.ceil(H / TS), nt = tx * ty;
    // agents bucketed by the tile that holds their centre
    const tile = new Int32Array(N), first = new Int32Array(nt + 1), order = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      const t = Math.min(ty - 1, (y[i] * sy / TS) | 0) * tx + Math.min(tx - 1, (x[i] * sx / TS) | 0);
      tile[i] = t; first[t + 1]++;
    }
    for (let t = 0; t < nt; t++) first[t + 1] += first[t];
    const fill = first.slice(0, nt);
    for (let i = 0; i < N; i++) order[fill[tile[i]]++] = i;
    yield;
    const bw = TS + 2 * halo, size = bw * bw;
    const D = {
      S, A, L, W, H, out, K, sx, sy, s, step, cellPx: s * s, gsz: Math.max(1, H / 1100),
      F: new Float32Array(size * K),                        // stain per pixel, strains interleaved
      B: new Float32Array(size), T: new Float32Array(size), V: new Float32Array(size * 2),
      acc: new Float32Array(bw), lrow: new Float32Array(gw), t3: new Float32Array(3),
      ox: 0, oy: 0, cw: 0, ch: 0,
    };
    for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) {
      const X0 = i * TS, Y0 = j * TS, X1 = Math.min(W, X0 + TS), Y1 = Math.min(H, Y0 + TS);
      D.ox = X0 - halo; D.oy = Y0 - halo; D.cw = X1 - X0 + 2 * halo; D.ch = Y1 - Y0 + 2 * halo;
      const n = D.cw * D.ch;
      D.F.fill(0, 0, n * K);
      for (let nj = Math.max(0, j - 1); nj <= Math.min(ty - 1, j + 1); nj++) for (let ni = Math.max(0, i - 1); ni <= Math.min(tx - 1, i + 1); ni++) {
        const tt = nj * tx + ni;
        for (let q = first[tt]; q < first[tt + 1]; q += 4096) { splat(D, order, q, Math.min(first[tt + 1], q + 4096)); yield; }
      }
      // brightness, smoothed to the size of a cell
      const { F, B, T } = D;
      if (K === 1) B.set(F.subarray(0, n));
      else for (let o = 0; o < n; o++) { let v = 0; for (let k = 0; k < K; k++) v += F[o * K + k]; B[o] = v; }
      for (let it = 0; it < 3; it++) { boxRows(B, T, D.cw, D.ch, rb); yield; boxCols(T, B, D.cw, D.ch, rb, D.acc); yield; }
      if (step > 0) {
        D.V.fill(0, 0, 2 * n);
        for (let r = 1; r < D.ch - 1; r += 64) { slope(D, r, Math.min(D.ch - 1, r + 64)); yield; }
      }
      for (let r = halo; r < halo + Y1 - Y0; r += 32) { climb(D, r, Math.min(halo + Y1 - Y0, r + 32), halo, halo + X1 - X0); yield; }
      yield { x0: X0, y0: Y0, x1: X1, y1: Y1, done: (j * tx + i + 1) / nt };
    }
  }

  // splat agents order[q0..q1) into the tile: weights (1 − d²/R²)², normalised so every agent
  // lays the same ink whatever its size
  function splat(D, order, q0, q1) {
    const { S, A, F, K, sx, sy, s, cellPx, ox, oy, cw, ch } = D;
    const { x, y, sp, w } = S, rad = A.rad;
    for (let q = q0; q < q1; q++) {
      const a = order[q], k = sp[a];
      const cx = x[a] * sx - ox, cy = y[a] * sy - oy, R = rad[a] * s;
      if (cx < -R || cy < -R || cx > cw + R || cy > ch + R) continue;
      const mass = w ? w[a] * cellPx : cellPx;
      if (R < 1.2) {
        // too small for a disc: share it bilinearly between the four nearest pixels
        const px = cx - 0.5, py = cy - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
        if (x0 >= 0 && y0 >= 0 && x0 + 1 < cw && y0 + 1 < ch) {
          const o = (y0 * cw + x0) * K + k, oc = cw * K;
          F[o] += mass * (1 - fx) * (1 - fy); F[o + K] += mass * fx * (1 - fy);
          F[o + oc] += mass * (1 - fx) * fy; F[o + oc + K] += mass * fx * fy;
        }
        continue;
      }
      const R2 = R * R, iR2 = 1 / R2;
      const ya = Math.ceil(cy - R - 0.5), yb = Math.floor(cy + R - 0.5);
      let norm;
      if (R >= 4) norm = 3 / (Math.PI * R2);
      else {
        const xa = Math.ceil(cx - R - 0.5), xb = Math.floor(cx + R - 0.5);
        let sum = 0;
        for (let yy = ya; yy <= yb; yy++) { const dy = yy + 0.5 - cy; for (let xx = xa; xx <= xb; xx++) { const dx = xx + 0.5 - cx, u = 1 - (dx * dx + dy * dy) * iR2; if (u > 0) sum += u * u; } }
        norm = 1 / sum;
      }
      norm *= mass;
      const y0 = Math.max(0, ya), y1 = Math.min(ch - 1, yb);
      for (let yy = y0; yy <= y1; yy++) {
        const dy = yy + 0.5 - cy, span = R2 - dy * dy;
        if (span <= 0) continue;
        const hw = Math.sqrt(span), row = yy * cw, base = 1 - dy * dy * iR2;
        const xe = Math.min(cw - 1, Math.floor(cx + hw - 0.5));
        for (let xx = Math.max(0, Math.ceil(cx - hw - 0.5)); xx <= xe; xx++) {
          const dx = xx + 0.5 - cx, u = base - dx * dx * iR2;
          if (u > 0) F[(row + xx) * K + k] += u * u * norm;
        }
      }
    }
  }

  // slope, rows [r0, r1) of the tile: a step uphill, its length set by the slope relative to the
  // local level, so thin strands and packed colonies both break into cells
  function slope(D, r0, r1) {
    const { S, A, B, V, lrow, sx, sy, s, step, ox, oy, cw } = D;
    const { gw, gh } = S, Lv = A.Lv;
    const gx0 = Math.max(0, Math.floor(ox / sx) - 1), gx1 = Math.min(gw - 1, Math.ceil((ox + cw) / sx) + 1);
    for (let yy = r0; yy < r1; yy++) {
      // the local level along this row, interpolated between grid rows once
      let gy = (oy + yy + 0.5) / sy - 0.5;
      if (gy < 0) gy = 0; else if (gy > gh - 1.001) gy = gh - 1.001;
      const g0 = (gy | 0) * gw, fy = gy - (gy | 0);
      for (let g = gx0; g <= gx1; g++) lrow[g] = Lv[g0 + g] * (1 - fy) + Lv[g0 + gw + g] * fy;
      for (let xx = 1; xx < cw - 1; xx++) {
        const o = yy * cw + xx;
        const gx = (B[o + 1] - B[o - 1]) * 0.5, gyy = (B[o + cw] - B[o - cw]) * 0.5;
        const m = Math.sqrt(gx * gx + gyy * gyy);
        if (m <= 0) continue;
        let lx = (ox + xx + 0.5) / sx - 0.5;
        if (lx < 0) lx = 0; else if (lx > gw - 1.001) lx = gw - 1.001;
        const l0 = lx | 0, lv = lrow[l0] + (lrow[l0 + 1] - lrow[l0]) * (lx - l0);
        // tanh, as a Padé approximant that reaches 1 at z = 3
        const z = SLOPE * m * s / lv, th = z < 3 ? z * (27 + z * z) / (27 + 9 * z * z) : 1;
        const kk = step * th / m;
        V[2 * o] = gx * kk; V[2 * o + 1] = gyy * kk;
      }
    }
  }

  // rows [r0, r1), columns [c0, c1) of the tile: each pixel climbs, then takes the stain found
  // where it ends up (coordinates here are pixel indices, so a pixel's own value sits at a whole number)
  function climb(D, r0, r1, c0, c1) {
    const { L, F, V, K, W, H, out, t3, step, gsz, ox, oy, cw, ch } = D;
    const umax = cw - 1.001, vmax = ch - 1.001, cK = cw * K, c2 = cw * 2;
    for (let yy = r0; yy < r1; yy++) {
      const Y = oy + yy;
      for (let xx = c0; xx < c1; xx++) {
        let u = xx, v = yy;
        if (step > 0) for (let it = 0; it < ITER; it++) {
          if (u < 0) u = 0; else if (u > umax) u = umax;
          if (v < 0) v = 0; else if (v > vmax) v = vmax;
          const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, o = (y0 * cw + x0) * 2;
          const a0 = (1 - fx) * (1 - fy), a1 = fx * (1 - fy), a2 = (1 - fx) * fy, a3 = fx * fy;
          u += V[o] * a0 + V[o + 2] * a1 + V[o + c2] * a2 + V[o + c2 + 2] * a3;
          v += V[o + 1] * a0 + V[o + 3] * a1 + V[o + c2 + 1] * a2 + V[o + c2 + 3] * a3;
        }
        if (u < 0) u = 0; else if (u > umax) u = umax;
        if (v < 0) v = 0; else if (v > vmax) v = vmax;
        const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, o = (y0 * cw + x0) * K;
        const a0 = (1 - fx) * (1 - fy), a1 = fx * (1 - fy), a2 = (1 - fx) * fy, a3 = fx * fy;
        for (let k = 0; k < K; k++) t3[k] = F[o + k] * a0 + F[o + K + k] * a1 + F[o + cK + k] * a2 + F[o + cK + K + k] * a3;
        const X = ox + xx;
        paint(L, t3, (X + 0.5) / W, (Y + 0.5) / H, out, (Y * W + X) * 4, (X / gsz) | 0, (Y / gsz) | 0);
      }
    }
  }
  // the print of a grown colony, as a develop() generator
  function printer(S, P, W, H, out, grain) {
    const spec = specimen(S, P), A = prepare(spec, P);
    return develop(spec, A, makeLook(P, A.ref, grain), P, W, H, out);
  }

  // the growing colony, straight from the grid: agents deposited bilinearly, blurred once, stained
  function drawPreview(p, P, st) {
    const S = st.sim, { gw, gh, K, N, x, y, sp } = S;
    let v = st.pv;
    if (!v || v.gw !== gw || v.gh !== gh || v.K !== K) {
      const off = document.createElement('canvas'); off.width = gw; off.height = gh;
      const ctx = off.getContext('2d');
      v = st.pv = { gw, gh, K, off, ctx, img: ctx.createImageData(gw, gh), F: Array.from({ length: K }, () => new Float32Array(gw * gh)), T: new Float32Array(gw * gh) };
    }
    for (const Fk of v.F) Fk.fill(0);
    for (let i = 0; i < N; i++) {
      const px = x[i] - 0.5, py = y[i] - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
      const xa = x0 < 0 ? 0 : x0, xb = x0 + 1 >= gw ? gw - 1 : x0 + 1, ya = y0 < 0 ? 0 : y0, yb = y0 + 1 >= gh ? gh - 1 : y0 + 1;
      const Fk = v.F[sp[i]];
      Fk[ya * gw + xa] += (1 - fx) * (1 - fy); Fk[ya * gw + xb] += fx * (1 - fy);
      Fk[yb * gw + xa] += (1 - fx) * fy; Fk[yb * gw + xb] += fx * fy;
    }
    // the slime, as the granules it will print as would average out
    if (P.slime > 0) {
      if (!st.slime || st.fr % 9 === 0) st.slime = slimeOf(S, P);
      const T = S.T, { kk, wg } = st.slime;
      for (let k = 0; k < K; k++) { const Fk = v.F[k]; for (let c = 0, n = gw * gh; c < n; c++) { const l = T[c * K + k] * kk; Fk[c] += (l < SLIME ? l : SLIME) * wg; } }
    }
    for (const Fk of v.F) binom(Fk, v.T, gw, gh);
    // exposure from the crowding the agents feel, as the print measures it
    if (!st.pref || st.fr % 9 === 0) {
      const stride = Math.max(1, Math.floor(N / 4000)), smp = [];
      for (let i = 0; i < N; i += stride) { const o = (y[i] | 0) * gw + (x[i] | 0); let s = 0; for (const Fk of v.F) s += Fk[o]; smp.push(s); }
      smp.sort((a, b) => a - b);
      st.pref = Math.max(0.5, smp[Math.floor(smp.length * 0.97)] || 0);
    }
    const L = makeLook(P, st.pref, false);
    const d = v.img.data, t = new Float32Array(3);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const o = j * gw + i;
      for (let k = 0; k < K; k++) t[k] = v.F[k][o];
      paint(L, t, (i + 0.5) / gw, (j + 0.5) / gh, d, o * 4, 0, 0);
    }
    v.ctx.putImageData(v.img, 0, 0);
    const ctx = p.drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v.off, 0, 0, p.width, p.height);
    ctx.restore();
  }

  // a still copy of the colony, for prints made while it may still be growing
  const freeze = (S) => ({ gw: S.gw, gh: S.gh, K: S.K, N: S.N, x: S.x.slice(), y: S.y.slice(), sp: S.sp.slice(), T: S.T.slice() });

  /* ---------------- names ---------------- */
  const depOf = (P) => 0.01 * Math.pow(100, P.deposit);
  // colony morphology, read off the parameters (thresholds as the Physarum tab found them)
  function form(P) {
    if (P.inoc === 3) return { name: 'Rhizoid', what: 'a single colony branching outward in root-like fingers' };
    if (P.steps < 160 && P.inoc !== 2) return { name: 'Circular', what: 'young colonies still close round their inocula' };
    if (P.species > 1 && P.rivalry >= 1.0) return { name: 'Mosaic', what: 'rival strains broken into interlocking patches' };
    if (P.sa >= 80 && P.ra <= 14) return P.inoc === 0
      ? { name: 'Vesicular', what: 'drops swollen into thin-walled vesicles' }
      : { name: 'Vermiform', what: P.slime >= 0.1 ? 'worm-like strands coiled in a cloud of slime' : 'worm-like strands coiled across the slide' };
    if (P.sa >= 55 && P.ra <= 28) return { name: 'Convoluted', what: 'short, fat strands folded like a brain' };
    if (P.ra >= 2.5 * P.sa && P.sa <= 16) return { name: 'Beaded', what: 'strands beaded into a lattice' };
    if (depOf(P) >= 0.35 && P.so < 20) return { name: 'Reticulate', what: 'a net of walls set into polygons' };
    if (P.so >= 20) return { name: 'Filamentous', what: 'thick strands laced across the slide' };
    return { name: 'Arborescent', what: 'a branching web of strands' };
  }
  const agentsOf = (P) => (engine() ? engine().agentsOf(simParams(P)) : 0);
  const fmtAgents = (n) => (engine() ? engine().fmtAgents(n) : `${n} agents`);

  C.register({
    id: 'culture',
    name: 'Culture',
    group: 'process',
    order: 5.5,
    renderer: '2d',
    animated: true,
    restartDelay: 120,
    subtitle: 'A stained colony under the microscope',
    about: 'The slime-mould agents of the Physarum tab, inoculated on a plate as spots, a dilution streak, a lawn or a single colony, then printed as a stained slide. The print follows a method vanity_ibex (Jakob Bock) described for his Houdini particle renders: every agent is splatted additively, its point size set by how crowded it is; the brightness is smoothed to the size of a cell and each pixel climbs its slope a few times, so every small bump swallows its surroundings and becomes a cell while the valleys stay pale as membranes. The palettes are histological and microbiological stains. Drag along the line under the slide to save a stretch of the growth as a video.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 3, 1.2, 0.5],
    defaults: { seed: 2026, format: 1, palette: 0 },
    palettes: PALETTES,
    paletteOdds: [3, 2, 1.6, 1.6, 1.3, 1.2, 1, 0.8, 1.4],
    params: PARAMS,

    randomize(R) {
      // a regime of motility first (thresholds as the Physarum tab found them), then an
      // inoculation that suits it: drops only where they swell rather than set into a
      // grid-aligned cross, and a single colony only with the recipe that branches outward
      const fam = C.pickWeighted(R, [3, 2.5, 1.4, 1.2, 0.9, 1]);
      const o = {
        wander: R() < 0.6 ? R.range(0, 0.08) : R.range(0.08, 0.3),
        rivalry: R.range(0.3, 0.9), deposit: R.range(0.3, 0.62), decay: R.range(0.1, 0.2),
        sa: R.range(25, 45), ra: R.range(35, 55), so: R.range(7, 13),
      };
      let inocOdds = [0, 1, 3, 0];
      if (fam === 0) {        // clotting: worms in a cloud of slime, or drops swelling into vesicles
        Object.assign(o, { sa: R.range(84, 90), ra: R.range(6, 12), so: R.range(8, 10.5), deposit: R.range(0.2, 0.55), decay: R.range(0.03, 0.1), wander: R.range(0, 0.06) });
        inocOdds = [3, 1.2, 3, 0];
      } else if (fam === 1) { // labyrinth: short, fat strands folded together
        Object.assign(o, { sa: R.range(60, 80), ra: R.range(16, 26), so: R.range(10, 16), decay: R.range(0.1, 0.25) });
        inocOdds = [0, 2, 3, 0];
      } else if (fam === 2) { // network: Jones's transport web
        Object.assign(o, { sa: R.range(20, 40), ra: R.range(35, 60) });
      } else if (fam === 3) { // foam: saturated trails set into polygons
        Object.assign(o, { deposit: R.range(0.78, 1), so: R.range(7, 14), decay: R.range(0.1, 0.25) });
      } else if (fam === 4) { // lace: long sensors, thick strands
        o.so = R.range(20, 30);
      } else {                // a single colony branching outward from the centre
        Object.assign(o, { so: R.range(5, 7), decay: R.range(0.3, 0.4), sa: R.range(20, 30), ra: R.range(40, 50), deposit: R.range(0.5, 0.7) });
        inocOdds = [0, 0, 0, 1];
      }
      o.inoc = C.pickWeighted(R, inocOdds);
      o.species = C.pickWeighted(R, [2.5, 4, 3]) + 1;
      o.pop = [R.range(0.25, 0.6), R.range(0.3, 0.6), R.range(0.2, 0.5), R.range(0.2, 0.3)][o.inoc];
      o.steps = [R.range(150, 450), R.range(150, 450), R.range(200, 500), R.range(380, 560)][o.inoc];
      o.slime = R() < 0.15 ? R.range(0, 0.15) : R.range(0.3, 0.8);
      o.cell = R.range(0.8, 1.8); o.wall = R.range(0.3, 0.85); o.gran = R.range(0.15, 0.7); o.stain = R.range(0.3, 0.75);
      // a round field stop wastes a wide frame
      o.format = C.pickWeighted(R, [3, 3, 1.2, 0.5]);
      o.field = C.pickWeighted(R, [3, 4.5, [2.5, 2.5, 1, 0][o.format]]);
      o.obj = C.pickWeighted(R, o.inoc === 3 ? [3, 2, 0.5] : [2, 3.5, 2]);
      return o;
    },

    traitName(k, P) {
      if (k === 'so') return `${P.so.toFixed(1)} cells`;
      if (k === 'deposit') { const d = depOf(P); return d >= 0.35 ? 'Saturating' : d >= 0.12 ? 'Rich' : d >= 0.04 ? 'Moderate' : 'Faint'; }
      if (k === 'decay') return P.decay < 0.06 ? 'Lingering' : P.decay < 0.15 ? 'Slow' : P.decay < 0.26 ? 'Brisk' : 'Fleeting';
      if (k === 'pop') return fmtAgents(agentsOf(P));
      if (k === 'rivalry' && P.species === 1) return 'n/a';
      if (k === 'steps') return `${P.steps} steps`;
      return null;
    },

    caption(P) {
      const f = form(P);
      const who = P.species === 1 ? 'a pure culture' : `${P.species === 2 ? 'two' : 'three'} rival strains`;
      const how = ['spotted', 'streaked', 'spread as a lawn', 'inoculated at the centre'][P.inoc];
      return `${f.name}, ${PALETTES[P.palette].name}: ${f.what}, ${who} ${how} and grown for ${P.steps} steps.`;
    },

    sheet(P) {
      return [
        ['Stain', PALETTES[P.palette].name],
        ['Format', C.FORMATS[P.format].label],
        ['Colony form', form(P).name],
        ['Inoculation', INOC[P.inoc]],
        ['Culture', P.species === 1 ? `Pure, ${fmtAgents(agentsOf(P))}` : `${P.species} strains, ${C.nameFrom(PB.rivalry, P.rivalry).toLowerCase()}, ${fmtAgents(agentsOf(P))}`],
        ['Incubation', `${P.steps} steps`],
        ['Motility', `${P.sa.toFixed(1)}° sensors at ${P.so.toFixed(1)} cells, ${P.ra.toFixed(1)}° turns`],
        ['Attractant', `${this.traitName('deposit', P)} secretion, ${this.traitName('decay', P).toLowerCase()} decay`],
        ['Cells', `${C.nameFrom(PB.cell, P.cell)}, ${C.nameFrom(PB.wall, P.wall).toLowerCase()} membranes, ${C.nameFrom(PB.gran, P.gran).toLowerCase()}`],
        ['Mount', `${C.nameFrom(PB.stain, P.stain)} stain, ${FIELD[P.field].toLowerCase()}`],
      ];
    },

    setup(p) {
      // the colony grows in physarum.js; a cached copy from before Culture existed lacks it
      if (!engine()) throw new Error('The page has an outdated copy of the Physarum tab. Reload it (Ctrl+Shift+R) to fetch the current one.');
      return {};
    },

    start(p, P, st, opts) {
      const prev = st.P, S = st.sim;
      st.P = P;
      st.total = P.steps;
      st.phase = 0;            // 0 grow, 1 develop the print, 2 done
      st.dev = null;
      st.done = 0;
      st.slime = null;         // the preview's slime and exposure, measured again for the new params
      st.pref = 0;
      // unless this is a replay or the colony itself changed, keep what has grown: carry on
      // growing it, or print the grown colony again
      const same = !(opts && opts.replay) && S && prev && coreKey(prev) === coreKey(P);
      if (same && S.t <= P.steps) return;
      st.sim = null;           // built lazily in frame() so slider drags stay cheap
    },

    frame(p, P, st) {
      if (!st.sim) { st.sim = makeCulture(P); st.fr = 0; st.pms = 4; }
      const S = st.sim, step = engine().stepSim;
      if (st.phase === 0) {
        const show = st.fr % 3 === 0;
        const within = C.budget(show ? Math.max(3, 11.5 - st.pms) : 11.5);
        while (S.t < st.total && within()) step(S);
        const last = S.t >= st.total;
        if (show || last) {
          const t0 = performance.now();
          drawPreview(p, P, st);
          st.pms = performance.now() - t0;
        }
        st.fr++;
        if (last) st.phase = 1;
        return true;
      }
      if (st.phase === 1) {
        // develop the print at the canvas's real pixel size, laying each tile over the preview
        if (!st.dev) {
          const [W, H] = C.bufferSize(p);
          st.img = p.drawingContext.createImageData(W, H);
          st.dev = printer(S, P, W, H, st.img.data);
        }
        const within = C.budget(11);
        while (within()) {
          const r = st.dev.next();
          if (r.done) { st.phase = 2; return false; }
          if (r.value) {
            const q = r.value;
            p.drawingContext.putImageData(st.img, 0, 0, q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
            st.done = q.done;
          }
        }
        return true;
      }
      return false;
    },

    canStop(st) { return st.phase === 0 && !!st.sim; },
    // Stop finishes at the next whole ten of steps and records it, so the recipe grows the same print
    stop(p, P, st) {
      if (!(st.phase === 0 && st.sim)) return;
      const T = Math.max(PB.steps.min, Math.ceil(st.sim.t / 10) * 10);
      if (T >= st.total) return;
      st.total = T;
      st.patch = { steps: T };
    },

    timeline(P, st) { return { length: P.steps, at: st.sim ? Math.min(st.sim.t, P.steps) : 0 }; },
    // Grow the colony again (deterministically, so these are the run's own states) and print it
    // at each of opts.steps, opts.width × opts.height. While it works it yields the step it has
    // reached; then it yields the frame, whose buffer is reused.
    *clip(p, P, st, opts) {
      const { steps, width: W, height: H } = opts;
      const S = makeCulture(P), step = engine().stepSim;
      const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
      let t0 = performance.now();
      for (const target of steps) {
        while (S.t < target) {
          step(S);
          if (performance.now() - t0 > 30) { yield S.t; t0 = performance.now(); }
        }
        const g = printer(S, P, W, H, img.data, opts.grain);
        for (let r = g.next(); !r.done; r = g.next()) if (performance.now() - t0 > 30) { yield S.t; t0 = performance.now(); }
        yield img;
        t0 = performance.now();
      }
    },

    progress(st) {
      if (!st.sim) return 0;
      if (st.phase === 0) return 0.85 * Math.min(1, st.sim.t / Math.max(1, st.total));
      return 0.85 + 0.15 * (st.done || 0);
    },

    exportAt(p, P, W, H, st) {
      const S = st.sim ? freeze(st.sim) : null;
      return new Promise((resolve, reject) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
        let gen = null, grow = S ? null : makeCulture(P);
        const tick = () => {
          try {
            const t = C.budget(40);
            if (grow) {
              while (grow.t < P.steps && t()) engine().stepSim(grow);
              if (grow.t < P.steps) { setTimeout(tick, 0); return; }
            }
            if (!gen) gen = printer(S || grow, P, W, H, img.data);
            while (t()) if (gen.next().done) { ctx.putImageData(img, 0, 0); resolve(c); return; }
            setTimeout(tick, 0);
          } catch (e) { reject(e); }
        };
        tick();
      });
    },
  });
})();
