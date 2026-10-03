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
    m.params.forEach((p) => { const g = p.g || 'Traits'; if (!byGroup[g]) { byGroup[g] = []; order.push(g); } byGroup[g].push(p); });
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
        if (p.type === 'select') {
          wrap.innerHTML = `<div class="ctl-head"><span class="lbl" id="${idp}-l">${esc(p.label)}</span><output></output><button class="pin" data-pin="${p.k}" aria-pressed="false" aria-label="Pin ${esc(p.label)}" title="Pin: Randomize keeps this"></button></div><div class="chips-sel" role="radiogroup" aria-labelledby="${idp}-l"></div>`;
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
          wrap.innerHTML = `<div class="ctl-head"><label for="${idp}" title="Double-click to reset">${esc(p.label)}</label><output for="${idp}"></output><button class="pin" data-pin="${p.k}" aria-pressed="false" aria-label="Pin ${esc(p.label)}" title="Pin: Randomize keeps this"></button></div><input type="range" id="${idp}" min="${p.min}" max="${p.max}" step="${p.step}">`;
          const input = wrap.querySelector('input');
          input.addEventListener('input', () => set({ [p.k]: parseFloat(input.value) }));
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
  function fillVars(input, p, v) {
    const t = (v - p.min) / (p.max - p.min || 1);
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
        if (String(r.input.value) !== String(P[p.k])) r.input.value = P[p.k];
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
        progress(more);
        if (!more) { me.running = false; p.noLoop(); settled(); }
      };
    }, stage);
  }

  function unmount() {
    clearTimeout(restartTimer);
    if (!inst) return;
    inst.dead = true;
    try { inst.m.dispose && inst.st && inst.m.dispose(inst.p, inst.st); } catch (e) { console.error(e); }
    try { inst.p && inst.p.remove(); } catch (e) { console.error(e); }
    inst = null;
  }

  function restart(delay) {
    const me = inst;
    if (!me || !me.p || !me.st) return;
    clearTimeout(restartTimer);
    const go = () => {
      if (me.dead) return;
      try { me.m.start && me.m.start(me.p, P, me.st); }
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
    if (!inst || !inst.m.progress || !more) { bar.hidden = true; return; }
    bar.hidden = false;
    let v = 0;
    try { v = Math.max(0, Math.min(1, inst.m.progress(inst.st) || 0)); } catch (e) { v = 0; }
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
    mount(m);
  }

  function newSeed() { set({ seed: Math.floor(Math.random() * 999999) }); }
  function randomizeAll() {
    const r = C.randomize(M, Math.floor(Math.random() * 999999));
    pinsFor(M).forEach((k) => { r[k] = P[k]; });
    set(r);
  }
  function mutateAll() {
    const m = C.mutate(M, P, mutSalt++);
    pinsFor(M).forEach((k) => { m[k] = P[k]; });
    set(m);
  }

  $('b-seed').addEventListener('click', newSeed);
  $('b-rand').addEventListener('click', randomizeAll);
  $('b-mut').addEventListener('click', mutateAll);
  $('b-replay').addEventListener('click', () => restart(0));
  $('seed-up').addEventListener('click', () => set({ seed: (P.seed + 1) % 1000000 }));
  $('seed-dn').addEventListener('click', () => set({ seed: (P.seed + 999999) % 1000000 }));
  $('reset').addEventListener('click', () => { const d = C.defaults(M); d.seed = P.seed; d.format = P.format; d.palette = P.palette; set(d); });
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
      const name = `${m.id}-${params.seed}.png`;
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
        status(`Saved ${name} (${canvas.width} × ${canvas.height}).`);
        return;
      }
      showFallback(blob, name, canvas.width, canvas.height);
    } catch (e) {
      console.error(e);
      status(`Export failed: ${e.message}`, true);
    } finally { saving = false; }
  }
  function showFallback(blob, name, W, H) {
    const url = URL.createObjectURL(blob);
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = `<div class="sheet-in" role="dialog" aria-label="Rendered image"><img alt="Rendered image, ${W} by ${H} pixels"><p class="note">${W} × ${H} px. Right-click or long-press the image to save it as ${esc(name)}.</p><div><button class="btn">Close</button></div></div>`;
    sheet.querySelector('img').src = url;
    const close = () => { URL.revokeObjectURL(url); sheet.remove(); };
    sheet.querySelector('button').addEventListener('click', close);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    document.body.appendChild(sheet);
    status('');
  }
  $('b-save').addEventListener('click', savePNG);

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
    else if (k === 'p') restart(0);
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
