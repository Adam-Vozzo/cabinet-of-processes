# Writing a module

The page is a tabbed collection of generative-art algorithms. Each tab is one **module**: a single file
`modules/<id>.js` that calls `Cabinet.register({...})`. The shell (`ui.js`) builds the tab,
the slider panel, trait sheet, history, recipe codes and PNG export from what you register, and gives
your module its own p5 instance while its tab is open.

Read `core.js` (helpers) and `modules/strata.js` (a small WebGL module) first. To add a tab, write the
module file and add a `<script src="modules/<id>.js">` line to `index.html` before `ui.js`.

## Hard rules

- **p5.js 1.11.13, instance mode only.** Use `p.` for every p5 call (`p.noise`, `p.createGraphics`, …).
  No other libraries, no network, no `import`. Plain ES2020 in an IIFE.
- **Deterministic.** All randomness comes from the seed: `const R = Cabinet.rng(P.seed ^ 0x51f3)` (or
  `p.randomSeed(P.seed)` / `p.noiseSeed(P.seed)`). Never `Math.random()`. The same params must always
  give the same picture.
- **Independent of screen size.** Compute in a fixed virtual space (e.g. height = 1000 units, width =
  1000 × aspect), or at a fixed internal grid resolution chosen from the format (e.g. long side 600
  cells). Scale only when drawing. A recipe must look the same on a phone and a 4K monitor apart from
  sharpness. Line widths etc. scale with the canvas.
- **Budgets.** `frame()` must return within ~12 ms of work (use `Cabinet.budget(12)`). Simulations
  should finish (return false) within ~3–10 s on a laptop. `start()` is called on every slider move,
  so keep it cheap: reset state, defer heavy work to `frame()`.

## Registration

```js
(function () {
  const C = window.Cabinet;
  C.register({
    id: 'marbling',                 // lowercase, a-z0-9 and '-'
    name: 'Marbling',               // tab label (short)
    group: 'process',               // 'process' or 'classic'
    order: 1,                       // tab order within the group
    renderer: 'webgl',              // 'webgl' (WebGL2 fragment shaders) or '2d'
    animated: false,                // true if frame() runs for many frames (shows a Replay button)
    restartDelay: 0,                // ms to debounce restarts while dragging sliders (use ~60–150 for heavy sims)
    subtitle: 'Paper marbling',     // ≤ 5 words, shown as "Name: subtitle."
    about: '2–3 plain sentences: what the algorithm does, and where the trait names come from.',
    formats: [0, 1, 2, 3],          // allowed indices of Cabinet.FORMATS: 0 4:5, 1 1:1, 2 3:2, 3 2:1
    formatOdds: [2, 2, 1, 1],       // optional weights for Randomize (same length as formats)
    defaults: { seed: 12, format: 0, palette: 0 },
    palettes: [                     // 5–9 named palettes. `colors` is what the chip shows.
      { name: 'Ebru', colors: ['#1d3557', '#e9c46a', '#b23a48', '#f1e9da'], bg: '#f1e9da' },
    ],                              //   add any extra fields you need (bg, ink, …); P.palette is the index
    paletteOdds: [3, 1, 1, 1, 1],   // optional
    params: [
      // range: shows `names` (threshold → word) next to the slider
      { k: 'drops', g: 'Ink', label: 'Drops', min: 1, max: 80, step: 1, def: 24,
        names: [[1, 'Sparse'], [16, 'Busy'], [48, 'Crowded']] },
      // select: shown as chips; value is the option index
      { k: 'pattern', g: 'Combing', label: 'Pattern', type: 'select', options: ['Stone', 'Gel-git', 'Nonpareil'], def: 1 },
      // setting: output quality rather than a trait (e.g. a resolution). Randomize, Mutate and
      // Reset leave it alone and it gets no pin, but it is still part of the recipe.
      { k: 'detail', g: 'Paper', label: 'Detail', type: 'select', options: ['Standard', 'Fine'], def: 0, setting: true },
      // scale: 'log' (min > 0): the slider travels by ratio, for spans like 80–13000; Mutate
      // nudges it by about ±30 %. after: 'drops' shows it straight after that param in the panel.
      { k: 'time', g: 'Ink', label: 'Settling', min: 10, max: 5000, step: 10, def: 200, scale: 'log', after: 'drops' },
    ],
    randomize(R, seed) { return { drops: R.int(8, 40), pattern: R() < 0.5 ? 1 : 2 }; },
    traitName(k, P) { return null; },   // optional: compute a name from geometry; null → default
    caption(P) { return 'Gel-git combed in Ebru, 24 drops.'; },   // one sentence, domain words
    sheet(P) { return [['Pattern', '…'], ['Drops', '…']]; },       // 8–12 [label, value] pairs

    setup(p) { return { /* state */ }; },   // once, after the canvas exists. Create shaders/buffers here.
    start(p, P, st, opts) { },              // (re)start for params P. Cheap. Reset state only. opts.replay
                                            //   means the user asked to run again from the start; any
                                            //   other call (param change, resize) may keep work P still allows
    frame(p, P, st) { return false; },      // inside p5 draw(). Work ≤ 12 ms, draw, return true while busy.
                                            //   Set st.patch = { k: v } to record a param you settled on (it
                                            //   updates the panel and recipe without a restart). Don't treat P
                                            //   here as final: a resize can call frame() once before start().
    stop(p, P, st) { },                     // optional: finish now (Stop button, Esc) with what has grown
    canStop(st) { return true; },           // optional: whether Stop is offered at the moment
    progress(st) { return 0.5; },           // optional 0..1 for the progress bar
    exportAt(p, P, W, H, st) { },           // optional: return a W×H HTMLCanvasElement (or a Promise of one)
    dispose(p, st) { },                     // optional cleanup
  });
})();
```

Implicit params the shell manages: `P.seed` (0–999999), `P.format` (index into `Cabinet.FORMATS`,
aspect = `Cabinet.FORMATS[P.format].a`), `P.palette` (index into your palettes). Every other key in `P`
is one of your params.

Recipe codes store the params by position, so add new params to the end of the list: older codes
then still load, with the new param at its default.

### Rendering notes

- **WebGL modules:** create the shader in `setup` with `p.createShader(Cabinet.VERT, FRAG)`. `FRAG` must
  start with `#version 300 es`, declare `out vec4 fragColor;`, and use `gl_FragCoord` for position
  (`uRes` = `Cabinet.bufferSize(p)` gives the drawing-buffer size). `Cabinet.GLSL_NOISE` has hashes,
  simplex noise and fbm you can paste in. Draw with `p.noStroke(); p.shader(sh); …setUniform…;
  p.rect(0, 0, p.width, p.height)` inside `frame()`. Pass fresh arrays to `setUniform` for uniform
  arrays. Anti-alias edges in-shader (`fwidth` + `smoothstep`). `exportAt` → `Cabinet.shaderStill(p, FRAG,
  (sh, W, H) => setUniforms(sh, W, H), W, H)`.
- **GPU simulations** (ping-pong): `p.createFramebuffer({ width, height, density: 1, format: p.FLOAT,
  depth: false, antialias: false, textureFiltering: p.NEAREST })`; draw into it between `fb.begin()` and
  `fb.end()`, pass a framebuffer to a shader as a `sampler2D` uniform. Verify float support; fall back to
  `p.HALF_FLOAT` or `p.UNSIGNED_BYTE` with packing if needed.
- **2D modules:** draw with `p` (p5's 2D API) or `p.drawingContext` (a CanvasRenderingContext2D already
  scaled for pixel density, so draw in CSS pixels `0..p.width`). For pixel-grid simulations, keep your
  own `Uint8ClampedArray` / `ImageData` at the internal resolution on an offscreen canvas and draw it
  scaled with `p.drawingContext.drawImage(off, 0, 0, p.width, p.height)` (set `imageSmoothingEnabled`
  as you like). For vector output, store geometry in virtual units and write one `draw(ctx, scale)` that
  works on any 2D context, so `exportAt` can redraw it crisply at W×H.
- Animate the process where it's a process (growth, collapse, accumulation). Draw only what changed if
  full redraws are expensive, but make the final frame complete and clean.

## Quality bar

This is an art piece, not a demo. Each tab should feel finished and specific:

- **Vocabulary.** Trait names and palette names come from the subject's own world (craft terms,
  science terms, place names), and are accurate. Names computed from the actual geometry beat names
  keyed to slider position.
- **The odds are the art.** `randomize` decides what the piece is. Tune its distributions until most
  Randomize results are good enough to print, with rarer extremes. Test by rendering 16+ random outputs.
- **Rendering craft.** Considered palettes (5–9), paper/ground colour, anti-aliased or deliberately
  crisp edges, stroke weights that suit the scale, a margin option where it helps. "Classic" tabs may go
  loud and saturated; they were popular for a reason. Give each one a twist that makes it feel fresh.
- **Params.** 10–18 params in 3–5 groups (`g`). Each should visibly matter. Prefer musical ranges over
  raw ranges that are mostly broken.
