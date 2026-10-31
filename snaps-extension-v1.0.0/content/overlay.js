// Snaps in-page area selector (injected on demand via chrome.scripting).
// Lightshot-style flow: freeze page -> drag a region -> annotate -> copy / save / edit.
(() => {
  'use strict';

  const I = globalThis.SNAP_ICONS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex2 = n => n.toString(16).padStart(2, '0');
  const pad2 = n => String(n).padStart(2, '0');

  let session = null;

  // (Re)register the message listener – robust to extension reloads.
  try { if (window.__snapsListener) chrome.runtime.onMessage.removeListener(window.__snapsListener); } catch (_) { /* old context */ }
  window.__snapsListener = (msg, sender, sendResponse) => {
    if (msg && msg.type === 'snap:open') {
      open(msg).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: String(e) }));
      return true;
    }
  };
  chrome.runtime.onMessage.addListener(window.__snapsListener);

  // Roboto is handed over by the background worker as raw bytes (page CSP can't block that).
  async function loadFonts() {
    try {
      const res = await Promise.race([chrome.runtime.sendMessage({ type: 'fonts' }), new Promise(r => setTimeout(() => r(null), 700))]);
      if (!res || !res.fonts) return [];
      const faces = [];
      for (const [weight, b64] of Object.entries(res.fonts)) {
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const face = new FontFace('SnapsRoboto', bytes, { weight });
        await face.load();
        document.fonts.add(face);
        faces.push(face);
      }
      return faces;
    } catch (_) { return []; }
  }

  async function open(msg) {
    if (session) session.close();
    const img = new Image();
    img.src = msg.dataUrl;
    await img.decode();
    const fonts = await loadFonts();
    session = new Session(img, msg);
    session.fonts = fonts;
  }

  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.root{position:absolute;inset:0;overflow:hidden;font:400 14px/1.43 "SnapsRoboto","Roboto","Helvetica Neue",Arial,system-ui,sans-serif;letter-spacing:.01071em;
  color:var(--fg);user-select:none;-webkit-user-select:none;cursor:crosshair;touch-action:none;
  --fg:rgba(0,0,0,.87);--muted:rgba(0,0,0,.6);--panel:#fff;--line:rgba(0,0,0,.12);--pt:var(--a1);
  --sn-icon:rgba(0,0,0,.6);--sn-hover:rgba(0,0,0,.06);--sn-active-bg:rgba(var(--a1-rgb),.14);--sn-active-fg:var(--a1);--sn-ring:rgba(0,0,0,.24);
  --e2:0 3px 1px -2px rgba(0,0,0,.2),0 2px 2px 0 rgba(0,0,0,.14),0 1px 5px 0 rgba(0,0,0,.12);
  --e8:0 5px 5px -3px rgba(0,0,0,.2),0 8px 10px 1px rgba(0,0,0,.14),0 3px 14px 2px rgba(0,0,0,.12)}
@media (prefers-color-scheme:dark){.root{--fg:#fff;--muted:rgba(255,255,255,.7);--panel:#1e1e1e;--line:rgba(255,255,255,.12);
  --pt:color-mix(in srgb,var(--a1) 50%,#fff);--sn-icon:rgba(255,255,255,.72);--sn-hover:rgba(255,255,255,.1);--sn-active-bg:rgba(var(--a1-rgb),.32);
  --sn-active-fg:color-mix(in srgb,var(--a1) 45%,#fff);--sn-ring:rgba(255,255,255,.34)}}
.stage{position:absolute;inset:0}
.dim{position:absolute;inset:0;background:rgba(0,0,0,.36);pointer-events:none}
.guide{position:absolute;background:#fff;mix-blend-mode:difference;opacity:.6;pointer-events:none}
.gx{left:0;right:0;height:1px}.gy{top:0;bottom:0;width:1px}
.sel{position:absolute;pointer-events:none;border:1px solid #fff;box-shadow:0 0 0 1px var(--a1),0 0 0 100vmax rgba(0,0,0,.5)}
.sel.flash::after{content:"";position:absolute;inset:0;background:#fff;animation:flash .38s ease-out forwards}
@keyframes flash{from{opacity:.9}to{opacity:0}}
.h{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--a1),0 1px 4px rgba(0,0,0,.45);pointer-events:none}
.h.nw{left:0;top:0}.h.n{left:50%;top:0}.h.ne{left:100%;top:0}.h.e{left:100%;top:50%}
.h.se{left:100%;top:100%}.h.s{left:50%;top:100%}.h.sw{left:0;top:100%}.h.w{left:0;top:50%}
.badge{position:absolute;left:-1px;top:-32px;padding:2px 10px;border-radius:4px;color:#fff;white-space:nowrap;font:500 12px/20px "SnapsRoboto","Roboto",system-ui,sans-serif;
  background:var(--a1);box-shadow:var(--e2)}
.badge.in{top:8px;left:8px}
.loupe{position:absolute;width:148px;pointer-events:none;border-radius:4px;overflow:hidden;background:var(--panel);box-shadow:var(--e8)}
.loupe canvas{display:block;width:148px;height:148px;image-rendering:pixelated}
.linfo{padding:8px 12px 10px;font-size:12px;line-height:1.5;display:flex;flex-direction:column;gap:2px;color:var(--fg)}
.linfo b{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500}
.linfo i{display:inline-block;width:14px;height:14px;border-radius:50%;box-shadow:inset 0 0 0 1px var(--sn-ring)}
.linfo span{color:var(--muted)}
.bar{position:absolute;left:0;top:0;display:flex;flex-direction:column;gap:4px;padding:6px 12px 6px 10px;border-radius:4px;cursor:default;
  background:var(--panel);color:var(--fg);box-shadow:var(--e8);max-width:calc(100% - 16px);animation:pop .2s ease-out}
.bar[hidden],.sel[hidden],.loupe[hidden],.guide[hidden],.dim[hidden],.hint[hidden]{display:none}
@keyframes pop{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.sep{width:1px;height:24px;background:var(--line);margin:0 6px;flex:none}
.spacer{flex:1;min-width:6px}
.abtn{position:relative;overflow:hidden;height:36px;padding:0 12px;border-radius:4px;border:0;background:transparent;color:var(--pt);cursor:pointer;
  font:500 14px/1 "SnapsRoboto","Roboto",system-ui,sans-serif;letter-spacing:.02857em;text-transform:uppercase;display:inline-flex;align-items:center;gap:8px;
  transition:background-color .15s,box-shadow .15s}
.abtn:hover{background:rgba(var(--a1-rgb),.1)}
.abtn.primary{background:var(--a1);color:#fff;box-shadow:var(--e2)}
.abtn.primary:hover{filter:brightness(1.1);background:var(--a1)}
.abtn.sq{width:36px;min-width:0;padding:0;justify-content:center;border-radius:50%;color:var(--sn-icon)}
.abtn.sq:hover{background:var(--sn-hover)}
.abtn.x:hover{background:rgba(244,67,54,.14);color:#f44336}
.hint{position:absolute;left:50%;top:24px;transform:translateX(-50%);padding:8px 16px;border-radius:4px;pointer-events:none;white-space:nowrap;
  background:#323232;color:#fff;box-shadow:var(--e8);font-size:14px;animation:pop .35s .1s both}
.hint em{font-style:normal;font-weight:700;color:#90caf9}
.hint kbd{font:500 11px/1.6 "SnapsRoboto","Roboto",system-ui,sans-serif;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,.18);margin:0 2px}
.toast{position:absolute;left:50%;bottom:32px;transform:translate(-50%,16px);opacity:0;pointer-events:none;padding:10px 20px;border-radius:4px;font-size:14px;
  background:#323232;color:#fff;box-shadow:var(--e8);transition:all .2s}
.toast.show{opacity:1;transform:translate(-50%,0)}
.sn-textedit{caret-color:currentColor}
` + (globalThis.SNAP_TOOLBAR_CSS || '');

  class Session {
    constructor(img, msg) {
      this.msg = msg;
      this.W = innerWidth;
      this.H = innerHeight;
      this.s = img.naturalWidth / innerWidth; // screenshot px per CSS px
      this.sel = null;
      this.drag = null;
      this.mouse = { x: this.W / 2, y: this.H / 2 };
      this.colorHex = '#000000';

      const [a1, a2] = [msg.a1 || '#2563eb', msg.a2 || '#2563eb'];
      const rgb = h => { const n = parseInt(h.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

      // ---- host + shadow
      this.host = document.createElement('div');
      this.host.id = 'snaps-overlay-host';
      this.host.style.cssText = `all:initial;position:fixed;left:0;top:0;width:${this.W}px;height:${this.H}px;z-index:2147483647;overflow:hidden;`;
      const root = this.host.attachShadow({ mode: 'closed' });
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        root.adoptedStyleSheets = [sheet];
      } catch (_) {
        const st = document.createElement('style');
        st.textContent = CSS;
        root.appendChild(st);
      }
      this.rootEl = document.createElement('div');
      this.rootEl.className = 'root';
      this.rootEl.style.cssText = `--a1:${a1};--a2:${a2};--a1-rgb:${rgb(a1)};--a2-rgb:${rgb(a2)}`;
      this.rootEl.innerHTML = `
        <div class="stage"></div>
        <div class="dim"></div>
        <div class="guide gx" hidden></div><div class="guide gy" hidden></div>
        <div class="sel" hidden><div class="badge"></div>${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(h => `<i class="h ${h}"></i>`).join('')}</div>
        <div class="loupe" hidden><canvas width="148" height="148"></canvas><div class="linfo"></div></div>
        <div class="bar" hidden></div>
        <div class="hint"><em>Snaps</em>&nbsp; Drag to select an area &nbsp;·&nbsp; <kbd>C</kbd> copy colour &nbsp;·&nbsp; <kbd>Esc</kbd> cancel</div>
        <div class="toast"></div>`;
      root.appendChild(this.rootEl);
      const q = s => this.rootEl.querySelector(s);
      this.$ = { stage: q('.stage'), dim: q('.dim'), gx: q('.gx'), gy: q('.gy'), sel: q('.sel'), badge: q('.badge'), loupe: q('.loupe'), lcv: q('.loupe canvas'), linfo: q('.linfo'), bar: q('.bar'), hint: q('.hint'), toast: q('.toast') };
      this.lctx = this.$.lcv.getContext('2d');
      this.px = document.createElement('canvas');
      this.px.width = this.px.height = 1;
      this.pctx = this.px.getContext('2d', { willReadFrequently: true });

      // ---- engine
      this.engine = new SnapEngine({
        stage: this.$.stage,
        source: img,
        unit: Math.max(1, this.s),
        accent: a1,
        tool: 'none',
        canDraw: (x, y) => this.inSelImg(x, y)
      });
      this.engine.canvas.style.pointerEvents = 'none';
      this.engine.on('tool', t => { this.engine.canvas.style.pointerEvents = t === 'none' ? 'none' : 'auto'; this.syncSelCursor(); });

      this.buildBar();
      document.documentElement.appendChild(this.host);

      // ---- listeners
      this.onDown = e => this.pointerDown(e);
      this.onMove = e => this.pointerMove(e);
      this.onUp = e => this.pointerUp(e);
      this.onKey = e => this.keyDown(e);
      this.onWheel = e => e.preventDefault();
      this.onResize = () => this.close();
      this.rootEl.addEventListener('pointerdown', this.onDown);
      this.rootEl.addEventListener('pointermove', this.onMove);
      this.rootEl.addEventListener('pointerup', this.onUp);
      this.rootEl.addEventListener('pointercancel', this.onUp);
      this.rootEl.addEventListener('wheel', this.onWheel, { passive: false });
      window.addEventListener('keydown', this.onKey, true);
      window.addEventListener('resize', this.onResize);
      this.hintTimer = setTimeout(() => { this.$.hint.hidden = true; }, 6000);
    }

    // ------------------------------------------------------------ geometry
    inSelImg(x, y) {
      const sel = this.sel, s = this.s;
      return !!sel && !this.drag && x >= sel.x * s && x <= (sel.x + sel.w) * s && y >= sel.y * s && y <= (sel.y + sel.h) * s;
    }
    inSel(x, y) { const r = this.sel; return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

    hitHandle(x, y) {
      const r = this.sel;
      if (!r) return null;
      const tol = 11;
      const pts = {
        nw: [r.x, r.y], n: [r.x + r.w / 2, r.y], ne: [r.x + r.w, r.y], e: [r.x + r.w, r.y + r.h / 2],
        se: [r.x + r.w, r.y + r.h], s: [r.x + r.w / 2, r.y + r.h], sw: [r.x, r.y + r.h], w: [r.x, r.y + r.h / 2]
      };
      for (const k in pts) if (Math.hypot(x - pts[k][0], y - pts[k][1]) <= tol) return k;
      return null;
    }

    // ------------------------------------------------------------ pointer
    pt(e) { return { x: clamp(e.clientX, 0, this.W), y: clamp(e.clientY, 0, this.H) }; }

    pointerDown(e) {
      if (e.button !== 0) return;
      const t = e.composedPath()[0];
      if (t && t.tagName === 'TEXTAREA') return;
      this.$.hint.hidden = true;
      const { x, y } = this.pt(e);
      const eng = this.engine;
      // active drawing tool inside the selection -> engine owns the gesture
      if (eng.tool !== 'none' && this.sel && this.inSel(x, y) && !this.hitHandle(x, y)) return;
      e.preventDefault();
      this.rootEl.setPointerCapture(e.pointerId);
      const h = this.hitHandle(x, y);
      if (h) this.drag = { mode: h, sx: x, sy: y, orig: { ...this.sel } };
      else if (this.sel && eng.tool === 'none' && this.inSel(x, y)) this.drag = { mode: 'move', sx: x, sy: y, orig: { ...this.sel } };
      else {
        if (eng.tool !== 'none') eng.setTool('none');
        this.drag = { mode: 'new', sx: x, sy: y, orig: null };
        this.sel = null;
        this.paintSel();
      }
      this.$.dim.hidden = true;
      this.updateLoupe();
    }

    pointerMove(e) {
      const { x, y } = this.pt(e);
      this.mouse = { x, y };
      const d = this.drag;
      if (d) {
        const minSz = 6;
        if (d.mode === 'new') {
          let w = x - d.sx, h = y - d.sy;
          if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
          const x2 = clamp(d.sx + w, 0, this.W), y2 = clamp(d.sy + h, 0, this.H);
          this.sel = { x: Math.min(d.sx, x2), y: Math.min(d.sy, y2), w: Math.abs(x2 - d.sx), h: Math.abs(y2 - d.sy) };
        } else if (d.mode === 'move') {
          const o = d.orig;
          this.sel = { x: clamp(o.x + x - d.sx, 0, this.W - o.w), y: clamp(o.y + y - d.sy, 0, this.H - o.h), w: o.w, h: o.h };
        } else {
          const o = d.orig;
          let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
          if (d.mode.includes('w')) l = clamp(x, 0, r - minSz);
          if (d.mode.includes('e')) r = clamp(x, l + minSz, this.W);
          if (d.mode.includes('n')) t = clamp(y, 0, b - minSz);
          if (d.mode.includes('s')) b = clamp(y, t + minSz, this.H);
          this.sel = { x: l, y: t, w: r - l, h: b - t };
        }
        this.paintSel();
      } else {
        this.updateCursor(x, y);
      }
      this.updateGuides();
      this.updateLoupe();
    }

    pointerUp(e) {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      try { this.rootEl.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
      if (d.mode === 'new' && this.sel && (this.sel.w < 5 || this.sel.h < 5)) {
        this.sel = null;
        this.$.dim.hidden = false;
      }
      this.paintSel();
      this.updateGuides();
      this.updateLoupe();
      if (this.sel) this.placeBar();
    }

    updateCursor(x, y) {
      const h = this.hitHandle(x, y);
      const map = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
      let c = 'crosshair';
      if (h) c = map[h];
      else if (this.sel && this.engine.tool === 'none' && this.inSel(x, y)) c = 'move';
      this.rootEl.style.cursor = c;
    }
    syncSelCursor() { this.updateCursor(this.mouse.x, this.mouse.y); }

    // ------------------------------------------------------------ painting
    paintSel() {
      const r = this.sel, el = this.$.sel;
      if (!r) { el.hidden = true; this.$.bar.hidden = true; return; }
      el.hidden = false;
      el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
      el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
      this.$.badge.textContent = `${Math.round(r.w * this.s)} × ${Math.round(r.h * this.s)}`;
      this.$.badge.classList.toggle('in', r.y < 40);
      if (this.drag) this.$.bar.hidden = true;
    }

    updateGuides() {
      const show = !this.sel || !!this.drag;
      this.$.gx.hidden = this.$.gy.hidden = !show;
      if (!show) return;
      this.$.gx.style.top = this.mouse.y + 'px';
      this.$.gy.style.left = this.mouse.x + 'px';
    }

    updateLoupe() {
      const show = !this.sel || !!this.drag;
      this.$.loupe.hidden = !show;
      if (!show) return;
      const { x, y } = this.mouse, s = this.s;
      const img = this.engine.img;
      const px = clamp(Math.round(x * s), 0, img.width - 1), py = clamp(Math.round(y * s), 0, img.height - 1);
      const N = 15, half = 7, L = 148;
      const c = this.lctx;
      c.imageSmoothingEnabled = false;
      c.fillStyle = '#0c0c16';
      c.fillRect(0, 0, L, L);
      c.drawImage(img, px - half, py - half, N, N, 0, 0, L, L);
      const cell = L / N;
      c.lineWidth = 2; c.strokeStyle = '#000';
      c.strokeRect(half * cell + 1, half * cell + 1, cell - 2, cell - 2);
      c.lineWidth = 1.5; c.strokeStyle = '#fff';
      c.strokeRect(half * cell, half * cell, cell, cell);
      this.pctx.clearRect(0, 0, 1, 1);
      this.pctx.drawImage(img, px, py, 1, 1, 0, 0, 1, 1);
      const d = this.pctx.getImageData(0, 0, 1, 1).data;
      this.colorHex = ('#' + hex2(d[0]) + hex2(d[1]) + hex2(d[2])).toUpperCase();
      const dims = this.drag && this.sel ? `${Math.round(this.sel.w * s)} × ${Math.round(this.sel.h * s)}` : `X ${Math.round(x)}  Y ${Math.round(y)}`;
      this.$.linfo.innerHTML = `<b><i style="background:${this.colorHex}"></i>${this.colorHex}</b><span>${dims}</span>${this.sel ? '' : '<span>Press C to copy colour</span>'}`;
      const lw = 148, lh = 148 + 62;
      let lx = x + 26, ly = y + 26;
      if (lx + lw > this.W - 6) lx = x - 26 - lw;
      if (ly + lh > this.H - 6) ly = y - 26 - lh;
      this.$.loupe.style.left = Math.max(6, lx) + 'px';
      this.$.loupe.style.top = Math.max(6, ly) + 'px';
    }

    // ------------------------------------------------------------ toolbar
    buildBar() {
      const eng = this.engine;
      const ui = SnapUI.build(eng, { toggle: true });
      const mk = (cls, html, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = cls; b.innerHTML = html; if (title) b.title = title;
        b.addEventListener('click', fn);
        return b;
      };
      const sep = () => { const d = document.createElement('i'); d.className = 'sep'; return d; };
      const row1 = document.createElement('div'); row1.className = 'row';
      row1.append(ui.tools, sep(), ui.history);
      const row2 = document.createElement('div'); row2.className = 'row';
      const sp = document.createElement('i'); sp.className = 'spacer';
      row2.append(ui.colors, sep(), ui.size, sp,
        mk('abtn sq', I.svg('open', 20), 'Open in full editor', () => this.doEdit()),
        mk('abtn', I.svg('download', 18) + 'Save', 'Save to Downloads (Ctrl+S)', () => this.doSave()),
        mk('abtn primary', I.svg('copy', 18) + 'Copy', 'Copy to clipboard (Ctrl+C / Enter)', () => this.doCopy()),
        mk('abtn sq x', I.svg('close', 20), 'Close (Esc)', () => this.close()));
      this.$.bar.append(row1, row2);
      this.$.bar.addEventListener('pointerdown', e => e.stopPropagation());
      this.ui = ui;
    }

    placeBar() {
      const r = this.sel, bar = this.$.bar;
      bar.hidden = false;
      const bw = bar.offsetWidth, bh = bar.offsetHeight, gap = 12;
      let x = r.x + r.w - bw;
      if (x < 8) x = r.x;
      x = clamp(x, 8, Math.max(8, this.W - bw - 8));
      let y = r.y + r.h + gap;
      if (y + bh > this.H - 8) {
        y = r.y - bh - gap;
        if (y < 8) y = clamp(r.y + r.h - bh - gap, 8, Math.max(8, this.H - bh - 8));
      }
      bar.style.left = x + 'px';
      bar.style.top = y + 'px';
    }

    // ------------------------------------------------------------ keyboard
    keyDown(e) {
      const eng = this.engine;
      if (eng.ta) { e.stopPropagation(); return; } // typing a text annotation
      const k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
      let handled = true;
      if (eng.handleKey(e)) { /* undo / redo / tools / delete */ }
      else if (k === 'escape') this.close();
      else if (mod && k === 'c' && this.sel) this.doCopy();
      else if (mod && k === 's' && this.sel) this.doSave();
      else if (k === 'enter' && this.sel) this.doCopy();
      else if (!mod && k === 'c' && (!this.sel || this.drag)) this.copyColor();
      else if ([' ', 'arrowup', 'arrowdown', 'pageup', 'pagedown', 'home', 'end'].includes(k)) handled = true;
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }

    // ------------------------------------------------------------ actions
    result() {
      const r = this.sel, s = this.s;
      return this.engine.exportCanvas({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s });
    }

    send(msg) {
      try { return chrome.runtime.sendMessage(msg); } catch (e) { this.toast('Extension was reloaded – refresh this page'); return Promise.resolve(null); }
    }

    persist(canvas, extra = {}) {
      return this.send({ type: 'store', dataUrl: canvas.toDataURL('image/png'), kind: 'area', title: document.title, url: location.href, dpr: this.s, ...extra });
    }

    flash() {
      const el = this.$.sel;
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }

    toast(text) {
      const t = this.$.toast;
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
    }

    async doCopy() {
      if (!this.sel) return;
      const c = this.result();
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.flash();
        this.toast('Copied to clipboard  ✓');
        this.persist(c);
        setTimeout(() => this.close(), 950);
      } catch (err) {
        this.toast('This page blocks clipboard access – opening editor');
        this.persist(c, { open: true });
        setTimeout(() => this.close(), 700);
      }
    }

    doSave() {
      if (!this.sel) return;
      const c = this.result();
      const fmt = this.msg.format || 'png';
      const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
      const d = new Date();
      const name = `Snaps_${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}.${fmt}`;
      this.flash();
      this.send({ type: 'download', dataUrl: c.toDataURL(mime, 0.94), filename: name });
      this.persist(c);
      this.toast('Saved to Downloads/Snaps  ✓');
      setTimeout(() => this.close(), 1000);
    }

    doEdit() {
      if (!this.sel) return;
      this.persist(this.result(), { open: true });
      this.close();
    }

    async copyColor() {
      try {
        await navigator.clipboard.writeText(this.colorHex);
        this.toast(`Copied ${this.colorHex}`);
      } catch (_) {
        this.toast(this.colorHex);
      }
    }

    close() {
      if (this._closed) return;
      this._closed = true;
      clearTimeout(this.hintTimer);
      clearTimeout(this.toastTimer);
      window.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('resize', this.onResize);
      try { this.engine.destroy(); } catch (_) { /* noop */ }
      this.host.remove();
      (this.fonts || []).forEach(f => { try { document.fonts.delete(f); } catch (_) { /* noop */ } });
      if (session === this) session = null;
    }
  }
})();
