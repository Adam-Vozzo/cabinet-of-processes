/* Star Patterns — Islamic geometric star patterns by E. H. Hankin's
   "polygons in contact" method, in the form Craig Kaplan formalised (2005).
   A tiling of regular polygons is laid down; from every edge midpoint two
   rays leave at the contact angle θ (optionally split by an offset δ); each
   ray runs until it meets its partner from the neighbouring edge. The ray
   network is turned into strands (for over-under interlacing) and a planar
   map (for zellige-style fills). All geometry lives in virtual units
   (height 1000) and one painter draws it at any size. */
(function () {
  'use strict';
  const C = window.Cabinet;
  const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
  const SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3);

  /* ---------------- tilings (edge length 1) ---------------- */
  const pg = (n, cx, cy, rot) => ({ n, cx, cy, rot: rot * D2R });
  const A12 = 1 / (2 * Math.tan(PI / 12));
  const L8 = 1 + SQ2;
  const hexCell = (d) => [[d, 0], [d / 2, d * SQ3 / 2]];
  const frac = (a1, a2, f) => [(a1[0] + a2[0]) * f, (a1[1] + a2[1]) * f];

  const TILINGS = (() => {
    const t = [];
    t.push({ short: '4⁴', name: 'Square', conf: '4.4.4.4', a1: [1, 0], a2: [0, 1], polys: [pg(4, 0, 0, 45)], n: 4, vdeg: 4, minor: [0.5, 0.5], par: 2 });
    t.push({ short: '6³', name: 'Hexagonal', conf: '6.6.6', a1: [SQ3, 0], a2: [SQ3 / 2, 1.5], polys: [pg(6, 0, 0, 30)], n: 6, vdeg: 3, minor: [0, 1], par: 3 });
    t.push({ short: '3⁶', name: 'Triangular', conf: '3.3.3.3.3.3', a1: [1, 0], a2: [0.5, SQ3 / 2], polys: [pg(3, 0.5, SQ3 / 6, 90), pg(3, 1, SQ3 / 3, 30)], n: 3, vdeg: 6, minor: [0.5, SQ3 / 6], par: 3 });
    t.push({ short: '4.8²', name: 'Truncated square', conf: '4.8.8', a1: [L8, 0], a2: [0, L8], polys: [pg(8, 0, 0, 22.5), pg(4, L8 / 2, L8 / 2, 0)], n: 8, vdeg: 3, minor: [L8 / 2, L8 / 2], par: 2 });
    {
      const [a1, a2] = hexCell(2 * A12), c1 = frac(a1, a2, 1 / 3), c2 = frac(a1, a2, 2 / 3);
      t.push({ short: '3.12²', name: 'Truncated hexagonal', conf: '3.12.12', a1, a2, polys: [pg(12, 0, 0, 15), pg(3, c1[0], c1[1], 30), pg(3, c2[0], c2[1], 90)], n: 12, vdeg: 3, minor: c1, par: 3 });
    }
    {
      const d = 3 + SQ3, [a1, a2] = hexCell(d), c1 = frac(a1, a2, 1 / 3), c2 = frac(a1, a2, 2 / 3);
      t.push({ short: '4.6.12', name: 'Truncated trihexagonal', conf: '4.6.12', a1, a2, n: 12, vdeg: 3, minor: c1, par: 3,
        polys: [pg(12, 0, 0, 15), pg(4, a1[0] / 2, 0, 45), pg(4, a2[0] / 2, a2[1] / 2, 105), pg(4, (a2[0] - a1[0]) / 2, a2[1] / 2, 165), pg(6, c1[0], c1[1], 0), pg(6, c2[0], c2[1], 0)] });
    }
    {
      const d = 1 + SQ3, [a1, a2] = hexCell(d), c1 = frac(a1, a2, 1 / 3), c2 = frac(a1, a2, 2 / 3);
      t.push({ short: '3.4.6.4', name: 'Rhombitrihexagonal', conf: '3.4.6.4', a1, a2, n: 6, vdeg: 4, minor: c1, par: 3,
        polys: [pg(6, 0, 0, 30), pg(4, a1[0] / 2, 0, 45), pg(4, a2[0] / 2, a2[1] / 2, 105), pg(4, (a2[0] - a1[0]) / 2, a2[1] / 2, 165), pg(3, c1[0], c1[1], 90), pg(3, c2[0], c2[1], 30)] });
    }
    return t;
  })();

  /* ---------------- palettes ----------------
     ground: grout / plaster inside the panel; paper: the mount outside it;
     band + line: strapwork fill and its outline; star: the principal star;
     tiles: the other zellige glazes; con: construction-line ink.            */
  const PALS = [
    { name: 'Alhambra zellige', ground: '#ebe2cd', paper: '#e2d7bf', band: '#f5efe2', line: '#27221f', star: '#2b4c80',
      tiles: ['#2f6a4f', '#c38a2e', '#27221f', '#3f8c86', '#9a4a2c'], con: '#b0402c' },
    { name: 'Iznik', ground: '#f4f1e9', paper: '#ebe6d9', band: '#f7f4ed', line: '#1d2b57', star: '#b5322a',
      tiles: ['#1f4f9e', '#2a9a93', '#f4f1e9', '#4c8a4b', '#1d2b57'], con: '#b5322a' },
    { name: 'Isfahan turquoise', ground: '#e9e3d3', paper: '#e1dac7', band: '#f1ebdb', line: '#13244a', star: '#e0ad38',
      tiles: ['#22a0b0', '#1b3e7a', '#137a88', '#e9e3d3', '#7fc4c4'], con: '#b0402c' },
    { name: 'Gold on lapis', ground: '#1b2657', paper: '#131b3f', band: '#d9aa47', line: '#6b4c16', star: '#2c4196',
      tiles: ['#233170', '#141c42', '#34489f', '#8e2c2c', '#1b2657'], con: '#d9aa47' },
    { name: 'Parchment & ink', ground: '#efe3c6', paper: '#e6d8b6', band: '#efe3c6', line: '#2a221e', star: '#9b3a27',
      tiles: ['#d9c08e', '#c2a068', '#efe3c6', '#a6814c', '#9b3a27'], con: '#9b3a27' },
    { name: 'Fez bejmat', ground: '#efe2c3', paper: '#e5d6b3', band: '#f2e7cc', line: '#211c18', star: '#2e6c46',
      tiles: ['#b5613a', '#2e6c46', '#d7a13f', '#211c18', '#8a3f25'], con: '#b5613a' },
    { name: 'Neon medina', ground: '#121019', paper: '#0b0a10', band: '#f6f1e7', line: '#121019', star: '#ff3d8b',
      tiles: ['#2f6bff', '#ffd400', '#00c2a8', '#ff7a1a', '#121019'], con: '#ff3d8b' },
  ];
  PALS.forEach((p) => {
    p.colors = [p.star, p.tiles[0], p.tiles[1], p.tiles[2], p.band];
    p.bg = p.ground;
    if (!p.grout) { const a = hexToRgb(p.ground), b = hexToRgb(p.line); p.grout = rgbStr(mixRgb(a, b, 0.55)); }
  });

  const STYLES = ['Strapwork', 'Zellige', 'Double line', 'Single line'];
  const FILLS = ['By shape', 'Alternating', 'Stars only', 'Scattered', 'Unfilled'];

  /* ---------------- small helpers ---------------- */
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbStr(c) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
  function mixRgb(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function lum(h) { const c = hexToRgb(h); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }

  function PointIndex(eps) {
    const cell = eps * 4, map = new Map(), pts = [];
    const OFF = 33554432, MUL = 67108864;          // numeric keys: (i + 2^25) * 2^26 + (j + 2^25)
    function find(x, y) {
      const i = Math.round(x / cell), j = Math.round(y / cell);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const b = map.get((i + di + OFF) * MUL + (j + dj + OFF));
        if (b) for (const id of b) { const p = pts[id]; if (Math.abs(p.x - x) <= eps && Math.abs(p.y - y) <= eps) return id; }
      }
      return -1;
    }
    function add(x, y) {
      let id = find(x, y);
      if (id >= 0) return id;
      id = pts.length;
      pts.push({ x, y, e: [] });
      const k = (Math.round(x / cell) + OFF) * MUL + (Math.round(y / cell) + OFF);
      let b = map.get(k);
      if (!b) map.set(k, (b = []));
      b.push(id);
      return id;
    }
    return { add, pts };
  }

  function panelRect(P) {
    const a = C.FORMATS[P.format].a, VW = 1000 * a, VH = 1000, m = P.margin * Math.min(VW, VH);
    return { VW, VH, m, x0: -VW / 2 + m, y0: -VH / 2 + m, x1: VW / 2 - m, y1: VH / 2 - m };
  }

  function geomKey(P) {
    return [P.tiling, P.repeat, P.centre, P.angle, P.offset, P.margin, P.format, P.seed].join('|');
  }

  /* ---------------- the Hankin construction ---------------- */
  function* build(P) {
    let tLast = performance.now(), tk = 0;
    const late = () => ((++tk & 15) === 0 && performance.now() - tLast > SLICE);
    const T = TILINGS[P.tiling];
    const PR = panelRect(P);
    const pw = PR.x1 - PR.x0, ph = PR.y1 - PR.y0;
    const la = Math.hypot(T.a1[0], T.a1[1]);
    const s = Math.min(pw, ph) / (P.repeat * la);        // edge length, virtual units
    const anc = P.centre === 1 ? T.minor : [0, 0];
    const cx0 = (PR.x0 + PR.x1) / 2, cy0 = (PR.y0 + PR.y1) / 2;
    const hx = pw / 2 + s * 2.2, hy = ph / 2 + s * 2.2;   // generation half-extents
    const det = T.a1[0] * T.a2[1] - T.a1[1] * T.a2[0];
    const toIJ = (x, y) => {
      const X = (x - cx0) / s + anc[0], Y = (y - cy0) / s + anc[1];
      return [(X * T.a2[1] - Y * T.a2[0]) / det, (T.a1[0] * Y - T.a1[1] * X) / det];
    };
    let i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9;
    for (const [x, y] of [[cx0 - hx, cy0 - hy], [cx0 + hx, cy0 - hy], [cx0 + hx, cy0 + hy], [cx0 - hx, cy0 + hy]]) {
      const [i, j] = toIJ(x, y);
      i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j);
    }
    i0 = Math.floor(i0) - 2; i1 = Math.ceil(i1) + 2; j0 = Math.floor(j0) - 2; j1 = Math.ceil(j1) + 2;

    // 1. polygons
    const polys = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (const d of T.polys) {
        const cx = cx0 + (i * T.a1[0] + j * T.a2[0] + d.cx - anc[0]) * s;
        const cy = cy0 + (i * T.a1[1] + j * T.a2[1] + d.cy - anc[1]) * s;
        const R = s / (2 * Math.sin(PI / d.n));
        if (cx < cx0 - hx - R || cx > cx0 + hx + R || cy < cy0 - hy - R || cy > cy0 + hy + R) continue;
        const vs = [];
        for (let k = 0; k < d.n; k++) { const a = d.rot + k * TAU / d.n; vs.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
        polys.push({ n: d.n, cx, cy, vs });
      }
    }
    { yield; tLast = performance.now(); }

    // 2. rays: two per edge, meeting partner rays of the neighbouring edges
    const th = P.angle * D2R, ct = Math.cos(th), sn = Math.sin(th);
    const off = P.offset;
    const segs = [];
    const rays = [];
    const tEdges = [];
    const eps = s * 1e-9;
    let count = 0;
    for (const poly of polys) {
      const n = poly.n, st = [], dr = [];
      for (let k = 0; k < n; k++) {
        const a = poly.vs[k], b = poly.vs[(k + 1) % n];
        const ex = (b[0] - a[0]) / s, ey = (b[1] - a[1]) / s, nx = -ey, ny = ex;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = off * s / 2;
        st.push([[mx - h * ex, my - h * ey], [mx + h * ex, my + h * ey]]);
        dr.push([[ct * ex + sn * nx, ct * ey + sn * ny], [-ct * ex + sn * nx, -ct * ey + sn * ny]]);
        tEdges.push(a[0], a[1], b[0], b[1]);
      }
      const local = [];
      for (let k = 0; k < n; k++) {
        const k2 = (k + 1) % n;
        const p0 = st[k][0], d0 = dr[k][0], p1 = st[k2][1], d1 = dr[k2][1];
        const den = d0[0] * d1[1] - d0[1] * d1[0];
        const qx = p1[0] - p0[0], qy = p1[1] - p0[1];
        let X;
        if (Math.abs(den) < 1e-9) {
          // parallel: collinear partners meet halfway (the "net" case), else stop at the centre
          const dist = Math.abs(qx * d0[1] - qy * d0[0]);
          X = dist < s * 1e-6 ? [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2] : [poly.cx, poly.cy];
        } else {
          const t = (qx * d1[1] - qy * d1[0]) / den, u = (qx * d0[1] - qy * d0[0]) / den;
          X = (t > 0 && u > 0) ? [p0[0] + t * d0[0], p0[1] + t * d0[1]] : [poly.cx, poly.cy];
        }
        local.push({ x1: p0[0], y1: p0[1], x2: X[0], y2: X[1], cuts: [] });
        local.push({ x1: p1[0], y1: p1[1], x2: X[0], y2: X[1], cuts: [] });
      }
      // crossings between rays of the same polygon (rays never leave their polygon)
      for (let a = 0; a < local.length; a++) {
        const A = local[a], rx = A.x2 - A.x1, ry = A.y2 - A.y1;
        for (let b = a + 1; b < local.length; b++) {
          const B = local[b], sx = B.x2 - B.x1, sy = B.y2 - B.y1;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-10 * s * s) continue;
          const qx = B.x1 - A.x1, qy = B.y1 - A.y1;
          const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
          const e1 = 1e-7, e2 = 1e-6;
          if (t < -e2 || t > 1 + e2 || u < -e2 || u > 1 + e2) continue;
          const tin = t > e1 && t < 1 - e1, uin = u > e1 && u < 1 - e1;
          if (!tin && !uin) continue;
          const px = A.x1 + t * rx, py = A.y1 + t * ry;
          if (tin) A.cuts.push([t, px, py]);
          if (uin) B.cuts.push([u, px, py]);
        }
      }
      for (const L of local) {
        rays.push(L.x1, L.y1, L.x2, L.y2);
        segs.push(L);
      }
      if (late()) { yield; tLast = performance.now(); }
    }

    // 3. planar graph
    const idx = PointIndex(s * 1e-6);
    const nodes = idx.pts;
    const edges = [];
    const seen = new Set();
    for (let q = 0; q < segs.length; q++) {
      const L = segs[q];
      L.cuts.sort((a, b) => a[0] - b[0]);
      let prev = idx.add(L.x1, L.y1);
      const nc = L.cuts.length;
      for (let ci = 0; ci <= nc; ci++) {
        const id = ci < nc ? idx.add(L.cuts[ci][1], L.cuts[ci][2]) : idx.add(L.x2, L.y2);
        if (id !== prev) {
          const key = prev < id ? prev * 67108864 + id : id * 67108864 + prev;
          if (!seen.has(key)) {
            seen.add(key);
            const ei = edges.length;
            edges.push([prev, id]);
            nodes[prev].e.push(ei); nodes[id].e.push(ei);
          }
        }
        prev = id;
      }
      if (late()) { yield; tLast = performance.now(); }
    }
    { yield; tLast = performance.now(); }

    // node pairing: straight-through at crossings, the bend at degree 2
    for (let v = 0; v < nodes.length; v++) {
      const nd = nodes[v];
      const list = nd.e.map((ei) => {
        const e = edges[ei], o = nodes[e[0] === v ? e[1] : e[0]];
        return { ei, a: Math.atan2(o.y - nd.y, o.x - nd.x) };
      }).sort((p, q) => p.a - q.a);
      nd.sorted = list.map((l) => l.ei);
      nd.ang = list.map((l) => l.a);
      nd.pair = new Map();
      const deg = list.length;
      if (deg === 2) { nd.pair.set(list[0].ei, list[1].ei); nd.pair.set(list[1].ei, list[0].ei); }
      else if (deg >= 4 && deg % 2 === 0) {
        const h = deg / 2;
        for (let i = 0; i < h; i++) { nd.pair.set(list[i].ei, list[i + h].ei); nd.pair.set(list[i + h].ei, list[i].ei); }
      }
      nd.cross = deg === 4;
      if (late()) { yield; tLast = performance.now(); }
    }
    { yield; tLast = performance.now(); }

    // 4. strands
    const other = (ei, v) => (edges[ei][0] === v ? edges[ei][1] : edges[ei][0]);
    const used = new Uint8Array(edges.length);
    const strands = [];
    for (let e0 = 0; e0 < edges.length; e0++) {
      if (used[e0]) continue;
      // walk backwards to the start of an open strand (or all the way round a loop)
      let v = edges[e0][0], e = e0, closed = false, guard = 0;
      while (guard++ < 200000) {
        const pe = nodes[v].pair.get(e);
        if (pe == null) break;
        if (pe === e0) { closed = true; break; }
        const nv = other(pe, v);
        e = pe; v = nv;
        if (late()) { yield; tLast = performance.now(); }
      }
      // now walk forwards from (v, e)
      const sv = closed ? edges[e0][0] : v;
      let ce = closed ? e0 : e;
      let cv = sv;
      const nodeList = [cv], edgeList = [];
      guard = 0;
      while (guard++ < 200000) {
        used[ce] = 1;
        edgeList.push(ce);
        const nv = other(ce, cv);
        nodeList.push(nv);
        const pe = nodes[nv].pair.get(ce);
        if (pe == null || (closed && pe === edgeList[0] && nv === sv)) break;
        if (used[pe] && !closed) break;
        cv = nv; ce = pe;
        if (late()) { yield; tLast = performance.now(); }
      }
      strands.push({ nodes: nodeList, edges: edgeList, closed: closed && nodeList[nodeList.length - 1] === sv });
      if (late()) { yield; tLast = performance.now(); }
    }

    // 5. interlace: alternate over/under along every strand (BFS 2-colouring of crossings)
    const R = C.rng(P.seed ^ 0x51f3);
    const over = new Int8Array(nodes.length).fill(-1);   // index in sorted list (0 or 1) of the pair that is over
    const pairId = (v, ei) => { const k = nodes[v].sorted.indexOf(ei); return k % 2; };
    const links = new Map();
    const link = (a, b) => { let l = links.get(a); if (!l) links.set(a, (l = [])); l.push(b); };
    for (const S of strands) {
      const seq = [];
      const nn = S.nodes.length;
      for (let i = 0; i < nn; i++) {
        const v = S.nodes[i];
        if (!nodes[v].cross) continue;
        let eIn;
        if (i > 0) eIn = S.edges[i - 1];
        else if (S.closed) eIn = S.edges[S.edges.length - 1];
        else continue;
        if (S.closed && i === nn - 1) continue;
        seq.push([v, pairId(v, eIn)]);
      }
      for (let i = 0; i + 1 < seq.length; i++) { link(seq[i][0] * 2 + seq[i][1], seq[i + 1][0] * 2 + seq[i + 1][1]); link(seq[i + 1][0] * 2 + seq[i + 1][1], seq[i][0] * 2 + seq[i][1]); }
      if (late()) { yield; tLast = performance.now(); }
      if (S.closed && seq.length > 1) { const a = seq[seq.length - 1], b = seq[0]; link(a[0] * 2 + a[1], b[0] * 2 + b[1]); link(b[0] * 2 + b[1], a[0] * 2 + a[1]); }
    }
    let conflicts = 0;
    const firstOver = R() < 0.5 ? 0 : 1;
    for (let v = 0; v < nodes.length; v++) {
      if (!nodes[v].cross || over[v] >= 0) continue;
      over[v] = firstOver;
      const queue = [v];
      while (queue.length) {
        const c = queue.pop();
        for (const pid of [0, 1]) {
          const isOver = over[c] === pid;
          const L = links.get(c * 2 + pid);
          if (!L) continue;
          for (const code of L) {
            const c2 = code >> 1, p2 = code & 1;
            const want = isOver ? 1 - p2 : p2;
            if (over[c2] < 0) { over[c2] = want; queue.push(c2); }
            else if (over[c2] !== want) conflicts++;
          }
        }
        if (late()) { yield; tLast = performance.now(); }
      }
    }
    { yield; tLast = performance.now(); }

    // 6. faces of the planar map
    const posIn = new Map();
    for (let v = 0; v < nodes.length; v++) {
      const so = nodes[v].sorted;
      for (let k = 0; k < so.length; k++) posIn.set(so[k] * 2 + (edges[so[k]][0] === v ? 0 : 1), k);
      if (late()) { yield; tLast = performance.now(); }
    }
    // half-edge h = ei*2 + d; d=0 goes a->b, d=1 goes b->a. tail(h) = edges[ei][d], head = edges[ei][1-d]
    const visited = new Uint8Array(edges.length * 2);
    const rawFaces = [];
    const hf = new Int32Array(edges.length * 2).fill(-1);
    for (let h0 = 0; h0 < edges.length * 2; h0++) {
      if (visited[h0]) continue;
      const loop = [], hs = [];
      let h = h0, guard = 0;
      while (!visited[h] && guard++ < 100000) {
        visited[h] = 1;
        hs.push(h);
        hf[h] = rawFaces.length;
        const ei = h >> 1, d = h & 1;
        const tail = edges[ei][d], head = edges[ei][1 - d];
        loop.push(tail);
        const nd = nodes[head];
        const k = posIn.get(ei * 2 + (edges[ei][0] === head ? 0 : 1));
        const deg = nd.sorted.length;
        const ne = nd.sorted[(k - 1 + deg) % deg];
        h = ne * 2 + (edges[ne][0] === head ? 0 : 1);
      }
      if (loop.length >= 3) {
        let A = 0, sx = 0, sy = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
        const pts = new Float64Array(loop.length * 2);
        for (let i = 0; i < loop.length; i++) {
          const p = nodes[loop[i]], q = nodes[loop[(i + 1) % loop.length]];
          const cr = p.x * q.y - q.x * p.y;
          A += cr; sx += (p.x + q.x) * cr; sy += (p.y + q.y) * cr;
          pts[i * 2] = p.x; pts[i * 2 + 1] = p.y;
          if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x; if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y;
        }
        A /= 2;
        rawFaces.push({ pts, n: loop.length, area: A, cx: A ? sx / (6 * A) : 0, cy: A ? sy / (6 * A) : 0, bb: [bx0, by0, bx1, by1], hs });
      } else rawFaces.push(null);
      if (late()) { yield; tLast = performance.now(); }
    }
    let pos = 0, neg = 0;
    for (const f of rawFaces) { if (!f) continue; if (f.area > 0) pos++; else if (f.area < 0) neg++; }
    const sign = pos >= neg ? 1 : -1;
    const genArea = 4 * hx * hy;
    const faces = [];
    const rawToKept = new Int32Array(rawFaces.length).fill(-1);
    for (let ri = 0; ri < rawFaces.length; ri++) {
      const f = rawFaces[ri];
      if (!f) continue;
      const a = f.area * sign;
      if (a <= s * s * 1e-6 || a > genArea * 0.25) continue;
      if (f.bb[2] < PR.x0 || f.bb[0] > PR.x1 || f.bb[3] < PR.y0 || f.bb[1] > PR.y1) continue;
      f.area = a;
      rawToKept[ri] = faces.length;
      faces.push(f);
    }
    const neighbours = (f) => { const out = new Set(); for (const h of f.hs) { const o = rawToKept[hf[h ^ 1]]; if (o >= 0) out.add(o); } return [...out]; };
    { yield; tLast = performance.now(); }

    // 7. classify faces by shape (vertex count + area), find the principal star
    const order = faces.map((f, i) => i).sort((a, b) => faces[b].area - faces[a].area);
    const classes = [];
    for (const i of order) {
      const f = faces[i];
      let c = classes.find((k) => k.n === f.n && Math.abs(k.area - f.area) < 2e-3 * k.area);
      if (!c) { c = { n: f.n, area: f.area, count: 0 }; classes.push(c); }
      c.count++;
      f.cls = classes.indexOf(c);
      if (late()) { yield; tLast = performance.now(); }
    }
    const inside = (f, x, y) => {
      let c = false;
      for (let i = 0, j = f.n - 1; i < f.n; j = i++) {
        const xi = f.pts[i * 2], yi = f.pts[i * 2 + 1], xj = f.pts[j * 2], yj = f.pts[j * 2 + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const faceAt = (x, y) => {
      const px = x + s * 1.3e-3, py = y + s * 0.7e-3;
      for (let i = 0; i < faces.length; i++) { const f = faces[i]; if (px >= f.bb[0] && px <= f.bb[2] && py >= f.bb[1] && py <= f.bb[3] && inside(f, px, py)) return i; }
      return -1;
    };
    const majorFace = faceAt(cx0 + (0 - anc[0]) * s, cy0 + (0 - anc[1]) * s);
    const minorFace = faceAt(cx0 + (T.minor[0] - anc[0]) * s, cy0 + (T.minor[1] - anc[1]) * s);
    const principal = majorFace >= 0 ? faces[majorFace].cls : 0;
    // parity on the lattice of principal polygons (for alternating fills)
    for (const f of faces) {
      const [fi, fj] = toIJ(f.cx, f.cy);
      const i = Math.round(fi), j = Math.round(fj);
      f.par = T.par === 2 ? (((i + j) % 2) + 2) % 2 : (((i - j) % 3) + 3) % 3;
      f.rnd = R();
      f.rnd2 = R();
      if (late()) { yield; tLast = performance.now(); }
    }

    // keep only what the panel shows
    const inPanel = (x1, y1, x2, y2) => !(Math.max(x1, x2) < PR.x0 - s || Math.min(x1, x2) > PR.x1 + s || Math.max(y1, y2) < PR.y0 - s || Math.min(y1, y2) > PR.y1 + s);
    const rv = [];
    for (let i = 0; i < rays.length; i += 4) if (inPanel(rays[i], rays[i + 1], rays[i + 2], rays[i + 3])) rv.push(rays[i], rays[i + 1], rays[i + 2], rays[i + 3]);
    const tv = [];
    const tseen = new Set();
    for (let i = 0; i < tEdges.length; i += 4) {
      const a = Math.round(tEdges[i] * 64) + ',' + Math.round(tEdges[i + 1] * 64), b = Math.round(tEdges[i + 2] * 64) + ',' + Math.round(tEdges[i + 3] * 64);
      const key = a < b ? a + '|' + b : b + '|' + a;
      if (tseen.has(key)) continue;
      tseen.add(key);
      if (inPanel(tEdges[i], tEdges[i + 1], tEdges[i + 2], tEdges[i + 3])) tv.push(tEdges[i], tEdges[i + 1], tEdges[i + 2], tEdges[i + 3]);
    }
    const strandsOut = [];
    for (const S of strands) {
      let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      const pts = [];
      for (const v of S.nodes) { const p = nodes[v]; pts.push(p.x, p.y); if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x; if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y; }
      if (bx1 < PR.x0 - s || bx0 > PR.x1 + s || by1 < PR.y0 - s || by0 > PR.y1 + s) continue;
      strandsOut.push({ pts, closed: S.closed });
    }
    const crossings = [];
    for (let v = 0; v < nodes.length; v++) {
      const nd = nodes[v];
      if (!nd.cross || over[v] < 0) continue;
      if (nd.x < PR.x0 - s || nd.x > PR.x1 + s || nd.y < PR.y0 - s || nd.y > PR.y1 + s) continue;
      crossings.push(v);
    }
    return { s, PR, T, nodes, edges, other, crossings, over, faces, classes, principal, majorFace, minorFace, neighbours, rays: new Float32Array(rv), tiling: new Float32Array(tv), strands: strandsOut, conflicts, cx0, cy0 };
  }

  // walk from crossing v along edge ei for length L, stopping halfway to the next crossing
  function walk(G, v, ei, L) {
    const { nodes, edges } = G;
    // pass 1: distance to the next crossing
    let cv = v, ce = ei, dist = 0, guard = 0;
    while (guard++ < 64) {
      const nv = G.other(ce, cv);
      const a = nodes[cv], b = nodes[nv];
      dist += Math.hypot(b.x - a.x, b.y - a.y);
      if (nodes[nv].cross || dist > L * 2.2) break;
      const pe = nodes[nv].pair.get(ce);
      if (pe == null) { dist = 1e9; break; }
      cv = nv; ce = pe;
    }
    const lim = Math.min(L, dist * 0.5);
    const out = [];
    cv = v; ce = ei; let rem = lim; guard = 0;
    while (guard++ < 64) {
      const nv = G.other(ce, cv);
      const a = nodes[cv], b = nodes[nv];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d >= rem) { out.push(a.x + (b.x - a.x) * rem / d, a.y + (b.y - a.y) * rem / d); break; }
      out.push(b.x, b.y);
      rem -= d;
      const pe = nodes[nv].pair.get(ce);
      if (pe == null) break;
      cv = nv; ce = pe;
    }
    return out;
  }

  function joinWalks(w1, x, y, w2) {
    const out = [];
    for (let i = w1.length - 2; i >= 0; i -= 2) out.push(w1[i], w1[i + 1]);
    out.push(x, y);
    for (let i = 0; i < w2.length; i++) out.push(w2[i]);
    return out;
  }
  // local pieces at every crossing: the over strand to redraw, the halo along it,
  // and the under strand's local footprint (the halo is clipped to it)
  function crossingPiece(G, v, W, ow, gap) {
    const hw = W / 2 + ow;
    const nd = G.nodes[v];
    const o = G.over[v];
    const ea = nd.sorted[o], eb = nd.sorted[o + 2], ec = nd.sorted[1 - o], ed = nd.sorted[3 - o];
    const da = nd.ang[o] - nd.ang[1 - o];
    const sa = Math.max(Math.abs(Math.sin(da)), 0.2);
    const ta = sa / Math.max(1e-3, Math.abs(Math.cos(da)));
    const Lo = hw / sa + hw / ta + W * 0.3;
    const pc = { over: joinWalks(walk(G, v, ea, Lo), nd.x, nd.y, walk(G, v, eb, Lo)) };
    if (gap > 0) {
      const Lh = hw / sa + (hw + gap) / ta + W * 0.3;
      const Lu = (hw + gap) / sa + hw / ta + W * 0.3;
      pc.halo = joinWalks(walk(G, v, ea, Lh), nd.x, nd.y, walk(G, v, eb, Lh));
      pc.under = joinWalks(walk(G, v, ec, Lu), nd.x, nd.y, walk(G, v, ed, Lu));
    }
    return pc;
  }
  // union of quads along a polyline (a stroke-shaped clip region)
  function quadPath(ctx, pts, hw) {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      let x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3];
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      const ux = dx / L, uy = dy / L, nx = -uy * hw, ny = ux * hw;
      if (i > 0) { x1 -= ux * hw * 0.6; y1 -= uy * hw * 0.6; }
      if (i + 4 < pts.length) { x2 += ux * hw * 0.6; y2 += uy * hw * 0.6; }
      ctx.moveTo(x1 + nx, y1 + ny); ctx.lineTo(x2 + nx, y2 + ny); ctx.lineTo(x2 - nx, y2 - ny); ctx.lineTo(x1 - nx, y1 - ny); ctx.closePath();
    }
  }

  /* ---------------- painting ---------------- */
  function tracePts(ctx, pts, closed) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (closed) ctx.closePath();
  }

  function styleFor(P, G, k) {
    const pal = PALS[P.palette];
    const px = 1 / k;                                   // one output pixel in virtual units
    const W = Math.max(P.band * G.s, 1.2 * px);
    const st = { pal, W, px };
    if (P.style === 0) Object.assign(st, { band: pal.band, line: pal.line, ow: Math.max(W * 0.16, 0.9 * px), lines: false });
    else if (P.style === 1) Object.assign(st, { band: pal.band, line: pal.grout, ow: Math.max(W * 0.1, 0.8 * px), lines: false });
    else if (P.style === 2) Object.assign(st, { band: pal.ground, line: pal.line, ow: Math.max(W * 0.12, 0.9 * px), lines: false });
    else {
      const ink = lum(pal.ground) < 0.4 ? pal.band : pal.line;     // light line on dark grounds
      Object.assign(st, { band: ink, line: ink, ow: 0, lines: true, W: Math.max(W * 0.22, 1.1 * px, 0.9) });
    }
    st.erase = P.style >= 2 ? pal.ground : st.line;
    st.weave = P.interlace > 0 && !(P.style === 3 && P.fill !== 4);
    st.gap = st.weave && P.style !== 2 ? P.interlace * st.W * 0.9 + (st.lines ? st.W * 1.5 : 0) : 0;
    return st;
  }

  function faceColours(P, G, S) {
    const pal = S.pal;
    const fill = P.fill;
    const star = hexToRgb(pal.star);
    // a seeded ordering of the glazes, so each seed dresses the same geometry differently
    const Rc = C.rng((P.seed * 7 + 13) ^ 0x2c1b);
    const order = pal.tiles.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Rc() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const tiles = order.map((i) => hexToRgb(pal.tiles[i]));
    // colour ranks: principal star first, then other classes by area
    const rank = new Map();
    let r = 0;
    G.classes.forEach((c, i) => { if (i !== G.principal) rank.set(i, r++); });
    const tiny = G.s * G.s * 0.004;
    const cols = new Array(G.faces.length);
    for (let i = 0; i < G.faces.length; i++) {
      const f = G.faces[i];
      let c = null;
      if (fill === 4) c = null;
      else if (fill === 3) {
        const all = [star, ...tiles];
        c = all[Math.floor(f.rnd2 * all.length)];
      } else if (f.cls === G.principal) {
        c = fill === 1 ? [star, tiles[0], tiles[1]][f.par % G.T.par] : star;
      } else if (fill === 2) c = null;
      else {
        const k = rank.get(f.cls);
        c = tiles[(k + (fill === 1 ? f.par : 0)) % tiles.length];
      }
      if (c && f.area < tiny) c = hexToRgb(pal.band);
      if (c) {
        const g = P.glaze;
        if (g > 0) {
          const t = (Math.round((f.rnd - 0.5) * 8) / 8) * 2 * g;      // a handful of glaze shades per colour
          c = t > 0 ? mixRgb(c, [255, 255, 255], t * 0.16) : mixRgb(c, [0, 0, 0], -t * 0.2);
        }
        cols[i] = rgbStr(c);
      } else cols[i] = null;
    }
    return cols;
  }

  function* paint(ctx, Wpx, Hpx, G, P) {
    let tLast = performance.now(), tk = 0;
    const late = () => ((++tk & 15) === 0 && performance.now() - tLast > SLICE);
    const k = Hpx / 1000;
    const PR = G.PR;
    const S = styleFor(P, G, k);
    const pal = S.pal;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, Wpx / 2, Hpx / 2);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 12;
    ctx.fillStyle = pal.paper;
    ctx.fillRect(-PR.VW / 2 - 2, -PR.VH / 2 - 2, PR.VW + 4, PR.VH + 4);
    ctx.fillStyle = pal.ground;
    ctx.fillRect(PR.x0, PR.y0, PR.x1 - PR.x0, PR.y1 - PR.y0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(PR.x0, PR.y0, PR.x1 - PR.x0, PR.y1 - PR.y0);
    ctx.clip();

    // faces, batched by glaze colour
    const cols = faceColours(P, G, S);
    const byCol = new Map();
    for (let i = 0; i < G.faces.length; i++) {
      if (!cols[i]) continue;
      let a = byCol.get(cols[i]);
      if (!a) byCol.set(cols[i], (a = []));
      a.push(G.faces[i]);
    }
    for (const [col, list] of byCol) {
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = S.px * 0.8;
      ctx.beginPath();
      for (let i = 0; i < list.length; i++) {
        tracePts(ctx, list[i].pts, true);
        if (late() && i < list.length - 1) {
          ctx.fill(); if (!S.lines) ctx.stroke();
          yield; tLast = performance.now();
          ctx.beginPath();
        }
      }
      ctx.fill();
      if (!S.lines) ctx.stroke();
    }
    yield; tLast = performance.now();

    // construction lines (Topkapı scroll style)
    if (P.construction === 1) {
      ctx.save();
      ctx.strokeStyle = pal.con;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = Math.max(S.px * 1.0, 1.1);
      ctx.setLineDash([G.s * 0.035, G.s * 0.035]);
      ctx.beginPath();
      const t = G.tiling;
      for (let i = 0; i < t.length; i += 4) { ctx.moveTo(t[i], t[i + 1]); ctx.lineTo(t[i + 2], t[i + 3]); }
      ctx.stroke();
      ctx.restore();
    }

    // strapwork, pass 1: every outline, then every fill (a flat lattice). Long strands
    // are stroked in chunks that break mid-segment, so joins stay mitred.
    function* strokeAll(w, col) {
      ctx.lineWidth = w; ctx.strokeStyle = col;
      ctx.beginPath();
      for (const st of G.strands) {
        const p = st.pts, n = p.length / 2;
        if (n < 2) continue;
        // closed strands repeat their first point last; start and end them mid-segment
        const m0x = (p[0] + p[2]) / 2, m0y = (p[1] + p[3]) / 2;
        let px = st.closed ? m0x : p[0], py = st.closed ? m0y : p[1];
        ctx.moveTo(px, py);
        const cnt = st.closed ? n : n - 1;
        for (let q = 0; q < cnt; q++) {
          const endMid = st.closed && q === n - 1;
          const x = endMid ? m0x : p[q * 2 + 2], y = endMid ? m0y : p[q * 2 + 3];
          if (q > 0 && q < cnt - 1 && late()) {
            const mx = (px + x) / 2, my = (py + y) / 2;
            ctx.lineTo(mx, my); ctx.stroke();
            yield; tLast = performance.now();
            ctx.lineWidth = w; ctx.strokeStyle = col;
            ctx.beginPath(); ctx.moveTo(mx, my);
          }
          ctx.lineTo(x, y);
          px = x; py = y;
        }
      }
      ctx.stroke();
    }
    if (S.lines) yield* strokeAll(S.W, S.line);
    else { yield* strokeAll(S.W + 2 * S.ow, S.line); yield* strokeAll(S.W, S.band); }
    yield; tLast = performance.now();

    // pass 2: over-under at every crossing. Local pieces stop halfway to the next
    // crossing along their strand, so no two overlap and each pass can be batched.
    if (S.weave) {
      const pieces = [];
      const hwP = S.W / 2 + S.ow;
      for (const v of G.crossings) {
        pieces.push(crossingPiece(G, v, S.W, S.ow, S.gap));
        if (late()) { yield; tLast = performance.now(); }
      }
      if (S.gap > 0) {
        ctx.save();
        ctx.beginPath();
        for (const pc of pieces) { quadPath(ctx, pc.under, hwP + S.px * 0.75); if (late()) { yield; tLast = performance.now(); } }
        ctx.clip();
        ctx.strokeStyle = S.erase;
        ctx.lineWidth = S.W + 2 * S.ow + 2 * S.gap;
        ctx.beginPath();
        for (const pc of pieces) { tracePts(ctx, pc.halo, false); if (late()) { yield; tLast = performance.now(); } }
        ctx.stroke();
        ctx.restore();
        yield; tLast = performance.now();
      }
      ctx.beginPath();
      for (const pc of pieces) { tracePts(ctx, pc.over, false); if (late()) { yield; tLast = performance.now(); } }
      if (S.lines) { ctx.lineWidth = S.W; ctx.strokeStyle = S.line; ctx.stroke(); }
      else {
        ctx.lineWidth = S.W + 2 * S.ow; ctx.strokeStyle = S.line; ctx.stroke();
        ctx.lineWidth = S.W; ctx.strokeStyle = S.band; ctx.stroke();
      }
    }
    ctx.restore(); // unclip

    // the panel frame
    if (PR.m > 0.5) {
      const fw = Math.min(PR.m * 0.55, Math.max(S.lines ? S.W : S.W * 1.1, 4));
      const inset = fw / 2;
      ctx.beginPath();
      ctx.rect(PR.x0 - inset, PR.y0 - inset, PR.x1 - PR.x0 + 2 * inset, PR.y1 - PR.y0 + 2 * inset);
      if (S.lines) { ctx.lineWidth = S.W; ctx.strokeStyle = S.line; ctx.stroke(); }
      else {
        ctx.lineWidth = fw + 2 * S.ow; ctx.strokeStyle = S.line; ctx.stroke();
        ctx.lineWidth = fw; ctx.strokeStyle = S.band; ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drain(gen) { let r; do { r = gen.next(); } while (!r.done); return r.value; }

  /* ---------------- naming, from the geometry itself ---------------- */
  const POLY_NAMES = { 3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 12: 'Dodecagon', 16: 'Hexadecagon', 24: '24-gon' };
  // strip collinear corners; return the signed turn at every real corner (positive = convex)
  function turnsOf(f) {
    const n = f.n, out = [];
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, c = (i + 1) % n;
      const ax = f.pts[a * 2], ay = f.pts[a * 2 + 1], bx = f.pts[i * 2], by = f.pts[i * 2 + 1], cx = f.pts[c * 2], cy = f.pts[c * 2 + 1];
      const t = Math.atan2((bx - ax) * (cy - by) - (by - ay) * (cx - bx), (bx - ax) * (cx - bx) + (by - ay) * (cy - by));
      if (Math.abs(t) > 0.02) out.push(t);
    }
    const tot = out.reduce((a, b) => a + b, 0);
    return tot < 0 ? out.map((t) => -t) : out;
  }
  function shapeOf(G, fi) {
    if (fi == null || fi < 0) return null;
    const turns = turnsOf(G.faces[fi]);
    const k = turns.length;
    const convex = turns.filter((t) => t > 0);
    if (convex.length === k) return { kind: 'poly', m: k };
    const alt = k % 2 === 0 && turns.every((t, i) => (t > 0) !== (turns[(i + 1) % k] > 0));
    if (alt && convex.length >= 3) {
      const tip = convex.reduce((a, t) => a + (PI - t), 0) / convex.length / D2R;
      return { kind: 'star', m: convex.length, tip };
    }
    return { kind: 'other', m: convex.length, k };
  }
  function family(tip, pts) {
    // Bonner's families: star points of 360/n (acute), 720/n (median), 1080/n (obtuse)
    const k = tip * pts / 360;
    if (k < 0.72) return 'Slender';
    if (k < 1.45) return 'Acute';
    if (k < 2.45) return 'Median';
    return 'Obtuse';
  }
  const infoCache = new Map();
  function patternInfo(P) {
    const key = P.tiling + '|' + P.angle + '|' + P.offset;
    let info = infoCache.get(key);
    if (info) return info;
    const G = drain(build({ tiling: P.tiling, angle: P.angle, offset: P.offset, repeat: 1.3, margin: 0, format: 1, centre: 0, seed: 1 }));
    const T = TILINGS[P.tiling];
    const major = shapeOf(G, G.majorFace), minor = shapeOf(G, G.minorFace);
    let name;
    const net = Math.abs(P.offset) < 0.005 && Math.abs(P.angle - 180 / T.n) < 0.6;
    if (net) name = 'Medial net';
    else if (major && major.kind === 'star') {
      let rosette = false;
      const nb = G.neighbours(G.faces[G.majorFace]);
      if (nb.length === major.m && major.m >= 8) {
        const c0 = G.faces[nb[0]].cls;
        if (nb.every((i) => G.faces[i].cls === c0)) { const sh = shapeOf(G, nb[0]); rosette = !!sh && sh.kind !== 'star' && turnsOf(G.faces[nb[0]]).length === 6; }
      }
      name = `${family(major.tip, major.m)} ${major.m}-point ${rosette ? 'rosette' : 'star'}`;
    } else if (minor && minor.kind === 'star') name = `${family(minor.tip, minor.m)} ${minor.m}-point star`;
    else if (major && major.kind === 'poly') name = POLY_NAMES[major.m] || `${major.m}-gon`;
    else if (major) name = `Compound ${major.m}-point star`;
    else if (minor && minor.kind === 'poly') name = POLY_NAMES[minor.m] || `${minor.m}-gon`;
    else name = `${T.n}-fold lattice`;
    info = { name, major, minor };
    if (infoCache.size > 400) infoCache.clear();
    infoCache.set(key, info);
    return info;
  }
  const starName = (P) => patternInfo(P).name;

  const CONSTRUCT_MS = 1100, REVEAL_MS = 750;
  const SLICE = 4;          // ms of work between yields inside the generators
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

  const MOD = C.register({
    id: 'hankin',
    name: 'Star Patterns',
    group: 'process',
    order: 9,
    renderer: '2d',
    animated: true,
    restartDelay: 60,
    subtitle: 'Polygons in contact',
    about: 'E. H. Hankin noticed in 1925 that Islamic star patterns hide a plain tiling of polygons: from the midpoint of every edge two lines leave at a fixed contact angle and run until they meet. Craig Kaplan formalised the method; the star families (acute, median, obtuse, two-point) follow Jay Bonner. The lines become interlaced strapwork and the spaces between them are glazed like zellige.',
    formats: [0, 1, 2, 3],
    formatOdds: [2, 2.4, 1.2, 0.5],
    defaults: { seed: 1925, format: 1, palette: 0 },
    palettes: PALS,
    paletteOdds: [2.4, 1.8, 1.6, 1.4, 1.2, 1.2, 0.6],
    params: [
      { k: 'tiling', g: 'Tiling', label: 'Tiling', type: 'select', options: TILINGS.map((t) => t.short), def: 3 },
      { k: 'repeat', g: 'Tiling', label: 'Repeat', min: 1, max: 8, step: 0.1, def: 2.4,
        names: [[1, 'Monumental'], [1.8, 'Panel'], [3.2, 'Field'], [5.5, 'Diaper']] },
      { k: 'centre', g: 'Tiling', label: 'Centred on', type: 'select', options: ['Major star', 'Minor star'], def: 0 },
      { k: 'angle', g: 'Star', label: 'Contact angle', min: 15, max: 85, step: 0.5, def: 67.5 },
      { k: 'offset', g: 'Star', label: 'Contact points', min: 0, max: 0.45, step: 0.01, def: 0,
        names: [[0, 'Single point'], [0.01, 'Two-point, close'], [0.16, 'Two-point'], [0.32, 'Two-point, wide']] },
      { k: 'style', g: 'Strapwork', label: 'Line style', type: 'select', options: STYLES, def: 0 },
      { k: 'band', g: 'Strapwork', label: 'Band width', min: 0.02, max: 0.2, step: 0.005, def: 0.075,
        names: [[0.02, 'Hairline'], [0.045, 'Fine'], [0.075, 'Strap'], [0.13, 'Broad']] },
      { k: 'interlace', g: 'Strapwork', label: 'Interlace', min: 0, max: 1, step: 0.01, def: 0.35,
        names: [[0, 'Flat'], [0.01, 'Woven'], [0.25, 'Woven, gapped'], [0.7, 'Open weave']] },
      { k: 'fill', g: 'Glaze', label: 'Fill', type: 'select', options: FILLS, def: 0 },
      { k: 'glaze', g: 'Glaze', label: 'Glaze', min: 0, max: 1, step: 0.01, def: 0.35,
        names: [[0, 'Even'], [0.12, 'Glazed'], [0.45, 'Hand-glazed'], [0.8, 'Kiln-mottled']] },
      { k: 'margin', g: 'Panel', label: 'Margin', min: 0, max: 0.12, step: 0.005, def: 0.05,
        names: [[0, 'Full bleed'], [0.005, 'Border'], [0.04, 'Panel'], [0.085, 'Wide mount']] },
      { k: 'construction', g: 'Panel', label: 'Construction', type: 'select', options: ['Hidden', 'Traced'], def: 0 },
    ],

    randomize(R) {
      for (let i = 0; i < 12; i++) R();   // sfc32 is seeded without warm-up; decorrelate nearby seeds
      const tiling = C.pickWeighted(R, [1.1, 1.1, 0.7, 2, 1.3, 2, 1.3]);
      const T = TILINGS[tiling];
      const angle = pickAngle(R, tiling);
      const offset = R() < 0.72 ? 0 : R.range(0.1, 0.36);
      const style = C.pickWeighted(R, [4.5, 2.5, 1.5, 0.9]);
      let repeat = T.n >= 8 ? R.range(1.5, 3.6) : T.n === 6 ? R.range(1.8, 4.6) : R.range(2.4, 5.5);
      if (style === 3) repeat = Math.min(repeat, T.n >= 8 ? 2.6 : 3.4);
      const band = style === 3 ? R.range(0.03, 0.08) : R.range(0.05, 0.1) * (T.n >= 8 ? 0.8 : 1);
      const interlace = R() < 0.18 ? 0 : R() < 0.5 ? R.range(0.02, 0.2) : R.range(0.25, 0.7);
      const fill = style === 3 ? C.pickWeighted(R, [3, 2, 0.3, 0.6, 0.5]) : C.pickWeighted(R, [4, 2.5, 1.5, 0.7, style === 2 ? 1.2 : 0.3]);
      const r = R();
      const margin = r < 0.25 ? 0 : r < 0.45 ? R.range(0.01, 0.03) : R.range(0.035, 0.085);
      return {
        tiling, angle, offset, style, repeat, band, interlace, fill, margin,
        centre: R() < 0.8 ? 0 : 1,
        glaze: R() < 0.15 ? 0 : R.range(0.15, 0.6),
        construction: R() < 0.12 ? 1 : 0,
      };
    },
    traitName(k, P) {
      if (k === 'tiling') { const T = TILINGS[P.tiling]; return `${T.name} ${T.conf}`; }
      if (k === 'angle') return `${starName(P)}, ${(+P.angle).toFixed(1).replace(/\.0$/, '')}°`;
      if (k === 'interlace' && P.style === 2 && P.interlace > 0) return 'Woven';
      if (k === 'interlace' && P.style === 3 && P.fill !== 4 && P.interlace > 0) return 'Flat (lines on glaze)';
      return null;
    },
    caption(P) {
      const T = TILINGS[P.tiling];
      const lines = ['woven strapwork', 'zellige strapwork', 'double-line strapwork', 'single-line work'][P.style];
      const weave = P.interlace === 0 ? (P.style === 3 ? '' : 'flat ') : '';
      return `${starName(P)}s from the ${T.name.toLowerCase()} tiling (${T.conf})${Math.abs(P.offset) >= 0.005 ? ', two-point' : ''}, in ${weave}${P.interlace === 0 && P.style < 3 ? lines.replace('woven ', '') : lines}, ${PALS[P.palette].name}.`;
    },
    sheet(P) {
      const T = TILINGS[P.tiling];
      return [
        ['Palette', PALS[P.palette].name],
        ['Format', C.FORMATS[P.format].label],
        ['Tiling', `${T.name} ${T.conf}`],
        ['Star', starName(P)],
        ['Contact angle', `${(+P.angle).toFixed(1).replace(/\.0$/, '')}°`],
        ['Contact points', C.traitName(this, 'offset', P)],
        ['Repeat', C.traitName(this, 'repeat', P)],
        ['Line style', STYLES[P.style]],
        ['Interlace', C.traitName(this, 'interlace', P)],
        ['Fill', FILLS[P.fill]],
        ['Glaze', C.traitName(this, 'glaze', P)],
        ['Panel', C.traitName(this, 'margin', P) + (P.construction ? ', traced' : '')],
      ];
    },

    setup() { return {}; },
    start(p, P, st) {
      const gk = geomKey(P), code = JSON.stringify(P);
      st.quick = !!(st.G && st.gk === gk) && code !== st.code;    // same params again = Replay
      st.code = code;
      if (st.gk !== gk) { st.gk = gk; st.G = null; st.gen = build(P); }
      st.P = P;
      st.tBuilt = st.G ? performance.now() : 0;
      st.final = null; st.painter = null; st.tPainted = 0;
      st.stage = 0;
    },
    frame(p, P, st) {
      const bud = C.budget(7);
      const ctx = p.drawingContext;
      const pd = p.pixelDensity();
      const Wd = Math.round(p.width * pd), Hd = Math.round(p.height * pd);
      const pal = PALS[P.palette];
      if (!st.G) {
        while (bud()) { const r = st.gen.next(); if (r.done) { st.G = r.value; st.tBuilt = performance.now(); break; } }
        if (!st.quick) {
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, Wd, Hd); ctx.restore();
        }
        st.stage = 0.1;
        if (!st.G) return true;
      }
      const G = st.G;
      if (!st.final) {
        st.final = document.createElement('canvas');
        st.final.width = Wd; st.final.height = Hd;
        st.painter = paint(st.final.getContext('2d'), Wd, Hd, G, P);
      }
      if (st.painter) {
        while (bud()) { if (st.painter.next().done) { st.painter = null; st.tPainted = performance.now(); break; } }
      }
      const blit = () => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(st.final, 0, 0); ctx.restore(); };
      if (st.quick) {
        if (st.painter) return true;
        blit();
        st.stage = 1;
        return false;
      }
      const now = performance.now();
      const tc = (now - st.tBuilt) / CONSTRUCT_MS;
      // construction: faint tiling, rays growing from the midpoints
      const k = Hd / 1000;
      ctx.save();
      ctx.setTransform(k, 0, 0, k, Wd / 2, Hd / 2);
      const PR = G.PR;
      ctx.fillStyle = pal.paper; ctx.fillRect(-PR.VW / 2 - 2, -502, PR.VW + 4, 1004);
      ctx.fillStyle = pal.ground; ctx.fillRect(PR.x0, PR.y0, PR.x1 - PR.x0, PR.y1 - PR.y0);
      ctx.beginPath(); ctx.rect(PR.x0, PR.y0, PR.x1 - PR.x0, PR.y1 - PR.y0); ctx.clip();
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35 * ease(tc * 3);
      ctx.strokeStyle = pal.con; ctx.lineWidth = 1.2 / k * pd;
      ctx.beginPath();
      const t = G.tiling;
      for (let i = 0; i < t.length; i += 4) { ctx.moveTo(t[i], t[i + 1]); ctx.lineTo(t[i + 2], t[i + 3]); }
      ctx.stroke();
      const g = ease((tc - 0.2) / 0.8);
      if (g > 0) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = lum(pal.ground) > 0.5 ? pal.line : pal.band;
        ctx.lineWidth = 1.5 / k * pd;
        ctx.beginPath();
        const r = G.rays;
        for (let i = 0; i < r.length; i += 4) { ctx.moveTo(r[i], r[i + 1]); ctx.lineTo(r[i] + (r[i + 2] - r[i]) * g, r[i + 1] + (r[i + 3] - r[i + 1]) * g); }
        ctx.stroke();
      }
      ctx.restore();
      st.stage = 0.1 + 0.6 * Math.min(1, tc);
      if (st.painter || tc < 1) return true;
      const tr = (now - Math.max(st.tPainted, st.tBuilt + CONSTRUCT_MS)) / REVEAL_MS;
      if (tr >= 1) { blit(); st.stage = 1; return false; }
      const e = ease(tr);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.arc(Wd / 2, Hd / 2, Math.hypot(Wd, Hd) * 0.5 * e + 1, 0, TAU);
      ctx.clip();
      ctx.drawImage(st.final, 0, 0);
      ctx.restore();
      st.stage = 0.7 + 0.3 * e;
      return true;
    },
    progress(st) { return st.stage || 0; },
    exportAt(p, P, W, H, st) {
      const G = (st && st.G && st.gk === geomKey(P)) ? st.G : drain(build(P));
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drain(paint(c.getContext('2d'), W, H, G, P));
      return c;
    },
  });

  MOD._test = { build, paint, drain };   // hooks for the test scripts only

  function pickAngle(R, tiling) {
    // canonical contact angles per tiling (Bonner's families where they exist), else a musical range
    const good = {
      0: [[67.5, 2], [60, 1.5], [72, 1], [30, 1.5], [22.5, 1]],
      1: [[60, 3], [67.5, 1.5], [45, 1.5], [75, 1], [22.5, 1]],
      2: [[30, 2], [40, 1.5], [72, 1], [80, 1]],
      3: [[67.5, 3], [45, 2], [72, 1], [56, 1], [30, 0.5]],
      4: [[60, 2], [75, 2], [45, 1.2], [67.5, 1]],
      5: [[60, 2.5], [75, 1.5], [67.5, 1.5], [45, 1], [52.5, 1]],
      6: [[60, 2.5], [45, 1.5], [67.5, 1], [72, 1], [36, 1]],
    }[tiling];
    if (R() < 0.75) return good[C.pickWeighted(R, good.map((g) => g[1]))][0];
    return R.range(22, 80);
  }
})();
