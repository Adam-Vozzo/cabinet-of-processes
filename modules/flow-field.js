/* Flow Field — evenly-spaced streamlines (Jobard & Lefer 1997) traced through noise and
   analytic fields, then inked like a print: tapered ink, hairline, stipple, dashes,
   colour bands, compass hues, or Tanaka's illuminated contours. The twist: every line
   knows which way it faces, so light from the north-west can swell or thin it into relief,
   and an optional second family of perpendicular lines (hachures, equipotentials)
   is overprinted on top. */
(function () {
  'use strict';
  const C = window.Cabinet;
  const VH = 1000;                 // virtual height; width = VH * aspect
  const TAU = Math.PI * 2;
  const SQ2 = Math.SQRT1_2;

  /* ---------------- colour ---------------- */
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const gam = (c) => { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, c)) * 255); };
  function oklab(hex) {
    const [r, g, b] = C.hex255(hex).map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function fromLab(L, A, B) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const r = gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
    const g = gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
    const b = gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
    return `rgb(${r},${g},${b})`;
  }
  // n colours sampled around a cyclic ramp through `hexes`, mixed in OKLab
  function cyclicRamp(hexes, n) {
    const labs = hexes.map(oklab), k = labs.length, out = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * k, a = Math.floor(t) % k, b = (a + 1) % k, f = t - Math.floor(t);
      const e = f * f * (3 - 2 * f);
      out.push(fromLab(labs[a][0] + (labs[b][0] - labs[a][0]) * e, labs[a][1] + (labs[b][1] - labs[a][1]) * e, labs[a][2] + (labs[b][2] - labs[a][2]) * e));
    }
    return out;
  }

  /* ---------------- seeded gradient noise ---------------- */
  function makeNoise(seed) {
    const R = C.rng(seed >>> 0);
    const perm = new Uint8Array(512), gx = new Float32Array(256), gy = new Float32Array(256), q = new Uint8Array(256);
    for (let i = 0; i < 256; i++) q[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = q[i]; q[i] = q[j]; q[j] = t; }
    for (let i = 0; i < 512; i++) perm[i] = q[i & 255];
    for (let i = 0; i < 256; i++) { const a = R() * TAU; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    function n2(x, y) {
      const xf = Math.floor(x), yf = Math.floor(y);
      const X = xf & 255, Y = yf & 255;
      x -= xf; y -= yf;
      const u = x * x * x * (x * (x * 6 - 15) + 10), v = y * y * y * (y * (y * 6 - 15) + 10);
      const A = perm[X] + Y, B = perm[X + 1] + Y;
      const aa = perm[A], ab = perm[A + 1], ba = perm[B], bb = perm[B + 1];
      const n00 = gx[aa] * x + gy[aa] * y, n10 = gx[ba] * (x - 1) + gy[ba] * y;
      const n01 = gx[ab] * x + gy[ab] * (y - 1), n11 = gx[bb] * (x - 1) + gy[bb] * (y - 1);
      const a0 = n00 + u * (n10 - n00), a1 = n01 + u * (n11 - n01);
      return (a0 + v * (a1 - a0)) * 1.414;
    }
    function fbm(x, y, oct) {
      let s = 0, a = 1, nrm = 0;
      for (let o = 0; o < oct; o++) { s += a * n2(x, y); nrm += a; x = x * 2.03 + 17.3; y = y * 2.03 - 9.1; a *= 0.5; }
      return s / nrm;
    }
    return { n2, fbm };
  }

  /* ---------------- fields ----------------
     Each field works in normalised units u,v (v in -1..1, y down) and writes a vector. */
  const FIELDS = ['Noise', 'Curl', 'Vortices', 'Dipoles', 'Waves'];

  function poleCount(P) { return P.field === 2 ? 2 + Math.round(P.scale * 6) : 1 + Math.round(P.scale * 4); }

  function buildField(P, aspect) {
    const R = C.rng((P.seed ^ 0x2f1e7) >>> 0);
    const N = makeNoise(P.seed ^ 0x9a13), W2 = makeNoise(P.seed ^ 0x3c77);
    const sc = P.scale, tb = P.turbulence;
    const wa = tb * 0.16, wf = 1.4 + tb * 1.2;       // domain warp for analytic fields
    const warp = (u, v, o) => {
      if (wa <= 0) { o[0] = u; o[1] = v; return; }
      o[0] = u + wa * W2.fbm(u * wf + 3.1, v * wf - 1.7, 2);
      o[1] = v + wa * W2.fbm(u * wf - 7.4, v * wf + 5.2, 2);
    };
    const tmp = [0, 0];
    const f = { fn: null, info: {} };
    switch (P.field) {
      case 0: { // classic noise angle field
        const fr = 0.45 * Math.pow(6, sc), oct = 1 + Math.round(tb * 3);
        const turns = 0.9 + tb * 0.9, base = R() * TAU;
        f.fn = (u, v, o) => {
          const a = base + N.fbm(u * fr, v * fr, oct) * Math.PI * 2 * turns;
          const m = 0.45 + 0.55 * (1 + W2.n2(u * fr * 0.8 + 31.7, v * fr * 0.8 - 7.3));
          o[0] = Math.cos(a) * m; o[1] = Math.sin(a) * m;
        };
        break;
      }
      case 1: { // curl of fbm: streamlines are contours of the noise
        const fr = 0.5 * Math.pow(5, sc), oct = 1 + Math.round(tb * 3), e = 0.0015;
        const ww = tb * 0.35;
        const psi = (u, v) => {
          let x = u * fr, y = v * fr;
          if (ww > 0) { const qx = W2.n2(x * 0.7 + 5.2, y * 0.7 + 1.3), qy = W2.n2(x * 0.7 - 3.8, y * 0.7 + 9.1); x += ww * qx; y += ww * qy; }
          return N.fbm(x, y, oct);
        };
        f.fn = (u, v, o) => {
          o[0] = (psi(u, v + e) - psi(u, v - e)) / (2 * e);
          o[1] = -(psi(u + e, v) - psi(u - e, v)) / (2 * e);
        };
        break;
      }
      case 2: { // point singularities: vortices, sinks, sources, spirals
        const K = poleCount(P);
        const pts = [];
        for (let i = 0; i < K; i++) {
          let best = null, bd = -1;
          for (let t = 0; t < 12; t++) {
            const x = (R() * 2 - 1) * aspect * 0.82, y = (R() * 2 - 1) * 0.82;
            let d = 9; for (const q of pts) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
            if (d > bd) { bd = d; best = { x, y }; }
          }
          const kind = R();
          const sgn = () => (R() < 0.5 ? -1 : 1);
          const m = 0.6 + 0.8 * R();
          if (kind < 0.45) { best.q = 0.12 * sgn() * m; best.g = sgn() * m; }        // vortex
          else if (kind < 0.75) { best.q = sgn() * m * 0.7; best.g = sgn() * m * 0.7; } // spiral
          else { best.q = sgn() * m; best.g = 0.15 * sgn() * m; }                    // source / sink
          pts.push(best);
        }
        const dr = R() * TAU, U = R() < 0.5 ? 0 : 0.35 + R() * 0.8;
        const ux = Math.cos(dr) * U, uy = Math.sin(dr) * U, e2 = 0.0005;
        const hole2 = Math.pow(Math.max(P.spacing * 1.5, 12) / 500, 2);
        f.info.pts = pts;
        f.fn = (u, v, o) => {
          warp(u, v, tmp); u = tmp[0]; v = tmp[1];
          let vx = ux, vy = uy;
          for (let i = 0; i < pts.length; i++) {
            const q = pts[i], dx = u - q.x, dy = v - q.y, r2 = dx * dx + dy * dy + e2;
            if (r2 < hole2) { o[0] = 0; o[1] = 0; return; }
            vx += (q.q * dx - q.g * dy) / r2; vy += (q.q * dy + q.g * dx) / r2;
          }
          o[0] = vx; o[1] = vy;
        };
        break;
      }
      case 3: { // magnetic dipoles
        const K = poleCount(P);
        const ds = [];
        for (let i = 0; i < K; i++) {
          let best = null, bd = -1;
          for (let t = 0; t < 12; t++) {
            const x = (R() * 2 - 1) * aspect * 0.7, y = (R() * 2 - 1) * 0.7;
            let d = 9; for (const q of ds) d = Math.min(d, Math.hypot(q.x - x, q.y - y));
            if (d > bd) { bd = d; best = { x, y }; }
          }
          const a = R() * TAU, m = 0.5 + R() * 0.7;
          best.mx = Math.cos(a) * m; best.my = Math.sin(a) * m;
          ds.push(best);
        }
        const b0a = R() * TAU, B0 = R() < 0.4 ? 0.15 + R() * 0.3 : 0;
        const bx = Math.cos(b0a) * B0, by = Math.sin(b0a) * B0;
        const hole2 = Math.pow(Math.max(P.spacing * 1.8, 16) / 500, 2);
        f.fn = (u, v, o) => {
          warp(u, v, tmp); u = tmp[0]; v = tmp[1];
          let vx = bx, vy = by;
          for (let i = 0; i < ds.length; i++) {
            const d = ds[i], dx = u - d.x, dy = v - d.y;
            const r2 = dx * dx + dy * dy + 0.0008, r = Math.sqrt(r2), r5 = r2 * r2 * r;
            if (r2 < hole2) { o[0] = 0; o[1] = 0; return; }
            const md = d.mx * dx + d.my * dy;
            vx += (3 * md * dx - d.mx * r2) / r5; vy += (3 * md * dy - d.my * r2) / r5;
          }
          o[0] = vx; o[1] = vy;
        };
        break;
      }
      default: { // waves: stream function = drift + sum of plane waves
        const nw = R.pick([2, 3, 3, 3, 4, 5]);
        const k = TAU * (0.9 + 3.6 * sc);
        const sym = R() < 0.65, th0 = R() * TAU;
        const ws = [];
        for (let i = 0; i < nw; i++) {
          const th = sym ? th0 + (i * Math.PI) / nw : R() * TAU;
          ws.push({ c: Math.cos(th) * k, s: Math.sin(th) * k, ph: R() * TAU, A: 0.7 + 0.6 * R() });
        }
        const beta = R() * TAU, U = R() < 0.4 ? 0 : k * (0.4 + R() * 1.4);
        const cb = Math.cos(beta) * U, sb = Math.sin(beta) * U;
        f.info.drift = U > 0;
        f.fn = (u, v, o) => {
          warp(u, v, tmp); u = tmp[0]; v = tmp[1];
          let vx = cb, vy = sb;
          for (let i = 0; i < ws.length; i++) {
            const w = ws[i], cs = w.A * Math.cos(w.c * u + w.s * v + w.ph);
            vx += cs * w.s; vy -= cs * w.c;
          }
          o[0] = vx; o[1] = vy;
        };
      }
    }
    // median field strength (for pressure)
    const o = [0, 0], mags = [];
    for (let i = 0; i < 17; i++) for (let j = 0; j < 17; j++) {
      f.fn(((i + 0.5) / 17 * 2 - 1) * aspect, (j + 0.5) / 17 * 2 - 1, o);
      mags.push(Math.hypot(o[0], o[1]));
    }
    mags.sort((a, b) => a - b);
    f.med = mags[mags.length >> 1] || 1;
    return f;
  }

  /* ---------------- evenly-spaced streamlines (Jobard & Lefer) ---------------- */
  function Family(opt) {
    const { dom, dsep, dtest, h, maxLen, field, perp, aspect, seed } = opt;
    const cx = (VH * aspect) / 2, cy = VH / 2, k = 1 / 500;
    const cell = dsep;
    const gx0 = dom.x0 - cell, gy0 = dom.y0 - cell;
    const cols = Math.ceil((dom.x1 - dom.x0) / cell) + 3, rows = Math.ceil((dom.y1 - dom.y0) / cell) + 3;
    const head = new Int32Array(cols * rows).fill(-1);
    let cap = Math.min(250000, Math.ceil((((dom.x1 - dom.x0) * (dom.y1 - dom.y0)) / dsep / h) * 1.1) + 4096);
    let X = new Float32Array(cap), Y = new Float32Array(cap), S = new Float32Array(cap), TH = new Float32Array(cap), SP = new Float32Array(cap);
    let LN = new Int32Array(cap), NX = new Int32Array(cap);
    let n = 0;
    const lines = [];
    const R = C.rng(seed >>> 0);
    const o = [0, 0];
    const minLen = Math.min(Math.max(3 * h, dsep * 1.1), maxLen * 0.45);
    const excl = Math.max(dtest * 2.2, 3 * h);
    const dt2 = dtest * dtest, ds2 = dsep * dsep * 0.97;
    const med = field.med;

    function grow() {
      const nc = cap * 2;
      const g = (A, T) => { const B = new T(nc); B.set(A); return B; };
      X = g(X, Float32Array); Y = g(Y, Float32Array); S = g(S, Float32Array); TH = g(TH, Float32Array); SP = g(SP, Float32Array);
      LN = g(LN, Int32Array); NX = g(NX, Int32Array); cap = nc;
    }
    const cellOf = (x, y) => {
      let i = Math.floor((x - gx0) / cell), j = Math.floor((y - gy0) / cell);
      if (i < 0) i = 0; else if (i >= cols) i = cols - 1;
      if (j < 0) j = 0; else if (j >= rows) j = rows - 1;
      return j * cols + i;
    };
    function add(x, y, s, th, sp, id) {
      if (n >= cap) grow();
      X[n] = x; Y[n] = y; S[n] = s; TH[n] = th; SP[n] = sp; LN[n] = id;
      const c = cellOf(x, y); NX[n] = head[c]; head[c] = n;
      return n++;
    }
    function popTo(m) { while (n > m) { n--; head[cellOf(X[n], Y[n])] = NX[n]; } }
    function near(x, y, r2, id, s) {
      const ci = Math.floor((x - gx0) / cell), cj = Math.floor((y - gy0) / cell);
      for (let j = cj - 1; j <= cj + 1; j++) {
        if (j < 0 || j >= rows) continue;
        for (let i = ci - 1; i <= ci + 1; i++) {
          if (i < 0 || i >= cols) continue;
          for (let q = head[j * cols + i]; q >= 0; q = NX[q]) {
            const dx = X[q] - x, dy = Y[q] - y;
            if (dx * dx + dy * dy < r2) {
              if (LN[q] === id && Math.abs(S[q] - s) < excl) continue;
              return true;
            }
          }
        }
      }
      return false;
    }
    // unit direction at (x,y) into dir[]; returns magnitude
    const dir = [0, 0];
    function at(x, y) {
      field.fn((x - cx) * k, (y - cy) * k, o);
      let vx = o[0], vy = o[1];
      if (perp) { const t = vx; vx = -vy; vy = t; }
      const m = Math.hypot(vx, vy);
      if (!(m > 1e-9)) return 0;
      dir[0] = vx / m; dir[1] = vy / m;
      return m;
    }
    const inside = (x, y) => x >= dom.x0 && x <= dom.x1 && y >= dom.y0 && y <= dom.y1;
    function clipT(x0, y0, x1, y1) {   // fraction along segment where it leaves the domain
      let t = 1;
      if (x1 < dom.x0) t = Math.min(t, (dom.x0 - x0) / (x1 - x0));
      if (x1 > dom.x1) t = Math.min(t, (dom.x1 - x0) / (x1 - x0));
      if (y1 < dom.y0) t = Math.min(t, (dom.y0 - y0) / (y1 - y0));
      if (y1 > dom.y1) t = Math.min(t, (dom.y1 - y0) / (y1 - y0));
      return Math.max(0, Math.min(1, t));
    }
    // integrate from the seed in one direction; returns [count, cut]
    function trace(x, y, sg, id, limit) {
      let s = 0, px = 0, py = 0, cnt = 0, cut = false, first = true;
      while (s < limit) {
        if (!at(x, y)) break;
        const ux = dir[0], uy = dir[1];
        if (!first && ux * px + uy * py < 0.3) break;       // singularity / cusp
        const mx = x + sg * ux * h * 0.5, my = y + sg * uy * h * 0.5;
        const m2 = at(mx, my);
        if (!m2) break;
        const wx = dir[0], wy = dir[1];
        if (wx * ux + wy * uy < 0.3) break;
        let nx = x + sg * wx * h, ny = y + sg * wy * h;
        const ns = s + h;
        if (!inside(nx, ny)) {
          const t = clipT(x, y, nx, ny);
          if (t > 0.05) {
            nx = x + (nx - x) * t; ny = y + (ny - y) * t;
            if (!near(nx, ny, dt2, id, sg * (s + h * t))) { add(nx, ny, sg * (s + h * t), Math.atan2(wy, wx), m2 / med, id); cnt++; cut = true; }
          } else cut = true;
          break;
        }
        if (near(nx, ny, dt2, id, sg * ns)) break;
        add(nx, ny, sg * ns, Math.atan2(wy, wx), m2 / med, id);
        cnt++;
        s = ns; x = nx; y = ny; px = wx; py = wy; first = false;
      }
      return [cnt, cut];
    }
    function tryLine(x, y, ph) {
      if (!inside(x, y) || near(x, y, ds2, -1, 0)) return false;
      const m0 = at(x, y);
      if (!m0) return false;
      const id = lines.length, start = n;
      add(x, y, 0, Math.atan2(dir[1], dir[0]), m0 / med, id);
      const [nf, cf] = trace(x, y, 1, id, maxLen * 0.5);
      const fl = nf ? Math.abs(S[n - 1]) : 0;
      const [nb, cb] = trace(x, y, -1, id, maxLen - fl);
      const bl = nb ? Math.abs(S[n - 1]) : 0;
      if (fl + bl < minLen) { popTo(start); return false; }
      // polyline order: backward end → seed → forward end
      const cnt = 1 + nf + nb;
      const xy = new Float32Array(cnt * 2), th = new Float32Array(cnt), sp = new Float32Array(cnt), sa = new Float32Array(cnt);
      let w = 0;
      for (let i = start + nf + nb; i > start + nf; i--) { xy[2 * w] = X[i]; xy[2 * w + 1] = Y[i]; th[w] = TH[i]; sp[w] = SP[i]; sa[w] = S[i] + bl; w++; }
      for (let i = start; i <= start + nf; i++) { xy[2 * w] = X[i]; xy[2 * w + 1] = Y[i]; th[w] = TH[i]; sp[w] = SP[i]; sa[w] = S[i] + bl; w++; }
      lines.push({ id, n: cnt, xy, th, sp, s: sa, len: fl + bl, cut0: cb, cut1: cf, mx: x, my: y, g: (ph || 0) - bl, prep: null });
      return true;
    }

    // seeding state machine
    let phase = 0, qi = 0, qk = 0, ci = 0, cands = null;
    const stride = Math.max(1, Math.round((dsep * 0.5) / h));
    function makeCands() {
      const nx = Math.ceil((dom.x1 - dom.x0) / dsep), ny = Math.ceil((dom.y1 - dom.y0) / dsep);
      cands = new Float32Array(nx * ny * 2);
      let m = 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        cands[m++] = dom.x0 + (i + 0.2 + 0.6 * R()) * dsep; cands[m++] = dom.y0 + (j + 0.2 + 0.6 * R()) * dsep;
      }
      for (let i = nx * ny - 1; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        let t = cands[2 * i]; cands[2 * i] = cands[2 * j]; cands[2 * j] = t;
        t = cands[2 * i + 1]; cands[2 * i + 1] = cands[2 * j + 1]; cands[2 * j + 1] = t;
      }
    }
    // do some work; returns true when finished
    function work(more) {
      while (more()) {
        if (phase === 0) {
          const x0 = (dom.x0 + dom.x1) / 2, y0 = (dom.y0 + dom.y1) / 2;
          for (let t = 0; t < 40 && !lines.length; t++) {
            tryLine(x0 + (R() - 0.5) * (dom.x1 - dom.x0) * 0.4, y0 + (R() - 0.5) * (dom.y1 - dom.y0) * 0.4);
          }
          phase = 1;
        } else if (phase === 1) {
          if (qi >= lines.length) { phase = 2; if (!cands) makeCands(); continue; }
          const L = lines[qi];
          for (let c = 0; c < 24 && qk < L.n; c++, qk += stride) {
            const x = L.xy[2 * qk], y = L.xy[2 * qk + 1], t = L.th[qk], g = L.s[qk] + L.g;
            const nx = -Math.sin(t) * dsep, ny = Math.cos(t) * dsep;
            tryLine(x + nx, y + ny, g);
            tryLine(x - nx, y - ny, g);
          }
          if (qk >= L.n) { qi++; qk = 0; }
        } else if (phase === 2) {
          const m = cands.length / 2;
          let found = false;
          while (ci < m && !found) {
            const x = cands[2 * ci], y = cands[2 * ci + 1]; ci++;
            if (tryLine(x, y)) found = true;
            if ((ci & 63) === 0 && !more()) break;
          }
          if (found) phase = 1;
          else if (ci >= m) { phase = 3; cands = null; return true; }
        } else return true;
      }
      return phase === 3;
    }
    return { lines, work, get done() { return phase === 3; } };
  }

  /* ---------------- palettes ---------------- */
  const PALETTES = [
    { name: 'Sumi', colors: ['#1c1b1a', '#6b645b', '#c23b22', '#efe9dc'], bg: '#efe9dc', inks: ['#1c1b1a', '#6b645b', '#c23b22'], mid: '#b8ae9c', lit: '#fbf7ee', dark: '#161514', blend: 'multiply' },
    { name: 'Cyanotype', colors: ['#123f6b', '#eef4f2', '#a9c9dc', '#6f9fc0'], bg: '#123f6b', inks: ['#eef4f2', '#a9c9dc', '#7fb0cf'], mid: '#2f6a9c', lit: '#f2f7f5', dark: '#061a31', blend: 'source-over' },
    { name: 'Risograph', colors: ['#0078bf', '#ff48b0', '#ffe800', '#f4efe4'], bg: '#f4efe4', inks: ['#0078bf', '#ff48b0', '#ffe800'], mid: '#ff9ccd', lit: '#fff9ef', dark: '#0068a8', blend: 'multiply' },
    { name: 'Blacklight', colors: ['#ff2e88', '#ffe23d', '#00e5ff', '#7cff4f', '#0b0a10'], bg: '#0b0a10', inks: ['#ff2e88', '#ffe23d', '#00e5ff', '#7cff4f'], mid: '#5b1fa8', lit: '#ffe23d', dark: '#07040d', blend: 'source-over' },
    { name: 'Synthwave', colors: ['#f72585', '#7209b7', '#4361ee', '#4cc9f0', '#12002b'], bg: '#12002b', inks: ['#f72585', '#4cc9f0', '#b5179e', '#4361ee', '#ffb3f0'], mid: '#7209b7', lit: '#4cc9f0', dark: '#0a0018', blend: 'source-over' },
    { name: 'Spectrum', colors: ['#ff2d55', '#ff8a00', '#ffd400', '#3ddc84', '#00b8d9', '#3d5afe', '#b04aff'], bg: '#0a0a0d', inks: ['#ff2d55', '#ff8a00', '#ffd400', '#3ddc84', '#00b8d9', '#3d5afe', '#b04aff'], mid: '#ff5a36', lit: '#ffe066', dark: '#1d0636', blend: 'source-over' },
    { name: 'Poster', colors: ['#e4322b', '#f6b90e', '#1f4aa8', '#151515', '#f2ead8'], bg: '#f2ead8', inks: ['#151515', '#e4322b', '#1f4aa8', '#f6b90e'], mid: '#e4322b', lit: '#f6ecd6', dark: '#151515', blend: 'multiply' },
    { name: 'Iron gall', colors: ['#2a2320', '#6b4a2f', '#8a2d1f', '#ece2cc'], bg: '#ece2cc', inks: ['#2a2320', '#7a5634', '#8a2d1f'], mid: '#a78d68', lit: '#f7efdc', dark: '#1e1714', blend: 'multiply' },
    { name: 'Chalk', colors: ['#f1efe6', '#f4b8c0', '#a8d8e0', '#26332e'], bg: '#26332e', inks: ['#f1efe6', '#f4b8c0', '#a8d8e0', '#f3de8a'], mid: '#3e5249', lit: '#f5f3ea', dark: '#0f1714', blend: 'source-over' },
  ];

  const STYLES = ['Ink', 'Hairline', 'Stipple', 'Dash', 'Bands', 'Compass', 'Tanaka'];
  const INKINGS = ['Mono', 'Zoned', 'Mixed'];

  /* ---------------- geometry from params ---------------- */
  function lengthOf(P) { return P.length >= 0.97 ? 1e9 : 14 * Math.pow(2, P.length * 8.2); }
  function geomKey(P) {
    return [P.seed, P.format, P.field, P.scale, P.turbulence, P.spacing, P.approach, P.length, P.cross, P.margin].join('|');
  }
  function makeGeom(P) {
    const aspect = C.FORMATS[P.format].a, W = VH * aspect;
    const field = buildField(P, aspect);
    const dsep = P.spacing;
    const m = P.margin * VH;
    const bleed = m < 1 ? dsep * 1.5 : 0;
    const dom = m < 1 ? { x0: -bleed, y0: -bleed, x1: W + bleed, y1: VH + bleed } : { x0: m, y0: m, x1: W - m, y1: VH - m };
    const h = Math.max(0.6, Math.min(2.5, dsep * 0.2));
    const fams = [Family({ dom, dsep, dtest: dsep * P.approach, h, maxLen: lengthOf(P), field, perp: false, aspect, seed: P.seed ^ 0x77a1 })];
    if (P.cross > 0.02) {
      const d2 = dsep * (1 + (1 - P.cross) * 3.2);
      const h2 = Math.max(0.6, Math.min(2.5, d2 * 0.2));
      fams.push(Family({ dom, dsep: d2, dtest: d2 * Math.max(0.5, P.approach), h: h2, maxLen: lengthOf(P), field, perp: true, aspect, seed: P.seed ^ 0x19c3 }));
    }
    const area = (dom.x1 - dom.x0) * (dom.y1 - dom.y0);
    let est = area / dsep;
    if (fams[1]) est += area / (dsep * (1 + (1 - P.cross) * 3.2));
    return { key: geomKey(P), fams, field, dom, W, est: est * 0.92, zone: makeNoise(P.seed ^ 0x5eed) };
  }
  function geomDone(G) { return G.fams.every((f) => f.done); }
  function geomWork(G, more) {
    for (const f of G.fams) { if (!f.done) { f.work(more); if (!f.done) return false; } }
    return true;
  }

  /* ---------------- look (per-line widths and colour runs) ---------------- */
  function makeLook(P) {
    const pal = PALETTES[P.palette] || PALETTES[0];
    const style = P.style;
    const dsep = P.spacing;
    let w0 = P.weight * dsep;
    if (style === 1) w0 = 0.45 + P.weight * 1.6;
    if (style === 2) w0 = dsep * (0.2 + 0.75 * P.weight);
    const ramp = cyclicRamp(pal.inks, 48);
    return { pal, style, w0, ramp, dsep, taper: P.taper, pressure: P.pressure, relief: P.relief, inking: P.inking };
  }
  function lineInk(G, L, fi, look, P) {
    const inks = look.pal.inks;
    if (fi === 1) return inks[1 % inks.length];
    if (look.inking === 0) return inks[0];
    const hsh = C.rng((L.id * 2654435761 + P.seed) >>> 0);
    if (look.inking === 2) { const r = hsh(); return r < 0.62 ? inks[0] : inks[1 + Math.floor(hsh() * (inks.length - 1))]; }
    return null;   // zoned: decided per point
  }
  function zoneInk(G, inks, x, y) {
    const z = 0.5 + 0.5 * G.zone.fbm(x / 420 + 3.3, y / 420 - 1.1, 2) * 1.3;
    const k = Math.min(inks.length, 4);
    return inks[Math.max(0, Math.min(k - 1, Math.floor(z * k)))];
  }
  // illumination from the NW for a line heading theta (normal = +90°)
  const illum = (th) => (Math.cos(th) - Math.sin(th)) * SQ2;

  function prepLine(G, L, fi, look, P) {
    const n = L.n, w = new Float32Array(n), cols = new Array(n);
    const len = L.len;
    const tl = look.taper <= 0.001 ? 0 : Math.min(len * 0.5, look.dsep * (1.5 + 30 * look.taper * look.taper)) * (0.35 + 0.65 * look.taper);
    const st = look.style;
    const base = fi === 1 ? look.w0 * 0.7 : look.w0;
    const ink = lineInk(G, L, fi, look, P);
    const nb = look.pal.inks.length;
    const bandLen = look.dsep * 2.6;
    const hsh = C.rng((L.id * 40503 + 7 + fi * 999) >>> 0);
    const boff = fi;
    for (let i = 0; i < n; i++) {
      const s = L.s[i];
      let f = 1;
      if (st !== 1 && tl > 0) {
        const a = L.cut0 ? 1 : Math.min(1, s / tl), b = L.cut1 ? 1 : Math.min(1, (len - s) / tl);
        const e = Math.min(a, b);
        f = Math.pow(Math.max(0, e), 0.7);
        f = 0.04 + 0.96 * f;
      }
      if (st !== 1) {
        if (look.pressure > 0) {
          const q = Math.max(0.3, Math.min(2.1, Math.sqrt(L.sp[i])));
          f *= 1 + (q - 1) * look.pressure;
        }
        const il = illum(L.th[i]);
        if (st === 6) {
          f *= (1 - Math.max(0.35, look.relief)) + Math.max(0.35, look.relief) * (0.1 + 1.25 * Math.abs(il));
        } else if (look.relief > 0) {
          const sh = (1 - il) * 0.5;
          f *= (1 - look.relief) + look.relief * (0.1 + 1.8 * sh);
        }
      }
      w[i] = base * f;
      if (st === 4) cols[i] = look.pal.inks[(((Math.floor((s + L.g) / bandLen) + boff) % nb) + nb) % nb];
      else if (st === 5) {
        const t = (((L.th[i] + (fi ? Math.PI / 2 : 0)) / TAU) % 1 + 1) % 1;
        cols[i] = look.ramp[Math.floor(t * 48) % 48];
      } else if (st === 6) cols[i] = illum(L.th[i]) >= 0 ? look.pal.lit : look.pal.dark;
      else cols[i] = ink || zoneInk(G, look.pal.inks, L.xy[2 * i], L.xy[2 * i + 1]);
    }
    // colour runs
    const runs = [];
    let r0 = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || cols[i] !== cols[r0]) { runs.push([r0, Math.min(n - 1, i), cols[r0]]); r0 = i; }
    }
    L.prep = { w, runs, ink: ink || cols[n >> 1], cols };
  }

  /* ---------------- drawing ---------------- */
  // filled outline of points i0..i1 with widths w (virtual units)
  function ribbon(ctx, xy, w, i0, i1, capA, capB) {
    if (i1 <= i0) return;
    ctx.beginPath();
    let px, py;
    const nrm = (i) => {
      const a = Math.max(i0, i - 1), b = Math.min(i1, i + 1);
      let dx = xy[2 * b] - xy[2 * a], dy = xy[2 * b + 1] - xy[2 * a + 1];
      const m = Math.hypot(dx, dy) || 1;
      px = -dy / m; py = dx / m;
    };
    for (let i = i0; i <= i1; i++) {
      nrm(i); const r = w[i] * 0.5;
      if (i === i0) ctx.moveTo(xy[2 * i] + px * r, xy[2 * i + 1] + py * r); else ctx.lineTo(xy[2 * i] + px * r, xy[2 * i + 1] + py * r);
    }
    if (capB) { nrm(i1); const r = w[i1] * 0.5, a = Math.atan2(py, px); ctx.arc(xy[2 * i1], xy[2 * i1 + 1], r, a, a - Math.PI, true); }
    for (let i = i1; i >= i0; i--) { nrm(i); const r = w[i] * 0.5; ctx.lineTo(xy[2 * i] - px * r, xy[2 * i + 1] - py * r); }
    if (capA) { nrm(i0); const r = w[i0] * 0.5, a = Math.atan2(-py, -px); ctx.arc(xy[2 * i0], xy[2 * i0 + 1], r, a, a - Math.PI, true); }
    ctx.closePath();
    ctx.fill();
  }

  function drawLine(ctx, L, look, scale) {
    const { w, runs } = L.prep;
    const xy = L.xy, st = look.style, n = L.n;
    const minW = 0.55 / scale;
    if (st === 1) {  // hairline: plain strokes
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(minW, w[0]);
      for (const [a, b, c] of runs) {
        ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(xy[2 * a], xy[2 * a + 1]);
        for (let i = a + 1; i <= b; i++) ctx.lineTo(xy[2 * i], xy[2 * i + 1]);
        ctx.stroke();
      }
      return;
    }
    if (st === 2) {  // stipple: evenly spaced dots, size follows width
      const gap = Math.max(look.dsep * 0.62, look.w0 * 1.45);
      let next = gap - ((((L.g % gap) + gap) % gap));
      const cols = L.prep.cols;
      let cur = null;
      for (let i = 0; i < n; i++) {
        if (L.s[i] >= next) {
          if (cols[i] !== cur) { if (cur) ctx.fill(); cur = cols[i]; ctx.fillStyle = cur; ctx.beginPath(); }
          const r = Math.max(minW * 0.6, w[i] * 0.5);
          ctx.moveTo(xy[2 * i] + r, xy[2 * i + 1]); ctx.arc(xy[2 * i], xy[2 * i + 1], r, 0, TAU);
          next += gap;
        }
      }
      if (cur) ctx.fill();
      return;
    }
    if (st === 3) {  // dashes: pieces of ribbon on a rhythm along the line
      const on = look.dsep * 1.7, off = look.dsep * 1.1, per = on + off;
      const ph = ((L.g % per) + per) % per;
      ctx.fillStyle = L.prep.ink;
      const ww = w.map((v) => Math.max(minW, v));
      let i = 0;
      while (i < n) {
        while (i < n && ((L.s[i] + ph) % per) >= on) i++;
        const a = i;
        while (i < n && ((L.s[i] + ph) % per) < on) i++;
        const b = Math.min(n - 1, i);
        if (b > a) { ctx.fillStyle = L.prep.cols[a]; ribbon(ctx, xy, ww, a, b, true, true); }
        i++;
      }
      return;
    }
    const tapered = look.taper > 0.001;
    const ww = w.map((v) => Math.max(minW, v));
    for (let r = 0; r < runs.length; r++) {
      const [a, b, c] = runs[r];
      ctx.fillStyle = c;
      const capA = r === 0 && !tapered && !L.cut0, capB = r === runs.length - 1 && !tapered && !L.cut1;
      ribbon(ctx, xy, ww, a, b, capA, capB);
    }
  }

  // paper; Tanaka's mid-tone ground is laid only inside the margin, like a printed panel
  function paintBg(ctx, look, G) {
    ctx.fillStyle = look.pal.bg;
    ctx.fillRect(0, 0, G.W, VH);
    if (look.style === 6) {
      const d = G.dom;
      ctx.fillStyle = look.pal.mid;
      ctx.fillRect(Math.max(0, d.x0), Math.max(0, d.y0), Math.min(G.W, d.x1) - Math.max(0, d.x0), Math.min(VH, d.y1) - Math.max(0, d.y0));
    }
  }
  function blendFor(look, fi) {
    if (look.style === 6) return 'source-over';
    const b = look.pal.blend;
    if (fi === 1 && b === 'source-over') return 'screen';
    return b;
  }

  function fullDraw(ctx, G, look, P, scale) {
    ctx.save();
    ctx.scale(scale, scale);
    paintBg(ctx, look, G);
    G.fams.forEach((f, fi) => {
      ctx.globalCompositeOperation = blendFor(look, fi);
      for (const L of f.lines) { if (!L.prep || L.prepKey !== look.key) { prepLine(G, L, fi, look, P); L.prepKey = look.key; } drawLine(ctx, L, look, scale); }
    });
    ctx.restore();
  }

  function lookKey(P) { return [P.style, P.weight, P.taper, P.pressure, P.relief, P.inking, P.palette].join('|'); }

  /* ---------------- names ---------------- */
  function scaleName(P) {
    if (P.field === 2) return `${poleCount(P)} cores`;
    if (P.field === 3) { const k = poleCount(P); return k === 1 ? 'Lone magnet' : `${k} magnets`; }
    if (P.field === 4) return C.nameFrom({ names: [[0, 'Long swell'], [0.3, 'Swell'], [0.6, 'Chop'], [0.85, 'Ripple']] }, P.scale);
    return C.nameFrom({ names: [[0, 'Continental'], [0.25, 'Rolling'], [0.55, 'Busy'], [0.8, 'Fine']] }, P.scale);
  }
  function crossName(P) {
    if (P.cross <= 0.02) return 'None';
    const amt = P.cross < 0.35 ? 'Sparse ' : P.cross > 0.8 ? 'Woven ' : '';
    const noun = P.field === 3 ? 'equipotentials' : P.field === 1 ? 'hachures' : P.field === 2 ? 'orthogonal net' : 'cross-hatching';
    const t = amt + noun;
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const SPACING_NAMES = [[0, 'Engraved'], [6, 'Close'], [10, 'Open'], [17, 'Wide']];
  const FIELD_WORDS = ['Noise-field', 'Curl-noise', 'Vortex', 'Dipole', 'Wave'];

  const PARAMS = [
    { k: 'field', g: 'Field', label: 'Field', type: 'select', options: FIELDS, def: 2 },
    { k: 'scale', g: 'Field', label: 'Scale', min: 0, max: 1, step: 0.01, def: 0.35 },
    { k: 'turbulence', g: 'Field', label: 'Turbulence', min: 0, max: 1, step: 0.01, def: 0.3, names: [[0, 'Laminar'], [0.2, 'Transitional'], [0.6, 'Turbulent']] },
    { k: 'spacing', g: 'Streamlines', label: 'Spacing', min: 3, max: 30, step: 0.5, def: 7, names: SPACING_NAMES },
    { k: 'approach', g: 'Streamlines', label: 'Approach', min: 0.2, max: 0.95, step: 0.01, def: 0.5, names: [[0.2, 'Converging'], [0.4, 'Even'], [0.7, 'Broken']] },
    { k: 'length', g: 'Streamlines', label: 'Length', min: 0, max: 1, step: 0.01, def: 0.8, names: [[0, 'Tufts'], [0.2, 'Strokes'], [0.45, 'Strands'], [0.7, 'Ribbons'], [0.97, 'Unbroken']] },
    { k: 'cross', g: 'Streamlines', label: 'Cross-field', min: 0, max: 1, step: 0.01, def: 0 },
    { k: 'style', g: 'Line', label: 'Style', type: 'select', options: STYLES, def: 0 },
    { k: 'weight', g: 'Line', label: 'Weight', min: 0.05, max: 0.8, step: 0.01, def: 0.4, names: [[0.05, 'Hair'], [0.15, 'Fine'], [0.28, 'Pen'], [0.45, 'Brush'], [0.62, 'Bold']] },
    { k: 'taper', g: 'Line', label: 'Taper', min: 0, max: 1, step: 0.01, def: 0.45, names: [[0, 'Blunt'], [0.08, 'Eased'], [0.35, 'Tapered'], [0.75, 'Needle']] },
    { k: 'pressure', g: 'Line', label: 'Pressure', min: 0, max: 1, step: 0.01, def: 0.3, names: [[0, 'Even'], [0.25, 'Pressed'], [0.65, 'Heavy-handed']] },
    { k: 'relief', g: 'Line', label: 'Relief', min: 0, max: 1, step: 0.01, def: 0.45, names: [[0, 'Flat'], [0.15, 'Low relief'], [0.45, 'Embossed'], [0.8, 'Deep relief']] },
    { k: 'inking', g: 'Print', label: 'Inking', type: 'select', options: INKINGS, def: 1 },
    { k: 'margin', g: 'Print', label: 'Margin', min: 0, max: 0.12, step: 0.005, def: 0.05, names: [[0, 'Full bleed'], [0.005, 'Hairline'], [0.03, 'Framed'], [0.08, 'Wide mat']] },
  ];

  C.register({
    id: 'flow-field',
    name: 'Flow Field',
    group: 'classic',
    order: 0,
    renderer: '2d',
    animated: true,
    restartDelay: 90,
    subtitle: 'Evenly-spaced streamlines',
    about: 'Streamlines are traced through a vector field and packed at an even distance, using Jobard and Lefer’s 1997 seeding method: each new line starts a fixed gap beside an old one and stops when it gets too close to another. Fields range from noise to vortices and magnetic dipoles; light from the north-west thickens lines on shadowed slopes, as in Tanaka’s illuminated contours, and a cross-field adds hachures or equipotentials at right angles.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 2, 1.5, 0.7],
    defaults: { seed: 31, format: 0, palette: 6 },
    palettes: PALETTES,
    paletteOdds: [2, 1.4, 1.6, 1.6, 1.3, 1.1, 1.2, 1, 0.8],
    params: PARAMS,

    randomize(R) {
      const field = C.pickWeighted(R, [2, 3.2, 2, 2, 1.8]);
      const style = C.pickWeighted(R, [4, 1.3, 1.1, 1, 1.4, 1.8, 1.6]);
      const spacing = style === 3 ? R.range(5, 10) : style === 2 ? R.range(6, 13) : R.chance(0.15) ? R.range(13, 24) : R.range(5, 11);
      const o = {
        field, style, spacing,
        scale: field >= 2 ? R.range(0.05, 0.85) : R.range(0.08, 0.7),
        turbulence: R.chance(0.3) ? R.range(0, 0.12) : R.range(0.15, 0.7),
        approach: (field === 0 || field === 1 || field === 4) && style !== 2 && R.chance(0.22) ? R.range(0.2, 0.35) : R.range(0.4, 0.62),
        length: R.chance(0.12) ? R.range(0.12, 0.4) : R.chance(0.35) ? 1 : R.range(0.55, 0.95),
        cross: (style <= 1 || style >= 5) && R.chance(0.25) ? R.range(0.3, 1) : 0,
        weight: style === 1 ? R.range(0.1, 0.5) : style === 3 ? R.range(0.3, 0.6) : style === 2 ? R.range(0.3, 0.65) : R.chance(0.2) ? R.range(0.5, 0.7) : R.range(0.18, 0.48),
        taper: R.chance(0.2) ? 0 : R.range(0.2, 0.9),
        pressure: R.chance(0.4) ? 0 : R.range(0.1, 0.7),
        relief: style === 6 ? R.range(0.5, 1) : R.chance(0.3) ? 0 : R.range(0.3, 0.9),
        inking: C.pickWeighted(R, [3, 2, 1.2]),
        margin: R.chance(0.3) ? 0 : R.range(0.03, 0.09),
      };
      o.palette = style === 5 ? R.pick([3, 4, 5, 5, 2, 8]) : C.pickWeighted(R, [2, 1.4, 1.6, 1.6, 1.3, 1.1, 1.2, 1, 0.8]);
      // loud multi-ink palettes read poorly as one ink
      const loud = o.palette === 3 || o.palette === 4 || o.palette === 5;
      if (loud && style <= 3) o.inking = 1;                 // loud multi-ink palettes read best in zones
      if ((style === 2 || style === 3) && o.length < 0.45) o.length = R.range(0.5, 1);
      if (style <= 3 && o.inking !== 0) o.cross = 0;           // overprint reads best over one ink
      if ((style === 4 || loud) && o.length < 0.55) o.length = R.range(0.6, 1);
      if (loud && style !== 1 && o.weight < 0.3) o.weight = R.range(0.3, 0.5);
      return o;
    },
    traitName(k, P) {
      if (k === 'scale') return scaleName(P);
      if (k === 'cross') return crossName(P);
      if (k === 'length' && P.length < 0.97) return `${C.nameFrom(PARAMS[5], P.length)} · ${Math.round(lengthOf(P))}`;
      if (k === 'spacing') return `${C.nameFrom({ names: SPACING_NAMES }, P.spacing)} · ${P.spacing}`;
      return null;
    },
    caption(P) {
      const pal = PALETTES[P.palette].name;
      const st = ['tapered ink', 'hairline', 'stipple', 'dashed line', 'colour bands', 'compass colour', 'Tanaka relief'][P.style];
      const len = P.length >= 0.97 ? 'unbroken' : C.nameFrom(PARAMS[5], P.length).toLowerCase();
      const cr = P.cross > 0.02 ? `, crossed by ${crossName(P).toLowerCase()}` : '';
      const ink = P.style <= 3 && P.inking === 1 ? ' in colour zones' : P.style <= 3 && P.inking === 2 ? ' with mixed inks' : '';
      return `${FIELD_WORDS[P.field]} streamlines, ${len}, in ${st} on ${pal}${ink}${cr}.`;
    },
    sheet(P) {
      return [
        ['Field', FIELDS[P.field]],
        ['Scale', scaleName(P)],
        ['Turbulence', C.nameFrom(PARAMS[2], P.turbulence)],
        ['Spacing', `${C.nameFrom({ names: SPACING_NAMES }, P.spacing)} (d_sep ${P.spacing})`],
        ['Approach', `${C.nameFrom(PARAMS[4], P.approach)} (d_test ${(P.approach * P.spacing).toFixed(1)})`],
        ['Length', P.length >= 0.97 ? 'Unbroken' : C.nameFrom(PARAMS[5], P.length)],
        ['Cross-field', crossName(P)],
        ['Style', STYLES[P.style]],
        ['Weight', C.nameFrom(PARAMS[8], P.weight)],
        ['Relief', C.nameFrom(PARAMS[11], P.relief)],
        ['Palette', PALETTES[P.palette].name],
        ['Margin', C.nameFrom(PARAMS[13], P.margin)],
      ];
    },

    setup() { return { G: null, look: null, drawn: [0, 0], lastP: null }; },
    start(p, P, st) {
      const key = geomKey(P);
      const same = st.lastP && JSON.stringify(st.lastP) === JSON.stringify(P);
      if (!st.G || st.G.key !== key) st.G = makeGeom(P);
      st.look = makeLook(P); st.look.key = lookKey(P);
      // a pure restyle of finished geometry redraws at once; anything else animates
      st.fast = !same && geomDone(st.G) && st.G.drawnOnce;
      st.drawn = [0, 0]; st.drawnLen = 0; st.t0 = performance.now(); st.cleared = false; st.finished = false;
      st.lastP = Object.assign({}, P);
    },
    frame(p, P, st) {
      const ctx = p.drawingContext, G = st.G, look = st.look;
      const scale = p.height / VH;
      const more = C.budget(11);
      if (!st.cleared) { ctx.save(); ctx.scale(scale, scale); paintBg(ctx, look, G); ctx.restore(); st.cleared = true; }
      const compute = C.budget(st.fast ? 0 : 7);
      const done = geomDone(G) || geomWork(G, compute);
      // reveal: time-based ink length, in creation order
      const T = 2400, el = performance.now() - st.t0;
      const total = done ? G.fams.reduce((a, f) => a + f.lines.reduce((b, L) => b + L.len, 0), 0) : G.est;
      const e = Math.min(1, el / T);
      const target = st.fast ? Infinity : total * (1 - Math.pow(1 - e, 2.2)) + (done && el > T ? Infinity : 0);
      ctx.save(); ctx.scale(scale, scale);
      let drew = true;
      outer:
      for (let fi = 0; fi < G.fams.length; fi++) {
        const f = G.fams[fi];
        ctx.globalCompositeOperation = blendFor(look, fi);
        while (st.drawn[fi] < f.lines.length) {
          if (st.drawnLen > target || !more()) { drew = false; break outer; }
          const L = f.lines[st.drawn[fi]];
          if (!L.prep || L.prepKey !== look.key) { prepLine(G, L, fi, look, P); L.prepKey = look.key; }
          drawLine(ctx, L, look, scale);
          st.drawnLen += L.len;
          st.drawn[fi]++;
        }
        if (!f.done) { drew = false; break; }
      }
      ctx.restore();
      const finished = done && drew && G.fams.every((f, fi) => st.drawn[fi] >= f.lines.length);
      if (finished) G.drawnOnce = true;
      st.prog = Math.min(0.99, st.drawnLen / Math.max(1, total));
      return !finished;
    },
    progress(st) { return st.prog || 0; },
    exportAt(p, P, W, H, st) {
      let G = st && st.G && st.G.key === geomKey(P) ? st.G : makeGeom(P);
      if (!geomDone(G)) geomWork(G, () => true);
      const look = makeLook(P); look.key = lookKey(P);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      fullDraw(ctx, G, look, P, H / VH);
      return c;
    },
  });
})();
