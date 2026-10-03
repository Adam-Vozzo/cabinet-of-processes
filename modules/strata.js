/* Strata — adapter that plugs the existing Strata engine (strata-engine.js)
   into the cabinet. This is also the reference example of a WebGL module. */
(function () {
  const S = window.Strata;
  const C = window.Cabinet;

  C.register({
    id: 'strata',
    name: 'Strata',
    group: 'process',
    order: 0,
    renderer: 'webgl',
    subtitle: 'Geological cross-section',
    about: 'Each pixel is traced backwards through a made-up history: surface, late faults, dikes, unconformity, early faults, tilt, overturn, folds and crumple, until it lands in a flat bed. That bed sets its colour and its map symbol, so symbols and fossils bend and break with the rock.',
    formats: [0, 1, 2, 3],
    formatOdds: [3, 1, 1.4, 0.6],
    defaults: { seed: 3107, format: 0, palette: 0 },
    palettes: S.PALETTES.map((p) => ({ name: p.name, colors: p.rocks.map((r) => r[0]), paper: p.paper })),
    paletteOdds: [3, 2, 1.6, 1.4, 1, 1, 1, 1, 0.6],
    params: S.PARAMS.map((p) => Object.assign({}, p)),

    randomize(R, seed) { return S.randomize(seed); },
    traitName(k, P) { return S.PARAM_BY_KEY[k] ? S.traitName(k, P) : null; },
    caption(P) { return S.caption(P); },
    sheet(P) {
      return [
        ['Palette', S.PALETTES[P.palette].name],
        ['Format', S.FORMATS[P.format].label],
        ['Scale', S.traitName('scale', P)],
        ['Banding', S.traitName('banding', P)],
        ['Folding', S.traitName('folding', P)],
        ['Overturn', S.traitName('overturn', P)],
        ['Dip', S.traitName('dip', P)],
        ['Faults', (P.faults === 0 || Math.abs(P.throw) < 0.03) ? 'None' : `${P.faults} ${P.throw > 0 ? 'normal' : 'reverse'}`],
        ['Unconformity', S.traitName('unconformity', P)],
        ['Intrusions', S.traitName('dikes', P)],
        ['Veins', S.traitName('veins', P)],
        ['Fossils', S.traitName('fossils', P)],
      ];
    },

    setup(p) {
      return { sh: p.createShader(S.VERT, S.FRAG), dirty: true };
    },
    start(p, P, st) { st.dirty = true; },
    frame(p, P, st) {
      const [w, h] = C.bufferSize(p);
      p.noStroke();
      p.shader(st.sh);
      S.applyUniforms(st.sh, P, w, h);
      p.rect(0, 0, p.width, p.height);
      return false;
    },
    exportAt(p, P, W, H) {
      return C.shaderStill(p, S.FRAG, (sh, w, h) => S.applyUniforms(sh, P, w, h), W, H);
    },
  });
})();
