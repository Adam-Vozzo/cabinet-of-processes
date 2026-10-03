/* Wave Collapse — the simple tiled model of Maxim Gumin's wave function
   collapse (2016). Every cell starts as a superposition of all tiles; the
   cell with the lowest weighted entropy is collapsed to one tile, and the
   choice is propagated to neighbours through the edge sockets (support
   counting, AC-3 style) until the grid is decided or a cell runs out of
   options, which restarts the solve deterministically. The tiles are vector
   drawings in tile units, so the same draw code paints the screen and export. */
(function () {
  'use strict';
  const C = window.Cabinet;
  const TAU = Math.PI * 2;

  /* ---------------- palettes (shared by every tile set) ----------------
     bg ground · ink main line · dark bodies/outlines · light fills · dim
     secondary · lines[3] route colours · strand knot band · water rivers ·
     terrain [deep sea, shallows, lowland, upland, beach]                     */
  const PALS = [
    { name: 'PCB green', bg: '#0f3d2c', ink: '#d9ad56', dark: '#0e1411', light: '#ecebdd', dim: '#2b6d50',
      lines: ['#d9ad56', '#ecebdd', '#e2703c'], strand: '#d9ad56', water: '#1f6248',
      terrain: ['#0c2f23', '#18553b', '#c6a04d', '#e0c77c', '#ead9a0'] },
    { name: 'Blueprint', bg: '#1c4c8c', ink: '#eef4fb', dark: '#0f2f5e', light: '#eef4fb', dim: '#5d8cc6',
      lines: ['#ffffff', '#f5c451', '#94c6f2'], strand: '#eef4fb', water: '#6f9fd8',
      terrain: ['#173f77', '#27599c', '#e9f0f8', '#bcd3ee', '#f5c451'] },
    { name: 'Riso', bg: '#f3eee3', ink: '#0078bf', dark: '#1d2f6f', light: '#fffaf0', dim: '#f7a8d0',
      lines: ['#ff48b0', '#0078bf', '#ffcf00'], strand: '#ff48b0', water: '#6cb6e2',
      terrain: ['#0078bf', '#79bde6', '#f3eee3', '#ffc2de', '#ffe45c'] },
    { name: 'Sumi ink', bg: '#efe8d8', ink: '#1c1b19', dark: '#1c1b19', light: '#f7f2e6', dim: '#a39c8f',
      lines: ['#1c1b19', '#b8412a', '#77726a'], strand: '#f5efe2', water: '#c9c1b0',
      terrain: ['#45423d', '#9a9488', '#efe8d8', '#ddd5c3', '#e9e1cf'] },
    { name: 'Transit map', bg: '#f7f5ef', ink: '#1d1d1b', dark: '#1d1d1b', light: '#ffffff', dim: '#cdc8bc',
      lines: ['#dc241f', '#0019a8', '#00782a'], strand: '#ffd300', water: '#a8d2ea',
      terrain: ['#8cc3e3', '#bfe0f0', '#f7f5ef', '#e2ead3', '#f2e5bf'] },
    { name: 'Neon', bg: '#0c0b17', ink: '#35f0ff', dark: '#231d4a', light: '#f5f3ff', dim: '#3b3175',
      lines: ['#ff2a6d', '#35f0ff', '#f9f002'], strand: '#ff2a6d', water: '#2a2560',
      terrain: ['#0c0b17', '#221c4c', '#ff2a6d', '#f9f002', '#35f0ff'] },
    { name: 'Ordnance survey', bg: '#f0e7d0', ink: '#3a2e25', dark: '#3a2e25', light: '#fbf6e9', dim: '#bba98a',
      lines: ['#b5452d', '#2f5f86', '#6c8a36'], strand: '#eadcb8', water: '#8fbcc4',
      terrain: ['#7eaeb8', '#b2d2d3', '#ebe2c0', '#cbd5a0', '#eedca6'] },
  ];
  // knot roles: [ground, strand, outline, dots]
  const KNOTC = [
    ['#0f3d2c', '#d9ad56', '#0b1a13', '#e2703c'],
    ['#1c4c8c', '#eef4fb', '#0f2f5e', '#f5c451'],
    ['#f3eee3', '#ff48b0', '#1d2f6f', '#0078bf'],
    ['#1c1b19', '#efe8d8', '#1c1b19', '#b8412a'],
    ['#f7f5ef', '#ffd300', '#1d1d1b', '#dc241f'],
    ['#0c0b17', '#ff2a6d', '#35f0ff', '#f9f002'],
    ['#a8412b', '#f0e2bd', '#2a211b', '#f0e2bd'],
  ];
  PALS.forEach((p, i) => { p.colors = [p.bg, p.ink, p.lines[0], p.lines[1], p.lines[2]]; p.knot = KNOTC[i]; });

  /* ---------------- transforms (dihedral group of the square) ----------------
     matrices [a, b, c, d]: x' = a x + b y, y' = c x + d y, on centred tile coords, y down */
  const I = [1, 0, 0, 1], R1 = [0, -1, 1, 0], R2 = [-1, 0, 0, -1], R3 = [0, 1, -1, 0];
  const FH = [-1, 0, 0, 1], FV = [1, 0, 0, -1], FD = [0, 1, 1, 0], FA = [0, -1, -1, 0];
  const D4 = [I, R1, R2, R3, FH, FV, FD, FA];
  const STAB = { X: D4, I: [I, R2, FH, FV], L: [I, FA], T: [I, FH], V: [I, FV], S: [I, R2], N: [I] };
  const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
  const mkey = (M) => M.join(',');
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];     // N E S W
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const dirOf = (v) => DIRS.findIndex((d) => d[0] === v[0] && d[1] === v[1]);
  const rev = (s) => s.split('').reverse().join('');

  // expand base tiles into their distinct orientations
  function expand(bases) {
    const tiles = [];
    const byKey = new Map();
    for (const b of bases) {
      const stab = STAB[b.sym || 'N'];
      for (const g of D4) {
        const k = stab.map((h) => mkey(mul(g, h))).sort()[0];
        const key = b.id + '|' + k;
        if (byKey.has(key)) continue;
        const det = g[0] * g[3] - g[1] * g[2];
        const sock = new Array(4);
        for (let d = 0; d < 4; d++) {
          const v = [g[0] * DIRS[d][0] + g[1] * DIRS[d][1], g[2] * DIRS[d][0] + g[3] * DIRS[d][1]];
          sock[dirOf(v)] = det < 0 ? rev(b.sock[d]) : b.sock[d];
        }
        const t = { base: b, M: g, sock, key };
        byKey.set(key, tiles.length);
        tiles.push(t);
      }
    }
    const find = (b, M) => byKey.get(b.id + '|' + STAB[b.sym || 'N'].map((h) => mkey(mul(M, h))).sort()[0]);
    tiles.forEach((t) => { t.mh = find(t.base, mul(FH, t.M)); t.mv = find(t.base, mul(FV, t.M)); t.r2 = find(t.base, mul(R2, t.M)); });
    return tiles;
  }

  /* ---------------- drawing helpers (tile units, 0..1, y down) ---------------- */
  function line(ctx, pts) { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); }
  function strokePath(ctx, pts, w, col, cap) { ctx.beginPath(); line(ctx, pts); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = cap || 'butt'; ctx.stroke(); }
  function disc(ctx, x, y, r, col) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
  function ring(ctx, x, y, r, w, col) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }
  function hash(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

  /* ================= TILE SET 1: CIRCUIT ================= */
  const CIRCUIT = (() => {
    const tr = (S) => S.lw * 0.085, bus = (S) => S.lw * 0.2;
    const B = [];
    const add = (o) => { B.push(o); return o; };
    add({ id: 'blank', sock: ['0', '0', '0', '0'], sym: 'X', w: 3, busy: -1, draw() {} });
    add({ id: 'fiducial', sock: ['0', '0', '0', '0'], sym: 'X', w: 0.12, busy: -0.4, detail: 1, draw(ctx, S) {
      disc(ctx, 0.5, 0.5, 0.17, S.pal.dark); disc(ctx, 0.5, 0.5, 0.07, S.pal.ink); ring(ctx, 0.5, 0.5, 0.17, 0.012, S.pal.dim);
    } });
    add({ id: 'hole', sock: ['0', '0', '0', '0'], sym: 'X', w: 0.06, busy: -0.4, detail: 1, draw(ctx, S) {
      disc(ctx, 0.5, 0.5, 0.3, S.pal.ink); disc(ctx, 0.5, 0.5, 0.19, S.pal.dark);
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; disc(ctx, 0.5 + Math.cos(a) * 0.245, 0.5 + Math.sin(a) * 0.245, 0.018, S.pal.dark); }
    } });
    add({ id: 'silk', sock: ['0', '0', '0', '0'], sym: 'X', w: 0.12, busy: -0.5, detail: 1, draw(ctx, S) {
      ctx.lineWidth = 0.022 * S.lw; ctx.strokeStyle = S.pal.light; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(0.3, 0.5); ctx.lineTo(0.7, 0.5); ctx.moveTo(0.5, 0.3); ctx.lineTo(0.5, 0.7); ctx.stroke();
      ring(ctx, 0.5, 0.5, 0.11, 0.02 * S.lw, S.pal.light);
    } });
    add({ id: 'straight', sock: ['t', '0', 't', '0'], sym: 'I', w: 2.2, busy: 0.2, turn: -1, draw(ctx, S) { strokePath(ctx, [0.5, 0, 0.5, 1], tr(S), S.pal.ink); } });
    add({ id: 'turn', sock: ['t', 't', '0', '0'], sym: 'L', w: 1.4, busy: 0.2, turn: 1, draw(ctx, S) {
      ctx.lineJoin = 'round'; strokePath(ctx, [0.5, 0, 0.5, 0.28, 0.72, 0.5, 1, 0.5], tr(S), S.pal.ink);
    } });
    add({ id: 'tee', sock: ['t', 't', '0', 't'], sym: 'T', w: 0.45, busy: 0.4, turn: 0.6, draw(ctx, S) {
      strokePath(ctx, [0, 0.5, 1, 0.5], tr(S), S.pal.ink); strokePath(ctx, [0.5, 0, 0.5, 0.5], tr(S), S.pal.ink); disc(ctx, 0.5, 0.5, tr(S) * 0.95, S.pal.ink);
    } });
    add({ id: 'via', sock: ['t', '0', '0', '0'], sym: 'T', w: 0.35, busy: 0.1, detail: 0.5, draw(ctx, S) {
      strokePath(ctx, [0.5, 0, 0.5, 0.5], tr(S), S.pal.ink); disc(ctx, 0.5, 0.5, 0.11, S.pal.ink); disc(ctx, 0.5, 0.5, 0.045, S.pal.bg);
    } });
    add({ id: 'pad', sock: ['t', '0', '0', '0'], sym: 'T', w: 0.12, busy: 0.1, detail: 1, draw(ctx, S) {
      strokePath(ctx, [0.5, 0, 0.5, 0.4], tr(S), S.pal.ink); ctx.fillStyle = S.pal.ink; ctx.fillRect(0.36, 0.4, 0.28, 0.28);
    } });
    add({ id: 'bridge', sock: ['t', 't', 't', 't'], sym: 'I', w: 0.3, busy: 0.6, draw(ctx, S) {
      ctx.save(); ctx.setLineDash([0.05, 0.05]); strokePath(ctx, [0.2, 0.5, 0.8, 0.5], tr(S) * 0.8, S.pal.dim); ctx.restore();
      strokePath(ctx, [0, 0.5, 0.2, 0.5], tr(S), S.pal.ink); strokePath(ctx, [0.8, 0.5, 1, 0.5], tr(S), S.pal.ink);
      disc(ctx, 0.2, 0.5, 0.075, S.pal.ink); disc(ctx, 0.2, 0.5, 0.03, S.pal.bg); disc(ctx, 0.8, 0.5, 0.075, S.pal.ink); disc(ctx, 0.8, 0.5, 0.03, S.pal.bg);
      strokePath(ctx, [0.5, 0, 0.5, 1], tr(S), S.pal.ink);
    } });
    add({ id: 'resistor', sock: ['t', '0', 't', '0'], sym: 'I', w: 0.3, busy: 0.5, detail: 1, draw(ctx, S) {
      strokePath(ctx, [0.5, 0, 0.5, 1], tr(S), S.pal.ink);
      ctx.fillStyle = S.pal.ink; ctx.fillRect(0.37, 0.24, 0.26, 0.12); ctx.fillRect(0.37, 0.64, 0.26, 0.12);
      ctx.fillStyle = S.pal.dark; ctx.fillRect(0.38, 0.34, 0.24, 0.32);
      ctx.lineWidth = 0.018 * S.lw; ctx.strokeStyle = S.pal.light; ctx.strokeRect(0.31, 0.2, 0.38, 0.6);
    } });
    add({ id: 'diode', sock: ['t', '0', 't', '0'], sym: 'T', w: 0.14, busy: 0.5, detail: 1, draw(ctx, S) {
      strokePath(ctx, [0.5, 0, 0.5, 1], tr(S), S.pal.ink);
      ctx.fillStyle = S.pal.dark; ctx.fillRect(0.35, 0.3, 0.3, 0.4);
      ctx.fillStyle = S.pal.light; ctx.fillRect(0.35, 0.34, 0.3, 0.06);
      ctx.fillStyle = S.pal.ink; ctx.fillRect(0.35, 0.24, 0.3, 0.07); ctx.fillRect(0.35, 0.69, 0.3, 0.07);
    } });
    add({ id: 'bus', sock: ['b', '0', 'b', '0'], sym: 'I', w: 0.5, busy: 0.3, turn: -1, draw(ctx, S) { strokePath(ctx, [0.5, 0, 0.5, 1], bus(S), S.pal.ink); } });
    add({ id: 'busturn', sock: ['b', 'b', '0', '0'], sym: 'L', w: 0.3, busy: 0.3, turn: 1, draw(ctx, S) {
      ctx.lineJoin = 'round'; strokePath(ctx, [0.5, 0, 0.5, 0.3, 0.7, 0.5, 1, 0.5], bus(S), S.pal.ink);
    } });
    add({ id: 'busend', sock: ['b', '0', '0', '0'], sym: 'T', w: 0.1, busy: 0.2, draw(ctx, S) {
      strokePath(ctx, [0.5, 0, 0.5, 0.5], bus(S), S.pal.ink); disc(ctx, 0.5, 0.5, 0.2, S.pal.ink); disc(ctx, 0.5, 0.5, 0.08, S.pal.bg);
    } });
    add({ id: 'taper', sock: ['b', '0', 't', '0'], sym: 'T', w: 0.18, busy: 0.3, draw(ctx, S) {
      const a = bus(S) / 2, b = tr(S) / 2;
      ctx.beginPath(); ctx.moveTo(0.5 - a, 0); ctx.lineTo(0.5 + a, 0); ctx.lineTo(0.5 + a, 0.35); ctx.lineTo(0.5 + b, 0.6); ctx.lineTo(0.5 + b, 1); ctx.lineTo(0.5 - b, 1); ctx.lineTo(0.5 - b, 0.6); ctx.lineTo(0.5 - a, 0.35); ctx.closePath();
      ctx.fillStyle = S.pal.ink; ctx.fill();
    } });
    // integrated circuits: bodies inset 0.3 from the package edge, legs meet traces
    const IN = 0.3;
    add({ id: 'chip', sock: ['c', 'c', 'c', 'c'], sym: 'X', w: 0.05, busy: 0.6, draw(ctx, S, t, cell) {
      ctx.fillStyle = S.pal.dark; ctx.fillRect(-0.01, -0.01, 1.02, 1.02);
      if (hash(cell * 7 + 3) < 0.18) { ctx.lineWidth = 0.02 * S.lw; ctx.strokeStyle = S.pal.dim; ring(ctx, 0.5, 0.5, 0.12, 0.02 * S.lw, S.pal.dim); }
    } });
    const chipEdge = (ctx, S, pin) => {
      ctx.fillStyle = S.pal.dark; ctx.fillRect(-0.01, IN, 1.02, 1.01 - IN);
      ctx.fillStyle = S.pal.light; ctx.fillRect(-0.01, IN - 0.035 * S.lw, 1.02, 0.02 * S.lw);
      if (pin) { ctx.fillStyle = S.pal.ink; ctx.fillRect(0.5 - 0.07, 0.02, 0.14, IN + 0.06); strokePath(ctx, [0.5, 0, 0.5, 0.05], tr(S), S.pal.ink); }
    };
    add({ id: 'chipedge', sock: ['t', 'oc', 'c', 'co'], sym: 'T', w: 0.9, busy: 0.7, draw(ctx, S) { chipEdge(ctx, S, true); } });
    add({ id: 'chipside', sock: ['0', 'oc', 'c', 'co'], sym: 'T', w: 0.25, busy: 0.6, draw(ctx, S) { chipEdge(ctx, S, false); } });
    add({ id: 'chipcorner', sock: ['0', '0', 'oc', 'co'], sym: 'L', w: 0.5, busy: 0.6, draw(ctx, S, t) {
      ctx.fillStyle = S.pal.dark; ctx.fillRect(-0.01, IN, 1.01 - IN, 1.01 - IN);
      // pin-1 mark, only on the package's top-left corner
      const M = t.M, wx = M[0] - M[1], wy = M[2] - M[3];
      if (wx < 0 && wy < 0) ring(ctx, 1 - IN - 0.17, IN + 0.17, 0.055, 0.022 * S.lw, S.pal.dim);
      ctx.fillStyle = S.pal.light; ctx.fillRect(-0.01, IN - 0.035 * S.lw, 1.01 - IN + 0.035 * S.lw, 0.02 * S.lw); ctx.fillRect(1 - IN + 0.015 * S.lw, IN - 0.035 * S.lw, 0.02 * S.lw, 1.01 - IN + 0.035 * S.lw);
    } });
    const tiles = expand(B);
    return {
      id: 'circuit', name: 'Circuit', tiles, border: ['0'],
      weight(t, P) {
        const b = t.base;
        let w = b.w * Math.exp(2.4 * (P.density - 0.5) * 2 * b.busy);
        if (b.turn) w *= Math.exp(1.6 * (P.meander - 0.5) * 2 * b.turn);
        if (b.detail) w *= 0.1 + b.detail * 2.2 * P.detail + (1 - b.detail) * 0.9;
        return w;
      },
      names: { density: ['Sparse board', 'Populated', 'Dense board'], meander: ['Orthogonal routing', 'Routed', 'Meandering'], detail: ['Bare copper', 'Components', 'Fully populated'] },
      noun: 'circuit board',
    };
  })();

  /* ================= TILE SET 2: KNOTWORK ================= */
  // Each tile holds the four corner arcs of a Celtic plait; an edge is either a
  // crossing ('x', strands pass through its midpoint) or a break ('b', they turn back).
  // Over-under follows one global rule so every strand alternates.
  const KNOT = (() => {
    const M = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
    const tiles = [];
    const byKey = new Map();
    for (let m = 0; m < 16; m++) {
      const mask = [(m >> 0) & 1, (m >> 1) & 1, (m >> 2) & 1, (m >> 3) & 1];
      const nx = mask.reduce((a, b) => a + b, 0);
      tiles.push({ key: 'k' + mask.join(''), mask, sock: mask.map((v) => (v ? 'x' : 'b')), w: 1, busy: nx / 2 - 1 + 0.25, turn: (4 - nx) / 4 * 2 - 0.6 });
    }
    tiles.push({ key: 'void', mask: null, sock: ['b', 'b', 'b', 'b'], w: 0.6, busy: -1.4, turn: 0 });
    tiles.forEach((t, i) => byKey.set(t.key, i));
    const mapMask = (t, f) => (t.mask ? byKey.get('k' + f(t.mask).join('')) : byKey.get('void'));
    tiles.forEach((t) => {
      t.mh = mapMask(t, (m) => [m[0], m[3], m[2], m[1]]);
      t.mv = mapMask(t, (m) => [m[2], m[1], m[0], m[3]]);
      t.r2 = mapMask(t, (m) => [m[2], m[3], m[0], m[1]]);
      t.draw = drawKnot;
    });
    function drawKnot(ctx, S, t, cell) {
      const [, strand, outline, dots] = S.pal.knot;
      if (!t.mask) {
        if (S.P.detail > 0.62) {
          ctx.fillStyle = dots;
          const r = 0.04;
          for (const [x, y] of [[0.5, 0.37], [0.385, 0.57], [0.615, 0.57]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
        }
        return;
      }
      const w = Math.min(0.25 * S.lw, 0.33), ow = 0.03 * Math.max(0.7, Math.min(1.4, S.lw)), hw = w / 2 + ow;
      const gap = hw + 0.04;
      const kap = 0.3;
      const mask = t.mask;
      const Q = (k) => [(M[k][0] + M[(k + 1) % 4][0]) / 2, (M[k][1] + M[(k + 1) % 4][1]) / 2];   // leg midpoints
      // a break at edge j turns the strand from leg j-1 onto leg j with a flat cubic
      const turn = (j) => {
        const a = Q((j + 3) % 4), b = Q(j), c = M[j];
        ctx.bezierCurveTo(a[0] + (c[0] - a[0]) * kap, a[1] + (c[1] - a[1]) * kap, b[0] + (c[0] - b[0]) * kap, b[1] + (c[1] - b[1]) * kap, b[0], b[1]);
      };
      const paths = [];
      const used = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        if (used[k] || !mask[k]) continue;
        const segs = [k]; used[k] = 1;
        let j = (k + 1) % 4;
        while (!mask[j]) { segs.push(j); used[j] = 1; j = (j + 1) % 4; }
        paths.push(segs);
      }
      const trace = (segs) => {
        ctx.beginPath();
        if (!segs) {           // a closed ring: four breaks
          const q = Q(3); ctx.moveTo(q[0], q[1]);
          for (let j = 0; j < 4; j++) turn(j);
          ctx.closePath();
          return;
        }
        const k = segs[0], s0 = M[k], s1 = M[(k + 1) % 4];
        const L = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
        ctx.moveTo(s0[0] + (s1[0] - s0[0]) / L * gap, s0[1] + (s1[1] - s0[1]) / L * gap);   // under end: stops short
        for (let q = 1; q < segs.length; q++) { const a = Q(segs[q - 1]); ctx.lineTo(a[0], a[1]); turn(segs[q]); }
        const e = M[(segs[segs.length - 1] + 1) % 4];
        ctx.lineTo(e[0], e[1]);                                                              // over end: to the midpoint
      };
      const all = paths.length ? paths : [null];
      ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      for (const segs of all) {
        trace(segs);
        ctx.lineWidth = w + 2 * ow; ctx.strokeStyle = outline; ctx.stroke();
        ctx.lineWidth = w; ctx.strokeStyle = strand; ctx.stroke();
        if (S.P.detail > 0.3) { ctx.lineWidth = Math.max(0.014, w * 0.1); ctx.strokeStyle = outline; ctx.stroke(); }
      }
      void cell;
    }
    return {
      id: 'knot', name: 'Knotwork', tiles, border: ['b'], world: true, ground: (pal) => pal.knot[0],
      weight(t, P) {
        let w = t.w * Math.exp(2.2 * (P.density - 0.5) * 2 * t.busy);
        w *= Math.exp(1.5 * (P.meander - 0.5) * 2 * t.turn);
        return w;
      },
      names: { density: ['Open ground', 'Knotted', 'Dense plait'], meander: ['Unbroken plait', 'Broken plait', 'Many breaks'], detail: ['Plain strands', 'Split strands', 'Lindisfarne dotting'] },
      noun: 'knot',
    };
  })();

  /* ================= TILE SET 3: COASTLINE ================= */
  // Corner-labelled terrain: each corner is deep sea (0), shallows (1), lowland (2)
  // or upland (3); corners of one tile differ by at most one level. Edges carry the
  // two corner levels, plus a river crossing on lowland edges. The drawn field is
  // the smoothstep-bilinear blend of the corners plus a small world-space noise,
  // so shores meander yet match exactly from tile to tile.
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (i, j) => hash((Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed) | 0) * 2 - 1;
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const COAST = (() => {
    const tiles = [];
    const byKey = new Map();
    const K = 14;
    const sstep = (u) => u * u * (3 - 2 * u);
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) {
      const cs = [a, b, c, d];       // NW NE SE SW
      if (Math.max(...cs) - Math.min(...cs) > 1) continue;
      tiles.push({ cs, riv: [0, 0, 0, 0] });
    }
    const riverShapes = [[1, 0, 1, 0], [0, 1, 0, 1], [1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 1], [1, 0, 0, 1], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (const r of riverShapes) tiles.push({ cs: [1, 1, 1, 1], riv: r });
    tiles.push({ cs: [1, 1, 0, 0], riv: [1, 0, 0, 0] });
    tiles.push({ cs: [0, 1, 1, 0], riv: [0, 1, 0, 0] });
    tiles.push({ cs: [0, 0, 1, 1], riv: [0, 0, 1, 0] });
    tiles.push({ cs: [1, 0, 0, 1], riv: [0, 0, 0, 1] });
    const keyOf = (cs, riv) => cs.join('') + '/' + riv.join('');
    const UNI = [1.0, 0.9, 0.4], MIX = [0.11, 0.07];
    tiles.forEach((t, i) => {
      const [nw, ne, se, sw] = t.cs;
      const e = (p, q, r) => '' + p + (r ? 'r' : '-') + q;
      t.sock = [e(nw, ne, t.riv[0]), e(ne, se, t.riv[1]), e(se, sw, t.riv[2]), e(sw, nw, t.riv[3])];
      t.key = keyOf(t.cs, t.riv);
      const lo = Math.min(...t.cs), hi = Math.max(...t.cs);
      const mean = (nw + ne + se + sw) / 4;
      const nr = t.riv.reduce((x, y) => x + y, 0);
      // coast shape: straight shores are common, lone points and saddles rare
      const nhi = t.cs.filter((v) => v === hi).length, diag = nhi === 2 && t.cs[0] === t.cs[2];
      const shape = lo === hi ? 1 : nhi === 1 ? 0.6 : nhi === 3 ? 1.1 : diag ? 0.25 : 1.15;
      t.w = (lo === hi ? UNI[lo] : MIX[lo]) * shape * (nr ? (nr === 1 && lo === hi ? 0.1 : 0.7 / nr) : 1);
      t.busy = (mean - 0.5) / 1.1;
      t.turn = lo === hi ? -0.5 : 1;
      t.river = nr > 0;
      t.lo = lo; t.hi = hi;
      byKey.set(t.key, i);
      t.draw = drawCoast;
    });
    tiles.forEach((t) => {
      const [nw, ne, se, sw] = t.cs, [n, e, s, w] = t.riv;
      t.mh = byKey.get(keyOf([ne, nw, sw, se], [n, w, s, e]));
      t.mv = byKey.get(keyOf([sw, se, ne, nw], [s, e, n, w]));
      t.r2 = byKey.get(keyOf([se, sw, nw, ne], [s, w, n, e]));
    });
    function regions(f, c) {
      const polys = [];
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
        const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const val = q.map(([x, y]) => f[y * (K + 1) + x]);
        if (val.every((v) => v < c)) continue;
        const out = [];
        for (let k = 0; k < 4; k++) {
          const a = q[k], b = q[(k + 1) % 4], va = val[k], vb = val[(k + 1) % 4];
          if (va >= c) out.push(a[0] / K, a[1] / K);
          if ((va >= c) !== (vb >= c)) { const t = (c - va) / (vb - va); out.push((a[0] + (b[0] - a[0]) * t) / K, (a[1] + (b[1] - a[1]) * t) / K); }
        }
        polys.push(out);
      }
      return polys;
    }
    function contour(f, c) {
      const segs = [];
      for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) {
        const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const val = q.map(([x, y]) => f[y * (K + 1) + x]);
        const pts = [];
        for (let k = 0; k < 4; k++) {
          const a = q[k], b = q[(k + 1) % 4], va = val[k], vb = val[(k + 1) % 4];
          if ((va >= c) !== (vb >= c)) { const t = (c - va) / (vb - va); pts.push((a[0] + (b[0] - a[0]) * t) / K, (a[1] + (b[1] - a[1]) * t) / K); }
        }
        if (pts.length >= 4) segs.push(pts[0], pts[1], pts[2], pts[3]);
        if (pts.length === 8) segs.push(pts[4], pts[5], pts[6], pts[7]);
      }
      return segs;
    }
    const LEVELS = [0.25, 0.5, 0.56, 1.5];          // shallows, beach, lowland, upland
    const WATERLINES = [0.44, 0.37, 0.31];
    // The drawn terrain is a global field: Catmull-Rom through the solved corner lattice
    // (exact at the corners), sampled through a smooth domain warp so shores stop
    // following the grid, plus fine noise near the coast. Every tile samples the same
    // function, so shores run seamlessly from tile to tile.
    const crI = (p0, p1, p2, p3, x) => 0.5 * (2 * p1 + (p2 - p0) * x + (2 * p0 - 5 * p1 + 4 * p2 - p3) * x * x + (3 * p1 - p0 - 3 * p2 + p3) * x * x * x);
    function warp(S, X, Y) {
      const W = S.warp, sd = S.nseed;
      return [W * (vnoise(X * 0.45 + 11.3, Y * 0.45 + 2.7, sd + 21) + 0.5 * vnoise(X * 1.1 + 5.5, Y * 1.1 + 8.8, sd + 23)),
              W * (vnoise(X * 0.45 + 5.1, Y * 0.45 + 19.9, sd + 22) + 0.5 * vnoise(X * 1.1 + 1.2, Y * 1.1 + 3.4, sd + 24))];
    }
    function fieldAt(S, X, Y) {
      const CL = S.corners, cw = S.cols + 1, ch = CL.length / cw;
      const w = warp(S, X, Y), Xw = X + w[0], Yw = Y + w[1];
      const gx = Math.floor(Xw), gy = Math.floor(Yw), u = Xw - gx, v = Yw - gy;
      const cv = (x, y) => CL[Math.max(0, Math.min(ch - 1, y)) * cw + Math.max(0, Math.min(cw - 1, x))];
      const r0 = crI(cv(gx - 1, gy - 1), cv(gx, gy - 1), cv(gx + 1, gy - 1), cv(gx + 2, gy - 1), u);
      const r1 = crI(cv(gx - 1, gy), cv(gx, gy), cv(gx + 1, gy), cv(gx + 2, gy), u);
      const r2 = crI(cv(gx - 1, gy + 1), cv(gx, gy + 1), cv(gx + 1, gy + 1), cv(gx + 2, gy + 1), u);
      const r3 = crI(cv(gx - 1, gy + 2), cv(gx, gy + 2), cv(gx + 1, gy + 2), cv(gx + 2, gy + 2), u);
      const b0 = crI(r0, r1, r2, r3, v);
      const sd = S.nseed;
      const n = vnoise(Xw * 1.3, Yw * 1.3, sd) + 0.55 * vnoise(Xw * 2.9 + 17.3, Yw * 2.9 + 5.1, sd + 7) + 0.3 * vnoise(Xw * 6.1 + 3.7, Yw * 6.1 + 9.2, sd + 13);
      return b0 + S.amp * Math.max(0, Math.min(1, b0 * 2)) * n / 1.85;          // calm open sea, ragged shores
    }
    // screen point that shows the field's point p (inverse of the warp, two fixed-point steps)
    function unwarp(S, X, Y) {
      let w = warp(S, X, Y), x = X - w[0], y = Y - w[1];
      w = warp(S, x, y); return [X - w[0], Y - w[1]];
    }
    function geom(S, t, cell) {
      const cache = S.cache;
      let g = cache && cache.get(cell);
      if (g) return g;
      const gx = cell % S.cols, gy = (cell / S.cols) | 0;
      const f = new Float32Array((K + 1) * (K + 1));
      let lo = 9, hi = -9;
      const cs = t.cs;
      for (let j = 0; j <= K; j++) for (let i = 0; i <= K; i++) {
        const u = i / K, v = j / K;
        let val;
        if (S.corners) val = fieldAt(S, gx + u, gy + v);
        else { const su = sstep(u), sv = sstep(v); val = cs[0] * (1 - su) * (1 - sv) + cs[1] * su * (1 - sv) + cs[2] * su * sv + cs[3] * (1 - su) * sv; }
        f[j * (K + 1) + i] = val;
        if (val < lo) lo = val; if (val > hi) hi = val;
      }
      g = { base: 0, gx, gy };
      g.fills = LEVELS.map((c) => (c > lo && c < hi ? regions(f, c) : c <= lo ? 'all' : null));
      g.coast = lo < 0.5 && hi > 0.5 ? contour(f, 0.5) : null;
      g.water = lo < 0.5 && hi > WATERLINES[2] ? WATERLINES.map((c) => (c > lo && c < hi ? contour(f, c) : null)) : null;
      g.depth = lo < 0.13 && hi > 0.13 ? contour(f, 0.13) : null;
      g.hill = lo < 1.5 && hi > 1.5 ? contour(f, 1.5) : null;
      g.hill2 = lo < 1.78 && hi > 1.78 ? contour(f, 1.78) : null;
      // hachures: short strokes down the fall line from the upland edge
      if (g.hill && S.corners) {
        const h = [], seg = g.hill;
        for (let q = 0; q < seg.length; q += 4) {
          if (hash(cell * 131 + q) < 0.35) continue;
          const mx = (seg[q] + seg[q + 2]) / 2, my = (seg[q + 1] + seg[q + 3]) / 2;
          let nx = -(seg[q + 3] - seg[q + 1]), ny = seg[q + 2] - seg[q];
          const L = Math.hypot(nx, ny); if (L < 1e-6) continue;
          nx /= L; ny /= L;
          if (fieldAt(S, gx + mx + nx * 0.03, gy + my + ny * 0.03) > fieldAt(S, gx + mx - nx * 0.03, gy + my - ny * 0.03)) { nx = -nx; ny = -ny; }
          h.push(mx - nx * 0.03, my - ny * 0.03, mx + nx * 0.11, my + ny * 0.11);
        }
        g.hach = h;
      }
      if (cache) cache.set(cell, g);
      return g;
    }
    const baseCol = (pal, lev) => [pal.terrain[0], pal.terrain[2], pal.terrain[3]][lev];
    const levCol = (pal) => [pal.terrain[1], pal.terrain[4], pal.terrain[2], pal.terrain[3]];
    function segPath(ctx, segs) { for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(segs[i], segs[i + 1]); ctx.lineTo(segs[i + 2], segs[i + 3]); } }
    function drawFills(ctx, S, t, cell) {
      const g = geom(S, t, cell);
      const pal = S.pal, cols = levCol(pal);
      const seal = S.seal;
      let base = baseCol(pal, g.base);
      g.fills.forEach((polys, k) => { if (polys === 'all') base = cols[k]; });
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
      if (seal) { ctx.strokeStyle = base; ctx.lineWidth = seal; ctx.strokeRect(0, 0, 1, 1); }
      g.fills.forEach((polys, k) => {
        if (!polys || polys === 'all' || !polys.length) return;
        ctx.beginPath();
        for (const p of polys) { ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); }
        ctx.fillStyle = cols[k]; ctx.fill();
        if (seal) { ctx.strokeStyle = cols[k]; ctx.lineWidth = seal; ctx.stroke(); }
      });
    }
    function drawLines(ctx, S, t, cell) {
      const g = geom(S, t, cell);
      const pal = S.pal, lw = S.lw, det = S.P.detail;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (g.depth && det > 0.15) { ctx.save(); ctx.setLineDash([0.035, 0.05]); ctx.beginPath(); segPath(ctx, g.depth); ctx.lineWidth = 0.009 * lw; ctx.strokeStyle = pal.ink; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.restore(); }
      if (g.water && det > 0.05) {
        const nwl = 1 + Math.floor(det * 2.99);
        g.water.forEach((segs, k) => { if (!segs || k >= nwl) return; ctx.beginPath(); segPath(ctx, segs); ctx.lineWidth = 0.009 * lw; ctx.strokeStyle = pal.ink; ctx.globalAlpha = 0.6 - k * 0.15; ctx.stroke(); });
        ctx.globalAlpha = 1;
      }
      if (g.hill) { ctx.beginPath(); segPath(ctx, g.hill); ctx.lineWidth = 0.011 * lw; ctx.strokeStyle = pal.ink; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1; }
      if (g.hill2 && det > 0.4) { ctx.beginPath(); segPath(ctx, g.hill2); ctx.lineWidth = 0.009 * lw; ctx.strokeStyle = pal.ink; ctx.globalAlpha = 0.35; ctx.stroke(); ctx.globalAlpha = 1; }
      if (g.hach && det > 0.2) { ctx.beginPath(); segPath(ctx, g.hach); ctx.lineWidth = 0.011 * lw; ctx.strokeStyle = pal.ink; ctx.globalAlpha = 0.55; ctx.lineCap = 'butt'; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'round'; }
      if (t.river && S.corners) {
        // the tile's river, sampled, carried through the warp and kept to dry land
        const mouth = t.cs.some((v) => v < 1);
        const mids = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
        const on = t.riv.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
        const curves = [];
        if (mouth) { const a = mids[on[0]]; curves.push([a, [0.5 + (a[0] - 0.5) * 0.3, 0.5 + (a[1] - 0.5) * 0.3], [0.5 + (0.5 - a[0]) * 1.6, 0.5 + (0.5 - a[1]) * 1.6]]); }
        else if (on.length === 1) { const a = mids[on[0]]; curves.push([a, [(a[0] + 0.5) / 2, (a[1] + 0.5) / 2], [0.5, 0.5]]); }
        else {
          const a = mids[on[0]], b = mids[on[1]];
          const wob = (hash(cell * 5 + 1) - 0.5) * 0.5;
          curves.push([a, [0.5 + (b[1] - a[1]) * wob, 0.5 - (b[0] - a[0]) * wob], b]);
        }
        const rw = 0.04 * Math.max(0.8, lw);
        ctx.lineWidth = rw; ctx.strokeStyle = pal.water; ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [a, c, b] of curves) {
          let pen = false;
          for (let k = 0; k <= 16; k++) {
            const tt = k / 16, it = 1 - tt;
            const px = it * it * a[0] + 2 * it * tt * c[0] + tt * tt * b[0], py = it * it * a[1] + 2 * it * tt * c[1] + tt * tt * b[1];
            const [X, Y] = unwarp(S, g.gx + px, g.gy + py);
            if (fieldAt(S, X, Y) < 0.52) { pen = false; continue; }
            if (pen) ctx.lineTo(X - g.gx, Y - g.gy); else ctx.moveTo(X - g.gx, Y - g.gy);
            pen = true;
          }
        }
        ctx.stroke();
        if (!mouth && on.length === 1) { const [X, Y] = unwarp(S, g.gx + 0.5, g.gy + 0.5); if (fieldAt(S, X, Y) > 0.6) { disc(ctx, X - g.gx, Y - g.gy, rw * 0.9, pal.ink); disc(ctx, X - g.gx, Y - g.gy, rw * 0.55, pal.water); } }
      }
      if (g.coast) { ctx.beginPath(); segPath(ctx, g.coast); ctx.lineWidth = 0.022 * lw; ctx.strokeStyle = pal.ink; ctx.stroke(); }
      // map symbols, placed by the field itself: fells on high ground, trees on the lowland
      if (det > 0.25 && S.corners) {
        for (let k = 0; k < 2; k++) {
          const h = hash(cell * 13 + 5 + k * 101);
          const x = 0.2 + hash(cell * 31 + k) * 0.6, y = 0.25 + hash(cell * 17 + k * 3) * 0.55;
          const fv = fieldAt(S, g.gx + x, g.gy + y);
          if (fv > 1.72 && h < 0.75) {
            const sz = 0.12 + 0.05 * hash(cell + k * 7);
            ctx.beginPath(); ctx.moveTo(x - sz, y + sz * 0.55); ctx.lineTo(x, y - sz * 0.55); ctx.lineTo(x + sz, y + sz * 0.55);
            ctx.moveTo(x - sz * 0.1, y - sz * 0.35); ctx.lineTo(x + sz * 0.35, y + sz * 0.2);
            ctx.lineWidth = 0.015 * lw; ctx.strokeStyle = pal.ink; ctx.lineJoin = 'miter'; ctx.stroke();
          } else if (fv > 0.75 && fv < 1.3 && h < 0.16 * det) {
            ctx.beginPath(); ctx.moveTo(x, y + 0.055); ctx.lineTo(x, y + 0.11); ctx.lineWidth = 0.012 * lw; ctx.strokeStyle = pal.ink; ctx.stroke();
            ring(ctx, x, y + 0.02, 0.038, 0.012 * lw, pal.ink);
          }
        }
      }
    }
    function drawCoast(ctx, S, t, cell) { drawFills(ctx, S, t, cell); drawLines(ctx, S, t, cell); }
    const SEA = byKey.get('0000/0000'), LAND = byKey.get('1111/0000');
    return {
      id: 'coast', name: 'Coastline', tiles, border: ['0-0'], world: true,
      weight(t, P) {
        let w = t.w * Math.exp(2.6 * (P.density - 0.5) * 2 * t.busy);
        w *= Math.exp(1.3 * (P.meander - 0.5) * 2 * t.turn);
        if (t.river) w *= 0.02 + P.detail * 0.55;
        return w;
      },
      geom, drawFills, drawLines, levCol, baseCol,
      // initial constraints: a sparse, jittered lattice of cells fixed to open sea or
      // lowland from a slow noise, so continents and seas both get a start
      seeds(P, cols, rows) {
        const out = [], sp = 4, ns = (P.seed * 97 + 11) | 0;
        const thr = (0.5 - P.density) * 1.5;
        const canon = (x, y) => [P.symmetry === 1 || P.symmetry === 2 ? Math.min(x, cols - 1 - x) : x, P.symmetry === 2 ? Math.min(y, rows - 1 - y) : y];
        for (let gy = 1; gy < rows - 1; gy += sp) for (let gx = 1; gx < cols - 1; gx += sp) {
          const x = Math.min(cols - 1, gx + Math.floor(hash(gx * 31 + gy * 17 + ns) * 2));
          const y = Math.min(rows - 1, gy + Math.floor(hash(gx * 13 + gy * 29 + ns + 5) * 2));
          if (P.border === 1 && (x < 2 || y < 2 || x > cols - 3 || y > rows - 3)) continue;
          if (P.symmetry === 1 && x > (cols - 1) / 2) continue;
          if (P.symmetry === 2 && (x > (cols - 1) / 2 || y > (rows - 1) / 2)) continue;
          if (P.symmetry === 3 && y * cols + x > (cols * rows - 1) / 2) continue;
          const [cx, cy] = canon(x, y);
          const n = vnoise(cx * 0.21, cy * 0.21, ns) + 0.45 * vnoise(cx * 0.47 + 3.1, cy * 0.47 + 7.7, ns + 3);
          out.push([y * cols + x, n > thr ? LAND : SEA]);
        }
        return out;
      },
      names: { density: ['Archipelago', 'Coast', 'Mainland'], meander: ['Smooth shores', 'Indented coast', 'Fjords'], detail: ['Plain chart', 'Charted', 'Fully surveyed'] },
      noun: 'coast',
    };
  })();

  /* ================= TILE SET 4: METRO ================= */
  const METRO = (() => {
    const B = [];
    const LW = (S) => 0.15 * S.lw;
    for (let c = 0; c < 3; c++) {
      const k = 'abc'[c];
      const col = (S) => S.pal.lines[c];
      B.push({ id: 'st' + k, sock: [k, '0', k, '0'], sym: 'I', w: 2.2, busy: 0.3, turn: -1, draw(ctx, S) { strokePath(ctx, [0.5, 0, 0.5, 1], LW(S), col(S)); } });
      B.push({ id: 'tu' + k, sock: [k, k, '0', '0'], sym: 'L', w: 1.1, busy: 0.3, turn: 1, draw(ctx, S) {
        ctx.lineJoin = 'round'; strokePath(ctx, [0.5, 0, 0.5, 0.22, 0.78, 0.5, 1, 0.5], LW(S), col(S));
      } });
      B.push({ id: 'sn' + k, sock: [k, '0', k, '0'], sym: 'V', w: 0.9, busy: 0.3, detail: 1, draw(ctx, S) {
        strokePath(ctx, [0.5, 0, 0.5, 1], LW(S), col(S));
        ctx.fillStyle = col(S); ctx.fillRect(0.5, 0.5 - LW(S) * 0.4, LW(S) * 0.5 + 0.11, LW(S) * 0.8);
      } });
      B.push({ id: 'ix' + k, sock: [k, '0', k, '0'], sym: 'I', w: 0.25, busy: 0.3, detail: 1, draw(ctx, S) {
        strokePath(ctx, [0.5, 0, 0.5, 1], LW(S), col(S));
        disc(ctx, 0.5, 0.5, 0.12 * Math.max(0.9, S.lw), S.pal.light); ring(ctx, 0.5, 0.5, 0.12 * Math.max(0.9, S.lw), 0.045 * S.lw, S.pal.ink);
      } });
      B.push({ id: 'te' + k, sock: [k, '0', '0', '0'], sym: 'T', w: 0.07, busy: 0.1, draw(ctx, S) {
        strokePath(ctx, [0.5, 0, 0.5, 0.55], LW(S), col(S));
        strokePath(ctx, [0.5 - 0.17, 0.55, 0.5 + 0.17, 0.55], LW(S) * 0.75, col(S));
      } });
      B.push({ id: 'br' + k, sock: [k, k, k, '0'], sym: 'V', w: 0.12, busy: 0.5, turn: 0.6, draw(ctx, S) {
        strokePath(ctx, [0.5, 0, 0.5, 1], LW(S), col(S));
        ctx.lineJoin = 'round'; strokePath(ctx, [0.5, 0.22, 0.78, 0.5, 1, 0.5], LW(S), col(S));
      } });
      for (let c2 = 0; c2 < 3; c2++) {
        const k2 = 'abc'[c2];
        B.push({ id: 'x' + k + k2, sock: [k, k2, k, k2], sym: 'I', w: 0.2, busy: 0.6, draw(ctx, S) {
          strokePath(ctx, [0, 0.5, 1, 0.5], LW(S), S.pal.lines[c2]);
          strokePath(ctx, [0.5, 0.12, 0.5, 0.88], LW(S) + 0.09, S.pal.bg);
          strokePath(ctx, [0.5, 0, 0.5, 1], LW(S), col(S));
        } });
        if (c2 >= c) B.push({ id: 'xi' + k + k2, sock: [k, k2, k, k2], sym: c === c2 ? 'X' : 'I', w: 0.12, busy: 0.6, detail: 1, draw(ctx, S) {
          strokePath(ctx, [0, 0.5, 1, 0.5], LW(S), S.pal.lines[c2]);
          strokePath(ctx, [0.5, 0, 0.5, 1], LW(S), col(S));
          const r = 0.15 * Math.max(0.9, S.lw);
          disc(ctx, 0.5, 0.5, r, S.pal.light); ring(ctx, 0.5, 0.5, r, 0.05 * S.lw, S.pal.ink);
        } });
      }
    }
    B.push({ id: 'empty', sock: ['0', '0', '0', '0'], sym: 'X', w: 2.4, busy: -1, draw() {} });
    // a river, crossed on bridges
    const RW = 0.4;
    B.push({ id: 'river', sock: ['w', '0', 'w', '0'], sym: 'I', w: 0.5, busy: 0, river: 1, turn: -1, draw(ctx, S) { ctx.fillStyle = S.pal.water; ctx.fillRect(0.5 - RW / 2, -0.005, RW, 1.01); } });
    B.push({ id: 'riverbend', sock: ['w', 'w', '0', '0'], sym: 'L', w: 0.08, busy: 0, river: 1, turn: 1, draw(ctx, S) {
      ctx.beginPath(); ctx.arc(1, 0, 0.5, Math.PI / 2, Math.PI); ctx.lineWidth = RW; ctx.strokeStyle = S.pal.water; ctx.lineCap = 'butt'; ctx.stroke();
    } });
    for (let c = 0; c < 3; c++) {
      const k = 'abc'[c];
      B.push({ id: 'bridge' + k, sock: [k, 'w', k, 'w'], sym: 'I', w: 0.3, busy: 0.4, river: 1, draw(ctx, S) {
        ctx.fillStyle = S.pal.water; ctx.fillRect(-0.005, 0.5 - RW / 2, 1.01, RW);
        strokePath(ctx, [0.5, 0, 0.5, 1], LW(S), S.pal.lines[c]);
      } });
    }
    const tiles = expand(B);
    return {
      id: 'metro', name: 'Metro', tiles, border: ['0'],
      weight(t, P) {
        const b = t.base;
        let w = b.w * Math.exp(2.2 * (P.density - 0.5) * 2 * b.busy);
        if (b.turn) w *= Math.exp(1.5 * (P.meander - 0.5) * 2 * b.turn);
        if (b.detail) w *= 0.15 + 2 * P.detail;
        if (b.river) w *= 0.25 + 1.2 * P.detail;
        return w;
      },
      names: { density: ['Branch lines', 'Network', 'Dense network'], meander: ['Straight runs', 'Curving', 'Winding'], detail: ['Lines only', 'Stations', 'Interchanges'] },
      noun: 'metro map',
    };
  })();

  const SETS = [CIRCUIT, KNOT, COAST, METRO];
  SETS.forEach((set) => set.tiles.forEach((t) => { t.rsock = t.sock.map(rev); }));

  /* ---------------- the solver ---------------- */
  function gridDims(P) {
    const a = C.FORMATS[P.format].a;
    const g = P.grid;
    return a >= 1 ? { cols: Math.max(g, Math.round(g * a)), rows: g } : { cols: g, rows: Math.max(g, Math.round(g / a)) };
  }

  function makeSolver(set, P) {
    const tiles = set.tiles, T = tiles.length;
    const { cols, rows } = gridDims(P);
    const N = cols * rows;
    const w = new Float64Array(T), wl = new Float64Array(T);
    for (let t = 0; t < T; t++) { w[t] = Math.max(1e-6, set.weight(tiles[t], P)); wl[t] = w[t] * Math.log(w[t]); }
    let W0 = 0, WL0 = 0;
    for (let t = 0; t < T; t++) { W0 += w[t]; WL0 += wl[t]; }
    const H0 = Math.log(W0) - WL0 / W0;
    const prop = [0, 1, 2, 3].map((d) => tiles.map((a) => {
      const out = [];
      for (let t2 = 0; t2 < T; t2++) if (a.sock[d] === tiles[t2].rsock[(d + 2) % 4]) out.push(t2);
      return Int32Array.from(out);
    }));
    const wave = new Uint8Array(N * T), comp = new Int16Array(N * T * 4);
    const count = new Int32Array(N), sumW = new Float64Array(N), sumWL = new Float64Array(N), ent = new Float64Array(N);
    const stack = new Int32Array(N * T + 16);
    const decided = new Int32Array(N), touched = new Int32Array(N);
    let sp = 0, step = 0, bad = false;
    const sym = P.symmetry;
    const cellH = (i) => { const x = i % cols, y = (i / cols) | 0; return y * cols + (cols - 1 - x); };
    const cellV = (i) => { const x = i % cols, y = (i / cols) | 0; return (rows - 1 - y) * cols + x; };
    const cellR = (i) => N - 1 - i;

    function ban(i, t) {
      const it = i * T + t;
      if (!wave[it]) return;
      wave[it] = 0;
      const b4 = it * 4; comp[b4] = comp[b4 + 1] = comp[b4 + 2] = comp[b4 + 3] = 0;
      stack[sp++] = it;
      count[i]--; sumW[i] -= w[t]; sumWL[i] -= wl[t];
      ent[i] = sumW[i] > 0 ? Math.log(sumW[i]) - sumWL[i] / sumW[i] : 0;
      if (touched[i] < 0) touched[i] = step;
      if (count[i] === 1) decided[i] = step;
      if (count[i] === 0) bad = true;
      if (sym === 1 || sym === 2) ban(cellH(i), tiles[t].mh);
      if (sym === 2) ban(cellV(i), tiles[t].mv);
      if (sym === 3) ban(cellR(i), tiles[t].r2);
    }
    let tLast = 0, tk = 0;
    const late = () => ((++tk & 15) === 0 && performance.now() - tLast > SLICE);
    function* propagate() {
      while (sp > 0) {
        const it = stack[--sp];
        const i = (it / T) | 0, t = it - i * T;
        const x = i % cols, y = (i / cols) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx, od = (d + 2) & 3;
          const p = prop[d][t];
          for (let k = 0; k < p.length; k++) {
            const ci = (j * T + p[k]) * 4 + od;
            if (comp[ci] > 0 && --comp[ci] === 0) ban(j, p[k]);
          }
        }
        if (bad) return false;
        if (late()) { yield; tLast = performance.now(); }
      }
      return !bad;
    }
    let seeds = null;
    const tmpl = new Int16Array(T * 4);
    for (let t = 0; t < T; t++) for (let d = 0; d < 4; d++) tmpl[t * 4 + d] = prop[d][t].length;
    function* reset() {
      wave.fill(1);
      for (let i = 0; i < N; i++) {
        comp.set(tmpl, i * T * 4);
        if (late()) { yield; tLast = performance.now(); }
      }
      count.fill(T); sumW.fill(W0); sumWL.fill(WL0); ent.fill(H0);
      decided.fill(-1); touched.fill(-1);
      sp = 0; step = 0; bad = false;
      if (P.border === 1) {
        for (let i = 0; i < N; i++) {
          const x = i % cols, y = (i / cols) | 0;
          for (let t = 0; t < T; t++) {
            const s = tiles[t].sock;
            if ((y === 0 && !set.border.includes(s[0])) || (x === cols - 1 && !set.border.includes(s[1])) ||
                (y === rows - 1 && !set.border.includes(s[2])) || (x === 0 && !set.border.includes(s[3]))) ban(i, t);
          }
          if (late()) { yield; tLast = performance.now(); }
        }
      }
      if (seeds) for (const [i, keep] of seeds) for (let t = 0; t < T; t++) if (t !== keep) ban(i, t);
      // cells on a mirror line or at the centre of rotation keep only self-symmetric tiles
      for (let i = 0; i < N; i++) {
        for (let t = 0; t < T; t++) {
          if ((sym === 1 || sym === 2) && cellH(i) === i && tiles[t].mh !== t) ban(i, t);
          if (sym === 2 && cellV(i) === i && tiles[t].mv !== t) ban(i, t);
          if (sym === 3 && cellR(i) === i && tiles[t].r2 !== t) ban(i, t);
        }
        if (late()) { yield; tLast = performance.now(); }
      }
      return yield* propagate();
    }
    let scan = 0;
    function observe(R) {
      step++;
      let best = -1;
      if (P.heuristic === 2) {
        while (scan < N && count[scan] <= 1) scan++;
        best = scan < N ? scan : -1;
      } else {
        let bv = Infinity;
        for (let i = 0; i < N; i++) {
          if (count[i] <= 1) continue;
          const v = (P.heuristic === 0 ? ent[i] : count[i]) + 1e-4 * R();
          if (v < bv) { bv = v; best = i; }
        }
      }
      if (best < 0) return false;
      let tot = 0;
      const b = best * T;
      for (let t = 0; t < T; t++) if (wave[b + t]) tot += w[t];
      let r = R() * tot, pick = -1;
      for (let t = 0; t < T; t++) if (wave[b + t]) { r -= w[t]; pick = t; if (r < 0) break; }
      for (let t = 0; t < T; t++) if (t !== pick && wave[b + t]) ban(best, t);
      return true;
    }
    function* solve() {
      for (let attempt = 0; attempt < 30; attempt++) {
        const R = C.rng(((P.seed + 1) * 2654435761 + attempt * 97531) >>> 0);
        scan = 0;
        tLast = performance.now();
        seeds = set.seeds && attempt < 12 ? set.seeds(P, cols, rows) : null;
        let ok = yield* reset();
        let n = 0;
        while (ok) {
          if (!observe(R)) break;
          ok = yield* propagate();
          n++;
          if (late()) { yield n / N; tLast = performance.now(); }
        }
        if (ok) {
          const cellsT = new Int32Array(N);
          for (let i = 0; i < N; i++) { let tt = 0; for (let t = 0; t < T; t++) if (wave[i * T + t]) { tt = t; break; } cellsT[i] = tt; }
          return { cols, rows, cells: cellsT, decided: Int32Array.from(decided), touched: Int32Array.from(touched), steps: Math.max(1, step), attempts: attempt + 1 };
        }
        yield 0;
      }
      return null;
    }
    return { solve, N, T, cols, rows };
  }

  function drain(gen) { let x; do { x = gen.next(); } while (!x.done); return x.value; }
  // relax symmetry and border until a solution exists
  function fallbackSolve(set, P) {
    return drain(makeSolver(set, Object.assign({}, P, { symmetry: 0 })).solve()) ||
      drain(makeSolver(set, Object.assign({}, P, { symmetry: 0, border: 0 })).solve());
  }

  /* ---------------- painting ---------------- */
  function layout(P, Wpx, Hpx, sol) {
    const a = C.FORMATS[P.format].a;
    const k = Hpx / 1000;
    const VW = 1000 * a, VH = 1000;
    const m = P.margin * Math.min(VW, VH);
    const cell = Math.min((VW - 2 * m) / sol.cols, (VH - 2 * m) / sol.rows);
    const gw = cell * sol.cols, gh = cell * sol.rows;
    return { k, VW, VH, cell, x0: (VW - gw) / 2, y0: (VH - gh) / 2, gw, gh, m };
  }
  function styleFor(P, L, sol) {
    if (sol && !sol.cache) sol.cache = new Map();
    if (sol && P.set === 2 && !sol.corners) {
      // the corner lattice of the solved coast (every tile agrees with its neighbours)
      const cw = sol.cols + 1, CL = new Float32Array(cw * (sol.rows + 1));
      for (let i = 0; i < sol.cells.length; i++) {
        const x = i % sol.cols, y = (i / sol.cols) | 0, cs = COAST.tiles[sol.cells[i]].cs;
        CL[y * cw + x] = cs[0]; CL[y * cw + x + 1] = cs[1]; CL[(y + 1) * cw + x + 1] = cs[2]; CL[(y + 1) * cw + x] = cs[3];
      }
      sol.corners = CL;
    }
    return { pal: PALS[P.palette], lw: P.stroke, P, seal: 1.2 / (L.cell * L.k), px: 1 / (L.cell * L.k),
      cols: sol ? sol.cols : 1, cache: sol ? sol.cache : null, corners: sol && P.set === 2 ? sol.corners : null, amp: 0.16 + 0.16 * P.meander, warp: 0.3 + 0.32 * P.meander, nseed: (P.seed * 131 + 7) | 0 };
  }
  function drawTile(ctx, set, tile, i, L, S) {
    const x = i % S.cols, y = (i / S.cols) | 0;
    const cx = L.x0 + x * L.cell, cy = L.y0 + y * L.cell;
    ctx.save();
    if (tile.M) {
      const M = tile.M;
      ctx.translate(cx + L.cell / 2, cy + L.cell / 2);
      ctx.transform(M[0], M[2], M[1], M[3], 0, 0);
      ctx.scale(L.cell, L.cell);
      ctx.translate(-0.5, -0.5);
      tile.base.draw(ctx, S, tile, i);
    } else {
      ctx.translate(cx, cy);
      ctx.scale(L.cell, L.cell);
      tile.draw(ctx, S, tile, i);
    }
    ctx.restore();
  }
  function frameAndGround(ctx, P, L, S) {
    const pal = S.pal, set = SETS[P.set];
    ctx.fillStyle = pal.bg;
    ctx.fillRect(-2, -2, L.VW + 4, L.VH + 4);
    if (set.ground) { ctx.fillStyle = set.ground(pal); ctx.fillRect(L.x0, L.y0, L.gw, L.gh); }
    if (L.m > 1) {
      ctx.lineWidth = 1.4 * Math.max(0.6, P.stroke);
      ctx.strokeStyle = pal.ink;
      ctx.globalAlpha = 0.6;
      const pad = Math.min(L.m * 0.4, 12);
      ctx.strokeRect(L.x0 - pad, L.y0 - pad, L.gw + 2 * pad, L.gh + 2 * pad);
      ctx.globalAlpha = 1;
    }
  }
  function gridLines(ctx, P, L, S, sol) {
    if (!P.cells) return;
    ctx.save();
    ctx.strokeStyle = S.pal.ink;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let x = 0; x <= sol.cols; x++) { ctx.moveTo(L.x0 + x * L.cell, L.y0); ctx.lineTo(L.x0 + x * L.cell, L.y0 + L.gh); }
    for (let y = 0; y <= sol.rows; y++) { ctx.moveTo(L.x0, L.y0 + y * L.cell); ctx.lineTo(L.x0 + L.gw, L.y0 + y * L.cell); }
    ctx.stroke();
    ctx.restore();
  }
  // the finished picture, drawn in one pass (coast fills batched so tiles don't seam)
  function paintAll(ctx, Wpx, Hpx, P, sol) { drain(paintGen(ctx, Wpx, Hpx, P, sol)); }
  function* paintGen(ctx, Wpx, Hpx, P, sol) {
    let tLast = performance.now(), tk = 0;
    const late = () => ((++tk & 1) === 0 && performance.now() - tLast > SLICE);
    const set = SETS[P.set];
    const L = layout(P, Wpx, Hpx, sol);
    const S = styleFor(P, L, sol);
    ctx.save();
    ctx.setTransform(L.k, 0, 0, L.k, 0, 0);
    frameAndGround(ctx, P, L, S);
    ctx.save();
    ctx.beginPath(); ctx.rect(L.x0, L.y0, L.gw, L.gh); ctx.clip();
    if (set === COAST) {
      const pal = S.pal;
      const cols = [pal.terrain[0], pal.terrain[2], pal.terrain[3], pal.terrain[3]];
      const lcol = set.levCol(pal);
      const layers = [[], [], [], [], [], [], [], []];
      for (let i = 0; i < sol.cells.length; i++) {
        const t = set.tiles[sol.cells[i]];
        const g = set.geom(S, t, i);
        if (late()) { yield; tLast = performance.now(); }
        const x = L.x0 + (i % sol.cols) * L.cell, y = L.y0 + ((i / sol.cols) | 0) * L.cell;
        let base = g.base;
        g.fills.forEach((polys, k) => { if (polys === 'all') base = 4 + k; });
        layers[base].push([x, y, null]);
        g.fills.forEach((polys, k) => { if (polys && polys !== 'all' && polys.length && 4 + k > base) layers[4 + k].push([x, y, polys]); });
      }
      const lc = [cols[0], cols[1], cols[2], cols[3], lcol[0], lcol[1], lcol[2], lcol[3]];
      for (let l = 0; l < 8; l++) {
        if (!layers[l].length) continue;
        ctx.beginPath();
        for (const [x, y, polys] of layers[l]) {
          if (!polys) { ctx.rect(x, y, L.cell, L.cell); continue; }
          for (const p of polys) { ctx.moveTo(x + p[0] * L.cell, y + p[1] * L.cell); for (let q = 2; q < p.length; q += 2) ctx.lineTo(x + p[q] * L.cell, y + p[q + 1] * L.cell); ctx.closePath(); }
        }
        ctx.fillStyle = lc[l];
        ctx.fill();
      }
      for (let i = 0; i < sol.cells.length; i++) {
        const t = set.tiles[sol.cells[i]];
        const x = L.x0 + (i % sol.cols) * L.cell, y = L.y0 + ((i / sol.cols) | 0) * L.cell;
        ctx.save(); ctx.translate(x, y); ctx.scale(L.cell, L.cell); set.drawLines(ctx, S, t, i); ctx.restore();
        if (late()) { yield; tLast = performance.now(); }
      }
    } else {
      for (let i = 0; i < sol.cells.length; i++) {
        drawTile(ctx, set, set.tiles[sol.cells[i]], i, L, S);
        if (late()) { yield; tLast = performance.now(); }
      }
    }
    gridLines(ctx, P, L, S, sol);
    ctx.restore();
    ctx.restore();
  }

  /* ---------------- names ---------------- */
  const SYMS = ['None', 'Mirror', 'Quartered', 'Rotational'];
  const SLICE = 4;          // ms of work between yields inside the generators
  const HEUR = ['Entropy', 'MRV', 'Scanline'];
  function setName(k, P) {
    const set = SETS[P.set];
    const n = set.names[k];
    const v = P[k];
    return v < 0.34 ? n[0] : v < 0.67 ? n[1] : n[2];
  }
  function solveKey(P) {
    return [P.set, P.grid, P.density, P.meander, P.detail, P.symmetry, P.border, P.heuristic, P.format, P.seed].join('|');
  }

  const MOD = C.register({
    id: 'wfc',
    name: 'Wave Collapse',
    group: 'process',
    order: 10,
    renderer: '2d',
    animated: true,
    restartDelay: 90,
    subtitle: 'Tiles by constraint',
    about: 'Maxim Gumin\'s wave function collapse, simple tiled model: every cell starts as a superposition of all tiles; the cell with the lowest weighted entropy collapses to one tile and the choice propagates through matching edge sockets until the grid is decided. A contradiction restarts the solve from the next seed. The tile sets are drawn as vectors: circuit boards, Celtic knotwork, charted coastlines and metro maps.',
    formats: [0, 1, 2, 3],
    formatOdds: [2, 2, 1.6, 0.8],
    defaults: { seed: 2016, format: 1, palette: 0 },
    palettes: PALS,
    params: [
      { k: 'set', g: 'Tiles', label: 'Tile set', type: 'select', options: SETS.map((s) => s.name), def: 0 },
      { k: 'grid', g: 'Tiles', label: 'Grid', min: 6, max: 32, step: 1, def: 16, names: [[6, 'Coarse'], [10, 'Medium'], [16, 'Fine'], [24, 'Minute']] },
      { k: 'density', g: 'Tiles', label: 'Density', min: 0, max: 1, step: 0.01, def: 0.55 },
      { k: 'meander', g: 'Tiles', label: 'Meander', min: 0, max: 1, step: 0.01, def: 0.5 },
      { k: 'detail', g: 'Tiles', label: 'Detail', min: 0, max: 1, step: 0.01, def: 0.5 },
      { k: 'symmetry', g: 'Composition', label: 'Symmetry', type: 'select', options: SYMS, def: 0 },
      { k: 'border', g: 'Composition', label: 'Border', type: 'select', options: ['Open', 'Closed'], def: 0 },
      { k: 'margin', g: 'Composition', label: 'Margin', min: 0, max: 0.14, step: 0.005, def: 0.05, names: [[0, 'Full bleed'], [0.005, 'Narrow'], [0.04, 'Plate'], [0.09, 'Wide mount']] },
      { k: 'heuristic', g: 'Solver', label: 'Heuristic', type: 'select', options: HEUR, def: 0 },
      { k: 'stroke', g: 'Drawing', label: 'Stroke', min: 0.5, max: 1.8, step: 0.05, def: 1, names: [[0.5, 'Hairline'], [0.75, 'Fine'], [0.95, 'Regular'], [1.3, 'Bold']] },
      { k: 'cells', g: 'Drawing', label: 'Cell grid', type: 'select', options: ['Hidden', 'Shown'], def: 0 },
    ],

    randomize(R) {
      for (let i = 0; i < 12; i++) R();   // sfc32 is seeded without warm-up; decorrelate nearby seeds
      const set = C.pickWeighted(R, [1.25, 1.1, 0.4, 1.1]);     // coastline about 1 in 10
      const palOdds = [
        [5, 2.5, 1, 1, 0.4, 1.6, 0.4],
        [1, 1.4, 1, 3, 0.6, 0.8, 2],
        [0.6, 1.5, 1, 1.2, 1.5, 0.6, 4],
        [0.4, 1.4, 1.5, 1, 4, 1.6, 1],
      ][set];
      const grid = [R.int(10, 22), R.int(8, 16), R.int(12, 22), R.int(9, 17)][set];
      return {
        set, grid,
        palette: C.pickWeighted(R, palOdds),
        density: set === 2 ? R.range(0.53, 0.72) : R.range(0.3, 0.8),
        meander: set === 3 ? R.range(0.05, 0.5) : R.range(0.2, 0.8),
        detail: R() < 0.2 ? R.range(0, 0.3) : R.range(0.35, 0.95),
        symmetry: C.pickWeighted(R, [4, set === 1 ? 4 : 1.6, set === 1 ? 2 : 0.6, 0.8]),
        border: R() < [0.3, 0.6, 0.45, 0.3][set] ? 1 : 0,
        margin: R() < 0.25 ? 0 : R.range(0.03, 0.09),
        heuristic: C.pickWeighted(R, [6, 2, 1]),
        stroke: R.range(0.8, 1.3),
        cells: R() < 0.12 ? 1 : 0,
      };
    },
    traitName(k, P) {
      if (k === 'density' || k === 'meander' || k === 'detail') return setName(k, P);
      if (k === 'grid') { const d = gridDims(P); return `${d.cols} × ${d.rows}`; }
      return null;
    },
    caption(P) {
      const set = SETS[P.set], d = gridDims(P);
      const how = ['lowest entropy first', 'fewest options first', 'in scanline order'][P.heuristic];
      const sym = ['', ', mirrored', ', quartered', ', with rotational symmetry'][P.symmetry];
      return `A ${d.cols} × ${d.rows} ${set.noun} collapsed from ${set.tiles.length} tiles ${how}${sym}${P.border ? ', closed at the edges' : ''}, in ${PALS[P.palette].name}.`;
    },
    sheet(P) {
      const set = SETS[P.set], d = gridDims(P);
      return [
        ['Palette', PALS[P.palette].name],
        ['Format', C.FORMATS[P.format].label],
        ['Tile set', `${set.name}, ${set.tiles.length} tiles`],
        ['Grid', `${d.cols} × ${d.rows} cells`],
        ['Density', setName('density', P)],
        ['Meander', setName('meander', P)],
        ['Detail', setName('detail', P)],
        ['Symmetry', SYMS[P.symmetry]],
        ['Border', P.border ? 'Closed' : 'Open'],
        ['Heuristic', HEUR[P.heuristic]],
        ['Stroke', C.traitName(this, 'stroke', P)],
      ];
    },

    setup() { return {}; },
    start(p, P, st) {
      const sk = solveKey(P), code = JSON.stringify(P);
      const replay = code === st.code;
      st.quick = !replay && st.sol && st.sk === sk;
      if (st.sk !== sk || !st.sol) {
        st.sk = sk; st.sol = null;
        st.solver = makeSolver(SETS[P.set], P);
        st.gen = st.solver.solve();
        st.frac = 0;
      }
      st.code = code;
      st.t0 = 0; st.shown = 0; st.layer = null; st.stage = 0; st.failed = false; st.final = null; st.painter = null;
    },
    frame(p, P, st) {
      const bud = C.budget(7);
      const ctx = p.drawingContext;
      const pd = p.pixelDensity();
      const Wd = Math.round(p.width * pd), Hd = Math.round(p.height * pd);
      const set = SETS[P.set];
      if (!st.sol) {
        while (bud()) {
          const r = st.gen.next();
          if (r.done) {
            st.sol = r.value;
            if (!st.sol) { st.sol = fallbackSolve(set, P); st.failed = true; }   // no solution in 30 attempts
            break;
          }
          st.frac = r.value || st.frac;
        }
        if (!st.sol) {
          if (!st.quick) {
            const d = st.solver;
            const L = layout(P, Wd, Hd, d);
            const S = styleFor(P, L);
            ctx.save(); ctx.setTransform(L.k, 0, 0, L.k, 0, 0);
            frameAndGround(ctx, P, L, S);
            ctx.fillStyle = SETS[P.set].ground ? S.pal.knot[1] : S.pal.ink; ctx.globalAlpha = 0.28;
            const r = Math.max(0.9, L.cell * 0.035);
            ctx.beginPath();
            for (let y = 0; y < d.rows; y++) for (let x = 0; x < d.cols; x++) { const cx = L.x0 + (x + 0.5) * L.cell, cy = L.y0 + (y + 0.5) * L.cell; ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU); }
            ctx.fill();
            ctx.restore();
          }
          st.stage = 0.15 * st.frac;
          return true;
        }
        st.t0 = performance.now();
      }
      const sol = st.sol;
      const L = layout(P, Wd, Hd, sol);
      const S = styleFor(P, L, sol);
      if (!st.layer) {
        st.layer = document.createElement('canvas');
        st.layer.width = Wd; st.layer.height = Hd;
        st.lctx = st.layer.getContext('2d');
        st.shown = 0;
        st.order = Array.from(sol.decided.keys()).sort((a, b) => sol.decided[a] - sol.decided[b] || a - b);
      }
      // the finished picture is painted off screen in time slices, then shown
      const blitFinal = () => {
        if (!st.final) { st.final = document.createElement('canvas'); st.final.width = Wd; st.final.height = Hd; st.painter = paintGen(st.final.getContext('2d'), Wd, Hd, P, sol); }
        while (st.painter && bud()) if (st.painter.next().done) st.painter = null;
        if (st.painter) return true;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(st.final, 0, 0); ctx.restore();
        st.stage = 1;
        return false;
      };
      if (st.quick) return blitFinal();
      const N = sol.cells.length;
      const dur = Math.min(4200, 1800 + N * 2.2);
      const t = (performance.now() - st.t0) / dur;
      const ease = (u) => (u >= 1 ? 1 : 1 - Math.pow(1 - u, 1.6));
      const upTo = Math.floor(ease(Math.min(1, t)) * sol.steps);
      // add newly decided cells to the layer
      const lc = st.lctx;
      lc.save(); lc.setTransform(L.k, 0, 0, L.k, 0, 0);
      lc.beginPath(); lc.rect(L.x0, L.y0, L.gw, L.gh); lc.clip();
      while (st.shown < N && sol.decided[st.order[st.shown]] <= upTo && bud()) {
        const i = st.order[st.shown++];
        drawTile(lc, set, set.tiles[sol.cells[i]], i, L, S);
      }
      lc.restore();
      // compose: ground, the undecided superposition as faint marks, then the decided tiles
      ctx.save(); ctx.setTransform(L.k, 0, 0, L.k, 0, 0);
      frameAndGround(ctx, P, L, S);
      const r = Math.max(0.9, L.cell * 0.035);
      const mark = set.ground ? S.pal.knot[1] : S.pal.ink;
      ctx.fillStyle = mark;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        if (sol.decided[i] <= upTo) continue;
        const cx = L.x0 + ((i % sol.cols) + 0.5) * L.cell, cy = L.y0 + (((i / sol.cols) | 0) + 0.5) * L.cell;
        ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 0.16; ctx.strokeStyle = mark; ctx.lineWidth = Math.max(0.8, L.cell * 0.02);
      ctx.beginPath();
      const inset = L.cell * 0.12;
      for (let i = 0; i < N; i++) {
        if (sol.decided[i] <= upTo || sol.touched[i] < 0 || sol.touched[i] > upTo) continue;
        const cx = L.x0 + (i % sol.cols) * L.cell, cy = L.y0 + ((i / sol.cols) | 0) * L.cell;
        ctx.rect(cx + inset, cy + inset, L.cell - 2 * inset, L.cell - 2 * inset);
      }
      ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(st.layer, 0, 0); ctx.restore();
      st.stage = 0.15 + 0.85 * Math.min(1, t);
      if (t >= 1 && st.shown >= N) return blitFinal();
      return true;
    },
    progress(st) { return st.stage || 0; },
    exportAt(p, P, W, H, st) {
      let sol = st && st.sol && st.sk === solveKey(P) ? st.sol : null;
      if (!sol) sol = drain(makeSolver(SETS[P.set], P).solve()) || fallbackSolve(SETS[P.set], P);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      paintAll(c.getContext('2d'), W, H, P, sol);
      return c;
    },
  });
  MOD._test = { makeSolver, paintAll, paintGen, SETS, drain };   // hooks for the test scripts only
})();
