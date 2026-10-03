/* Chladni — sand on a vibrating plate collects along the nodal lines, where the plate stays still.
   Square plates use the classic approximation f = cos(nπx)cos(mπy) ± cos(mπx)cos(nπy); circular plates
   use Bessel modes J_n(k r)·cos(nθ) with k at the zeros of J_n′ (free rim). Every sand grain is a small
   shaded disc on a jittered grid whose chance of staying put falls off as exp(−(f/σ)²). */
(function () {
  const C = window.Cabinet;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NMODES = 30;
  const PLATES = ['Square', 'Circle', 'Rectangle'];
  const RECT_AR = 1.42;

  /* ------------------------------------------------------------ modes */
  function besselJ(n, x) {
    // J_n(x) = 1/2π ∮ cos(nτ − x sin τ) dτ; the trapezoid rule on a full period converges spectrally
    const N = 72; let s = 0;
    for (let i = 0; i < N; i++) { const t = (2 * Math.PI * i) / N; s += Math.cos(n * t - x * Math.sin(t)); }
    return s / N;
  }
  const dJ = (n, x) => (besselJ(n, x + 1e-4) - besselJ(n, x - 1e-4)) / 2e-4;

  let CIRCLE_MODES = null;
  function circleModes() {
    if (CIRCLE_MODES) return CIRCLE_MODES;
    const out = [];
    for (let n = 0; n <= 9; n++) {
      let prev = dJ(n, 0.3), x = 0.3, found = 0;
      while (x < 34 && found < 7) {
        const nx = x + 0.1, v = dJ(n, nx);
        if (prev === 0 || Math.sign(v) !== Math.sign(prev)) {
          let a = x, b = nx;
          for (let k = 0; k < 30; k++) { const mid = (a + b) / 2; if (Math.sign(dJ(n, mid)) === Math.sign(dJ(n, a))) a = mid; else b = mid; }
          const k0 = (a + b) / 2;
          if (!(n === 0 && k0 < 0.5)) { out.push({ n, k: k0 }); found++; }
        }
        prev = v; x = nx;
      }
    }
    out.sort((a, b) => a.k - b.k);
    CIRCLE_MODES = out.slice(0, NMODES).map((m) => {
      // radial table, normalised, and the count of nodal circles inside the rim
      const tab = []; let mx = 0;
      for (let i = 0; i < 128; i++) { const v = besselJ(m.n, (m.k * i) / 127); tab.push(v); mx = Math.max(mx, Math.abs(v)); }
      let circles = 0;
      let sg = 0;
      for (let i = 2; i < 128; i++) {
        if (Math.abs(tab[i]) < 1e-6) continue;
        const t = Math.sign(tab[i]);
        if (sg && t !== sg) circles++;
        sg = t;
      }
      return { n: m.n, k: m.k, tab: tab.map((v) => v / mx), circles };
    });
    return CIRCLE_MODES;
  }

  const SQ = { '+': null, '-': null };
  function squareModes(sign) {
    if (SQ[sign]) return SQ[sign];
    const out = [];
    for (let n = 1; n <= 16; n++) for (let m = n; m <= 16; m++) {
      if (n === m) continue;   // n = m collapses to a plain grid (+) or to nothing (−)
      out.push({ n, m, e: n * n + m * m });
    }
    out.sort((a, b) => a.e - b.e || a.n - b.n);
    return (SQ[sign] = out.slice(0, NMODES));
  }
  function modeAt(P, i) {
    i = clamp(i, 0, NMODES - 1);
    if (P.plate === 1) return Object.assign({ kind: 'circle' }, circleModes()[i]);
    const sign = P.symmetry === 0 ? '+' : '-';
    const m = squareModes(sign)[i];
    return { kind: 'square', n: m.n, m: m.m, sign: sign === '+' ? 1 : -1, e: m.e };
  }
  function hz(P, M) {
    if (M.kind === 'circle') return Math.round(40 * M.k * M.k);
    // the ± pair mixes (n,m) and (m,n); on the rectangle give it the mean of their two frequencies
    const ar = P.plate === 2 ? RECT_AR : 1;
    return Math.round(64 * (M.n * M.n + M.m * M.m) * (1 + 1 / (ar * ar)) * 0.5);
  }
  function modeName(P, M) {
    if (M.kind === 'circle') {
      const d = M.n, c = M.circles;
      return `${d} diameter${d === 1 ? '' : 's'}, ${c} circle${c === 1 ? '' : 's'}`;
    }
    return `Mode ${M.n}·${M.m}`;
  }

  /* ------------------------------------------------------------ palettes */
  const PALETTES = [
    { name: 'Brass & sand', plate: '#b58c4c', hi: '#f6dfa4', sand: '#ece1c7', dark: '#6e5d44', bg: '#1a1613', bolt: '#9b968d', style: 0, colors: ['#b58c4c', '#ece1c7', '#f6dfa4', '#6e5d44', '#1a1613'] },
    { name: 'Black & white', plate: '#151515', hi: '#6a6a6a', sand: '#f5f3ee', dark: '#9d998f', bg: '#2b2825', bolt: '#7c7a76', style: 0, colors: ['#151515', '#f5f3ee', '#6a6a6a', '#2b2825'] },
    { name: 'Blueprint', plate: '#1f4f8f', hi: '#4a82c9', sand: '#f3f7fc', dark: '#a7bddb', bg: '#12325d', bolt: '#dce6f3', style: 1, colors: ['#1f4f8f', '#f3f7fc', '#4a82c9', '#12325d'] },
    { name: 'Verdigris', plate: '#4b8a77', hi: '#b4e0cc', sand: '#f1e8d3', dark: '#7b6a52', bg: '#1b2321', bolt: '#8a6a44', style: 0, colors: ['#4b8a77', '#f1e8d3', '#b4e0cc', '#8a6a44', '#1b2321'] },
    { name: 'Steel & salt', plate: '#8e959c', hi: '#eef2f6', sand: '#fcfcfa', dark: '#b9bdc2', bg: '#202328', bolt: '#5d6268', style: 0, colors: ['#8e959c', '#fcfcfa', '#eef2f6', '#202328'] },
    { name: 'Cymatics', plate: '#08061a', hi: '#3b1f86', sand: '#ff2bd6', dark: '#00e5ff', bg: '#000000', bolt: '#1b1830', style: 2, colors: ['#08061a', '#ff2bd6', '#00e5ff', '#fff04a'], c3: '#fff04a' },
  ];

  /* ------------------------------------------------------------ shader */
  const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform vec2 uOff;
uniform float uAspect;
uniform float uPlate;
uniform float uPlateAR;
uniform vec4 uM1;
uniform vec4 uM2;
uniform vec4 uJ1[32];
uniform vec4 uJ2[32];
uniform float uBlend;
uniform float uBlendNorm;
uniform float uSigma;
uniform float uSand;
uniform float uCells;
uniform float uGrainVar;
uniform float uScatter;
uniform float uT;
uniform float uHalf;
uniform vec2 uPan;
uniform vec2 uLight;
uniform float uSheen;
uniform float uBolt;
uniform float uStyle;
uniform vec3 uPlateC;
uniform vec3 uHi;
uniform vec3 uSandC;
uniform vec3 uDark;
uniform vec3 uC3;
uniform vec3 uBg;
uniform vec3 uBoltC;
uniform vec2 uSeedV;
${C.GLSL_NOISE}
#define PI 3.14159265

float tab(int w, int i) {
  vec4 v = w == 0 ? uJ1[i >> 2] : uJ2[i >> 2];
  return dot(v, vec4(equal(ivec4(i & 3), ivec4(0, 1, 2, 3))));
}
// value and gradient of one mode at u
vec3 modeG(vec2 u, vec4 M, int w) {
  if (uPlate > 0.5 && uPlate < 1.5) {
    float r = max(length(u), 1e-3);
    float th = atan(u.y, u.x);
    float x = clamp(r, 0.0, 1.0) * 126.999; int i = int(floor(x)); float fr = x - float(i);
    float t0 = tab(w, i), t1 = tab(w, i + 1);
    float J = mix(t0, t1, fr), dJ = (t1 - t0) * 127.0;
    float ca = cos(M.x * th + M.w), sa = sin(M.x * th + M.w);
    vec2 rh = u / r, tht = vec2(-rh.y, rh.x);
    return vec3(J * ca, rh * dJ * ca - tht * (M.x * J * sa / r));
  }
  vec2 x = (u + 1.0) * 0.5;
  float n = M.x * PI, m = M.y * PI;
  float cnx = cos(n * x.x), snx = sin(n * x.x), cmy = cos(m * x.y), smy = sin(m * x.y);
  float cmx = cos(m * x.x), smx = sin(m * x.x), cny = cos(n * x.y), sny = sin(n * x.y);
  float a = cnx * cmy, b = cmx * cny;
  vec2 ga = vec2(-n * snx * cmy, -m * cnx * smy) * 0.5;
  vec2 gb = vec2(-m * smx * cny, -n * cmx * sny) * 0.5;
  return vec3(a + M.z * b, ga + M.z * gb) * 0.5;
}
vec3 FG(vec2 u) {
  vec3 f = modeG(u, uM1, 0);
  if (uBlend > 0.001) f = mix(f, modeG(u, uM2, 1), uBlend) * uBlendNorm;
  return f;
}

// signed distance to the plate outline in plate units (negative inside)
float plateSD(vec2 u) {
  if (uPlate > 0.5 && uPlate < 1.5) return length(u) - 1.0;
  vec2 d = abs(u) - vec2(1.0 - 0.02); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.02;
}

vec3 sandColour(float h, vec2 pos, float fv) {
  if (uStyle > 1.5) {
    // cymatics: grains take a hue from where they settled
    float t = fract(length(pos) * 0.9 + h * 0.08);
    vec3 c = t < 0.5 ? mix(uSandC, uDark, t * 2.0) : mix(uDark, uC3, t * 2.0 - 1.0);
    return c * mix(0.75, 1.15, h);
  }
  vec3 c = uSandC * mix(0.82, 1.08, h);
  if (h > 0.9) c = mix(uDark, uSandC, (h - 0.9) * 4.0);     // dark mineral grains
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy + uOff;
  float px = 1.0 / uRes.y;
  vec2 q = vec2(fc.x, uRes.y - fc.y) * px;
  vec2 ctr = vec2(uAspect * 0.5, 0.5);
  vec2 pu = (q - ctr) / uHalf + uPan;           // plate coordinates, before the aspect squeeze
  vec2 u = vec2(pu.x / uPlateAR, pu.y);
  float pxu = px / uHalf;
  vec3 L = normalize(vec3(uLight, 0.9));

  // background: the bench, with the plate's shadow
  vec3 bg = uBg * (0.9 + 0.12 * snoise(q * 2.0 + 5.0)) * (1.0 - 0.25 * pow(length((q - ctr) / vec2(uAspect, 1.0)) * 1.2, 2.0));
  bg *= 1.0 + 0.02 * snoise(q * 400.0);
  vec2 su = u + uLight * 0.035 / vec2(uPlateAR, 1.0);
  float sh = smoothstep(0.08, -0.04, plateSD(su));
  bg *= 1.0 - 0.55 * sh;

  float sd = plateSD(u);
  vec3 col = bg;
  float aaE = pxu * 1.2;
  if (sd < aaE) {
    // plate metal: brushed grain, broad sheen, light falloff, bevelled edge
    float r = length(u);
    float brush = uPlate > 0.5 && uPlate < 1.5 ? snoise(vec2(r * 520.0, atan(u.y, u.x) * 4.0)) : snoise(vec2(u.x * 5.0, u.y * 560.0));
    vec3 plate = uPlateC * (0.9 + 0.12 * dot(normalize(vec3(-u * 0.25, 1.0)), L));
    plate *= 1.0 + 0.035 * brush + 0.03 * snoise(u * 3.0 + 2.0);
    float band = dot(u, normalize(vec2(-uLight.y, uLight.x))) * 0.7 + dot(u, uLight) * 0.25;
    plate = mix(plate, uHi, uSheen * 0.55 * exp(-pow((band - 0.25) / 0.45, 2.0)));
    if (uStyle > 0.5 && uStyle < 1.5) {
      // blueprint: a faint drafting grid on the plate
      vec2 g = abs(fract(u * 5.0 + 0.5) - 0.5) / 5.0;
      float gl = 1.0 - smoothstep(0.0, pxu * 1.2, min(g.x, g.y));
      vec2 g2 = abs(fract(u * 25.0 + 0.5) - 0.5) / 25.0;
      float gl2 = 1.0 - smoothstep(0.0, pxu * 0.8, min(g2.x, g2.y));
      plate = mix(plate, uHi, gl * 0.35 + gl2 * 0.12);
    }
    if (uStyle > 1.5) plate += uHi * 0.35 * smoothstep(-0.15, 0.0, sd) ;
    // bevel: bright on the lit edge, dark on the far edge
    float e = smoothstep(-0.03, 0.0, sd);
    vec2 en = normalize(u + 1e-5);
    if (uPlate < 0.5 || uPlate > 1.5) { vec2 a = abs(u); en = a.x > a.y ? vec2(sign(u.x), 0.0) : vec2(0.0, sign(u.y)); }
    plate *= 1.0 + e * 0.5 * dot(en, uLight);
    plate *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, pxu * 1.5, -sd)) * 0.8;

    /* sand grains on a jittered grid, two layers so the nodal ridges pile up */
    // grains live in unstretched plate space (pu); the mode is evaluated at u = pu / (aspect, 1)
    vec2 sq = vec2(uPlateAR, 1.0);
    float c = 2.0 / uCells;
    vec2 gi = floor(pu / c);
    float cover = 0.0, shadow = 0.0;
    vec3 gcol = vec3(0.0);
    float ease = uT * uT * (3.0 - 2.0 * uT);
    float sig = mix(1.6, uSigma, ease);
    for (int layer = 0; layer < 2; layer++) {
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cell = gi + vec2(float(i), float(j));
        vec2 hh = hash22(cell + uSeedV + float(layer) * 37.1);
        vec2 pos = (cell + 0.15 + 0.7 * hh) * c;
        vec3 fg = FG(pos / sq);
        fg.yz /= sq;
        float fv = fg.x;
        float dens = exp(-(fv * fv) / (sig * sig)) * uSand + uScatter * 0.12 * (1.0 - ease * 0.3);
        float pr = layer == 0 ? dens : dens - 1.0;
        float rn = hash12(cell * 1.31 + uSeedV + float(layer) * 11.7);
        if (rn > pr) continue;
        if (plateSD(pos / sq) > -0.012) continue;
        if (uBolt < 2.5 && length(pos) < 0.085) continue;
        // pull toward the nodal line (at most about a cell), and bounce while the plate is still ringing
        vec2 gr = fg.yz;
        float gl = length(gr) + 1e-4;
        vec2 step = -gr / gl * clamp(fv / gl, -c * 0.9, c * 0.9);
        pos += step * ease * 0.8 * exp(-(fv * fv) / (sig * sig * 4.0));
        vec2 jit = hash22(cell * 3.7 + floor(uT * 30.0)) - 0.5;
        pos += jit * c * 2.5 * abs(fv) * (1.0 - ease);
        float h = hash12(cell * 5.1 + float(layer) * 2.0);
        float rad = c * mix(0.34, 0.5, h) * mix(1.0, mix(0.6, 1.3, hash12(cell * 9.3)), uGrainVar);
        vec2 d = pu - pos;
        float dl = length(d);
        float cov = smoothstep(rad + pxu * 0.6, rad - pxu * 0.6, dl);
        // soft shadow cast away from the light
        float ds = length(d + uLight * rad * 0.55);
        shadow = max(shadow, smoothstep(rad * 1.35 + pxu, rad * 0.5, ds) * 0.55);
        if (cov > 0.0) {
          vec2 nn = d / max(rad, 1e-5);
          vec3 N = vec3(nn, sqrt(max(0.0, 1.0 - dot(nn, nn))));
          float lam = max(dot(N, L), 0.0);
          float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 18.0);
          vec3 sc = sandColour(h, pos, fv) * (0.55 + 0.6 * lam) + spec * 0.25;
          gcol = mix(gcol, sc, cov);
          cover = max(cover, cov);
        }
      }
    }
    plate *= 1.0 - shadow * (1.0 - cover);
    plate = mix(plate, gcol / max(cover, 1e-3), cover);

    /* the clamp at the centre */
    if (uBolt < 2.5) {
      vec2 ub = pu;
      float r0 = length(ub);
      vec2 nu = ub / max(r0, 1e-5);
      // washer
      float wa = smoothstep(0.078 + pxu, 0.078 - pxu, r0);
      vec3 washer = uBoltC * (0.8 + 0.35 * dot(nu, uLight) * smoothstep(0.05, 0.078, r0)) * (1.0 + 0.05 * snoise(vec2(r0 * 400.0, atan(ub.y, ub.x) * 2.0)));
      float wsh = smoothstep(0.09, 0.07, length(ub + uLight * 0.012));
      plate *= 1.0 - 0.35 * wsh * (1.0 - wa);
      plate = mix(plate, washer, wa);
      vec3 top;
      float body;
      if (uBolt < 0.5) {
        // hex nut
        vec2 a = abs(ub);
        float hx = max(a.x * 0.866 + a.y * 0.5, a.y) - 0.05;
        body = smoothstep(pxu, -pxu, hx);
        vec2 fn = a.y > a.x * 0.866 + a.y * 0.5 ? vec2(0.0, sign(ub.y)) : normalize(vec2(sign(ub.x) * 0.866, sign(ub.y) * 0.5));
        float facet = smoothstep(-0.012, 0.0, hx);
        top = uBoltC * (0.85 + 0.25 * dot(normalize(ub + 1e-5), uLight) * 0.4) * (1.0 + facet * 0.6 * dot(fn, uLight));
      } else {
        // knurled thumb screw
        float kr = 0.058 + 0.003 * cos(atan(ub.y, ub.x) * 36.0);
        body = smoothstep(kr + pxu, kr - pxu, r0);
        float kn = 0.5 + 0.5 * cos(atan(ub.y, ub.x) * 36.0);
        top = uBoltC * (0.8 + 0.3 * dot(nu, uLight) * smoothstep(0.03, 0.06, r0)) * mix(1.0, 0.8 + 0.3 * kn, smoothstep(0.045, 0.058, r0));
      }
      // bolt end with thread
      float be = smoothstep(0.024 + pxu, 0.024 - pxu, r0);
      vec3 bolt = uBoltC * 0.9 * (0.85 + 0.3 * dot(nu, uLight) * (r0 / 0.024)) * (0.95 + 0.08 * sin(r0 * 900.0));
      top = mix(top, bolt, be);
      top *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, pxu * 2.0, abs(r0 - 0.024)));
      plate = mix(plate, top, body);
    }
    col = mix(bg, plate, smoothstep(aaE * 0.5, -aaE * 0.5, sd));
  }
  col += (hash12(fc) - 0.5) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  /* ------------------------------------------------------------ uniforms */
  /* JS twin of the shader's mode function, used to share out a fixed amount of sand */
  function modeJS(M, x, y, ph) {
    if (M.kind === 'circle') {
      const r = Math.hypot(x, y); if (r > 1) return null;
      const t = Math.min(r, 1) * 126.999, i = Math.floor(t), fr = t - i;
      return (M.tab[i] * (1 - fr) + M.tab[i + 1] * fr) * Math.cos(M.n * Math.atan2(y, x) + ph);
    }
    const X = (x + 1) / 2, Y = (y + 1) / 2, n = M.n * Math.PI, m = M.m * Math.PI;
    return (Math.cos(n * X) * Math.cos(m * Y) + M.sign * Math.cos(m * X) * Math.cos(n * Y)) * 0.5;
  }
  const meanCache = {};
  function quietShare(P, M1, M2, ph, sigma) {
    // mean of exp(−(f/σ)²) over the plate: the fraction of the plate that is quiet enough to hold sand
    const key = [P.plate, P.symmetry, P.frequency, P.blend, ph.toFixed(3), sigma.toFixed(4)].join();
    if (meanCache[key]) return meanCache[key];
    const b = P.blend, bn = 1 / Math.sqrt((1 - b) * (1 - b) + b * b);
    let s = 0, n = 0;
    const N = 72;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ((i + 0.5) / N) * 2 - 1, y = ((j + 0.5) / N) * 2 - 1;
      let f = modeJS(M1, x, y, ph);
      if (f === null) continue;
      if (b > 0.001) f = (f * (1 - b) + modeJS(M2, x, y, ph) * b) * bn;
      s += Math.exp(-(f * f) / (sigma * sigma)); n++;
    }
    const keys = Object.keys(meanCache); if (keys.length > 400) delete meanCache[keys[0]];
    return (meanCache[key] = s / n);
  }

  function packTab(tab) { const a = []; for (let i = 0; i < 128; i++) a.push(tab ? tab[i] : 0); return a; }

  function uniforms(P, w, h, t) {
    t = t == null ? 1 : t;
    const pal = PALETTES[P.palette];
    const A = C.FORMATS[P.format].a;
    const idx = P.frequency | 0;
    const M1 = modeAt(P, idx), M2 = modeAt(P, idx + 1);
    const R = C.rng((P.seed * 2654435761 + 7) >>> 0);
    const ph = P.plate === 1 ? R() * Math.PI * 2 : 0;
    const enc = (M) => (M.kind === 'circle' ? [M.n, M.k, 0, ph] : [M.n, M.m, M.sign, 0]);
    const b = P.blend;
    const ar = P.plate === 2 ? RECT_AR : 1;
    // fit the plate (with a margin) into the canvas, then zoom in toward a seeded point
    const fit = Math.min(0.44, (A * 0.44) / ar);
    const z = P.zoom;
    const half = fit * lerp(1, 2.4, z * z);
    // keep a zoomed view inside the plate
    const vx = (A * 0.5) / half, vy = 0.5 / half;
    const px = Math.max(0, ar - vx) * 0.92, py = Math.max(0, 1 - vy) * 0.92;
    const pan = [lerp(-1, 1, R()) * px * (P.plate === 1 ? 0.6 : 1), lerp(-1, 1, R()) * py * (P.plate === 1 ? 0.6 : 1)];
    const la = (P.light * Math.PI) / 180;
    // σ in units of mode amplitude; higher modes have steeper slopes so lines thin out naturally
    const sigma = lerp(0.32, 0.038, Math.pow(P.settle, 0.8));
    const ease = t * t * (3 - 2 * t);
    const sigT = lerp(1.6, sigma, ease);
    // a fixed amount of sand shared over the quiet parts of the plate (at most two grains deep)
    const share = quietShare(P, M1, M2, ph, sigT);
    const sandGain = clamp((lerp(0.1, 0.42, P.sand) / Math.max(share, 1e-3)), 0.4, 2.3);
    return {
      uRes: [w, h], uAspect: A, uPlate: P.plate, uPlateAR: ar,
      uM1: enc(M1), uM2: enc(M2),
      uJ1: packTab(M1.tab), uJ2: packTab(M2.tab),
      uBlend: b, uBlendNorm: 1 / Math.sqrt((1 - b) * (1 - b) + b * b),
      uSigma: sigma, uSand: sandGain, uCells: Math.round(lerp(380, 120, P.grain)), uGrainVar: 0.6,
      uScatter: P.scatter, uT: t, uHalf: half, uPan: pan, uLight: [Math.cos(la) * 0.7, -Math.sin(la) * 0.7], uSheen: P.sheen,
      uBolt: P.clamp, uStyle: pal.style,
      uPlateC: C.hexRGB(pal.plate), uHi: C.hexRGB(pal.hi), uSandC: C.hexRGB(pal.sand), uDark: C.hexRGB(pal.dark),
      uC3: C.hexRGB(pal.c3 || pal.sand), uBg: C.hexRGB(pal.bg), uBoltC: C.hexRGB(pal.bolt),
      uSeedV: [(P.seed % 997) * 1.13, (P.seed % 983) * 0.71],
    };
  }
  function apply(sh, P, w, h, t, off) {
    const u = uniforms(P, w, h, t);
    for (const k in u) sh.setUniform(k, Array.isArray(u[k]) ? u[k].slice() : u[k]);
    sh.setUniform('uOff', off || [0, 0]);
  }

  function exportTiled(p, P, W, H) {
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    const band = Math.max(64, Math.min(H, Math.floor(3e6 / W)));
    const g = p.createGraphics(W, band, p.WEBGL);
    g.pixelDensity(1);
    const sh = g.createShader(C.VERT, FRAG);
    for (let y0 = 0; y0 < H; y0 += band) {
      g.clear(); g.noStroke(); g.shader(sh);
      apply(sh, P, W, H, 1, [0, H - y0 - band]);
      g.rect(0, 0, W, band);
      ctx.drawImage(g.elt, 0, 0, W, band, 0, y0, W, band);
    }
    g.remove();
    return out;
  }

  /* ------------------------------------------------------------ traits */
  function trait(k, P) {
    const M = modeAt(P, P.frequency | 0);
    switch (k) {
      case 'frequency': return `${modeName(P, M)} · ${hz(P, M)} Hz`;
      case 'symmetry': return P.plate === 1 ? '—' : P.symmetry === 0 ? 'Symmetric (+)' : 'Antisymmetric (−)';
      case 'blend': {
        if (P.blend < 0.04) return 'Pure mode';
        const M2 = modeAt(P, (P.frequency | 0) + 1);
        return P.blend > 0.96 ? `${modeName(P, M2)}` : `Beating toward ${hz(P, M2)} Hz`;
      }
      case 'grain': { const mm = (240 / lerp(380, 120, P.grain)) * 0.85; return `${P.grain < 0.3 ? 'Fine' : P.grain < 0.7 ? 'Medium' : 'Coarse'}, ${mm.toFixed(1)} mm`; }
      case 'light': { const d = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east']; return `From the ${d[Math.round(P.light / 45) % 8]}`; }
    }
    return null;
  }

  C.register({
    id: 'chladni',
    name: 'Chladni',
    group: 'process',
    order: 3,
    renderer: 'webgl',
    animated: true,
    subtitle: 'Sand on a singing plate',
    about: 'A metal plate clamped at its centre is set ringing at one of its resonant frequencies; sand bounces off the parts that move and settles on the nodal lines that stay still (Ernst Chladni, 1787). Square plates use the classic cos·cos ± cos·cos approximation, circular plates Bessel modes J_n(kr)·cos nθ, and every grain is drawn, piling into ridges where the plate is quietest.',
    formats: [1, 0, 2],
    formatOdds: [4, 1, 1],
    defaults: { seed: 1787, format: 1, palette: 0 },
    palettes: PALETTES.map((p) => ({ name: p.name, colors: p.colors })),
    paletteOdds: [3, 2, 1.4, 1.4, 1.2, 1],
    params: [
      { k: 'plate', g: 'Plate', label: 'Plate', type: 'select', options: PLATES, def: 0 },
      { k: 'frequency', g: 'Plate', label: 'Frequency', min: 0, max: NMODES - 1, step: 1, def: 11 },
      { k: 'symmetry', g: 'Plate', label: 'Symmetry', type: 'select', options: ['Symmetric +', 'Antisymmetric −'], def: 1 },
      { k: 'blend', g: 'Plate', label: 'Transition', min: 0, max: 1, step: 0.01, def: 0 },
      { k: 'sand', g: 'Sand', label: 'Sand', min: 0, max: 1, step: 0.01, def: 0.6,
        names: [[0, 'A pinch'], [0.3, 'A spoonful'], [0.7, 'A heap']] },
      { k: 'grain', g: 'Sand', label: 'Grain', min: 0, max: 1, step: 0.01, def: 0.45 },
      { k: 'settle', g: 'Sand', label: 'Settle', min: 0, max: 1, step: 0.01, def: 0.8,
        names: [[0, 'Just struck'], [0.3, 'Settling'], [0.65, 'Settled'], [0.9, 'Knife-edge']] },
      { k: 'scatter', g: 'Sand', label: 'Stray grains', min: 0, max: 1, step: 0.01, def: 0.2,
        names: [[0, 'Swept clean'], [0.15, 'A few strays'], [0.5, 'Scattered'], [0.8, 'Dusty']] },
      { k: 'zoom', g: 'Bench', label: 'View', min: 0, max: 1, step: 0.01, def: 0,
        names: [[0, 'Whole plate'], [0.25, 'Close'], [0.6, 'Detail'], [0.85, 'Macro']] },
      { k: 'light', g: 'Bench', label: 'Light', min: 0, max: 359, step: 1, def: 135, unit: '°' },
      { k: 'sheen', g: 'Bench', label: 'Sheen', min: 0, max: 1, step: 0.01, def: 0.45,
        names: [[0, 'Matte'], [0.3, 'Satin'], [0.7, 'Polished']] },
      { k: 'clamp', g: 'Bench', label: 'Clamp', type: 'select', options: ['Hex nut', 'Thumb screw', 'Hidden'], def: 0 },
    ],

    randomize(R) {
      const plate = C.pickWeighted(R, [5, 3.5, 1.5]);
      const o = { plate };
      o.frequency = Math.round(lerp(4, 29, Math.pow(R(), 0.9)));
      if (plate === 1) {
        // high-order modes with no nodal circle leave a quiet, sandy middle: rarely worth the print
        for (let k = 0; k < 4; k++) {
          const M = circleModes()[o.frequency];
          if (M.circles > 0 || M.n < 4) break;
          o.frequency = Math.round(lerp(4, 29, R()));
        }
      }
      o.symmetry = R() < 0.5 ? 0 : 1;
      o.blend = R() < 0.7 ? 0 : lerp(0.15, 0.85, R());
      o.sand = lerp(0.35, 0.95, R());
      o.grain = lerp(0.15, 0.8, R());
      o.settle = R() < 0.15 ? lerp(0.25, 0.5, R()) : lerp(0.55, 0.95, R());
      o.scatter = Math.pow(R(), 1.6) * 0.7;
      o.zoom = R() < 0.75 ? 0 : lerp(0.2, 0.75, R());
      o.light = R.int(0, 359);
      o.sheen = lerp(0.15, 0.85, R());
      o.clamp = C.pickWeighted(R, [6, 3, 1]);
      o.format = plate === 2 ? (R() < 0.8 ? 2 : 1) : (R() < 0.8 ? 1 : 0);
      return o;
    },
    traitName(k, P) { return trait(k, P); },
    caption(P) {
      const M = modeAt(P, P.frequency | 0);
      const plate = ['square', 'circular', 'rectangular'][P.plate];
      const pal = PALETTES[P.palette].name;
      const sym = P.plate === 1 ? '' : P.symmetry === 0 ? ' symmetric' : ' antisymmetric';
      const what = M.kind === 'circle' ? `the mode with ${modeName(P, M)}` : `${sym.trim()} mode ${M.n}·${M.m}`;
      const bl = P.blend >= 0.04 && P.blend <= 0.96 ? `, drifting toward ${hz(P, modeAt(P, (P.frequency | 0) + 1))} Hz` : '';
      return `A ${plate} plate ringing at ${hz(P, M)} Hz in ${what}${bl}; ${C.traitName(C.byId.chladni, 'sand', P).toLowerCase()} of sand, ${C.traitName(C.byId.chladni, 'settle', P).toLowerCase()} (${pal}).`;
    },
    sheet(P) {
      const T = (k) => C.traitName(C.byId.chladni, k, P);
      const M = modeAt(P, P.frequency | 0);
      return [
        ['Plate', PLATES[P.plate]],
        ['Palette', PALETTES[P.palette].name],
        ['Mode', modeName(P, M)],
        ['Frequency', `${hz(P, M)} Hz`],
        ['Symmetry', T('symmetry')],
        ['Transition', T('blend')],
        ['Sand', T('sand')],
        ['Grain', T('grain')],
        ['Lines', T('settle')],
        ['Strays', T('scatter')],
        ['View', T('zoom')],
        ['Clamp', T('clamp')],
      ];
    },

    setup(p) { return { sh: p.createShader(C.VERT, FRAG), last: null, t0: 0, t: 1 }; },
    start(p, P, st) {
      // animate the sand settling for a new seed or a replay; slider tweaks redraw at once
      const key = JSON.stringify(P);
      const animate = !st.last || st.last === key || JSON.parse(st.last).seed !== P.seed;
      st.last = key;
      st.t0 = performance.now();
      st.t = animate ? 0 : 1;
      st.anim = animate;
    },
    frame(p, P, st) {
      const now = performance.now();
      // frames arriving faster than the display refresh mean nobody is pacing us (headless or a busy
      // loop): wait for the GPU so the animation cannot queue up hundreds of draws
      if (st.anim && st.lastFrame && now - st.lastFrame < 8) {
        const gl = p.drawingContext;
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, st.px || (st.px = new Uint8Array(4)));
      }
      st.lastFrame = performance.now();
      if (st.anim) st.t = Math.min(1, (st.lastFrame - st.t0) / 2600);
      const [w, h] = C.bufferSize(p);
      p.noStroke();
      p.shader(st.sh);
      apply(st.sh, P, w, h, st.t);
      p.rect(0, 0, p.width, p.height);
      return st.t < 1;
    },
    progress(st) { return st.t; },
    exportAt(p, P, W, H) { return exportTiled(p, P, W, H); },
  });
})();
