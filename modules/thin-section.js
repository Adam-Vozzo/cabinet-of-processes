/* Thin Section — a rock slice 30 µm thick under a polarizing microscope.
   Grains are Voronoi cells; each has a mineral and a random optic orientation. Under crossed polars a
   grain passes sin²(2θ)·sin²(πΓ/λ) of the light at each wavelength (θ: extinction direction against the
   polarizer, Γ: retardation = thickness × birefringence × orientation). Summing that over the visible
   spectrum with analytic CIE matching curves (Wyman, Sloan & Shirley 2013) gives the Michel-Lévy
   interference colours; rotating the stage sends grains to extinction every 90°. */
(function () {
  const C = window.Cabinet;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ------------------------------------------------------------ minerals */
  // index: 0 Qz 1 Pl 2 Kfs 3 Ol 4 Cpx 5 Opx 6 Hbl 7 Bt 8 Ms 9 Cal 10 Grt 11 Opq 12 Glass 13 Epoxy 14 Chl 15 Srp 16 Ser 17 Idd
  const MIN = ['quartz', 'plagioclase', 'K-feldspar', 'olivine', 'augite', 'orthopyroxene', 'hornblende', 'biotite', 'muscovite',
    'calcite', 'garnet', 'magnetite', 'glass', 'epoxy', 'chlorite', 'serpentine', 'sericite', 'iddingsite'];
  const DN = [0.009, 0.0085, 0.007, 0.036, 0.024, 0.012, 0.022, 0.05, 0.04, 0.172, 0, 0, 0, 0, 0.004, 0.008, 0.04, 0.04];

  /* rock presets: texture 0 equigranular, 1 porphyritic, 2 foliated, 3 clastic.
     mixA = main grains (phenocrysts for porphyritic, quartz-rich layers for foliated),
     mixB = groundmass interstitials / mica-rich layers. Weights by mineral index. */
  const ROCKS = [
    { name: 'Granite', bnd: [0.2, 0.07, 0.008, 0.35], jit: 0.9, base: 0.7, tex: 0, grain: [0.55, 0.85], mixA: { 0: 32, 1: 26, 2: 28, 7: 9, 8: 4, 11: 1 }, mixB: { 0: 1 }, olAlt: 0, fol: 0,
      desc: 'quartz, perthitic microcline and twinned plagioclase with biotite' },
    { name: 'Basalt', bnd: [0.15, 0.03, 0, 0.2], jit: 0.9, base: 0.75, tex: 1, grain: [0.5, 0.75], mixA: { 3: 45, 1: 35, 4: 20 }, mixB: { 4: 40, 11: 12, 12: 48 }, olAlt: 1, fol: 0,
      desc: 'olivine and plagioclase phenocrysts in a groundmass of plagioclase laths, augite and glass' },
    { name: 'Gabbro', bnd: [0.17, 0.018, 0, 0.25], jit: 0.85, base: 0.8, tex: 0, grain: [0.65, 0.95], mixA: { 1: 52, 4: 30, 3: 10, 5: 4, 11: 4 }, mixB: { 0: 1 }, olAlt: 0, fol: 0,
      desc: 'twinned plagioclase, augite and olivine' },
    { name: 'Peridotite', bnd: [0.2, 0.045, 0.004, 0.22], jit: 0.85, base: 0.6, tex: 0, grain: [0.55, 0.85], mixA: { 3: 72, 5: 18, 4: 7, 11: 3 }, mixB: { 0: 1 }, olAlt: 0, fol: 0,
      desc: 'olivine with orthopyroxene, veined with serpentine' },
    { name: 'Marble', bnd: [0.05, 0.0, 0.0, 0.16], jit: 0.8, base: 0.38, tex: 0, grain: [0.4, 0.7], mixA: { 9: 94, 0: 3, 8: 3 }, mixB: { 0: 1 }, olAlt: 0, fol: 0,
      desc: 'a granoblastic mosaic of twinned calcite' },
    { name: 'Schist', bnd: [0.12, 0.04, 0.022, 0.15], jit: 0.9, base: 0.2, tex: 2, grain: [0.3, 0.55], mixA: { 0: 78, 1: 12, 8: 6, 7: 3, 11: 1 }, mixB: { 8: 55, 7: 38, 0: 5, 11: 2 }, olAlt: 0, fol: 0.7,
      desc: 'muscovite and biotite folia around quartz, with garnet porphyroblasts' },
    { name: 'Sandstone', bnd: [0.08, 0.02, 0.02, 0.28], jit: 0.9, base: 0.3, tex: 3, grain: [0.3, 0.5], mixA: { 0: 84, 2: 7, 1: 3, 8: 3, 11: 1, 5: 2 }, mixB: { 0: 1 }, olAlt: 0, fol: 0,
      desc: 'rounded quartz grains with blue-dyed pore space' },
  ];
  const ROCK_NAMES = ROCKS.map((r) => r.name);

  function cumul(mix) {
    const w = new Array(18).fill(0);
    for (const k in mix) w[+k] = mix[k];
    const t = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    return w.map((v) => (acc += v / t));
  }

  /* ------------------------------------------------------------ light */
  function cmf(l) {
    const g = (x, m, s1, s2) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
    return [
      1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
      0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
      1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
    ];
  }
  function planck(l, T) { const m = l * 1e-9; return 1 / (Math.pow(m, 5) * (Math.exp(1.4388e-2 / (m * T)) - 1)); }
  const xyz2rgb = (c) => [3.2406 * c[0] - 1.5372 * c[1] - 0.4986 * c[2], -0.9689 * c[0] + 1.8758 * c[1] + 0.0415 * c[2], 0.0557 * c[0] - 0.2040 * c[1] + 1.0570 * c[2]];
  const NL = 16;
  const lightCache = {};
  function light(T, wb) {
    const key = T + ':' + wb;
    if (lightCache[key]) return lightCache[key];
    const W = [];
    let ny = 0;
    for (let i = 0; i < NL; i++) {
      const l = 400 + 20 * i, s = planck(l, T), c = cmf(l);
      W.push(c.map((v) => v * s));
      ny += c[1] * s;
    }
    const uW = [];
    const wx = [0, 0, 0];
    W.forEach((c) => { c.forEach((v, k) => { uW.push(v / ny); wx[k] += v / ny; }); });
    const wr = xyz2rgb(wx);
    const uWB = wr.map((v) => 1 / lerp(1, v, wb));
    return (lightCache[key] = { uW, uWB, white: wr.map((v, k) => v * uWB[k]) });
  }

  const PALETTES = [
    { name: 'Halogen', colors: ['#120e0a', '#e8c98f', '#c1453c', '#3d6fb8', '#d9d25c'], T: 3200, wb: 0.62, mode: 0, expo: 1.0 },
    { name: 'Daylight', colors: ['#0b0c0f', '#f2f0ea', '#b7417e', '#2f8fc4', '#e2cf4a'], T: 5600, wb: 0.96, mode: 0, expo: 1.0 },
    { name: 'Monochrome', colors: ['#0d0d0d', '#595959', '#9a9a9a', '#d6d6d6', '#f4f4f4'], T: 5200, wb: 1, mode: 1, expo: 1.05 },
    { name: 'Sepia plate', colors: ['#1c130c', '#5a3d25', '#9b7650', '#d4b88f', '#f1e4c9'], T: 4200, wb: 1, mode: 2, expo: 1.05 },
    { name: 'Orientation map', colors: ['#000000', '#ff3b5c', '#ffd23b', '#3bffb0', '#3b7bff'], T: 5600, wb: 1, mode: 3, expo: 1 },
    { name: 'Cathodoluminescence', colors: ['#050507', '#3340c9', '#5fa8ff', '#9ee36b', '#ff8a2b'], T: 5600, wb: 1, mode: 4, expo: 1 },
  ];

  /* ------------------------------------------------------------ shader */
  const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uRes;
uniform vec2 uOff;
uniform float uAspect;
uniform float uTex;
uniform float uMixA[18];
uniform float uMixB[18];
uniform float uGrain;
uniform float uFieldMM;
uniform float uFabric;
uniform float uFolAng;
uniform float uAbund;
uniform vec4 uBnd;      // boundary character: warp, lobes, suture, size spread (power weights)
uniform float uJit;
uniform float uZoning;
uniform float uTwin;
uniform float uStrain;
uniform float uFract;
uniform float uAlter;
uniform float uOlAlt;
uniform float uPolars;
uniform float uStage;
uniform float uThick;
uniform float uField;
uniform float uMode;
uniform float uExpo;
uniform vec3 uW[16];
uniform vec3 uWB;
uniform vec3 uWhite;
uniform vec2 uSeedV;
uniform vec2 uCentre;
${C.GLSL_NOISE}

#define QZ 0
#define PL 1
#define KFS 2
#define OL 3
#define CPX 4
#define OPX 5
#define HBL 6
#define BT 7
#define MS 8
#define CAL 9
#define GRT 10
#define OPQ 11
#define GLS 12
#define EPX 13
#define CHL 14
#define SRP 15
#define SER 16
#define IDD 17

const float DN[18] = float[18](0.009, 0.0085, 0.007, 0.036, 0.024, 0.012, 0.022, 0.05, 0.04, 0.172, 0.0, 0.0, 0.0, 0.0, 0.004, 0.008, 0.04, 0.04);
const float RI[18] = float[18](1.55, 1.56, 1.52, 1.70, 1.70, 1.68, 1.66, 1.62, 1.59, 1.57, 1.80, 1.54, 1.58, 1.54, 1.60, 1.56, 1.58, 1.74);
// plane-light absorption colours for the two vibration directions (pleochroism)
const vec3 PA[18] = vec3[18](vec3(1.0), vec3(0.99, 0.99, 0.98), vec3(0.95, 0.93, 0.9), vec3(0.95, 0.98, 0.93), vec3(0.88, 0.91, 0.8),
  vec3(0.97, 0.85, 0.86), vec3(0.42, 0.55, 0.28), vec3(0.3, 0.16, 0.07), vec3(0.99, 0.99, 0.97), vec3(1.0), vec3(0.98, 0.84, 0.84),
  vec3(0.015), vec3(0.6, 0.42, 0.24), vec3(0.3, 0.52, 0.92), vec3(0.72, 0.88, 0.66), vec3(0.86, 0.92, 0.78), vec3(0.9, 0.86, 0.78), vec3(0.62, 0.3, 0.12));
const vec3 PB[18] = vec3[18](vec3(1.0), vec3(0.99, 0.99, 0.98), vec3(0.95, 0.93, 0.9), vec3(0.97, 0.99, 0.95), vec3(0.92, 0.89, 0.84),
  vec3(0.85, 0.94, 0.88), vec3(0.7, 0.6, 0.36), vec3(0.9, 0.78, 0.5), vec3(0.99, 0.99, 0.97), vec3(1.0), vec3(0.98, 0.84, 0.84),
  vec3(0.015), vec3(0.6, 0.42, 0.24), vec3(0.3, 0.52, 0.92), vec3(0.85, 0.92, 0.74), vec3(0.9, 0.94, 0.82), vec3(0.9, 0.86, 0.78), vec3(0.78, 0.45, 0.2));
// cathodoluminescence emission
const vec3 CLC[18] = vec3[18](vec3(0.2, 0.25, 0.85), vec3(0.45, 0.85, 0.35), vec3(0.3, 0.6, 1.0), vec3(0.08, 0.02, 0.02), vec3(0.05, 0.04, 0.08),
  vec3(0.18, 0.12, 0.08), vec3(0.03), vec3(0.0), vec3(0.05, 0.05, 0.08), vec3(1.0, 0.5, 0.12), vec3(0.08, 0.02, 0.02), vec3(0.0),
  vec3(0.05, 0.03, 0.02), vec3(0.0), vec3(0.02), vec3(0.04, 0.03, 0.02), vec3(0.2, 0.25, 0.35), vec3(0.0));

vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

float pickA(float h) { for (int k = 0; k < 18; k++) if (h < uMixA[k]) return float(k); return 0.0; }
float pickB(float h) { for (int k = 0; k < 18; k++) if (h < uMixB[k]) return float(k); return 0.0; }

// Voronoi with exact border distance (two-pass). Returns border distance, nearest cell id, neighbour id,
// and the vector from the cell's point to x.
float vor(vec2 x, float jit, out vec2 id, out vec2 nb, out vec2 rel) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.5 + (hash22(n + g + uSeedV) - 0.5) * jit;
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  float bd = 8.0; nb = n + mg;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = 0.5 + (hash22(n + g + uSeedV) - 0.5) * jit;
    vec2 r = g + o - f;
    vec2 dd = r - mr;
    if (dot(dd, dd) > 1e-6) {
      float d = dot(0.5 * (mr + r), normalize(dd));
      if (d < bd) { bd = d; nb = n + g; }
    }
  }
  id = n + mg; rel = -mr;
  return bd;
}

// Power diagram on a row-offset (hexagonal) lattice: sites carry weights so grain sizes vary, and the
// lattice gives three-way junctions instead of the four-way crossings of a square grid. Border distance is
// exact for the (straight) power bisectors.
float vorP(vec2 x, float jit, float wv, out vec2 id, out vec2 nb, out vec2 rel) {
  const float RY = 0.8660254;
  vec2 n = vec2(floor(x.x), floor(x.y / RY));
  float md = 1e9, mw = 0.0; vec2 mg = vec2(0.0), mr = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -2; i <= 2; i++) {
    vec2 c = n + vec2(float(i), float(j));
    vec2 p = vec2(c.x + 0.5 + (mod(c.y, 2.0) - 0.5) * 0.5, (c.y + 0.5) * RY) + (hash22(c + uSeedV) - 0.5) * jit * vec2(1.0, RY);
    float w = wv * hash12(c * 1.93 + uSeedV.yx);
    vec2 r = p - x; float d = dot(r, r) - w;
    if (d < md) { md = d; mr = r; mg = vec2(float(i), float(j)); mw = w; }
  }
  float bd = 8.0; nb = n + mg;
  float pa = dot(mr, mr) - mw;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    if (i == 0 && j == 0) continue;
    vec2 c = n + mg + vec2(float(i), float(j));
    vec2 p = vec2(c.x + 0.5 + (mod(c.y, 2.0) - 0.5) * 0.5, (c.y + 0.5) * RY) + (hash22(c + uSeedV) - 0.5) * jit * vec2(1.0, RY);
    float w = wv * hash12(c * 1.93 + uSeedV.yx);
    vec2 r = p - x;
    float d = (dot(r, r) - w - pa) / (2.0 * length(r - mr) + 1e-6);
    if (d < bd) { bd = d; nb = c; }
  }
  id = n + mg; rel = -mr;
  return bd;
}

// Bend grain boundaries: a broad warp so they curve, mid-frequency lobes so neighbours interlock, and a
// fine serration for sutured (pressure-solution / recrystallised) contacts. Coordinates in grain units.
vec2 warpGrain(vec2 c, float suture) {
  vec2 w = uBnd.x * vec2(snoise(c * 0.45 + uSeedV), snoise(c * 0.45 + uSeedV + 19.1));
  if (uBnd.y > 0.0) w += uBnd.y * vec2(snoise(c * 2.1 + 7.3), snoise(c * 2.1 + 3.9));
  if (suture > 0.0) w += suture * (vec2(snoise(c * 11.0 + 1.7), snoise(c * 11.0 + 5.3)) + 0.45 * vec2(snoise(c * 24.0 + 9.1), snoise(c * 24.0 + 2.2)));
  return c + w;
}

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

struct G { float m; float psi; float o; float edge; float nm; float fr; float dust; float z; float h; float alt; };

// crystal outline for phenocrysts / porphyroblasts (local coords in mm, s = size in mm)
float crystal(float m, vec2 p, float s, float h) {
  if (m == float(PL)) return sdBox(p, s * vec2(1.0, mix(0.28, 0.5, h)));
  if (m == float(OL)) { vec2 a = abs(p); return max(max(a.x * 0.8 + a.y * 0.62, a.y) - s * 0.62, a.x - s * 0.95); }
  if (m == float(GRT)) { vec2 a = abs(p); float d = max(a.x, a.y); d = max(d, (a.x + a.y) * 0.7071); return d - s * 0.72; }
  vec2 a = abs(p); return max(max(a.x, a.y * 1.15), (a.x + a.y) * 0.78) - s * 0.7;   // augite: stubby octagon
}

G spec(vec2 s, float pxmm) {
  G g;
  g.fr = 0.0; g.dust = 0.0; g.alt = 0.0; g.z = 0.5;
  vec2 fd = vec2(cos(uFolAng), sin(uFolAng)), fn = vec2(-fd.y, fd.x);
  float st = 1.0 + uFabric * 2.4;
  vec2 a = vec2(dot(s, fd) / sqrt(st), dot(s, fn) * sqrt(st));
  vec2 local; float h; vec2 id;
  bool lath = false;
  float lathAng = 0.0; vec2 lathLocal = vec2(0.0);
  float grainScale = uGrain;

  if (uTex < 0.5 || uTex > 1.5 && uTex < 2.5) {
    // equigranular or foliated mosaic. Foliated rocks split into mica folia (thin, strongly stretched
    // flakes) and quartz-rich layers (near-equant grains).
    vec2 nb, rel;
    float domEdge = 1e3;
    bool mica = false;
    if (uTex > 1.5) {
      float t = dot(s, fn) / (uGrain * 3.2);
      float lay = snoise(vec2(t, 3.1 + uSeedV.x)) + 0.35 * snoise(s / (uGrain * 7.0) + uSeedV);
      mica = lay > 0.25;
      domEdge = abs(lay - 0.25) * uGrain * 3.2 / 1.8;
      st = mica ? 1.0 + uFabric * 7.0 : 1.0 + uFabric * 1.2;
      a = vec2(dot(s, fd) / sqrt(st), dot(s, fn) * sqrt(st));
    }
    // mica flakes keep straight cleavage-bounded edges; everything else gets curved, sutured boundaries
    vec2 a0 = a / uGrain;
    vec2 ac = mica ? a / uGrain + uBnd.x * 0.5 * vec2(snoise(a / uGrain * 0.45 + uSeedV), snoise(a / uGrain * 0.45 + 4.0))
                   : warpGrain(a / uGrain, uBnd.z);
    float bd = vorP(ac, uJit, mica ? 0.05 : uBnd.w, id, nb, rel);
    if (mica) { id += 500.0; nb += 500.0; }
    h = hash12(id * 1.37 + uSeedV);
    float hn = hash12(nb * 1.37 + uSeedV);
    if (uTex > 1.5) {
      g.m = mica ? pickB(h) : pickA(h);
      g.nm = mica ? pickB(hn) : pickA(hn);
    } else { g.m = pickA(h); g.nm = pickA(hn); }
    g.edge = min(bd * uGrain / sqrt(st), domEdge);
    // crystal-internal geometry (twin planes, cleavage, zoning) uses the unwarped position: lamellae stay straight
    local = (rel - (ac - a0)) * uGrain;
    local = fd * local.x * sqrt(st) + fn * local.y / sqrt(st);
    // porphyroblasts (garnet) in the schist
    if (uTex > 1.5 && uAbund > 0.0) {
      float P = uGrain * 4.0;
      vec2 pc = s / P, pn = floor(pc);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 cell = pn + vec2(float(i), float(j));
        if (hash12(cell * 1.71 + uSeedV) > uAbund) continue;
        vec2 cc = cell + 0.5 + (hash22(cell + uSeedV * 2.0) - 0.5) * 0.4;
        float hh = hash12(cell * 3.1 + uSeedV);
        vec2 lp = rot((pc - cc) * P, hh * 6.28);
        float d = crystal(float(GRT), lp, P * mix(0.2, 0.34, hh), hh);
        if (d < 0.0) { g.m = float(GRT); g.edge = -d; local = lp; h = hh; id = cell + 100.0; g.nm = float(QZ); }
        else if (d < g.edge && d < P * 0.05) { g.edge = min(g.edge, d); g.nm = float(GRT); }
      }
    }
  } else if (uTex < 1.5) {
    // porphyritic: phenocrysts floating in a groundmass of plagioclase laths and interstitial augite, oxide, glass
    float L = uGrain * 0.13;
    vec2 lc = s / L, ln = floor(lc);
    float best = -1.0; float bd = 0.0; vec2 bl = vec2(0.0); float bh = 0.0; float ba = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 cell = ln + vec2(float(i), float(j));
      vec2 hh = hash22(cell + uSeedV * 3.0);
      vec2 cc = cell + hh;
      float hr = hash12(cell * 2.3 + uSeedV);
      float ang = mix(hr * 3.1416, uFolAng + (hr - 0.5) * 0.5, uFabric);
      vec2 lp = rot(lc - cc, -ang);
      float d = sdBox(lp, vec2(mix(0.6, 1.0, hh.x), mix(0.09, 0.14, hh.y)));
      if (d < 0.0 && hr > best) { best = hr; bd = -d; bl = lp; bh = hr; ba = ang; id = cell; }
    }
    if (best >= 0.0) {
      lath = true; lathAng = ba; lathLocal = bl * L;
      g.m = float(PL); g.edge = bd * L; local = rot(bl, ba) * L; h = bh; g.nm = float(CPX); grainScale = L;
    } else {
      vec2 nb, rel;
      float vb = vor(s / (L * 0.8), 0.9, id, nb, rel);
      h = hash12(id * 1.37 + uSeedV);
      g.m = pickB(h); g.nm = float(PL); g.edge = vb * L * 0.8; local = rel * L * 0.8;
    }
    // phenocrysts
    float P = uGrain * 2.2;
    vec2 pc = s / P, pn = floor(pc);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 cell = pn + vec2(float(i), float(j));
      if (hash12(cell * 1.71 + uSeedV) > uAbund) continue;
      vec2 cc = cell + 0.5 + (hash22(cell + uSeedV * 2.0) - 0.5) * 0.45;
      float hh = hash12(cell * 3.1 + uSeedV);
      float mm = pickA(hash12(cell * 5.3 + uSeedV));
      float ang = mix(hh * 6.28, uFolAng, uFabric * 0.8);
      vec2 lp = rot((pc - cc) * P, -ang);
      float d = crystal(mm, lp, P * mix(0.22, 0.42, hash12(cell * 7.7 + uSeedV)), hh);
      if (d < 0.0) { g.m = mm; g.edge = -d; local = rot(lp, ang); h = hh; id = cell + 200.0; g.nm = float(PL); lath = false; grainScale = P * 0.5; }
      else if (d < g.edge) { g.edge = d; g.nm = mm; }
    }
  } else {
    // clastic: rounded detrital grains, quartz overgrowths, pore space and calcite cement
    vec2 nb, rel;
    vec2 a0 = a / uGrain, ac = warpGrain(a0, uBnd.z);
    float bd = vorP(ac, uJit, uBnd.w, id, nb, rel);
    h = hash12(id * 1.37 + uSeedV);
    vec2 h2 = hash22(id * 2.9 + uSeedV);
    float ang = atan(rel.y, rel.x);
    float R = mix(0.47, 0.6, uFabric) * (1.0 + 0.1 * sin(3.0 * ang + h2.x * 6.3) + 0.06 * sin(5.0 * ang + h2.y * 6.3) + 0.04 * sin(2.0 * ang + h * 6.3)) * mix(0.8, 1.1, h2.x);
    float rho = length(rel);
    float over = uAlter < 0.5 ? uAlter * 0.2 : 0.1;
    g.m = pickA(h); g.nm = float(EPX);
    local = (rel - (ac - a0)) * uGrain;
    float ein = min(bd, R - rho) * uGrain;
    if (rho < R) { g.edge = ein; }
    else if (rho < R + over && g.m == float(QZ)) {
      // syntaxial overgrowth: same crystal, with a dust rim marking the old grain surface
      g.edge = min(bd, R + over - rho) * uGrain;
      g.dust = 1.0 - smoothstep(0.0, max(0.006, pxmm * 1.2), (rho - R) * uGrain);
    } else {
      // pore: blue epoxy, or sparry calcite cement as cementation increases
      float cem = snoise(s / uGrain * 0.35 + uSeedV) * 0.5 + 0.5;
      g.edge = (rho - R - (g.m == float(QZ) ? over : 0.0)) * uGrain;
      g.nm = g.m;
      if (cem < (uAlter - 0.45) * 2.0) {
        vec2 cid, cnb, crel;
        float cb = vor(s / (uGrain * 1.6), 0.9, cid, cnb, crel);
        g.m = float(CAL); h = hash12(cid * 4.1 + uSeedV); id = cid + 300.0; g.edge = min(g.edge, cb * uGrain * 1.6); local = crel * uGrain;
      } else { g.m = float(EPX); h = 0.5; }
    }
  }
  if (g.m == float(OPQ) && uTex != 1.0) {
    float core = g.z;
    if (core < 0.55 + 0.2 * h) {
      // outside the small opaque core: continue the neighbouring grain
      g.m = g.nm; g.nm = float(OPQ); id = id + 17.0;
      g.edge = max(0.0, (0.55 + 0.2 * h - core)) * length(local);
    } else g.edge = (core - 0.55 - 0.2 * h) * length(local) + 0.001;
  }
  g.h = h;
  int m = int(g.m + 0.5);

  /* optic orientation */
  vec2 hh = hash22(id * 7.13 + uSeedV);
  float psi = hh.x * 3.14159;
  float u = hh.y;
  g.o = 1.0 - u * u * 0.97;
  float lr = length(local);
  g.z = clamp(g.edge / (g.edge + lr + 1e-5), 0.0, 1.0);    // 0 at the rim, 1 at the core

  if (m == BT || m == MS) {
    // micas: parallel extinction along the cleavage, which lies in the foliation
    psi = mix(psi, uFolAng + (hh.x - 0.5) * 0.35, clamp(uFabric * 1.3, 0.0, 1.0));
    g.o = mix(0.55, 1.0, hh.y);
    float cl = dot(s, vec2(-sin(psi), cos(psi)));
    float sp = 0.011;
    float cd = abs(fract(cl / sp) - 0.5) * sp;
    float brk = smoothstep(-0.2, 0.3, snoise(s * 30.0 + h * 9.0));
    g.fr = max(g.fr, (1.0 - smoothstep(0.0, max(0.0015, pxmm * 0.6), cd)) * brk * (0.35 + 0.65 * uFract));
    // bird's-eye: mottled extinction
    psi += 0.05 * snoise(s * 60.0 + h * 3.0);
  }
  if (lath) psi = lathAng + (hh.x - 0.5) * 0.4;   // laths extinguish near-parallel to their length

  /* twinning */
  if (m == PL && uTwin > 0.01) {
    float tw = hash12(id * 9.1 + uSeedV);
    if (tw < 0.25 + 0.75 * uTwin || lath) {
      float tau = lath ? lathAng : hh.x * 3.14159 + 0.4;
      vec2 tl = lath ? lathLocal : rot(local, -tau);
      if (lath) {
        float side = tl.y > 0.0 ? 1.0 : -1.0;          // simple twin along the lath
        psi += side * mix(0.08, 0.3, tw);
      } else {
        float width = grainScale * mix(0.018, 0.05, hash12(id * 3.7 + uSeedV)) / mix(0.6, 1.4, uTwin);
        float w = tl.y / width;
        float k = floor(w);
        // lamellae of uneven width: merge some neighbours so the stripes don't read as a barcode
        float kk = floor(k * 0.5);
        float sgn = hash11(kk * 1.37 + tw * 91.0) < 0.5 ? 1.0 : -1.0;
        if (hash11(k * 3.1 + tw * 17.0) < 0.45) sgn = -sgn;
        float ext = mix(0.1, 0.55, hash12(id * 4.3 + uSeedV));
        psi = tau + sgn * ext;
      }
    }
  }
  if (m == KFS) {
    float kind = hash12(id * 5.9 + uSeedV);
    if (kind < 0.65 && uTwin > 0.01) {
      // microcline: cross-hatched (tartan) twinning in spindle-shaped lamellae
      vec2 t1 = rot(local, 0.785 + psi);
      float sp = grainScale * 0.045 / mix(0.6, 1.3, uTwin);
      float a1 = sin(t1.x / sp + 0.8 * snoise(t1 / sp * 0.15));
      float a2 = sin(t1.y / sp + 0.8 * snoise(t1 / sp * 0.15 + 5.0));
      float tart = smoothstep(-0.25, 0.25, a1) + smoothstep(-0.25, 0.25, a2);
      psi += (tart - 1.0) * 0.18 * clamp(uTwin * 2.0, 0.0, 1.0);
    } else {
      // orthoclase: a Carlsbad twin splits the grain in two
      if (uTwin > 0.01 && dot(local, vec2(cos(psi + 0.3), sin(psi + 0.3))) > 0.0) psi += 0.45;
    }
    // perthite: exsolved albite as wavy stringers
    float pw = snoise(rot(local, psi) * vec2(12.0, 120.0) + h * 11.0);
    if (pw > 0.55) { psi += 0.6; g.o *= 1.3; }
    g.dust = max(g.dust, 0.35);
  }
  if (m == CAL && uTwin > 0.01) {
    // deformation twin lamellae, in one or two sets
    float sets = hash12(id * 2.2 + uSeedV) < 0.7 ? 1.0 : 2.0;
    float sp = grainScale * mix(0.14, 0.3, hh.y) / mix(0.8, 1.2, uTwin);
    for (int k = 0; k < 2; k++) {
      if (float(k) >= sets) break;
      float ang = psi + 0.5 + float(k) * 1.1;
      float w = dot(local, vec2(-sin(ang), cos(ang))) / sp + h * 7.0;
      float lam = hash11(floor(w) * 1.7 + float(k) * 5.0 + h * 31.0);
      float tw = mix(0.12, 0.4, uTwin) * lam;
      float f = fract(w);
      if (lam > 0.5 && f < tw) { psi += 0.5 + 0.4 * lam; g.o *= mix(0.7, 0.95, lam); }
    }
  }

  /* zoning: concentric, following the crystal faces */
  if (uZoning > 0.01 && (m == PL || m == CPX || m == OL || m == HBL)) {
    // plagioclase: oscillatory zoning; mafic minerals: smooth normal zoning toward the rim
    float osc = m == PL ? 0.07 * sin(g.z * mix(22.0, 40.0, h) + h * 20.0) * smoothstep(0.55, 0.2, g.z) * smoothstep(0.0, 0.05, g.z) : 0.0;
    float zf = m == PL ? 1.0 : 0.45;
    psi += uZoning * zf * (0.3 * (1.0 - g.z) * (1.0 - g.z) + osc);
    g.o *= 1.0 - uZoning * zf * 0.12 * (1.0 - g.z);
  }

  /* strain: undulose (sweeping) extinction, strongest in quartz */
  if (uStrain > 0.01) {
    float sf = m == QZ ? 1.0 : (m == PL || m == KFS || m == OL || m == CAL) ? 0.45 : 0.15;
    vec2 dir = vec2(cos(h * 6.28), sin(h * 6.28));
    psi += uStrain * sf * (0.9 * dot(local, dir) / grainScale + 0.15 * snoise(local / grainScale * 1.6 + h * 13.0));
    if (uStrain > 0.55 && m == QZ) {
      vec2 sid, snb, srel;
      float sb = vor(local / (grainScale * 0.28) + h * 50.0, 0.9, sid, snb, srel);
      psi += (hash12(sid) - 0.5) * (uStrain - 0.55) * 1.2;
    }
  }

  /* fractures and cleavage */
  float lw = max(0.0022, pxmm * 0.7);
  if (m == OL || m == GRT || m == OPX) {
    float f1 = snoise(s / grainScale * 1.5 + h * 17.0);
    float f2 = snoise(s / grainScale * 3.1 + h * 9.0);
    float dens = uFract * (m == OPX ? 0.6 : 1.0);
    float l1 = 1.0 - smoothstep(0.0, lw * 1.5 * 2.0 / grainScale + 0.01, abs(f1));
    float l2 = (1.0 - smoothstep(0.0, lw * 3.1 * 2.0 / grainScale + 0.01, abs(f2))) * smoothstep(0.1, 0.5, snoise(s / grainScale * 1.3 + h));
    g.fr = max(g.fr, max(l1, l2 * 0.8) * clamp(dens * 1.4, 0.0, 1.0));
  }
  if (m == CPX || m == OPX || m == HBL) {
    float ca = m == HBL ? 2.16 : 1.52;
    float sp = 0.03;
    for (int k = 0; k < 2; k++) {
      float ang = psi + 0.35 + float(k) * ca;
      float c = dot(s, vec2(-sin(ang), cos(ang)));
      float cd = abs(fract(c / sp + h * 3.0) - 0.5) * sp;
      float brk = smoothstep(0.0, 0.4, snoise(s * 22.0 + float(k) * 7.0 + h * 5.0));
      g.fr = max(g.fr, (1.0 - smoothstep(0.0, lw, cd)) * brk * uFract * 0.8);
    }
  }
  if (m == QZ || m == PL || m == KFS || m == CAL) {
    float f1 = snoise(s / grainScale * 1.6 + h * 23.0);
    float gate = smoothstep(0.35, 0.6, snoise(s / grainScale * 0.9 + h * 3.0));
    g.fr = max(g.fr, (1.0 - smoothstep(0.0, lw * 1.6 * 2.0 / grainScale + 0.015, abs(f1))) * gate * uFract * 0.8);
  }

  /* alteration, creeping in along fractures and grain rims */
  if (uAlter > 0.01 && uTex < 2.5) {
    float nz = snoise(s / grainScale * 1.3 + h * 5.0) * 0.5 + 0.5;
    float rim = 1.0 - smoothstep(0.0, 0.12 * grainScale, g.edge);
    float along = 0.0;
    if (m == OL) {
      float f1 = abs(snoise(s / grainScale * 1.5 + h * 17.0));
      along = 1.0 - smoothstep(0.0, 0.02 + 0.12 * uAlter, f1);
    }
    float amt = clamp(max(along, rim * 0.8) * (0.4 + nz) * uAlter * 1.6, 0.0, 1.0);
    if (m == OL && amt > 0.35) {
      g.m = uOlAlt > 0.5 ? float(IDD) : float(SRP);
      g.alt = 1.0;
      psi = snoise(s * 40.0 + h) * 1.5 + (uOlAlt > 0.5 ? psi : 0.0);
      g.o = mix(0.3, 1.0, nz);
    } else if ((m == PL || m == KFS) && uAlter > 0.05) {
      // sericite: fine white-mica flecks and a dusty cloud
      float cloud = smoothstep(0.35, 0.75, nz + rim * 0.3) * uAlter;
      g.dust = max(g.dust, cloud * 0.8);
      vec2 fc = floor(s / max(0.016, pxmm * 2.0));
      float fh = hash12(fc + uSeedV);
      if (fh < cloud * cloud * 0.07) { g.m = float(SER); psi = hash12(fc * 1.3) * 3.14; g.o = 0.2 + 0.4 * hash12(fc * 2.1); g.alt = 1.0; }
    } else if ((m == BT || m == HBL || m == CPX) && amt > 0.45) {
      g.m = float(CHL); g.alt = 1.0;
    }
  }
  g.psi = psi;
  return g;
}

// fringe contrast averaged over a 20 nm band: keeps high orders from aliasing into noise
float band(float G, float lam) { float x = 3.14159 * G * 20.0 / (lam * lam); return x < 1e-3 ? 1.0 : sin(x) / x; }

vec3 interference(float th, float G1, bool plate) {
  float s = sin(th), c = cos(th);
  float k0 = 0.5 * (c * c + s * c), k1 = 0.5 * (s * s - s * c), k2 = 0.5 * (-c * c + s * c), k3 = 0.5 * (-s * s - s * c);
  float s2 = sin(2.0 * th); s2 *= s2;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float lam = 400.0 + 20.0 * float(i);
    float d1 = 6.2831853 * G1 / lam;
    float I;
    if (!plate) I = s2 * 0.5 * (1.0 - band(G1, lam) * cos(d1));
    else {
      float G2 = 551.0;
      float d2 = 6.2831853 * G2 / lam;
      I = k0 * k0 + k1 * k1 + k2 * k2 + k3 * k3 + 2.0 * ((k0 * k1 + k2 * k3) * band(G1, lam) * cos(d1)
        + (k0 * k2 + k1 * k3) * cos(d2) + k0 * k3 * band(G1 + G2, lam) * cos(d1 + d2) + k1 * k2 * band(abs(G1 - G2), lam) * cos(d1 - d2));
    }
    acc += I * uW[i];
  }
  return acc;
}

vec3 xyz2rgb(vec3 c) {
  return vec3(3.2406 * c.x - 1.5372 * c.y - 0.4986 * c.z, -0.9689 * c.x + 1.8758 * c.y + 0.0415 * c.z, 0.0557 * c.x - 0.2040 * c.y + 1.0570 * c.z);
}

vec3 hsv(float h, float s, float v) { vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }

vec3 shadeAt(vec2 q, float pxmm) {
  vec2 s = rot(q * uFieldMM, -uStage) + uCentre;
  G g = spec(s, pxmm);
  int m = int(g.m + 0.5);
  float th = g.psi + uStage;
  float edgePx = g.edge / pxmm;
  float rel = abs(RI[m] - RI[int(g.nm + 0.5)]);
  vec3 col;

  if (uMode > 2.5 && uMode < 3.5) {
    // c-axis orientation map
    if (DN[m] == 0.0) col = vec3(0.02);
    else col = hsv(fract(th / 3.14159), 0.8, 0.3 + 0.7 * g.o);
    col *= mix(0.25, 1.0, smoothstep(0.4, 1.4, edgePx));
    col *= 1.0 - 0.6 * g.fr;
    return col;
  }
  if (uMode > 3.5) {
    // cathodoluminescence: growth zoning glows, healed fractures and alteration go dark
    vec3 e = CLC[m];
    // growth zoning, irregular in spacing and patchy, strongest near the rims
    float zz = g.z * mix(10.0, 26.0, g.h) + snoise(s * 6.0 + g.h * 7.0) * 1.2;
    float zb = 0.7 + 0.3 * sin(zz + g.h * 30.0) * (0.4 + 0.6 * smoothstep(0.6, 0.1, g.z));
    float lum = mix(0.55, 1.25, g.h) * mix(1.0, zb, 0.25 + 0.6 * uZoning) * (0.85 + 0.25 * snoise(s * 2.5 + g.h * 3.0));
    if (m == QZ) lum *= 0.75 + 0.35 * snoise(s * 9.0 + g.h * 4.0);
    col = e * lum * (1.0 - 0.8 * g.fr) * (1.0 - 0.5 * g.dust);
    col *= mix(0.35, 1.0, smoothstep(0.3, 1.5, edgePx));
    return col * 1.15;
  }

  // plane light: absorption with pleochroism
  float pl = cos(th); pl *= pl;
  vec3 tint = mix(PB[m], PA[m], pl);
  if (m == CAL) {
    // calcite twinkles: its relief changes as the stage turns
    rel = abs(mix(1.49, 1.66, pl) - 1.54) + 0.02;
  }
  float relief = abs(RI[m] - 1.54);

  if (uPolars < 0.5) {
    col = tint * uWhite;
    // dusty/turbid feldspar, shagreen of high-relief grains
    col *= 1.0 - 0.18 * g.dust * (0.6 + 0.4 * snoise(s * 90.0));
    col *= 1.0 - relief * 0.35 * (snoise(s * 140.0 + g.h * 10.0) * 0.5 + 0.5);
    // grain boundary: dark line whose weight follows the relief contrast, with a faint Becke line
    float lineW = mix(0.6, 2.2, clamp(rel * 8.0 + relief * 2.0, 0.0, 1.0));
    col *= mix(1.0, 0.25, (1.0 - smoothstep(0.0, lineW, edgePx)) * clamp(0.25 + rel * 6.0 + relief * 1.5, 0.0, 1.0));
    col *= 1.0 + 0.08 * (1.0 - smoothstep(lineW, lineW + 1.5, edgePx)) * smoothstep(lineW * 0.8, lineW, edgePx) * step(RI[int(g.nm + 0.5)], RI[m]);
    col *= 1.0 - 0.65 * g.fr;
    return col * uExpo;
  }
  // crossed polars (with or without the gypsum plate)
  bool plate = uPolars > 1.5;
  float G1 = uThick * DN[m] * g.o;
  vec3 xyz = interference(th, G1, plate);
  col = max(xyz2rgb(xyz) * uWB, 0.0);
  if (m == CHL) {
    // chlorite's anomalous 'Berlin blue'
    float s2 = sin(2.0 * th); s2 *= s2;
    col = plate ? col : vec3(0.18, 0.26, 0.42) * s2 * 1.4;
  }
  if (m == OPQ) col = vec3(0.0);
  // strongly coloured minerals mask their own interference colours
  col *= mix(vec3(1.0), tint, m == BT || m == HBL || m == GLS || m == IDD ? 0.85 : 0.35);
  col *= 1.0 - 0.25 * g.dust;
  col += vec3(0.012, 0.012, 0.016);                          // imperfect extinction
  col *= mix(0.45, 1.0, smoothstep(0.2, 1.1, edgePx));      // inclined boundaries
  col *= 1.0 - 0.7 * g.fr;
  return col * uExpo;
}

vec3 toSRGB(vec3 c) { c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }

void main() {
  vec2 fc = gl_FragCoord.xy + uOff;
  float px = 1.0 / uRes.y;
  vec2 ctr = vec2(uAspect * 0.5, 0.5);
  float pxmm = px * uFieldMM;
  vec2 O[4] = vec2[4](vec2(0.125, 0.375), vec2(0.375, -0.125), vec2(-0.125, -0.375), vec2(-0.375, 0.125));
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec2 q = (vec2(fc.x + O[k].x, uRes.y - fc.y - O[k].y)) * px - ctr;
    acc += shadeAt(q, pxmm);
  }
  vec3 col = acc * 0.25;
  if (uMode > 0.5 && uMode < 2.5) {
    // black-and-white plate: luminance with a gentle shoulder, blacks kept black
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    l = 1.0 - exp(-l * 2.3);
    l = l / (1.0 - exp(-2.3));
    col = uMode < 1.5 ? vec3(l) : mix(vec3(0.02, 0.012, 0.006), vec3(0.97, 0.9, 0.76), l) * mix(0.92, 1.0, l);
  }
  vec2 q = vec2(fc.x, uRes.y - fc.y) * px - ctr;
  float r = length(q);
  if (uField > 0.5) {
    float R = 0.47;
    col *= 1.0 - 0.28 * pow(r / R, 3.0);                       // lens falloff toward the field stop
    float inside = smoothstep(R + px, R - px, r);
    col = mix(vec3(0.012, 0.011, 0.01), col, inside);
    if (uField > 1.5) {
      // eyepiece reticle: crosshair with a 0.1 mm graticule along the horizontal
      float lwc = max(px * 0.9, 0.0011);
      float cx = 1.0 - smoothstep(lwc * 0.5, lwc * 0.5 + px, abs(q.x));
      float cy = 1.0 - smoothstep(lwc * 0.5, lwc * 0.5 + px, abs(q.y));
      float tick = 0.1 / uFieldMM;
      float tk = abs(fract(q.x / tick + 0.5) - 0.5) * tick;
      float big = abs(fract(q.x / (tick * 5.0) + 0.5) - 0.5) * tick * 5.0;
      float th = (big < tick * 0.5 ? 0.018 : 0.009);
      float ticks = (1.0 - smoothstep(lwc * 0.5, lwc * 0.5 + px, tk)) * step(abs(q.y), th) * step(abs(q.x), 0.3);
      float ret = max(max(cx, cy), ticks) * inside;
      col = mix(col, vec3(0.03), ret * 0.85);
    }
  } else {
    col *= 1.0 - 0.18 * pow(length(q / vec2(uAspect * 0.5, 0.5)) / 1.42, 2.5);
  }
  col = toSRGB(col);
  col += (hash12(fc) - 0.5) * 0.012;
  fragColor = vec4(col, 1.0);
}`;

  /* ------------------------------------------------------------ scene */
  // grain slider is relative to the rock's usual grain size (±1.5 octaves)
  function grainMM(P) { return ROCKS[P.rock].base * Math.pow(2, (P.grain - 0.5) * 3); }
  const FIELD_MM = 5.0;

  function uniforms(P, w, h) {
    const rock = ROCKS[P.rock];
    const pal = PALETTES[P.palette];
    const L = light(pal.T, pal.wb);
    const R = C.rng((P.seed * 2654435761 + 91) >>> 0);
    const A = C.FORMATS[P.format].a;
    const folAng = rock.tex === 2 ? lerp(-0.35, 0.35, R()) : R() * Math.PI;
    const abund = rock.tex === 1 ? lerp(0.55, 0.85, R()) : rock.tex === 2 ? lerp(0.15, 0.4, R()) : 0;
    const fab = rock.tex === 2 ? lerp(0.35, 1, P.fabric) : P.fabric;
    return {
      uRes: [w, h], uAspect: A,
      uTex: rock.tex, uMixA: cumul(rock.mixA), uMixB: cumul(rock.mixB),
      uGrain: grainMM(P), uFieldMM: FIELD_MM, uFabric: fab, uFolAng: folAng, uAbund: abund, uBnd: rock.bnd, uJit: rock.jit,
      uZoning: P.zoning, uTwin: P.twinning, uStrain: P.strain, uFract: P.fractures, uAlter: P.alteration, uOlAlt: rock.olAlt,
      uPolars: P.polars, uStage: (P.stage * Math.PI) / 180, uThick: P.thickness * 1000, uField: P.field,
      uMode: pal.mode, uExpo: pal.expo, uW: L.uW, uWB: L.uWB, uWhite: L.white.map((v) => v * 0.93),
      uSeedV: [(P.seed % 997) * 0.731, (P.seed % 991) * 0.377], uCentre: [R() * 40 - 20, R() * 40 - 20],
    };
  }

  function apply(sh, P, w, h, off) {
    const u = uniforms(P, w, h);
    for (const k in u) sh.setUniform(k, Array.isArray(u[k]) ? u[k].slice() : u[k]);
    sh.setUniform('uOff', off || [0, 0]);
  }

  function exportTiled(p, P, W, H) {
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');
    const band = Math.max(64, Math.min(H, Math.floor(2e6 / W)));
    const g = p.createGraphics(W, band, p.WEBGL);
    g.pixelDensity(1);
    const sh = g.createShader(C.VERT, FRAG);
    for (let y0 = 0; y0 < H; y0 += band) {
      g.clear(); g.noStroke(); g.shader(sh);
      apply(sh, P, W, H, [0, H - y0 - band]);
      g.rect(0, 0, W, band);
      ctx.drawImage(g.elt, 0, 0, W, band, 0, y0, W, band);
    }
    g.remove();
    return out;
  }

  /* ------------------------------------------------------------ traits */
  function order(G) { return G < 550 ? 1 : G < 1100 ? 2 : G < 1650 ? 3 : G < 2200 ? 4 : 5; }
  const ORD = ['', 'first-order', 'second-order', 'third-order', 'fourth-order', 'high-order'];
  function topMineral(P) {
    const rock = ROCKS[P.rock];
    let best = 0, bm = 0;
    for (const k in rock.mixA) if (DN[k] > best && rock.mixA[k] >= 5) { best = DN[k]; bm = +k; }
    return { m: bm, G: P.thickness * 1000 * best };
  }
  function interferenceName(P) {
    const t = topMineral(P);
    const o = order(t.G);
    if (o >= 5) return 'High-order white';
    if (o === 1) return t.G < 330 ? 'First-order greys' : 'First-order white & yellow';
    return `Up to ${ORD[o]}`;
  }
  function fabricName(P) {
    const r = ROCKS[P.rock];
    const f = P.fabric;
    if (r.tex === 1) return f < 0.3 ? 'Porphyritic' : f < 0.65 ? 'Pilotaxitic' : 'Trachytic';
    if (r.tex === 2) return f < 0.3 ? 'Schistose' : f < 0.7 ? 'Crenulated folia' : 'Mylonitic';
    if (r.tex === 3) return f < 0.3 ? 'Loosely packed' : f < 0.7 ? 'Grain-supported' : 'Compacted';
    if (P.rock === 4) return f < 0.25 ? 'Granoblastic' : f < 0.6 ? 'Weakly foliated' : 'Flattened';
    return f < 0.25 ? 'Equigranular' : f < 0.6 ? 'Weak fabric' : 'Gneissose';
  }
  function alterName(P) {
    const r = P.rock, a = P.alteration;
    if (a < 0.1) return 'Fresh';
    if (r === 6) return a < 0.5 ? 'Quartz overgrowths' : a < 0.8 ? 'Partly cemented' : 'Calcite-cemented';
    if (r === 3) return a < 0.4 ? 'Serpentine veinlets' : a < 0.75 ? 'Mesh serpentine' : 'Serpentinised';
    if (r === 1) return a < 0.45 ? 'Iddingsite rims' : 'Iddingsitised';
    if (r === 0 || r === 2) return a < 0.45 ? 'Lightly sericitised' : 'Sericitised';
    return a < 0.5 ? 'Slightly altered' : 'Altered';
  }
  const POL = ['Plane-polarized', 'Crossed polars', 'Crossed + λ plate'];

  function trait(k, P) {
    switch (k) {
      case 'grain': { const g = grainMM(P); const s = g < 0.3 ? 'Fine' : g < 0.9 ? 'Medium' : 'Coarse'; return `${s}, ${g < 1 ? g.toFixed(2) : g.toFixed(1)} mm`; }
      case 'fabric': return fabricName(P);
      case 'alteration': return alterName(P);
      case 'thickness': return P.thickness === 30 ? '30 µm (standard)' : `${P.thickness} µm`;
      case 'stage': return `${P.stage}°`;
      case 'twinning': {
        if (P.twinning < 0.05) return 'Untwinned';
        const r = P.rock; if (r === 4) return P.twinning < 0.5 ? 'Thin lamellae' : 'Thick lamellae';
        if (r === 3) return 'Olivine untwinned';
        if (r === 5 || r === 6) return P.twinning < 0.5 ? 'Rare feldspar twins' : 'Twinned feldspar grains';
        if (r === 0) return P.twinning < 0.5 ? 'Albite & tartan' : 'Densely twinned';
        return P.twinning < 0.5 ? 'Albite twins' : 'Polysynthetic';
      }
    }
    return null;
  }

  C.register({
    id: 'thin-section',
    name: 'Thin Section',
    group: 'process',
    order: 2,
    renderer: 'webgl',
    subtitle: 'Rock under polarized light',
    about: 'A slice of rock ground to 30 µm, seen through a polarizing microscope. Each Voronoi grain is a mineral with its own optic orientation; under crossed polars it transmits sin²(2θ)·sin²(πΓ/λ) at every wavelength, and summing that through the CIE colour-matching curves gives the true Michel-Lévy interference colours. Turn the stage and each grain goes black four times a turn; the λ plate adds 551 nm of retardation and turns the background magenta.',
    formats: [1, 0],
    formatOdds: [3, 1],
    defaults: { seed: 1873, format: 1, palette: 0 },
    palettes: PALETTES.map((p) => ({ name: p.name, colors: p.colors })),
    paletteOdds: [3, 2.5, 0.8, 0.6, 0.7, 0.8],
    params: [
      { k: 'rock', g: 'Rock', label: 'Rock', type: 'select', options: ROCK_NAMES, def: 3 },
      { k: 'grain', g: 'Rock', label: 'Grain size', min: 0, max: 1, step: 0.01, def: 0.5 },
      { k: 'fabric', g: 'Rock', label: 'Fabric', min: 0, max: 1, step: 0.01, def: 0.1 },
      { k: 'zoning', g: 'Crystals', label: 'Zoning', min: 0, max: 1, step: 0.01, def: 0.3,
        names: [[0, 'Unzoned'], [0.2, 'Faint zoning'], [0.5, 'Oscillatory'], [0.8, 'Strongly zoned']] },
      { k: 'twinning', g: 'Crystals', label: 'Twinning', min: 0, max: 1, step: 0.01, def: 0.6 },
      { k: 'strain', g: 'Crystals', label: 'Strain', min: 0, max: 1, step: 0.01, def: 0.2,
        names: [[0, 'Unstrained'], [0.15, 'Undulose'], [0.55, 'Subgrains']] },
      { k: 'fractures', g: 'History', label: 'Fractures', min: 0, max: 1, step: 0.01, def: 0.5,
        names: [[0, 'Intact'], [0.2, 'Cracked'], [0.55, 'Fractured'], [0.85, 'Shattered']] },
      { k: 'alteration', g: 'History', label: 'Alteration', min: 0, max: 1, step: 0.01, def: 0.35 },
      { k: 'polars', g: 'Microscope', label: 'Polars', type: 'select', options: POL, def: 1 },
      { k: 'stage', g: 'Microscope', label: 'Stage', min: 0, max: 359, step: 1, def: 22, unit: '°' },
      { k: 'thickness', g: 'Microscope', label: 'Thickness', min: 15, max: 60, step: 1, def: 30, unit: ' µm' },
      { k: 'field', g: 'Microscope', label: 'Field', type: 'select', options: ['Full frame', 'Circular', 'Reticle'], def: 2 },
    ],

    randomize(R) {
      const rock = C.pickWeighted(R, [1.2, 1.1, 1, 1.1, 0.8, 1, 0.9]);
      const rk = ROCKS[rock];
      const o = { rock };
      o.grain = lerp(0.25, 0.75, R());
      o.fabric = rk.tex === 2 ? lerp(0.1, 0.8, R()) : rk.tex === 1 ? lerp(0, 0.9, R()) : R() < 0.75 ? R() * 0.25 : lerp(0.3, 0.8, R());
      o.zoning = rock === 1 ? lerp(0.25, 0.9, R()) : lerp(0, 0.45, R());
      o.twinning = lerp(0.3, 1, R());
      o.strain = rock === 5 || rock === 0 ? lerp(0.1, 0.8, R()) : lerp(0, 0.45, R());
      o.fractures = rock === 3 || rock === 1 ? lerp(0.35, 0.9, R()) : lerp(0.05, 0.6, R());
      o.alteration = rock === 6 ? R() : rock === 3 ? lerp(0.2, 0.8, R()) : lerp(0, 0.6, R());
      o.polars = C.pickWeighted(R, [0.9, 3, 1.1]);
      o.stage = R.int(0, 359);
      o.thickness = R() < 0.7 ? 30 : R() < 0.7 ? R.int(25, 40) : R.int(40, 60);
      o.field = C.pickWeighted(R, [1, 1, 1.2]);
      // the light: black-and-white plates only between crossed polars; plane light wants colour film
      const odds = o.polars === 1 ? [3, 2.5, 0.9, 0.7, 0.8, 0.9] : o.polars === 2 ? [3, 3, 0, 0, 0.5, 0.6] : [2.5, 3, 0, 0, 0.5, 0.7];
      o.palette = C.pickWeighted(R, odds);
      return o;
    },
    traitName(k, P) { return trait(k, P); },
    caption(P) {
      const rk = ROCKS[P.rock];
      const pol = ['in plane-polarized light', 'between crossed polars', 'between crossed polars with the λ plate in'][P.polars];
      const pal = PALETTES[P.palette];
      const view = pal.mode === 4 ? 'in cathodoluminescence' : pal.mode === 3 ? 'as a c-axis orientation map' : pol;
      let colours = P.polars === 0 || pal.mode >= 3 ? '' : `; interference colours ${interferenceName(P).toLowerCase()}`;
      if (P.polars === 2 && pal.mode < 3) {
        colours = topMineral(P).G < 550 ? '; the greys become blue and yellow against the first-order red'
          : `; ${interferenceName(P).toLowerCase()} colours over the first-order red`;
      }
      return `${rk.name} ${view}, stage at ${P.stage}°: ${rk.desc}${colours}.`;
    },
    sheet(P) {
      const T = (k) => C.traitName(C.byId['thin-section'], k, P);
      const pal = PALETTES[P.palette];
      return [
        ['Rock', ROCK_NAMES[P.rock]],
        ['Light', pal.name],
        ['Polars', pal.mode >= 3 ? '—' : POL[P.polars]],
        ['Stage', T('stage')],
        ['Thickness', T('thickness')],
        ['Interference', P.polars === 0 || pal.mode >= 3 ? '—' : interferenceName(P)],
        ['Grain size', T('grain')],
        ['Texture', T('fabric')],
        ['Twinning', T('twinning')],
        ['Zoning', T('zoning')],
        ['Strain', T('strain')],
        ['Alteration', T('alteration')],
      ];
    },

    setup(p) { return { sh: p.createShader(C.VERT, FRAG) }; },
    start() {},
    frame(p, P, st) {
      const [w, h] = C.bufferSize(p);
      p.noStroke();
      p.shader(st.sh);
      apply(st.sh, P, w, h);
      p.rect(0, 0, p.width, p.height);
      return false;
    },
    exportAt(p, P, W, H) { return exportTiled(p, P, W, H); },
  });
})();
