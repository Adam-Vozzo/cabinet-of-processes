/* Reaction–Diffusion — Gray-Scott on the GPU (ping-pong p5.Framebuffers).
   u (substrate) is fed at rate F; v (autocatalyst) is removed at rate F + k.
       du/dt = Du ∇²u − u v² + F (1 − u)
       dv/dt = Dv ∇²v + u v² − (F + k) v
   The state stores a = 1 − u and v, so half-float targets keep precision near
   the empty state. Regime names follow Pearson (1993) as extended by Robert
   Munafo's xmorphia catalogue; coordinates are theirs, at Du/Dv = 2. */
(function () {
  const C = window.Cabinet;

  /* ---------------- the (F, k) map ---------------- */
  // Pearson's classes with Munafo's extensions (mrob.com/pub/comp/xmorphia/pearson-classes.html)
  const CLASSES = [
    { g: 'α', nick: 'Wavelets', F: 0.010, k: 0.047, what: 'wavelets and fledgling spirals' },
    { g: 'β', nick: 'Turbulence', F: 0.014, k: 0.039, what: 'churning chaos' },
    { g: 'γ', nick: 'Writhing worms', F: 0.022, k: 0.051, what: 'restless, writhing stripes' },
    { g: 'δ', nick: 'Negative spots', F: 0.030, k: 0.055, what: 'a hexagonal lattice of holes' },
    { g: 'ε', nick: 'Spot chaos', F: 0.018, k: 0.055, what: 'spots that ring, split and die' },
    { g: 'ζ', nick: 'Pulsing spots', F: 0.022, k: 0.061, what: 'pulsing, dividing spots' },
    { g: 'η', nick: 'Spots & worms', F: 0.034, k: 0.063, what: 'spots and worms' },
    { g: 'θ', nick: 'Labyrinth', F: 0.030, k: 0.057, what: 'rings that fuse into a labyrinth' },
    { g: 'ι', nick: 'Holes', F: 0.046, k: 0.0594, what: 'holes punched through a sheet' },
    { g: 'κ', nick: 'Hedgerow maze', F: 0.050, k: 0.063, what: 'a branching hedgerow maze' },
    { g: 'λ', nick: 'Mitosis', F: 0.026, k: 0.061, what: 'spots dividing by mitosis' },
    { g: 'μ', nick: 'Worms', F: 0.046, k: 0.065, what: 'worms growing from both ends' },
    { g: 'ν', nick: 'Solitons', F: 0.046, k: 0.067, what: 'lone, inert solitons' },
    { g: 'ξ', nick: 'Spirals', F: 0.010, k: 0.041, what: 'sustained spiral waves' },
    { g: 'π', nick: 'U-skate', F: 0.062, k: 0.061, what: 'negative stripes, loops and spots' },
    { g: 'ρ', nick: 'Soap bubbles', F: 0.090, k: 0.059, what: 'soap-bubble cells' },
    { g: 'σ', nick: 'Negative bubbles', F: 0.090, k: 0.057, what: 'bubbles walled by negative stripes' },
  ];
  const CLASS_BY_G = Object.fromEntries(CLASSES.map((c) => [c.g, c]));
  // extra anchors from our own runs (same numerics), so the nearest-class lookup matches what
  // the dish actually shows: Karl Sims's "coral" sits in κ, his "mitosis" divides like λ,
  // (.039, .058) punches ι holes, and (.029, .056) stays a θ labyrinth within our step budget
  const ANCHORS = [['κ', 0.0545, 0.0620], ['λ', 0.0367, 0.0649], ['ι', 0.0390, 0.0580], ['θ', 0.0290, 0.0558]]
    .map(([g, F, k]) => ({ F, k, base: CLASS_BY_G[g] }));

  // Regime chips. Each sits at (or beside) its class coordinate; mv is the direction the
  // Morph slider travels, always into the pattern-rich interior of the band.
  const REGIMES = [
    { name: 'Mitosis', F: 0.0260, k: 0.0610, mv: [0.003, -0.0052] },
    { name: 'Coral', F: 0.0545, k: 0.0620, mv: [-0.010, 0.0035] },
    { name: 'Worms', F: 0.0460, k: 0.0650, mv: [0.000, -0.0065] },
    { name: 'Labyrinth', F: 0.0290, k: 0.0570, mv: [0.008, 0.0062] },
    { name: 'Holes', F: 0.0390, k: 0.0580, mv: [0.000, 0.0065] },
    { name: 'U-skate', F: 0.0620, k: 0.0609, mv: [-0.016, 0.0035] },
    { name: 'Writhing', F: 0.0220, k: 0.0510, mv: [0.005, 0.0095] },
    { name: 'Spot chaos', F: 0.0180, k: 0.0550, mv: [0.009, 0.0045] },
    { name: 'Wavelets', F: 0.0100, k: 0.0470, mv: [0.008, 0.0080] },
    { name: 'Solitons', F: 0.0460, k: 0.0670, mv: [0.000, -0.0080] },
  ];

  const DU = 0.25;   // grid units, dt = 1 (stable with the anisotropic stencil up to flow 0.5)

  function classify(F, k) {
    // past the saddle-node edge (k ≈ √F/2 − F) and its soliton fringe nothing survives;
    // well inside it, below the band, the dish sits in the uniform "red" state
    const edge = Math.sqrt(Math.max(F, 0)) / 2 - F;
    if (k > edge + 0.0078) return { g: '', nick: 'Extinct', what: 'an empty dish' };
    let best = null, bd = 1e9;
    for (const c of CLASSES.concat(ANCHORS)) {
      const d = Math.hypot((F - c.F) / 0.012, (k - c.k) / 0.0032);
      if (d < bd) { bd = d; best = c.base || c; }
    }
    return best;
  }

  function effFK(P) {
    const r = REGIMES[P.regime] || REGIMES[0];
    return [r.F + P.feed, r.k + P.kill];
  }
  // the far end of the morph (t = 1)
  function farFK(P) {
    const r = REGIMES[P.regime] || REGIMES[0];
    const [F, k] = effFK(P);
    if (P.field === 3) return [F + 0.009 * P.morph, k + 0.0018 * P.morph];
    return [F + r.mv[0] * P.morph, k + r.mv[1] * P.morph];
  }

  /* ---------------- shaders ---------------- */
  const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 fragColor;
`;

  // state codec: RG = a (hi, lo), BA = v (hi, lo) when packed into bytes; else R = a, G = v
  const CODEC = `
vec2 dec(vec4 t) {
#ifdef PACK
  return vec2(t.r + t.g / 255.0, t.b + t.a / 255.0);
#else
  return t.rg;
#endif
}
vec4 enc(vec2 s) {
#ifdef PACK
  s = clamp(s, 0.0, 0.99998);
  vec2 hi = floor(s * 255.0) / 255.0;
  vec2 lo = (s - hi) * 255.0;
  return vec4(hi.x, lo.x, hi.y, lo.y);
#else
  return vec4(s, 0.0, 1.0);
#endif
}
`;

  // F, k field and flow orientation, shared by init/step/display
  const FIELD = `
uniform vec2 uGrid;
uniform vec2 uFK;
uniform vec2 uMV;
uniform float uMorph;
uniform int uField;
uniform vec2 uAxis;
uniform vec2 uNoiseOff;
uniform float uCurl;
vec2 fkAt(vec2 cell) {
  vec2 q = cell / uGrid * 2.0 - 1.0;
  float asp = uGrid.x / uGrid.y;
  vec2 qa = vec2(q.x * asp, q.y);
  float t;
  if (uField == 0) {
    t = 0.5 + 0.5 * dot(qa, uAxis) / (abs(uAxis.x) * asp + abs(uAxis.y));
  } else if (uField == 1) {
    t = length(qa) / length(vec2(asp, 1.0)) * 1.25;
  } else if (uField == 2) {
    t = 0.5 + 0.9 * fbm(qa * 1.1 + uNoiseOff);
  } else {
    // a window onto the parameter plane itself: k runs across, F runs up (Munafo's map)
    return uFK + uMorph * vec2(q.y * 0.009, q.x * 0.003 - 0.0012);
  }
  t = clamp(t, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  return uFK + uMorph * t * uMV;
}
vec2 flowDir(vec2 cell) {
  vec2 q = cell / uGrid.y;
  float a = atan(uAxis.y, uAxis.x) + uCurl * 3.2 * snoise(q * 1.6 + uNoiseOff.yx);
  return vec2(cos(a), sin(a));
}
`;

  const INIT = HEAD + C.GLSL_NOISE + CODEC + FIELD + `
uniform int uSeedMode;
uniform float uDensity;
uniform vec4 uDrops[48];
uniform int uNDrops;
uniform float uSalt;
void main() {
  vec2 cell = gl_FragCoord.xy;
  float s = min(uGrid.x, uGrid.y);
  float m = 0.0;
  float wob = snoise(cell / s * 9.0 + uSalt) * 0.35 + snoise(cell / s * 23.0 - uSalt) * 0.15;
  if (uSeedMode == 0 || uSeedMode == 1) {
    for (int i = 0; i < 48; i++) {
      if (i >= uNDrops) break;
      vec4 d = uDrops[i];
      float r = length(cell - d.xy) / d.z;
      m = max(m, step(r, 1.0 + wob * d.w));
    }
  } else if (uSeedMode == 2) {
    // concentric rings about the centre
    vec2 c = uGrid * 0.5;
    float n = uDrops[0].x;
    float r = length(cell - c) / s + wob * 0.012;
    float rr = r * n / 0.44;
    float idx = floor(rr + 0.5);
    float dcell = abs(rr - idx) * 0.44 / n * s;
    m = step(dcell, 2.2) * step(0.5, idx) * step(idx, n + 0.1);
  } else if (uSeedMode == 3) {
    // inoculation: clumps scattered by a hash over 6-cell blocks
    vec2 b = floor(cell / 12.0);
    float h = hash12(b + uSalt * 13.1);
    vec2 o = hash22(b + uSalt) * 3.0 + 4.5;
    float inb = step(length(mod(cell, 12.0) - o), 3.4 + 1.8 * h);
    m = step(h, uDensity) * inb;
  } else {
    // stripes across the axis
    vec2 q = (cell - uGrid * 0.5) / s;
    float n = uDrops[0].x;
    float t = dot(q, vec2(-uAxis.y, uAxis.x)) * n + wob * 0.2;
    float dcell = abs(fract(t + 0.5) - 0.5) / n * s;
    m = step(dcell, 2.0);
  }
  float jit = hash12(cell + uSalt * 7.7);
  vec2 st = m > 0.5 ? vec2(0.5 + 0.04 * jit, 0.25 + 0.03 * (1.0 - jit)) : vec2(0.0);
  fragColor = enc(st);
}
`;

  // static per-cell field: F, k − 0.06, and the flow tensor direction (cos 2θ, sin 2θ)
  const FIELDGEN = HEAD + C.GLSL_NOISE + FIELD + `
void main() {
  vec2 cell = gl_FragCoord.xy;
  vec2 fk = fkAt(cell);
  vec2 f = flowDir(cell);
  fragColor = vec4(fk.x, fk.y - 0.06, f.x * f.x - f.y * f.y, 2.0 * f.x * f.y);
}
`;

  const STEP = HEAD + C.GLSL_NOISE + CODEC + FIELD + `
uniform sampler2D uState;
uniform sampler2D uFieldTex;
uniform vec2 uD;          // Du, Dv
uniform float uFlow;      // anisotropy 0..0.5
ivec2 gmax;
vec2 S(ivec2 p) { return dec(texelFetch(uState, clamp(p, ivec2(0), gmax), 0)); }
void main() {
  gmax = ivec2(uGrid) - 1;
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 c = S(p);
  vec2 n = S(p + ivec2(0, 1)), s = S(p + ivec2(0, -1)), e = S(p + ivec2(1, 0)), w = S(p + ivec2(-1, 0));
  vec2 ne = S(p + ivec2(1, 1)), nw = S(p + ivec2(-1, 1)), se = S(p + ivec2(1, -1)), sw = S(p + ivec2(-1, -1));
  vec2 lap = (4.0 * (n + s + e + w) + (ne + nw + se + sw) - 20.0 * c) / 6.0;
#ifdef PACK
  vec2 fk = fkAt(vec2(p) + 0.5);
  vec2 c2 = vec2(1.0, 0.0);
  if (uFlow > 0.0) { vec2 f = flowDir(vec2(p) + 0.5); c2 = vec2(f.x * f.x - f.y * f.y, 2.0 * f.x * f.y); }
#else
  vec4 fld = texelFetch(uFieldTex, p, 0);
  vec2 fk = vec2(fld.x, fld.y + 0.06);
  vec2 c2 = fld.zw;
#endif
  if (uFlow > 0.0) {
    vec2 uxx = e + w - 2.0 * c, uyy = n + s - 2.0 * c, uxy = (ne + sw - nw - se) * 0.25;
    lap += uFlow * (c2.x * (uxx - uyy) + c2.y * 2.0 * uxy);
  }
  float a = c.x, v = c.y, u = 1.0 - a;
  float r = u * v * v;
  a += uD.x * lap.x + r - fk.x * a;
  v += uD.y * lap.y + r - (fk.x + fk.y) * v;
  fragColor = enc(clamp(vec2(a, v), 0.0, 1.0));
}
`;

  const DISPLAY = HEAD + C.GLSL_NOISE + CODEC + `
uniform sampler2D uState;
uniform vec2 uGrid;
uniform vec2 uRes;
uniform vec4 uPlate;      // x0, y0, x1, y1 in 0..1 (y up)
uniform vec3 uRamp[5];
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uGloss;
uniform float uRelief;
uniform float uBands;
uniform float uTooth;
uniform float uDark;
uniform vec2 uTone;       // v window
uniform float uKey;       // keyline width in px
ivec2 gmax;
vec2 T(ivec2 p) { return dec(texelFetch(uState, clamp(p, ivec2(0), gmax), 0)); }
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(uRamp[0], uRamp[1], t);
  if (t < 2.0) return mix(uRamp[1], uRamp[2], t - 1.0);
  if (t < 3.0) return mix(uRamp[2], uRamp[3], t - 2.0);
  return mix(uRamp[3], uRamp[4], t - 3.0);
}
// cubic B-spline sample of v with its gradient (per texel)
vec3 sampleV(vec2 g) {
  g -= 0.5;
  vec2 i = floor(g), f = g - i;
  vec2 f2 = f * f, f3 = f2 * f, o = 1.0 - f;
  vec2 w0 = o * o * o / 6.0, w1 = (3.0 * f3 - 6.0 * f2 + 4.0) / 6.0, w2 = (-3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0) / 6.0, w3 = f3 / 6.0;
  vec2 d0 = -0.5 * o * o, d1 = 1.5 * f2 - 2.0 * f, d2 = -1.5 * f2 + f + 0.5, d3 = 0.5 * f2;
  float wx[4] = float[4](w0.x, w1.x, w2.x, w3.x), wy[4] = float[4](w0.y, w1.y, w2.y, w3.y);
  float dx[4] = float[4](d0.x, d1.x, d2.x, d3.x), dy[4] = float[4](d0.y, d1.y, d2.y, d3.y);
  vec3 acc = vec3(0.0);
  ivec2 b = ivec2(i) - 1;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    float v = T(b + ivec2(x, y)).y;
    acc += v * vec3(wx[x] * wy[y], dx[x] * wy[y], wx[x] * dy[y]);
  }
  return acc;
}
void main() {
  gmax = ivec2(uGrid) - 1;
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes;
  float H = uRes.y;
  // paper tooth, fixed to the page (not the pixel grid)
  vec2 pq = uv * vec2(uRes.x / uRes.y, 1.0);
  float tooth = (snoise(pq * 420.0) * 0.6 + snoise(pq * 150.0 + 3.1) * 0.4);
  float fibre = snoise(vec2(pq.x * 60.0, pq.y * 900.0)) * 0.5;
  vec2 lo = uPlate.xy, hi = uPlate.zw;
  bool inside = all(greaterThanEqual(uv, lo)) && all(lessThanEqual(uv, hi));
  vec3 col;
  if (!inside) {
    col = uPaper;
  } else {
    vec2 g = (uv - lo) / (hi - lo) * uGrid;
    vec3 sv = sampleV(g);
    float v = sv.x;
    float sp = uTone.y - uTone.x;
    float t = smoothstep(uTone.x + 0.14 * sp, uTone.y - 0.18 * sp, v);
    float tq = t;
    if (uBands > 0.5) {
      float n = uBands;
      float x = t * n;
      float fw = max(fwidth(x), 1e-4);
      float fl = floor(x);
      float fr = x - fl;
      tq = (fl + smoothstep(1.0 - fw, 1.0, fr)) / n;
      tq = mix(t, tq, 0.92);
    }
    col = ramp(tq);
    if (uBands > 0.5) {
      // engraved contour at every band edge
      float x = t * uBands;
      float fw = max(fwidth(x), 1e-4);
      float d = abs(fract(x + 0.5) - 0.5) / fw;
      float line = 1.0 - smoothstep(0.35, 1.25, d);
      line *= smoothstep(0.02, 0.1, t) * 0.55;
      col = mix(col, uInk, line);
    }
    if (uRelief > 0.0) {
      vec2 grad = sv.yz / max(uTone.y - uTone.x, 0.04);
      vec3 nrm = normalize(vec3(-grad * 4.5 * uRelief, 1.0));
      vec3 L = normalize(vec3(-0.55, 0.65, 0.55));
      float dif = dot(nrm, L);
      float amb = dot(vec3(0.0, 0.0, 1.0), L);
      float shade = 1.0 + (dif - amb) * 1.1 * uRelief;
      vec3 Hh = normalize(L + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(nrm, Hh), 0.0), 60.0) * uGloss * uRelief;
      col = col * shade + spec * mix(vec3(1.0), col * 1.6, 0.25) * 0.55;
    }
  }
  float tg = uTooth * (uDark > 0.5 ? 0.035 : 0.055);
  col *= 1.0 + tg * tooth + tg * 0.6 * fibre;
  // keyline around the plate
  if (uKey > 0.0) {
    vec2 pl = (lo) * uRes, ph = hi * uRes;
    vec2 dd = max(pl - px, px - ph);
    float out_ = max(dd.x, dd.y);
    float kl = 1.0 - smoothstep(uKey * 0.5, uKey * 0.5 + 1.0, abs(out_ - uKey * 1.5));
    col = mix(col, uInk, kl * 0.8);
  }
  col += (hash12(px) - 0.5) / 255.0;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

  /* ---------------- palettes ---------------- */
  // ramp: ground → figure. dark: ground is dark (light-emitting palettes).
  const PALETTES = [
    { name: 'Celadon', colors: ['#e9ede2', '#c3d5bf', '#93b5a0', '#5d8c7a', '#35604f'], paper: '#eeefe6', ink: '#2c4a3f', gloss: 1.0 },
    { name: 'Coral & Bone', colors: ['#f2eadc', '#efd2bc', '#e59a7e', '#cc5b45', '#862b26'], paper: '#f4ede2', ink: '#5a1f1c', gloss: 0.45 },
    { name: 'Sumi', colors: ['#f4f0e7', '#d8d2c6', '#8e8a82', '#3b3937', '#131313'], paper: '#f5f1e8', ink: '#111111', gloss: 0.0 },
    { name: 'Aizome', colors: ['#f3f0e6', '#cad3dc', '#6f89aa', '#2c4a79', '#132343'], paper: '#f3f0e7', ink: '#0f1c38', gloss: 0.15 },
    { name: 'Maki-e', colors: ['#0c0a09', '#261c12', '#7a5a26', '#c9a24a', '#f4dd90'], paper: '#0e0c0a', ink: '#c9a24a', gloss: 1.0, dark: true },
    { name: 'Acid', colors: ['#08020f', '#4c0fb0', '#ff2bd6', '#ffb321', '#eaff4a'], paper: '#0a0412', ink: '#ff2bd6', gloss: 0.7, dark: true },
    { name: 'Blacklight', colors: ['#04031a', '#1c0d66', '#00d9ff', '#3dff6e', '#fbfff0'], paper: '#05041a', ink: '#00d9ff', gloss: 0.8, dark: true },
    { name: 'Spectral', colors: ['#0b1446', '#1f5fc4', '#22c7c0', '#f5de4a', '#e5392a'], paper: '#0b1446', ink: '#f5de4a', gloss: 0.5, dark: true },
    { name: 'Nudibranch', colors: ['#1d0830', '#6a1fb0', '#ff7a1a', '#ffd23f', '#fff8ec'], paper: '#1d0830', ink: '#ffd23f', gloss: 0.8, dark: true },
  ];

  /* ---------------- params ---------------- */
  const SEEDINGS = ['Centre drop', 'Scattered', 'Rings', 'Inoculum', 'Stripes'];
  const FIELDS = ['Sweep', 'Radial', 'Mottled', 'Map'];

  const PARAMS = [
    { k: 'regime', g: 'Chemistry', label: 'Regime', type: 'select', options: REGIMES.map((r) => r.name), def: 0 },
    { k: 'feed', g: 'Chemistry', label: 'Feed F', min: -0.006, max: 0.006, step: 0.0001, def: 0 },
    { k: 'kill', g: 'Chemistry', label: 'Kill k', min: -0.003, max: 0.003, step: 0.0001, def: 0 },
    { k: 'ratio', g: 'Chemistry', label: 'Diffusion ratio', min: 1.7, max: 2.6, step: 0.05, def: 2 },

    { k: 'morph', g: 'Field', label: 'Morph', min: 0, max: 1, step: 0.01, def: 0.8,
      names: [[0, 'Uniform'], [0.05, 'Drift'], [0.35, 'Gradient'], [0.75, 'Full sweep']] },
    { k: 'field', g: 'Field', label: 'Morph field', type: 'select', options: FIELDS, def: 0 },
    { k: 'axis', g: 'Field', label: 'Axis', min: 0, max: 180, step: 1, def: 0 },
    { k: 'flow', g: 'Field', label: 'Flow', min: 0, max: 1, step: 0.01, def: 0,
      names: [[0, 'Isotropic'], [0.05, 'Grained'], [0.35, 'Combed'], [0.7, 'Streaming']] },
    { k: 'curl', g: 'Field', label: 'Curl', min: 0, max: 1, step: 0.01, def: 0,
      names: [[0, 'Straight'], [0.05, 'Wavering'], [0.35, 'Swirling'], [0.7, 'Whorled']] },

    { k: 'seeding', g: 'Growth', label: 'Seeding', type: 'select', options: SEEDINGS, def: 3 },
    { k: 'density', g: 'Growth', label: 'Seed density', min: 0, max: 1, step: 0.01, def: 0.55,
      names: [[0, 'Sparse'], [0.3, 'Scattered'], [0.65, 'Crowded']] },
    { k: 'scale', g: 'Growth', label: 'Scale', min: 0, max: 1, step: 0.01, def: 0.5 },
    { k: 'maturity', g: 'Growth', label: 'Maturity', min: 0, max: 1, step: 0.01, def: 0.7,
      names: [[0, 'Nascent'], [0.25, 'Spreading'], [0.55, 'Mature'], [0.85, 'Aged']] },

    { k: 'relief', g: 'Glaze', label: 'Relief', min: 0, max: 1, step: 0.01, def: 0.5,
      names: [[0, 'Flat'], [0.05, 'Low relief'], [0.35, 'Embossed'], [0.7, 'Carved']] },
    { k: 'bands', g: 'Glaze', label: 'Contours', min: 0, max: 12, step: 1, def: 0,
      names: [[0, 'None'], [2, 'Terraced'], [5, 'Contoured'], [9, 'Engraved']] },
    { k: 'tooth', g: 'Glaze', label: 'Paper tooth', min: 0, max: 1, step: 0.01, def: 0.4,
      names: [[0, 'Smooth'], [0.2, 'Vellum'], [0.5, 'Cold-pressed'], [0.8, 'Rough']] },
    { k: 'margin', g: 'Glaze', label: 'Margin', min: 0, max: 1, step: 0.01, def: 0.3,
      names: [[0, 'Full bleed'], [0.02, 'Narrow'], [0.3, 'Plate'], [0.7, 'Wide']] },
  ];

  const PB = Object.fromEntries(PARAMS.map((p) => [p.k, p]));
  function axisName(a) {
    return a < 12 || a > 168 ? 'Horizontal' : a < 35 ? 'Low rise' : a < 57 ? 'Diagonal' : a < 80 ? 'Steep rise' : a <= 100 ? 'Vertical' : a < 123 ? 'Steep fall' : a < 146 ? 'Counter-diagonal' : 'Low fall';
  }

  /* ---------------- derived geometry (pure functions of P) ---------------- */
  function marginFrac(P) { return P.margin < 0.02 ? 0 : 0.02 + P.margin * 0.1; }
  function gridSize(P) {
    const a = C.FORMATS[P.format].a;
    const m = marginFrac(P);
    // plate aspect after an even margin measured on the short side
    const W = a - 2 * m * Math.min(a, 1), H = 1 - 2 * m * Math.min(a, 1);
    const pa = W / H;
    const L = Math.round(460 - 270 * P.scale);      // long side in cells
    let gw, gh;
    if (pa >= 1) { gw = L; gh = Math.round(L / pa); } else { gh = L; gw = Math.round(L * pa); }
    return { gw: Math.max(16, gw), gh: Math.max(16, gh), L, plate: [W, H], m };
  }
  function totalSteps(P) {
    const { L } = gridSize(P);
    const base = 2400 + 8800 * Math.pow(P.maturity, 1.25);
    return Math.round(base * Math.max(0.8, Math.min(1.25, L / 320)) / 10) * 10;
  }

  /* ---------------- module ---------------- */
  function fmt4(x) { return x.toFixed(4).replace(/^0/, '').replace(/^-0/, '−'); }

  function morphTarget(P) {
    const far = classify(...farFK(P)), near = classify(...effFK(P));
    return far === near ? 'within class' : `→ ${far.g ? far.g + ' ' : ''}${far.nick}`;
  }

  function regimeName(P) {
    const [F, k] = effFK(P);
    const c = classify(F, k);
    return c.g ? `${c.g} ${c.nick}` : c.nick;
  }

  C.register({
    id: 'reaction-diffusion',
    name: 'Reaction–Diffusion',
    group: 'process',
    order: 4,
    renderer: 'webgl',
    animated: true,
    restartDelay: 90,
    subtitle: 'Gray-Scott morphogenesis',
    about: 'Two chemicals diffuse across a dish: U is fed in at rate F, V feeds on U and is killed at rate k. Tiny changes to F and k give spots that divide, worms, mazes, holes or restless wavelets. Regime names are John Pearson’s 1993 classes as extended in Robert Munafo’s xmorphia catalogue.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 2, 1.3, 0.7],
    defaults: { seed: 2718, format: 0, palette: 0 },
    palettes: PALETTES,
    paletteOdds: [3, 2.5, 2, 2, 1.5, 1.6, 1.4, 1.4, 1.2],
    params: PARAMS,

    randomize(R) {
      const o = {};
      const pal = C.pickWeighted(R, [3, 2.5, 2, 2, 1.5, 1.6, 1.4, 1.4, 1.2]);
      o.palette = pal;
      const dark = !!PALETTES[pal].dark;
      o.regime = C.pickWeighted(R, [1.4, 1.4, 1.1, 1.3, 1.1, 0.8, 0.8, 0.6, 0.4, 0.5]);
      const nudge = R() < 0.45;
      o.feed = nudge ? R.gauss() * 0.0008 : 0;
      o.kill = nudge ? R.gauss() * 0.0004 : 0;
      o.ratio = R() < 0.7 ? 2 : R.range(1.85, 2.3);
      // field: most dishes are uniform or a sweep; radial, mottled and the (F, k) map are rarer
      if (R() < 0.42) { o.morph = 0; o.field = 0; }
      else {
        o.morph = R.range(0.35, 1);
        // the (F, k) map only for regimes that sit mid-band; at the band's edges half of it is empty
        o.field = C.pickWeighted(R, [4.5, 2, 2.5, o.regime <= 3 ? 0.8 : 0]);
      }
      o.axis = R() < 0.5 ? R.pick([0, 90, 90, 45, 135]) : R.range(0, 180);
      const edge = [0, 2, 9].includes(o.regime);        // near the extinction edge: flow can kill them
      if (R() < 0.68) { o.flow = 0; o.curl = 0; }
      else { o.flow = edge ? R.range(0.2, 0.45) : R.range(0.25, 0.85); o.curl = R() < 0.45 ? 0 : R.range(0.2, 0.9); }
      // seeding: fast growers may be a single colony; slow growers are sown widely
      // sheets (holes, U-skate) need many nuclei; slow growers are sown widely; the rest may be one colony
      const slow = [0, 2, 8, 9].includes(o.regime), sheet = o.regime === 4 || o.regime === 5;
      o.seeding = sheet ? C.pickWeighted(R, [0, 1, 0, 1, 0]) : slow ? C.pickWeighted(R, [0.6, 4, 0.6, 3, 0.6]) : C.pickWeighted(R, [2.4, 3, 0.9, 3, 0.9]);
      o.density = o.seeding === 1 ? R.range(0.5, 0.95) : R.range(0.3, 0.8);
      o.scale = Math.min(1, Math.max(0.1, 0.55 + R.gauss() * 0.22));
      o.maturity = o.seeding === 0 ? R.range(0.6, 1) : o.seeding === 1 || slow ? R.range(0.55, 0.95) : R.range(0.35, 0.85);
      // glaze: glossy relief suits the ceramics and lacquer, ink stays flat
      const flat = PALETTES[pal].name === 'Sumi' || PALETTES[pal].name === 'Aizome';
      o.relief = flat ? (R() < 0.6 ? 0 : R.range(0.05, 0.3)) : dark ? R.range(0, 0.6) : R.range(0.25, 0.85);
      o.bands = R() < 0.68 ? 0 : R.int(3, 10);
      o.tooth = R.range(0.15, 0.6);
      o.margin = R() < 0.25 ? 0 : R.range(0.15, 0.6);
      return o;
    },

    traitName(k, P) {
      if (k === 'regime') return regimeName(P);
      if (k === 'feed') return 'F ' + fmt4(effFK(P)[0]);
      if (k === 'kill') return 'k ' + fmt4(effFK(P)[1]);
      if (k === 'ratio') return P.ratio.toFixed(2) + ' : 1';
      if (k === 'morph' && P.morph >= 0.05) {
        const far = classify(...farFK(P));
        const near = classify(...effFK(P));
        if (far !== near && P.field !== 3) return `→ ${far.g ? far.g + ' ' : ''}${far.nick}`;
      }
      if (k === 'axis') return axisName(P.axis);
      if (k === 'scale') return `~${Math.round(gridSize(P).L / 11)} cells across`;
      if (k === 'maturity') return `${C.nameFrom(PB.maturity, P.maturity)} · ${totalSteps(P)} steps`;
      return null;
    },

    caption(P) {
      const [F, k] = effFK(P);
      const c = classify(F, k);
      const pal = PALETTES[P.palette].name;
      let s = `${c.g ? c.g + ' ' : ''}${c.nick} in ${pal}: ${c.what}`;
      if (P.morph >= 0.05) {
        const far = classify(...farFK(P));
        if (P.field === 3) s += ', laid out across its own patch of the (F, k) map';
        else if (far !== c) s += `, ${['grading', 'ringed', 'mottled'][P.field]} into ${far.what}`;
      }
      const seed = ['a single drop', 'scattered drops', 'concentric rings', 'a dusted inoculum', 'ruled stripes'][P.seeding];
      s += `; grown from ${seed}`;
      if (P.flow >= 0.05) s += P.curl >= 0.35 ? ' and whorled by the flow' : ' and combed along the flow';
      return s + '.';
    },

    sheet(P) {
      const [F, k] = effFK(P);
      const glaze = [];
      if (P.relief >= 0.05) glaze.push(C.nameFrom(PB.relief, P.relief).toLowerCase());
      if (P.bands > 0) glaze.push(`${P.bands} contours`);
      return [
        ['Palette', PALETTES[P.palette].name],
        ['Format', C.FORMATS[P.format].label],
        ['Regime', regimeName(P)],
        ['Feed · kill', `F ${fmt4(F)} · k ${fmt4(k)}`],
        ['Morph', P.morph < 0.05 ? 'Uniform' : P.field === 3 ? `Map ±${(0.009 * P.morph).toFixed(3)} F` : `${FIELDS[P.field]} ${morphTarget(P)}`],
        ['Flow', P.flow < 0.05 ? 'Isotropic' : `${C.nameFrom(PB.flow, P.flow)}${P.curl >= 0.05 ? ', ' + C.nameFrom(PB.curl, P.curl).toLowerCase() : ''}, ${axisName(P.axis).toLowerCase()}`],
        ['Diffusion', `Du/Dv ${P.ratio.toFixed(2)}`],
        ['Seeding', SEEDINGS[P.seeding]],
        ['Scale', `~${Math.round(gridSize(P).L / 11)} cells across`],
        ['Maturity', `${totalSteps(P)} steps`],
        ['Glaze', glaze.length ? glaze.join(', ') : 'flat'],
      ];
    },

    setup(p) {
      const gl = p._renderer.GL;
      const st = { gl, fmt: null, pack: false };
      // pick the best render-target format this device really gives us
      const tryFmt = (f) => {
        const fb = p.createFramebuffer({ width: 4, height: 4, density: 1, format: f, channels: p.RGBA, depth: false, antialias: false, textureFiltering: p.NEAREST });
        const ok = fb.format === f;
        fb.remove();
        return ok;
      };
      if (tryFmt(p.FLOAT)) st.fmt = p.FLOAT;
      else if (tryFmt(p.HALF_FLOAT)) st.fmt = p.HALF_FLOAT;
      else { st.fmt = p.UNSIGNED_BYTE; st.pack = true; }
      const def = st.pack ? '#define PACK 1\n' : '';
      const withDef = (src) => src.replace('out vec4 fragColor;\n', 'out vec4 fragColor;\n' + def);
      st.shInit = p.createShader(C.VERT, withDef(INIT));
      st.shStep = p.createShader(C.VERT, withDef(STEP));
      st.shField = st.pack ? null : p.createShader(C.VERT, withDef(FIELDGEN));
      st.shDisp = p.createShader(C.VERT, withDef(DISPLAY));
      st.fbs = null;
      st.gw = 0; st.gh = 0;
      st.spf = 24;          // steps per frame, adapts to the device
      st.lastT = 0;
      return st;
    },

    start(p, P, st) {
      const { gw, gh } = gridSize(P);
      if (!st.fbs || st.gw !== gw || st.gh !== gh) {
        if (st.fbs) st.fbs.forEach((f) => f.remove());
        const opts = { width: gw, height: gh, density: 1, format: st.fmt, channels: p.RGBA, depth: false, antialias: false, textureFiltering: p.NEAREST };
        st.fbs = [p.createFramebuffer(opts), p.createFramebuffer(opts)];
        if (st.fbField) st.fbField.remove();
        st.fbField = st.pack ? null : p.createFramebuffer(opts);
        st.gw = gw; st.gh = gh;
      }
      st.P = P;
      st.step = 0;
      st.total = totalSteps(P);
      st.cur = 0;
      st.lastT = 0;
      st.frames = 0;
      st.tone = [0.0, 0.3];
      st.needInit = true;
    },

    frame(p, P, st) {
      const gl = st.gl;
      if (st.needInit) { initState(p, P, st); st.needInit = false; }
      // adapt steps/frame to how fast frames actually come back (GPU-bound devices)
      const now = performance.now();
      if (st.lastT) {
        const dt = now - st.lastT;
        if (dt > 45) st.spf = Math.max(4, Math.floor(st.spf * 0.75));
        else if (dt < 24) st.spf = Math.min(160, Math.ceil(st.spf * 1.15));
      }
      st.lastT = now;
      const within = C.budget(11);
      let n = 0;
      p.blendMode(p.REPLACE);   // exact writes: the state's alpha may carry data
      const [F, k] = effFK(P);
      while (st.step < st.total && n < st.spf && within()) {
        const src = st.fbs[st.cur], dst = st.fbs[1 - st.cur];
        dst.begin();
        p.noStroke();
        p.shader(st.shStep);
        setField(st.shStep, P, st, F, k);
        st.shStep.setUniform('uState', src);
        if (!st.pack) st.shStep.setUniform('uFieldTex', st.fbField);
        st.shStep.setUniform('uD', [DU, DU / P.ratio]);
        st.shStep.setUniform('uFlow', P.flow * 0.5);
        p.rect(0, 0, 1, 1);
        dst.end();
        st.cur = 1 - st.cur;
        st.step++; n++;
      }
      p.blendMode(p.BLEND);
      const done = st.step >= st.total;
      st.frames++;
      if (done || st.frames % 6 === 1) measure(st, done ? 1 : 0.6);
      drawDisplay(p, P, st, C.bufferSize(p));
      return !done;
    },

    progress(st) { return st.total ? st.step / st.total : 0; },

    exportAt(p, P, W, H, st) {
      const gl = st.gl;
      if (st.needInit) { initState(p, P, st); st.needInit = false; measure(st, 1); }
      const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      const s = Math.min(1, max / Math.max(W, H));
      const w = Math.floor(W * s), h = Math.floor(H * s);
      const fb = p.createFramebuffer({ width: w, height: h, density: 1, format: p.UNSIGNED_BYTE, channels: p.RGBA, depth: false, antialias: false });
      fb.begin();
      drawDisplay(p, P, st, [w, h]);
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      fb.end();
      fb.remove();
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      const ctx = tmp.getContext('2d');
      const img = ctx.createImageData(w, h);
      const row = w * 4;
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      ctx.putImageData(img, 0, 0);
      c.getContext('2d').drawImage(tmp, 0, 0, W, H);
      return c;
    },

    dispose(p, st) {
      if (st.fbs) st.fbs.forEach((f) => f.remove());
      if (st.fbField) st.fbField.remove();
      st.fbs = null; st.fbField = null;
    },
  });

  function setField(sh, P, st, F, k) {
    const th = P.axis * Math.PI / 180;
    const R = C.rng(P.seed ^ 0x2e11);
    sh.setUniform('uGrid', [st.gw, st.gh]);
    sh.setUniform('uFK', [F, k]);
    sh.setUniform('uMV', (REGIMES[P.regime] || REGIMES[0]).mv);
    sh.setUniform('uMorph', P.morph);
    sh.setUniform('uField', P.field);
    sh.setUniform('uAxis', [Math.cos(th), Math.sin(th)]);
    sh.setUniform('uNoiseOff', [R() * 40, R() * 40]);
    sh.setUniform('uCurl', P.curl);
  }

  function initState(p, P, st) {
    const gl = st.gl;
    const R = C.rng(P.seed ^ 0x51f3);
    const { gw, gh } = st;
    const s = Math.min(gw, gh);
    const drops = [];
    let n = 0;
    const d = P.density;
    if (P.seeding === 0) {
      // one irregular drop, a little off-centre, with a satellite or two when dense
      const r0 = s * (0.06 + 0.08 * d);
      drops.push([gw * (0.5 + R.range(-0.04, 0.04)), gh * (0.5 + R.range(-0.04, 0.04)), r0, 1]);
      const extra = Math.floor(d * 3.2);
      for (let i = 0; i < extra; i++) {
        const a = R() * Math.PI * 2, rr = r0 * R.range(1.1, 1.8);
        drops.push([drops[0][0] + Math.cos(a) * rr, drops[0][1] + Math.sin(a) * rr, r0 * R.range(0.25, 0.5), 1]);
      }
    } else if (P.seeding === 1) {
      const N = Math.round(6 + d * d * 40);
      for (let i = 0; i < N; i++) drops.push([R() * gw, R() * gh, Math.max(5, s * R.range(0.02, 0.04)), 0.8]);
    } else if (P.seeding === 2) {
      drops.push([1 + Math.round(d * 4), 0, 0, 0]);
    } else if (P.seeding === 4) {
      drops.push([2 + Math.round(d * 9), 0, 0, 0]);
    }
    n = drops.length;
    const flat = [];
    for (let i = 0; i < 48; i++) { const q = drops[i] || [0, 0, 1, 0]; flat.push(q[0], q[1], q[2], q[3]); }
    const dst = st.fbs[st.cur];
    p.blendMode(p.REPLACE);   // exact writes: the state's alpha may carry data
    if (!st.pack) {
      st.fbField.begin();
      p.noStroke();
      p.shader(st.shField);
      setField(st.shField, P, st, ...effFK(P));
      p.rect(0, 0, 1, 1);
      st.fbField.end();
    }
    dst.begin();
    p.noStroke();
    p.shader(st.shInit);
    const [F, k] = effFK(P);
    setField(st.shInit, P, st, F, k);
    st.shInit.setUniform('uSeedMode', P.seeding);
    st.shInit.setUniform('uDensity', 0.1 + 0.55 * d * d);
    st.shInit.setUniform('uDrops', flat);
    st.shInit.setUniform('uNDrops', n);
    st.shInit.setUniform('uSalt', R() * 100);
    p.rect(0, 0, 1, 1);
    dst.end();
    p.blendMode(p.BLEND);
  }

  // auto-levels: read the state back and set the tone window from the v histogram
  function measure(st, mix) {
    const gl = st.gl, fb = st.fbs[st.cur];
    const w = st.gw, h = st.gh, n = w * h;
    fb.begin();
    if (st.pack) {
      if (!st.rb8 || st.rb8.length !== n * 4) st.rb8 = new Uint8Array(n * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, st.rb8);
    } else {
      if (!st.rbF || st.rbF.length !== n * 4) st.rbF = new Float32Array(n * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, st.rbF);
    }
    fb.end();
    const B = 256, hist = new Uint32Array(B);
    let cnt = 0;
    for (let i = 0; i < n; i += 3) {
      const v = st.pack ? (st.rb8[i * 4 + 2] + st.rb8[i * 4 + 3] / 255) / 255 : st.rbF[i * 4 + 1];
      hist[Math.min(B - 1, Math.max(0, Math.floor(v / 0.5 * B)))]++;
      cnt++;
    }
    const pct = (q) => { let acc = 0; const target = q * cnt; for (let b = 0; b < B; b++) { acc += hist[b]; if (acc >= target) return (b + 0.5) / B * 0.5; } return 0.5; };
    let lo = Math.max(0, pct(0.004) - 0.004), hi = pct(0.997);
    hi = Math.max(hi, lo + 0.12);
    st.tone = [st.tone[0] + (lo - st.tone[0]) * mix, st.tone[1] + (hi - st.tone[1]) * mix];
  }

  function drawDisplay(p, P, st, res) {
    const pal = PALETTES[P.palette];
    const [w, h] = res;
    const m = marginFrac(P);
    const a = w / h;
    const mx = m * Math.min(a, 1) / a, my = m * Math.min(a, 1);
    const sh = st.shDisp;
    p.noStroke();
    p.shader(sh);
    sh.setUniform('uState', st.fbs[st.cur]);
    sh.setUniform('uGrid', [st.gw, st.gh]);
    sh.setUniform('uRes', [w, h]);
    sh.setUniform('uPlate', [mx, my, 1 - mx, 1 - my]);
    const ramp = [];
    pal.colors.forEach((c) => ramp.push(...C.hexRGB(c)));
    sh.setUniform('uRamp', ramp);
    sh.setUniform('uPaper', C.hexRGB(pal.paper));
    sh.setUniform('uInk', C.hexRGB(pal.ink));
    sh.setUniform('uGloss', pal.gloss);
    sh.setUniform('uRelief', P.relief);
    sh.setUniform('uBands', P.bands);
    sh.setUniform('uTooth', P.tooth);
    sh.setUniform('uDark', pal.dark ? 1 : 0);
    sh.setUniform('uTone', st.tone);
    sh.setUniform('uKey', m > 0 ? Math.max(1, h / 900) : 0);
    p.rect(0, 0, p.width, p.height);
  }
})();
