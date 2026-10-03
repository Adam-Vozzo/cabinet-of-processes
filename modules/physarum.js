/* Physarum — Jeff Jones's (2010) agent model of the slime mould's transport network.
   Each agent smells the trail at three sensors (left / centre / right, SA apart, SO ahead),
   turns by RA toward the strongest, steps forward and deposits; the trail map is blurred
   and evaporates each step. Several strains can share the dish, each drawn to its own
   trail and repelled by the others'. CPU, typed arrays, deterministic trig + RNG so a
   recipe reproduces exactly on any machine. */
(function () {
  const C = window.Cabinet;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;

  // deterministic sine/cosine (Math.sin is not bit-identical across engines)
  function dsin(x) {
    x = x - TAU * Math.round(x / TAU);
    if (x > Math.PI / 2) x = Math.PI - x; else if (x < -Math.PI / 2) x = -Math.PI - x;
    const x2 = x * x;
    return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156))))));
  }
  const dcos = (x) => dsin(x + Math.PI / 2);

  /* ---------------- palettes ---------------- */
  // mode 'light': strains glow on a dark ground (additive). mode 'ink': strains stain a pale
  // ground (Beer–Lambert absorption). strains: one colour per strain; core: densest tubes.
  const PALETTES = [
    { name: 'Bioluminescence', mode: 'light', bg: '#02060b', strains: ['#2af2ff', '#ff3fd2', '#b8ff3c'], core: '#f2fffe' },
    { name: 'Petri dish', mode: 'ink', bg: '#ece0b5', strains: ['#f2b705', '#cf5a26', '#6d7f28'], core: '#9a6200' },
    { name: 'Sumi', mode: 'ink', bg: '#f3eee3', strains: ['#1c1b1a', '#b3302a', '#26406d'], core: '#050505' },
    { name: 'Gold leaf', mode: 'light', bg: '#150d08', strains: ['#d9a93c', '#c0663a', '#c9ced3'], core: '#fff0c0' },
    { name: 'X-ray', mode: 'light', bg: '#060a11', strains: ['#c9e2ff', '#86b3ff', '#a2f0dc'], core: '#ffffff' },
    { name: 'Cyanotype', mode: 'light', bg: '#123a74', strains: ['#e9f1ff', '#9cc2ff', '#ffe3a3'], core: '#ffffff' },
    { name: 'Nebula', mode: 'light', bg: '#08031a', strains: ['#ff4fd8', '#4f7dff', '#ffb347'], core: '#fff6ff' },
    { name: 'Acid', mode: 'light', bg: '#030a02', strains: ['#9dff00', '#ff00a8', '#00e5ff'], core: '#f8ffe0' },
  ];
  PALETTES.forEach((p) => { p.colors = [p.bg, ...p.strains, p.core]; p.paper = p.bg; });

  const SPAWNS = ['Scattered', 'Disc', 'Ring', 'Centre burst'];

  const PARAMS = [
    { k: 'sa', g: 'Agents', label: 'Sensor angle', min: 5, max: 90, step: 0.5, def: 30, unit: '°' },
    { k: 'so', g: 'Agents', label: 'Sensor distance', min: 3, max: 32, step: 0.5, def: 10 },
    { k: 'ra', g: 'Agents', label: 'Turn angle', min: 5, max: 90, step: 0.5, def: 45, unit: '°' },
    { k: 'ss', g: 'Agents', label: 'Step', min: 0.4, max: 2.5, step: 0.05, def: 1 },
    { k: 'wander', g: 'Agents', label: 'Wander', min: 0, max: 1, step: 0.01, def: 0.1,
      names: [[0, 'Strict'], [0.05, 'Steady'], [0.35, 'Wandering'], [0.7, 'Erratic']] },

    { k: 'deposit', g: 'Trail', label: 'Deposit', min: 0, max: 1, step: 0.01, def: 0.5 },
    { k: 'decay', g: 'Trail', label: 'Evaporation', min: 0.02, max: 0.4, step: 0.005, def: 0.15 },

    { k: 'pop', g: 'Colony', label: 'Population', min: 0.02, max: 0.3, step: 0.005, def: 0.15 },
    { k: 'species', g: 'Colony', label: 'Strains', min: 1, max: 3, step: 1, def: 1,
      names: [[1, 'Monoculture'], [2, 'Two strains'], [3, 'Three strains']] },
    { k: 'rivalry', g: 'Colony', label: 'Rivalry', min: 0, max: 2, step: 0.01, def: 0.6,
      names: [[0, 'Indifferent'], [0.15, 'Wary'], [0.7, 'Territorial'], [1.3, 'Hostile']] },
    { k: 'spawn', g: 'Colony', label: 'Inoculation', type: 'select', options: SPAWNS, def: 0 },
    { k: 'steps', g: 'Colony', label: 'Incubation', min: 80, max: 900, step: 10, def: 400 },

    { k: 'glow', g: 'Plate', label: 'Glow', min: 0, max: 1, step: 0.01, def: 0.45,
      names: [[0, 'None'], [0.05, 'Halo'], [0.4, 'Luminous'], [0.75, 'Blooming']] },
    { k: 'exposure', g: 'Plate', label: 'Exposure', min: 0, max: 1, step: 0.01, def: 0.5,
      names: [[0, 'Low key'], [0.3, 'Balanced'], [0.7, 'High key']] },
    { k: 'grain', g: 'Plate', label: 'Grain', min: 0, max: 1, step: 0.01, def: 0.35,
      names: [[0, 'Clean'], [0.15, 'Fine'], [0.5, 'Silver'], [0.8, 'Coarse']] },
    { k: 'margin', g: 'Plate', label: 'Margin', min: 0, max: 1, step: 0.01, def: 0.3,
      names: [[0, 'Full bleed'], [0.02, 'Narrow'], [0.3, 'Plate'], [0.7, 'Wide']] },
  ];
  const PB = Object.fromEntries(PARAMS.map((p) => [p.k, p]));

  /* ---------------- derived values (pure functions of P) ---------------- */
  const CELLS = 190000;
  function marginFrac(P) { return P.margin < 0.02 ? 0 : 0.02 + P.margin * 0.1; }
  function plate(P) {
    const a = C.FORMATS[P.format].a;
    const m = marginFrac(P), mm = m * Math.min(a, 1);
    return { a, m, mx: mm / a, my: mm, pa: (a - 2 * mm) / (1 - 2 * mm) };
  }
  function grid(P) {
    const { pa } = plate(P);
    const gw = Math.round(Math.sqrt(CELLS * pa)), gh = Math.round(CELLS / gw);
    return { gw, gh };
  }
  // quantised so an engine's last-bit Math.pow differences can't leak into the simulation
  const depOf = (P) => Math.round(1e6 * 0.01 * Math.pow(100, P.deposit)) / 1e6;
  const agentsOf = (P) => { const { gw, gh } = grid(P); return Math.round(gw * gh * P.pop); };

  // Network regime, read off the parameters. The thresholds come from sweeping the model:
  // RA ≫ SA with a short sensor beads into a lattice; SA ≫ RA clots into spots (or, with a
  // wider turn or any wander, Jones's labyrinthine tubes); saturated trails freeze into foam; long sensors
  // give thick vascular lace; weak trails that evaporate slowly let the network minimise
  // into a few filaments.
  function regime(P) {
    const sat = depOf(P);
    if (P.spawn === 3) return { name: 'Dendritic', what: 'a colony front branching outward' };
    if (P.species > 1 && P.rivalry >= 1.0) return { name: 'Mosaic', what: 'rival strains broken into interlocking strokes' };
    if (P.species > 1 && P.rivalry >= 0.15) return { name: 'Braided', what: 'rival strains braided side by side' };
    if (P.spawn === 2) return { name: 'Ring', what: 'a ring contracting on itself' };
    if (P.sa >= 82 && P.ra <= 14 && P.so <= 11 && sat < 0.35 && P.decay <= 0.12 && P.wander < 0.1) return { name: 'Spots', what: 'trail clotted into irregular spots' };
    if (P.sa >= 55 && P.ra <= 28) return { name: 'Labyrinth', what: 'short, fat tubes folded into a labyrinth' };
    if (P.ra >= 2.5 * P.sa && P.sa <= 16) return { name: 'Lattice', what: 'tubes beaded into a lattice' };
    if (sat >= 0.35 && P.so < 20) return { name: 'Foam', what: 'saturated trails set into polygonal cells' };
    if (P.so >= 20) return { name: 'Vascular', what: 'thick, lacy veins drawn on long sensors' };
    if (sat < 0.12 && P.decay < 0.12 && P.steps >= 450) return { name: 'Filament', what: 'a network pruned to a few long filaments' };
    if (P.ra > 1.4 * P.sa && P.decay >= 0.2) return { name: 'Lace', what: 'a fine, restless lace' };
    return { name: 'Reticulate', what: 'a mesh of tubes whose loops slowly contract' };
  }

  /* ---------------- simulation ---------------- */
  function makeSim(P) {
    const { gw, gh } = grid(P);
    const K = P.species, cells = gw * gh;
    const N = agentsOf(P);
    const T = new Float32Array(cells * K), T2 = new Float32Array(cells * K);
    const x = new Float32Array(N), y = new Float32Array(N), hx = new Float32Array(N), hy = new Float32Array(N);
    const sp = new Uint8Array(N);
    let rs = ((P.seed + 1) * 2654435761 ^ 0x9e3779b9) >>> 0 || 1;
    const rnd = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
    const cx = gw / 2, cy = gh / 2, s = Math.min(gw, gh);
    for (let i = 0; i < N; i++) {
      let px, py, a;
      if (P.spawn === 0) { px = rnd() * gw; py = rnd() * gh; a = rnd() * TAU; }
      else if (P.spawn === 1) { const r = Math.sqrt(rnd()) * s * 0.34, t = rnd() * TAU; px = cx + dcos(t) * r; py = cy + dsin(t) * r; a = rnd() * TAU; }
      // ring: a loose band facing roughly inward; the jitter keeps the lattice from growing four spokes
      else if (P.spawn === 2) { const t = rnd() * TAU, r = s * (0.41 + 0.12 * (rnd() - 0.5)); px = cx + dcos(t) * r; py = cy + dsin(t) * r; a = t + Math.PI + (rnd() - 0.5) * 1.4; }
      else { const t = rnd() * TAU, r = Math.sqrt(rnd()) * s * 0.035; px = cx + dcos(t) * r; py = cy + dsin(t) * r; a = t + (rnd() - 0.5) * 0.8; }
      px = (px + gw) % gw; py = (py + gh) % gh;
      x[i] = px; y[i] = py; hx[i] = dcos(a); hy[i] = dsin(a);
      sp[i] = K > 1 ? Math.floor(rnd() * K) : 0;
    }
    const sim = { gw, gh, K, N, T, T2, x, y, hx, hy, sp, rs: (rs | 0) || 1, t: 0,
      cS: dcos(P.sa * DEG), sS: dsin(P.sa * DEG), cR: dcos(P.ra * DEG), sR: dsin(P.ra * DEG),
      SO: P.so, SS: P.ss, dep: depOf(P), keep: (1 - P.decay) / 16, rep: P.rivalry, jit: P.wander * 0.7,
      // a centre inoculation spreads as a colony: agents stay inside a growing radius
      grow: P.spawn === 3 ? { r0: s * 0.04, v: 0.33 * P.ss, max: s * 0.49 } : null,
      // a contracting ring senses bilinearly, so it doesn't pull four spokes along the grid axes
      bil: P.spawn === 2 };
    return sim;
  }

  function stepSim(S) {
    const { gw, gh, K, N, T, x, y, hx, hy, sp, cS, sS, cR, sR, SO, SS, dep, rep, jit } = S;
    const g = S.grow;
    const gr = g ? Math.min(g.max, g.r0 + g.v * S.t) : 0, R2 = gr * gr;
    const cx = gw / 2, cy = gh / 2;
    let rs = S.rs;                                    // xorshift32 state, inlined for speed
    const bil = S.bil;
    for (let i = 0; i < N; i++) {
      const X = x[i], Y = y[i], a = hx[i], b = hy[i];
      // sensor positions: centre, left (+SA), right (−SA)
      const lxh = a * cS - b * sS, lyh = a * sS + b * cS, rxh = a * cS + b * sS, ryh = b * cS - a * sS;
      let x0 = (X + a * SO + gw) | 0; if (x0 >= gw) x0 -= gw; if (x0 >= gw) x0 -= gw;
      let y0 = (Y + b * SO + gh) | 0; if (y0 >= gh) y0 -= gh; if (y0 >= gh) y0 -= gh;
      let x1 = (X + lxh * SO + gw) | 0; if (x1 >= gw) x1 -= gw; if (x1 >= gw) x1 -= gw;
      let y1 = (Y + lyh * SO + gh) | 0; if (y1 >= gh) y1 -= gh; if (y1 >= gh) y1 -= gh;
      let x2 = (X + rxh * SO + gw) | 0; if (x2 >= gw) x2 -= gw; if (x2 >= gw) x2 -= gw;
      let y2 = (Y + ryh * SO + gh) | 0; if (y2 >= gh) y2 -= gh; if (y2 >= gh) y2 -= gh;
      let c, l, r;
      const s = sp[i];
      if (bil) {
        c = bilerp(T, gw, gh, K, s, rep, X + a * SO, Y + b * SO);
        l = bilerp(T, gw, gh, K, s, rep, X + lxh * SO, Y + lyh * SO);
        r = bilerp(T, gw, gh, K, s, rep, X + rxh * SO, Y + ryh * SO);
      } else if (K === 1) {
        c = T[y0 * gw + x0]; l = T[y1 * gw + x1]; r = T[y2 * gw + x2];
      } else {
        // own trail attracts, the other strains' trails repel
        const b0 = (y0 * gw + x0) * K, b1 = (y1 * gw + x1) * K, b2 = (y2 * gw + x2) * K;
        let s0 = 0, s1 = 0, s2 = 0;
        for (let j = 0; j < K; j++) { s0 += T[b0 + j]; s1 += T[b1 + j]; s2 += T[b2 + j]; }
        const o0 = T[b0 + s], o1 = T[b1 + s], o2 = T[b2 + s];
        c = o0 - rep * (s0 - o0); l = o1 - rep * (s1 - o1); r = o2 - rep * (s2 - o2);
      }
      let na = a, nb = b;
      if (c >= l && c >= r) { /* keep going */ }
      else if (c < l && c < r) {
        rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
        if (rs & 1) { na = a * cR - b * sR; nb = a * sR + b * cR; } else { na = a * cR + b * sR; nb = b * cR - a * sR; }
      }
      else if (l > r) { na = a * cR - b * sR; nb = a * sR + b * cR; }
      else { na = a * cR + b * sR; nb = b * cR - a * sR; }
      if (jit > 0) {
        rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
        const e = ((rs >>> 0) / 4294967296 - 0.5) * jit;
        const ta = na - nb * e, tb = nb + na * e, il = 1 / Math.sqrt(ta * ta + tb * tb);
        na = ta * il; nb = tb * il;
      }
      let nx = X + na * SS, ny = Y + nb * SS;
      if (g) {
        const dx = nx - cx, dy = ny - cy;
        if (dx * dx + dy * dy > R2) {
          // blocked at the colony front: stay put and pick a new heading (Jones's rule)
          rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
          const t = (rs >>> 0) / 4294967296 * TAU;
          hx[i] = dcos(t); hy[i] = dsin(t);
          continue;
        }
      }
      if (nx < 0) nx += gw; else if (nx >= gw) nx -= gw;
      if (ny < 0) ny += gh; else if (ny >= gh) ny -= gh;
      x[i] = nx; y[i] = ny; hx[i] = na; hy[i] = nb;
      const q = (((ny | 0) * gw) + (nx | 0)) * K + s;
      const v = T[q] + dep;
      T[q] = v > 1 ? 1 : v;
    }
    S.rs = rs;
    diffuse(S);
    S.t++;
  }

  // bilinear sample of what a strain senses (own trail minus rivals'), toroidal
  function bilerp(T, gw, gh, K, s, rep, px, py) {
    px -= 0.5; py -= 0.5;
    let x0 = Math.floor(px), y0 = Math.floor(py);
    const fx = px - x0, fy = py - y0;
    x0 = ((x0 % gw) + gw) % gw; y0 = ((y0 % gh) + gh) % gh;
    const x1 = x0 + 1 === gw ? 0 : x0 + 1, y1 = y0 + 1 === gh ? 0 : y0 + 1;
    const at = (xi, yi) => {
      const b = (yi * gw + xi) * K;
      if (K === 1) return T[b];
      let sum = 0; for (let j = 0; j < K; j++) sum += T[b + j];
      return T[b + s] * (1 + rep) - rep * sum;
    };
    return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
  }

  // binomial 3×3 blur (more isotropic than Jones's box) and evaporation; toroidal edges
  function diffuse(S) {
    const { gw, gh, K, T, T2 } = S;
    const rowL = gw * K, keep = S.keep, last = rowL - K;
    for (let j = 0; j < gh; j++) {
      const o = j * rowL;
      for (let q = 0; q < K; q++) {
        T2[o + q] = T[o + last + q] + 2 * T[o + q] + T[o + K + q];
        T2[o + last + q] = T[o + last - K + q] + 2 * T[o + last + q] + T[o + q];
      }
      const e = o + last;
      for (let i = o + K; i < e; i++) T2[i] = T[i - K] + 2 * T[i] + T[i + K];
    }
    for (let j = 0; j < gh; j++) {
      const o = j * rowL, u = (j === 0 ? gh - 1 : j - 1) * rowL - o, d = (j === gh - 1 ? 0 : j + 1) * rowL - o;
      const e = o + rowL;
      for (let i = o; i < e; i++) T[i] = (T2[i + u] + 2 * T2[i] + T2[i + d]) * keep;
    }
  }

  /* ---------------- rendering ---------------- */
  function lin(h) { return C.hexRGB(h); }

  // exposure reference: a high percentile of the trail, so any deposit/decay renders well
  function reference(S) {
    const { T } = S, n = T.length;
    let mx = 0;
    for (let i = 0; i < n; i += 5) if (T[i] > mx) mx = T[i];
    if (mx <= 0) return 1;
    const B = 256, h = new Uint32Array(B), kb = B / mx;
    let cnt = 0;
    const floor = mx * 0.004;
    for (let i = 0; i < n; i += 5) { const v = T[i]; if (v > floor) { const b = (v * kb) | 0; h[b < B ? b : B - 1]++; cnt++; } }
    let acc = 0;
    const target = cnt * 0.985;
    for (let b = 0; b < B; b++) { acc += h[b]; if (acc >= target) return Math.max(1e-6, (b + 1) / kb); }
    return mx;
  }

  // Colour model, tabulated. 'light': strains emit on a dark ground, soft-clipped.
  // 'ink': strains absorb (Beer–Lambert optical density) on a pale ground.
  const WN = 2048, VMAX = 4, TN = 4096, EMAX = 12;
  function makeLook(P, ref) {
    const pal = PALETTES[P.palette];
    const ink = pal.mode === 'ink';
    const bg = lin(pal.bg), core = lin(pal.core);
    const K = P.species;
    const cols = pal.strains.slice(0, K).map((h) => {
      const c = lin(h);
      return ink ? c.map((v) => -Math.log(Math.max(0.02, v))) : c;
    });
    const gain = 1.4 * Math.pow(4.5, P.exposure);
    const wL = new Float32Array(WN + 1);
    for (let i = 0; i <= WN; i++) wL[i] = 1 - Math.exp(-(i / WN * VMAX) * gain);
    const tL = new Float32Array(TN + 1);
    for (let i = 0; i <= TN; i++) { const e = i / TN * EMAX; tL[i] = ink ? Math.exp(-e) : 1 - Math.exp(-e * 1.25); }
    const cL = new Float32Array(1025);
    for (let i = 0; i <= 1024; i++) cL[i] = ink ? Math.pow(i / 1024, 5) * 0.45 : Math.pow(i / 1024, 6) * 0.6;
    const flat = new Float32Array(9);
    cols.forEach((c, s) => { flat[s * 3] = c[0]; flat[s * 3 + 1] = c[1]; flat[s * 3 + 2] = c[2]; });
    return { ink, bg, core, K, cols: flat, wL, tL, cL, kv: WN / VMAX / ref, kt: TN / EMAX, glowK: ink ? P.glow * 0.55 : P.glow * 1.5 };
  }

  // one cell/pixel: trail values t[0..K) → rgb written into out (0..1)
  function shade(L, t, gr, gg, gb, out) {
    const { K, cols, wL, tL, cL, kv, kt, bg, core } = L;
    let e0 = gr, e1 = gg, e2 = gb, wmax = 0;
    for (let s = 0; s < K; s++) {
      let i = (t[s] * kv) | 0; if (i > WN) i = WN; else if (i < 0) i = 0;
      const w = wL[i];
      e0 += w * cols[s * 3]; e1 += w * cols[s * 3 + 1]; e2 += w * cols[s * 3 + 2];
      if (w > wmax) wmax = w;
    }
    let i0 = (e0 * kt) | 0, i1 = (e1 * kt) | 0, i2 = (e2 * kt) | 0;
    if (i0 > TN) i0 = TN; if (i1 > TN) i1 = TN; if (i2 > TN) i2 = TN;
    let r, g, b;
    if (L.ink) { r = bg[0] * tL[i0]; g = bg[1] * tL[i1]; b = bg[2] * tL[i2]; }
    else { r = bg[0] + (1 - bg[0]) * tL[i0]; g = bg[1] + (1 - bg[1]) * tL[i1]; b = bg[2] + (1 - bg[2]) * tL[i2]; }
    const c = cL[(wmax * 1024) | 0];
    out[0] = r + (core[0] - r) * c; out[1] = g + (core[1] - g) * c; out[2] = b + (core[2] - b) * c;
  }

  // glow: quarter-resolution emission (or density), box-blurred three times (≈ gaussian)
  function buildGlow(S, L, P) {
    const { gw, gh, K, T } = S;
    const w = Math.ceil(gw / 4), h = Math.ceil(gh / 4);
    const G = new Float32Array(w * h * 3), G2 = new Float32Array(w * h * 3);
    if (P.glow <= 0) return { w, h, G, on: false };
    const { cols, wL, kv } = L;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let e0 = 0, e1 = 0, e2 = 0;
      for (let s = 0; s < K; s++) {
        let acc = 0;
        for (let dy = 0; dy < 4; dy++) {
          const yi = Math.min(gh - 1, j * 4 + dy) * gw;
          for (let dx = 0; dx < 4; dx++) acc += T[(yi + Math.min(gw - 1, i * 4 + dx)) * K + s];
        }
        let q = ((acc / 16) * kv) | 0; if (q > WN) q = WN;
        const v = wL[q];
        e0 += v * cols[s * 3]; e1 += v * cols[s * 3 + 1]; e2 += v * cols[s * 3 + 2];
      }
      const o = (j * w + i) * 3;
      G[o] = e0 * L.glowK; G[o + 1] = e1 * L.glowK; G[o + 2] = e2 * L.glowK;
    }
    const r = Math.max(1, Math.round(1 + P.glow * 2.2));
    for (let it = 0; it < 3; it++) { boxH(G, G2, w, h, r); boxV(G2, G, w, h, r); }
    return { w, h, G, on: true };
  }
  function boxH(src, dst, w, h, r) {
    const inv = 1 / (2 * r + 1);
    for (let j = 0; j < h; j++) {
      const o = j * w * 3;
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[o + (((k % w) + w) % w) * 3 + c];
        for (let i = 0; i < w; i++) {
          dst[o + i * 3 + c] = acc * inv;
          const add = (i + r + 1) % w, sub = ((i - r) % w + w) % w;
          acc += src[o + add * 3 + c] - src[o + sub * 3 + c];
        }
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const inv = 1 / (2 * r + 1);
    for (let i = 0; i < w; i++) for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[((((k % h) + h) % h) * w + i) * 3 + c];
      for (let j = 0; j < h; j++) {
        dst[(j * w + i) * 3 + c] = acc * inv;
        const add = (j + r + 1) % h, sub = ((j - r) % h + h) % h;
        acc += src[(add * w + i) * 3 + c] - src[(sub * w + i) * 3 + c];
      }
    }
  }
  // bilinear, toroidal; gx, gy in full-grid cells
  function sampleGlow(gb, gx, gy, o) {
    const { w, h, G } = gb;
    const fx = gx / 4 - 0.5, fy = gy / 4 - 0.5;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    x0 = ((x0 % w) + w) % w; y0 = ((y0 % h) + h) % h;
    const x1 = x0 + 1 === w ? 0 : x0 + 1, y1 = y0 + 1 === h ? 0 : y0 + 1;
    const a = (y0 * w + x0) * 3, b = (y0 * w + x1) * 3, c = (y1 * w + x0) * 3, d = (y1 * w + x1) * 3;
    const u0 = (1 - tx) * (1 - ty), u1 = tx * (1 - ty), u2 = (1 - tx) * ty, u3 = tx * ty;
    o[0] = G[a] * u0 + G[b] * u1 + G[c] * u2 + G[d] * u3;
    o[1] = G[a + 1] * u0 + G[b + 1] * u1 + G[c + 1] * u2 + G[d + 1] * u3;
    o[2] = G[a + 2] * u0 + G[b + 2] * u1 + G[c + 2] * u2 + G[d + 2] * u3;
  }

  // integer hash → [0,1) for grain
  function hash2(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // low-res preview straight from the grid (while the colony grows). The glow layer is
  // composited as its own smoothed canvas: added for light palettes, multiplied for ink.
  function drawPreview(p, P, st, refresh) {
    const S = st.sim, { gw, gh, K, T } = S;
    if (refresh || !st.look) {
      st.ref = reference(S);
      st.look = makeLook(P, st.ref);
      st.gb = buildGlow(S, st.look, P);
      st.glowDirty = true;
    }
    const L = st.look, gb = st.gb;
    if (!st.img || st.img.width !== gw || st.img.height !== gh) {
      st.off = document.createElement('canvas'); st.off.width = gw; st.off.height = gh;
      st.octx = st.off.getContext('2d');
      st.img = st.octx.createImageData(gw, gh);
    }
    const d = st.img.data;
    const { cols, wL, tL, cL, kv, kt, bg, core, ink } = L;
    const c00 = cols[0], c01 = cols[1], c02 = cols[2];
    for (let j = 0; j < gh; j++) {
      let o = (gh - 1 - j) * gw * 4;
      let q = j * gw * K;
      for (let i = 0; i < gw; i++, o += 4, q += K) {
        let e0, e1, e2, wmax;
        if (K === 1) {
          let ii = (T[q] * kv) | 0; if (ii > WN) ii = WN;
          const w = wL[ii];
          e0 = w * c00; e1 = w * c01; e2 = w * c02; wmax = w;
        } else {
          e0 = 0; e1 = 0; e2 = 0; wmax = 0;
          for (let s = 0; s < K; s++) {
            let ii = (T[q + s] * kv) | 0; if (ii > WN) ii = WN;
            const w = wL[ii];
            e0 += w * cols[s * 3]; e1 += w * cols[s * 3 + 1]; e2 += w * cols[s * 3 + 2];
            if (w > wmax) wmax = w;
          }
        }
        let i0 = (e0 * kt) | 0, i1 = (e1 * kt) | 0, i2 = (e2 * kt) | 0;
        if (i0 > TN) i0 = TN; if (i1 > TN) i1 = TN; if (i2 > TN) i2 = TN;
        let r, g, b;
        if (ink) { r = bg[0] * tL[i0]; g = bg[1] * tL[i1]; b = bg[2] * tL[i2]; }
        else { r = bg[0] + (1 - bg[0]) * tL[i0]; g = bg[1] + (1 - bg[1]) * tL[i1]; b = bg[2] + (1 - bg[2]) * tL[i2]; }
        const cc = cL[(wmax * 1024) | 0];
        d[o] = (r + (core[0] - r) * cc) * 255; d[o + 1] = (g + (core[1] - g) * cc) * 255; d[o + 2] = (b + (core[2] - b) * cc) * 255; d[o + 3] = 255;
      }
    }
    st.octx.putImageData(st.img, 0, 0);
    // glow layer
    if (gb.on && st.glowDirty) {
      if (!st.goff || st.goff.width !== gb.w || st.goff.height !== gb.h) {
        st.goff = document.createElement('canvas'); st.goff.width = gb.w; st.goff.height = gb.h;
        st.gctx = st.goff.getContext('2d');
        st.gimg = st.gctx.createImageData(gb.w, gb.h);
      }
      const gd = st.gimg.data, G = gb.G;
      for (let j = 0; j < gb.h; j++) for (let i = 0; i < gb.w; i++) {
        const src = (j * gb.w + i) * 3, o = ((gb.h - 1 - j) * gb.w + i) * 4;
        for (let k = 0; k < 3; k++) {
          const v = G[src + k];
          gd[o + k] = ink ? 255 * Math.exp(-v) : 255 * (1 - bg[k]) * (1 - Math.exp(-v * 1.25));
        }
        gd[o + 3] = 255;
      }
      st.gctx.putImageData(st.gimg, 0, 0);
      st.glowDirty = false;
    }
    const ctx = p.drawingContext;
    const W = p.width, H = p.height;
    const pl = plate(P);
    const x0 = pl.mx * W, y0 = pl.my * H, w = W * (1 - 2 * pl.mx), h = H * (1 - 2 * pl.my);
    ctx.save();
    ctx.fillStyle = PALETTES[P.palette].bg;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(st.off, x0, y0, w, h);
    if (gb.on && st.goff) {
      ctx.globalCompositeOperation = ink ? 'multiply' : 'lighter';
      ctx.drawImage(st.goff, x0, y0, w, h);
    }
    ctx.restore();
  }

  // full-resolution print: Catmull-Rom trail → colour per pixel. Renders rows [y0, y1) into img.
  function renderRows(P, S, L, gb, img, W, H, y0, y1) {
    const { gw, gh, K, T } = S;
    const pl = plate(P);
    const px0 = pl.mx * W, py0 = pl.my * H, pw = W * (1 - 2 * pl.mx), ph = H * (1 - 2 * pl.my);
    const sx = gw / pw, sy = gh / ph;
    const d = img.data;
    const t = [0, 0, 0], gl = [0, 0, 0], c = [0, 0, 0];
    const bg = L.bg;
    const grain = P.grain * (L.ink ? 0.07 : 0.085);
    const gsz = Math.max(1, H / 1100);          // grain cell ≈ 1/1100 of the height
    const key = pl.m > 0 ? Math.max(1, H / 900) : 0;
    const keyCol = L.ink ? [0.22, 0.2, 0.18] : [0.9, 0.9, 0.9];
    const wx = new Float64Array(4), wy = new Float64Array(4);
    const ix = new Int32Array(4), iy = new Int32Array(4);
    for (let y = y0; y < y1; y++) {
      const inY = y >= py0 && y < py0 + ph;
      const gy = (ph - (y + 0.5 - py0)) * sy - 0.5;
      const fy = Math.floor(gy), ty = gy - fy;
      {
        const t2 = ty * ty, t3 = t2 * ty;
        wy[0] = -0.5 * t3 + t2 - 0.5 * ty; wy[1] = 1.5 * t3 - 2.5 * t2 + 1; wy[2] = -1.5 * t3 + 2 * t2 + 0.5 * ty; wy[3] = 0.5 * t3 - 0.5 * t2;
        for (let k = 0; k < 4; k++) iy[k] = ((((fy - 1 + k) % gh) + gh) % gh) * gw;
      }
      for (let x = 0; x < W; x++) {
        let r, g, b;
        if (inY && x >= px0 && x < px0 + pw) {
          const gx = (x + 0.5 - px0) * sx - 0.5;
          const fx = Math.floor(gx), tx = gx - fx;
          const t2 = tx * tx, t3 = t2 * tx;
          wx[0] = -0.5 * t3 + t2 - 0.5 * tx; wx[1] = 1.5 * t3 - 2.5 * t2 + 1; wx[2] = -1.5 * t3 + 2 * t2 + 0.5 * tx; wx[3] = 0.5 * t3 - 0.5 * t2;
          for (let k = 0; k < 4; k++) ix[k] = (((fx - 1 + k) % gw) + gw) % gw;
          for (let s = 0; s < K; s++) {
            let acc = 0;
            for (let m = 0; m < 4; m++) {
              const row = iy[m];
              acc += wy[m] * (wx[0] * T[(row + ix[0]) * K + s] + wx[1] * T[(row + ix[1]) * K + s] + wx[2] * T[(row + ix[2]) * K + s] + wx[3] * T[(row + ix[3]) * K + s]);
            }
            t[s] = acc > 0 ? acc : 0;
          }
          if (gb.on) sampleGlow(gb, gx + 0.5, gy + 0.5, gl);
          shade(L, t, gl[0], gl[1], gl[2], c);
          r = c[0]; g = c[1]; b = c[2];
        } else {
          r = bg[0]; g = bg[1]; b = bg[2];
          if (key > 0) {
            const dx = Math.max(px0 - x - 0.5, x + 0.5 - (px0 + pw)), dy = Math.max(py0 - y - 0.5, y + 0.5 - (py0 + ph));
            const dist = Math.max(dx, dy);
            const k = Math.max(0, 1 - Math.abs(dist - key * 2) / (key * 0.6 + 0.5)) * 0.4;
            r += (keyCol[0] - r) * k; g += (keyCol[1] - g) * k; b += (keyCol[2] - b) * k;
          }
        }
        if (grain > 0) {
          const gxq = (x / gsz) | 0, gyq = (y / gsz) | 0;
          const n = hash2(gxq, gyq) + hash2(gxq + 7, gyq + 11) - 1;
          const amt = grain * (L.ink ? 1 : 0.35 + (r + g + b) / 3);
          r += n * amt; g += n * amt; b += n * amt;
        }
        const o = (y * W + x) * 4;
        d[o] = r * 255; d[o + 1] = g * 255; d[o + 2] = b * 255; d[o + 3] = 255;
      }
    }
  }

  function fmtAgents(n) { return n >= 1000 ? `${Math.round(n / 1000)}k agents` : `${n} agents`; }

  C.register({
    id: 'physarum',
    name: 'Physarum',
    group: 'process',
    order: 5,
    renderer: '2d',
    animated: true,
    restartDelay: 120,
    subtitle: 'Slime-mould transport network',
    about: 'Thousands of agents follow Jeff Jones’s 2010 model of the slime mould Physarum polycephalum: each smells the trail ahead through three sensors, turns toward the strongest, steps and deposits more. The trail blurs and evaporates, and a transport network organises itself, then slowly minimises. Rival strains repel each other and share out the dish.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 2, 1.3, 0.6],
    defaults: { seed: 1618, format: 0, palette: 0 },
    palettes: PALETTES,
    paletteOdds: [3, 2.4, 2, 1.6, 1.2, 1.2, 1.4, 1],
    params: PARAMS,

    randomize(R) {
      // choose a family of network first, then draw its traits from ranges where it forms
      // ring and centre-burst are single-motif pictures, so they stay rare (≈ 1 in 16 together)
      const fam = C.pickWeighted(R, [2.6, 2.1, 1.5, 1.3, 0.7, 0.45, 0.45, 1.5, 0.8, 0.55, 0.2]);
      const o = {
        sa: R.range(20, 40), ra: R.range(35, 60), so: R.range(7, 13), ss: R.pick([1, 1, 1, R.range(0.7, 1.6)]),
        wander: R() < 0.5 ? R.range(0, 0.08) : R.range(0.08, 0.3),
        deposit: R.range(0.3, 0.62), decay: R.range(0.1, 0.2), pop: R.range(0.08, 0.2),
        species: 1, rivalry: R.range(0.3, 0.9), spawn: R() < 0.12 ? 1 : 0, steps: R.range(250, 500),
        glow: R.range(0.2, 0.7), exposure: R.range(0.3, 0.7), grain: R.range(0.12, 0.5),
        margin: R() < 0.25 ? 0 : R.range(0.15, 0.6),
      };
      if (fam === 1) { o.deposit = R.range(0.78, 1); o.so = R.range(7, 14); o.sa = R.range(25, 45); o.decay = R.range(0.1, 0.25); o.pop = R.range(0.1, 0.25); o.steps = R.range(250, 600); }
      else if (fam === 2) { o.sa = R.range(20, 35); o.ra = R.range(70, 90); o.decay = R.range(0.2, 0.35); o.so = R.range(8, 14); o.steps = R.range(200, 420); }
      else if (fam === 3) { o.so = R.range(20, 30); o.sa = R.range(25, 45); o.pop = R.range(0.1, 0.25); o.deposit = R.range(0.3, 0.7); o.steps = R.range(300, 600); }
      else if (fam === 4) { o.deposit = R.range(0, 0.4); o.decay = R.range(0.04, 0.1); o.steps = R.range(480, 900); o.pop = R.range(0.05, 0.15); o.sa = R.range(20, 35); o.ra = R.range(35, 50); }
      else if (fam === 5) { o.sa = R.range(72, 90); o.so = R.range(8, 13); o.steps = R.range(260, 480); if (R() < 0.5) { o.sa = R.range(84, 90); o.so = R.range(8, 10.5); o.ra = R.range(6, 12); o.deposit = R.range(0.2, 0.55); o.decay = R.range(0.03, 0.1); o.wander = R.range(0, 0.06); } else { o.ra = R.range(16, 26); o.deposit = R.range(0.3, 0.6); o.decay = R.range(0.15, 0.3); } }
      else if (fam === 6) { o.sa = R.range(8, 14); o.ra = R.range(60, 90); o.so = R.range(8, 12); o.decay = R.range(0.15, 0.25); o.steps = R.range(200, 400); }
      else if (fam === 7) { o.species = R() < 0.6 ? 2 : 3; o.rivalry = R.range(0.3, 0.9); o.pop = R.range(0.12, 0.25); }
      else if (fam === 8) { o.species = R() < 0.4 ? 2 : 3; o.rivalry = R.range(1.1, 1.8); o.ra = R.range(60, 90); o.decay = R.range(0.2, 0.3); o.pop = R.range(0.15, 0.28); }
      else if (fam === 9) { o.spawn = 3; o.so = R.range(5, 7); o.decay = R.range(0.3, 0.4); o.sa = R.range(20, 30); o.ra = R.range(40, 50); o.deposit = R.range(0.5, 0.7); o.pop = R.range(0.2, 0.3); o.steps = R.range(380, 560); o.ss = 1; }
      else if (fam === 10) { o.spawn = 2; o.steps = R.range(150, 350); o.pop = R.range(0.1, 0.2); }
      // palettes: ink palettes want less glow (it reads as bleed), light ones can bloom
      const pal = C.pickWeighted(R, [3, 2.4, 2, 1.6, 1.2, 1.2, 1.4, 1]);
      o.palette = pal;
      if (PALETTES[pal].mode === 'ink') o.glow = R.range(0.1, 0.45);
      // spots read as a star field on a dark ground; on pale agar the stray agents turn to mud
      if (fam === 5 && o.ra <= 12 && PALETTES[pal].mode === 'ink') { o.palette = R.pick([0, 4, 6]); o.glow = R.range(0.3, 0.6); }
      if (fam === 5 && o.ra <= 12) o.exposure = R.range(0.25, 0.45);
      return o;
    },

    traitName(k, P) {
      if (k === 'so') return `${P.so.toFixed(1)} cells`;
      if (k === 'ss') return `${P.ss.toFixed(2)} cells`;
      if (k === 'deposit') { const d = depOf(P); return d >= 0.35 ? 'Saturating' : d >= 0.12 ? 'Rich' : d >= 0.04 ? 'Moderate' : 'Faint'; }
      if (k === 'decay') return P.decay < 0.06 ? 'Lingering' : P.decay < 0.15 ? 'Slow' : P.decay < 0.26 ? 'Brisk' : 'Fleeting';
      if (k === 'pop') return fmtAgents(agentsOf(P));
      if (k === 'rivalry' && P.species === 1) return 'n/a';
      if (k === 'steps') return `${P.steps} steps`;
      return null;
    },

    caption(P) {
      const r = regime(P);
      const n = fmtAgents(agentsOf(P));
      const who = P.species === 1 ? n : `${n} in ${P.species === 2 ? 'two' : 'three'} rival strains`;
      const from = ['', ' spread from a disc', ' released on a ring', ' spreading from a central inoculation'][P.spawn];
      return `${r.name} in ${PALETTES[P.palette].name}: ${r.what}, grown by ${who}${from} over ${P.steps} steps.`;
    },

    sheet(P) {
      return [
        ['Palette', PALETTES[P.palette].name],
        ['Format', C.FORMATS[P.format].label],
        ['Network', regime(P).name],
        ['Sensors', `${P.sa.toFixed(1)}° at ${P.so.toFixed(1)} cells`],
        ['Turn · step', `${P.ra.toFixed(1)}° · ${P.ss.toFixed(2)} cells`],
        ['Trail', `${this.traitName('deposit', P)} deposit, ${this.traitName('decay', P).toLowerCase()} evaporation`],
        ['Colony', P.species === 1 ? fmtAgents(agentsOf(P)) : `${fmtAgents(agentsOf(P))}, ${P.species} strains, ${C.nameFrom(PB.rivalry, P.rivalry).toLowerCase()}`],
        ['Inoculation', SPAWNS[P.spawn]],
        ['Incubation', `${P.steps} steps`],
        ['Plate', `${C.nameFrom(PB.glow, P.glow)} glow, ${C.nameFrom(PB.exposure, P.exposure).toLowerCase()}`],
      ];
    },

    setup(p) { return {}; },

    start(p, P, st) {
      st.P = P;
      st.sim = null;           // built lazily in frame() so slider drags stay cheap
      st.total = P.steps;
      st.phase = 0;            // 0 simulate, 1 develop the full-resolution print, 2 done
      st.hi = null;
      st.look = null;
    },

    frame(p, P, st) {
      if (!st.sim) { st.sim = makeSim(P); st.fr = 0; st.pms = 4; }
      const S = st.sim;
      if (st.phase === 0) {
        // the dish is redrawn every third frame; the frames between are all simulation
        const show = st.fr % 3 === 0;
        const within = C.budget(show ? Math.max(3, 11.5 - st.pms) : 11.5);
        do stepSim(S); while (S.t < st.total && within());
        const last = S.t >= st.total;
        if (show || last) {
          const t0 = performance.now();
          drawPreview(p, P, st, last || st.fr % 9 === 0);
          st.pms = performance.now() - t0;
        }
        st.fr++;
        if (last) st.phase = 1;
        return true;
      }
      if (st.phase === 1) {
        // develop the print at the canvas's real pixel size, a band of rows per frame
        const W = p.width * p.pixelDensity(), H = p.height * p.pixelDensity();
        if (!st.hi || st.hi.W !== W || st.hi.H !== H) {
          const c = document.createElement('canvas'); c.width = W; c.height = H;
          const ctx = c.getContext('2d');
          st.hi = { W, H, c, ctx, img: ctx.createImageData(W, H), y: 0 };
        }
        const hi = st.hi, band = Math.max(4, Math.floor(H / 100));
        const t = C.budget(11);
        while (hi.y < H && t()) {
          const y1 = Math.min(H, hi.y + band);
          renderRows(P, S, st.look, st.gb, hi.img, W, H, hi.y, y1);
          hi.y = y1;
        }
        if (hi.y >= H) {
          hi.ctx.putImageData(hi.img, 0, 0);
          const ctx = p.drawingContext;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(hi.c, 0, 0);
          ctx.restore();
          st.phase = 2;
          return false;
        }
        return true;
      }
      return false;
    },

    progress(st) {
      if (!st.sim) return 0;
      if (st.phase === 0) return 0.93 * st.sim.t / st.total;
      return 0.93 + 0.07 * (st.hi ? st.hi.y / st.hi.H : 0);
    },

    exportAt(p, P, W, H, st) {
      if (!st.sim) st.sim = makeSim(P);
      const S = st.sim;
      const L = makeLook(P, reference(S));
      const gb = buildGlow(S, L, P);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(W, H);
      renderRows(P, S, L, gb, img, W, H, 0, H);
      ctx.putImageData(img, 0, 0);
      return c;
    },
  });
})();
