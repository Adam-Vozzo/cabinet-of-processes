/* Marbling — mathematical marbling after Jaffer & Lu ("Mathematical Marbling",
   IEEE CG&A 2012). Ink drops and stylus/comb strokes are all invertible maps of
   the bath, so each pixel walks the operation list backwards (newest → oldest)
   until it lands inside the drop that coloured it. */
(function () {
  const C = window.Cabinet;
  const MAXD = 240;  // drops   (3 RGB8 texels each, in a data texture; alpha stays 255)
  const MAXS = 16;   // strokes (3 vec4 each)
  const SHEET_MM = 240; // the canvas height stands for a 24 cm sheet (for comb pitch names)

  const PATTERNS = ['Stone', 'Gel-git', 'Nonpareil', 'Bouquet', 'Peacock', 'Chevron', 'French curl', 'Suminagashi'];
  const P_STONE = 0, P_GELGIT = 1, P_NONP = 2, P_BOUQ = 3, P_PEAC = 4, P_CHEV = 5, P_CURL = 6, P_SUMI = 7;

  /* ground: the first colour, sprinkled until it covers the whole bath (it survives as the veins);
     inks: the colours dropped into it; sumi: the ring colour for suminagashi. */
  const PALETTES = [
    { name: 'Ebru', ground: '#1d2440', inks: ['#c38f2c', '#9a2d27', '#2d5b57', '#dccaa0', '#5f86ab'], sumi: '#1d2440', paper: '#efe4cc' },
    { name: 'Florentine', ground: '#17120e', inks: ['#8a1c19', '#c99a3a', '#223f78', '#e6d6ad', '#4b6636'], sumi: '#17120e', paper: '#f1e6cf' },
    { name: 'Venetian', ground: '#2b1f19', inks: ['#b0522b', '#2c6b6f', '#d6ae62', '#e9dcc1', '#763a50'], sumi: '#2b1f19', paper: '#f2e9d6' },
    { name: 'Old Dutch', ground: '#ece2cc', inks: ['#c23a2b', '#eec21c', '#2b6aa6', '#3b7b45', '#1b1d3a'], sumi: '#1b1d3a', paper: '#f3ede0' },
    { name: 'Indigo', ground: '#eef0f0', inks: ['#0c1430', '#1e3d78', '#3f6db2', '#90b2da', '#15254e'], sumi: '#15254e', paper: '#f1eee7' },
    { name: 'Suminagashi', ground: '#f4f0e6', inks: ['#3b3b3b', '#1f3159', '#8b2a23', '#6d6d6d', '#262626'], sumi: '#151515', paper: '#f4f0e6' },
    { name: 'Acid Bath', ground: '#0a0a0a', inks: ['#ff2d87', '#c4f000', '#00c8f5', '#ffae00', '#7b2dff'], sumi: '#0a0a0a', paper: '#f6f3ec' },
    { name: 'Riso', ground: '#f2ece0', inks: ['#1f22a0', '#ff4fae', '#ffe23a', '#00a767', '#ff6a2f'], sumi: '#1f22a0', paper: '#f4eee2' },
  ];

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hexRGB = C.hexRGB;

  /* ------------------------------------------------------------------ shader */
  const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform vec2 uOff;
uniform float uAspect;
uniform sampler2D uDropTex;
uniform int uDropN;
uniform vec4 uSA[${MAXS}];
uniform vec4 uSB[${MAXS}];
uniform vec4 uSC[${MAXS}];
uniform int uSN;
uniform vec3 uInk[6];
uniform vec3 uPaper;
uniform vec3 uGround;
uniform float uVeins;
uniform float uRimW;
uniform float uMottle;
uniform float uSumi;
uniform vec4 uRock;     // amp, freq, angle, shade
uniform float uSheet;
uniform float uSeedOff;
${C.GLSL_NOISE}

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// Walk the operation list backwards. Returns ink index (-1 none), tone, radial position t in the drop, and
// the position inside the drop's own frame (pf) for advected pigment texture.
void resolve(vec2 p, out float idx, out float tone, out float t, out vec2 pf) {
  for (int i = 0; i < ${MAXS}; i++) {
    if (i >= uSN) break;
    int j = uSN - 1 - i;
    vec4 A = uSA[j]; vec4 B = uSB[j]; vec4 W = uSC[j];
    int kind = int(B.x + 0.5);
    if (kind <= 2) {
      // tine line / comb (kind 1: rake, all tines one way; kind 2: back-and-forth passes)
      vec2 m = vec2(cos(A.z), sin(A.z)); vec2 n = vec2(-m.y, m.x);
      vec2 b = A.xy;
      if (W.x > 0.0) p += n * W.x * sin(W.y * dot(p - b, m) + W.z);        // wavy comb: conjugate by a sine shear
      float u = dot(p - b, n);
      float s = A.w, al = B.y, lam = B.z;
      float d, sg = 1.0, g;
      if (s > 0.0) { float k = floor(u / s + 0.5); d = abs(u - k * s); if (kind == 2) sg = mod(k, 2.0) < 0.5 ? 1.0 : -1.0; }
      else d = abs(u);
      if (kind == 2) { float e = lam / (0.5 * s + lam); g = max(lam / (d + lam) - e, 0.0) / (1.0 - e); }
      else g = lam / (d + lam);
      p -= m * al * sg * g;
      if (W.x > 0.0) p -= n * W.x * sin(W.y * dot(p - b, m) + W.z);
    } else if (kind == 4) {
      // single vortex: rotation whose angle depends only on radius
      vec2 q = p - A.xy; float r2 = dot(q, q);
      p = A.xy + rot(q, -B.y * exp(-r2 / (A.z * A.z)));
    } else if (kind == 5) {
      // sinusoidal shear (a breath across the bath)
      vec2 m = vec2(cos(A.z), sin(A.z)); vec2 n = vec2(-m.y, m.x);
      p -= m * B.y * sin(B.z * dot(p, n) + B.w);
    } else if (kind == 6) {
      // lattice of curls: rotation about the nearest lattice point, compact support (radius < half spacing)
      float s = A.z;
      vec2 q = rot(p - A.xy, -A.w);
      float row = floor(q.y / s + 0.5);
      q.x -= mod(row, 2.0) * W.x * s;
      vec2 k = floor(q / s + 0.5);
      vec2 c = k * s;
      vec2 dq = q - c; float r = length(dq);
      float R = B.z * s;
      if (r < R) {
        float f = 1.0 - r / R; f = f * f * (3.0 - 2.0 * f);
        float dir = (B.w > 0.5 && mod(k.x + k.y, 2.0) > 0.5) ? -1.0 : 1.0;
        dq = rot(dq, -dir * B.y * f * f);
        q = c + dq;
        q.x += mod(row, 2.0) * W.x * s;
        p = A.xy + rot(q, A.w);
      }
    }
  }
  idx = -2.0; tone = 0.5; t = 0.0;
  for (int i = 0; i < ${MAXD}; i++) {
    if (i >= uDropN) break;
    int j = uDropN - 1 - i;
    vec3 a = floor(texelFetch(uDropTex, ivec2(3 * j, 0), 0).rgb * 255.0 + 0.5);
    vec3 b = floor(texelFetch(uDropTex, ivec2(3 * j + 1, 0), 0).rgb * 255.0 + 0.5);
    vec2 c = vec2(a.r * 256.0 + a.g, a.b * 256.0 + b.r) * (4.0 / 65535.0) - 1.0;
    float r = (b.g * 256.0 + b.b) * (0.5 / 65535.0);
    vec2 q = p - c; float d2 = dot(q, q); float r2 = r * r;
    if (d2 < r2) {
      vec3 e = floor(texelFetch(uDropTex, ivec2(3 * j + 2, 0), 0).rgb * 255.0 + 0.5);
      idx = e.r > 254.5 ? -1.0 : e.r; tone = e.g / 255.0; t = sqrt(d2) / r; pf = q / r + c * 3.1; return;
    }
    p = c + q * sqrt(1.0 - r2 / d2);
  }
  pf = p;
}

vec3 inkAt(int i) {
  vec3 c = uInk[0];
  for (int k = 1; k < 6; k++) if (k == i) c = uInk[k];
  return c;
}

vec3 shade(vec2 q) {
  float idx, tone, t; vec2 pf;
  resolve(q, idx, tone, t, pf);
  if (idx > -1.5 && idx < -0.5) return uPaper;                 // clear water
  // pigment texture, advected with the ink (it lives in the drop's own frame)
  float n = snoise(pf * 2.2 + uSeedOff) * 0.6 + snoise(pf * 7.0 - uSeedOff) * 0.4;
  if (idx < -1.5) {                                              // the ground colour that covered the bath
    if (uSumi > 0.5) return uPaper;
    float ng = snoise(pf * 9.0 + uSeedOff) * 0.6 + snoise(pf * 23.0) * 0.4;
    return uGround * (1.0 + uMottle * 0.08 * ng);
  }
  vec3 ink = inkAt(int(idx));
  float dens;
  if (uSumi > 0.5) {
    dens = mix(0.28, 0.97, tone);
    dens *= 1.0 + uMottle * 0.22 * n;
    float rim = smoothstep(1.0 - uRimW * 1.6, 1.0, t);
    dens = min(1.0, dens + rim * uVeins * 0.55);
    dens *= mix(1.0, 0.82, smoothstep(0.55, 0.0, t) * uVeins);
  } else {
    dens = 1.0;
    ink *= 0.95 + 0.1 * tone;
    ink *= 1.0 + uMottle * 0.09 * n;
    float rim = smoothstep(1.0 - uRimW, 1.0, t);
    vec3 dark = ink * ink * 0.8 + 0.02;
    ink = mix(ink, dark, rim * uVeins * 0.85);
    // faint pale halo just inside the rim, where the gall pushes pigment outward
    float halo = smoothstep(1.0 - uRimW * 3.0, 1.0 - uRimW, t) * (1.0 - rim);
    ink = mix(ink, mix(ink, uPaper, 0.25), halo * uVeins * 0.12);
  }
  return mix(uPaper, ink, clamp(dens, 0.0, 1.0));
}

void main() {
  vec2 fc = gl_FragCoord.xy + uOff;
  float px = 1.0 / uRes.y;
  vec3 acc = vec3(0.0);
  float jr = hash12(fc) * 6.2831;
  vec2 O[4] = vec2[4](vec2(0.125, 0.375), vec2(0.375, -0.125), vec2(-0.125, -0.375), vec2(-0.375, 0.125));
  float rockShade = 0.0;
  for (int s = 0; s < 4; s++) {
    vec2 o = rot(O[s], jr * 0.25);
    vec2 q = vec2(fc.x + o.x, uRes.y - (fc.y + o.y)) * px;
    // Spanish wave: the sheet was laid with a stop-start rocking motion — a sine shear, and at each
    // stop a line where the colour gathered, fading out until the next stop
    vec2 rm = vec2(cos(uRock.z), sin(uRock.z));
    float ph = uRock.y * dot(q - vec2(uAspect * 0.5, 0.5), rm) + 0.35 * sin(q.x * 3.0 + q.y * 2.0);
    q += vec2(-rm.y, rm.x) * uRock.x * sin(ph);
    vec3 c = shade(q);
    float saw = fract(ph / 6.2831);
    float stopLine = exp(-saw * 14.0) + 0.5 * exp(-(1.0 - saw) * 40.0);
    float lum = 1.0 - uRock.w * (0.22 * stopLine - 0.06 * saw);
    c = mix(uPaper, c, clamp(lum, 0.0, 1.1)) * (1.0 - uRock.w * 0.05 * stopLine);
    acc += c;
  }
  vec3 col = acc * 0.25;

  // paper: fine grain, then laid & chain lines or washi fibres
  vec2 q = vec2(fc.x, uRes.y - fc.y) * px;
  float g = snoise(q * 520.0) * 0.5 + snoise(q * 140.0 + 3.0) * 0.35 + snoise(q * 31.0 - 7.0) * 0.3;
  float tex = 1.0 + g * 0.018;
  if (uSheet > 0.5 && uSheet < 1.5) {
    float lf = 300.0;                                   // laid lines (~0.8 mm)
    float fade = smoothstep(0.7, 0.25, lf * px);
    float laid = sin(q.y * lf * 6.2831 + snoise(q * 6.0) * 1.5);
    tex *= 1.0 + laid * 0.012 * fade;
    float cx = abs(fract(q.x / 0.105 + snoise(vec2(q.y * 3.0, 1.0)) * 0.03) - 0.5) * 0.105; // chain lines (~25 mm)
    tex *= 1.0 - 0.02 * smoothstep(0.0022 + px, 0.0006, cx);
  } else if (uSheet > 1.5) {
    // washi: long kozo fibres at many angles
    float f = 0.0;
    for (int k = 0; k < 3; k++) {
      float a = float(k) * 2.1 + 0.4;
      vec2 r = rot(q, a) * vec2(9.0, 220.0) + float(k) * 13.0;
      float v = snoise(r);
      f += smoothstep(0.72, 0.95, v) - smoothstep(0.8, 0.98, -v) * 0.6;
    }
    float fade = smoothstep(1.2, 0.3, 220.0 * px);
    tex *= 1.0 + f * 0.035 * fade + snoise(q * 11.0) * 0.012;
  }
  col *= tex;
  // the sheet takes the colour slightly unevenly
  col = mix(col, col * (0.97 + 0.03 * snoise(q * 3.0 + 11.0)), 1.0);
  col += (hash12(fc + 0.5) - 0.5) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  /* ------------------------------------------------------------ scene build */
  function shuffle(a, R) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // best-candidate sampling for an even, hand-sprinkled scatter
  function scatter(R, n, x0, y0, x1, y1, prev) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      let best = null, bd = -1;
      for (let c = 0; c < 5; c++) {
        const x = lerp(x0, x1, R()), y = lerp(y0, y1, R());
        let d = 1e9;
        for (const p of pts) d = Math.min(d, (p[0] - x) ** 2 + (p[1] - y) ** 2);
        if (prev) for (const p of prev) d = Math.min(d, ((p[0] - x) ** 2 + (p[1] - y) ** 2) * 2.5);
        if (d > bd) { bd = d; best = [x, y]; }
      }
      pts.push(best);
    }
    return pts;
  }

  function combExtent(A, th) { return Math.abs(A * Math.sin(th)) + Math.abs(Math.cos(th)); }
  function gelPasses(P) { return Math.round(lerp(5, 16, P.pitch)); }
  function combPitch(P) { return lerp(0.015, 0.055, Math.pow(P.comb, 1.1)); } // tine spacing in sheet heights
  function combMM(P) { return combPitch(P) * SHEET_MM; }

  const cache = { key: '', scene: null };
  function scene(P) {
    const key = JSON.stringify(P);
    if (cache.key === key) return cache.scene;
    const A = C.FORMATS[P.format].a;
    const pal = PALETTES[P.palette];
    const drops = [];   // [x, y, r, w]
    const strokes = []; // [[A],[B],[C]]
    const pat = P.pattern | 0;
    const nC = clamp(P.colours | 0, 2, 6);
    const Rc = C.rng((P.seed * 2654435761 + 17) >>> 0);
    const cx = A * 0.5, cy = 0.5;

    if (pat === P_SUMI) {
      /* suminagashi: ink and clear (resin water) drops touched in turn to the water at a few centres */
      const Rs = C.rng((P.seed ^ 0x5a17) >>> 0);
      const nCent = 1 + C.pickWeighted(Rs, [3, 3.5, 2.5, 1]);
      const cents = [];
      for (let i = 0; i < nCent; i++) {
        if (nCent === 1) cents.push([cx + (Rs() - 0.5) * 0.35 * A, cy + (Rs() - 0.5) * 0.35]);
        else {
          // spread the centres: best of a few candidates
          let best = null, bd = -1;
          for (let t = 0; t < 8; t++) {
            const c = [lerp(0.08, 0.92, Rs()) * A, lerp(0.08, 0.92, Rs())];
            let d = 1e9; for (const o of cents) d = Math.min(d, Math.hypot(o[0] - c[0], o[1] - c[1]));
            if (d > bd) { bd = d; best = c; }
          }
          cents.push(best);
        }
      }
      const rInk = lerp(0.024, 0.08, Math.pow(P.stones, 1.1));   // ink ring drop radius
      const rClr = rInk * lerp(0.8, 1.6, P.gall);                // resin water spreads further
      const target = 1.3 * A;                                     // enough rings to fill most of the sheet
      let n = Math.round(target / (Math.PI * (rInk * rInk + rClr * rClr) * 0.5));
      n = clamp(n, 40, 170);
      // uneven share between centres: one main pool, smaller satellites
      const share = cents.map((_, i) => (i === 0 ? 1.6 : lerp(0.5, 1, Rs())));
      const tot = share.reduce((a, b) => a + b, 0);
      const quota = share.map((s) => Math.max(8, Math.round((n * s) / tot)));
      const used = quota.map(() => 0);
      let k = 0, left = quota.reduce((a, b) => a + b, 0);
      left = Math.min(left, MAXD);
      while (drops.length < left) {
        for (let c = 0; c < nCent && drops.length < left; c++) {
          if (used[c] >= quota[c]) continue;
          const i = used[c]++;
          const ink = i % 2 === 0;
          const cc = cents[c];
          const jx = (Rs() - 0.5) * 0.005, jy = (Rs() - 0.5) * 0.005;
          if (ink) {
            // the brush runs dry and is re-dipped every few touches
            const dip = (i / 2) % 6;
            const tone = clamp(1 - dip * 0.13 + (Rs() - 0.5) * 0.1, 0.06, 1);
            const acc = nC - 2;   // accent inks besides sumi
            const ci = acc > 0 && Rs() < 0.12 + 0.08 * acc ? Math.floor(Rs() * acc) : 5;
            drops.push([cc[0] + jx, cc[1] + jy, rInk * lerp(0.55, 1.2, Rs()), ci, tone]);
          } else {
            drops.push([cc[0] + jx, cc[1] + jy, rClr * lerp(0.7, 1.25, Rs()), -1, 0]);
          }
        }
        if (++k > 1000) break;
      }
      // the breath / fan across the bath
      const Rf = C.rng((P.seed ^ 0xfa11) >>> 0);
      const br = P.curl;
      const nw = 2 + Math.floor(Rf() * 2);
      for (let i = 0; i < nw; i++) {
        const ang = Rf() * Math.PI * 2;
        strokes.push([[0, 0, ang, 0], [5, br * lerp(0.015, 0.045, Rf()), lerp(2.5, 7, Rf()), Rf() * 6.28], [0, 0, 0, 0]]);
      }
      const nv = br > 0.15 ? 1 + Math.floor(Rf() * 2) : 0;
      for (let i = 0; i < nv; i++) {
        strokes.push([[lerp(0.15, 0.85, Rf()) * A, lerp(0.15, 0.85, Rf()), lerp(0.15, 0.4, Rf()), 0], [4, (Rf() < 0.5 ? -1 : 1) * br * lerp(0.8, 2.4, Rf()), 0, 0], [0, 0, 0, 0]]);
      }
      if (P.drag > 0.35) {
        // a hair drawn once through the rings, on a lazy curve
        const th = (P.angle * Math.PI) / 180;
        strokes.push([[lerp(0.3, 0.7, Rf()) * A, lerp(0.3, 0.7, Rf()), th, 0], [1, (P.drag - 0.3) * 0.12, lerp(0.06, 0.12, Rf()), 0],
          [lerp(0.02, 0.07, Rf()), (2 * Math.PI) / lerp(0.6, 1.4, Rf()), Rf() * 6.28, 0]]);
      }
    } else {
      /* sprinkle: colour after colour over the whole bath; later colours (more gall) push earlier ones into veins */
      const order = shuffle([0, 1, 2, 3, 4], Rc).slice(0, nC - 1);
      const mx = 0.1;
      const x0 = -mx, x1 = A + mx, y0 = -mx, y1 = 1 + mx;
      const area = (x1 - x0) * (y1 - y0);
      const combed = pat !== P_STONE;
      const cover = combed ? 1.9 : 2.3;
      const ns = Math.pow(P.stones, 0.8);
      let N = Math.round(combed ? lerp(MAXD * 0.8, 30, ns) : lerp(MAXD, 22, ns));
      N = Math.round(N * lerp(0.75, 1.1, A / 2));
      N = clamp(N, nC * 3, MAXD);
      const counts = order.map((_, i) => Math.floor(N / order.length) + (i < N % order.length ? 1 : 0));
      const nR = order.length;
      const wmul = order.map((_, i) => 1 + P.gall * 1.5 * (nR > 1 ? i / (nR - 1) : 0));
      const sumW = counts.reduce((a, n, i) => a + n * wmul[i] * wmul[i], 0);
      const k = Math.sqrt((cover * area) / (Math.PI * sumW));
      // stone: each colour sprinkled once, in turn. Combed baths get two lighter passes of every colour
      // so no single colour swamps the stripes.
      const passes = combed && nR > 1 ? 2 : 1;
      for (let pass = 0; pass < passes; pass++) {
        order.forEach((ci, round) => {
          const Rr = C.rng((P.seed * 7919 + round * 104729 + pass * 31337 + 3) >>> 0);
          const cnt = passes === 1 ? counts[round] : Math.round(counts[round] / 2);
          const pts = scatter(Rr, cnt, x0, y0, x1, y1, null);
          pts.forEach((p) => {
            const r = k * wmul[round] * lerp(0.8, 1.2, Rr());
            drops.push([p[0], p[1], r, ci, Rr()]);
          });
        });
      }
      const over = drops.length - MAXD;
      if (over > 0) drops.splice(0, over);

      /* stylus and combs */
      if (combed) {
        const Rg = C.rng((P.seed ^ 0x9e11) >>> 0);
        const th = (P.angle * Math.PI) / 180;   // gel-git passes run along th; combs run across them
        const thN = th + Math.PI / 2;
        const ext = combExtent(A, th);
        const passes = gelPasses(P);
        const sg = ext / passes;
        const dragK = lerp(0.55, 2.3, P.drag);
        const org = [cx + (Rg() - 0.5) * sg, cy + (Rg() - 0.5) * sg];
        // gel-git: back-and-forth passes
        // under a nonpareil the gel-git is worked harder, so the stones become fine interleaved stripes
        const fine = pat === P_NONP || pat === P_BOUQ || pat === P_PEAC || pat === P_CURL;
        strokes.push([[org[0], org[1], th, sg], [2, sg * dragK * (fine ? 2.6 : 1), sg * lerp(0.22, 0.4, Rg()), 0], [0, 0, 0, 0]]);
        if (pat === P_CHEV) {
          // chevron: a coarse rake drawn back and forth across the gel-git
          const sc = combExtent(A, thN) / Math.round(lerp(3, 9, P.comb * 0.6 + Rg() * 0.4));
          strokes.push([[cx + Rg() * sc, cy, thN, sc], [2, sc * lerp(0.5, 1.6, P.drag), sc * 0.3, 0], [0, 0, 0, 0]]);
          if (P.wave > 0.05) strokes.push([[0, 0, th, 0], [5, P.wave * sc * 0.25, (2 * Math.PI) / (sc * 4), Rg() * 6.28], [0, 0, 0, 0]]);
        }
        if (pat >= P_NONP && pat !== P_CHEV) {
          // nonpareil: a fine comb drawn once across the gel-git bands
          const sn = combPitch(P);
          strokes.push([[cx + Rg() * sn, cy, thN, sn], [1, sn * lerp(1.6, 5.0, P.drag), sn * 0.22, 0], [0, 0, 0, 0]]);
          if (pat === P_BOUQ) {
            // bouquet: a wide comb drawn through with a serpentine motion
            const sb = sn * Math.round(lerp(4, 7, Rg()));
            const amp = sb * lerp(0.15, 0.6, P.wave);
            strokes.push([[cx + sn * 0.5, cy, thN, sb], [1, sb * lerp(0.9, 2.2, P.drag), sb * 0.28, 0], [amp, (2 * Math.PI) / (sb * lerp(1.4, 2.4, Rg())), Rg() * 6.28, 0]]);
          } else if (pat === P_PEAC) {
            // peacock: a comb set between the nonpareil tines, drawn back with a gentle wave
            const sp = sn * 3;
            const amp = sp * lerp(0.3, 0.6, P.wave);
            strokes.push([[cx + sn * 0.5, cy, thN + Math.PI, sp], [1, sp * lerp(0.5, 1.0, P.drag), sp * 0.3, 0], [amp, (2 * Math.PI) / (sp * lerp(1.5, 2.0, Rg())), Rg() * 6.28, 0]]);
          } else if (pat === P_CURL) {
            // French curl: a row-lattice of rotating pegs
            const sv = lerp(0.14, 0.32, Rg() * 0.5 + P.stones * 0.5);
            strokes.push([[cx + Rg() * sv, cy + Rg() * sv, sv, th], [6, lerp(1.5, 7.5, P.curl), 0.49, Rg() < 0.3 ? 1 : 0], [Rg() < 0.5 ? 0.5 : 0, 0, 0, 0]]);
          }
        }
      }
    }

    // pack uniforms
    const data = new Uint8Array(MAXD * 12).fill(255);
    const e16 = (v, lo, hi) => Math.round(clamp((v - lo) / (hi - lo), 0, 1) * 65535);
    drops.forEach((d, i) => {
      const x = e16(d[0], -1, 3), y = e16(d[1], -1, 3), r = e16(d[2], 0, 0.5), o = i * 12;
      data[o] = x >> 8; data[o + 1] = x & 255; data[o + 2] = y >> 8;
      data[o + 4] = y & 255; data[o + 5] = r >> 8; data[o + 6] = r & 255;
      data[o + 8] = d[3] < 0 ? 255 : d[3]; data[o + 9] = Math.round(clamp(d[4], 0, 1) * 255); data[o + 10] = 0;
    });
    const uSA = new Array(MAXS * 4).fill(0), uSB = new Array(MAXS * 4).fill(0), uSC = new Array(MAXS * 4).fill(0);
    strokes.slice(0, MAXS).forEach((s, i) => { for (let c = 0; c < 4; c++) { uSA[i * 4 + c] = s[0][c]; uSB[i * 4 + c] = s[1][c]; uSC[i * 4 + c] = s[2][c]; } });
    const uInk = [];
    pal.inks.forEach((h) => uInk.push(...hexRGB(h)));
    uInk.push(...hexRGB(pal.sumi));
    const rockAng = ((P.seed % 7) / 7) * 0.6 + 0.45 + (P.seed % 2 ? Math.PI / 2 : 0);
    const out = {
      A, drops, strokes, data, key,
      u: {
        uAspect: A, uDropN: drops.length, uSA, uSB, uSC, uSN: Math.min(strokes.length, MAXS),
        uInk, uPaper: hexRGB(pal.paper), uGround: hexRGB(pal.ground),
        uVeins: P.veins, uRimW: lerp(0.025, 0.1, P.veins), uMottle: P.mottle, uSumi: pat === P_SUMI ? 1 : 0,
        uRock: [P.rock * 0.014, lerp(55, 95, (P.seed % 13) / 13), rockAng, Math.min(1, P.rock * 1.3)],
        uSheet: P.sheet, uSeedOff: (P.seed % 997) * 0.37,
      },
    };
    cache.key = key; cache.scene = out;
    return out;
  }

  function makeTex(g) {
    return g.createFramebuffer({ width: MAXD * 3, height: 1, density: 1, format: g.UNSIGNED_BYTE, depth: false, antialias: false, textureFiltering: g.NEAREST });
  }
  function upload(fb, S) { fb.pixels = new Uint8Array(S.data); fb.updatePixels(); fb._key = S.key; }

  function applyUniforms(sh, P, w, h, fb, off) {
    const S = scene(P);
    if (fb._key !== S.key) upload(fb, S);
    for (const k in S.u) sh.setUniform(k, Array.isArray(S.u[k]) ? S.u[k].slice() : S.u[k]);
    sh.setUniform('uDropTex', fb);
    sh.setUniform('uRes', [w, h]);
    sh.setUniform('uOff', off || [0, 0]);
  }

  // Export in horizontal bands so a huge render never stalls the GPU in one draw.
  function exportTiled(p, P, W, H) {
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    const band = Math.max(64, Math.min(H, Math.floor(2.5e6 / W)));
    const g = p.createGraphics(W, band, p.WEBGL);
    g.pixelDensity(1);
    const fb = makeTex(g);
    const sh = g.createShader(C.VERT, FRAG);
    for (let y0 = 0; y0 < H; y0 += band) {
      g.clear();
      g.noStroke();
      g.shader(sh);
      applyUniforms(sh, P, W, H, fb, [0, H - y0 - band]);
      g.rect(0, 0, W, band);
      ctx.drawImage(g.elt, 0, 0, W, band, 0, y0, W, band);
    }
    fb.remove();
    g.remove();
    return out;
  }

  /* ---------------------------------------------------------------- traits */
  const ANG_NAMES = (a) => (a < 8 ? 'Horizontal' : a < 30 ? 'Oblique' : a < 60 ? 'Diagonal' : a < 83 ? 'Steep' : 'Vertical');
  const NUMW = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

  function trait(k, P) {
    const pat = P.pattern | 0, sumi = pat === P_SUMI;
    switch (k) {
      case 'colours': return sumi ? (P.colours <= 2 ? 'Sumi only' : `${NUMW[P.colours - 1]} inks`) : `${NUMW[P.colours]} colours`;
      case 'stones': if (sumi) return P.stones < 0.3 ? 'Hairline rings' : P.stones < 0.65 ? 'Even rings' : 'Broad rings';
        return P.stones < 0.3 ? 'Small stones' : P.stones < 0.6 ? 'Stones' : P.stones < 0.85 ? 'Large stones' : 'Pooled';
      case 'gall': if (sumi) return P.gall < 0.3 ? 'Little resin' : P.gall < 0.7 ? 'Resin water' : 'Wide clear rings';
        return P.gall < 0.2 ? 'Even gall' : P.gall < 0.6 ? 'Graded gall' : 'Heavy gall';
      case 'pitch': return `${gelPasses(P)} passes`;
      case 'comb': return `${combMM(P).toFixed(0)} mm comb`;
      case 'angle': return ANG_NAMES(P.angle);
      case 'curl': if (sumi) return P.curl < 0.12 ? 'Still water' : P.curl < 0.5 ? 'A breath' : 'Fanned';
        return P.curl < 0.2 ? 'Loose curl' : P.curl < 0.6 ? 'Curl' : 'Tight curl';
    }
    return null;
  }

  function usesComb(P) { const t = P.pattern | 0; return t >= P_NONP && t !== P_SUMI && t !== P_CHEV; }

  C.register({
    id: 'marbling',
    name: 'Marbling',
    group: 'process',
    order: 1,
    renderer: 'webgl',
    subtitle: 'Paper marbling on a size bath',
    about: 'Every ink drop pushes the bath outward, and every stylus or comb drags it sideways; both moves can be undone exactly, so each pixel is traced backwards through the whole session until it lands in the drop that coloured it (after Jaffer & Lu, “Mathematical Marbling”, 2012). The patterns and their order follow the craft: stone, gel-git, nonpareil, then bouquet or peacock; suminagashi is ink and clear drops touched to the water in turn.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 1.4, 1.4, 0.6],
    defaults: { seed: 2412, format: 0, palette: 1 },
    palettes: PALETTES.map((p) => ({ name: p.name, colors: [p.ground].concat(p.inks.slice(0, 4)), paper: p.paper, bg: p.paper })),
    paletteOdds: [2, 2, 1.6, 1.3, 1.2, 1, 0.8, 0.7],
    params: [
      { k: 'pattern', g: 'Bath', label: 'Pattern', type: 'select', options: PATTERNS, def: P_NONP },
      { k: 'colours', g: 'Bath', label: 'Colours', min: 2, max: 6, step: 1, def: 5 },
      { k: 'stones', g: 'Bath', label: 'Stones', min: 0, max: 1, step: 0.01, def: 0.15 },
      { k: 'gall', g: 'Bath', label: 'Gall', min: 0, max: 1, step: 0.01, def: 0.2 },
      { k: 'veins', g: 'Bath', label: 'Veining', min: 0, max: 1, step: 0.01, def: 0.5,
        names: [[0, 'Clean'], [0.2, 'Edged'], [0.55, 'Veined'], [0.85, 'Inked']] },
      { k: 'pitch', g: 'Stylus', label: 'Gel-git pitch', min: 0, max: 1, step: 0.01, def: 0.45 },
      { k: 'drag', g: 'Stylus', label: 'Drag', min: 0, max: 1, step: 0.01, def: 0.5,
        names: [[0, 'Gentle'], [0.3, 'Drawn'], [0.7, 'Dragged']] },
      { k: 'angle', g: 'Stylus', label: 'Direction', min: 0, max: 90, step: 1, def: 0, unit: '°' },
      { k: 'comb', g: 'Comb', label: 'Comb pitch', min: 0, max: 1, step: 0.01, def: 0.35 },
      { k: 'wave', g: 'Comb', label: 'Wave', min: 0, max: 1, step: 0.01, def: 0.5,
        names: [[0, 'Straight'], [0.2, 'Swaying'], [0.55, 'Serpentine']] },
      { k: 'curl', g: 'Comb', label: 'Curl', min: 0, max: 1, step: 0.01, def: 0.5 },
      { k: 'rock', g: 'Paper', label: 'Lay', min: 0, max: 1, step: 0.01, def: 0,
        names: [[0, 'Laid flat'], [0.12, 'Rocked'], [0.45, 'Spanish wave']] },
      { k: 'mottle', g: 'Paper', label: 'Mottle', min: 0, max: 1, step: 0.01, def: 0.4,
        names: [[0, 'Even'], [0.3, 'Mottled'], [0.7, 'Cloudy']] },
      { k: 'sheet', g: 'Paper', label: 'Sheet', type: 'select', options: ['Wove', 'Laid', 'Washi'], def: 1 },
    ],

    randomize(R) {
      const pat = C.pickWeighted(R, [1.2, 0.8, 1.2, 1.1, 1.0, 0.8, 0.9, 1.0]);
      const o = { pattern: pat };
      const sumi = pat === P_SUMI;
      if (sumi) {
        o.palette = R() < 0.55 ? 5 : R() < 0.5 ? 4 : C.pickWeighted(R, [1, 1, 1, 1, 0, 0, 1, 1]);
        o.colours = R() < 0.5 ? 2 : R.int(2, 4);
        o.stones = lerp(0.15, 0.75, R());
        o.gall = lerp(0.2, 0.85, R());
        o.curl = R() < 0.1 ? lerp(0.12, 0.2, R()) : lerp(0.3, 0.9, R());
        o.drag = R();
        o.sheet = R() < 0.8 ? 2 : R.int(0, 1);
        o.veins = lerp(0.2, 0.8, R());
      } else {
        if (pat !== P_STONE) o.palette = C.pickWeighted(R, [2, 2, 1.6, 1.4, 1.2, 0.2, 0.8, 0.8]);
        else o.palette = C.pickWeighted(R, [2.4, 2, 1.8, 1.2, 1.2, 0.2, 0.9, 0.7]);
        o.colours = 2 + C.pickWeighted(R, [pat === P_STONE ? 0.3 : 0, 1.2, 1.6, 1.3, 0.8]);
        o.stones = pat === P_STONE ? lerp(0.05, 0.9, R()) : lerp(0, 0.5, Math.pow(R(), 1.6));
        o.gall = pat === P_STONE ? lerp(0.1, 1, R()) : lerp(0, 0.55, Math.pow(R(), 1.3));
        o.veins = lerp(0.15, 0.9, R());
        o.sheet = R() < 0.7 ? 1 : R() < 0.8 ? 0 : 2;
      }
      o.pitch = lerp(0.15, 0.85, R());
      if (!sumi) o.drag = lerp(0.25, 0.9, R());
      o.angle = R() < 0.55 ? 0 : R() < 0.6 ? 90 : R.int(0, 90);
      o.comb = lerp(0.05, 0.8, R());
      o.wave = lerp(0.15, 0.9, R());
      if (!sumi) o.curl = lerp(0.2, 0.95, R());
      o.rock = R() < 0.8 ? 0 : lerp(0.25, 0.9, R());
      o.mottle = lerp(0.1, 0.8, R());
      return o;
    },
    traitName(k, P) { return trait(k, P); },
    caption(P) {
      const pat = P.pattern | 0;
      const pal = PALETTES[P.palette].name;
      const paper = ['wove paper', 'laid paper', 'washi'][P.sheet];
      const lay = P.rock >= 0.45 ? ', laid down in a Spanish wave' : P.rock >= 0.12 ? ', rocked as it was laid' : '';
      if (pat === P_SUMI) {
        const n = scene(P).drops.length;
        return `Suminagashi in ${pal} inks: ${n} touches of ink and resin water, ${trait('curl', P).toLowerCase()}, lifted onto ${paper}${lay}.`;
      }
      const col = `${NUMW[P.colours].toLowerCase()} colours`;
      const what = {
        [P_STONE]: `Battal stone pattern (${trait('stones', P).toLowerCase()})`, [P_GELGIT]: 'Gel-git', [P_NONP]: 'Nonpareil',
        [P_BOUQ]: 'Bouquet', [P_PEAC]: 'Peacock', [P_CHEV]: 'Chevron', [P_CURL]: 'French curl',
      }[pat];
      const over = pat === P_STONE ? '' : usesComb(P) ? ` over a ${gelPasses(P)}-pass gel-git and ${combMM(P).toFixed(0)} mm comb`
        : ` from ${gelPasses(P)} stylus passes`;
      return `${what} in ${pal} ${col}${over}, on ${paper}${lay}.`;
    },
    sheet(P) {
      const pat = P.pattern | 0, sumi = pat === P_SUMI;
      const T = (k) => C.traitName(C.byId.marbling, k, P);
      const rows = [
        ['Pattern', PATTERNS[pat]],
        ['Palette', PALETTES[P.palette].name],
        ['Format', C.FORMATS[P.format].label],
        ['Colours', T('colours')],
        [sumi ? 'Rings' : 'Stones', T('stones')],
        [sumi ? 'Clear water' : 'Gall', T('gall')],
        ['Veining', T('veins')],
      ];
      if (sumi) rows.push(['Air', T('curl')], ['Hair', P.drag > 0.35 ? 'Drawn through' : 'None']);
      else if (pat !== P_STONE) {
        rows.push(['Stylus', `${gelPasses(P)} passes, ${T('drag').toLowerCase()}`]);
        if (usesComb(P)) rows.push(['Comb', combMM(P).toFixed(0) + ' mm']);
        if (pat === P_BOUQ || pat === P_PEAC || pat === P_CHEV) rows.push(['Wave', T('wave')]);
        if (pat === P_CURL) rows.push(['Curl', T('curl')]);
      }
      rows.push(['Lay', T('rock')], ['Sheet', ['Wove', 'Laid', 'Washi'][P.sheet]]);
      return rows.slice(0, 12);
    },

    setup(p) { return { sh: p.createShader(C.VERT, FRAG), fb: makeTex(p) }; },
    start(p, P, st) { st.dirty = true; },
    frame(p, P, st) {
      const [w, h] = C.bufferSize(p);
      p.noStroke();
      p.shader(st.sh);
      applyUniforms(st.sh, P, w, h, st.fb);
      p.rect(0, 0, p.width, p.height);
      return false;
    },
    exportAt(p, P, W, H) { return exportTiled(p, P, W, H); },
    dispose(p, st) { if (st && st.fb) st.fb.remove(); },
  });
})();
