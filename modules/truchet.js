/* Truchet — Smith arcs, 10 PRINT diagonals, Carlson multi-scale winged tiles,
   Truchet's own 1704 triangles, hexagonal three-arc tiles and an over-under weave.
   Orientation comes from a rule (noise drift, parity blooms, Douat-style mirror,
   rings), so regions emerge. The twist: the tiling is treated as a map. Regions and
   strands are found with union-find, so every closed shape or every loop can carry
   its own colour, and the colouring never lets two neighbouring regions match.   */
(function () {
  'use strict';
  const C = window.Cabinet;
  const VH = 1000;
  const TAU = Math.PI * 2;

  const PALETTES = [
    { name: 'Delft', colors: ['#1d3b8f', '#4d78d4', '#a9c1ee', '#e3c46c'], bg: '#f3efe6', ink: '#16295e', pair: ['#1d3b8f', '#f3efe6'] },
    { name: 'Memphis', colors: ['#ff5c8a', '#18b0a0', '#ffc933', '#3b5bdb', '#b39ddb'], bg: '#f4eddd', ink: '#1a1a1a', pair: ['#1a1a1a', '#ffc933'] },
    { name: 'Riso', colors: ['#ff48b0', '#0078bf', '#ffe800', '#00a95c', '#ff6c2f'], bg: '#f6f1e7', ink: '#1d1d3b', pair: ['#ff48b0', '#0078bf'] },
    { name: 'Zellige', colors: ['#b5482f', '#e2a84b', '#2a6f6a', '#1d3b4f', '#e9dcc3'], bg: '#efe3cf', ink: '#1d2a33', pair: ['#2a6f6a', '#efe3cf'] },
    { name: 'Acid', colors: ['#c6ff00', '#ff3d7f', '#00e5ff', '#ffea00', '#7c4dff'], bg: '#111111', ink: '#050505', line: '#c6ff00', pair: ['#c6ff00', '#111111'] },
    { name: 'Majolica', colors: ['#1b4f72', '#f0a202', '#c0392b', '#2e8b57', '#f6ecd6'], bg: '#f6ecd6', ink: '#1a2a3a', pair: ['#c0392b', '#f6ecd6'] },
    { name: 'Letterpress', colors: ['#171717', '#d6452d', '#171717', '#9b9486'], bg: '#ede7da', ink: '#171717', pair: ['#171717', '#ede7da'] },
    { name: 'Sorbet', colors: ['#ff8fa3', '#ffc3a0', '#a0e7e5', '#b4a7ff', '#fff0a8'], bg: '#fff8f0', ink: '#3a2d4d', pair: ['#ff8fa3', '#fff8f0'] },
  ];

  const SETS = ['Smith', 'Diagonal', 'Carlson', 'Triangle', 'Hexagon', 'Weave'];
  const FILLS = ['Ink', 'Two-tone', 'Patchwork', 'Strands'];
  const RULES = ['Coin toss', 'Drift', 'Bloom', 'Douat mirror', 'Rings'];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function hash(a, b, c, seed) {
    let h = (seed | 0) ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1440662683);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  function makeNoise(R) {
    const perm = new Uint16Array(512), base = [];
    for (let i = 0; i < 256; i++) base.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    const gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const a = R() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      const h00 = perm[perm[X] + Y], h10 = perm[perm[X + 1] + Y], h01 = perm[perm[X] + Y + 1], h11 = perm[perm[X + 1] + Y + 1];
      const a = gx[h00] * xf + gy[h00] * yf, b = gx[h10] * (xf - 1) + gy[h10] * yf;
      const c = gx[h01] * xf + gy[h01] * (yf - 1), d = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
      const u = fade(xf), v = fade(yf), ab = a + u * (b - a), cd = c + u * (d - c);
      return 0.5 + (ab + v * (cd - ab)) * 0.9;
    };
  }
  function mixHex(a, b, t) {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((A >> sh) & 255) * (1 - t) + ((B >> sh) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  function UF(n) {
    const p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i;
    const find = (a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
    return { find, union: (a, b) => { a = find(a); b = find(b); if (a !== b) p[b] = a; } };
  }

  /* ======================= build: tiles, regions, strands ======================= */
  function build(P) {
    const a = C.FORMATS[P.format].a;
    const W = VH * a, H = VH;
    const R = C.rng(P.seed ^ 0x51f3);
    const noise = makeNoise(C.rng(P.seed ^ 0x33a1));
    const pal = PALETTES[P.palette] || PALETTES[0];
    const hseed = (P.seed * 2654435761) | 0;
    const m = P.margin * VH;
    const rect = [m, m, W - m, H - m];
    const iw = W - 2 * m, ih = H - 2 * m;
    const set = P.set;
    const G = { W, H, rect, pal, P, set, tiles: [], parts: [], curves: [], maxL: 0 };
    const focus = { x: W / 2 + (R() - 0.5) * iw * 0.5, y: H / 2 + (R() - 0.5) * ih * 0.5 };
    G.focus = focus;

    const s = Math.min(iw, ih) / P.scale;               // base tile size
    const zone = lerp(1.3, 9, P.grain) * s;             // size of emergent regions
    const chaos = P.chaos;

    // ----- orientation rules -----
    function ruleBit(u, v, i, j, k, fold) {
      let b;
      if (P.rule === 3) {                                // Douat mirror: random per folded cell
        b = hash(fold.i, fold.j, fold.L * 8 + k, hseed) < 0.5 ? 1 : 0;
        if (hash(fold.i, fold.j, fold.L * 8 + k + 4, hseed ^ 0x55) < chaos) b ^= 1;
        return b;
      }
      switch (P.rule) {
        case 1: b = noise(u / zone + k * 31.7, v / zone - k * 11.3) > 0.5 ? 1 : 0; break;
        case 2: {
          const z = noise(u / zone + 71.3, v / zone + 13.9) > 0.5;
          b = z ? ((i + j + k) & 1) : (noise(u / (zone * 1.6) + k * 19.1, v / (zone * 1.6)) > 0.5 ? 1 : 0);
          break;
        }
        case 4: {
          const d = Math.hypot(u - focus.x, v - focus.y) / (zone * 0.75);
          const band = Math.floor(d);
          b = (band & 1) ? ((i + j + k) & 1) : (((band >> 1) + k) & 1);
          break;
        }
        default: b = R() < 0.5 ? 1 : 0;
      }
      if (R() < chaos) b = R() < 0.5 ? 1 : 0;
      return b;
    }

    // ----- ports: union-find glue between neighbouring tiles -----
    const portParts = new Map();   // key -> part index (first seen)
    const adj = [];                // [partA, partB] pairs across a boundary
    const curvePorts = new Map();
    const unions = [];
    function addPart(tile, cls, keys) {
      const id = G.parts.length;
      G.parts.push({ cls, tile });
      for (const k of keys) {
        const q = portParts.get(k);
        if (q == null) portParts.set(k, id);
        else if (G.parts[q].cls === cls) unions.push([q, id]);
        else adj.push([q, id]);
      }
      return id;
    }
    const curveUnions = [];
    function addCurve(tile, keys) {
      const id = G.curves.length;
      G.curves.push({ tile });
      for (const k of keys) {
        const q = curvePorts.get(k);
        if (q == null) curvePorts.set(k, id); else curveUnions.push([q, id]);
      }
      return id;
    }

    if (set === 4) buildHex(); else buildSquare();

    function buildSquare() {
      const cap = set === 1 ? 2 : 4;
      const levels = set === 2 || set === 1 || set === 3 ? Math.max(1, Math.min(P.levels, cap, Math.floor(Math.log2(s / (set === 2 ? 15 : 12))) + 1)) : 1;
      G.maxL = levels - 1;
      const Q = 1 << (levels - 1), unit = s / (4 * Q);
      const cols = Math.ceil(iw / s - 1e-6), rows = Math.ceil(ih / s - 1e-6);
      const gx0 = m + (iw - cols * s) / 2, gy0 = m + (ih - rows * s) / 2;
      G.grid = { unit, gx0, gy0, cols, rows, Q, s };
      const fmax = 4 * Q;
      const colsF = cols * fmax, rowsF = rows * fmax;
      const foldOf = (i, j, L) => {
        const n = cols << L, r = rows << L;
        const fi = Math.min(i, n - 1 - i), fj = Math.min(j, r - 1 - j);
        return { i: fi, j: fj, L, mx: i !== fi ? 1 : 0, my: j !== fj ? 1 : 0 };
      };
      // quadtree leaves
      const leaves = [];
      const splitP = (L) => P.split * (L === 0 ? 1 : lerp(0.85, 0.6, L / 3));
      function gen(i, j, L) {
        const fs = fmax >> L;
        const fx = i * fs, fy = j * fs;
        if (L < levels - 1) {
          const f = foldOf(i, j, L);
          const r = P.rule === 3 ? hash(f.i, f.j, 100 + L, hseed ^ 0x2222) : R();
          if (r < splitP(L)) { gen(2 * i, 2 * j, L + 1); gen(2 * i + 1, 2 * j, L + 1); gen(2 * i, 2 * j + 1, L + 1); gen(2 * i + 1, 2 * j + 1, L + 1); return; }
        }
        leaves.push({ i, j, L, fx, fy, fs });
      }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) gen(i, j, 0);

      // Carlson tiles need a balanced tree (neighbours differ by at most one level)
      let tiles = leaves;
      if (set === 2 && levels > 2) tiles = balance(leaves, colsF, rowsF, fmax);

      for (const t of tiles) {
        t.x = gx0 + t.fx * unit; t.y = gy0 + t.fy * unit; t.s = t.fs * unit;
        if (t.x > rect[2] || t.y > rect[3] || t.x + t.s < rect[0] || t.y + t.s < rect[1]) continue;
        const u = t.x + t.s / 2, v = t.y + t.s / 2;
        const f = foldOf(t.i, t.j, t.L);
        const b0 = ruleBit(u, v, t.i, t.j, 0, f), b1 = ruleBit(u, v, t.i, t.j, 1, f);
        if (set === 0 || set === 1) t.o = b0 ^ (P.rule === 3 ? f.mx ^ f.my : 0);
        else if (set === 3) {
          let c = (b0 << 1) | b1;                                   // dark corner: 0 TL, 1 TR, 2 BR, 3 BL
          if (P.rule === 3) { if (f.mx) c = [1, 0, 3, 2][c]; if (f.my) c = [3, 2, 1, 0][c]; }
          t.o = c;
        } else if (set === 5) {
          const cross = P.rule === 3 ? hash(f.i, f.j, 300, hseed) < 0.42 : noise(u / (zone * 0.8) + 40, v / (zone * 0.8) - 7) > 0.5;
          t.o = cross ? 2 + ((t.i + t.j) & 1) : b0 ^ (P.rule === 3 ? f.mx ^ f.my : 0);
        } else if (set === 2) {
          const h = P.rule === 3 ? hash(f.i, f.j, 200 + t.L, hseed ^ 0x777) : R();
          t.o = h < 0.8 ? (b0 ^ (P.rule === 3 ? f.mx ^ f.my : 0)) : h < 0.87 ? 2 : h < 0.94 ? 3 : 4;   // arcs, '-', '|', '+'
        }
        t.id = G.tiles.length;
        t.rt = revealTime(u, v, t.L);
        G.tiles.push(t);
        if (set !== 2) squareParts(t);
      }
    }

    function balance(leaves, colsF, rowsF, fmax) {
      const lv = new Int8Array(colsF / 4 * rowsF / 4).fill(-1); // level per finest cell (4 fine units)
      const cw = colsF / 4;
      const mark = (t) => { const c0 = t.fx / 4, r0 = t.fy / 4, n = t.fs / 4; for (let r = r0; r < r0 + n; r++) for (let c = c0; c < c0 + n; c++) lv[r * cw + c] = t.L; };
      leaves.forEach(mark);
      const ch = rowsF / 4;
      let list = leaves.slice(), changed = true, guard = 0;
      while (changed && guard++ < 12) {
        changed = false;
        const next = [];
        for (const t of list) {
          const c0 = t.fx / 4, r0 = t.fy / 4, n = t.fs / 4;
          let need = false;
          for (let k = 0; k < n && !need; k++) {
            const nb = [[c0 - 1, r0 + k], [c0 + n, r0 + k], [c0 + k, r0 - 1], [c0 + k, r0 + n]];
            for (const [c, r] of nb) if (c >= 0 && r >= 0 && c < cw && r < ch && lv[r * cw + c] >= t.L + 2) { need = true; break; }
          }
          if (need) {
            changed = true;
            const h = t.fs / 2;
            for (let q = 0; q < 4; q++) {
              const k = { i: t.i * 2 + (q & 1), j: t.j * 2 + (q >> 1), L: t.L + 1, fx: t.fx + (q & 1) * h, fy: t.fy + (q >> 1) * h, fs: h };
              mark(k); next.push(k);
            }
          } else next.push(t);
        }
        list = next;
      }
      return list;
    }

    // square-grid parts and curves, keyed on integer fine coordinates
    function squareParts(t) {
      const { fx, fy, fs } = t;
      const H_ = (x, y) => ((y * 16384 + x) * 4);          // horizontal edge sample
      const V_ = (x, y) => ((y * 16384 + x) * 4 + 1);      // vertical edge sample
      const P_ = (x, y) => ((y * 16384 + x) * 4 + 2);      // vertex
      const q1 = fs / 4, q3 = 3 * fs / 4, h = fs / 2;
      const top0 = H_(fx + q1, fy), top1 = H_(fx + q3, fy), bot0 = H_(fx + q1, fy + fs), bot1 = H_(fx + q3, fy + fs);
      const lef0 = V_(fx, fy + q1), lef1 = V_(fx, fy + q3), rig0 = V_(fx + fs, fy + q1), rig1 = V_(fx + fs, fy + q3);
      const edgeAll = (dir, x, y) => { const out = []; for (let k = 1; k < fs; k += 2) out.push(dir === 0 ? H_(x + k, y) : V_(x, y + k)); return out; };
      if (set === 0 || set === 5) {
        const mids = { t: H_(fx + h, fy), b: H_(fx + h, fy + fs), l: V_(fx, fy + h), r: V_(fx + fs, fy + h) };
        if (t.o < 2) {
          if (t.o === 0) {
            t.p = [addPart(t, 0, [top0, lef0]), addPart(t, 0, [top1, rig0, bot0, lef1]), addPart(t, 0, [bot1, rig1])];
            t.c = [addCurve(t, [mids.t, mids.l]), addCurve(t, [mids.b, mids.r])];
          } else {
            t.p = [addPart(t, 0, [top1, rig0]), addPart(t, 0, [top0, lef0, bot1, rig1]), addPart(t, 0, [bot0, lef1])];
            t.c = [addCurve(t, [mids.t, mids.r]), addCurve(t, [mids.b, mids.l])];
          }
          adj.push([t.p[0], t.p[1]], [t.p[1], t.p[2]]);
        } else { // weave crossing: four corner faces, a horizontal and a vertical strand
          t.p = [addPart(t, 0, [top0, lef0]), addPart(t, 0, [top1, rig0]), addPart(t, 0, [bot1, rig1]), addPart(t, 0, [bot0, lef1])];
          adj.push([t.p[0], t.p[1]], [t.p[1], t.p[2]], [t.p[2], t.p[3]], [t.p[3], t.p[0]]);
          t.c = [addCurve(t, [mids.l, mids.r]), addCurve(t, [mids.t, mids.b])];
        }
      } else if (set === 1) {
        const T = edgeAll(0, fx, fy), B = edgeAll(0, fx, fy + fs), L = edgeAll(1, fx, fy), Rr = edgeAll(1, fx + fs, fy);
        if (t.o === 0) { // '/' : TL half and BR half
          t.p = [addPart(t, 0, T.concat(L)), addPart(t, 0, B.concat(Rr))];
          t.c = [addCurve(t, [P_(fx, fy + fs), P_(fx + fs, fy)])];
        } else {         // '\' : TR half and BL half
          t.p = [addPart(t, 0, T.concat(Rr)), addPart(t, 0, B.concat(L))];
          t.c = [addCurve(t, [P_(fx, fy), P_(fx + fs, fy + fs)])];
        }
        adj.push([t.p[0], t.p[1]]);
      } else if (set === 3) {
        const T = edgeAll(0, fx, fy), B = edgeAll(0, fx, fy + fs), L = edgeAll(1, fx, fy), Rr = edgeAll(1, fx + fs, fy);
        // halves by corner: TL half touches T+L, TR half T+R, BR half B+R, BL half B+L
        const half = [T.concat(L), T.concat(Rr), B.concat(Rr), B.concat(L)];
        const dark = t.o, light = (t.o + 2) & 3;
        t.p = [addPart(t, 1, half[dark]), addPart(t, 0, half[light])];
        adj.push([t.p[0], t.p[1]]);
        t.c = [];
      }
    }

    // hexagonal three-arc tiles (pointy-top), keyed on rounded coordinates
    function buildHex() {
      const A = Math.min(iw, ih) / P.scale / 1.732;     // circumradius so ~scale hexes across
      G.hexA = A;
      const hw = Math.sqrt(3) * A, vs = 1.5 * A;
      const cols = Math.ceil(W / hw) + 2, rows = Math.ceil(H / vs) + 2;
      const k = (x, y) => Math.round(x * 64) + ':' + Math.round(y * 64);
      const vx = [], vy = [];
      for (let q = 0; q < 6; q++) { const an = -Math.PI / 2 + q * Math.PI / 3; vx.push(Math.cos(an) * A); vy.push(Math.sin(an) * A); }
      const x0 = (W - (cols - 1) * hw) / 2, y0 = (H - (rows - 1) * vs) / 2;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cx = x0 + c * hw + (r & 1 ? hw / 2 : 0), cy = y0 + r * vs;
        if (cx + A < rect[0] || cx - A > rect[2] || cy + A < rect[1] || cy - A > rect[3]) continue;
        const fu = Math.min(cx, W - cx), fv = Math.min(cy, H - cy);
        const fold = { i: Math.round(fu / hw * 2), j: Math.round(fv / vs), L: 0 };
        let o = ruleBit(cx, cy, c + (r >> 1), r, 0, fold);
        if (P.rule === 3 && cy > H - cy) o ^= 1;
        const t = { hex: true, x: cx, y: cy, A, o, L: 0, id: G.tiles.length, rt: revealTime(cx, cy, 0) };
        // half-edge samples: edge q runs from vertex q to q+1
        const hs = [];
        for (let q = 0; q < 6; q++) {
          const ax = cx + vx[q], ay = cy + vy[q], bx = cx + vx[(q + 1) % 6], by = cy + vy[(q + 1) % 6];
          hs.push([k(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25), k(ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75), k((ax + bx) / 2, (ay + by) / 2)]);
        }
        const verts = o ? [1, 3, 5] : [0, 2, 4];
        t.verts = verts;
        t.p = []; t.c = [];
        const used = new Set();
        for (const v of verts) {
          const prev = (v + 5) % 6;                           // edge prev ends at vertex v; edge v starts there
          t.p.push(addPart(t, 0, [hs[prev][1], hs[v][0]]));
          used.add(prev * 2 + 1); used.add(v * 2);
          t.c.push(addCurve(t, [hs[prev][2], hs[v][2]]));
        }
        const rest = [];
        for (let q = 0; q < 6; q++) for (let hh = 0; hh < 2; hh++) if (!used.has(q * 2 + hh)) rest.push(hs[q][hh]);
        const centre = addPart(t, 0, rest);
        t.p.push(centre);
        for (let q = 0; q < 3; q++) adj.push([t.p[q], centre]);
        G.tiles.push(t);
      }
      G.hexV = [vx, vy];
    }

    function revealTime(u, v, L) {
      const d = Math.hypot(u - focus.x, v - focus.y) / Math.hypot(W, H);
      return set === 2 ? (L + clamp(d * 1.4, 0, 0.95)) / (G.maxL + 1) : clamp(d * 1.25 + R() * 0.08, 0, 1);
    }

    // ----- regions: union, adjacency, colouring -----
    const nP = G.parts.length;
    const uf = UF(Math.max(1, nP));
    for (const [a1, b1] of unions) uf.union(a1, b1);
    const roots = new Map();
    for (let i = 0; i < nP; i++) { const r = uf.find(i); if (!roots.has(r)) roots.set(r, roots.size); G.parts[i].region = roots.get(r); }
    const nR = roots.size;
    const regCls = new Int8Array(nR), nb = Array.from({ length: nR }, () => new Set()), regSize = new Float64Array(nR);
    for (let i = 0; i < nP; i++) { regCls[G.parts[i].region] = G.parts[i].cls; regSize[G.parts[i].region]++; }
    for (const [a1, b1] of adj) { const ra = G.parts[a1].region, rb = G.parts[b1].region; if (ra !== rb) { nb[ra].add(rb); nb[rb].add(ra); } }
    G.nRegions = nR;

    // two-tone: BFS parity (exact wherever the tiling is face-2-colourable)
    const parity = new Int8Array(nR).fill(-1);
    for (let s0 = 0; s0 < nR; s0++) {
      if (parity[s0] >= 0) continue;
      parity[s0] = set === 3 ? regCls[s0] : 0;
      const queue = [s0];
      while (queue.length) {
        const r = queue.pop();
        for (const q of nb[r]) if (parity[q] < 0) { parity[q] = set === 3 ? regCls[q] : parity[r] ^ 1; queue.push(q); }
      }
    }
    // patchwork: greedy map colouring, never two neighbours alike
    const cols = pal.colors.map((c, i) => i);
    const regCol = new Int16Array(nR).fill(-1);
    const order = Array.from({ length: nR }, (_, i) => i).sort((x, y) => regSize[y] - regSize[x] || x - y);
    const CR = C.rng(P.seed ^ 0xc0105);
    const paperShare = set === 3 ? 0 : 0.18;
    for (const r of order) {
      if (set === 3 && regCls[r] === 0 && P.fill === 2) { regCol[r] = -2; continue; }  // light triangles stay paper
      const bad = new Set(); for (const q of nb[r]) bad.add(regCol[q]);
      if (paperShare && !bad.has(-2) && CR() < paperShare) { regCol[r] = -2; continue; }
      const ok = cols.filter((c) => !bad.has(c));
      regCol[r] = ok.length ? ok[Math.floor(CR() * ok.length)] : cols[Math.floor(CR() * cols.length)];
    }
    G.parity = parity; G.regCol = regCol; G.regCls = regCls;

    // ----- strands -----
    const nC = G.curves.length;
    const ufc = UF(Math.max(1, nC));
    for (const [a1, b1] of curveUnions) ufc.union(a1, b1);
    const sroots = new Map(), SR = C.rng(P.seed ^ 0x57a4d);
    let last = -1;
    for (let i = 0; i < nC; i++) {
      const r = ufc.find(i);
      if (!sroots.has(r)) {
        let c = Math.floor(SR() * pal.colors.length);
        if (c === last && pal.colors.length > 1) c = (c + 1) % pal.colors.length;
        last = c;
        sroots.set(r, c);
      }
      G.curves[i].col = sroots.get(r);
    }
    G.nStrands = sroots.size;

    // Carlson gradient fields for patchwork / strands fills
    G.gradA = R() * TAU; G.gradB = G.gradA + Math.PI * R.range(0.4, 0.8);
    G.revealOrder = G.tiles.slice().sort((x, y) => x.rt - y.rt);
    return G;
  }

  /* ============================== drawing ============================== */
  function colourSet(G) {
    const P = G.P, pal = G.pal;
    const light = pal.bg, dark = pal.line || pal.ink;
    const regionFill = (part) => {
      const r = part.region;
      switch (P.fill) {
        case 1: return G.parity[r] ? pal.pair[0] : pal.pair[1];
        case 2: return G.regCol[r] === -2 ? light : pal.colors[G.regCol[r]];
        case 3: return G.set === 3 ? (G.regCol[r] === -2 ? light : pal.colors[G.regCol[r]]) : light;
        default: return G.set === 3 ? (part.cls ? dark : light) : light;
      }
    };
    const ol = P.outline;
    let band;
    switch (P.fill) {
      case 1: band = light; break;
      case 2: band = dark; break;
      case 3: band = null; break;                     // per-strand colour
      default: band = ol > 0 ? light : dark;
    }
    let olCol = pal.ink;
    if (G.set === 5 && P.fill === 0) { band = dark; olCol = light; }   // knot diagram: ink ribbons, paper gaps at crossings
    if (G.set === 5 && P.fill === 2) band = light;
    return { regionFill, band, olCol, ol: G.set === 5 ? Math.max(ol, 0.14) : ol };
  }

  function lineW(G, t) { return G.P.weight * (t.s || t.A); }

  // --- per-set fills (every fill bleeds ~0.6 px into its neighbour: the colour across
  //     a tile edge is always the same region, so the overlap hides conflation seams) ---
  function fillTile(ctx, G, t, cs) {
    const parts = G.parts, e = G.px * 0.6;
    if (G.set === 4) {
      const [vx, vy] = G.hexV, k = 1 + e / t.A;
      ctx.fillStyle = cs.regionFill(parts[t.p[3]]);
      ctx.beginPath();
      for (let q = 0; q < 6; q++) ctx.lineTo(t.x + vx[q] * k, t.y + vy[q] * k);
      ctx.closePath(); ctx.fill();
      t.verts.forEach((v, n) => {
        const k2 = 1 + 3 * e / t.A, cx = t.x + vx[v] * k2, cy = t.y + vy[v] * k2, a0 = Math.atan2(-vy[v], -vx[v]);
        ctx.fillStyle = cs.regionFill(parts[t.p[n]]);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, t.A / 2 + 3 * e, a0 - Math.PI / 3, a0 + Math.PI / 3); ctx.closePath(); ctx.fill();
      });
      return;
    }
    const { x, y, s } = t;
    if (G.set === 1 || G.set === 3) {
      // paint the tile in the second part's colour, then the first part's triangle on top
      // the triangle's legs bleed further than the square under it, so no AA fringe of the
      // square survives along the tile edge (its hypotenuse stays on the true diagonal)
      const g = G.set === 3 ? Math.max(0, G.P.weight - 0.08) * 0.24 * s : 0, ee = g ? 0 : e, E = g ? 0 : e * 2.6;
      const X0 = x + g - E, Y0 = y + g - E, X1 = x + s - g + E, Y1 = y + s - g + E;
      const tri = [[[X0, Y0], [X1, Y0], [X0, Y1]], [[X1, Y0], [X1, Y1], [X0, Y0]], [[X1, Y1], [X0, Y1], [X1, Y0]], [[X0, Y1], [X0, Y0], [X1, Y1]]];
      const first = G.set === 3 ? tri[t.o] : tri[t.o === 0 ? 0 : 1];
      ctx.fillStyle = cs.regionFill(parts[t.p[1]]);
      ctx.fillRect(x + g - ee, y + g - ee, s - 2 * g + 2 * ee, s - 2 * g + 2 * ee);
      ctx.fillStyle = cs.regionFill(parts[t.p[0]]);
      ctx.beginPath(); first.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.closePath(); ctx.fill();
      return;
    }
    // Smith / weave
    if (t.o < 2) {
      ctx.fillStyle = cs.regionFill(parts[t.p[1]]);
      ctx.fillRect(x - e, y - e, s + 2 * e, s + 2 * e);
      const cA = t.o === 0 ? [x, y, 0] : [x + s, y, Math.PI / 2], cB = t.o === 0 ? [x + s, y + s, Math.PI] : [x, y + s, Math.PI * 1.5];
      [cA, cB].forEach((c, n) => {
        // the corner piece bleeds further than the rect under it, so its edge is never AA-blended with it
        const dx = Math.cos(c[2] + Math.PI / 4) * e * 3.1, dy = Math.sin(c[2] + Math.PI / 4) * e * 3.1;
        ctx.fillStyle = cs.regionFill(parts[t.p[n === 0 ? 0 : 2]]);
        ctx.beginPath(); ctx.moveTo(c[0] - dx, c[1] - dy); ctx.arc(c[0] - dx, c[1] - dy, s / 2 + e, c[2], c[2] + Math.PI / 2); ctx.closePath(); ctx.fill();
      });
    } else {
      const h = s / 2;
      [[x, y], [x + h, y], [x + h, y + h], [x, y + h]].forEach(([qx, qy], n) => {
        ctx.fillStyle = cs.regionFill(parts[t.p[n]]);
        ctx.fillRect(qx - e, qy - e, h + 2 * e, h + 2 * e);
      });
    }
  }

  // path builders, one per curve (in t.c order); `x` extends each end by that length
  function curvePaths(G, t) {
    if (G.set === 4) {
      const [vx, vy] = G.hexV, r = t.A / 2;
      return t.verts.map((v) => (ctx, ex) => {
        const cx = t.x + vx[v], cy = t.y + vy[v], a0 = Math.atan2(-vy[v], -vx[v]), da = ex / r;
        ctx.arc(cx, cy, r, a0 - Math.PI / 3 - da, a0 + Math.PI / 3 + da);
      });
    }
    const { x, y, s } = t;
    const seg = (x0, y0, x1, y1) => (ctx, ex) => {
      const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L * ex, uy = (y1 - y0) / L * ex;
      ctx.moveTo(x0 - ux, y0 - uy); ctx.lineTo(x1 + ux, y1 + uy);
    };
    if (G.set === 1) return [t.o === 0 ? seg(x, y + s, x + s, y) : seg(x, y, x + s, y + s)];
    if (t.o < 2) {
      const cA = t.o === 0 ? [x, y, 0] : [x + s, y, Math.PI / 2], cB = t.o === 0 ? [x + s, y + s, Math.PI] : [x, y + s, Math.PI * 1.5];
      return [cA, cB].map((c) => (ctx, ex) => { const da = ex / (s / 2); ctx.arc(c[0], c[1], s / 2, c[2] - da, c[2] + Math.PI / 2 + da); });
    }
    return [seg(x, y + s / 2, x + s, y + s / 2), seg(x + s / 2, y, x + s / 2, y + s)];
  }

  // three passes: every edging, every band, then the over-strands of weave crossings on top
  function strokeAll(ctx, G, tiles, cs) {
    if (G.set === 3) return;
    const ext = G.px * 0.7;
    ctx.lineCap = G.set === 1 ? 'round' : 'butt';
    const over = (t) => (G.set === 5 && t.o >= 2 ? (t.o === 2 ? 0 : 1) : -1);
    const pass = (withOutline, withBand, pick, ex) => {
      for (const t of tiles) {
        if (!t.c || !t.c.length) continue;
        const w = lineW(G, t), olw = cs.ol * w * 0.9;
        const paths = curvePaths(G, t), ov = over(t);
        for (let n = 0; n < paths.length; n++) {
          if (!pick(n, ov)) continue;
          if (withOutline && olw > 0.05) {
            ctx.strokeStyle = cs.olCol; ctx.lineWidth = w + 2 * olw;
            ctx.beginPath(); paths[n](ctx, n === ov ? 0 : ex); ctx.stroke();
          }
          if (withBand) {
            ctx.strokeStyle = cs.band || G.pal.colors[G.curves[t.c[n]].col]; ctx.lineWidth = w;
            ctx.beginPath(); paths[n](ctx, ex); ctx.stroke();
          }
        }
      }
    };
    pass(true, false, (n, ov) => n !== ov, ext);
    pass(false, true, (n, ov) => n !== ov, ext);
    if (G.set === 5) {
      // an over-strand paints its own edging (the gap) and band, one crossing at a time
      for (const t of tiles) {
        const ov = over(t); if (ov < 0) continue;
        const w = lineW(G, t), olw = cs.ol * w * 0.9, path = curvePaths(G, t)[ov];
        ctx.strokeStyle = cs.olCol; ctx.lineWidth = w + 2 * olw; ctx.beginPath(); path(ctx, 0); ctx.stroke();
        ctx.strokeStyle = cs.band || G.pal.colors[G.curves[t.c[ov]].col]; ctx.lineWidth = w; ctx.beginPath(); path(ctx, ext); ctx.stroke();
      }
    }
  }

  // --- Carlson multi-scale winged tiles ---
  function carlsonColours(G, ctx) {
    const P = G.P, pal = G.pal;
    const grad = (ang, colors) => {
      const cx = G.W / 2, cy = G.H / 2, r = 0.5 * Math.hypot(G.W, G.H);
      const g = ctx.createLinearGradient(cx - Math.cos(ang) * r, cy - Math.sin(ang) * r, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
      return g;
    };
    switch (P.fill) {
      case 1: return [pal.pair[0], pal.pair[1]];
      case 2: return [grad(G.gradA, pal.colors.filter((c) => c !== pal.bg).slice(0, 4)), pal.bg];
      case 3: {
        const cs = pal.colors.filter((c) => c !== pal.bg);
        const dim = (c) => mixHex(c, pal.bg, 0.62);
        return [grad(G.gradA, cs.slice(0, 4)), grad(G.gradB, cs.slice(0, 4).reverse().map(dim))];
      }
      default: return [pal.line || pal.ink, pal.bg];
    }
  }
  function carlsonMotif(ctx, t, fill) {
    const { x, y, s } = t, r1 = s / 3, r2 = 2 * s / 3;
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (t.o < 2) {
      const cs = t.o === 0 ? [[x, y, 0], [x + s, y + s, Math.PI]] : [[x + s, y, Math.PI / 2], [x, y + s, Math.PI * 1.5]];
      for (const [cx, cy, a0] of cs) {
        ctx.moveTo(cx + Math.cos(a0) * r2, cy + Math.sin(a0) * r2);
        ctx.arc(cx, cy, r2, a0, a0 + Math.PI / 2);
        ctx.arc(cx, cy, r1, a0 + Math.PI / 2, a0, true);
        ctx.closePath();
      }
    } else {
      if (t.o === 2 || t.o === 4) ctx.rect(x, y + r1, s, r1);
      if (t.o === 3 || t.o === 4) ctx.rect(x + r1, y, r1, s);
    }
    ctx.fill();
  }
  function carlsonEnds(t) { // which edge midpoints carry a band: [top, right, bottom, left]
    if (t.o < 2) return [1, 1, 1, 1];
    if (t.o === 2) return [0, 1, 0, 1];
    if (t.o === 3) return [1, 0, 1, 0];
    return [1, 1, 1, 1];
  }
  function drawCarlson(ctx, G, tiles) {
    const [F, B] = carlsonColours(G, ctx);
    const byL = [];
    for (const t of tiles) (byL[t.L] || (byL[t.L] = [])).push(t);
    for (let L = 0; L < byL.length; L++) {
      const list = byL[L]; if (!list) continue;
      const bg = L & 1 ? F : B, fg = L & 1 ? B : F;
      ctx.fillStyle = bg;
      const e = G.px * 0.6;
      ctx.beginPath(); for (const t of list) ctx.rect(t.x - e, t.y - e, t.s + 2 * e, t.s + 2 * e); ctx.fill();
      for (const t of list) carlsonMotif(ctx, t, fg);
      // wings: background discs at the corners, band caps at the edge midpoints
      ctx.fillStyle = bg; ctx.beginPath();
      for (const t of list) for (const [cx, cy] of [[t.x, t.y], [t.x + t.s, t.y], [t.x + t.s, t.y + t.s], [t.x, t.y + t.s]]) { ctx.moveTo(cx + t.s / 3, cy); ctx.arc(cx, cy, t.s / 3, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = fg; ctx.beginPath();
      for (const t of list) {
        const e = carlsonEnds(t), h = t.s / 2, r = t.s / 6;
        const mids = [[t.x + h, t.y], [t.x + t.s, t.y + h], [t.x + h, t.y + t.s], [t.x, t.y + h]];
        mids.forEach(([mx, my], k) => { if (e[k]) { ctx.moveTo(mx + r, my); ctx.arc(mx, my, r, 0, TAU); } });
      }
      ctx.fill();
    }
  }

  function drawAll(ctx, s, G, upto) {
    const cut = upto == null ? 2 : upto;
    G.px = 1 / s;
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = G.pal.bg;
    ctx.fillRect(0, 0, G.W, G.H);
    const r = G.rect;
    ctx.beginPath(); ctx.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]); ctx.clip();
    const tiles = cut >= 1 ? G.tiles : G.tiles.filter((t) => t.rt <= cut);
    if (G.set === 2) drawCarlson(ctx, G, tiles);
    else {
      const cs = colourSet(G);
      for (const t of tiles) fillTile(ctx, G, t, cs);
      strokeAll(ctx, G, tiles, cs);
    }
    ctx.restore();
  }

  /* ============================== words ============================== */
  let memo = { key: '', G: null };
  function geometry(P) {
    const key = JSON.stringify(P);
    if (memo.key !== key) memo = { key, G: build(P) };
    return memo.G;
  }
  const SET_PHRASE = ['Smith quarter-arcs', '10 PRINT diagonals', 'Carlson winged tiles', 'Truchet triangles', 'hexagonal three-arc tiles', 'over-under weave'];
  const RULE_PHRASE = ['by coin toss', 'drifting in regions', 'blooming into rings and waves', 'mirrored in four quarters', 'in concentric rings'];

  C.register({
    id: 'truchet',
    name: 'Truchet',
    group: 'classic',
    order: 2,
    renderer: '2d',
    animated: true,
    restartDelay: 40,
    subtitle: 'Tiles that make a map',
    about: 'Square, hexagonal and multi-scale tiles whose simple motifs join into long paths: Sébastien Truchet’s 1704 triangles, Cyril Stanley Smith’s quarter-arcs, 10 PRINT diagonals, Christopher Carlson’s 2018 winged tiles that invert colour at each scale, and a woven variant. The orientation of each tile comes from a rule, so regions emerge; the resulting map is then traced with union-find so every enclosed shape or every loop can take its own colour.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 2.2, 1.3, 0.6],
    defaults: { seed: 1704, format: 1, palette: 0 },
    palettes: PALETTES,
    paletteOdds: [2, 2.4, 2, 1.6, 1.4, 1.5, 1.6, 1.3],
    params: [
      { k: 'set', g: 'Tiles', label: 'Tile set', type: 'select', options: SETS, def: 2 },
      { k: 'scale', g: 'Tiles', label: 'Scale', min: 3, max: 40, step: 1, def: 6,
        names: [[3, 'Mural'], [6, 'Panel'], [12, 'Tiled'], [22, 'Mosaic'], [32, 'Tesserae']] },
      { k: 'levels', g: 'Tiles', label: 'Levels', min: 1, max: 4, step: 1, def: 3,
        names: [[1, 'Single scale'], [2, 'Two scales'], [3, 'Three scales'], [4, 'Four scales']] },
      { k: 'split', g: 'Tiles', label: 'Subdivide', min: 0, max: 1, step: 0.01, def: 0.5,
        names: [[0, 'Whole'], [0.2, 'Occasional'], [0.45, 'Frequent'], [0.75, 'Crowded']] },
      { k: 'fill', g: 'Drawing', label: 'Fill', type: 'select', options: FILLS, def: 0 },
      { k: 'weight', g: 'Drawing', label: 'Line weight', min: 0.03, max: 0.45, step: 0.005, def: 0.14,
        names: [[0.03, 'Hairline'], [0.08, 'Fine'], [0.15, 'Bold'], [0.26, 'Ribbon'], [0.36, 'Band']] },
      { k: 'outline', g: 'Drawing', label: 'Edging', min: 0, max: 0.4, step: 0.01, def: 0,
        names: [[0, 'None'], [0.02, 'Keyline'], [0.12, 'Inked'], [0.25, 'Heavy']] },
      { k: 'margin', g: 'Drawing', label: 'Margin', min: 0, max: 0.14, step: 0.005, def: 0.06,
        names: [[0, 'Bleed'], [0.015, 'Tight'], [0.045, 'Mounted'], [0.09, 'Floating']] },
      { k: 'rule', g: 'Orientation', label: 'Rule', type: 'select', options: RULES, def: 1 },
      { k: 'grain', g: 'Orientation', label: 'Grain', min: 0, max: 1, step: 0.01, def: 0.5,
        names: [[0, 'Fine'], [0.3, 'Medium'], [0.6, 'Broad'], [0.85, 'Sweeping']] },
      { k: 'chaos', g: 'Orientation', label: 'Chaos', min: 0, max: 1, step: 0.01, def: 0.08,
        names: [[0, 'Strict'], [0.05, 'Weathered'], [0.25, 'Loose'], [0.6, 'Wild']] },
    ],

    randomize(R) {
      const o = {};
      o.set = C.pickWeighted(R, [2.2, 1.2, 2.6, 1.3, 1.6, 1.5]);
      o.fill = C.pickWeighted(R, o.set === 2 ? [2, 2, 2.5, 1.6] : o.set === 3 ? [1.5, 2, 2.5, 2] : o.set === 5 ? [2, 1, 1.5, 3] : [1.4, 1.8, 2.6, 2.2]);
      o.rule = C.pickWeighted(R, o.set === 3 ? [0.4, 1.4, 1.5, 3, 1.4] : o.set === 2 ? [1.2, 2.4, 2, 1.6, 1.2] : [0.8, 2.4, 2, 1.8, 1.3]);
      const scaleBy = [[5, 22], [8, 30], [3, 9], [5, 18], [5, 18], [6, 16]][o.set];
      o.scale = Math.round(lerp(scaleBy[0], scaleBy[1], Math.pow(R(), 1.3)));
      o.levels = o.set === 2 ? C.pickWeighted(R, [0.3, 2, 3, 1.4]) + 1 : o.set === 3 ? C.pickWeighted(R, [3, 2, 1.2, 0.3]) + 1 : o.set === 1 ? (R() < 0.25 ? 2 : 1) : 1;
      o.split = R.range(0.25, 0.7);
      o.weight = o.set === 1 ? R.range(0.06, 0.2) : o.set === 5 ? R.range(0.2, 0.36) : o.fill === 3 ? R.range(0.18, 0.36) : o.fill === 1 ? R.range(0.03, 0.12) : R.range(0.06, 0.26);
      o.outline = o.fill === 3 || o.set === 5 ? R.range(0.08, 0.22) : R() < 0.7 ? 0 : R.range(0.1, 0.25);
      o.grain = R.range(0.15, 0.9);
      o.chaos = R() < 0.3 ? R.range(0, 0.04) : R.range(0.04, 0.3);
      o.margin = R() < 0.3 ? 0 : R.range(0.03, 0.09);
      return o;
    },
    traitName(k, P) {
      const G = geometry(P);
      if (k === 'levels') {
        if (!(P.set === 1 || P.set === 2 || P.set === 3)) return 'Single scale';
        return ['Single scale', 'Two scales', 'Three scales', 'Four scales'][G.maxL];
      }
      if (k === 'split' && !(P.set === 1 || P.set === 2 || P.set === 3)) return '—';
      if (k === 'weight' && P.set === 2) return 'Carlson ⅓';
      if (k === 'outline' && (P.set === 2 || P.set === 3)) return '—';
      if (k === 'weight' && P.set === 3) return P.weight <= 0.08 ? 'Butted' : P.weight < 0.16 ? 'Fine grout' : P.weight < 0.3 ? 'Grouted' : 'Wide grout';
      if (k === 'scale') return `${G.tiles.length.toLocaleString('en-US')} tiles`;
      return null;
    },
    caption(P) {
      const G = geometry(P);
      const pal = PALETTES[P.palette].name;
      const n = G.tiles.length.toLocaleString('en-US');
      let what = SET_PHRASE[P.set];
      if ((P.set === 1 || P.set === 2 || P.set === 3) && G.maxL > 0) what += ` at ${G.maxL + 1} scales`;
      let tail;
      if (P.set === 2) tail = ['in ink', 'in two tones', 'with a graded figure', 'figure and ground both graded'][P.fill];
      else if (P.fill === 3 && P.set !== 3) tail = `tracing ${G.nStrands.toLocaleString('en-US')} separate strands`;
      else if (P.fill === 2 || P.fill === 3) tail = `coloured as a map of ${G.nRegions.toLocaleString('en-US')} regions`;
      else if (P.fill === 1) tail = 'in two tones';
      else tail = 'in ink';
      return `${pal}: ${n} ${what}, ${RULE_PHRASE[P.rule]}, ${tail}.`;
    },
    sheet(P) {
      const m = C.byId.truchet, t = (k) => C.traitName(m, k, P);
      const G = geometry(P);
      return [
        ['Palette', t('palette')], ['Format', t('format')], ['Tile set', t('set')], ['Tiles', G.tiles.length.toLocaleString('en-US')],
        ['Levels', t('levels')], ['Fill', t('fill')], ['Line weight', t('weight')], ['Rule', t('rule')],
        ['Grain', t('grain')], ['Chaos', t('chaos')],
        P.set === 2 ? ['Figure', 'Inverts per scale'] : (P.fill === 3 && P.set !== 3 ? ['Strands', G.nStrands.toLocaleString('en-US')] : ['Regions', G.nRegions.toLocaleString('en-US')]),
        ['Margin', t('margin')],
      ];
    },

    setup() { return {}; },
    start(p, P, st) {
      st.G = geometry(P);
      st.f = 0;
      st.N = st.G.set === 2 ? 8 + st.G.maxL * 6 : 24;
    },
    frame(p, P, st) {
      const G = st.G, s = p.width / G.W;
      st.f++;
      const t = st.f / st.N;
      drawAll(p.drawingContext, s, G, t >= 1 ? null : t);
      return t < 1;
    },
    progress(st) { return st.N ? st.f / st.N : 0; },
    exportAt(p, P, W, H) {
      const G = geometry(P);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawAll(c.getContext('2d'), W / G.W, G);
      return c;
    },
  });
})();
