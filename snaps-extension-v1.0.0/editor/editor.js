import { getShot, addShot } from '../lib/db.js';
import { getSettings, setSettings, applyAccent, fileName, ACCENTS } from '../lib/settings.js';

const I = window.SNAP_ICONS;
const { BACKDROPS } = window.SNAP_META;
const $ = (s, r = document) => r.querySelector(s);

// shared toolbar styles
const st = document.createElement('style');
st.textContent = window.SNAP_TOOLBAR_CSS;
document.head.appendChild(st);

const params = new URLSearchParams(location.search);
const shotId = params.get('id');

let settings, engine, shot = null, zoom = 1, fitMode = true, fmt = 'png';
const stage = $('#stage'), wrap = $('#wrap');

// ------------------------------------------------------------------ helpers
let toastTimer;
function toast(text, ms = 2200) {
  $('#toastText').textContent = text;
  const t = $('#toast');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

const mime = f => ({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' })[f];

function fillIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = I.svg(el.dataset.icon, 20); });
  const set = (id, name, size = 24) => { $(id).innerHTML = I.svg(name, size); };
  set('#btnCrop', 'crop'); set('#btnRotL', 'rotateL'); set('#btnRotR', 'rotateR'); set('#btnFlipH', 'flip');
  set('#btnClear', 'trash'); set('#btnSave', 'save'); set('#btnGallery', 'gallery');
  set('#zOut', 'zoomOut', 20); set('#zIn', 'zoomIn', 20);
  $('#zFit').innerHTML = I.svg('fit', 18) + ' Fit';
}

// ------------------------------------------------------------------ load image
async function blobToCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

async function loadBlob(blob, meta = null) {
  const canvas = await blobToCanvas(blob);
  shot = meta;
  $('#empty').hidden = true;
  $('#host').hidden = false;
  if (engine) { engine.destroy(); stage.innerHTML = ''; }
  const unit = meta && meta.dpr >= 1 ? meta.dpr : Math.min(3, Math.max(1, Math.round(canvas.width / 1400)));
  engine = new SnapEngine({ stage, source: canvas, unit, accent: ACCENTS[settings.accent][0], tool: 'arrow' });
  engine.on('resize', () => { fitMode ? fit() : applyZoom(); updateInfo(); });
  engine.on('crop', active => { $('#cropbar').hidden = !active; $('#btnCrop').classList.toggle('on', active); });
  engine.on('beauty', syncBeauty);
  buildToolbars();
  fit();
  updateInfo();
  syncBeauty();
}

function showEmpty() {
  $('#host').hidden = true;
  $('#empty').hidden = false;
  $('#meta').textContent = '';
}

// ------------------------------------------------------------------ toolbars
function buildToolbars() {
  const ui = SnapUI.build(engine);
  const side = $('#side');
  side.innerHTML = '';
  const sep = document.createElement('i'); sep.className = 'sn-sep';
  side.append(ui.tools, sep, ui.history);
  const host = $('#styleHost');
  host.innerHTML = '';
  host.append(ui.colors, ui.size);
  ui.refresh();
}

// ------------------------------------------------------------------ zoom
function applyZoom() {
  if (!engine) return;
  const W = engine.canvas.width, H = engine.canvas.height;
  stage.style.width = Math.round(W * zoom) + 'px';
  stage.style.height = Math.round(H * zoom) + 'px';
  $('#zLabel').textContent = Math.round(zoom * 100) + '%';
}

function fit() {
  if (!engine) return;
  fitMode = true;
  const W = engine.canvas.width, H = engine.canvas.height;
  const availW = wrap.clientWidth - 48, availH = wrap.clientHeight - 48;
  let z = H / W > 2.4 ? availW / W : Math.min(availW / W, availH / H);
  zoom = Math.max(0.03, Math.min(1, z));
  applyZoom();
}

function setZoom(z, anchor = true) {
  if (!engine) return;
  fitMode = false;
  const oldW = stage.offsetWidth || 1, oldH = stage.offsetHeight || 1;
  const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / oldW, cy = (wrap.scrollTop + wrap.clientHeight / 2) / oldH;
  zoom = Math.max(0.03, Math.min(6, z));
  applyZoom();
  if (anchor) {
    wrap.scrollLeft = cx * stage.offsetWidth - wrap.clientWidth / 2;
    wrap.scrollTop = cy * stage.offsetHeight - wrap.clientHeight / 2;
  }
}

const zoomBy = f => setZoom(zoom * f);

// ------------------------------------------------------------------ info panel
function updateInfo() {
  if (!engine) return;
  const W = engine.canvas.width, H = engine.canvas.height;
  const rows = [['Size', `${W} × ${H} px`]];
  if (shot) {
    rows.push(['Captured', new Date(shot.createdAt).toLocaleString()]);
    rows.push(['Mode', { area: 'Selected area', visible: 'Visible part', full: 'Full page', edit: 'Edited copy' }[shot.kind] || shot.kind]);
    if (shot.url) {
      let host = shot.url;
      try { host = new URL(shot.url).hostname; } catch (_) { /* noop */ }
      rows.push(['Source', `<a href="${shot.url.replace(/"/g, '')}" target="_blank" rel="noopener">${host}</a>`]);
    }
  }
  $('#info').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const title = shot && shot.title ? shot.title : 'Untitled capture';
  $('#meta').innerHTML = `<b>${title.replace(/</g, '&lt;')}</b> · ${W}×${H}`;
}

// ------------------------------------------------------------------ beautify panel
function buildBeautyUI() {
  const grid = $('#bgrid');
  Object.entries(BACKDROPS).forEach(([key, g]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.title = g.name; b.dataset.bg = key;
    b.style.background = g.color;
    b.addEventListener('click', () => engine && engine.setBeauty({ on: true, bg: key }));
    grid.appendChild(b);
  });
  const none = document.createElement('button');
  none.type = 'button'; none.title = 'Transparent'; none.dataset.bg = 'none'; none.className = 'none';
  none.addEventListener('click', () => engine && engine.setBeauty({ on: true, bg: 'none' }));
  grid.appendChild(none);

  const bind = (id, out, key) => {
    $(id).addEventListener('input', e => {
      $(out).textContent = e.target.value;
      if (engine) engine.setBeauty({ [key]: +e.target.value });
    });
  };
  bind('#rPad', '#oPad', 'pad'); bind('#rRad', '#oRad', 'radius'); bind('#rSha', '#oSha', 'shadow');

  const seg = $('#segFrame');
  [['none', 'None'], ['light', 'Light'], ['dark', 'Dark']].forEach(([v, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.v = v;
    b.addEventListener('click', () => engine && engine.setBeauty({ frame: v }));
    seg.appendChild(b);
  });

  $('#beautyOn').addEventListener('change', e => engine && engine.setBeauty({ on: e.target.checked }));
  $('#btnBeauty').addEventListener('click', () => engine && engine.setBeauty({ on: !engine.beauty.on }));
}

function syncBeauty() {
  if (!engine) return;
  const b = engine.beauty;
  $('#beautyOn').checked = b.on;
  $('#beautySec').classList.toggle('off', !b.on);
  $('#btnBeauty').classList.toggle('on', b.on);
  document.querySelectorAll('#bgrid button').forEach(x => x.classList.toggle('on', x.dataset.bg === b.bg));
  document.querySelectorAll('#segFrame button').forEach(x => x.classList.toggle('on', x.dataset.v === b.frame));
}

// ------------------------------------------------------------------ export
async function copyImage() {
  if (!engine) return false;
  try {
    const blob = await engine.toBlob('image/png');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Copied to clipboard  ✓');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Could not copy – try Download instead');
    return false;
  }
}

function buildPdf(jpeg, w, h, pw, ph) {
  const enc = new TextEncoder();
  const parts = []; let len = 0; const off = [];
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { off[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  off[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) x += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

async function makePdf() {
  const jpegBlob = await engine.toBlob('image/jpeg', 0.92);
  const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const w = engine.canvas.width, h = engine.canvas.height;
  const k = Math.min(0.75, 14400 / Math.max(w, h));
  return buildPdf(bytes, w, h, +(w * k).toFixed(2), +(h * k).toFixed(2));
}

async function download(format = fmt) {
  if (!engine) return false;
  try {
    const blob = format === 'pdf' ? await makePdf() : await engine.toBlob(mime(format), 0.94);
    const url = URL.createObjectURL(blob);
    const filename = fileName(format);
    try {
      await chrome.downloads.download({ url, filename: `Snaps/${filename}`, saveAs: false, conflictAction: 'uniquify' });
    } catch (_) {
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(`Saved ${filename.replace('Snaps_', '')}  ✓`);
    return true;
  } catch (e) {
    console.warn(e);
    toast('Download failed');
    return false;
  }
}

async function saveCopy() {
  if (!engine) return;
  const blob = await engine.toBlob('image/png');
  await addShot({ blob, kind: 'edit', title: shot?.title || 'Edited image', url: shot?.url || '', dpr: shot?.dpr || 1 });
  toast('Saved to gallery  ✓');
}

// ------------------------------------------------------------------ wiring
function wire() {
  $('#btnCopy').addEventListener('click', copyImage);
  $('#btnDownload').addEventListener('click', () => download());
  $('#btnSave').addEventListener('click', saveCopy);
  $('#btnCrop').addEventListener('click', () => engine && (engine.cropping ? engine.cancelCrop() : engine.startCrop()));
  $('#cropApply').addEventListener('click', () => engine.applyCrop());
  $('#cropCancel').addEventListener('click', () => engine.cancelCrop());
  $('#btnRotL').addEventListener('click', () => engine && engine.transform('rotL'));
  $('#btnRotR').addEventListener('click', () => engine && engine.transform('rotR'));
  $('#btnFlipH').addEventListener('click', () => engine && engine.transform('flipH'));
  $('#btnClear').addEventListener('click', () => { if (engine) { engine.clearShapes(); toast('Annotations cleared – undo to bring them back'); } });

  $('#zIn').addEventListener('click', () => zoomBy(1.25));
  $('#zOut').addEventListener('click', () => zoomBy(1 / 1.25));
  $('#zFit').addEventListener('click', fit);
  $('#z100').addEventListener('click', () => setZoom(1));
  window.addEventListener('resize', () => fitMode && fit());
  wrap.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });

  // format menu
  const menu = $('#fmtMenu');
  const setFmt = f => {
    fmt = f;
    $('#dlLabel').textContent = f.toUpperCase();
    if (f !== 'pdf') setSettings({ format: f });
  };
  $('#btnFmt').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  menu.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { setFmt(b.dataset.fmt); menu.hidden = true; download(b.dataset.fmt); }));
  document.addEventListener('click', () => (menu.hidden = true));
  setFmt(fmt);

  // keyboard
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const mod = e.ctrlKey || e.metaKey, k = (e.key || '').toLowerCase();
    if (mod && k === 'c' && !String(getSelection())) { e.preventDefault(); copyImage(); return; }
    if (mod && k === 's') { e.preventDefault(); download(); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomBy(1.25); return; }
    if (mod && k === '-') { e.preventDefault(); zoomBy(1 / 1.25); return; }
    if (mod && k === '0') { e.preventDefault(); fit(); return; }
    if (engine && engine.handleKey(e)) e.preventDefault();
  });

  // paste / drop / file picker
  const fromFile = async f => {
    if (f && f.type.startsWith('image/')) { await loadBlob(f, { createdAt: Date.now(), kind: 'edit', title: f.name || 'Pasted image', url: '', dpr: 1 }); toast('Image loaded'); }
  };
  window.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); fromFile(item.getAsFile()); }
  });
  window.addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  window.addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('dragging'); fromFile(e.dataTransfer.files[0]); });
  $('#fileIn').addEventListener('change', e => fromFile(e.target.files[0]));
}

// ------------------------------------------------------------------ boot
(async function init() {
  settings = await getSettings();
  fmt = settings.format || 'png';
  applyAccent(settings.accent);
  fillIcons();
  buildBeautyUI();
  wire();

  if (!shotId) { showEmpty(); return; }
  const rec = await getShot(shotId);
  if (!rec) { showEmpty(); toast('That capture is no longer in the gallery'); return; }
  await loadBlob(rec.blob, rec);

  if (params.get('note') === 'truncated') toast('Very long page – captured the first 16,000 px', 4500);

  const act = params.get('act'), autoClose = params.get('close') === '1';
  if (act) {
    const ok = act === 'copy' ? await copyImage() : await download();
    if (ok && autoClose) setTimeout(() => window.close(), 900);
  }
})();
