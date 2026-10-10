/* ==========================================================================
   CABINET MEDIA — encoders for saving a stretch of a process as a video.
   MP4: the browser's WebCodecs VideoEncoder (H.264 where it has it, VP9
   otherwise), written here into a plain progressive MP4. GIF: one palette
   for the whole clip (median cut), ordered dithering so still areas don't
   shimmer, LZW. No libraries.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- bytes ---------- */
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const u16 = (n) => [(n >>> 8) & 255, n & 255];
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
  const zeros = (n) => new Array(n).fill(0);
  // an ISO-BMFF box: size, type, payload (arrays of bytes or Uint8Arrays)
  function box(type, ...parts) {
    let n = 8;
    for (const p of parts) n += p.length;
    const out = new Uint8Array(n);
    out.set(u32(n), 0); out.set(ascii(type), 4);
    let o = 8;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const fullBox = (type, version, flags, ...parts) => box(type, [version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255], ...parts);

  /* ---------- MP4 ---------- */
  // H.264 first (plays everywhere), then VP9 in MP4 (browsers, VLC) for builds without H.264
  const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640033', 'avc1.4d0033', 'avc1.42e033',
    'vp09.00.40.08', 'vp09.00.41.08', 'vp09.00.50.08'];
  const configFor = (codec, width, height, fps) => ({
    codec, width, height, framerate: fps, bitrate: Math.round(width * height * fps * 0.18),
    bitrateMode: 'variable', latencyMode: 'quality', ...(codec.startsWith('avc') ? { avc: { format: 'avc' } } : {}),
  });
  async function pickCodec(width, height, fps) {
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null;
    for (const codec of CODECS) {
      try { if ((await VideoEncoder.isConfigSupported(configFor(codec, width, height, fps))).supported) return codec; } catch (e) { /* try the next */ }
    }
    return null;
  }

  // ITU-T H.273 code points for a WebCodecs colour space (VP9 keeps them in its config box)
  const H273 = {
    primaries: { bt709: 1, bt470bg: 5, smpte170m: 6, bt2020: 9, smpte432: 12 },
    transfer: { bt709: 1, smpte170m: 6, 'iec61966-2-1': 13, linear: 8, pq: 16, hlg: 18 },
    matrix: { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6, 'bt2020-ncl': 9 },
  };
  function visualEntry(type, width, height, ...children) {
    return box(type, zeros(6), u16(1), zeros(16), u16(width), u16(height),
      u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x0018), u16(0xffff), ...children);
  }
  function sampleEntry(codec, width, height, description, colorSpace) {
    if (codec.startsWith('avc')) {
      if (!description) throw new Error('the H.264 encoder gave no decoder configuration');
      return { brand: 'avc1', box: visualEntry('avc1', width, height, box('avcC', description)) };
    }
    const [, profile, level, depth] = codec.split('.').map(Number);
    const cs = colorSpace || {};
    const prim = H273.primaries[cs.primaries] ?? 2, tc = H273.transfer[cs.transfer] ?? 2, mc = H273.matrix[cs.matrix] ?? 2;
    const vpcC = fullBox('vpcC', 1, 0, [profile, level, (depth << 4) | (1 << 1) | (cs.fullRange ? 1 : 0), prim, tc, mc], u16(0));
    return { brand: 'vp09', box: visualEntry('vp09', width, height, vpcC) };
  }

  // samples in decode order, every frame 1/fps long; pts in µs
  function muxMP4({ width, height, fps, entry, samples }) {
    const scale = fps * 1000, dur = 1000, n = samples.length, total = n * dur;
    const pts = samples.map((s) => Math.round(s.pts * scale / 1e6));
    // decode times run i·dur; if frames come back reordered, composition offsets put each at its
    // presentation time, shifted so none is negative, and an edit list takes the shift off again
    const reorder = pts.some((t, i) => t !== i * dur);
    let shift = 0;
    if (reorder) for (let i = 0; i < n; i++) shift = Math.max(shift, i * dur - pts[i]);
    const sizes = samples.map((s) => s.data.length);
    const matrix = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].flatMap(u32);
    const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isom'), ascii('iso2'), ascii(entry.brand), ascii('mp41'));
    const mvhd = fullBox('mvhd', 0, 0, u32(0), u32(0), u32(scale), u32(total), u32(0x00010000), u16(0x0100), zeros(10), matrix, zeros(24), u32(2));
    const tkhd = fullBox('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(total), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(width * 65536), u32(height * 65536));
    const edts = reorder ? box('edts', fullBox('elst', 0, 0, u32(1), u32(total), u32(shift), u16(1), u16(0))) : null;
    const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(scale), u32(total), u16(0x55c4), u16(0));
    const hdlr = fullBox('hdlr', 0, 0, u32(0), ascii('vide'), zeros(12), ascii('Cabinet of Processes'), [0]);
    const vmhd = fullBox('vmhd', 0, 1, zeros(8));
    const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
    const stsd = fullBox('stsd', 0, 0, u32(1), entry.box);
    const stts = fullBox('stts', 0, 0, u32(1), u32(n), u32(dur));
    const ctts = reorder ? fullBox('ctts', 0, 0, u32(n), pts.flatMap((t, i) => [...u32(1), ...u32(t - i * dur + shift)])) : null;
    const keys = [];
    samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
    const stss = fullBox('stss', 0, 0, u32(keys.length), keys.flatMap(u32));
    const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1));
    const stsz = fullBox('stsz', 0, 0, u32(0), u32(n), sizes.flatMap(u32));
    // one chunk holding every sample, right after the moov (whose size the offset depends on)
    const moovAt = (off) => {
      const stbl = box('stbl', stsd, stts, ...(ctts ? [ctts] : []), stss, stsc, stsz, fullBox('stco', 0, 0, u32(1), u32(off)));
      const mdia = box('mdia', mdhd, hdlr, box('minf', vmhd, dinf, stbl));
      return box('moov', mvhd, box('trak', tkhd, ...(edts ? [edts] : []), mdia));
    };
    const moov = moovAt(ftyp.length + moovAt(0).length + 8);
    const mdat = new Uint8Array([...u32(8 + sizes.reduce((a, b) => a + b, 0)), ...ascii('mdat')]);
    return new Blob([ftyp, moov, mdat, ...samples.map((s) => s.data)], { type: 'video/mp4' });
  }

  // A streaming MP4 writer: add() frames (ImageData), finish() → Blob. null if the browser
  // can't encode video.
  async function mp4({ width, height, fps }) {
    const codec = await pickCodec(width, height, fps);
    if (!codec) return null;
    const samples = [];
    let description = null, colorSpace = null, err = null, i = 0;
    const enc = new VideoEncoder({
      output(chunk, meta) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        samples.push({ data, key: chunk.type === 'key', pts: chunk.timestamp });
        const dc = meta && meta.decoderConfig;
        if (dc && dc.description && !description) {
          const d = dc.description;
          description = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
        }
        if (dc && dc.colorSpace && !colorSpace) colorSpace = dc.colorSpace;
      },
      error(e) { err = e; },
    });
    enc.configure(configFor(codec, width, height, fps));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    return {
      codec,
      async add(img) {
        if (err) throw err;
        ctx.putImageData(img instanceof ImageData ? img : new ImageData(img.data, img.width, img.height), 0, 0);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        enc.encode(frame, { keyFrame: i % (2 * fps) === 0 });
        frame.close();
        i++;
        while (enc.encodeQueueSize > 3 && !err) await new Promise((r) => setTimeout(r, 4));
      },
      async finish() {
        await enc.flush();
        enc.close();
        if (err) throw err;
        if (!samples.length) throw new Error('the encoder returned no frames');
        return muxMP4({ width, height, fps, entry: sampleEntry(codec, width, height, description, colorSpace), samples });
      },
      cancel() { try { enc.close(); } catch (e) { /* already closed */ } },
    };
  }

  /* ---------- GIF ---------- */
  // One palette for the whole clip: median cut over 15-bit colours sampled from some images,
  // into at most `max` colours (the GIF writer keeps one more index for "unchanged").
  function palette(images, max = 255) {
    const hist = new Uint32Array(32768);
    for (const im of images) {
      const d = im.data, step = 4 * Math.max(1, Math.floor(d.length / 4 / 80000));
      for (let i = 0; i < d.length; i += step) hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
    }
    const ch = [(c) => c >> 10, (c) => (c >> 5) & 31, (c) => c & 31];
    const boxes = [[]];
    for (let c = 0; c < 32768; c++) if (hist[c]) boxes[0].push(c);
    const measure = (bx) => {
      let n = 0, best = 0, axis = 0;
      for (const c of bx) n += hist[c];
      for (let a = 0; a < 3; a++) {
        let lo = 31, hi = 0;
        for (const c of bx) { const v = ch[a](c); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > best) { best = hi - lo; axis = a; }
      }
      return { score: best * Math.sqrt(n), axis };
    };
    while (boxes.length < max) {
      let pick = -1, top = 0, axis = 0;
      boxes.forEach((bx, j) => { if (bx.length > 1) { const m = measure(bx); if (m.score > top) { top = m.score; pick = j; axis = m.axis; } } });
      if (pick < 0) break;
      // split at the count-weighted median along the widest channel
      const bx = boxes[pick].sort((p, q) => ch[axis](p) - ch[axis](q));
      let total = 0;
      for (const c of bx) total += hist[c];
      let acc = 0, cut = 1;
      for (; cut < bx.length - 1; cut++) { acc += hist[bx[cut - 1]]; if (acc >= total / 2) break; }
      boxes.splice(pick, 1, bx.slice(0, cut), bx.slice(cut));
    }
    const pal = new Uint8Array(768);
    boxes.forEach((bx, j) => {
      let n = 0, r = 0, g = 0, b = 0;
      for (const c of bx) { const w = hist[c]; n += w; r += ch[0](c) * w; g += ch[1](c) * w; b += ch[2](c) * w; }
      if (n) { pal[j * 3] = Math.round(r / n * 255 / 31); pal[j * 3 + 1] = Math.round(g / n * 255 / 31); pal[j * 3 + 2] = Math.round(b / n * 255 / 31); }
    });
    // nearest palette entry for every 15-bit colour
    const count = Math.max(1, boxes.length), lut = new Uint8Array(32768);
    for (let c = 0; c < 32768; c++) {
      const r = ch[0](c) * 255 / 31, g = ch[1](c) * 255 / 31, b = ch[2](c) * 255 / 31;
      let best = 1e9, bi = 0;
      for (let j = 0; j < count; j++) {
        const dr = pal[j * 3] - r, dg = pal[j * 3 + 1] - g, db = pal[j * 3 + 2] - b, e = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (e < best) { best = e; bi = j; }
      }
      lut[c] = bi;
    }
    return { pal, lut };
  }

  // 8×8 Bayer thresholds: the same pattern every frame, so areas that don't change don't flicker
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  const DITHER = 14;   // threshold spread, in 8-bit levels

  // LZW with direct-indexed tables (key = prefix << 8 | index); a generation stamp makes each
  // table reset free
  const LZW_CODE = new Int16Array(1 << 20), LZW_GEN = new Int32Array(1 << 20);
  let lzwGen = 0;
  function lzw(px, sink) {
    const minCode = 8, clear = 256, eoi = 257;
    let size = minCode + 1, next = eoi + 1, gen = ++lzwGen, acc = 0, bits = 0;
    const emit = (code) => { acc |= code << bits; bits += size; while (bits >= 8) { sink.byte(acc & 255); acc >>>= 8; bits -= 8; } };
    emit(clear);
    let ib = px[0];
    for (let i = 1, n = px.length; i < n; i++) {
      const k = px[i], key = (ib << 8) | k;
      if (LZW_GEN[key] === gen) { ib = LZW_CODE[key]; continue; }
      emit(ib);
      if (next === 4096) { emit(clear); next = eoi + 1; size = minCode + 1; gen = ++lzwGen; }
      else { if (next >= (1 << size)) size++; LZW_GEN[key] = gen; LZW_CODE[key] = next++; }
      ib = k;
    }
    emit(ib); emit(eoi);
    if (bits > 0) sink.byte(acc & 255);
  }
  // LZW output split into GIF sub-blocks of up to 255 bytes
  function blockSink() {
    let buf = new Uint8Array(1 << 16), len = 0, blockAt = 0;
    const room = (n) => { if (len + n > buf.length) { const b = new Uint8Array(Math.max(buf.length * 2, len + n)); b.set(buf.subarray(0, len)); buf = b; } };
    room(1); buf[len++] = 0;      // first block's length, filled in as it closes
    return {
      byte(v) {
        if (len - blockAt - 1 === 255) { buf[blockAt] = 255; room(1); blockAt = len; buf[len++] = 0; }
        room(1); buf[len++] = v;
      },
      done() { buf[blockAt] = len - blockAt - 1; room(1); buf[len++] = 0; return buf.slice(0, len); },
    };
  }

  // A streaming GIF writer: add(image, delay in centiseconds), finish() → Blob. After the first
  // frame, a pixel whose shown colour is still within HOLD levels of its true colour is written as
  // the transparent index (255): the previous frame shows through, runs of it compress to almost
  // nothing, and dither thresholds stop flickering. A clip shrinks to about a third.
  const HOLD = 12;
  function gif({ width, height, colors }) {
    const parts = [new Uint8Array([...ascii('GIF89a'), ...u16(width).reverse(), ...u16(height).reverse(), 0xf7, 0, 0]), colors.pal,
      new Uint8Array([0x21, 0xff, 0x0b, ...ascii('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0])];
    const KEEP = 255, px = new Uint8Array(width * height), shown = new Uint8Array(width * height), { lut, pal } = colors;
    let first = true;
    return {
      add(img, delay) {
        const d = img.data;
        for (let y = 0, i = 0, p = 0; y < height; y++) {
          const row = (y & 7) << 3;
          for (let x = 0; x < width; x++, i += 4, p++) {
            const t = (BAYER[row | (x & 7)] - 31.5) * DITHER / 64;
            let r = d[i] + t, g = d[i + 1] + t, b = d[i + 2] + t;
            r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
            const c = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
            let hold = false;
            if (!first) {
              const q = shown[p] * 3, e0 = pal[q] - d[i], e1 = pal[q + 1] - d[i + 1], e2 = pal[q + 2] - d[i + 2];
              hold = c === shown[p] || e0 * e0 + e1 * e1 + e2 * e2 < HOLD * HOLD;
            }
            if (hold) px[p] = KEEP; else { px[p] = c; shown[p] = c; }
          }
        }
        parts.push(new Uint8Array([0x21, 0xf9, 0x04, first ? 0x04 : 0x05, delay & 255, (delay >> 8) & 255, KEEP, 0,
          0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0, 8]));
        first = false;
        const sink = blockSink();
        lzw(px, sink);
        parts.push(sink.done());
      },
      finish() { parts.push(new Uint8Array([0x3b])); return new Blob(parts, { type: 'image/gif' }); },
    };
  }

  root.Cabinet.media = { mp4, pickCodec, muxMP4, sampleEntry, gif, palette };
})(typeof window !== 'undefined' ? window : globalThis);
