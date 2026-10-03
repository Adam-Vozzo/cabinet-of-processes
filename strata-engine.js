/* ==========================================================================
   STRATA — engine
   A generative geological cross-section. Every pixel is traced backwards
   through the section's history: surface erosion → late faults → dikes →
   unconformity → early faults → tilt → shear → folding → soft-sediment
   crumple → the original, flat pile of beds. Whatever bed it lands in
   decides its colour and lithology symbol.

   This file is p5-agnostic: it holds the parameter space, palettes, the
   GLSL shaders and the maths that turns (params, seed) into uniforms.
   ========================================================================== */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  /* ---------- seeded RNG (sfc32 seeded through splitmix32) ---------- */
  function rng(seed) {
    let s = (seed >>> 0) ^ 0x9e3779b9;
    const split = () => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    let a = split(), b = split(), c = split(), d = split();
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }

  /* ---------- formats ---------- */
  const FORMATS = [
    { id: 'portrait', label: 'Portrait 4:5', a: 0.8 },
    { id: 'square', label: 'Square 1:1', a: 1.0 },
    { id: 'landscape', label: 'Landscape 3:2', a: 1.5 },
    { id: 'panorama', label: 'Panorama 2:1', a: 2.0 },
  ];

  /* ---------- palettes: rocks carry weights, so some colours dominate ---------- */
  const PALETTES = [
    { id: 'painted-desert', name: 'Painted Desert',
      paper: '#efe7da', ink: '#2a1f1a', sky: '#ece2d2', water: '#5f8a91', ign: '#2f2a2c', vein: '#fbf6ee', stain: '#b98a5a',
      rocks: [['#c4532f', 3], ['#e3a467', 2], ['#f1dcb6', 2], ['#8e3b2b', 1.5], ['#d9804d', 1.5], ['#b7a48b', 1], ['#6a4a3b', 0.8]] },
    { id: 'chalk-coast', name: 'Chalk Coast',
      paper: '#eceeea', ink: '#1c2528', sky: '#dde6e8', water: '#3d6b76', ign: '#2a2624', vein: '#ffffff', stain: '#b4a57e',
      rocks: [['#e3e5de', 3], ['#a8b3b1', 2], ['#66777b', 1.5], ['#cdbd92', 1], ['#3f4c53', 1], ['#9fbcb2', 1], ['#d8cfc0', 1.5]] },
    { id: 'coal-measures', name: 'Coal Measures',
      paper: '#e7e2d9', ink: '#141210', sky: '#e3ddd2', water: '#50656a', ign: '#3b403e', vein: '#f0e9da', stain: '#a8773f',
      rocks: [['#6f5b49', 2], ['#b99b6d', 2], ['#8d7c6b', 2], ['#d6c6a4', 1.5], ['#4a3b31', 1.5], ['#c7754b', 0.7], ['#2b2623', 1]] },
    { id: 'copper-belt', name: 'Copper Belt',
      paper: '#e8ebe6', ink: '#16191b', sky: '#e1e7e3', water: '#4d7f86', ign: '#2d2a2b', vein: '#f3f5ef', stain: '#c9954d',
      rocks: [['#2f6f6a', 1.6], ['#7fb3a6', 1.6], ['#c05a2b', 1.2], ['#e0b25a', 1.3], ['#3b3f46', 1.2], ['#d9dccf', 2], ['#8a5a3c', 0.8]] },
    { id: 'riso', name: 'Riso',
      paper: '#f6f4f0', ink: '#1c1c1c', sky: '#f6f4f0', water: '#0078bf', ign: '#1c1c1c', vein: '#ffffff', stain: '#ffe800',
      rocks: [['#ff48b0', 2], ['#0078bf', 2], ['#ffe800', 2], ['#00a95c', 1.3], ['#f15060', 1.3], ['#765ba7', 1], ['#f6f4f0', 1.2]] },
    { id: 'basalt-bone', name: 'Basalt & Bone',
      paper: '#ebe9e4', ink: '#121212', sky: '#ebe9e4', water: '#9aa3a6', ign: '#121212', vein: '#ffffff', stain: '#9c9388',
      rocks: [['#1d1d1d', 2], ['#e7e3da', 2.5], ['#7b7773', 1.5], ['#bdb7ae', 1.5], ['#3e3c3a', 1.2], ['#c23b2a', 0.3]] },
    { id: 'opaline', name: 'Opaline',
      paper: '#fbfaf8', ink: '#3a3450', sky: '#f6f5f2', water: '#9cc6d6', ign: '#3a3450', vein: '#ffffff', stain: '#e9c7a7',
      rocks: [['#c9e4de', 1], ['#f7d9c4', 1], ['#faedcb', 1], ['#c6def1', 1], ['#dbcdf0', 1], ['#f2c6de', 1], ['#e2ecc2', 1]] },
    { id: 'mars', name: 'Mars',
      paper: '#efd9c3', ink: '#2a120c', sky: '#e7c6a4', water: '#6f8a94', ign: '#2b1a17', vein: '#f6e6d4', stain: '#8a3a22',
      rocks: [['#7b2d1d', 1.5], ['#a8452a', 2], ['#c96b3c', 2], ['#e2a36b', 1.5], ['#5a2418', 1], ['#d98c5f', 1.5], ['#efc596', 1]] },
    { id: 'blueprint', name: 'Blueprint',
      paper: '#1b3a60', ink: '#e8f0f7', sky: '#1b3a60', water: '#2a5687', ign: '#0f2440', vein: '#e8f0f7', stain: '#2f5b8c',
      rocks: [['#1f4470', 2], ['#27538a', 2], ['#316aa8', 1.5], ['#183557', 1.5], ['#3d7cc0', 1], ['#22497a', 1]] },
  ];

  /* ---------- the parameter space ----------
     names: [threshold, word] pairs — the slider shows the last word whose
     threshold the value has reached. Some names are overridden by geometry
     (see describe()).                                                     */
  const PARAMS = [
    { k: 'scale', g: 'Composition', label: 'Scale', min: 0, max: 1, step: 0.01, def: 0.42,
      names: [[0, 'Outcrop'], [0.3, 'Cliff'], [0.6, 'Canyon'], [0.85, 'Range']] },
    { k: 'sky', g: 'Composition', label: 'Sky', min: 0, max: 1, step: 0.01, def: 0.3,
      names: [[0, 'None'], [0.03, 'Sliver'], [0.3, 'Open'], [0.7, 'Vast']] },
    { k: 'relief', g: 'Composition', label: 'Relief', min: 0, max: 1, step: 0.01, def: 0.45,
      names: [[0, 'Plain'], [0.2, 'Rolling'], [0.5, 'Rugged'], [0.72, 'Mesa']] },
    { k: 'water', g: 'Composition', label: 'Water', min: 0, max: 1, step: 0.01, def: 0,
      names: [[0, 'Dry'], [0.02, 'Pools'], [0.4, 'Lake'], [0.75, 'Flooded']] },
    { k: 'margin', g: 'Composition', label: 'Margin', min: 0, max: 1, step: 0.01, def: 0.35,
      names: [[0, 'Full bleed'], [0.02, 'Narrow'], [0.3, 'Plate'], [0.7, 'Wide']] },

    { k: 'banding', g: 'Beds', label: 'Banding', min: 0, max: 1, step: 0.01, def: 0.4,
      names: [[0, 'Massive'], [0.2, 'Bold'], [0.45, 'Banded'], [0.7, 'Fine'], [0.9, 'Laminated']] },
    { k: 'rhythm', g: 'Beds', label: 'Rhythm', min: 0, max: 1, step: 0.01, def: 0.6,
      names: [[0, 'Regular'], [0.25, 'Varied'], [0.55, 'Cyclic'], [0.85, 'Chaotic']] },
    { k: 'bedding', g: 'Beds', label: 'Bedding', min: 0, max: 1, step: 0.01, def: 0.45,
      names: [[0, 'Massive'], [0.25, 'Bedded'], [0.6, 'Thin-bedded'], [0.85, 'Laminated']] },
    { k: 'pattern', g: 'Beds', label: 'Lithology marks', min: 0, max: 1, step: 0.01, def: 0.7,
      names: [[0, 'None'], [0.02, 'Faint'], [0.4, 'Marked'], [0.8, 'Full']] },

    { k: 'dip', g: 'Deformation', label: 'Dip', min: -1, max: 1, step: 0.01, def: 0.18, names: null },
    { k: 'folding', g: 'Deformation', label: 'Folding', min: 0, max: 1, step: 0.01, def: 0.45, names: null },
    { k: 'wavelength', g: 'Deformation', label: 'Fold wavelength', min: 0, max: 1, step: 0.01, def: 0.45,
      names: [[0, 'Short'], [0.35, 'Medium'], [0.7, 'Long']] },
    { k: 'overturn', g: 'Deformation', label: 'Overturn', min: 0, max: 1, step: 0.01, def: 0.2, names: null },
    { k: 'crumple', g: 'Deformation', label: 'Crumple', min: 0, max: 1, step: 0.01, def: 0.15,
      names: [[0, 'Calm'], [0.1, 'Rippled'], [0.45, 'Contorted'], [0.8, 'Chaotic']] },
    { k: 'faults', g: 'Deformation', label: 'Faults', min: 0, max: 8, step: 1, def: 3,
      names: [[0, 'Unfaulted'], [1, 'Faulted'], [3, 'Fractured'], [6, 'Shattered']] },
    { k: 'throw', g: 'Deformation', label: 'Fault throw', min: -1, max: 1, step: 0.01, def: 0.45, names: null },
    { k: 'unconformity', g: 'Deformation', label: 'Unconformity', min: 0, max: 1, step: 0.01, def: 0.45, names: null },

    { k: 'dikes', g: 'Intrusions', label: 'Dikes', min: 0, max: 5, step: 1, def: 1,
      names: [[0, 'None'], [1, 'Single dike'], [2, 'Dikes'], [4, 'Swarm']] },
    { k: 'veins', g: 'Intrusions', label: 'Quartz veins', min: 0, max: 1, step: 0.01, def: 0,
      names: [[0, 'None'], [0.02, 'Sparse'], [0.4, 'Veined'], [0.75, 'Stockwork']] },
    { k: 'fossils', g: 'Intrusions', label: 'Fossils', min: 0, max: 1, step: 0.01, def: 0.25,
      names: [[0, 'Barren'], [0.02, 'Rare'], [0.35, 'Fossiliferous'], [0.8, 'Coquina']] },

    { k: 'weathering', g: 'Finish', label: 'Weathering', min: 0, max: 1, step: 0.01, def: 0.3,
      names: [[0, 'Fresh'], [0.15, 'Weathered'], [0.55, 'Stained'], [0.85, 'Leached']] },
    { k: 'linework', g: 'Finish', label: 'Linework', min: 0, max: 1, step: 0.01, def: 0.5,
      names: [[0, 'None'], [0.02, 'Hairline'], [0.35, 'Inked'], [0.75, 'Bold']] },
    { k: 'grain', g: 'Finish', label: 'Grain', min: 0, max: 1, step: 0.01, def: 0.5,
      names: [[0, 'Clean'], [0.15, 'Paper'], [0.65, 'Gritty']] },
  ];
  const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.k, p]));

  function defaults() {
    const o = { seed: 3107, format: 0, palette: 0 };
    PARAMS.forEach((p) => (o[p.k] = p.def));
    return o;
  }

  /* ---------- derived geometry (shared by shader uniforms + trait names) ---------- */
  function geometry(P) {
    const zoom = lerp(0.55, 2.8, Math.pow(P.scale, 1.15));
    const foldA = Math.pow(P.folding, 1.5) * 0.3;
    const foldL = lerp(0.28, 2.2, P.wavelength);
    const k = TAU / foldL;
    const S = Math.min(5, (P.overturn * 2.4) / Math.max(foldA * k, 0.35));
    const vergence = foldA * k * S; // >1 means the limbs fold back past vertical
    const dipDeg = P.dip * 40;
    const skyOn = P.sky > 0.02;
    const horizon = skyOn ? lerp(0.07, 0.55, P.sky) : -0.4;
    const reliefAmp = 0.16 * P.relief;
    return { zoom, foldA, foldL, k, S, vergence, dipDeg, horizon, reliefAmp, skyOn, foldRatio: foldA / foldL };
  }

  function nameFrom(p, v) {
    let w = p.names[0][1];
    for (const [t, n] of p.names) if (v >= t - 1e-9) w = n;
    return w;
  }

  /* Human-readable trait value for any parameter — the vocabulary layer. */
  function traitName(key, P) {
    const G = geometry(P);
    const p = PARAM_BY_KEY[key];
    switch (key) {
      case 'dip': {
        const d = Math.abs(G.dipDeg);
        if (d < 2.5) return 'Horizontal';
        const dir = G.dipDeg > 0 ? 'E' : 'W';
        return `${Math.round(d)}° ${dir}`;
      }
      case 'folding': {
        const r = G.foldRatio;
        if (r < 0.012) return 'Flat';
        if (r < 0.05) return 'Gentle';
        if (r < 0.12) return 'Open';
        if (r < 0.26) return 'Tight';
        return 'Isoclinal';
      }
      case 'overturn': {
        if (G.foldRatio < 0.012) return 'n/a';
        const v = G.vergence;
        if (v < 0.25) return 'Upright';
        if (v < 0.8) return 'Inclined';
        if (v < 1.6) return 'Overturned';
        return 'Recumbent';
      }
      case 'throw': {
        const t = P.throw;
        if (Math.abs(t) < 0.03) return 'Negligible';
        const mag = Math.abs(t) < 0.35 ? 'Small' : Math.abs(t) < 0.7 ? 'Large' : 'Huge';
        return `${mag} ${t > 0 ? 'normal' : 'reverse'}`;
      }
      case 'unconformity': {
        if (P.unconformity < 0.02) return 'None';
        const deformed = Math.abs(G.dipDeg) > 4 || G.foldRatio > 0.03;
        const depth = P.unconformity < 0.35 ? 'Deep' : P.unconformity < 0.7 ? 'Mid' : 'Shallow';
        return `${depth} ${deformed ? 'angular' : 'disconformity'}`;
      }
      case 'water':
        if (!G.skyOn && P.water > 0.02) return 'Buried';
        return nameFrom(p, P[key]);
      case 'relief':
        if (!G.skyOn) return 'Buried';
        return nameFrom(p, P[key]);
      default:
        return p.names ? nameFrom(p, P[key]) : String(P[key]);
    }
  }

  /* A one-line figure caption, the way a survey plate would describe itself. */
  function caption(P) {
    const G = geometry(P);
    const pal = PALETTES[P.palette].name;
    const bits = [];
    const fold = traitName('folding', P).toLowerCase();
    const ov = traitName('overturn', P).toLowerCase();
    if (fold === 'flat') {
      const d = Math.abs(G.dipDeg);
      bits.push(d < 2.5 ? 'flat-lying beds' : `beds dipping ${traitName('dip', P)}`);
    } else {
      bits.push(`${fold}${ov !== 'upright' ? ' ' + ov : ''} folds`);
    }
    if (P.faults > 0 && Math.abs(P.throw) >= 0.03) {
      const kind = P.throw > 0 ? 'normal' : 'reverse';
      bits.push(`${P.faults} ${kind} fault${P.faults > 1 ? 's' : ''}`);
    }
    if (P.unconformity >= 0.02) {
      const u = traitName('unconformity', P);
      bits.push(u.includes('angular') ? 'an angular unconformity' : 'a disconformity');
    }
    if (P.dikes > 0) bits.push(P.dikes === 1 ? 'one dike' : `${P.dikes} dikes`);
    if (P.veins >= 0.4) bits.push('quartz veining');
    if (P.fossils >= 0.35) bits.push('fossil beds');
    let s = bits[0];
    if (bits.length > 1) s = bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length - 1];
    return `${pal} series: ${s}.`;
  }

  /* ---------- scene: (params, seed) → shader uniforms ----------
     Every random draw happens regardless of slider values, so moving one
     slider never reshuffles an unrelated feature.                        */
  function hexRGB(h) {
    const n = parseInt(h.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function scene(P) {
    const R = rng(P.seed);
    const G = geometry(P);
    const aspect = FORMATS[P.format].a;
    const pal = PALETTES[P.palette];

    const off = [R() * 40 + 5, R() * 40 + 5, R() * 40 + 5, R() * 40 + 5];
    const ph = [R() * TAU, R() * TAU, R() * TAU, R() * TAU];
    const dipDir = R() < 0.5 ? -1 : 1;
    const verge = R() < 0.5 ? -1 : 1;
    const dipBJitter = (R() - 0.5) * 0.06;

    // faults — stratified across the width, shuffled so the first n spread out
    const slots = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 7; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const faultRaw = [];
    for (let i = 0; i < 8; i++) {
      faultRaw.push({ slot: slots[i], jx: R(), cy: R(), ra: R(), rs: R(), rm: R(), ro: R() });
    }
    const normal = P.throw >= 0;
    const tmag = Math.pow(Math.abs(P.throw), 1.2) * 0.17;
    const uFault = [], uFaultX = [];
    faultRaw.forEach((f) => {
      const cx = (aspect * (f.slot + 0.5 + (f.jx - 0.5) * 0.7)) / 8;
      const cy = 0.35 + f.cy * 0.45;
      const ang = (normal ? lerp(52, 76, f.ra) : lerp(24, 40, f.ra)) * Math.PI / 180;
      const side = f.rs < 0.62 ? dipDir : -dipDir;
      const thr = (normal ? 1 : -1) * tmag * lerp(0.45, 1.2, f.rm);
      uFault.push(cx, cy, side * Math.cos(ang), Math.sin(ang));
      uFaultX.push(thr, f.ro < 0.5 ? 1 : 0);
    });

    // dikes
    const uDike = [];
    for (let i = 0; i < 5; i++) {
      const x0 = aspect * (0.1 + 0.8 * R());
      const slope = (R() - 0.5) * 0.5;
      const hw = lerp(0.004, 0.016, Math.pow(R(), 1.5));
      const reaches = R() < 0.55;
      const yt = lerp(0.3, 0.8, R());
      uDike.push(x0, slope, hw, reaches ? -1 : yt);
    }

    // palette
    const rocks = pal.rocks;
    const total = rocks.reduce((a, r) => a + r[1], 0);
    const uPal = [], uPalW = [];
    let acc = 0;
    for (let i = 0; i < 8; i++) {
      const r = rocks[Math.min(i, rocks.length - 1)];
      uPal.push(...hexRGB(r[0]));
      if (i < rocks.length) { acc += r[1] / total; uPalW.push(i === rocks.length - 1 ? 1 : acc); }
      else uPalW.push(1);
    }

    const uncOn = P.unconformity >= 0.02 ? 1 : 0;
    const top = Math.max(G.horizon + G.reliefAmp * 0.9, 0) + 0.06;
    const uncDepth = lerp(1.0, top, clamp01((P.unconformity - 0.02) / 0.98));

    const lowGround = G.horizon + G.reliefAmp;
    const waterLvl = lowGround - P.water * (G.reliefAmp * 1.9 + 0.06);

    const u = {
      uAspect: aspect,
      uMargin: P.margin < 0.02 ? 0 : lerp(0.02, 0.085, P.margin),
      uPaper: hexRGB(pal.paper), uInk: hexRGB(pal.ink), uSkyC: hexRGB(pal.sky), uWaterC: hexRGB(pal.water),
      uIgn: hexRGB(pal.ign), uVeinC: hexRGB(pal.vein), uStain: hexRGB(pal.stain),
      uPal, uPalW, uPalN: rocks.length,
      uOff: off, uPh: ph,
      uZoom: G.zoom,
      uHorizon: G.horizon, uRelief: P.relief, uWaterLvl: waterLvl, uWaterOn: (P.water > 0.02 && G.skyOn) ? 1 : 0,
      uBanding: lerp(3, 42, Math.pow(P.banding, 1.3)) / G.zoom,
      uRhythm: P.rhythm, uBedding: P.bedding, uPattern: P.pattern,
      uDip: (G.dipDeg * Math.PI) / 180,
      uDipB: (G.dipDeg * Math.PI / 180) * 0.12 + dipBJitter,
      uFoldA: G.foldA, uFoldL: G.foldL, uShear: G.S * verge,
      uCrumple: Math.pow(P.crumple, 1.5) * 0.05,
      uFault, uFaultX, uFaultN: P.faults | 0,
      uUncOn: uncOn, uUncDepth: uncDepth,
      uDike, uDikeN: P.dikes | 0,
      uVeins: P.veins, uFossils: P.fossils,
      uWeather: P.weathering, uLine: P.linework, uGrain: P.grain,
    };
    return { u, aspect };
  }

  function applyUniforms(sh, P, pxW, pxH) {
    const { u } = scene(P);
    for (const key in u) {
      const v = u[key];
      sh.setUniform(key, Array.isArray(v) ? v.slice() : v);
    }
    sh.setUniform('uRes', [pxW, pxH]);
  }

  /* ---------- randomize / mutate ----------
     Randomize samples each trait from a hand-tuned distribution that keeps
     most outputs near the centre of the algorithm, with long tails.       */
  const RANDOMIZERS = {
    scale: (R) => clamp01(0.15 + R() * 0.7 + (R() - 0.5) * 0.2),
    sky: (R) => (R() < 0.18 ? 0 : 0.1 + R() * 0.55),
    relief: (R) => Math.pow(R(), 0.8),
    water: (R) => (R() < 0.72 ? 0 : 0.1 + R() * 0.8),
    margin: (R) => (R() < 0.25 ? 0 : 0.2 + R() * 0.6),
    banding: (R) => 0.15 + R() * 0.7,
    rhythm: (R) => R(),
    bedding: (R) => R() * 0.9,
    pattern: (R) => (R() < 0.15 ? 0 : 0.4 + R() * 0.6),
    dip: (R) => (R() - 0.5) * (R() < 0.8 ? 0.8 : 1.9),
    folding: (R) => (R() < 0.2 ? R() * 0.15 : 0.2 + R() * 0.65),
    wavelength: (R) => R(),
    overturn: (R) => (R() < 0.6 ? R() * 0.35 : R()),
    crumple: (R) => Math.pow(R(), 2) * 0.8,
    faults: (R) => Math.floor(Math.pow(R(), 1.6) * 7),
    throw: (R) => (R() < 0.7 ? 0.2 + R() * 0.6 : -(0.2 + R() * 0.6)),
    unconformity: (R) => (R() < 0.45 ? 0 : 0.15 + R() * 0.8),
    dikes: (R) => (R() < 0.45 ? 0 : 1 + Math.floor(Math.pow(R(), 2) * 4)),
    veins: (R) => (R() < 0.75 ? 0 : 0.2 + R() * 0.8),
    fossils: (R) => (R() < 0.5 ? 0 : Math.pow(R(), 1.5)),
    weathering: (R) => R() * 0.8,
    linework: (R) => (R() < 0.12 ? 0 : 0.15 + R() * 0.75),
    grain: (R) => 0.2 + R() * 0.6,
  };
  const PALETTE_ODDS = [3, 2, 1.6, 1.4, 1, 1, 1, 1, 0.6];
  const FORMAT_ODDS = [3, 1, 1.4, 0.6];

  function pickWeighted(R, w) {
    const t = w.reduce((a, b) => a + b, 0);
    let x = R() * t;
    for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
    return w.length - 1;
  }

  function snap(p, v) {
    v = Math.min(p.max, Math.max(p.min, v));
    const n = Math.round((v - p.min) / p.step);
    return +(p.min + n * p.step).toFixed(4);
  }

  function randomize(seed, keepFormat) {
    const R = rng((seed * 2654435761) >>> 0);
    const o = { seed, format: keepFormat != null ? keepFormat : pickWeighted(R, FORMAT_ODDS), palette: pickWeighted(R, PALETTE_ODDS) };
    PARAMS.forEach((p) => {
      const f = RANDOMIZERS[p.k];
      o[p.k] = snap(p, f ? f(R) : p.def);
    });
    return o;
  }

  function mutate(P, salt) {
    const R = rng((P.seed * 7919 + salt * 104729) >>> 0);
    const o = Object.assign({}, P);
    PARAMS.forEach((p) => {
      if (R() < 0.35) {
        const span = p.max - p.min;
        const g = (R() + R() + R() - 1.5) * 0.28 * span;
        o[p.k] = snap(p, P[p.k] + (p.step >= 1 ? Math.round(g) || (R() < 0.5 ? -1 : 1) : g));
      }
    });
    if (R() < 0.12) o.palette = Math.floor(R() * PALETTES.length);
    return o;
  }

  /* ---------- recipe codes: STRATA1.seed.format.palette.values ---------- */
  function encode(P) {
    const vals = PARAMS.map((p) => {
      const n = Math.round((P[p.k] - p.min) / p.step);
      return n.toString(36).padStart(2, '0');
    }).join('');
    return `STRATA1.${P.seed}.${P.format}${P.palette}.${vals}`;
  }

  function decode(str) {
    const m = String(str).trim().match(/^STRATA1\.(\d+)\.(\d)(\d)\.([0-9a-z]+)$/i);
    if (!m) return null;
    const o = defaults();
    o.seed = parseInt(m[1], 10) >>> 0;
    o.format = Math.min(FORMATS.length - 1, parseInt(m[2], 10));
    o.palette = Math.min(PALETTES.length - 1, parseInt(m[3], 10));
    const body = m[4].toLowerCase();
    PARAMS.forEach((p, i) => {
      const chunk = body.slice(i * 2, i * 2 + 2);
      if (chunk.length === 2) o[p.k] = snap(p, p.min + parseInt(chunk, 36) * p.step);
    });
    return o;
  }

  /* ======================================================================
     SHADERS
     ====================================================================== */
  const VERT = `#version 300 es
precision highp float;
in vec3 aPosition;
void main() {
  vec4 p = vec4(aPosition, 1.0);
  p.xy = p.xy * 2.0 - 1.0;
  gl_Position = p;
}`;

  const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uAspect;
uniform float uMargin;

uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uSkyC;
uniform vec3 uWaterC;
uniform vec3 uIgn;
uniform vec3 uVeinC;
uniform vec3 uStain;
uniform vec3 uPal[8];
uniform float uPalW[8];
uniform float uPalN;

uniform vec4 uOff;
uniform vec4 uPh;
uniform float uZoom;
uniform float uHorizon;
uniform float uRelief;
uniform float uWaterLvl;
uniform float uWaterOn;

uniform float uBanding;
uniform float uRhythm;
uniform float uBedding;
uniform float uPattern;

uniform float uDip;
uniform float uDipB;
uniform float uFoldA;
uniform float uFoldL;
uniform float uShear;
uniform float uCrumple;

uniform vec4 uFault[8];
uniform vec2 uFaultX[8];
uniform int uFaultN;

uniform float uUncOn;
uniform float uUncDepth;

uniform vec4 uDike[5];
uniform int uDikeN;

uniform float uVeins;
uniform float uFossils;
uniform float uWeather;
uniform float uLine;
uniform float uGrain;

/* ---------------- hashing & noise ---------------- */
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

// 2D simplex noise — Ian McEwan, Ashima Arts (MIT)
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * snoise(p); p = p * 2.07 + 31.7; a *= 0.5; } return s; }

/* ---------------- anti-aliased coverage helpers ---------------- */
// screen-space line: distance and width in pixels
float lineCov(float dPx, float wPx) {
  float w = max(wPx, 1.0);
  return (1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, dPx)) * clamp(wPx, 0.0, 1.0);
}
// pattern-space line: d, half-width and pixel footprint all in pattern units
float pLine(float d, float hw, float fw) {
  float h = max(hw, fw * 0.5);
  return (1.0 - smoothstep(h - fw * 0.5, h + fw * 0.5, d)) * min(1.0, 2.0 * hw / max(fw, 1e-5));
}
float fillCov(float d, float r, float fw) {
  return (1.0 - smoothstep(r - fw * 0.5, r + fw * 0.5, d)) * min(1.0, 2.0 * r / max(fw, 1e-5));
}

/* ---------------- stratigraphy ---------------- */
float jit(float k, float salt, float amt) { return (hash11(k * 0.6180339 + salt * 1.37 + 11.3) - 0.5) * amt; }
// jittered-grid layer lookup: returns (index, fraction through layer 0=top, thickness) in t-units
vec3 layerLookup(float t, float salt, float amt) {
  float k = floor(t);
  float b0 = k + jit(k, salt, amt);
  float b1 = k + 1.0 + jit(k + 1.0, salt, amt);
  float idx = k, lo = b0, hi = b1;
  if (t < b0) { idx = k - 1.0; hi = b0; lo = k - 1.0 + jit(k - 1.0, salt, amt); }
  else if (t >= b1) { idx = k + 1.0; lo = b1; hi = k + 2.0 + jit(k + 2.0, salt, amt); }
  return vec3(idx, (t - lo) / (hi - lo), hi - lo);
}
// ~20% of formations continue the one above, making thicker packages
float effId(float F, float salt) { return F - step(hash11(F * 1.731 + salt + 5.1), 0.2); }
int palIndex(float E, float salt) {
  float h = hash11(E * 3.917 + salt * 2.3 + uOff.x * 0.13);
  int ci = 0;
  for (int i = 0; i < 7; i++) { if (h >= uPalW[i]) ci = i + 1; }
  return ci;
}
// 0 massive, 1 sandstone, 2 shale, 3 limestone, 4 conglomerate, 5 cross-bedded, 6 dolomite, 7 coal
int lithoOf(float E, float salt, float thick) {
  float h = hash11(E * 5.113 + salt * 3.1 + uOff.y * 0.11);
  int l = 7;
  if (h < 0.20) l = 0; else if (h < 0.40) l = 1; else if (h < 0.58) l = 2; else if (h < 0.74) l = 3;
  else if (h < 0.81) l = 4; else if (h < 0.90) l = 5; else if (h < 0.96) l = 6;
  if (l == 7 && thick > 0.6) l = 2;
  return l;
}

/* ---------------- lithology symbols (USGS-style) ---------------- */
float patDots(vec2 P, float fw, float seed) {
  float c = 0.0;
  for (int j = 0; j < 2; j++) {
    float sc = j == 0 ? 1.5 : 2.2;
    vec2 g = P * sc + float(j) * 17.3;
    vec2 id = floor(g); vec2 f = fract(g);
    vec2 r = hash22(id + seed * 0.37 + float(j) * 5.1);
    vec2 pos = 0.22 + 0.56 * r;
    float d = length(f - pos) / sc;
    float rad = 0.045 + 0.03 * hash12(id + 7.7 + seed);
    float keep = step(0.3, hash12(id + 3.3 + seed));
    c = max(c, fillCov(d, rad, fw) * keep);
  }
  return c;
}
float patDash(vec2 P, float fw, float seed, float hw) {
  float row = floor(P.y * 1.3);
  float fy = fract(P.y * 1.3) - 0.5;
  float off = hash11(row * 1.37 + seed) * 4.0;
  float x = P.x * 0.7 + off;
  float cell = floor(x);
  float fx = fract(x);
  float len = 0.45 + 0.3 * hash11(cell * 3.1 + row * 7.7 + seed);
  float e = fw * 0.7;
  float along = smoothstep(0.0, e, fx) * (1.0 - smoothstep(len - e, len, fx));
  return pLine(abs(fy) / 1.3, hw, fw) * along;
}
float patBrick(vec2 P, float fw, float slant, float hw) {
  float row = floor(P.y);
  float fy = fract(P.y);
  float h = pLine(min(fy, 1.0 - fy), hw, fw);
  float x = (P.x + slant * (fy - 0.5) * 0.9) * 0.5 + 0.5 * mod(row, 2.0);
  float fx = fract(x);
  float v = pLine(min(fx, 1.0 - fx) * 2.0, hw, fw);
  return max(h, v);
}
float patPebble(vec2 P, float fw, float seed, float hw) {
  vec2 g = P * 0.75;
  vec2 id = floor(g); vec2 f = fract(g);
  vec2 r = hash22(id + seed * 0.71);
  float rad = 0.13 + 0.15 * hash12(id + 2.9 + seed);
  vec2 ctr = vec2(0.5) + (r - 0.5) * (0.84 - 2.0 * rad);
  vec2 dd = (f - ctr) * vec2(1.0, 1.3);
  float d = abs(length(dd) - rad) / 0.75;
  float keep = step(0.12, hash12(id + 9.1));
  float peb = pLine(d, hw, fw) * keep;
  // sand matrix between the pebbles
  return max(peb, patDots(P * 1.3 + 3.0, fw * 1.3, seed) * 0.6);
}
float patXbed(vec2 P, float fw, float bedFrac, float bedThickP, float bedId, float hw) {
  float dir = hash11(bedId * 5.31 + 1.7) > 0.5 ? 1.0 : -1.0;
  float T = max(bedThickP, 0.01);
  float y = bedFrac * T;
  float g = (y / T) * (y / T) * T * 1.8;       // foresets steep at top, tangential at base
  float v = dir * P.x + g;
  float sp = 0.8;
  float fv = fract(v / sp);
  float grad = sqrt(1.0 + pow(3.6 * y / T, 2.0));
  float d = min(fv, 1.0 - fv) * sp / grad;
  return pLine(d, hw * 0.85, fw);
}
// ammonites and crinoid ossicles, deformed along with their host bed
void fossil(vec2 P, float fw, float seed, float dens, float hw, out float fill, out float ink) {
  fill = 0.0; ink = 0.0;
  float cs = mix(8.0, 3.4, dens);
  vec2 g = P / cs;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed * 0.53 + 1.3);
  if (h > dens * 0.8 + 0.02) return;
  vec2 jt = (hash22(id + 4.3 + seed) - 0.5) * 0.25;
  vec2 c = (f - jt) * cs;
  float kind = hash12(id + 8.8);
  float R = cs * (kind < 0.7 ? (0.17 + 0.1 * hash12(id + 2.2)) : 0.09);
  float a = hash12(id + 1.1) * 6.2831853;
  float ca = cos(a), sa = sin(a);
  c = vec2(ca * c.x - sa * c.y, sa * c.x + ca * c.y);
  float r = length(c);
  if (r > R + fw * 2.0 + hw * 3.0) return;
  fill = fillCov(r, R, fw);
  float outline = pLine(abs(r - R), hw * 1.15, fw);
  if (kind >= 0.7) {                      // crinoid ossicle: disc with a lumen
    ink = max(outline, fillCov(r, R * 0.28, fw));
    return;
  }
  float th = atan(c.y, c.x);
  float b = 0.1;
  float t = log(max(r, 1e-4) / R) / (6.2831853 * b) - th / 6.2831853;
  float dt = abs(t - floor(t + 0.5));
  float spiral = pLine(dt * 6.2831853 * b * r, hw, fw) * step(R * 0.08, r) * step(r, R);
  float fr = fract(th * 24.0 / 6.2831853);
  float ribs = pLine(min(fr, 1.0 - fr) * (6.2831853 / 24.0) * r, hw * 0.6, fw) * step(r, R) * smoothstep(R * 0.35, R * 0.6, r) * 0.55;
  ink = max(max(spiral, ribs), outline);
}

/* ---------------- fracture network (Voronoi edges, after Inigo Quilez) ---------------- */
float crackDist(vec2 x, out vec2 idA, out vec2 idB) {
  vec2 n = floor(x); vec2 f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0; idB = n;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + hash22(n + g) - f;
    if (dot(mr - r, mr - r) > 1e-5) {
      float d = dot(0.5 * (mr + r), normalize(r - mr));
      if (d < md) { md = d; idB = n + g; }
    }
  }
  idA = n + mg;
  return md;
}
float veinSet(vec2 q, float ang, vec2 stretch, float dens, float wPx, float salt) {
  float c = cos(ang), s = sin(ang);
  vec2 x = mat2(c, -s, s, c) * q * stretch + salt;
  vec2 a, b;
  float d = crackDist(x, a, b);
  float gd = length(vec2(dFdx(d), dFdy(d)));
  float h = hash12(a + b + 0.5 * a * b + salt);
  float on = step(h, dens);
  float w = wPx * (0.35 + 1.3 * hash12(a * b + a + b + 3.1 + salt));
  return lineCov(d / max(gd, 1e-6), w) * on;
}

/* ---------------- landscape ---------------- */
float surfaceY(float x) {
  float h = fbm(vec2(x * 1.5 + uOff.x, uOff.y)) * 1.2 + 0.2 * snoise(vec2(x * 6.0 + uOff.z, 3.1)) * uRelief;
  float mesa = smoothstep(0.62, 0.95, uRelief);
  float t = h * 3.5;
  float tq = (floor(t) + smoothstep(0.72, 0.98, fract(t))) / 3.5;
  h = mix(h, tq, mesa * 0.85);
  return uHorizon - h * uRelief * 0.16;
}

void main() {
  float H = uRes.y;
  vec2 q = vec2(gl_FragCoord.x / H, 1.0 - gl_FragCoord.y / H);   // y down, height = 1
  float k1000 = H / 1000.0;
  float lineW = uLine * 2.2 * k1000;                               // contact width, px

  /* ---- ground surface ---- */
  float sy = surfaceY(q.x);
  float slope = dFdx(sy) / max(dFdx(q.x), 1e-7);
  float dSurf = (q.y - sy) / sqrt(1.0 + slope * slope);
  float ground = smoothstep(-0.5, 0.5, dSurf * H);

  /* ---- late faults (cut everything) ---- */
  vec2 p = q;
  float faultLate = 0.0;
  for (int k = 0; k < 8; k++) {
    int i = uFaultN - 1 - k;
    if (i < 0) break;
    if (uFaultX[i].y > 0.5 && uUncOn > 0.5) continue;
    vec2 c = uFault[i].xy; vec2 d = uFault[i].zw; float thr = uFaultX[i].x;
    vec2 n = (d.x >= 0.0 ? 1.0 : -1.0) * vec2(d.y, -d.x);   // points into the hanging wall
    float side = dot(p - c, n);
    float hw = step(0.0, side);
    float drag = 0.35 * exp(-abs(side) / 0.03);
    faultLate = max(faultLate, lineCov(abs(side) * H, lineW * 1.4));
    p -= d * thr * (hw * (1.0 - drag) + (1.0 - hw) * drag * 0.5);
  }
  vec2 p1 = p;

  /* ---- dikes (intruded before the late faults, so the faults offset them) ---- */
  float dikeCov = 0.0, dikeR = 0.0, dikeJoint = 0.0, dikeWall = 0.0, bake = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= uDikeN) break;
    vec4 D = uDike[i];
    float xc = D.x + (p1.y - 0.5) * D.y + 0.015 * snoise(vec2(p1.y * 3.0, D.x * 7.0 + uOff.w));
    float w = D.z * (0.8 + 0.3 * snoise(vec2(p1.y * 5.0 + 3.0, D.x * 3.0))) * smoothstep(D.w, D.w + 0.15, p1.y);
    float cosT = 1.0 / sqrt(1.0 + D.y * D.y);
    float ax = abs(p1.x - xc);
    float sd = (ax - w) * cosT * H;
    float cov = 1.0 - smoothstep(-0.5, 0.5, sd);
    dikeWall = max(dikeWall, lineCov(abs(sd), lineW * 0.9) * step(0.0002, w));
    bake = max(bake, exp(-max(sd, 0.0) / max(w * cosT * H * 1.2, 1.0)) * step(0.0002, w));
    if (cov > dikeCov) {
      dikeCov = cov;
      dikeR = ax / max(w, 1e-5);
      float along = p1.y + D.y * (p1.x - xc);
      float sp = max(w * 1.1, 0.006);
      float ph = along / sp + 0.35 * snoise(vec2(along * 25.0, D.x * 5.0));
      float fj = fract(ph);
      dikeJoint = lineCov(min(fj, 1.0 - fj) * sp * H, max(lineW * 0.6, 0.8 * k1000)) * (1.0 - smoothstep(0.8, 0.95, dikeR));
    }
  }

  /* ---- unconformity: an old erosion surface, buried by younger beds ---- */
  float U = uUncDepth + 0.022 * fbm(vec2(p1.x * 2.2 + uOff.y, 5.3)) + 0.008 * snoise(vec2(p1.x * 11.0, 1.7 + uOff.x));
  float inB = uUncOn * (1.0 - step(U, p1.y));
  float uncLine = uUncOn * lineCov(abs(p1.y - U) * H, lineW * 1.7 + 0.6 * k1000 * uUncOn);

  /* ---- early faults: only in the old sequence, truncated by the unconformity ---- */
  vec2 p2 = p1;
  float faultEarly = 0.0;
  if (uUncOn > 0.5) {
    for (int k = 0; k < 8; k++) {
      int i = uFaultN - 1 - k;
      if (i < 0) break;
      if (uFaultX[i].y < 0.5) continue;
      vec2 c = uFault[i].xy; vec2 d = uFault[i].zw; float thr = uFaultX[i].x;
      vec2 n = (d.x >= 0.0 ? 1.0 : -1.0) * vec2(d.y, -d.x);
      float side = dot(p2 - c, n);
      float hw = step(0.0, side);
      float drag = 0.35 * exp(-abs(side) / 0.03);
      faultEarly = max(faultEarly, lineCov(abs(side) * H, lineW * 1.4));
      p2 -= d * thr * (hw * (1.0 - drag) + (1.0 - hw) * drag * 0.5);
    }
  }
  faultEarly *= 1.0 - inB;

  /* ---- old sequence: undo tilt, shear, folding, crumple ---- */
  vec2 C = vec2(uAspect * 0.5, 0.5);
  vec2 w = (p2 - C) * uZoom;
  float ca = cos(uDip), sa = sin(uDip);
  w = vec2(ca * w.x + sa * w.y, -sa * w.x + ca * w.y);
  w.x -= uShear * w.y;
  float kf = 6.2831853 / uFoldL;
  float ampv = uFoldA * (0.7 + 0.45 * snoise(vec2(w.x * 0.3 + uOff.x, w.y * 0.9 + uOff.z)));
  float fx = sin(kf * w.x + uPh.x) + 0.3 * sin(2.3 * kf * w.x + uPh.y) + 0.3 * snoise(vec2(w.x * kf * 0.2 + uOff.w, 0.5));
  float sA = w.y - ampv * fx;
  float uA = w.x;
  vec2 cq = vec2(uA, sA) * 5.0;
  uA += fbm3(cq + uOff.xy) * uCrumple;
  sA += fbm3(cq + uOff.zw + 9.1) * uCrumple;

  /* ---- young sequence: near-flat, laps onto the erosion surface ---- */
  vec2 wb = (p1 - C) * uZoom;
  float sB = wb.y + tan(uDipB) * wb.x + 0.01 * snoise(vec2(wb.x * 1.5, 7.7 + uOff.y)) + 37.0;
  float uB = wb.x;

  float u = mix(uA, uB, inB);
  float s = mix(sA, sB, inB);
  float salt = inB * 71.37;

  /* ---- layer coordinates + their screen-space footprints (uniform control flow) ---- */
  float tf = s * uBanding;
  tf += uRhythm * 0.9 * sin(tf * 0.45 + uPh.z);
  float ftf = fwidth(tf);
  float bedsPer = mix(1.6, 8.0, uBedding);
  float tb = s * uBanding * bedsPer;
  float ftb = fwidth(tb);
  float patSize = 0.0125 * pow(uZoom, 0.5);
  vec2 P = vec2(u, s) / patSize;
  vec2 fP = fwidth(P);
  float fwp = max(fP.x, fP.y);
  float hwP = 0.03 + 0.035 * uLine;                       // symbol stroke, pattern units

  /* ---- veins: late quartz-filled fractures (screen space) ---- */
  float vreg = smoothstep(0.62 - uVeins * 0.55, 0.9 - uVeins * 0.45, fbm3(q * 1.3 + uOff.wz) * 0.5 + 0.5);
  float vOn = step(0.001, uVeins);
  float vW = mix(0.9, 3.2, uVeins) * k1000;
  float vein = veinSet(q, uPh.w, vec2(2.5, 7.0), mix(0.25, 0.6, uVeins), vW, uOff.x) * vreg * vOn;
  vein = max(vein, veinSet(q, uPh.w + 1.2, vec2(6.0, 16.0), mix(0.1, 0.45, uVeins), vW * 0.45, uOff.y) * vreg * vOn * smoothstep(0.25, 0.7, uVeins));

  float g1 = snoise(q * 950.0 + uOff.xy);
  float g2 = fbm3(q * vec2(2.0, 7.0) + uOff.zw);

  /* ---------------- rock colour ---------------- */
  vec3 L = layerLookup(tf, salt, uRhythm * 0.9);
  float F = L.x;
  float E = effId(F, salt);
  float Eup = effId(F - 1.0, salt);
  float Edn = effId(F + 1.0, salt);
  int ci = palIndex(E, salt);
  if (E != Eup && ci == palIndex(Eup, salt)) ci = int(mod(float(ci + 1), uPalN));
  int lit = lithoOf(E, salt, L.z);

  // basal conglomerate just above the unconformity
  float aboveU = (U - p1.y);
  if (inB > 0.5 && aboveU < 0.016 / max(uZoom, 0.5) + 0.004) lit = 4;

  vec3 col = uPal[ci];
  if (lit == 7) col = mix(uInk, col, 0.12);
  vec3 B = layerLookup(tb, salt + 3.7, 0.8);
  float bedTone = hash11(B.x * 2.71 + salt + 3.3) - 0.5;
  col *= 1.0 + bedTone * 0.14 * uBedding;
  col *= 1.0 - (L.y - 0.5) * 0.05;                        // faint graded bedding
  vec3 patInk = mix(col, uInk, 0.72);

  // fossils
  if (uFossils > 0.001 && (lit == 3 || lit == 2 || lit == 0)) {
    float ff, fi;
    fossil(P, fwp, E + salt, uFossils, hwP, ff, fi);
    col = mix(col, mix(col, uPaper, 0.3), ff * 0.8);
    col = mix(col, patInk, fi * max(uPattern, 0.35));
  }

  // lithology symbol
  float pc = 0.0;
  float bedThickP = B.z / (uBanding * bedsPer) / patSize;
  if (lit == 1) pc = patDots(P, fwp, E);
  else if (lit == 2) pc = patDash(P, fwp, E, hwP);
  else if (lit == 3) pc = patBrick(P, fwp, 0.0, hwP);
  else if (lit == 4) pc = patPebble(P, fwp, E, hwP);
  else if (lit == 5) pc = bedThickP > 1.4 ? patXbed(P, fwp, B.y, bedThickP, B.x + salt, hwP) : patDots(P, fwp, E);
  else if (lit == 6) pc = patBrick(P, fwp, 1.0, hwP);
  pc *= (1.0 - smoothstep(0.2, 0.5, fwp)) * uPattern;
  col = mix(col, patInk, pc);

  // bedding planes
  float dB = min(B.y, 1.0 - B.y) * B.z / max(ftb, 1e-6);
  col = mix(col, patInk, lineCov(dB, max(lineW * 0.4, 0.7 * k1000)) * uBedding * 0.45);

  // formation contacts
  float dF = min(L.y, 1.0 - L.y) * L.z / max(ftf, 1e-6);
  float realC = L.y < 0.5 ? float(E != Eup) : float(E != Edn);
  col = mix(col, uInk, lineCov(dF, lineW) * mix(0.35, 0.9, realC));

  // early faults + unconformity
  col = mix(col, uInk, faultEarly);
  col = mix(col, uInk, uncLine);

  // contact metamorphism around dikes, then the dikes themselves
  col = mix(col, col * 0.78, bake * (1.0 - dikeCov) * 0.6 * step(0.5, float(uDikeN)));
  vec3 dcol = uIgn * (1.0 + g2 * 0.12);
  dcol = mix(dcol, mix(uIgn, uInk, 0.5), smoothstep(0.72, 1.0, dikeR) * 0.6);   // chilled margin
  dcol = mix(dcol, mix(uIgn, uPaper, 0.4), dikeJoint * 0.7);                    // columnar joints
  col = mix(col, dcol, dikeCov);
  col = mix(col, uInk, dikeWall * 0.85);

  col = mix(col, uInk, faultLate);
  col = mix(col, uVeinC, vein);

  // weathering profile and soil
  float dd = max(dSurf, 0.0);
  float wz = uWeather * exp(-dd / (0.02 + 0.12 * uWeather)) * (0.65 + 0.35 * snoise(q * vec2(6.0, 14.0) + uOff.xy));
  col = mix(col, uStain, clamp(wz, 0.0, 1.0) * 0.6);
  float soilT = 0.003 + 0.008 * uWeather;
  float soil = 1.0 - smoothstep(-0.5, 0.5, (dSurf - soilT) * H);
  col = mix(col, mix(uInk, uStain, 0.35), soil * 0.85);

  /* ---------------- sky and water ---------------- */
  vec3 air = mix(uSkyC, uPaper, smoothstep(0.0, max(sy, 0.05), q.y) * 0.5);
  float depthW = q.y - uWaterLvl;
  float wat = uWaterOn * smoothstep(-0.5, 0.5, depthW * H);
  vec3 wcol = mix(uWaterC, uWaterC * 0.88, smoothstep(0.0, 0.2, depthW));
  float rowW = floor(depthW / 0.011);
  float frW = fract(depthW / 0.011);
  float dash = step(0.3, snoise(vec2(q.x * 22.0, rowW * 1.7 + uOff.z)));
  wcol = mix(wcol, mix(uWaterC, uPaper, 0.55), lineCov(abs(frW - 0.5) * 0.011 * H, 0.9 * k1000) * dash * step(0.5, rowW) * 0.8);
  air = mix(air, wcol, wat);
  air = mix(air, uInk, lineCov(abs(depthW) * H, lineW * 0.8 + 0.5 * k1000) * uWaterOn * 0.75);

  vec3 outc = mix(air, col, ground);
  outc = mix(outc, uInk, lineCov(abs(dSurf) * H, lineW * 1.3 + 0.4 * k1000));

  /* ---------------- paper, grain, plate margin ---------------- */
  outc *= 1.0 + g2 * 0.07 * uGrain;
  outc += g1 * 0.045 * uGrain;
  outc += snoise(q * vec2(30.0, 320.0) + uOff.yz) * 0.012 * uGrain * (1.0 - ground);

  vec2 e2 = min(q - uMargin, vec2(uAspect, 1.0) - uMargin - q);
  float dIn = min(e2.x, e2.y);
  float inside = smoothstep(-0.5, 0.5, dIn * H);
  vec3 paper = uPaper * (1.0 + g2 * 0.03 * uGrain) + g1 * 0.03 * uGrain;
  outc = mix(paper, outc, inside);
  outc = mix(outc, uInk, lineCov(abs(dIn) * H, lineW * 0.7 + 0.6 * k1000) * step(0.001, uMargin));

  fragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`;

  root.Strata = {
    TAU, FORMATS, PALETTES, PARAMS, PARAM_BY_KEY, VERT, FRAG,
    rng, defaults, geometry, traitName, caption, scene, applyUniforms,
    randomize, mutate, encode, decode, snap,
  };
})(typeof window !== 'undefined' ? window : globalThis);
