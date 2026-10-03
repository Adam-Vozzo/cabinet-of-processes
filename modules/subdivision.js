/* Subdivision — recursive rectangle cuts, the Mondrian / Bauhaus / riso-zine classic.
   The twist is rhyme and print: every cut passes its motif down to its children, so
   sibling panels answer each other (arcs face across the cut, hatching turns a
   quarter, colours step), and the sheet can be printed flat, as a misregistered
   riso overprint, or as a collage of cut paper pieces with real shadows.            */
(function () {
  'use strict';
  const C = window.Cabinet;
  const VH = 1000;
  const TAU = Math.PI * 2;

  const PALETTES = [
    { name: 'De Stijl', colors: ['#d62b1f', '#1f3f99', '#f5c518', '#141414'], w: [3, 2.4, 2.4, 1], bg: '#f2efe6', ink: '#141414' },
    { name: 'Bauhaus', colors: ['#e2491f', '#1d4e89', '#f0b02e', '#252525', '#d9c7aa'], w: [3, 2.5, 2.5, 1.4, 1.6], bg: '#efe6d4', ink: '#1c1c1c' },
    { name: 'Memphis', colors: ['#ff5c8a', '#18b0a0', '#ffc933', '#3b5bdb', '#b39ddb', '#1a1a1a'], w: [3, 2.4, 2.6, 2, 1.6, 1], bg: '#f4eddd', ink: '#1a1a1a' },
    { name: 'Riso', colors: ['#ff48b0', '#0078bf', '#ffe800', '#00a95c', '#ff6c2f'], w: [3, 3, 2.2, 1.6, 1.4], bg: '#f6f1e7', ink: '#232347' },
    { name: 'Nordic', colors: ['#b86b4b', '#7f9c96', '#d9c5a3', '#4f5d68', '#e3b3a3', '#a7b59a'], w: [2, 2, 2, 1.4, 1.4, 1.2], bg: '#f1ece4', ink: '#2e3439' },
    { name: 'Newsprint', colors: ['#1b1b1b', '#6f6b64', '#bdb6a8', '#c8342b'], w: [3, 2, 2, 0.8], bg: '#e8e2d4', ink: '#1b1b1b' },
    { name: 'Siena', colors: ['#b5542d', '#e3a857', '#2f4b5a', '#8d9b7a', '#6b3a2e'], w: [3, 2.4, 2, 1.6, 1], bg: '#f3ebdd', ink: '#231a16' },
  ];

  const RATIOS = ['Halves', 'Thirds', 'Golden', 'Root two', 'Free', 'Mixed'];
  const MIXES = ['De Stijl', 'Bauhaus', 'Textile', 'Op', 'Cabinet'];
  const FRAMES = ['None', 'Keyline', 'Heavy', 'Double'];
  const PRINTS = ['Flat', 'Riso', 'Collage'];
  // fill kinds
  const F = { SOLID: 0, HATCH: 1, HALFTONE: 2, STRIPES: 3, SQUARES: 4, ARC: 5, RAINBOW: 6, GRADIENT: 7, GRID: 8, CHECKER: 9 };
  const MIX_W = [
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 0, 0.6, 0, 3.4, 2, 0.3, 0.7, 0],
    [1.6, 2.6, 1.6, 2.2, 0, 0, 0, 0, 0.6, 1.3],
    [0.6, 1.6, 0.5, 2.2, 2.6, 0.8, 1.8, 0, 1, 2],
    [2, 1.2, 1.2, 1.2, 1, 1.6, 1.1, 0.7, 0.8, 0.8],
  ];
  const FILL_NAMES = ['solid', 'hatching', 'halftone', 'stripes', 'nested squares', 'arcs', 'rainbows', 'gradients', 'grids', 'checks'];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rgbOf(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mixHex(a, b, t) { const A = rgbOf(a), B = rgbOf(b); return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`; }

  /* ============================== layout ============================== */
  function build(P) {
    const W = VH * C.FORMATS[P.format].a, H = VH;
    const R = C.rng(P.seed ^ 0x51f3);
    const pal = PALETTES[P.palette] || PALETTES[0];
    const m = P.margin * VH;
    const S = { W, H, P, pal, cells: [], cuts: [], root: [m, m, W - m, H - m] };
    const g = P.gutter;
    const minSide = Math.max(16, g * 1.6 + 10);
    const total = (W - 2 * m) * (H - 2 * m);
    const ratioOf = (kind) => {
      switch (kind) {
        case 0: return [0.5];
        case 1: return [1 / 3, 2 / 3];
        case 2: return [R() < 0.5 ? 0.382 : 0.618];
        case 3: return [R() < 0.5 ? 0.414 : 0.586];
        case 4: return [R.range(0.22, 0.78)];
        default: return ratioOf(C.pickWeighted(R, [2, 1.4, 2, 1, 0.6]));
      }
    };
    const op = P.mix === 3;
    const colW = pal.w.slice();
    const pickCol = (avoid) => {
      if (op) return R() < 0.8 ? -1 : pal.colors.length - 1;   // ink or a single accent
      let c = C.pickWeighted(R, colW);
      if (c === avoid && pal.colors.length > 1) c = C.pickWeighted(R, colW);
      if (c === avoid) c = (c + 1) % pal.colors.length;
      return c;
    };
    const newMotif = (depth) => {
      const kind = C.pickWeighted(R, MIX_W[P.mix]);
      return {
        kind, col: pickCol(-9), col2: R() < (P.print === 1 ? 0.55 : 0.3) && !op ? pickCol(-9) : -2,
        angle: [0, 1, 2, 3][C.pickWeighted(R, [1, 1.4, 1, 1.4])], corner: Math.floor(R() * 4), depth,
        face: R() < 0.72, hs: R() < 0.5 ? 1 : 0, vs: R() < 0.5 ? 1 : 0,
      };
    };
    // rhyme: a child keeps its parent's motif family, turned or re-coloured
    const echo = (mo, idx, n, dir) => {
      const o = Object.assign({}, mo);
      if (R() < 0.6) o.col = pickCol(mo.col);
      if (o.kind === F.HATCH || o.kind === F.STRIPES) o.angle = (mo.angle + (idx % 2 ? 2 : 0)) & 3;
      if (o.kind === F.ARC || o.kind === F.RAINBOW) {
        // siblings face each other across the cut (or turn their backs): anchor corners mirror
        let hs = mo.hs, vs = mo.vs;
        const near = (idx % 2 === 0) === mo.face ? 1 : 0;
        if (dir === 'v') hs = near; else vs = near;
        o.corner = [[0, 3], [1, 2]][hs][vs];
        o.hs = hs; o.vs = vs;
      }
      return o;
    };

    let order = 0;
    function split(x0, y0, x1, y1, depth, motif, sib) {
      const w = x1 - x0, h = y1 - y0;
      const area = w * h;
      const sizeF = clamp(1.35 - Math.sqrt(area / total) * 2.2, 0.12, 1);
      const stop = depth >= P.depth || Math.min(w, h) < minSide * 2 + g ||
        (depth >= 1 && R() < P.stop * sizeF) || (depth >= 2 && Math.min(w, h) < minSide * 2.6 && R() < 0.5);
      if (stop) {
        leaf(x0, y0, x1, y1, depth, motif, sib);
        return;
      }
      // direction: cut the long side, nudged by the bias
      const asp = Math.log(w / h);
      const pv = 1 / (1 + Math.exp(-(asp * 2.6 + P.bias * 3.2)));
      const dir = R() < pv ? 'v' : 'h';
      const span = dir === 'v' ? w : h;
      let rs = ratioOf(P.ratio);
      // keep children above the minimum
      rs = rs.filter((r) => r * span - g / 2 >= minSide && (1 - r) * span - g / 2 >= minSide);
      if (!rs.length) { leaf(x0, y0, x1, y1, depth, motif, sib); return; }
      const cutsAt = rs.map((r) => (dir === 'v' ? x0 : y0) + r * span);
      S.cuts.push({ dir, at: cutsAt, x0, y0, x1, y1, depth, order: order++ });
      const edges = [dir === 'v' ? x0 : y0].concat(cutsAt).concat([dir === 'v' ? x1 : y1]);
      const kids = edges.length - 1;
      for (let k = 0; k < kids; k++) {
        const a0 = edges[k] + (k > 0 ? g / 2 : 0), a1 = edges[k + 1] - (k < kids - 1 ? g / 2 : 0);
        const mo = R() < P.rhyme ? echo(motif, k, kids, dir) : newMotif(depth + 1);
        if (dir === 'v') split(a0, y0, a1, y1, depth + 1, mo, { dir, k, kids });
        else split(x0, a0, x1, a1, depth + 1, mo, { dir, k, kids });
      }
    }
    function leaf(x0, y0, x1, y1, depth, motif, sib) {
      const w = x1 - x0, h = y1 - y0;
      const c = { x: x0, y: y0, w, h, depth, order: order++, mo: Object.assign({}, motif) };
      // whitespace: big panels are more often left as paper
      // with drawn rules a big white panel is a Mondrian; without them it reads as a hole
      const bigness = Math.sqrt((w * h) / total);
      const ruled = P.weight > 3.5 || P.print === 2 || (P.mix === 0 && P.weight > 1.5);
      let blankP = clamp(P.blank * (ruled ? 0.75 + bigness * 1.6 : 1.15 - bigness * 2.4), 0, 0.95);
      if ((w * h) / total > 0.2) blankP = Math.min(blankP, 0.3);        // never leave most of the sheet empty
      c.blank = R() < blankP;
      if (!c.blank) {
        const mo = c.mo;
        const small = Math.min(w, h) < 60;
        if (small && (mo.kind === F.SQUARES || mo.kind === F.RAINBOW || mo.kind === F.GRID)) mo.kind = R() < 0.5 ? F.SOLID : F.HATCH;
        if (P.mix === 0) mo.kind = F.SOLID;
        if (mo.kind === F.GRID) { mo.gn = Math.max(2, Math.round(Math.min(w, h) / lerp(26, 60, R()))); mo.gdot = R() < 0.5; }
        if (mo.kind === F.ARC) mo.arc = w / h > 1.7 || h / w > 1.7 ? 'half' : R() < 0.35 ? 'full' : 'quarter';
      }
      c.jit = { a: (R() - 0.5) * 0.028, dx: (R() - 0.5) * 3, dy: (R() - 0.5) * 3 };
      S.cells.push(c);
    }
    split(S.root[0], S.root[1], S.root[2], S.root[3], 0, newMotif(0), null);
    // riso: each ink drum lands slightly off register
    S.reg = pal.colors.map(() => [R.range(-1, 1) * 2.2, R.range(-1, 1) * 2.2]);
    S.grain = [];
    if (P.print === 1) { const GR = C.rng(P.seed ^ 0x6a1); for (let i = 0; i < 9000; i++) S.grain.push(GR() * W, GR() * H, 0.25 + GR() * 0.55); }
    S.cells.forEach((c, i) => { c.rank = i / Math.max(1, S.cells.length - 1); });
    return S;
  }

  /* ============================== drawing ============================== */
  function drawCell(ctx, S, c) {
    const P = S.P, pal = S.pal, mo = c.mo;
    const ink = pal.ink, paper = pal.bg;
    const colOf = (i) => (i === -1 ? ink : i === -2 ? paper : pal.colors[i]);
    const riso = P.print === 1, collage = P.print === 2;
    const { x, y, w, h } = c;
    const pitch = P.pitch;
    ctx.save();
    if (collage) {
      const cx = x + w / 2, cy = y + h / 2;
      ctx.translate(cx + c.jit.dx, cy + c.jit.dy); ctx.rotate(c.jit.a); ctx.translate(-cx, -cy);
    }
    if (c.blank) {
      if (collage) paperPiece(ctx, S, c, paper);
      outline(ctx, S, c);
      ctx.restore();
      return;
    }
    const A = colOf(mo.col), B = colOf(mo.col2);
    const reg = (i) => (riso && i >= 0 ? S.reg[i] : [0, 0]);
    const ra = reg(mo.col), rb = reg(mo.col2);
    if (riso) ctx.globalCompositeOperation = 'multiply';
    // ground
    if (collage) paperPiece(ctx, S, c, mo.kind === F.SOLID ? A : B);
    else if (mo.kind !== F.SOLID && mo.col2 !== -2) { ctx.fillStyle = B; ctx.fillRect(x + rb[0], y + rb[1], w, h); }
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 0.3 + ra[0], y - 0.3 + ra[1], w + 0.6, h + 0.6); ctx.clip();
    ctx.translate(ra[0], ra[1]);
    ctx.fillStyle = A; ctx.strokeStyle = A;
    switch (mo.kind) {
      case F.HATCH: {
        const sp = pitch, a = [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4][mo.angle];
        ctx.lineWidth = sp * 0.38; ctx.lineCap = 'butt';
        linesAcross(ctx, x, y, w, h, a, sp);
        break;
      }
      case F.HALFTONE: {
        const sp = pitch * 1.05, a = [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4][mo.angle];
        const ca = Math.cos(a), sa = Math.sin(a), diag = Math.hypot(w, h);
        const cx = x + w / 2, cy = y + h / 2;
        ctx.beginPath();
        for (let j = -diag / 2; j <= diag / 2; j += sp * 0.866) {
          const off = (Math.round(j / (sp * 0.866)) & 1) ? sp / 2 : 0;
          for (let i = -diag / 2 + off; i <= diag / 2; i += sp) {
            const px = cx + i * ca - j * sa, py = cy + i * sa + j * ca;
            if (px < x - sp || px > x + w + sp || py < y - sp || py > y + h + sp) continue;
            const t = clamp((i + diag / 2) / diag, 0, 1);
            const r = sp * 0.5 * lerp(0.12, 1.02, t * t * (3 - 2 * t));
            ctx.moveTo(px + r, py); ctx.arc(px, py, r, 0, TAU);
          }
        }
        ctx.fill();
        break;
      }
      case F.STRIPES: {
        const sp = pitch * 2.2, vert = mo.angle & 1;
        ctx.beginPath();
        if (vert) for (let t = x; t < x + w; t += sp) ctx.rect(t, y, sp / 2, h);
        else for (let t = y; t < y + h; t += sp) ctx.rect(x, t, w, sp / 2);
        ctx.fill();
        break;
      }
      case F.SQUARES: {
        const st = pitch * 1.3;
        let k = 0;
        for (let i = 0; ; i++) {
          const ix = x + i * st, iy = y + i * st, iw = w - 2 * i * st, ih = h - 2 * i * st;
          if (iw <= 0 || ih <= 0) break;
          ctx.fillStyle = (k++ & 1) ? B : A;
          ctx.fillRect(ix, iy, iw, ih);
        }
        break;
      }
      case F.ARC: {
        const cr = mo.corner;
        const cx = cr === 1 || cr === 2 ? x + w : x, cy = cr >= 2 ? y + h : y;
        ctx.beginPath();
        if (mo.arc === 'full') { const r = Math.min(w, h) * 0.46; ctx.arc(x + w / 2, y + h / 2, r, 0, TAU); }
        else if (mo.arc === 'half') {
          if (w > h) { const r = Math.min(w / 2, h); const yy = cr >= 2 ? y + h : y; ctx.arc(x + w / 2, yy, r, 0, TAU); }
          else { const r = Math.min(h / 2, w); const xx = cr === 1 || cr === 2 ? x + w : x; ctx.arc(xx, y + h / 2, r, 0, TAU); }
        } else { const r = Math.min(w, h); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, 0, TAU); }
        ctx.fill();
        break;
      }
      case F.RAINBOW: {
        const cr = mo.corner;
        const cx = cr === 1 || cr === 2 ? x + w : x, cy = cr >= 2 ? y + h : y;
        const st = pitch * 1.6, rmax = Math.min(Math.hypot(w, h), Math.max(w, h));
        let k = 0;
        for (let r = rmax; r > st * 0.5; r -= st) {
          ctx.fillStyle = (k++ & 1) ? B : A;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
        }
        break;
      }
      case F.GRADIENT: {
        const a = [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4][mo.angle];
        const cx = x + w / 2, cy = y + h / 2, L = Math.hypot(w, h) / 2;
        const gr = ctx.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
        gr.addColorStop(0, A); gr.addColorStop(1, mo.col2 === -2 ? mixHex(A.startsWith('#') ? A : '#000000', paper, 0.85) : B);
        ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
        break;
      }
      case F.GRID: {
        const n = mo.gn, cw = w / Math.max(1, Math.round(n * w / Math.min(w, h))), ch = h / Math.max(1, Math.round(n * h / Math.min(w, h)));
        const gap = Math.min(cw, ch) * 0.16;
        ctx.beginPath();
        for (let yy = y; yy < y + h - 1; yy += ch) for (let xx = x; xx < x + w - 1; xx += cw) {
          if (mo.gdot) { const r = Math.min(cw, ch) / 2 - gap; ctx.moveTo(xx + cw / 2 + r, yy + ch / 2); ctx.arc(xx + cw / 2, yy + ch / 2, r, 0, TAU); }
          else ctx.rect(xx + gap, yy + gap, cw - 2 * gap, ch - 2 * gap);
        }
        ctx.fill();
        break;
      }
      case F.CHECKER: {
        const sq = pitch * 1.8;
        ctx.beginPath();
        for (let j = 0; y + j * sq < y + h; j++) for (let i = (j & 1); x + i * sq < x + w; i += 2) ctx.rect(x + i * sq, y + j * sq, sq, sq);
        ctx.fill();
        break;
      }
      default:
        if (!collage) ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    outline(ctx, S, c);
    ctx.restore();
  }

  function linesAcross(ctx, x, y, w, h, a, sp) {
    const cx = x + w / 2, cy = y + h / 2, L = Math.hypot(w, h) / 2 + sp;
    const ca = Math.cos(a), sa = Math.sin(a);
    ctx.beginPath();
    for (let t = -L; t <= L; t += sp) {
      ctx.moveTo(cx - sa * t - ca * L, cy + ca * t - sa * L);
      ctx.lineTo(cx - sa * t + ca * L, cy + ca * t + sa * L);
    }
    ctx.stroke();
  }

  function paperPiece(ctx, S, c, fill) {
    const T = ctx.getTransform(), k = Math.hypot(T.a, T.b);   // device px per unit (shadows ignore the transform)
    ctx.save();
    ctx.shadowColor = 'rgba(30,20,10,0.26)';
    ctx.shadowBlur = 6 * k; ctx.shadowOffsetX = 1.2 * k; ctx.shadowOffsetY = 2.6 * k;
    ctx.fillStyle = fill;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.restore();
  }

  function outline(ctx, S, c) {
    let lw = S.P.weight;
    if (lw <= 0.05 || S.P.print === 2) return;
    // when the rules of two neighbours meet across the gutter, overlap them by a pixel so no
    // anti-aliased seam of paper shows down the middle of the bar
    const g = S.P.gutter;
    if (g > 0 && lw >= g - 0.5) { const T = ctx.getTransform(); lw = Math.max(lw, g) + 1.5 / Math.hypot(T.a, T.b); }
    ctx.strokeStyle = S.pal.ink; ctx.lineWidth = lw; ctx.lineJoin = 'miter';
    ctx.strokeRect(c.x, c.y, c.w, c.h);
  }

  function drawFrame(ctx, S) {
    const P = S.P, [x0, y0, x1, y1] = S.root, ink = S.pal.ink;
    if (P.frame === 0) return;
    const pad = P.frame === 1 ? Math.max(8, P.gutter) : P.frame === 2 ? Math.max(0, P.gutter) : Math.max(10, P.gutter + 6);
    ctx.strokeStyle = ink;
    if (P.frame === 1) { ctx.lineWidth = 1.6; ctx.strokeRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad); }
    if (P.frame === 2) { const lw = Math.max(P.weight * 1.6, 9); ctx.lineWidth = lw; ctx.strokeRect(x0 - pad - lw / 2 + P.weight / 2, y0 - pad - lw / 2 + P.weight / 2, x1 - x0 + 2 * pad + lw - P.weight, y1 - y0 + 2 * pad + lw - P.weight); }
    if (P.frame === 3) {
      ctx.lineWidth = 3; ctx.strokeRect(x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad);
      ctx.lineWidth = 1.2; ctx.strokeRect(x0 - pad - 9, y0 - pad - 9, x1 - x0 + 2 * pad + 18, y1 - y0 + 2 * pad + 18);
    }
  }

  function drawAll(ctx, s, S, upto) {
    S.px = s;
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = S.pal.bg;
    ctx.fillRect(0, 0, S.W, S.H);
    const P = S.P;
    // the shared ground: with a gutter the paper shows; in De Stijl mode the lines are the grid
    const cells = upto == null ? S.cells : S.cells.filter((c) => c.rank <= upto);
    const list = P.print === 2 ? cells.slice().sort((a, b) => b.w * b.h - a.w * a.h) : cells;
    for (const c of list) drawCell(ctx, S, c);
    if (P.print === 1 && S.grain.length && upto == null) {
      ctx.fillStyle = S.pal.bg; ctx.globalAlpha = 0.38;
      ctx.beginPath();
      const gr = S.grain;
      for (let i = 0; i < gr.length; i += 3) { ctx.moveTo(gr[i] + gr[i + 2], gr[i + 1]); ctx.arc(gr[i], gr[i + 1], gr[i + 2], 0, TAU); }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawFrame(ctx, S);
    ctx.restore();
  }

  /* ============================== words ============================== */
  let memo = { key: '', S: null };
  function layout(P) {
    const key = JSON.stringify(P);
    if (memo.key !== key) memo = { key, S: build(P) };
    return memo.S;
  }
  function census(S) {
    const n = new Array(10).fill(0); let blank = 0, deepest = 0;
    for (const c of S.cells) { if (c.blank) blank++; else n[c.mo.kind]++; deepest = Math.max(deepest, c.depth); }
    const top = n.map((v, i) => [v, i]).filter((a) => a[0] > 0).sort((a, b) => b[0] - a[0]);
    return { n, blank, deepest, top };
  }

  C.register({
    id: 'subdivision',
    name: 'Subdivision',
    group: 'classic',
    order: 4,
    renderer: '2d',
    animated: true,
    restartDelay: 30,
    subtitle: 'Panels that rhyme',
    about: 'A sheet is cut in two (or three) again and again, each cut across the longer side unless the bias says otherwise, at halves, thirds, the golden section or the √2 of A-series paper. Each panel inherits its parent’s motif with a variation, so neighbours rhyme; the sheet can be printed flat, as a riso overprint with misregistered drums, or as a collage of cut paper.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 2, 1.4, 0.7],
    defaults: { seed: 1917, format: 0, palette: 0 },
    palettes: PALETTES.map((p) => ({ name: p.name, colors: p.colors, bg: p.bg, ink: p.ink, w: p.w })),
    paletteOdds: [2.4, 2.4, 2, 2, 1.6, 1.4, 1.6],
    params: [
      { k: 'depth', g: 'Cuts', label: 'Depth', min: 2, max: 12, step: 1, def: 6,
        names: [[2, 'Broadside'], [4, 'Paneled'], [7, 'Divided'], [10, 'Fine-cut']] },
      { k: 'stop', g: 'Cuts', label: 'Stop chance', min: 0, max: 0.9, step: 0.01, def: 0.46,
        names: [[0, 'Exhaustive'], [0.2, 'Even'], [0.45, 'Uneven'], [0.7, 'Lopsided']] },
      { k: 'bias', g: 'Cuts', label: 'Split bias', min: -1, max: 1, step: 0.01, def: 0,
        names: [[-1, 'Stacked'], [-0.45, 'Rows'], [-0.15, 'By aspect'], [0.15, 'Columns'], [0.55, 'Colonnade']] },
      { k: 'ratio', g: 'Cuts', label: 'Ratio', type: 'select', options: RATIOS, def: 5 },
      { k: 'gutter', g: 'Rhythm', label: 'Gutter', min: 0, max: 30, step: 0.5, def: 0,
        names: [[0, 'Butted'], [2, 'Hairline'], [7, 'Gutter'], [16, 'Wide']] },
      { k: 'weight', g: 'Rhythm', label: 'Line weight', min: 0, max: 16, step: 0.1, def: 8,
        names: [[0, 'None'], [0.1, 'Keyline'], [2.5, 'Rule'], [6, 'Bar'], [11, 'Beam']] },
      { k: 'frame', g: 'Rhythm', label: 'Frame', type: 'select', options: FRAMES, def: 2 },
      { k: 'margin', g: 'Rhythm', label: 'Margin', min: 0, max: 0.14, step: 0.005, def: 0.06,
        names: [[0, 'Bleed'], [0.015, 'Tight'], [0.045, 'Mounted'], [0.09, 'Floating']] },
      { k: 'mix', g: 'Surface', label: 'Fill mix', type: 'select', options: MIXES, def: 0 },
      { k: 'blank', g: 'Surface', label: 'Whitespace', min: 0, max: 0.9, step: 0.01, def: 0.55,
        names: [[0, 'Saturated'], [0.25, 'Busy'], [0.45, 'Airy'], [0.7, 'Sparse']] },
      { k: 'rhyme', g: 'Surface', label: 'Rhyme', min: 0, max: 1, step: 0.01, def: 0.6,
        names: [[0, 'Unrelated'], [0.3, 'Loose'], [0.6, 'Echoing'], [0.85, 'Strict']] },
      { k: 'pitch', g: 'Surface', label: 'Pitch', min: 3, max: 16, step: 0.5, def: 7,
        names: [[3, 'Fine'], [6, 'Medium'], [10, 'Coarse'], [13.5, 'Bold']] },
      { k: 'print', g: 'Surface', label: 'Print', type: 'select', options: PRINTS, def: 0 },
    ],

    randomize(R) {
      const o = {};
      o.mix = C.pickWeighted(R, [1.6, 2.2, 1.8, 1.2, 2.2]);
      o.print = C.pickWeighted(R, o.mix === 0 ? [4, 1, 1] : [2.4, 1.8, 1.2]);
      o.depth = o.mix === 0 ? R.int(4, 7) : R.int(4, 10);
      o.stop = o.mix === 0 ? R.range(0.3, 0.6) : R() < 0.2 ? R.range(0.05, 0.2) : R.range(0.2, 0.5);
      o.bias = R() < 0.6 ? R.range(-0.2, 0.2) : (R() < 0.5 ? -1 : 1) * R.range(0.3, 0.9);
      o.ratio = C.pickWeighted(R, [1.2, 1.2, 1.6, 0.8, 1, 2.4]);
      o.gutter = o.mix === 0 ? (R() < 0.8 ? 0 : R.range(4, 10)) : (R() < 0.35 ? 0 : R.range(3, 16));
      o.weight = o.mix === 0 ? R.range(5, 12) : (R() < 0.5 ? 0 : R() < 0.5 ? R.range(1, 3) : R.range(4, 9));
      if (o.print === 2) o.gutter = Math.max(o.gutter, R.range(6, 14));
      o.frame = o.mix === 0 ? C.pickWeighted(R, [1, 0.5, 3, 0.4]) : C.pickWeighted(R, [3, 1.2, 0.6, 0.8]);
      o.margin = R() < 0.15 ? 0 : R.range(0.035, 0.08);
      o.blank = o.mix === 0 ? R.range(0.35, 0.65) : R.range(0.06, 0.36);
      o.rhyme = R.range(0.35, 0.9);
      o.pitch = R.range(4, 11);
      return o;
    },
    traitName(k, P) {
      if (k === 'depth') { const S = layout(P); return `${S.cells.length} panels`; }
      return null;
    },
    caption(P) {
      const S = layout(P), cs = census(S);
      const pal = PALETTES[P.palette].name;
      const cut = ['halved', 'cut in thirds', 'cut at the golden section', 'cut at √2', 'cut freely', 'cut at mixed ratios'][P.ratio];
      const fills = P.mix === 0 ? 'flat colour' : cs.top.slice(0, 2).map((a) => FILL_NAMES[a[1]]).join(' and ');
      const print = ['', ', printed as a riso overprint', ', pasted up as a collage'][P.print];
      return `${pal}: ${S.cells.length} panels ${cut}, ${cs.deepest} cuts deep, in ${fills}${print}.`;
    },
    sheet(P) {
      const S = layout(P), cs = census(S);
      const m = C.byId.subdivision, t = (k) => C.traitName(m, k, P);
      return [
        ['Palette', t('palette')], ['Format', t('format')], ['Panels', String(S.cells.length)], ['Deepest cut', String(cs.deepest)],
        ['Ratio', t('ratio')], ['Split bias', t('bias')], ['Gutter', t('gutter')], ['Line weight', t('weight')],
        ['Fill mix', t('mix')], ['Whitespace', `${Math.round(100 * cs.blank / Math.max(1, S.cells.length))}% paper`],
        ['Rhyme', t('rhyme')], ['Print', t('print')],
      ];
    },

    setup() { return {}; },
    start(p, P, st) { st.S = layout(P); st.f = 0; st.N = 26; },
    frame(p, P, st) {
      st.f++;
      const t = st.f / st.N;
      drawAll(p.drawingContext, p.width / st.S.W, st.S, t >= 1 ? null : t * t * (3 - 2 * t));
      return t < 1;
    },
    progress(st) { return st.N ? st.f / st.N : 0; },
    exportAt(p, P, W, H) {
      const S = layout(P);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawAll(c.getContext('2d'), W / S.W, S);
      return c;
    },
  });
})();
