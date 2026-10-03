/* Circle Packing — random sequential adsorption or a front chain, inside a
   container, optionally nested. The twist: one focal point that every circle
   turns toward: eyes look at it, ring stacks lean into cones, halftone and
   glossy spheres are lit from it, and hard shadows fall away from it.        */
(function () {
  'use strict';
  const C = window.Cabinet;
  const VH = 1000;
  const TAU = Math.PI * 2;

  /* ---------------- palettes ---------------- */
  const PALETTES = [
    { name: 'Memphis', colors: ['#ff5c8a', '#18b0a0', '#ffc933', '#3b5bdb', '#b39ddb'], bg: '#f4eddd', ink: '#1a1a1a', light: '#fffaf0' },
    { name: 'Candy', colors: ['#ff6f9c', '#ffb0c8', '#63d2c6', '#ffd166', '#8f7cff', '#ff8c5a'], bg: '#fff3ec', ink: '#3b2448', light: '#ffffff' },
    { name: 'Neon', colors: ['#ff2d95', '#00dcff', '#f4ff3a', '#8b5cff', '#2bff88'], bg: '#0e0c1f', ink: '#07060f', light: '#f5f2ff' },
    { name: 'Matisse', colors: ['#2340a8', '#e8452c', '#f4b53a', '#1f7a4f', '#f08aa6'], bg: '#f3ede1', ink: '#17173a', light: '#fffdf6' },
    { name: 'Hanga', colors: ['#223a5e', '#c8452c', '#d9a441', '#6b7f6a', '#2b2622'], bg: '#ebe1cc', ink: '#1f1b17', light: '#f7f1e3' },
    { name: 'Terrazzo', colors: ['#d7796a', '#e9b8a1', '#6f8f84', '#2f3b3a', '#c9a45c', '#9aaab6'], bg: '#efe8df', ink: '#2a2a2a', light: '#fbf8f3' },
    { name: 'Reef', colors: ['#0f4c5c', '#e36414', '#fb8b24', '#5f0f40', '#7fb7be'], bg: '#f2eadf', ink: '#10232a', light: '#fffaf2' },
    { name: 'Bone & Ink', colors: ['#161616', '#161616', '#6e6960', '#b8b0a0'], bg: '#ebe5d8', ink: '#161616', light: '#f7f3ea' },
  ];

  const METHODS = ['Scattered', 'Front chain'];
  const GRADINGS = ['Apollonian', 'Power law', 'Bimodal', 'Noise field', 'Radial bloom'];
  const CONTAINERS = ['Frame', 'Tondo', 'Arcade', 'Hexagon', 'Lozenge', 'Eclipse'];
  const STYLES = ['Solid', 'Rings', 'Halftone', 'Hatched', 'Eyes', 'Glossy', 'Mixed'];
  const COLOURBY = ['Random', 'Size', 'Position', 'Noise'];

  /* ---------------- helpers ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixHex(a, b, t) {
    const A = rgb(a), B = rgb(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  }
  function lum(h) { const c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }

  // seeded 2D gradient noise, roughly 0..1
  function makeNoise(R) {
    const perm = new Uint16Array(512), base = [];
    for (let i = 0; i < 256; i++) base.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = base[i]; base[i] = base[j]; base[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    const gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const a = R() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      const h00 = perm[perm[X] + Y], h10 = perm[perm[X + 1] + Y], h01 = perm[perm[X] + Y + 1], h11 = perm[perm[X + 1] + Y + 1];
      const a = gx[h00] * xf + gy[h00] * yf, b = gx[h10] * (xf - 1) + gy[h10] * yf;
      const c = gx[h01] * xf + gy[h01] * (yf - 1), d = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
      const u = fade(xf), v = fade(yf), ab = a + u * (b - a), cd = c + u * (d - c);
      return ab + v * (cd - ab);
    }
    return (x, y) => clamp(0.5 + 0.9 * (n2(x, y) * 0.7 + n2(x * 2.03 + 17.3, y * 2.03 - 9.1) * 0.3), 0, 1);
  }

  /* ---------------- containers (signed distance, negative inside) ---------------- */
  function sdBox(px, py, bx, by) {
    const dx = Math.abs(px) - bx, dy = Math.abs(py) - by;
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  }
  function sdHex(px, py, r) { // flat top/bottom, apothem r (Inigo Quilez)
    const kx = -0.866025404, ky = 0.5, kz = 0.577350269;
    px = Math.abs(px); py = Math.abs(py);
    const d = 2 * Math.min(kx * px + ky * py, 0);
    px -= d * kx; py -= d * ky;
    px -= clamp(px, -kz * r, kz * r); py -= r;
    return Math.hypot(px, py) * Math.sign(py);
  }
  function sdRhombus(px, py, bx, by) {
    px = Math.abs(px); py = Math.abs(py);
    const h = clamp(((bx - 2 * px) * bx - (by - 2 * py) * by) / (bx * bx + by * by), -1, 1);
    const d = Math.hypot(px - 0.5 * bx * (1 - h), py - 0.5 * by * (1 + h));
    return d * Math.sign(px * by + py * bx - bx * by);
  }

  function makeContainer(kind, W, H, margin, focus, R) {
    const m = kind === 0 ? margin : Math.max(margin, 26);
    const x0 = m, y0 = m, x1 = W - m, y1 = H - m;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    const out = { bb: [x0, y0, x1, y1], voids: [] };
    if (kind === 1) {
      const r = Math.min(hw, hh);
      out.sdf = (x, y) => Math.hypot(x - cx, y - cy) - r;
      out.bb = [cx - r, cy - r, cx + r, cy + r];
    } else if (kind === 2) {
      const gap = Math.max(22, hh * 0.05);
      const n = Math.max(1, Math.round((2 * hw + gap) / (2 * hh * 0.62 + gap)));
      const aw = (2 * hw - (n - 1) * gap) / n / 2;
      const top = y0 + aw, midY = (top + y1) / 2, halfH = (y1 - top) / 2;
      const xs = []; for (let i = 0; i < n; i++) xs.push(x0 + aw + i * (2 * aw + gap));
      out.sdf = (x, y) => {
        let best = 1e9;
        for (let i = 0; i < n; i++) {
          const d = Math.min(sdBox(x - xs[i], y - midY, aw, halfH), Math.hypot(x - xs[i], y - top) - aw);
          if (d < best) best = d;
        }
        return best;
      };
      out.arches = n;
    } else if (kind === 3) {
      const rFlat = Math.min(hh, hw * 0.866), rPoint = Math.min(hw, hh * 0.866);
      if (rFlat >= rPoint) { out.sdf = (x, y) => sdHex(x - cx, y - cy, rFlat); out.bb = [cx - rFlat / 0.866, cy - rFlat, cx + rFlat / 0.866, cy + rFlat]; }
      else { out.sdf = (x, y) => sdHex(y - cy, x - cx, rPoint); out.bb = [cx - rPoint, cy - rPoint / 0.866, cx + rPoint, cy + rPoint / 0.866]; }
    } else if (kind === 4) {
      out.sdf = (x, y) => sdRhombus(x - cx, y - cy, hw, hh);
    } else if (kind === 5) {
      const vr = Math.min(hw, hh) * R.range(0.3, 0.44);
      const g = 16;
      const vx = clamp(focus.x, x0 + vr + g, x1 - vr - g), vy = clamp(focus.y, y0 + vr + g, y1 - vr - g);
      out.sdf = (x, y) => Math.max(sdBox(x - cx, y - cy, hw, hh), vr + g - Math.hypot(x - vx, y - vy));
      out.voids.push({ x: vx, y: vy, r: vr });
      out.crop = true;
      const vd = (x, y) => Math.hypot(x - vx, y - vy) - vr - g;
      out.room = (x, y) => (sdBox(x - cx, y - cy, hw, hh) > 0 ? -1 : vd(x, y));
      out.keep = (x, y, r, pad) => sdBox(x - cx, y - cy, hw, hh) < r * 0.6 && vd(x, y) >= r + pad;
    } else {
      out.sdf = (x, y) => sdBox(x - cx, y - cy, hw, hh);
      out.crop = true;
      out.room = (x, y) => (sdBox(x - cx, y - cy, hw, hh) > 0 ? -1 : 1e9);
      out.keep = (x, y, r) => sdBox(x - cx, y - cy, hw, hh) < r * 0.6;
    }
    if (!out.room) {
      const sdf = out.sdf;
      out.room = (x, y) => -sdf(x, y);
      out.keep = (x, y, r, pad) => sdf(x, y) <= -(r + pad);
    }
    return out;
  }

  /* ---------------- packers (generators; yield often so frame() can slice) ---------------- */
  // Random sequential adsorption: random candidate points, each circle grows to the
  // largest radius the spatial grid allows (capped by the grading).
  function* scatterPack(o, emit) {
    const [bx0, by0, bx1, by1] = o.bb, bw = bx1 - bx0, bh = by1 - by0;
    const g = clamp(Math.sqrt(o.minR * o.maxR) * 1.2, 5, 32);
    const nx = Math.max(1, Math.ceil(bw / g)), ny = Math.max(1, Math.ceil(bh / g));
    const cells = new Array(nx * ny);
    const xs = [], ys = [], rs = [], stamp = [];
    let q = 0, fails = 0, attempts = 0;
    const R = o.R, pad = o.pad, minR = o.minR;
    function avail(x, y, lim) {
      const cx = Math.floor((x - bx0) / g), cy = Math.floor((y - by0) / g);
      let best = lim; q++;
      const kmax = Math.max(nx, ny);
      for (let k = 0; k <= kmax; k++) {
        if ((k - 1) * g - pad >= best) break;
        const ya = cy - k, yb = cy + k;
        for (let j = ya; j <= yb; j++) {
          if (j < 0 || j >= ny) continue;
          const edge = j === ya || j === yb;
          for (let i = cx - k; i <= cx + k; i += edge ? 1 : 2 * k) {
            if (i >= 0 && i < nx) {
              const cell = cells[j * nx + i];
              if (cell) for (let n = 0; n < cell.length; n++) {
                const id = cell[n];
                if (stamp[id] === q) continue;
                stamp[id] = q;
                const d = Math.hypot(x - xs[id], y - ys[id]) - rs[id] - pad;
                if (d < best) { best = d; if (best < minR) return best; }
              }
            }
            if (k === 0) break;
          }
        }
      }
      return best;
    }
    function insert(x, y, r) {
      const id = xs.length;
      xs.push(x); ys.push(y); rs.push(r); stamp.push(0);
      const i0 = clamp(Math.floor((x - r - bx0) / g), 0, nx - 1), i1 = clamp(Math.floor((x + r - bx0) / g), 0, nx - 1);
      const j0 = clamp(Math.floor((y - r - by0) / g), 0, ny - 1), j1 = clamp(Math.floor((y + r - by0) / g), 0, ny - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        (cells[k] || (cells[k] = [])).push(id);
      }
    }
    for (const v of o.seeds || []) insert(v.x, v.y, v.r);
    while (fails < o.maxFail && attempts < o.maxAttempts && o.count() < o.maxCount) {
      for (let t = 0; t < 48; t++) {
        attempts++;
        const x = bx0 + R() * bw, y = by0 + R() * bh;
        const room = o.room(x, y) - pad;
        if (room < minR) { fails++; continue; }
        const lim = Math.min(room, o.cap(x, y));
        const r = Math.min(lim, avail(x, y, lim));
        if (r < minR) { fails++; continue; }
        insert(x, y, r);
        emit(x, y, r);
        fails = 0;
      }
      o.prog = Math.max(o.prog || 0, fails / o.maxFail);
      yield;
    }
  }

  // Front-chain packing (Wang et al. 2006, as in d3.packSiblings): every new circle is
  // placed tangent to two neighbours on the front, closest to the origin first.
  function* frontPack(o, emit) {
    const ox = o.origin.x, oy = o.origin.y, pad = o.pad, R = o.R;
    const ext2 = o.extent * o.extent;
    const radius = (lx, ly) => o.cap(lx + ox, ly + oy) + pad / 2;
    function place(b, a, c) {
      const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2) {
        let a2 = a.r + c.r, b2 = b.r + c.r; a2 *= a2; b2 *= b2;
        if (a2 > b2) {
          const x = (d2 + b2 - a2) / (2 * d2), y = Math.sqrt(Math.max(0, b2 / d2 - x * x));
          c.x = b.x - x * dx - y * dy; c.y = b.y - x * dy + y * dx;
        } else {
          const x = (d2 + a2 - b2) / (2 * d2), y = Math.sqrt(Math.max(0, a2 / d2 - x * x));
          c.x = a.x + x * dx - y * dy; c.y = a.y + x * dy + y * dx;
        }
      } else { c.x = a.x + c.r; c.y = a.y; }
    }
    const intersects = (a, b) => { const dr = a.r + b.r - 1e-6, dx = b.x - a.x, dy = b.y - a.y; return dr > 0 && dr * dr > dx * dx + dy * dy; };
    const score = (node) => {
      const a = node.c, b = node.next.c, ab = a.r + b.r;
      const dx = (a.x * b.r + b.x * a.r) / ab, dy = (a.y * b.r + b.y * a.r) / ab;
      return dx * dx + dy * dy;
    };
    const out = (c) => { if (!c.void && o.keep(c.x + ox, c.y + oy, c.r - pad / 2, pad)) emit(c.x + ox, c.y + oy, c.r - pad / 2); };
    const first = o.voidR ? { x: 0, y: 0, r: o.voidR + pad / 2 + 14, void: true } : { x: 0, y: 0, r: radius(0, 0) };
    const second = { x: 0, y: 0, r: radius(0, 0) };
    first.x = -second.r; second.x = first.r; second.y = 0;
    // re-centre when the first circle is a void so the void stays on the origin
    if (first.void) { second.x = first.r + second.r; first.x = 0; }
    const third = { x: 0, y: 0, r: radius(0, 0) };
    place(second, first, third);
    out(first); out(second); out(third);
    let a = { c: first }, b = { c: second }, c = { c: third };
    a.next = c.prev = b; b.next = a.prev = c; c.next = b.prev = a;
    let placed = 3, guard = 0, pendR = -1;
    while (placed < o.maxPlaced) {
      if (++guard % 24 === 0) { o.prog = Math.max(o.prog || 0, Math.sqrt(score(a)) / o.extent); yield; }
      // keep the pending radius across retries: the chain surgery on a hit assumes the
      // same circle is placed again between the new pair
      if (pendR < 0) pendR = radius((a.c.x + b.c.x) / 2, (a.c.y + b.c.y) / 2);
      const cc = { x: 0, y: 0, r: pendR };
      place(a.c, b.c, cc);
      const node = { c: cc };
      let j = b.next, k = a.prev, sj = b.c.r, sk = a.c.r, hit = false;
      do {
        if (sj <= sk) {
          if (intersects(j.c, cc)) { b = j; a.next = b; b.prev = a; hit = true; break; }
          sj += j.c.r; j = j.next;
        } else {
          if (intersects(k.c, cc)) { a = k; a.next = b; b.prev = a; hit = true; break; }
          sk += k.c.r; k = k.prev;
        }
      } while (j !== k.next);
      if (hit) continue;
      node.prev = a; node.next = b; a.next = b.prev = b = node;
      placed++; pendR = -1;
      out(cc);
      let best = score(a), n = node;
      while ((n = n.next) !== b) { const s = score(n); if (s < best) { a = n; best = s; } }
      b = a.next;
      if (best > ext2) break;
    }
    o.prog = 1;
  }

  /* ---------------- the whole piece ---------------- */
  function build(P) {
    const W = VH * C.FORMATS[P.format].a, H = VH;
    const R = C.rng(P.seed ^ 0x51f3);
    const noise = makeNoise(C.rng(P.seed ^ 0x2b7d));
    const pal = PALETTES[P.palette] || PALETTES[0];
    const focus = { x: W * R.range(0.15, 0.85), y: H * R.range(0.15, 0.85) };
    const cont = makeContainer(P.container, W, H, P.margin * VH, focus, R);
    if (cont.voids.length) { focus.x = cont.voids[0].x; focus.y = cont.voids[0].y; }
    const maxR = P.maxSize * VH, minR = Math.min(P.minSize * VH, maxR * 0.6);
    const flowA = R() * TAU, nScale = R.range(1.6, 3.2) / VH;
    const dither = R.range(0.1, 0.3);
    const S = {
      W, H, pal, focus, cont, P, circles: [], jobs: [], ji: 0, done: false, maxDepth: 0,
      noise, nScale, flowA, R,
    };
    const colsAll = pal.colors.map((c, i) => i);

    // Scatter: the cap is the grading's size draw; the disc grows up to it.
    // Front chain: sizes must vary smoothly in space or the chain leaves big holes,
    // so every grading becomes a field there (and a scatter pass fills the gaps after).
    const radialD = Math.hypot(Math.max(focus.x, W - focus.x), Math.max(focus.y, H - focus.y));
    const radialT = (x, y) => 1 - clamp(Math.hypot(x - focus.x, y - focus.y) / radialD, 0, 1);
    const noiseT = (x, y) => clamp((noise(x * nScale, y * nScale) - 0.22) / 0.56, 0, 1);
    function capFn(minR, maxR, R, front) {
      const span = Math.log(maxR / minR);
      const ex = (t) => minR * Math.exp(span * t);
      if (front) {
        switch (P.grading) {
          case 0: return (x, y) => ex(Math.pow(noiseT(x, y), 2.2) * R.range(0.9, 1));
          case 1: return (x, y) => ex(Math.pow(noiseT(x, y), 1.3) * Math.pow(R(), 0.8));
          case 2: return (x, y) => ex(noiseT(x, y) > 0.55 ? R.range(0.8, 1) : R.range(0, 0.15));
          case 3: return (x, y) => ex(Math.pow(noiseT(x, y), 1.4) * R.range(0.88, 1));
          default: return (x, y) => ex(Math.pow(radialT(x, y), 1.6) * R.range(0.88, 1));
        }
      }
      switch (P.grading) {
        case 0: return () => maxR;
        case 1: return () => ex(Math.pow(R(), 2.6));
        case 2: return () => (R() < 0.14 ? maxR * R.range(0.7, 1) : minR * R.range(1, 1.9));
        case 3: return (x, y) => ex(Math.pow(noiseT(x, y), 1.6) * R.range(0.85, 1));
        default: return (x, y) => ex(Math.pow(radialT(x, y), 1.7) * R.range(0.8, 1));
      }
    }

    function colourFor(x, y, r, jmin, jmax, exclude) {
      const list = exclude == null ? colsAll : colsAll.filter((i) => pal.colors[i] !== pal.colors[exclude]);
      const L = list.length ? list : colsAll;
      let t;
      switch (P.colourBy) {
        case 1: t = 1 - Math.log(r / jmin) / Math.log(jmax / jmin + 1e-9); break;
        case 2: t = ((x - W / 2) * Math.cos(flowA) + (y - H / 2) * Math.sin(flowA)) / (0.5 * Math.hypot(W, H)) * 0.5 + 0.5; break;
        case 3: t = noise(x * nScale * 1.3 + 40, y * nScale * 1.3 - 40); t = clamp((t - 0.2) / 0.6, 0, 1); break;
        default: return L[Math.floor(R() * L.length)];
      }
      t = clamp(t + (R() - 0.5) * dither, 0, 0.9999);
      return L[Math.floor(t * L.length)];
    }

    function styleFor(r) {
      if (P.style !== 6) return P.style;
      if (r < 7) return R() < 0.6 ? 0 : 1;
      return C.pickWeighted(R, [2, 3, 2, 1.2, 1.4, 1.6]);
    }

    function addJob(o) {
      o.R = C.rng((P.seed * 31 + S.jobs.length * 7919) ^ 0x7a11);
      o.front = P.method === 1 && !o.fill;
      o.cap = o.fill ? () => o.maxR : capFn(o.minR, o.maxR, o.R, o.front);
      o.count = () => S.circles.length;
      o.maxCount = 22000;
      o.out = [];
      const emit = (x, y, r) => {
        const c = { x, y, r, d: o.depth, col: colourFor(x, y, r, o.minR, o.maxR, o.parentCol), ground: o.ground, style: styleFor(r), nest: false };
        S.circles.push(c); o.out.push(c);
      };
      o.gen = (o.front ? frontPack : scatterPack)(o, emit);
      S.jobs.push(o);
      S.maxDepth = Math.max(S.maxDepth, o.depth);
    }

    // eclipse void: one big disc drawn in the chosen style, looking straight out
    for (const v of cont.voids) {
      S.circles.push({ x: v.x, y: v.y, r: v.r, d: 0, col: 0, ground: pal.bg, style: P.style === 6 ? 4 : P.style, nest: false, sun: true });
    }

    const density = P.density;
    const extentFull = Math.max(
      Math.hypot(cont.bb[0] - focus.x, cont.bb[1] - focus.y), Math.hypot(cont.bb[2] - focus.x, cont.bb[1] - focus.y),
      Math.hypot(cont.bb[0] - focus.x, cont.bb[3] - focus.y), Math.hypot(cont.bb[2] - focus.x, cont.bb[3] - focus.y)) + maxR;
    addJob({
      depth: 0, room: cont.room, keep: cont.keep, bb: cont.bb, minR, maxR, pad: P.padding, ground: pal.bg, parentCol: null,
      maxFail: Math.round(lerp(120, 9000, Math.pow(density, 2.2))), maxAttempts: 6e6,
      origin: focus, extent: lerp(0.3, 1, Math.pow(density, 0.8)) * extentFull, maxPlaced: 60000,
      voidR: cont.voids.length ? cont.voids[0].r : 0,
      seeds: cont.voids.map((v) => ({ x: v.x, y: v.y, r: v.r + 14 })),
    });

    S.onJobDone = (job) => {
      if (job.front) {
        // fill the chain's interstices and the ragged container edge
        addJob(Object.assign({}, job, {
          fill: true, gen: null, out: null, prog: 0, fillOf: job,
          maxR: job.maxR * 0.5, maxFail: Math.round(job.maxFail * 0.5), maxAttempts: job.maxAttempts * 0.5,
          seeds: job.out.map((c) => ({ x: c.x, y: c.y, r: c.r })).concat(job.seeds || []),
        }));
        return;
      }
      if (job.depth >= P.nesting) return;
      const pool = job.fillOf ? job.fillOf.out.concat(job.out) : job.out;
      const pmax = pool.reduce((m, c) => Math.max(m, c.r), 0);
      const minParent = Math.max(job.minR * 7, 26);
      const cand = pool.filter((c) => c.r >= minParent && c.r >= pmax * 0.42).sort((a, b) => b.r - a.r);
      const take = cand.slice(0, job.depth === 0 ? 40 : 14);
      for (const c of take) {
        c.nest = true;
        c.style = 0;
        const rim = Math.max(P.padding * 1.3, c.r * 0.07, 2.5);
        const rin = c.r - rim;
        const cmax = rin * lerp(0.46, 0.3, P.nesting / 3), cmin = Math.max(1.1, Math.min(minR * 0.8, cmax * 0.12));
        if (cmax < cmin * 1.6) continue;
        addJob({
          depth: job.depth + 1,
          room: (x, y) => rin - Math.hypot(x - c.x, y - c.y), keep: (x, y, r, pad) => Math.hypot(x - c.x, y - c.y) + r + pad <= rin, bb: [c.x - rin, c.y - rin, c.x + rin, c.y + rin],
          minR: cmin, maxR: cmax, pad: Math.max(0.6, P.padding * 0.6), ground: pal.colors[c.col], parentCol: c.col,
          maxFail: Math.round(lerp(120, 5000, Math.pow(density, 2))), maxAttempts: 1.5e6,
          origin: { x: c.x, y: c.y }, extent: rin + cmax, maxPlaced: 20000, voidR: 0, seeds: [],
          parent: c,
        });
      }
    };
    return S;
  }

  function stepAll(S, budget) {
    while (!S.done && budget()) {
      const job = S.jobs[S.ji];
      if (!job) { S.done = true; break; }
      if (job.gen.next().done) { S.onJobDone(job); S.ji++; }
    }
    return !S.done;
  }

  /* ---------------- drawing ---------------- */
  function drawShadow(ctx, S, c) {
    const P = S.P;
    const f = S.focus;
    let dx = c.x - f.x, dy = c.y - f.y, L = Math.hypot(dx, dy);
    if (Math.abs(P.gaze) < 0.08 || L < 1e-3) { dx = 0.6; dy = 0.8; L = 1; }
    const off = P.shadow * Math.min(3 + c.r * 0.16, 18);
    ctx.fillStyle = S.pal.ink;
    ctx.globalAlpha = S.pal.bg === '#0e0c1f' ? 0.9 : 1;
    ctx.beginPath(); ctx.arc(c.x + dx / L * off, c.y + dy / L * off, c.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function disc(ctx, x, y, r, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }

  function drawCircle(ctx, S, c) {
    const P = S.P, pal = S.pal;
    const col = pal.colors[c.col];
    const ground = c.ground;
    const f = S.focus;
    let gx = f.x - c.x, gy = f.y - c.y;
    const gl = Math.hypot(gx, gy) || 1;
    const gaze = c.sun ? 0 : P.gaze;
    gx = gx / gl * gaze; gy = gy / gl * gaze;
    const r = c.r;
    const ol = P.outline;
    let style = c.nest ? 0 : c.style;
    if ((r < 3.2 && style !== 0) || (r < 7 && (style === 2 || style === 3))) style = 0;
    switch (style) {
      case 1: { // rings: a stack of discs, each smaller one slid toward the focus (a cone from above)
        const n = Math.max(2, Math.round(r / 7.5));
        const other = lum(col) > 0.72 && lum(ground) > 0.72 ? pal.ink : ground;
        for (let k = 0; k < n; k++) {
          const rk = r * (1 - k / n), sh = (r - rk) * 0.82;
          disc(ctx, c.x + gx * sh, c.y + gy * sh, rk, k % 2 ? other : col);
        }
        break;
      }
      case 2: { // halftone sphere lit from the focus
        disc(ctx, c.x, c.y, r, ground === col ? pal.light : ground);
        const sp = clamp(r / 5.2, 3.2, 8.5);
        ctx.fillStyle = col;
        const lx = gx * 0.75, ly = gy * 0.75, lz = Math.sqrt(Math.max(0.05, 1 - lx * lx - ly * ly));
        const rows = Math.ceil(r / (sp * 0.866));
        ctx.beginPath();
        for (let j = -rows; j <= rows; j++) {
          const yy = j * sp * 0.866, off = (j & 1) ? sp / 2 : 0;
          const cols = Math.ceil(r / sp) + 1;
          for (let i = -cols; i <= cols; i++) {
            const xx = i * sp + off, d2 = xx * xx + yy * yy;
            if (d2 > r * r) continue;
            const nz = Math.sqrt(Math.max(0, 1 - d2 / (r * r)));
            const lam = clamp((xx / r) * lx + (yy / r) * ly + nz * lz, 0, 1);
            const dr = sp * 0.62 * Math.sqrt(clamp(1.05 - lam, 0.04, 1));
            const rr = Math.min(dr, r - Math.sqrt(d2));
            if (rr < 0.35) continue;
            ctx.moveTo(c.x + xx + rr, c.y + yy); ctx.arc(c.x + xx, c.y + yy, rr, 0, TAU);
          }
        }
        ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = clamp(r * 0.05, 0.8, 3);
        ctx.beginPath(); ctx.arc(c.x, c.y, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
        break;
      }
      case 3: { // hatched: tone-on-tone lines whose angle follows one current across the sheet
        disc(ctx, c.x, c.y, r, col);
        const dark = mixHex(col, pal.ink, lum(col) > 0.6 ? 0.55 : 0.5);
        const a = S.flowA + (S.noise(c.x * S.nScale * 0.7 + 90, c.y * S.nScale * 0.7) - 0.5) * 3.4;
        const sp = clamp(r / 6, 2.8, 7.5), lw = sp * 0.4;
        ctx.save();
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, TAU); ctx.clip();
        ctx.strokeStyle = dark; ctx.lineWidth = lw; ctx.lineCap = 'butt';
        const ca = Math.cos(a), sa = Math.sin(a);
        ctx.beginPath();
        for (let t = -r + sp * 0.5; t < r; t += sp) {
          const h = Math.sqrt(Math.max(0, r * r - t * t)) + 1;
          ctx.moveTo(c.x - sa * t - ca * h, c.y + ca * t - sa * h);
          ctx.lineTo(c.x - sa * t + ca * h, c.y + ca * t + sa * h);
        }
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = dark; ctx.lineWidth = clamp(r * 0.05, 0.8, 3);
        ctx.beginPath(); ctx.arc(c.x, c.y, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
        break;
      }
      case 4: { // eye: sclera, iris, pupil; everything looks at the focus
        disc(ctx, c.x, c.y, r, pal.light);
        const ir = r * 0.56, pr = r * 0.25;
        const ix = c.x + gx * (r - ir) * 0.92, iy = c.y + gy * (r - ir) * 0.92;
        disc(ctx, ix, iy, ir, col);
        if (r > 4.5) {
          disc(ctx, ix + gx * (ir - pr) * 0.5, iy + gy * (ir - pr) * 0.5, pr, pal.ink);
          if (r > 11) disc(ctx, ix + gx * (ir - pr) * 0.5 - pr * 0.38, iy + gy * (ir - pr) * 0.5 - pr * 0.42, pr * 0.3, pal.light);
        }
        ctx.strokeStyle = pal.ink; ctx.lineWidth = clamp(r * 0.07, 0.7, 3.5);
        ctx.beginPath(); ctx.arc(c.x, c.y, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
        break;
      }
      case 5: { // glossy sphere: highlight on the side facing the focus
        const hx = c.x + gx * r * 0.5, hy = c.y + gy * r * 0.5;
        const g = ctx.createRadialGradient(hx, hy, r * 0.04, c.x, c.y, r);
        g.addColorStop(0, mixHex(col, '#ffffff', 0.6));
        g.addColorStop(0.45, col);
        g.addColorStop(1, mixHex(col, '#000000', 0.38));
        disc(ctx, c.x, c.y, r, g);
        break;
      }
      default:
        disc(ctx, c.x, c.y, r, col);
    }
    if (ol > 0 && style !== 4) {
      ctx.strokeStyle = pal.ink; ctx.lineWidth = Math.min(ol, r * 0.3);
      ctx.beginPath(); ctx.arc(c.x, c.y, r - ctx.lineWidth / 2, 0, TAU); ctx.stroke();
    }
  }

  function drawRange(ctx, S, from, to) {
    const L = S.circles;
    if (S.P.shadow > 0) for (let i = from; i < to; i++) drawShadow(ctx, S, L[i]);
    for (let i = from; i < to; i++) drawCircle(ctx, S, L[i]);
  }

  function drawAll(ctx, s, S) {
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = S.pal.bg;
    ctx.fillRect(0, 0, S.W, S.H);
    const L = S.circles;
    if (S.cont.crop) { const b = S.cont.bb; ctx.beginPath(); ctx.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.clip(); }
    for (let d = 0; d <= S.maxDepth; d++) {
      if (S.P.shadow > 0) for (const c of L) if (c.d === d) drawShadow(ctx, S, c);
      for (const c of L) if (c.d === d) drawCircle(ctx, S, c);
    }
    ctx.restore();
  }

  /* ---------------- words ---------------- */
  const SIZE_NAMES = [[0, 'Granule'], [0.03, 'Pebble'], [0.075, 'Cobble'], [0.15, 'Boulder'], [0.24, 'Monolith']];
  const MIN_NAMES = [[0, 'Silt'], [0.003, 'Sand'], [0.006, 'Grit'], [0.011, 'Gravel']];
  const CONT_PHRASE = ['across the frame', 'into a tondo', 'into an arcade', 'into a hexagon', 'into a lozenge', 'around an eclipse'];
  function gazeWord(P) {
    const g = P.gaze;
    if (Math.abs(g) < 0.08) return 'level';
    return g > 0 ? (g > 0.55 ? 'fixed' : 'glancing') : (g < -0.55 ? 'averted' : 'looking away');
  }
  function surfacePhrase(P) {
    const g = P.gaze, on = g > 0.08, off = g < -0.08;
    switch (P.style) {
      case 1: return on || off ? `ring stacks leaning ${on ? 'into' : 'away from'} one point` : 'concentric ring targets';
      case 2: return on || off ? 'halftone spheres lit from one point' : 'halftone spheres';
      case 3: return 'hatched along one current';
      case 4: return on ? 'every eye on one point' : off ? 'every eye averted from one point' : 'eyes front';
      case 5: return on || off ? 'glossy spheres lit from one point' : 'glossy buttons';
      case 6: return on ? 'a mixed crowd, all turned to one point' : 'a mixed crowd';
      default: return P.shadow > 0.05 ? 'solid discs with hard shadows' : 'flat solid discs';
    }
  }

  C.register({
    id: 'circle-packing',
    name: 'Circle Packing',
    group: 'classic',
    order: 1,
    renderer: '2d',
    animated: true,
    restartDelay: 90,
    subtitle: 'Discs that turn to look',
    about: 'Circles are packed by random sequential adsorption (random points, each disc grown until it touches a neighbour) or by a front chain that sets each new disc tangent to two others, and big discs can be packed again inside. Size names follow the Wentworth grain scale; the twist is one focal point that every disc turns toward, so eyes stare, ring stacks lean into cones and spheres are lit from it.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 2, 1.3, 0.7],
    defaults: { seed: 4217, format: 0, palette: 0 },
    palettes: PALETTES,
    paletteOdds: [3, 2, 1.6, 2.4, 1.4, 1.1, 1.4, 0.9],
    params: [
      { k: 'method', g: 'Packing', label: 'Method', type: 'select', options: METHODS, def: 0 },
      { k: 'grading', g: 'Packing', label: 'Grading', type: 'select', options: GRADINGS, def: 0 },
      { k: 'maxSize', g: 'Packing', label: 'Largest', min: 0.02, max: 0.3, step: 0.005, def: 0.16, names: SIZE_NAMES },
      { k: 'minSize', g: 'Packing', label: 'Smallest', min: 0.0015, max: 0.02, step: 0.0005, def: 0.004, names: MIN_NAMES },
      { k: 'density', g: 'Packing', label: 'Density', min: 0, max: 1, step: 0.01, def: 0.85,
        names: [[0, 'Scattered'], [0.35, 'Settled'], [0.7, 'Packed'], [0.92, 'Jammed']] },
      { k: 'padding', g: 'Packing', label: 'Padding', min: 0, max: 10, step: 0.25, def: 3,
        names: [[0, 'Kissing'], [1.5, 'Close'], [4, 'Breathing'], [7, 'Spaced']] },
      { k: 'container', g: 'Container', label: 'Container', type: 'select', options: CONTAINERS, def: 1 },
      { k: 'nesting', g: 'Container', label: 'Nesting', min: 0, max: 3, step: 1, def: 1,
        names: [[0, 'Single'], [1, 'Nested'], [2, 'Double-nested'], [3, 'Matryoshka']] },
      { k: 'margin', g: 'Container', label: 'Margin', min: 0, max: 0.14, step: 0.005, def: 0.05,
        names: [[0, 'Bleed'], [0.015, 'Tight'], [0.045, 'Mounted'], [0.09, 'Floating']] },
      { k: 'style', g: 'Surface', label: 'Surface', type: 'select', options: STYLES, def: 4 },
      { k: 'colourBy', g: 'Surface', label: 'Colour by', type: 'select', options: COLOURBY, def: 1 },
      { k: 'gaze', g: 'Surface', label: 'Gaze', min: -1, max: 1, step: 0.01, def: 0.8,
        names: [[-1, 'Averted'], [-0.55, 'Looking away'], [-0.08, 'Level'], [0.08, 'Glancing'], [0.55, 'Fixed']] },
      { k: 'shadow', g: 'Surface', label: 'Shadow', min: 0, max: 1, step: 0.01, def: 0,
        names: [[0, 'None'], [0.05, 'Offset'], [0.45, 'Cast'], [0.8, 'Deep']] },
      { k: 'outline', g: 'Surface', label: 'Outline', min: 0, max: 4, step: 0.1, def: 0,
        names: [[0, 'None'], [0.1, 'Hairline'], [1.2, 'Inked'], [2.6, 'Heavy']] },
    ],

    randomize(R) {
      const o = {};
      o.method = R() < 0.62 ? 0 : 1;
      o.container = C.pickWeighted(R, [3, 2.2, 1.3, 1.2, 0.6, 1.8]);
      o.grading = C.pickWeighted(R, o.method === 1 ? [1.2, 1.4, 1.2, 2.2, 2] : [3.2, 1.2, 1.4, 2, 1.6]);
      o.nesting = C.pickWeighted(R, [4, 3.6, 1.6, 0.6]);
      o.style = C.pickWeighted(R, [1.6, 2, 1.4, 1.1, 1.7, 1.3, 1.8]);
      o.colourBy = C.pickWeighted(R, [3, 2.2, 1.8, 2]);
      o.maxSize = o.method === 1 ? R.range(0.04, 0.14) : R.range(0.07, 0.24);
      if (o.nesting > 0) o.maxSize = Math.max(o.maxSize, R.range(0.12, 0.26));
      o.minSize = o.method === 1 ? R.range(0.004, 0.011) : R.range(0.0025, 0.009);
      if (o.style === 2 || o.style === 3) { o.maxSize = Math.max(o.maxSize, R.range(0.13, 0.24)); o.minSize = Math.max(o.minSize, R.range(0.005, 0.009)); }
      if (o.container === 4) o.maxSize = Math.max(o.maxSize, R.range(0.12, 0.2));
      o.density = R() < 0.07 ? R.range(0.2, 0.5) : R.range(0.72, 1);
      if (o.density < 0.5) o.maxSize = Math.max(o.maxSize, R.range(0.14, 0.24));
      if (o.method === 1) o.density = R() < 0.15 ? R.range(0.5, 0.75) : 1;
      o.padding = R() < 0.18 ? R.range(0, 1) : R.range(1.5, 6);
      o.margin = o.container === 0 ? (R() < 0.35 ? 0 : R.range(0.03, 0.08)) : R.range(0.03, 0.08);
      const eyes = o.style === 4;
      o.gaze = eyes ? (R() < 0.85 ? R.range(0.5, 1) : R.range(-1, -0.4)) : R() < 0.25 ? 0 : (R() < 0.75 ? 1 : -1) * R.range(0.35, 0.95);
      o.shadow = R() < 0.6 ? 0 : R.range(0.3, 1);
      o.outline = R() < 0.55 ? 0 : R.range(0.8, 2.8);
      return o;
    },
    traitName() { return null; },
    caption(P) {
      const pal = PALETTES[P.palette].name;
      const grad = ['Apollonian', 'power-law', 'bimodal', 'noise-graded', 'radially graded'][P.grading];
      const meth = P.method === 1 ? 'front-chained' : 'scattered';
      const nest = ['', ', nested once', ', nested twice', ', nested three deep'][P.nesting];
      return `${pal} ${grad} circles ${meth} ${CONT_PHRASE[P.container]}${nest}: ${surfacePhrase(P)}.`;
    },
    sheet(P) {
      const t = (k) => C.traitName(C.byId['circle-packing'], k, P);
      return [
        ['Palette', t('palette')], ['Format', t('format')], ['Method', t('method')], ['Grading', t('grading')],
        ['Largest', t('maxSize')], ['Smallest', t('minSize')], ['Density', t('density')], ['Container', t('container')],
        ['Nesting', t('nesting')], ['Surface', t('style')], ['Colour by', t('colourBy')], ['Gaze', t('gaze')],
      ];
    },

    setup() { return {}; },
    start(p, P, st) {
      st.S = build(P);
      st.drawn = 0;
      st.fresh = true;
      st.key = C.encode(C.byId['circle-packing'], P);
    },
    frame(p, P, st) {
      const S = st.S;
      const s = p.width / S.W;
      const ctx = p.drawingContext;
      if (st.fresh) {
        ctx.save(); ctx.scale(s, s); ctx.fillStyle = S.pal.bg; ctx.fillRect(0, 0, S.W, S.H); ctx.restore();
        st.fresh = false;
      }
      const more = stepAll(S, C.budget(11));
      if (!more) { drawAll(ctx, s, S); st.drawn = S.circles.length; return false; }
      // incremental: redraw parents that just became nests, then the new discs
      ctx.save(); ctx.scale(s, s);
      if (S.cont.crop) { const b = S.cont.bb; ctx.beginPath(); ctx.rect(b[0], b[1], b[2] - b[0], b[3] - b[1]); ctx.clip(); }
      const L = S.circles;
      for (let i = 0; i < st.drawn; i++) if (L[i].nest && !L[i].nestDrawn) { drawCircle(ctx, S, L[i]); L[i].nestDrawn = true; }
      drawRange(ctx, S, st.drawn, L.length);
      ctx.restore();
      st.drawn = L.length;
      return true;
    },
    progress(st) {
      const S = st.S; if (!S) return 0;
      const nMain = S.P.method === 1 ? 2 : 1;
      const cur = S.jobs[S.ji], pm = cur ? (cur.prog || 0) : 1;
      if (S.ji < nMain) return ((S.ji + pm) / nMain) * 0.85;
      const kids = S.jobs.length - nMain, kd = S.ji - nMain;
      return 0.85 + 0.15 * (kids ? kd / kids : 1);
    },
    exportAt(p, P, W, H, st) {
      let S = st && st.S;
      if (!S || !S.done || st.key !== C.encode(C.byId['circle-packing'], P)) {
        S = build(P);
        while (stepAll(S, () => true));
      }
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawAll(c.getContext('2d'), W / S.W, S);
      return c;
    },
  });
})();
