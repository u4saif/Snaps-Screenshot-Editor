// Snaps annotation engine + reusable toolbar builder.
// Classic script. Used by the in-page overlay (content script) AND the editor page.
// Exposes globalThis.SnapEngine, globalThis.SnapUI, globalThis.SNAP_TOOLBAR_CSS.
(() => {
  'use strict';
  if (globalThis.SnapEngine) return;

  const FONT = '"Roboto","Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif';
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  const TOOLS = [
    { id: 'select', name: 'Move / edit', key: 'V' },
    { id: 'pen', name: 'Pen', key: 'P' },
    { id: 'highlighter', name: 'Highlighter', key: 'H' },
    { id: 'line', name: 'Line', key: 'L' },
    { id: 'arrow', name: 'Arrow', key: 'A' },
    { id: 'rect', name: 'Rectangle', key: 'R' },
    { id: 'ellipse', name: 'Ellipse', key: 'O' },
    { id: 'text', name: 'Text', key: 'T' },
    { id: 'number', name: 'Step number', key: 'N' },
    { id: 'stamp', name: 'Stamp (click again to change)', key: 'S' },
    { id: 'blur', name: 'Blur', key: 'B' },
    { id: 'pixel', name: 'Pixelate (safe redact)', key: 'X' }
  ];
  const COLORS = ['#ff3b5c', '#ff9f1a', '#ffd60a', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ffffff', '#111827'];
  const STAMPS = ['👍', '❗', '✅', '❌', '⭐', '🔥', '❓', '👀', '💡', '🎯'];

  // Solid backdrops for the Beautify option (flat colours – no gradients).
  const BACKDROPS = {
    navy:     { name: 'Navy',     color: '#0b2447' },
    blue:     { name: 'Blue',     color: '#2563eb' },
    indigo:   { name: 'Indigo',   color: '#4338ca' },
    teal:     { name: 'Teal',     color: '#0f766e' },
    emerald:  { name: 'Emerald',  color: '#047857' },
    slate:    { name: 'Slate',    color: '#334155' },
    charcoal: { name: 'Charcoal', color: '#18181b' },
    mist:     { name: 'Mist',     color: '#e2e8f0' },
    white:    { name: 'White',    color: '#ffffff' }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nrect = s => ({ x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) });

  function luminance(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function toCanvas(src) {
    if (src instanceof HTMLCanvasElement) return src;
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
    const c = makeCanvas(w, h);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  const distSeg = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', move: 'move' };

  class SnapEngine {
    constructor(opts) {
      this.opts = opts;
      this.stage = opts.stage;
      this.unit = opts.unit || 1;
      this.accent = opts.accent || '#2563eb';
      this.listeners = {};
      this.shapes = [];
      this.nid = 1;
      this.tool = opts.tool || 'pen';
      this.color = COLORS[0];
      this.size = 4;
      this.fill = false;
      this.stampIdx = 0;
      this.selected = null;
      this.cur = null;
      this.drag = null;
      this.undoStack = [];
      this.redoStack = [];
      this.beauty = { on: false, bg: 'navy', pad: 56, radius: 14, shadow: 34, frame: 'none' };
      this.cropping = false;
      this.cropRect = null;
      this.ox = 0; this.oy = 0; this.pad = 0; this.tb = 0;
      this.ta = null;

      this.img = toCanvas(opts.source);
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'sn-canvas';
      this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none;';
      this.ctx = this.canvas.getContext('2d');
      this.stage.appendChild(this.canvas);

      this._down = e => this.onDown(e);
      this._move = e => this.onMove(e);
      this._up = e => this.onUp(e);
      this._dbl = e => this.onDbl(e);
      this.canvas.addEventListener('pointerdown', this._down);
      this.canvas.addEventListener('pointermove', this._move);
      this.canvas.addEventListener('pointerup', this._up);
      this.canvas.addEventListener('pointercancel', this._up);
      this.canvas.addEventListener('dblclick', this._dbl);

      this.layout();
      this.render();
      this.updateCursor();
    }

    // ---------- tiny event emitter ----------
    on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return this; }
    emit(evt, data) { (this.listeners[evt] || []).forEach(fn => fn(data)); }

    destroy() {
      this.commitText();
      this.canvas.removeEventListener('pointerdown', this._down);
      this.canvas.removeEventListener('pointermove', this._move);
      this.canvas.removeEventListener('pointerup', this._up);
      this.canvas.removeEventListener('pointercancel', this._up);
      this.canvas.removeEventListener('dblclick', this._dbl);
      this.canvas.remove();
    }

    // ---------- geometry ----------
    get scale() {
      const r = this.canvas.getBoundingClientRect();
      return r.width ? this.canvas.width / r.width : 1;
    }

    toImg(e) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * this.canvas.width) / r.width - this.ox,
        y: ((e.clientY - r.top) * this.canvas.height) / r.height - this.oy
      };
    }

    layout() {
      const b = this.beauty, u = this.unit;
      let W = this.img.width, H = this.img.height;
      if (b.on) {
        this.pad = Math.round(b.pad * u);
        this.tb = b.frame !== 'none' ? Math.round(34 * u) : 0;
        this.ox = this.pad;
        this.oy = this.pad + this.tb;
        W += this.pad * 2;
        H += this.pad * 2 + this.tb;
      } else {
        this.pad = 0; this.tb = 0; this.ox = 0; this.oy = 0;
      }
      if (this.canvas.width !== W || this.canvas.height !== H) {
        this.canvas.width = W;
        this.canvas.height = H;
        this.emit('resize', { w: W, h: H });
      }
    }

    // ---------- tools & style ----------
    setTool(id) {
      if (this.cropping) this.cancelCrop();
      this.commitText();
      this.tool = id;
      if (id !== 'select') this.selected = null;
      this.render();
      this.updateCursor();
      this.emit('tool', id);
    }

    get stampChar() { return STAMPS[this.stampIdx % STAMPS.length]; }
    cycleStamp() { this.stampIdx = (this.stampIdx + 1) % STAMPS.length; this.emit('style'); }

    getSelected() { return this.shapes.find(s => s.id === this.selected) || null; }

    select(id) {
      this.selected = id;
      this._styleSnap = false;
      this.render();
      this.emit('select', id);
      const s = this.getSelected();
      if (s && s.color) { this.color = s.color; this.size = s.size || this.size; this.emit('style'); }
    }

    setColor(c) {
      this.color = c;
      const s = this.getSelected();
      if (s && s.type !== 'blur' && s.type !== 'pixel' && s.type !== 'stamp') {
        if (!this._styleSnap) { this.snapshot(); this._styleSnap = true; }
        s.color = c;
        this.emit('change');
      }
      this.render();
      this.emit('style');
    }

    setSize(v) {
      this.size = v;
      const s = this.getSelected();
      if (s) {
        if (!this._styleSnap) { this.snapshot(); this._styleSnap = true; }
        s.size = v;
        this.emit('change');
      }
      this.render();
      this.emit('style');
    }

    setFill(f) {
      this.fill = f;
      const s = this.getSelected();
      if (s && (s.type === 'rect' || s.type === 'ellipse')) {
        this.snapshot();
        s.fill = f;
        this.emit('change');
      }
      this.render();
      this.emit('style');
    }

    updateCursor() {
      const t = this.tool;
      this.canvas.style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : t === 'none' ? 'default' : 'crosshair';
    }

    // ---------- history ----------
    snapshot() {
      this._styleSnap = false;
      this.undoStack.push({ img: this.img, shapes: JSON.stringify(this.shapes) });
      if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack = [];
      this.emit('history');
    }

    restore(st) {
      this.img = st.img;
      this.shapes = JSON.parse(st.shapes);
      if (!this.shapes.some(s => s.id === this.selected)) this.selected = null;
      this.layout();
      this.render();
      this.emit('history');
      this.emit('change');
    }

    undo() {
      this.commitText();
      if (!this.undoStack.length) return;
      this.redoStack.push({ img: this.img, shapes: JSON.stringify(this.shapes) });
      this.restore(this.undoStack.pop());
    }

    redo() {
      this.commitText();
      if (!this.redoStack.length) return;
      this.undoStack.push({ img: this.img, shapes: JSON.stringify(this.shapes) });
      this.restore(this.redoStack.pop());
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    clearShapes() {
      if (!this.shapes.length) return;
      this.snapshot();
      this.shapes = [];
      this.selected = null;
      this.render();
      this.emit('change');
    }

    deleteSelected() {
      const s = this.getSelected();
      if (!s) return;
      this.snapshot();
      this.shapes = this.shapes.filter(x => x !== s);
      this.selected = null;
      this.render();
      this.emit('change');
    }

    // ---------- keyboard ----------
    handleKey(e) {
      if (this.ta) return false;
      const mod = e.ctrlKey || e.metaKey;
      const k = (e.key || '').toLowerCase();
      if (mod && k === 'z') { e.shiftKey ? this.redo() : this.undo(); return true; }
      if (mod && k === 'y') { this.redo(); return true; }
      if (this.cropping) {
        if (k === 'enter') { this.applyCrop(); return true; }
        if (k === 'escape') { this.cancelCrop(); return true; }
        return false;
      }
      if ((k === 'delete' || k === 'backspace') && this.selected != null) { this.deleteSelected(); return true; }
      if (k === 'escape' && this.selected != null) { this.select(null); return true; }
      if (!mod && !e.altKey && this.opts.hotkeys !== false) {
        const t = TOOLS.find(t => t.key.toLowerCase() === k);
        if (t) { this.setTool(t.id); return true; }
      }
      return false;
    }

    // ---------- shapes: sizing helpers ----------
    strokeW(s) { return s.size * this.unit; }
    fontSize(s) { return (12 + s.size * 2.5) * this.unit; }
    numR(s) { return (9 + s.size * 1.5) * this.unit; }
    stampSize(s) { return (18 + s.size * 5) * this.unit; }

    textMetrics(s) {
      const ctx = this.ctx;
      const fs = this.fontSize(s);
      ctx.save();
      ctx.font = `700 ${fs}px ${FONT}`;
      const lines = String(s.text).split('\n');
      const w = Math.max(...lines.map(l => ctx.measureText(l).width));
      ctx.restore();
      return { w, h: lines.length * fs * 1.22, fs, lines };
    }

    bbox(s) {
      switch (s.type) {
        case 'pen': case 'highlighter': {
          const xs = s.pts.map(p => p.x), ys = s.pts.map(p => p.y);
          const x = Math.min(...xs), y = Math.min(...ys);
          return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
        }
        case 'line': case 'arrow':
          return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
        case 'rect': case 'ellipse': case 'blur': case 'pixel':
          return nrect(s);
        case 'text': { const m = this.textMetrics(s); return { x: s.x, y: s.y, w: m.w, h: m.h }; }
        case 'number': { const r = this.numR(s); return { x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 }; }
        case 'stamp': { const z = this.stampSize(s); return { x: s.x - z * 0.6, y: s.y - z * 0.6, w: z * 1.2, h: z * 1.2 }; }
      }
      return { x: 0, y: 0, w: 0, h: 0 };
    }

    hit(s, x, y) {
      const tol = 7 * this.unit;
      if (s.type === 'pen' || s.type === 'highlighter') {
        const w = this.strokeW(s) * (s.type === 'highlighter' ? 3.5 : 1) / 2 + tol;
        if (s.pts.length === 1) return Math.hypot(x - s.pts[0].x, y - s.pts[0].y) <= w;
        for (let i = 1; i < s.pts.length; i++) {
          if (distSeg(x, y, s.pts[i - 1].x, s.pts[i - 1].y, s.pts[i].x, s.pts[i].y) <= w) return true;
        }
        return false;
      }
      if (s.type === 'line' || s.type === 'arrow') return distSeg(x, y, s.x1, s.y1, s.x2, s.y2) <= this.strokeW(s) / 2 + tol;
      const b = this.bbox(s);
      return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
    }

    translate(s, dx, dy) {
      if (s.pts) s.pts.forEach(p => { p.x += dx; p.y += dy; });
      if ('x1' in s) { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
      if ('x' in s) { s.x += dx; s.y += dy; }
    }

    // ---------- drawing ----------
    drawShape(ctx, s) {
      if (s.hidden) return;
      const u = this.unit;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      switch (s.type) {
        case 'pen':
        case 'highlighter': {
          const hl = s.type === 'highlighter';
          ctx.strokeStyle = s.color;
          ctx.fillStyle = s.color;
          ctx.lineWidth = this.strokeW(s) * (hl ? 3.5 : 1);
          if (hl) { ctx.globalAlpha = 0.4; ctx.lineCap = 'square'; }
          const p = s.pts;
          if (p.length === 1) {
            ctx.beginPath(); ctx.arc(p[0].x, p[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.beginPath();
            ctx.moveTo(p[0].x, p[0].y);
            for (let i = 1; i < p.length - 1; i++) {
              ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2);
            }
            ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y);
            ctx.stroke();
          }
          break;
        }
        case 'line':
          ctx.strokeStyle = s.color; ctx.lineWidth = this.strokeW(s);
          ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
          break;
        case 'arrow': {
          const w = this.strokeW(s);
          const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
          const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
          const hl = Math.min(len * 0.9, Math.max(14 * u, w * 4.2));
          ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = w;
          const bx = s.x2 - Math.cos(ang) * hl * 0.7, by = s.y2 - Math.sin(ang) * hl * 0.7;
          ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(bx, by); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s.x2, s.y2);
          ctx.lineTo(s.x2 - hl * Math.cos(ang - 0.45), s.y2 - hl * Math.sin(ang - 0.45));
          ctx.lineTo(s.x2 - hl * Math.cos(ang + 0.45), s.y2 - hl * Math.sin(ang + 0.45));
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'rect': {
          const r = nrect(s);
          ctx.beginPath(); rr(ctx, r.x, r.y, r.w, r.h, 4 * u);
          if (s.fill) { ctx.fillStyle = s.color; ctx.fill(); }
          else { ctx.strokeStyle = s.color; ctx.lineWidth = this.strokeW(s); ctx.stroke(); }
          break;
        }
        case 'ellipse': {
          const r = nrect(s);
          ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w / 2, 0.1), Math.max(r.h / 2, 0.1), 0, 0, Math.PI * 2);
          if (s.fill) { ctx.fillStyle = s.color; ctx.fill(); }
          else { ctx.strokeStyle = s.color; ctx.lineWidth = this.strokeW(s); ctx.stroke(); }
          break;
        }
        case 'text': {
          const m = this.textMetrics(s);
          ctx.font = `700 ${m.fs}px ${FONT}`;
          ctx.textBaseline = 'top';
          ctx.fillStyle = s.color;
          if (luminance(s.color) > 0.35) { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 4 * u; ctx.shadowOffsetY = 1 * u; }
          m.lines.forEach((l, i) => ctx.fillText(l, s.x, s.y + i * m.fs * 1.22));
          break;
        }
        case 'number': {
          const r = this.numR(s);
          ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6 * u; ctx.shadowOffsetY = 2 * u;
          ctx.fillStyle = s.color;
          ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
          ctx.fillStyle = luminance(s.color) > 0.72 ? '#111827' : '#fff';
          ctx.font = `800 ${r * 1.15}px ${FONT}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(s.n), s.x, s.y + r * 0.06);
          break;
        }
        case 'stamp': {
          ctx.font = `${this.stampSize(s)}px ${EMOJI_FONT}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(s.e, s.x, s.y);
          break;
        }
        case 'blur': {
          const r = nrect(s);
          if (r.w < 1 || r.h < 1) break;
          const rad = (4 + s.size * 2) * u;
          const m = rad * 3;
          const sx = clamp(r.x - m, 0, this.img.width), sy = clamp(r.y - m, 0, this.img.height);
          const ex = clamp(r.x + r.w + m, 0, this.img.width), ey = clamp(r.y + r.h + m, 0, this.img.height);
          ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
          ctx.filter = `blur(${rad}px)`;
          ctx.drawImage(this.img, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
          break;
        }
        case 'pixel': {
          const r = nrect(s);
          if (r.w < 1 || r.h < 1) break;
          const block = Math.max(4, (4 + s.size * 2) * u);
          const sw = Math.max(1, Math.ceil(r.w / block)), sh = Math.max(1, Math.ceil(r.h / block));
          const t = this._tmp || (this._tmp = makeCanvas(8, 8));
          t.width = sw; t.height = sh;
          const tc = t.getContext('2d');
          tc.imageSmoothingEnabled = true;
          tc.drawImage(this.img, r.x, r.y, r.w, r.h, 0, 0, sw, sh);
          ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(t, 0, 0, sw, sh, r.x, r.y, sw * block, sh * block);
          break;
        }
      }
      ctx.restore();
    }

    render() { this.paint(this.ctx, true); }

    paint(ctx, ui) {
      const b = this.beauty, u = this.unit;
      const W = this.canvas.width, H = this.canvas.height;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      if (b.on) {
        const g = BACKDROPS[b.bg];
        if (g) { ctx.fillStyle = g.color; ctx.fillRect(0, 0, W, H); }
        const cx = this.pad, cy = this.pad, cw = this.img.width, ch = this.img.height + this.tb, r = b.radius * u;
        if (b.shadow > 0) {
          ctx.save();
          ctx.shadowColor = 'rgba(8,8,28,.5)';
          ctx.shadowBlur = b.shadow * u * 1.6;
          ctx.shadowOffsetY = b.shadow * u * 0.55;
          ctx.fillStyle = '#000';
          ctx.beginPath(); rr(ctx, cx, cy, cw, ch, r); ctx.fill();
          ctx.restore();
        }
        ctx.beginPath(); rr(ctx, cx, cy, cw, ch, r); ctx.clip();
        if (this.tb) {
          ctx.fillStyle = b.frame === 'dark' ? '#1c1c28' : '#eceef3';
          ctx.fillRect(cx, cy, cw, this.tb);
          ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
            ctx.fillStyle = c; ctx.beginPath();
            ctx.arc(cx + (18 + i * 20) * u, cy + this.tb / 2, 6 * u, 0, Math.PI * 2); ctx.fill();
          });
        }
      }
      ctx.translate(this.ox, this.oy);
      ctx.drawImage(this.img, 0, 0);
      for (const s of this.shapes) this.drawShape(ctx, s);
      if (this.cur) this.drawShape(ctx, this.cur);
      if (ui) {
        const sel = this.getSelected();
        if (sel && !sel.hidden) {
          const bb = this.bbox(sel), pd = 6 * u;
          ctx.setLineDash([]);
          ctx.lineWidth = 3 * u; ctx.strokeStyle = 'rgba(0,0,0,.45)';
          ctx.strokeRect(bb.x - pd, bb.y - pd, bb.w + pd * 2, bb.h + pd * 2);
          ctx.setLineDash([7 * u, 5 * u]);
          ctx.lineWidth = 1.6 * u; ctx.strokeStyle = '#fff';
          ctx.strokeRect(bb.x - pd, bb.y - pd, bb.w + pd * 2, bb.h + pd * 2);
          ctx.setLineDash([]);
        }
        if (this.cropping && this.cropRect) this.paintCrop(ctx);
      }
      ctx.restore();
    }

    paintCrop(ctx) {
      const u = this.unit, r = this.cropRect, iw = this.img.width, ih = this.img.height;
      ctx.fillStyle = 'rgba(6,6,16,.62)';
      ctx.fillRect(0, 0, iw, r.y);
      ctx.fillRect(0, r.y + r.h, iw, ih - r.y - r.h);
      ctx.fillRect(0, r.y, r.x, r.h);
      ctx.fillRect(r.x + r.w, r.y, iw - r.x - r.w, r.h);
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2 * u;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1 * u;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(r.x + (r.w * i) / 3, r.y); ctx.lineTo(r.x + (r.w * i) / 3, r.y + r.h);
        ctx.moveTo(r.x, r.y + (r.h * i) / 3); ctx.lineTo(r.x + r.w, r.y + (r.h * i) / 3);
      }
      ctx.stroke();
      const k = this.scale; // image px per screen px -> keeps UI a constant on-screen size
      HANDLES.forEach(h => {
        const p = this.handlePos(r, h);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = this.accent; ctx.lineWidth = 2.5 * k;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
      // size label
      const label = `${Math.round(r.w)} × ${Math.round(r.h)}`;
      ctx.font = `700 ${12 * k}px ${FONT}`;
      const tw = ctx.measureText(label).width, ph = 22 * k;
      const lx = r.x, ly = r.y > ph + 8 * k ? r.y - ph - 6 * k : r.y + 6 * k;
      ctx.fillStyle = 'rgba(14,14,26,.92)';
      ctx.beginPath(); rr(ctx, lx, ly, tw + 18 * k, ph, ph / 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(label, lx + 9 * k, ly + ph / 2 + 0.5);
    }

    handlePos(r, h) {
      const xs = { w: r.x, e: r.x + r.w, n: r.x + r.w / 2, s: r.x + r.w / 2 };
      const ys = { n: r.y, s: r.y + r.h, w: r.y + r.h / 2, e: r.y + r.h / 2 };
      const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : xs[h];
      const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : ys[h];
      return { x, y };
    }

    // ---------- pointer handling ----------
    onDown(e) {
      if (e.button !== 0) return;
      const p = this.toImg(e);
      if (this.cropping) { this.cropDown(e, p); return; }
      if (this.tool === 'none') return;
      if (this.opts.canDraw && !this.opts.canDraw(p.x, p.y)) return;
      this.commitText();
      const t = this.tool;
      const mk = () => ({ id: this.nid++, type: t, color: this.color, size: this.size });
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);

      if (t === 'select') {
        let hitShape = null;
        for (let i = this.shapes.length - 1; i >= 0; i--) if (this.hit(this.shapes[i], p.x, p.y)) { hitShape = this.shapes[i]; break; }
        this.select(hitShape ? hitShape.id : null);
        if (hitShape) this.drag = { last: p, moved: false, shape: hitShape };
        return;
      }
      if (t === 'text') { this.beginText(p); return; }
      if (t === 'number') {
        this.snapshot();
        const n = Math.max(0, ...this.shapes.filter(s => s.type === 'number').map(s => s.n)) + 1;
        this.shapes.push({ ...mk(), x: p.x, y: p.y, n });
        this.render(); this.emit('change');
        return;
      }
      if (t === 'stamp') {
        this.snapshot();
        this.shapes.push({ ...mk(), x: p.x, y: p.y, e: this.stampChar });
        this.render(); this.emit('change');
        return;
      }
      if (t === 'pen' || t === 'highlighter') this.cur = { ...mk(), pts: [p] };
      else if (t === 'line' || t === 'arrow') this.cur = { ...mk(), x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      else if (t === 'rect' || t === 'ellipse') this.cur = { ...mk(), fill: this.fill, x: p.x, y: p.y, w: 0, h: 0 };
      else if (t === 'blur' || t === 'pixel') this.cur = { ...mk(), x: p.x, y: p.y, w: 0, h: 0 };
      this.drag = { start: p, last: p };
    }

    onMove(e) {
      if (this.cropping) { this.cropMove(e); return; }
      if (!this.drag) return;
      const p = this.toImg(e);
      if (this.cur) {
        const s = this.cur, shift = e.shiftKey, st = this.drag.start;
        if (s.pts) {
          const last = s.pts[s.pts.length - 1];
          if (Math.hypot(p.x - last.x, p.y - last.y) > 1.2 * this.unit) s.pts.push(p);
        } else if ('x1' in s) {
          let x = p.x, y = p.y;
          if (shift) {
            const dx = x - s.x1, dy = y - s.y1, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
            x = s.x1 + Math.cos(a) * l; y = s.y1 + Math.sin(a) * l;
          }
          s.x2 = x; s.y2 = y;
        } else {
          let w = p.x - st.x, h = p.y - st.y;
          if (shift && (s.type === 'rect' || s.type === 'ellipse')) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
          s.w = w; s.h = h;
        }
        this.render();
      } else if (this.drag.shape) {
        const dx = p.x - this.drag.last.x, dy = p.y - this.drag.last.y;
        if (!this.drag.moved && Math.hypot(dx, dy) < 2 * this.unit) return;
        if (!this.drag.moved) { this.snapshot(); this.drag.moved = true; }
        this.translate(this.drag.shape, dx, dy);
        this.drag.last = p;
        this.render();
      }
    }

    onUp() {
      if (this.cropping) { this.cropUp(); return; }
      const u = this.unit;
      if (this.cur) {
        const s = this.cur;
        this.cur = null;
        let ok = true;
        if ('x1' in s) ok = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 4 * u;
        else if (!s.pts) ok = Math.abs(s.w) > 3 * u && Math.abs(s.h) > 3 * u;
        if (ok) { this.snapshot(); this.shapes.push(s); this.emit('change'); }
        this.render();
      }
      this.drag = null;
    }

    onDbl(e) {
      if (this.tool !== 'select' || this.cropping) return;
      const p = this.toImg(e);
      for (let i = this.shapes.length - 1; i >= 0; i--) {
        const s = this.shapes[i];
        if (s.type === 'text' && this.hit(s, p.x, p.y)) { this.beginText({ x: s.x, y: s.y }, s); return; }
      }
    }

    // ---------- text tool ----------
    beginText(p, existing) {
      this.commitText();
      const sc = this.scale, cr = this.canvas.getBoundingClientRect(), sr = this.stage.getBoundingClientRect();
      const shape = existing || { id: this.nid++, type: 'text', color: this.color, size: this.size, x: p.x, y: p.y, text: '' };
      const fs = this.fontSize(shape);
      if (existing) existing.hidden = true;
      this.render();
      const ta = document.createElement('textarea');
      ta.className = 'sn-textedit';
      ta.value = existing ? existing.text : '';
      ta.spellcheck = false;
      ta.placeholder = 'Type…';
      ta.rows = 1;
      ta.style.cssText = [
        'position:absolute', 'z-index:20', 'margin:0', 'padding:2px 4px', 'resize:none', 'overflow:hidden',
        'white-space:pre', 'outline:none', 'background:rgba(0,0,0,.18)', 'border-radius:4px',
        `border:1.5px dashed ${this.accent}`, `color:${shape.color}`, `font:700 ${fs / sc}px/1.22 ${FONT}`,
        `left:${cr.left - sr.left + (p.x + this.ox) / sc - 5.5}px`, `top:${cr.top - sr.top + (p.y + this.oy) / sc - 3.5}px`,
        'min-width:70px', 'box-sizing:content-box'
      ].join(';');
      const fit = () => {
        const lines = ta.value.split('\n');
        const c = this._mc || (this._mc = document.createElement('canvas').getContext('2d'));
        c.font = `700 ${fs / sc}px ${FONT}`;
        const w = Math.max(60, ...lines.map(l => c.measureText(l || ' ').width)) + 6;
        ta.style.width = w + 'px';
        ta.style.height = lines.length * (fs / sc) * 1.22 + 'px';
      };
      ta.addEventListener('input', fit);
      ta.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); this.commitText(); }
        else if (ev.key === 'Escape') { ev.preventDefault(); this.cancelText(); }
      });
      ta.addEventListener('blur', () => this.commitText());
      this.stage.appendChild(ta);
      this.ta = ta;
      this.editShape = shape;
      this.editExisting = !!existing;
      fit();
      setTimeout(() => { ta.focus(); ta.select(); }, 30);
    }

    commitText() {
      const ta = this.ta;
      if (!ta) return;
      this.ta = null;
      const text = ta.value.replace(/\s+$/, '');
      const shape = this.editShape;
      this.editShape = null;
      ta.remove();
      shape.hidden = false;
      if (this.editExisting) {
        if (!text) { this.snapshot(); this.shapes = this.shapes.filter(s => s !== shape); }
        else if (text !== shape.text) { this.snapshot(); shape.text = text; }
      } else if (text) {
        this.snapshot();
        shape.text = text;
        this.shapes.push(shape);
      }
      this.render();
      this.emit('change');
    }

    cancelText() {
      const ta = this.ta;
      if (!ta) return;
      this.ta = null;
      ta.remove();
      if (this.editShape) this.editShape.hidden = false;
      this.editShape = null;
      this.render();
    }

    // ---------- crop ----------
    startCrop() {
      this.commitText();
      this.select(null);
      const iw = this.img.width, ih = this.img.height;
      this.cropping = true;
      this.cropRect = { x: Math.round(iw * 0.08), y: Math.round(ih * 0.08), w: Math.round(iw * 0.84), h: Math.round(ih * 0.84) };
      this.canvas.style.cursor = 'crosshair';
      this.render();
      this.emit('crop', true);
    }

    cancelCrop() {
      if (!this.cropping) return;
      this.cropping = false; this.cropRect = null; this.cdrag = null;
      this.updateCursor();
      this.render();
      this.emit('crop', false);
    }

    applyCrop() {
      if (!this.cropping) return;
      const iw = this.img.width, ih = this.img.height, r = this.cropRect;
      const x = clamp(Math.round(r.x), 0, iw - 1), y = clamp(Math.round(r.y), 0, ih - 1);
      const w = clamp(Math.round(r.w), 1, iw - x), h = clamp(Math.round(r.h), 1, ih - y);
      this.snapshot();
      const c = makeCanvas(w, h);
      c.getContext('2d').drawImage(this.img, x, y, w, h, 0, 0, w, h);
      this.shapes.forEach(s => this.translate(s, -x, -y));
      this.img = c;
      this.cropping = false; this.cropRect = null; this.cdrag = null;
      this.updateCursor();
      this.layout();
      this.render();
      this.emit('crop', false);
      this.emit('change');
    }

    cropHit(p) {
      const r = this.cropRect, tol = 14 * this.scale;
      for (const h of HANDLES) {
        const hp = this.handlePos(r, h);
        if (Math.hypot(p.x - hp.x, p.y - hp.y) <= tol) return h;
      }
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return 'move';
      return null;
    }

    cropDown(e, p) {
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      const hit = this.cropHit(p);
      if (hit) this.cdrag = { mode: hit, start: p, orig: { ...this.cropRect } };
      else this.cdrag = { mode: 'new', start: p, orig: { ...this.cropRect } };
    }

    cropMove(e) {
      const p = this.toImg(e);
      const iw = this.img.width, ih = this.img.height;
      if (!this.cdrag) {
        const h = this.cropHit(p);
        this.canvas.style.cursor = h ? HANDLE_CURSOR[h] : 'crosshair';
        return;
      }
      const d = this.cdrag, o = d.orig, min = 16 * this.unit;
      let { x, y, w, h } = o;
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (d.mode === 'move') {
        x = clamp(o.x + dx, 0, iw - o.w); y = clamp(o.y + dy, 0, ih - o.h);
      } else if (d.mode === 'new') {
        const x1 = clamp(d.start.x, 0, iw), y1 = clamp(d.start.y, 0, ih), x2 = clamp(p.x, 0, iw), y2 = clamp(p.y, 0, ih);
        x = Math.min(x1, x2); y = Math.min(y1, y2); w = Math.abs(x2 - x1); h = Math.abs(y2 - y1);
      } else {
        let l = o.x, t = o.y, r = o.x + o.w, b = o.y + o.h;
        if (d.mode.includes('w')) l = clamp(o.x + dx, 0, r - min);
        if (d.mode.includes('e')) r = clamp(o.x + o.w + dx, l + min, iw);
        if (d.mode.includes('n')) t = clamp(o.y + dy, 0, b - min);
        if (d.mode.includes('s')) b = clamp(o.y + o.h + dy, t + min, ih);
        x = l; y = t; w = r - l; h = b - t;
      }
      this.cropRect = { x, y, w, h };
      this.render();
    }

    cropUp() {
      if (this.cdrag && this.cdrag.mode === 'new' && (this.cropRect.w < 16 || this.cropRect.h < 16)) this.cropRect = { ...this.cdrag.orig };
      this.cdrag = null;
      this.render();
    }

    // ---------- image transforms (flatten annotations) ----------
    flatten() {
      const c = makeCanvas(this.img.width, this.img.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(this.img, 0, 0);
      this.shapes.forEach(s => this.drawShape(ctx, s));
      return c;
    }

    transform(kind) {
      this.commitText();
      const src = this.flatten();
      const w = src.width, h = src.height;
      let out, ctx;
      if (kind === 'rotL' || kind === 'rotR') {
        out = makeCanvas(h, w); ctx = out.getContext('2d');
        ctx.translate(kind === 'rotR' ? h : 0, kind === 'rotR' ? 0 : w);
        ctx.rotate(kind === 'rotR' ? Math.PI / 2 : -Math.PI / 2);
      } else {
        out = makeCanvas(w, h); ctx = out.getContext('2d');
        if (kind === 'flipH') { ctx.translate(w, 0); ctx.scale(-1, 1); }
        else { ctx.translate(0, h); ctx.scale(1, -1); }
      }
      ctx.drawImage(src, 0, 0);
      this.snapshot();
      this.img = out;
      this.shapes = [];
      this.selected = null;
      this.layout();
      this.render();
      this.emit('change');
    }

    // ---------- beautify ----------
    setBeauty(patch) {
      Object.assign(this.beauty, patch);
      this.layout();
      this.render();
      this.emit('beauty');
    }

    // ---------- export ----------
    exportCanvas(crop) {
      const W = this.canvas.width, H = this.canvas.height;
      this.commitText();
      const sel = this.selected; this.selected = null;
      let c;
      if (crop) {
        const x = clamp(Math.round(crop.x), 0, W - 1), y = clamp(Math.round(crop.y), 0, H - 1);
        const w = clamp(Math.round(crop.w), 1, W - x), h = clamp(Math.round(crop.h), 1, H - y);
        c = makeCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.translate(-x, -y);
        this.paint(ctx, false);
      } else {
        c = makeCanvas(W, H);
        this.paint(c.getContext('2d'), false);
      }
      this.selected = sel;
      return c;
    }

    toBlob(type = 'image/png', quality = 0.92, crop) {
      let c = this.exportCanvas(crop);
      if (type === 'image/jpeg') {
        const flat = makeCanvas(c.width, c.height);
        const f = flat.getContext('2d');
        f.fillStyle = '#fff'; f.fillRect(0, 0, c.width, c.height); f.drawImage(c, 0, 0);
        c = flat;
      }
      return new Promise(res => c.toBlob(res, type, quality));
    }
  }

  // =====================================================================
  // Toolbar builder – shared by overlay and editor
  // =====================================================================
  const SnapUI = {
    build(engine, opts = {}) {
      const I = globalThis.SNAP_ICONS;
      const toggle = !!opts.toggle;
      const tools = opts.tools || TOOLS.map(t => t.id);
      const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

      // tools
      const toolsEl = el('div', 'sn-tools');
      const toolBtns = {};
      TOOLS.filter(t => tools.includes(t.id)).forEach(t => {
        const b = el('button', 'sn-tool', t.id === 'stamp' ? `<span class="sn-emoji">${engine.stampChar}</span>` : I.svg(t.id, 22));
        b.type = 'button';
        b.dataset.tool = t.id;
        b.title = `${t.name} (${t.key})`;
        b.addEventListener('click', () => {
          if (t.id === 'stamp' && engine.tool === 'stamp') { engine.cycleStamp(); return; }
          engine.setTool(toggle && engine.tool === t.id ? 'none' : t.id);
        });
        toolBtns[t.id] = b;
        toolsEl.appendChild(b);
      });

      // colors
      const colorsEl = el('div', 'sn-colors');
      const swatches = COLORS.map(c => {
        const b = el('button', 'sn-swatch');
        b.type = 'button'; b.style.setProperty('--c', c); b.title = c; b.dataset.color = c;
        b.addEventListener('click', () => engine.setColor(c));
        colorsEl.appendChild(b);
        return b;
      });
      const custom = el('label', 'sn-swatch sn-custom', '<input type="color" aria-label="Custom colour">');
      custom.title = 'Custom colour';
      const cin = custom.querySelector('input');
      cin.value = '#ff3b5c';
      cin.addEventListener('input', () => engine.setColor(cin.value));
      colorsEl.appendChild(custom);

      // size + fill
      const sizeEl = el('div', 'sn-size');
      const dot = el('span', 'sn-sizedot');
      const range = el('input', 'sn-range');
      range.type = 'range'; range.min = 1; range.max = 16; range.step = 1; range.value = engine.size; range.title = 'Size';
      range.addEventListener('input', () => engine.setSize(+range.value));
      const fillBtn = el('button', 'sn-tool sn-fill', I.svg('fill', 20));
      fillBtn.type = 'button'; fillBtn.title = 'Fill shapes';
      fillBtn.addEventListener('click', () => engine.setFill(!engine.fill));
      sizeEl.append(dot, range, fillBtn);

      // history
      const histEl = el('div', 'sn-history');
      const undoB = el('button', 'sn-tool', I.svg('undo', 22));
      const redoB = el('button', 'sn-tool', I.svg('redo', 22));
      undoB.type = redoB.type = 'button';
      undoB.title = 'Undo (Ctrl+Z)'; redoB.title = 'Redo (Ctrl+Shift+Z)';
      undoB.addEventListener('click', () => engine.undo());
      redoB.addEventListener('click', () => engine.redo());
      histEl.append(undoB, redoB);

      const refresh = () => {
        for (const id in toolBtns) toolBtns[id].classList.toggle('active', engine.tool === id);
        if (toolBtns.stamp) toolBtns.stamp.querySelector('.sn-emoji').textContent = engine.stampChar;
        swatches.forEach(s => s.classList.toggle('active', s.dataset.color.toLowerCase() === engine.color.toLowerCase()));
        custom.classList.toggle('active', !swatches.some(s => s.dataset.color.toLowerCase() === engine.color.toLowerCase()));
        if (/^#[0-9a-f]{6}$/i.test(engine.color)) cin.value = engine.color;
        custom.style.setProperty('--c', engine.color);
        range.value = engine.size;
        const d = Math.round(4 + engine.size * 1.1);
        dot.style.width = dot.style.height = d + 'px';
        dot.style.background = engine.color;
        fillBtn.classList.toggle('active', engine.fill);
        undoB.disabled = !engine.canUndo;
        redoB.disabled = !engine.canRedo;
      };
      engine.on('tool', refresh).on('style', refresh).on('history', refresh).on('select', refresh);
      refresh();
      return { tools: toolsEl, colors: colorsEl, size: sizeEl, history: histEl, refresh };
    }
  };

  const TOOLBAR_CSS = `
.sn-tools,.sn-colors,.sn-size,.sn-history{display:flex;align-items:center;gap:2px}
.sn-tool{position:relative;overflow:hidden;width:36px;height:36px;flex:none;border-radius:50%;border:0;background:transparent;color:var(--sn-icon,rgba(0,0,0,.6));cursor:pointer;display:grid;place-items:center;transition:background-color .15s,color .15s;padding:0}
.sn-tool:hover:not(:disabled){background:var(--sn-hover,rgba(0,0,0,.06))}
.sn-tool:disabled{opacity:.38;cursor:default}
.sn-tool.active{background:var(--sn-active-bg,rgba(25,118,210,.14));color:var(--sn-active-fg,#1976d2)}
.sn-emoji{font-size:19px;line-height:1;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
.sn-colors{gap:6px}
.sn-swatch{width:20px;height:20px;flex:none;border-radius:50%;border:0;padding:0;cursor:pointer;background:var(--c);position:relative;box-shadow:inset 0 0 0 1px var(--sn-ring,rgba(0,0,0,.24));transition:transform .12s}
.sn-swatch:hover{transform:scale(1.15)}
.sn-swatch.active{box-shadow:0 0 0 2px var(--panel,#fff),0 0 0 4px var(--a1,#1976d2)}
.sn-custom{display:block;overflow:hidden;background:transparent;color:var(--sn-icon,rgba(0,0,0,.6));font:500 16px/20px system-ui,sans-serif;text-align:center}
.sn-custom::after{content:'+';pointer-events:none}
.sn-custom.active{background:var(--c)}
.sn-custom.active::after{content:''}
.sn-custom input{position:absolute;inset:-6px;opacity:0;width:200%;height:200%;cursor:pointer}
.sn-size{gap:10px;padding:0 4px}
.sn-sizedot{display:block;flex:none;border-radius:50%;background:var(--sn-icon,#666);transition:all .1s;min-width:5px;min-height:5px}
.sn-range{accent-color:var(--a1,#1976d2);width:96px;margin:0;cursor:pointer}
.sn-fill{width:30px;height:30px}
`;

  globalThis.SnapEngine = SnapEngine;
  globalThis.SnapUI = SnapUI;
  globalThis.SNAP_TOOLBAR_CSS = TOOLBAR_CSS;
  globalThis.SNAP_META = { TOOLS, COLORS, STAMPS, BACKDROPS, luminance };
})();
