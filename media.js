/* ============================================================================
 * media.js — Images, video, audio, zip.
 *
 *   Image editor : tools (move/brush/eraser/text/crop), transform (rotate/flip),
 *                  adjustments (brightness/contrast/saturation/hue/blur), zoom,
 *                  undo/redo, save (bakes adjustments).
 *   Video editor : custom player (play, scrub, volume, speed, fullscreen,
 *                  frame-step) + timeline trim handles, capture frame, and
 *                  export the trimmed range to .webm (MediaRecorder).
 *   Audio        : player.   Zip : browse + preview entries (fflate).
 * ==========================================================================*/

const Media = (() => {
  const IMG = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i;
  const VID = /\.(mp4|webm|mov|avi|mkv|m4v)$/i;
  const AUD = /\.(mp3|wav|ogg|flac|m4a)$/i;
  const ZIP = /\.(zip)$/i;
  const EDITABLE_IMG = /^(png|jpe?g|webp)$/i;
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    bmp: 'image/bmp', ico: 'image/x-icon', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', m4v: 'video/mp4',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  };
  const ext = p => (p.split('.').pop() || '').toLowerCase();
  const isImage = p => IMG.test(p), isVideo = p => VID.test(p), isAudio = p => AUD.test(p), isZip = p => ZIP.test(p);
  const tr = (k, v) => (window.t ? t(k, v) : k);
  const I = n => (window.Icon ? Icon(n, { size: 15 }) : '');
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let host = null, urls = [], videoEl = null, recorder = null, fflate = null, cleanup = [];
  const mkURL = (buf, mime) => { const u = URL.createObjectURL(new Blob([buf], { type: mime })); urls.push(u); return u; };
  const loadImg = (img, src) => new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });

  function dispose() {
    cleanup.forEach(fn => { try { fn(); } catch {} }); cleanup = [];
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
    recorder = null;
    if (videoEl) { try { videoEl.pause(); } catch {} videoEl.removeAttribute('src'); videoEl = null; }
    urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
    if (host) host.innerHTML = '';
    host = null;
  }

  const mkBtn = (cls, html, title, fn) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = html; if (title) b.title = title; b.onclick = fn; return b; };

  // ════════════════════════════ IMAGE EDITOR ════════════════════════════════
  async function openImage(buf, e, name, hostEl, opts = {}) {
    dispose(); host = hostEl;
    const src = mkURL(buf, MIME[e] || 'image/png');
    if (!EDITABLE_IMG.test(e)) {                    // gif/svg/bmp/ico → view only
      host.innerHTML = `<div class="media-stage"><img class="media-img" src="${src}"></div>`;
      return;
    }
    const img = new Image(); await loadImg(img, src);

    host.innerHTML = `
      <div class="imed">
        <div class="imed-side" id="imed-tools"></div>
        <div class="imed-mid">
          <div class="imed-top" id="imed-top"></div>
          <div class="imed-stage" id="imed-stage"><canvas id="imed-canvas"></canvas></div>
          <div class="imed-adjust" id="imed-adjust"></div>
        </div>
      </div>`;
    const stage = host.querySelector('#imed-stage');
    const cv = host.querySelector('#imed-canvas');
    const cx = cv.getContext('2d');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cx.drawImage(img, 0, 0);

    const adj = { brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0 };
    const filterStr = () => `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) hue-rotate(${adj.hue}deg) blur(${adj.blur}px)`;
    let zoom = 1, tool = 'move', brushColor = '#ff3b30', brushSize = 8;
    const history = []; let hi = -1;

    function applyFilter() { cv.style.filter = filterStr(); }
    function setZoom(z) { zoom = Math.max(0.05, Math.min(8, z)); cv.style.width = (cv.width * zoom) + 'px'; cv.style.height = (cv.height * zoom) + 'px'; }
    function fit() { const pad = 40; setZoom(Math.min((stage.clientWidth - pad) / cv.width, (stage.clientHeight - pad) / cv.height, 1)); }
    function snapshot() { history.splice(hi + 1); history.push(cv.toDataURL()); if (history.length > 25) history.shift(); hi = history.length - 1; updateHist(); }
    function restore(url, keepZoom) { const im = new Image(); im.onload = () => { cv.width = im.naturalWidth; cv.height = im.naturalHeight; cx.drawImage(im, 0, 0); if (!keepZoom) fit(); else setZoom(zoom); }; im.src = url; }
    function undo() { if (hi > 0) { hi--; restore(history[hi]); updateHist(); } }
    function redo() { if (hi < history.length - 1) { hi++; restore(history[hi]); updateHist(); } }

    // ── transforms ──
    function rotate(dir) {
      const t = document.createElement('canvas'); t.width = cv.height; t.height = cv.width;
      const tx = t.getContext('2d'); tx.translate(t.width / 2, t.height / 2); tx.rotate(dir * Math.PI / 2);
      tx.drawImage(cv, -cv.width / 2, -cv.height / 2);
      cv.width = t.width; cv.height = t.height; cx.drawImage(t, 0, 0); fit(); snapshot();
    }
    function flip(h) {
      const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
      const tx = t.getContext('2d'); tx.translate(h ? t.width : 0, h ? 0 : t.height); tx.scale(h ? -1 : 1, h ? 1 : -1); tx.drawImage(cv, 0, 0);
      cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(t, 0, 0); snapshot();
    }

    // ── pointer → image coords ──
    const pt = ev => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (cv.width / r.width), y: (ev.clientY - r.top) * (cv.height / r.height) }; };

    // ── drawing (brush / eraser) ──
    let drawing = false, last = null;
    cv.addEventListener('pointerdown', ev => {
      if (tool === 'brush' || tool === 'eraser') {
        drawing = true; last = pt(ev); cv.setPointerCapture(ev.pointerId);
        cx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        cx.strokeStyle = brushColor; cx.lineWidth = brushSize; cx.lineCap = 'round'; cx.lineJoin = 'round';
      } else if (tool === 'text') {
        const p = pt(ev); const txt = prompt(tr('media.text')); if (txt) { cx.globalCompositeOperation = 'source-over'; cx.fillStyle = brushColor; cx.font = `${Math.max(14, brushSize * 4)}px sans-serif`; cx.textBaseline = 'top'; cx.fillText(txt, p.x, p.y); snapshot(); }
      } else if (tool === 'crop') { startCrop(ev); }
    });
    cv.addEventListener('pointermove', ev => {
      if (!drawing) return; const p = pt(ev);
      cx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      cx.beginPath(); cx.moveTo(last.x, last.y); cx.lineTo(p.x, p.y); cx.stroke(); last = p;
    });
    cv.addEventListener('pointerup', () => { if (drawing) { drawing = false; cx.globalCompositeOperation = 'source-over'; snapshot(); } });

    // ── crop ──
    let cropBox = null, cropEl = null;
    function startCrop(ev) {
      const sr = stage.getBoundingClientRect(); const ox = ev.clientX, oy = ev.clientY;
      cropEl && cropEl.remove();
      cropEl = document.createElement('div'); cropEl.className = 'imed-crop'; stage.appendChild(cropEl);
      const move = e2 => {
        const x = Math.min(ox, e2.clientX) - sr.left + stage.scrollLeft, y = Math.min(oy, e2.clientY) - sr.top + stage.scrollTop;
        const w = Math.abs(e2.clientX - ox), h = Math.abs(e2.clientY - oy);
        Object.assign(cropEl.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
        cropBox = { x: ox, y: oy, ex: e2.clientX, ey: e2.clientY };
      };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    }
    function applyCrop() {
      if (!cropBox) return;
      const r = cv.getBoundingClientRect(); const sx = cv.width / r.width, sy = cv.height / r.height;
      const x = (Math.min(cropBox.x, cropBox.ex) - r.left) * sx, y = (Math.min(cropBox.y, cropBox.ey) - r.top) * sy;
      const w = Math.abs(cropBox.ex - cropBox.x) * sx, h = Math.abs(cropBox.ey - cropBox.y) * sy;
      if (w < 4 || h < 4) return;
      const t = document.createElement('canvas'); t.width = Math.round(w); t.height = Math.round(h);
      t.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, t.width, t.height);
      cv.width = t.width; cv.height = t.height; cx.drawImage(t, 0, 0);
      cropEl && cropEl.remove(); cropEl = null; cropBox = null; fit(); snapshot();
    }

    // ── tools sidebar ──
    const tools = host.querySelector('#imed-tools');
    function setTool(tn) { tool = tn; tools.querySelectorAll('.imed-tool').forEach(b => b.classList.toggle('on', b.dataset.t === tn)); stage.style.cursor = (tn === 'move') ? 'grab' : 'crosshair'; if (tn !== 'crop' && cropEl) { cropEl.remove(); cropEl = null; cropBox = null; } }
    [['move', 'hand', tr('media.move')], ['brush', 'brush', tr('media.brush')], ['eraser', 'eraser', tr('media.eraser')], ['text', 'type', tr('media.text')], ['crop', 'crop', tr('media.crop')]].forEach(([tn, ic, ti]) => {
      const b = mkBtn('imed-tool', I(ic), ti, () => setTool(tn)); b.dataset.t = tn; tools.appendChild(b);
    });
    // brush color + size
    const color = document.createElement('input'); color.type = 'color'; color.value = brushColor; color.className = 'imed-color'; color.title = tr('viewer.color'); color.oninput = () => brushColor = color.value;
    const size = document.createElement('input'); size.type = 'range'; size.min = 1; size.max = 80; size.value = brushSize; size.className = 'imed-size'; size.title = tr('media.brushSize'); size.oninput = () => brushSize = +size.value;
    tools.append(color, size);

    // ── top action bar ──
    const top = host.querySelector('#imed-top');
    const undoBtn = mkBtn('media-btn', I('undo-2'), tr('media.undo'), undo);
    const redoBtn = mkBtn('media-btn', I('redo-2'), tr('media.redo'), redo);
    function updateHist() { undoBtn.disabled = hi <= 0; redoBtn.disabled = hi >= history.length - 1; }
    top.append(
      undoBtn, redoBtn, sep(),
      mkBtn('media-btn', I('rotate-ccw'), tr('media.rotL'), () => rotate(-1)),
      mkBtn('media-btn', I('rotate-cw'), tr('media.rotR'), () => rotate(1)),
      mkBtn('media-btn', I('flip-horizontal'), tr('media.flipH'), () => flip(true)),
      mkBtn('media-btn', I('flip-vertical'), tr('media.flipV'), () => flip(false)), sep(),
      mkBtn('media-btn', I('zoom-out'), tr('media.zoomOut'), () => setZoom(zoom / 1.25)),
      mkBtn('media-btn', I('zoom-in'), tr('media.zoomIn'), () => setZoom(zoom * 1.25)),
      mkBtn('media-btn', I('crop') + `<span>${tr('media.applyCrop')}</span>`, tr('media.applyCrop'), applyCrop),
      mkBtn('media-btn', tr('media.reset'), tr('media.reset'), () => { if (cropEl) { cropEl.remove(); cropEl = null; } cropBox = null; adj.brightness = adj.contrast = adj.saturate = 100; adj.hue = 0; adj.blur = 0; applyFilter(); host.querySelectorAll('#imed-adjust input').forEach(i => i.value = i.dataset.def); if (history[0]) restore(history[0]); hi = 0; updateHist(); }),
      mkBtn('media-btn save-btn', I('save') + `<span>${tr('media.save')}</span>`, tr('media.save'), doSave),
    );

    // ── adjustments ──
    const adjBar = host.querySelector('#imed-adjust');
    const adjDefs = [['sun', 'media.brightness', 'brightness', 0, 200, 100], ['contrast', 'media.contrast', 'contrast', 0, 200, 100], ['droplet', 'media.saturation', 'saturate', 0, 200, 100], ['droplet', 'media.hue', 'hue', 0, 360, 0], ['droplet', 'media.blur', 'blur', 0, 20, 0]];
    adjDefs.forEach(([ic, label, key, min, max, def]) => {
      const w = document.createElement('label'); w.className = 'imed-adj';
      w.innerHTML = `<span title="${tr(label)}">${I(ic)}</span>`;
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.value = def; inp.dataset.def = def;
      inp.oninput = () => { adj[key] = +inp.value; applyFilter(); };
      w.appendChild(inp); adjBar.appendChild(w);
    });

    async function doSave(ev) {
      const b = ev.currentTarget, prev = b.innerHTML; b.disabled = true; b.innerHTML = I('save') + `<span>${tr('media.saving')}</span>`;
      try {
        const out = document.createElement('canvas'); out.width = cv.width; out.height = cv.height;
        const octx = out.getContext('2d'); octx.filter = filterStr(); octx.drawImage(cv, 0, 0);
        const mime = e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : 'image/jpeg';
        const blob = await new Promise(r => out.toBlob(r, mime, 0.92));
        await opts.onSave(await blob.arrayBuffer());
        b.innerHTML = I('save') + `<span>${tr('media.done')}</span>`;
      } catch (err) { b.innerHTML = I('save') + `<span>${tr('media.error')}</span>`; }
      setTimeout(() => { b.innerHTML = prev; b.disabled = false; }, 1500);
    }

    function sep() { const s = document.createElement('span'); s.className = 'media-sep'; return s; }

    setTool('move'); applyFilter(); snapshot(); fit();
    cleanup.push(() => {});
  }

  // ════════════════════════════ VIDEO PLAYER + EDITOR ═══════════════════════
  async function openVideo(buf, e, name, hostEl, opts = {}) {
    dispose(); host = hostEl;
    const src = mkURL(buf, MIME[e] || 'video/mp4');
    host.innerHTML = `
      <div class="vid">
        <div class="vid-stage"><video class="vid-el" playsinline></video></div>
        <div class="vid-bar">
          <button class="vid-play" id="vp-play"></button>
          <span class="vid-time" id="vp-cur">0:00</span>
          <div class="vid-track" id="vp-track">
            <div class="vid-trim" id="vp-trim"></div>
            <div class="vid-prog" id="vp-prog"></div>
            <div class="vid-head" id="vp-head"></div>
            <div class="vid-handle in" id="vp-in"></div>
            <div class="vid-handle out" id="vp-out"></div>
          </div>
          <span class="vid-time" id="vp-dur">0:00</span>
          <button class="vid-mini" id="vp-mute"></button>
          <input type="range" class="vid-vol" id="vp-vol" min="0" max="1" step="0.05" value="1">
          <select class="vid-speed" id="vp-speed"><option>0.5</option><option>1</option><option>1.5</option><option>2</option></select>
          <button class="vid-mini" id="vp-full"></button>
        </div>
        <div class="vid-edit">
          <span class="vid-trimlabel" id="vp-trimlabel"></span>
          <div class="media-bar-spacer"></div>
          <button class="media-btn frame-btn" id="vp-frame">${I('crop')}<span>${tr('media.frame')}</span></button>
          <button class="media-btn save-btn" id="vp-export">${I('scissors')}<span>${tr('media.trim')}</span></button>
        </div>
      </div>`;
    const v = videoEl = host.querySelector('.vid-el'); v.src = src;
    const $$ = s => host.querySelector(s);
    const playBtn = $$('#vp-play'), track = $$('#vp-track'), prog = $$('#vp-prog'), head = $$('#vp-head'),
      trim = $$('#vp-trim'), inH = $$('#vp-in'), outH = $$('#vp-out'),
      curT = $$('#vp-cur'), durT = $$('#vp-dur'), trimLabel = $$('#vp-trimlabel');
    const fmt = t => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); };
    let dur = 0, inT = 0, outT = 0;
    playBtn.innerHTML = I('play'); $$('#vp-mute').innerHTML = I('volume-2'); $$('#vp-full').innerHTML = I('maximize');

    await new Promise(res => { v.onloadedmetadata = res; });
    dur = v.duration || 0; outT = dur; durT.textContent = fmt(dur);
    const pct = t => (dur ? (t / dur * 100) : 0) + '%';
    function layoutTrim() { trim.style.left = pct(inT); trim.style.right = (100 - (outT / dur * 100)) + '%'; inH.style.left = pct(inT); outH.style.left = pct(outT); trimLabel.textContent = `${tr('media.start')} ${fmt(inT)} · ${tr('media.end')} ${fmt(outT)}`; }
    layoutTrim();

    const togglePlay = () => v.paused ? v.play() : v.pause();
    playBtn.onclick = togglePlay;
    v.parentElement.onclick = e2 => { if (e2.target === v) togglePlay(); };
    v.onplay = () => playBtn.innerHTML = I('pause');
    v.onpause = () => playBtn.innerHTML = I('play');
    v.ontimeupdate = () => { head.style.left = pct(v.currentTime); prog.style.width = pct(v.currentTime); curT.textContent = fmt(v.currentTime); if (v.currentTime >= outT && !v.paused) v.pause(); };

    // seek by clicking the track
    const trackTime = ev => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * dur; };
    track.addEventListener('pointerdown', ev => {
      if (ev.target === inH || ev.target === outH) return;
      v.currentTime = trackTime(ev);
    });
    // drag trim handles
    const dragHandle = (el, set) => el.addEventListener('pointerdown', ev => {
      ev.stopPropagation(); el.setPointerCapture(ev.pointerId);
      const move = e2 => { set(trackTime(e2)); layoutTrim(); };
      const up = () => { el.releasePointerCapture(ev.pointerId); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    });
    dragHandle(inH, t => { inT = Math.min(t, outT - 0.1); if (v.currentTime < inT) v.currentTime = inT; });
    dragHandle(outH, t => { outT = Math.max(t, inT + 0.1); });

    $$('#vp-vol').oninput = e2 => { v.volume = +e2.target.value; v.muted = v.volume === 0; $$('#vp-mute').innerHTML = I(v.muted ? 'volume-x' : 'volume-2'); };
    $$('#vp-mute').onclick = () => { v.muted = !v.muted; $$('#vp-mute').innerHTML = I(v.muted ? 'volume-x' : 'volume-2'); };
    $$('#vp-speed').value = '1'; $$('#vp-speed').onchange = e2 => v.playbackRate = +e2.target.value;
    $$('#vp-full').onclick = () => { const el = v.parentElement; const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen; if (fn) { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } };

    // keyboard: space play, arrows = frame step (±1/30s)
    const onKey = e2 => { if (!host) return; if (e2.key === ' ' && document.activeElement.tagName !== 'INPUT') { e2.preventDefault(); togglePlay(); } else if (e2.key === 'ArrowRight') v.currentTime = Math.min(dur, v.currentTime + 1 / 30); else if (e2.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - 1 / 30); };
    document.addEventListener('keydown', onKey); cleanup.push(() => document.removeEventListener('keydown', onKey));

    $$('#vp-frame').onclick = async () => {
      const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await opts.onSaveFrame(await blob.arrayBuffer());
    };
    $$('#vp-export').onclick = ev => trimExport(ev, v, inT, outT, opts);
  }

  async function trimExport(ev, v, inT, outT, opts) {
    const b = ev.currentTarget, prev = b.innerHTML; b.disabled = true; b.innerHTML = I('scissors') + `<span>${tr('media.recording')}</span>`;
    let watch = null;
    try {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported('video/webm')) throw new Error('webm unsupported');
      const stream = v.captureStream ? v.captureStream() : v.mozCaptureStream();
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm' }); recorder = rec;
      const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(r => rec.onstop = r);
      // seek → start recording → watch for the out point → play (order matters so
      // the recorder is running before playback advances past outT).
      v.pause(); v.currentTime = inT; await new Promise(r => { v.onseeked = r; });
      rec.start();
      watch = () => { if (v.currentTime >= outT) { v.pause(); v.removeEventListener('timeupdate', watch); watch = null; rec.stop(); } };
      v.addEventListener('timeupdate', watch);
      await v.play().catch(() => {});
      await stopped; recorder = null;
      if (!chunks.length) throw new Error('no frames captured');
      await opts.onSaveTrim(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      b.innerHTML = I('scissors') + `<span>${tr('media.done')}</span>`;
    } catch (err) {
      console.warn('[media] trim failed', err);
      b.innerHTML = I('scissors') + `<span>${tr('media.error')}</span>`;
    } finally {
      if (watch) v.removeEventListener('timeupdate', watch);
    }
    setTimeout(() => { b.innerHTML = prev; b.disabled = false; }, 1600);
  }

  // ════════════════════════════ AUDIO ════════════════════════════════════════
  async function openAudio(buf, e, name, hostEl) {
    dispose(); host = hostEl;
    const src = mkURL(buf, MIME[e] || 'audio/mpeg');
    host.innerHTML = `<div class="media-stage media-audio-stage"><div class="media-audio-name">${esc(name)}</div><audio class="media-audio" controls src="${src}"></audio></div>`;
  }

  // ════════════════════════════ ZIP ══════════════════════════════════════════
  async function openZip(buf, name, hostEl) {
    dispose(); host = hostEl;
    host.innerHTML = `<div class="media-msg">…</div>`;
    try {
      if (!fflate) fflate = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
      const files = fflate.unzipSync(new Uint8Array(buf));
      const names = Object.keys(files).filter(n => !n.endsWith('/')).sort();
      host.innerHTML = '';
      const wrap = document.createElement('div'); wrap.className = 'zip-view';
      const list = document.createElement('div'); list.className = 'zip-list';
      const head = document.createElement('div'); head.className = 'zip-head'; head.textContent = `${esc(name)} — ${tr('zip.files', { n: names.length })}`;
      list.appendChild(head);
      const preview = document.createElement('div'); preview.className = 'zip-preview';
      preview.innerHTML = `<div class="media-msg">${tr('zip.pick')}</div>`;
      names.forEach(n => {
        const row = document.createElement('div'); row.className = 'zip-row';
        row.innerHTML = `<span class="zip-name">${esc(n)}</span><span class="zip-size">${(files[n].length / 1024).toFixed(1)} КБ</span>`;
        row.onclick = () => { list.querySelectorAll('.zip-row.on').forEach(r => r.classList.remove('on')); row.classList.add('on'); showEntry(preview, n, files[n]); };
        list.appendChild(row);
      });
      wrap.append(list, preview); host.appendChild(wrap);
    } catch (err) { host.innerHTML = `<div class="media-msg">${tr('media.error')}<br><span>${esc(String(err.message || err))}</span></div>`; }
  }
  function showEntry(preview, n, bytes) {
    if (IMG.test(n)) { preview.innerHTML = `<img class="media-img" src="${mkURL(bytes, MIME[ext(n)] || 'image/png')}">`; }
    else if (bytes.length < 512 * 1024 && !VID.test(n) && !AUD.test(n) && !/\.(zip|exe|bin|woff2?|ttf)$/i.test(n)) {
      preview.innerHTML = `<pre class="zip-text">${esc(new TextDecoder().decode(bytes))}</pre>`;
    } else { preview.innerHTML = `<div class="media-msg">${esc(n)}<br><span>${(bytes.length / 1024).toFixed(1)} КБ — ${tr('zip.noPreview')}</span></div>`; }
  }

  return { isImage, isVideo, isAudio, isZip, openImage, openVideo, openAudio, openZip, dispose };
})();

window.Media = Media;
