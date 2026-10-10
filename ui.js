/* ==========================================================================
   CABINET SHELL — tabs, trait panel, p5 lifecycle per tab, history,
   recipes and export. Every algorithm lives in its own module and gets
   its own p5 instance while its tab is open.
   ========================================================================== */
(() => {
  'use strict';
  const C = window.Cabinet;
  const $ = (id) => document.getElementById(id);
  const PIN_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M10.2 1.3 14.7 5.8l-1.1 1.1-.9-.2-2.6 2.6.3 2.6-1.2 1.2-2.6-2.6-3.5 3.5-.9-.9 3.5-3.5-2.6-2.6L4.3 5.8l2.6.3 2.6-2.6-.2-.9z"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const store = {
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  /* ---------------- per-module state ---------------- */
  const states = {};      // id → P
  const pinsBy = {};      // id → Set
  const histBy = {};      // id → [{code, P, el}]
  let M = null;           // active module
  let P = null;           // active params
  let mutSalt = 1;

  function stateFor(m) {
    if (!states[m.id]) states[m.id] = C.sanitize(m, store.get('cab.v1.state.' + m.id) || C.defaults(m));
    return states[m.id];
  }
  function pinsFor(m) {
    if (!pinsBy[m.id]) pinsBy[m.id] = new Set(Array.isArray(store.get('cab.v1.pins.' + m.id)) ? store.get('cab.v1.pins.' + m.id) : []);
    return pinsBy[m.id];
  }

  /* ---------------- tabs ---------------- */
  function buildTabs() {
    const nav = $('tabs');
    nav.innerHTML = '';
    let lastGroup = null;
    C.modules.forEach((m) => {
      if (m.group !== lastGroup) {
        if (lastGroup) { const s = document.createElement('span'); s.className = 'sep'; s.setAttribute('aria-hidden', 'true'); nav.appendChild(s); }
        const g = document.createElement('span');
        g.className = 'glabel';
        g.textContent = m.group === 'process' ? 'Processes' : 'Classics';
        nav.appendChild(g);
        lastGroup = m.group;
      }
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.dataset.id = m.id;
      b.textContent = m.name;
      b.title = m.subtitle || m.name;
      b.addEventListener('click', () => activate(m.id));
      nav.appendChild(b);
    });
  }
  function syncTabs() {
    [...$('tabs').querySelectorAll('button')].forEach((b) => {
      const on = b.dataset.id === M.id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  /* ---------------- panel ---------------- */
  const ctlRefs = {};
  function buildPanel(m) {
    for (const k in ctlRefs) delete ctlRefs[k];
    // formats
    $('format-row').hidden = m.formats.length < 2;
    const fBox = $('formats');
    fBox.innerHTML = '';
    fBox.style.gridTemplateColumns = `repeat(${Math.max(2, m.formats.length)}, 1fr)`;
    m.formats.forEach((fi) => {
      const f = C.FORMATS[fi];
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', f.label);
      b.title = f.label;
      b.dataset.f = fi;
      const w = Math.min(Math.round(20 * f.a), 34);
      b.innerHTML = `<span class="shape" style="width:${w}px;height:${Math.round(w / f.a)}px"></span><small>${f.short}</small>`;
      b.addEventListener('click', () => set({ format: fi }));
      fBox.appendChild(b);
    });
    // palettes
    const pBox = $('palettes');
    pBox.innerHTML = '';
    m.palettes.forEach((pal, i) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', pal.name);
      const cols = (pal.colors || []).slice(0, 9);
      const sw = cols.map((c) => `<i style="background:${esc(c)}"></i>`).join('');
      b.innerHTML = `<span class="sw" style="background:${esc(pal.paper || pal.bg || cols[0] || '#fff')}">${sw}</span><small>${esc(pal.name)}</small>`;
      b.addEventListener('click', () => set({ palette: i }));
      pBox.appendChild(b);
    });
    // parameter groups
    const groupsEl = $('groups');
    groupsEl.innerHTML = '';
    const byGroup = {};
    const order = [];
    // `after: key` shows a param straight after another; recipe codes keep the list order
    const shown = m.params.filter((p) => !p.after || !m.paramBy[p.after]);
    m.params.forEach((p) => {
      if (!p.after || !m.paramBy[p.after]) return;
      const at = shown.indexOf(m.paramBy[p.after]);
      if (at < 0) { shown.push(p); return; }
      let i = at + 1;
      while (i < shown.length && shown[i].after === p.after) i++;
      shown.splice(i, 0, p);
    });
    shown.forEach((p) => { const g = p.g || 'Traits'; if (!byGroup[g]) { byGroup[g] = []; order.push(g); } byGroup[g].push(p); });
    order.forEach((g) => {
      const det = document.createElement('details');
      det.className = 'group';
      det.open = true;
      det.innerHTML = `<summary>${esc(g)}</summary><div class="ctls"></div>`;
      const box = det.querySelector('.ctls');
      byGroup[g].forEach((p) => {
        const wrap = document.createElement('div');
        wrap.className = 'ctl';
        const idp = `p-${m.id}-${p.k}`;
        // settings are never randomized, so a pin would do nothing
        const pin = p.setting ? '' : `<button class="pin" data-pin="${p.k}" aria-pressed="false" aria-label="Pin ${esc(p.label)}" title="Pin: Randomize keeps this"></button>`;
        if (p.type === 'select') {
          wrap.innerHTML = `<div class="ctl-head"><span class="lbl" id="${idp}-l">${esc(p.label)}</span><output></output>${pin}</div><div class="chips-sel" role="radiogroup" aria-labelledby="${idp}-l"></div>`;
          const chips = wrap.querySelector('.chips-sel');
          p.options.forEach((o, i) => {
            const b = document.createElement('button');
            b.setAttribute('role', 'radio');
            b.textContent = o;
            b.addEventListener('click', () => set({ [p.k]: i }));
            chips.appendChild(b);
          });
          ctlRefs[p.k] = { p, out: wrap.querySelector('output'), chips };
        } else {
          const lg = p.scale === 'log';
          wrap.innerHTML = `<div class="ctl-head"><label for="${idp}" title="Double-click to reset">${esc(p.label)}</label><output for="${idp}"></output>${pin}</div><input type="range" id="${idp}" min="${lg ? 0 : p.min}" max="${lg ? LOG_N : p.max}" step="${lg ? 1 : p.step}">`;
          const input = wrap.querySelector('input');
          input.addEventListener('input', () => set({ [p.k]: fromPos(p, parseFloat(input.value)) }));
          // on a log slider an arrow-key tick can be smaller than the value's step: always reach the next value
          if (lg) input.addEventListener('keydown', (e) => {
            const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
            if (!d) return;
            e.preventDefault();
            let v = C.snap(p, P[p.k] * Math.pow(1.04, d));
            if (v === P[p.k]) v = C.snap(p, P[p.k] + d * p.step);
            set({ [p.k]: v });
          });
          wrap.querySelector('label').addEventListener('dblclick', () => set({ [p.k]: p.def }));
          ctlRefs[p.k] = { p, out: wrap.querySelector('output'), input };
        }
        box.appendChild(wrap);
      });
      groupsEl.appendChild(det);
    });
    document.querySelectorAll('.pin').forEach((b) => {
      b.innerHTML = PIN_SVG;
      b.onclick = () => {
        const pins = pinsFor(M);
        const k = b.dataset.pin;
        pins.has(k) ? pins.delete(k) : pins.add(k);
        store.set('cab.v1.pins.' + M.id, [...pins]);
        syncPins();
      };
    });
    $('b-replay').hidden = !m.animated;
  }
  function syncPins() {
    const pins = pinsFor(M);
    document.querySelectorAll('.pin').forEach((b) => b.setAttribute('aria-pressed', pins.has(b.dataset.pin) ? 'true' : 'false'));
  }
  // log-scale sliders travel by ratio: positions 0…LOG_N span min…max geometrically
  const LOG_N = 1000;
  function toPos(p, v) { return p.scale === 'log' ? Math.round(LOG_N * Math.log(v / p.min) / Math.log(p.max / p.min)) : v; }
  function fromPos(p, x) { return p.scale === 'log' ? p.min * Math.pow(p.max / p.min, x / LOG_N) : x; }
  function fillVars(input, p, v) {
    const t = p.scale === 'log' ? toPos(p, v) / LOG_N : (v - p.min) / (p.max - p.min || 1);
    if (p.min < 0 && p.max > 0) {
      const c = (-p.min / (p.max - p.min)) * 100, x = t * 100;
      input.style.setProperty('--a', Math.min(c, x) + '%');
      input.style.setProperty('--b', Math.max(c, x) + '%');
    } else {
      input.style.setProperty('--a', '0%');
      input.style.setProperty('--b', t * 100 + '%');
    }
  }
  function syncControls() {
    M.params.forEach((p) => {
      const r = ctlRefs[p.k];
      if (!r) return;
      r.out.textContent = C.traitName(M, p.k, P);
      if (r.input) {
        const pos = toPos(p, P[p.k]);
        if (String(r.input.value) !== String(pos)) r.input.value = pos;
        fillVars(r.input, p, P[p.k]);
      } else {
        [...r.chips.children].forEach((b, i) => b.setAttribute('aria-checked', i === P[p.k] ? 'true' : 'false'));
      }
    });
    [...$('formats').children].forEach((b) => b.setAttribute('aria-checked', +b.dataset.f === P.format ? 'true' : 'false'));
    [...$('palettes').children].forEach((b, i) => b.setAttribute('aria-checked', i === P.palette ? 'true' : 'false'));
    if (document.activeElement !== $('seed')) $('seed').value = P.seed;
    if (document.activeElement !== $('recipe')) $('recipe').value = C.encode(M, P);
  }
  function syncTexts() {
    $('fignum').textContent = `No. ${P.seed}.`;
    $('caption').textContent = ' ' + C.caption(M, P);
    $('traits').innerHTML = C.sheet(M, P).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('about-title').textContent = M.subtitle ? `${M.name}: ${M.subtitle}.` : `${M.name}.`;
    $('about').textContent = M.about || '';
  }

  /* ---------------- p5 lifecycle ---------------- */
  const stage = $('stage'), stageWrap = $('stage-wrap');
  let inst = null;         // { p, st, running, m }
  let restartTimer = 0;

  function fitSize(m, params) {
    const a = C.FORMATS[params.format].a;
    const availW = Math.max(200, stageWrap.clientWidth);
    const narrow = window.innerWidth <= 880;
    const availH = narrow ? window.innerHeight * 0.78 : Math.max(320, window.innerHeight - 250);
    let w = availW, h = w / a;
    if (h > availH) { h = availH; w = h * a; }
    return { w: Math.floor(w), h: Math.floor(h) };
  }

  function showError(msg) {
    stage.innerHTML = `<div class="placeholder err">${esc(msg)}</div>`;
    $('progress').hidden = true;
  }

  function mount(m) {
    unmount();
    stage.innerHTML = '';
    const me = { m, p: null, st: null, running: false, dead: false };
    inst = me;
    new p5((p) => {
      me.p = p;
      p.setup = () => {
        if (me.dead) return;
        const { w, h } = fitSize(m, P);
        p.createCanvas(w, h, m.renderer === 'webgl' ? p.WEBGL : p.P2D);
        p.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
        if (m.renderer === 'webgl' && p.webglVersion !== 'webgl2') {
          p.noLoop();
          showError(`${m.name} draws with a WebGL2 shader, and this browser has WebGL2 switched off. Try a current Chrome, Firefox or Safari.`);
          return;
        }
        try { me.st = (m.setup && m.setup(p)) || {}; }
        catch (e) { p.noLoop(); showError(`${m.name} could not start.\n${e.message}`); console.error(e); return; }
        p.noLoop();
        restart(0);
      };
      p.draw = () => {
        if (me.dead || !me.running) { p.noLoop(); return; }
        let more = false;
        try { more = m.frame ? !!m.frame(p, P, me.st) : false; }
        catch (e) { me.running = false; p.noLoop(); showError(`${m.name} hit an error.\n${e.message}`); console.error(e); return; }
        // a module can record a param it settled on (e.g. where a run was stopped) without a restart
        if (me.st.patch) { const patch = me.st.patch; me.st.patch = null; set(patch, { noRender: true }); }
        progress(more);
        if (!more) { me.running = false; p.noLoop(); settled(); }
      };
    }, stage);
  }

  function unmount() {
    clearTimeout(restartTimer);
    if (!inst) return;
    inst.dead = true;
    $('b-stop').hidden = true;
    cancelClip(false);
    try { inst.m.dispose && inst.st && inst.m.dispose(inst.p, inst.st); } catch (e) { console.error(e); }
    try { inst.p && inst.p.remove(); } catch (e) { console.error(e); }
    inst = null;
  }

  // opts.replay: the user asked to run the process again from the start (a module may
  // otherwise keep work that the new params don't invalidate, e.g. on a resize)
  function restart(delay, opts = {}) {
    const me = inst;
    if (!me || !me.p || !me.st) return;
    clearTimeout(restartTimer);
    cancelClip(false);
    const go = () => {
      if (me.dead) return;
      try { me.m.start && me.m.start(me.p, P, me.st, opts); }
      catch (e) { showError(`${me.m.name} hit an error.\n${e.message}`); console.error(e); return; }
      me.running = true;
      me.p.loop();
    };
    const d = delay != null ? delay : (me.m.restartDelay || 0);
    if (d > 0) {
      // hold frames until start() has seen the new params, so frame() never runs with stale state
      me.running = false;
      me.p.noLoop();
      restartTimer = setTimeout(go, d);
    } else go();
  }

  function resize() {
    if (!inst || !inst.p || !inst.st) return;
    const { w, h } = fitSize(inst.m, P);
    if (w === inst.p.width && h === inst.p.height) return;
    inst.p.resizeCanvas(w, h);
    restart(80);
  }
  new ResizeObserver(() => resize()).observe(stageWrap);

  function progress(more) {
    const bar = $('progress');
    const m = inst && inst.m;
    $('b-stop').hidden = !(more && m && m.stop && (!m.canStop || m.canStop(inst.st)));
    let v = 0;
    if (more && m && m.progress) { try { v = Math.max(0, Math.min(1, m.progress(inst.st) || 0)); } catch (e) { v = 0; } }
    // a module with a timeline shows its progress on the clip line instead
    if (m && m.timeline && m.clip) { bar.hidden = true; clipSync(more, v); return; }
    if (!more || !m || !m.progress) { bar.hidden = true; return; }
    bar.hidden = false;
    $('progress-bar').style.width = (v * 100).toFixed(1) + '%';
  }

  /* ---------------- state changes ---------------- */
  function set(patch, opts = {}) {
    const prevFormat = P.format;
    P = C.sanitize(M, Object.assign({}, P, patch));
    states[M.id] = P;
    store.set('cab.v1.state.' + M.id, P);
    syncControls();
    syncTexts();
    if (!opts.noRender) {
      if (P.format !== prevFormat) resize();
      restart();
    }
  }

  function activate(id, opts = {}) {
    const m = C.byId[id] || C.modules[0];
    if (M && m.id === M.id && !opts.force) return;
    M = m;
    P = stateFor(m);
    store.set('cab.v1.tab', m.id);
    try { if (location.hash !== '#' + m.id) history.replaceState(null, '', '#' + m.id); } catch (e) { /* frame may refuse */ }
    buildPanel(m);
    syncPins();
    syncControls();
    syncTexts();
    syncTabs();
    renderStrip();
    $('progress').hidden = true;
    clip.a = clip.b = null; clip.len = 0; clip.running = true; clip.progress = 0; clip.at = 0;
    $('clip').hidden = true;
    mount(m);
  }

  function newSeed() { set({ seed: Math.floor(Math.random() * 999999) }); }
  // settings (output quality, not traits) ride along like pinned traits
  function keepSettings(o) { M.params.forEach((p) => { if (p.setting) o[p.k] = P[p.k]; }); return o; }
  function randomizeAll() {
    const r = C.randomize(M, Math.floor(Math.random() * 999999));
    pinsFor(M).forEach((k) => { r[k] = P[k]; });
    set(keepSettings(r));
  }
  function mutateAll() {
    const m = C.mutate(M, P, mutSalt++);
    pinsFor(M).forEach((k) => { m[k] = P[k]; });
    set(m);
  }

  $('b-seed').addEventListener('click', newSeed);
  $('b-rand').addEventListener('click', randomizeAll);
  $('b-mut').addEventListener('click', mutateAll);
  $('b-replay').addEventListener('click', () => restart(0, { replay: true }));
  // Stop: an animated module that supports it finishes now with what it has grown
  function stopNow() {
    if (clip.job) { clip.job.cancelled = true; return; }
    const me = inst;
    if (me && me.running && me.m.stop) me.m.stop(me.p, P, me.st);
  }
  $('b-stop').addEventListener('click', stopNow);
  $('seed-up').addEventListener('click', () => set({ seed: (P.seed + 1) % 1000000 }));
  $('seed-dn').addEventListener('click', () => set({ seed: (P.seed + 999999) % 1000000 }));
  $('reset').addEventListener('click', () => { const d = C.defaults(M); d.seed = P.seed; d.format = P.format; d.palette = P.palette; set(keepSettings(d)); });
  $('seed').addEventListener('change', () => { const v = parseInt($('seed').value, 10); if (Number.isFinite(v)) set({ seed: v }); });

  /* ---------------- history ---------------- */
  function histFor(m) { return (histBy[m.id] = histBy[m.id] || []); }
  function renderStrip() {
    const strip = $('strip');
    strip.innerHTML = '';
    const h = histFor(M);
    if (!h.length) { strip.innerHTML = '<span class="empty">Outputs you settle on collect here. Click one to go back to it.</span>'; return; }
    h.forEach((e) => strip.appendChild(e.el));
    markHistory();
  }
  function settled() {
    if (!inst || !inst.p) return;
    syncControls();   // modules may name traits from measured results (D, Strahler order…)
    syncTexts();
    clipSync(false, 1);
    const code = C.encode(M, P);
    const h = histFor(M);
    if (h.length && h[0].code === code) return markHistory();
    const src = inst.p.canvas;
    const c = document.createElement('canvas');
    const th = 116, tw = Math.max(1, Math.round(th * src.width / src.height));
    c.width = tw; c.height = th;
    try { c.getContext('2d').drawImage(src, 0, 0, tw, th); } catch (e) { return; }
    const b = document.createElement('button');
    b.title = C.caption(M, P);
    b.setAttribute('aria-label', `Restore No. ${P.seed}`);
    b.appendChild(c);
    const entry = { code, P: Object.assign({}, P), el: b, id: M.id };
    b.addEventListener('click', () => { if (M.id !== entry.id) return; set(entry.P); });
    h.unshift(entry);
    while (h.length > 24) h.pop();
    renderStrip();
  }
  function markHistory() {
    const code = C.encode(M, P);
    histFor(M).forEach((h) => h.el.setAttribute('aria-current', h.code === code ? 'true' : 'false'));
  }

  /* ---------------- recipe + status ---------------- */
  let statusTimer = 0;
  function status(msg, err) {
    const s = $('status');
    s.textContent = msg;
    s.classList.toggle('err', !!err);
    clearTimeout(statusTimer);
    if (msg) statusTimer = setTimeout(() => { s.textContent = ''; }, 4500);
  }
  $('copy').addEventListener('click', () => {
    const code = C.encode(M, P);
    $('recipe').value = code;
    const fallback = () => { $('recipe').focus(); $('recipe').select(); status('Selected. Press Ctrl+C or Cmd+C to copy.'); };
    try { navigator.clipboard.writeText(code).then(() => status('Recipe copied.'), fallback); } catch (e) { fallback(); }
  });
  function loadRecipe(text) {
    const d = C.decode(text);
    if (!d) { status("That isn't a recipe from this page. Codes start with CAB1.", true); return; }
    if (d.module.id !== M.id) { states[d.module.id] = d.P; activate(d.module.id); }
    set(d.P);
    status(`Loaded ${d.module.name} No. ${d.P.seed}.`);
  }
  $('recipe').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadRecipe($('recipe').value); } });
  $('recipe').addEventListener('paste', (e) => {
    const t = (e.clipboardData || window.clipboardData).getData('text');
    if (t && /^\s*CAB1\./i.test(t)) { e.preventDefault(); $('recipe').value = t.trim(); loadRecipe(t); }
  });
  $('recipe').addEventListener('blur', () => { $('recipe').value = C.encode(M, P); });

  /* ---------------- export ---------------- */
  let dlPromise = null;
  function getDownloads() {
    if (!dlPromise) {
      const c = window.claude;
      dlPromise = (c && typeof c.use === 'function') ? Promise.resolve(c.use('downloads')).catch(() => null) : Promise.resolve(null);
    }
    return dlPromise;
  }
  setTimeout(getDownloads, 0);

  let saving = false;
  async function savePNG() {
    if (!inst || !inst.p || !inst.st || saving) return;
    saving = true;
    const me = inst, m = M, params = Object.assign({}, P);
    try {
      const a = C.FORMATS[params.format].a;
      let H = 3000, W = Math.round(H * a);
      if (W > 4000) { W = 4000; H = Math.round(W / a); }
      let canvas;
      if (m.exportAt) {
        status(`Rendering ${W} × ${H}…`);
        await new Promise((r) => setTimeout(r, 30));
        canvas = await m.exportAt(me.p, params, W, H, me.st);
      } else {
        canvas = me.p.canvas;
      }
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) { status('The render failed. Try a smaller window or another browser.', true); return; }
      await deliver(blob, `${m.id}-${params.seed}.png`, canvas.width, canvas.height);
    } catch (e) {
      console.error(e);
      status(`Export failed: ${e.message}`, true);
    } finally { saving = false; }
  }
  // hand a finished file to the user: the host's save prompt, a plain download, or a sheet to save from
  async function deliver(blob, name, W, H) {
    const dl = await getDownloads();
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); status(`Saved ${name}.`); return; }
      catch (e) {
        if (e && e.code === 'declined') { status('Save cancelled.'); return; }
        if (e && e.code === 'rate_limited') { status('A save prompt is already open.'); return; }
      }
    }
    if (!window.claude) {
      // an ordinary web page (e.g. GitHub Pages): the browser can save the file directly
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status(`Saved ${name} (${W} × ${H}).`);
      return;
    }
    showFallback(blob, name, W, H);
  }
  function showFallback(blob, name, W, H) {
    const url = URL.createObjectURL(blob);
    const video = blob.type.startsWith('video/'), what = video ? 'video' : 'image';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const media = video ? `<video controls loop autoplay muted playsinline aria-label="Rendered video, ${W} by ${H} pixels"></video>` : `<img alt="Rendered image, ${W} by ${H} pixels">`;
    sheet.innerHTML = `<div class="sheet-in" role="dialog" aria-label="Rendered ${what}">${media}<p class="note">${W} × ${H} px. Right-click or long-press the ${what} to save it as ${esc(name)}.</p><div><button class="btn">Close</button></div></div>`;
    sheet.querySelector(video ? 'video' : 'img').src = url;
    const close = () => { URL.revokeObjectURL(url); sheet.remove(); };
    sheet.querySelector('button').addEventListener('click', close);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    document.body.appendChild(sheet);
    status('');
  }
  $('b-save').addEventListener('click', savePNG);

  /* ---------------- clips: a stretch of a process as a video ---------------- */
  // A module with timeline(P, st) → { length, at } and a clip() generator shows its progress line
  // as a timeline: the live step while it runs; once it settles, drag along the line to pick a
  // stretch and save it as MP4 or GIF. clip(p, P, st, { steps, width, height, grain }) grows the
  // process again and yields each frame (ImageData-like) or, on the way to the next, the step it
  // has reached.
  const CLIP = { mp4: { fps: 30, frames: 450, height: 1080, ext: 'mp4' }, gif: { fps: 25, frames: 250, height: 480, ext: 'gif' } };
  const clip = { a: null, b: null, len: 0, running: true, progress: 0, at: 0, job: null, drag: null, anchor: 0, mp4: null };
  const pause = () => new Promise((r) => setTimeout(r, 0));
  function clipSync(running, v) {
    const me = inst, on = !!(me && me.st && M.timeline && M.clip);
    $('clip').hidden = !on;
    if (!on) return;
    const tl = M.timeline(P, me.st) || { length: 0, at: 0 };
    clip.running = running;
    if (running) { clip.progress = v; clip.at = tl.at; clip.total = tl.length; }
    else if (tl.length !== clip.len) { clip.len = tl.length; clip.a = clip.b = null; }
    if (!running && clip.mp4 == null) {
      clip.mp4 = false;     // ask once whether this browser can encode video at all
      C.media.pickCodec(1080, 1080, 30).then((c) => { clip.mp4 = c || ''; clipDraw(); });
    }
    clipDraw();
  }
  // seconds of video for the current stretch: one frame per step, up to the format's limit, plus a 1 s hold
  function clipFrames(kind) { return Math.min(clip.b - clip.a + 1, CLIP[kind].frames); }
  function clipDraw() {
    const job = clip.job, has = clip.a != null && !clip.running;
    $('clip').classList.toggle('idle', !clip.running && !job);
    $('clip-fill').style.width = clip.running ? (clip.progress * 100).toFixed(1) + '%' : '100%';
    const sel = $('clip-sel'), ha = $('clip-a'), hb = $('clip-b');
    sel.hidden = ha.hidden = hb.hidden = !has;
    if (has) {
      const pa = clip.a / clip.len * 100, pb = clip.b / clip.len * 100;
      sel.style.left = pa + '%'; sel.style.width = (pb - pa) + '%';
      ha.style.left = pa + '%'; hb.style.left = pb + '%';
      for (const [h, v] of [[ha, clip.a], [hb, clip.b]]) { h.setAttribute('aria-valuemin', 0); h.setAttribute('aria-valuemax', clip.len); h.setAttribute('aria-valuenow', v); }
      const done = job ? (job.done / job.n * 100).toFixed(1) : 100;
      sel.style.background = job ? `linear-gradient(90deg, var(--accent) ${done}%, color-mix(in srgb, var(--accent) 30%, transparent) ${done}%)` : '';
      $('clip-mp4').title = clip.mp4 === '' ? "This browser can't encode video. Save GIF works." : `About ${(clipFrames('mp4') / CLIP.mp4.fps + 1).toFixed(1)} s of video, 1080 pixels tall`;
      $('clip-gif').title = `About ${(clipFrames('gif') / CLIP.gif.fps + 1).toFixed(1)} s, 480 pixels tall`;
    }
    $('clip-actions').hidden = !has;
    $('clip-mp4').hidden = $('clip-gif').hidden = $('clip-x').hidden = !!job;
    $('clip-mp4').disabled = clip.mp4 === '';
    $('clip-cancel').hidden = !job;
    $('clip-label').textContent = clip.running ? `Step ${clip.at.toLocaleString()} of ${(clip.total || 0).toLocaleString()}`
      : job ? (job.done ? `Rendering frame ${job.done} of ${job.n}…` : `Growing to step ${job.reached.toLocaleString()}…`)
      : has ? `Steps ${clip.a.toLocaleString()} – ${clip.b.toLocaleString()}` : 'Drag along the line to pick a stretch of the growth to save as a video.';
  }
  const clipIdle = () => !clip.running && !clip.job && clip.len > 0;
  {
    const track = $('clip-track');
    const stepAt = (e) => { const r = track.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * clip.len); };
    track.addEventListener('pointerdown', (e) => {
      if (!clipIdle() || e.button > 0) return;
      const h = e.target.closest('.clip-h');
      clip.drag = h ? (h.id === 'clip-a' ? 'a' : 'b') : 'new';
      if (clip.drag === 'new') { clip.anchor = stepAt(e); clip.a = clip.b = clip.anchor; }
      track.setPointerCapture(e.pointerId);
      e.preventDefault();
      if (h) h.focus();
      clipDraw();
    });
    track.addEventListener('pointermove', (e) => {
      if (!clip.drag) return;
      const v = stepAt(e);
      if (clip.drag === 'new') { clip.a = Math.min(clip.anchor, v); clip.b = Math.max(clip.anchor, v); }
      else {
        clip[clip.drag] = v;
        if (clip.a > clip.b) { [clip.a, clip.b] = [clip.b, clip.a]; clip.drag = clip.drag === 'a' ? 'b' : 'a'; }
      }
      clipDraw();
    });
    const end = () => { if (!clip.drag) return; clip.drag = null; if (clip.b - clip.a < 1) clip.a = clip.b = null; clipDraw(); };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    for (const id of ['clip-a', 'clip-b']) $(id).addEventListener('keydown', (e) => {
      if (!clipIdle() || clip.a == null) return;
      const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
      if (!d && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      let v = e.key === 'Home' ? 0 : e.key === 'End' ? clip.len : (id === 'clip-a' ? clip.a : clip.b) + d * (e.shiftKey ? 10 : 1);
      v = Math.max(0, Math.min(clip.len, v));
      if (id === 'clip-a') clip.a = Math.min(v, clip.b - 1); else clip.b = Math.max(v, clip.a + 1);
      clipDraw();
    });
    $('clip-x').addEventListener('click', () => { clip.a = clip.b = null; clipDraw(); });
    $('clip-mp4').addEventListener('click', () => saveClip('mp4'));
    $('clip-gif').addEventListener('click', () => saveClip('gif'));
    $('clip-cancel').addEventListener('click', () => { if (clip.job) clip.job.cancelled = true; });
  }
  // restore: put the print back when a cancelled clip leaves the canvas (not when a new run took over)
  function cancelClip(restore) { if (clip.job) { clip.job.cancelled = true; if (!restore) clip.job.restore = false; } }

  async function saveClip(kind) {
    const me = inst, m = M, params = Object.assign({}, P);
    if (!me || !me.p || !m.clip || clip.a == null || clip.job || clip.running) return;
    const cfg = CLIP[kind], from = clip.a, to = clip.b, a = C.FORMATS[params.format].a;
    let H = cfg.height, W = 2 * Math.round(H * a / 2);
    if (W > 1920) { W = 1920; H = 2 * Math.round(W / a / 2); }
    const n = clipFrames(kind);
    const steps = Array.from({ length: n }, (_, i) => Math.round(from + (to - from) * (n > 1 ? i / (n - 1) : 0)));
    const job = clip.job = { done: 0, n, reached: from, cancelled: false, restore: true };
    // frames play on the canvas as they're made; the print goes back afterwards
    const cv = me.p.canvas, keep = document.createElement('canvas');
    keep.width = cv.width; keep.height = cv.height;
    keep.getContext('2d').drawImage(cv, 0, 0);
    const frame = document.createElement('canvas');
    frame.width = W; frame.height = H;
    const fctx = frame.getContext('2d');
    const show = () => { const ctx = me.p.drawingContext; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(frame, 0, 0, cv.width, cv.height); ctx.restore(); };
    clipDraw();
    let enc = null, last = null;
    try {
      if (kind === 'mp4') {
        enc = await C.media.mp4({ width: W, height: H, fps: cfg.fps });
        if (!enc) throw new Error("this browser can't encode video. Save GIF works");
      }
      const it = m.clip(me.p, params, me.st, { steps, width: W, height: H, grain: kind === 'mp4' });
      for (;;) {
        if (job.cancelled) break;
        const r = it.next();
        if (r.done) break;
        if (typeof r.value === 'number') { job.reached = r.value; clipDraw(); await pause(); continue; }
        const img = new ImageData(r.value.data, W, H);
        fctx.putImageData(img, 0, 0);
        if (job.restore) show();
        if (kind === 'mp4') { await enc.add(img); last = img; }
        else {
          // one palette for the whole GIF, from the first frame and the finished print
          if (!enc) {
            const s = document.createElement('canvas'), sh = Math.min(240, keep.height), sw = Math.max(1, Math.round(sh * keep.width / keep.height));
            s.width = sw; s.height = sh;
            const sctx = s.getContext('2d');
            sctx.drawImage(keep, 0, 0, sw, sh);
            enc = C.media.gif({ width: W, height: H, colors: C.media.palette([img, sctx.getImageData(0, 0, sw, sh)]) });
          }
          // a frame behind, so the last one can be held
          if (last) enc.add(last, Math.round(100 / cfg.fps));
          last = new ImageData(new Uint8ClampedArray(img.data), W, H);
        }
        job.done++;
        clipDraw();
        await pause();
      }
      if (job.cancelled) { if (enc && enc.cancel) enc.cancel(); return; }
      if (!last) throw new Error('no frames were made');
      // hold the last frame for a second
      if (kind === 'mp4') for (let i = 0; i < cfg.fps && !job.cancelled; i++) await enc.add(last);
      else enc.add(last, Math.round(100 / cfg.fps) + 100);
      if (job.cancelled) { if (enc.cancel) enc.cancel(); return; }
      const blob = await enc.finish();
      await deliver(blob, `${m.id}-${params.seed}-steps-${from}-${to}.${cfg.ext}`, W, H);
    } catch (e) {
      console.error(e);
      if (enc && enc.cancel) enc.cancel();
      status(`The ${kind === 'mp4' ? 'video' : 'GIF'} failed: ${e.message}.`, true);
    } finally {
      if (job.restore && inst === me) { const ctx = me.p.drawingContext; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(keep, 0, 0); ctx.restore(); }
      clip.job = null;
      clipDraw();
    }
  }

  /* ---------------- keyboard ---------------- */
  function stepTab(d) {
    const i = C.modules.indexOf(M);
    activate(C.modules[(i + d + C.modules.length) % C.modules.length].id);
  }
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 'n') newSeed();
    else if (k === 'r') randomizeAll();
    else if (k === 'm') mutateAll();
    else if (k === 's') savePNG();
    else if (k === 'p') restart(0, { replay: true });
    else if (k === 'escape') stopNow();
    else if (k === ']') set({ seed: (P.seed + 1) % 1000000 });
    else if (k === '[') set({ seed: (P.seed + 999999) % 1000000 });
    else if (k === '.') stepTab(1);
    else if (k === ',') stepTab(-1);
    else return;
    e.preventDefault();
  });
  $('tabs').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stepTab(1); $('tabs').querySelector('[aria-selected="true"]').focus(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepTab(-1); $('tabs').querySelector('[aria-selected="true"]').focus(); }
  });
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (C.byId[id] && (!M || M.id !== id)) activate(id); });

  /* ---------------- boot ---------------- */
  buildTabs();
  const fromHash = location.hash.slice(1);
  activate(C.byId[fromHash] ? fromHash : (C.byId[store.get('cab.v1.tab')] ? store.get('cab.v1.tab') : C.modules[0].id), { force: true });
})();
