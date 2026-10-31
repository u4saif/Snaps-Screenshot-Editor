// Snaps service worker: capture orchestration, shortcuts, context menu, history store.
import { addShot, dataUrlToBlob } from './lib/db.js';
import { getSettings, ACCENTS, isRestricted } from './lib/settings.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAX_PX = 16000; // keep canvases inside Chrome's limits

// ---------------------------------------------------------------- setup
chrome.runtime.onInstalled.addListener(details => {
  chrome.contextMenus.removeAll(() => {
    const items = [
      ['snap-area', 'Snaps: Capture selected area'],
      ['snap-visible', 'Snaps: Capture visible part'],
      ['snap-full', 'Snaps: Capture full page']
    ];
    for (const [id, title] of items) chrome.contextMenus.create({ id, title, contexts: ['page', 'selection', 'image', 'link', 'action'] });
  });
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('gallery/gallery.html?welcome=1') });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const mode = { 'snap-area': 'area', 'snap-visible': 'visible', 'snap-full': 'full' }[info.menuItemId];
  if (mode) trigger(mode, tab);
});

chrome.commands.onCommand.addListener((cmd, tab) => {
  const mode = { 'capture-area': 'area', 'capture-visible': 'visible', 'capture-full': 'full' }[cmd];
  if (mode) trigger(mode, tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender)
    .then(r => sendResponse(r ?? { ok: true }))
    .catch(e => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true;
});

async function handle(msg, sender) {
  switch (msg?.type) {
    case 'capture': {
      const tab = await getActiveTab();
      trigger(msg.mode, tab, msg.delay);
      return { ok: true };
    }
    case 'store': {
      const blob = await dataUrlToBlob(msg.dataUrl);
      const id = await addShot({ blob, kind: msg.kind || 'area', title: msg.title || '', url: msg.url || '', dpr: msg.dpr || 1 });
      if (msg.open) await openEditor(id, sender?.tab, msg.act);
      return { ok: true, id };
    }
    case 'download': {
      await chrome.downloads.download({
        url: msg.dataUrl,
        filename: `Snaps/${msg.filename}`,
        saveAs: false,
        conflictAction: 'uniquify'
      });
      return { ok: true };
    }
    case 'fonts': {
      const out = {};
      for (const w of [400, 500, 700]) {
        const buf = new Uint8Array(await (await fetch(chrome.runtime.getURL(`fonts/roboto-latin-${w}-normal.woff2`))).arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        out[w] = btoa(bin);
      }
      return { ok: true, fonts: out };
    }
    case 'openEditor':
      await openEditor(msg.id, sender?.tab, msg.act);
      return { ok: true };
  }
  return { ok: false, error: 'unknown message' };
}

// ---------------------------------------------------------------- helpers
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function setBadge(text, color = '#2563eb') {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text: String(text ?? '') });
}

async function countdown(sec, accent) {
  const color = (ACCENTS[accent] || ACCENTS.blue)[0];
  for (let i = sec; i > 0; i--) {
    await setBadge(i, color);
    await sleep(1000);
  }
  await setBadge('');
  await sleep(120);
}

function pageToast(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  d.style.cssText = 'all:initial;position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483647;background:#1e293b;border:1px solid #334155;color:#fff;font:600 14px system-ui,sans-serif;padding:12px 20px;border-radius:999px;box-shadow:0 12px 40px rgba(0,0,0,.45)';
  document.documentElement.appendChild(d);
  setTimeout(() => d.remove(), 3600);
}

async function reportError(tab, err) {
  const message = String(err?.message || err);
  console.warn('[Snaps]', err);
  await setBadge('!', '#ef4444');
  setTimeout(() => setBadge(''), 5000);
  if (tab?.id != null && !isRestricted(tab.url)) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pageToast, args: ['Snaps: ' + message] });
    } catch (_) { /* page may not allow injection */ }
  }
}

function trigger(mode, tab, delay) {
  run(mode, tab, delay).catch(err => reportError(tab, err));
}

async function openEditor(id, fromTab, act) {
  const params = new URLSearchParams({ id });
  if (act) { params.set('act', act); params.set('close', '1'); }
  const props = { url: chrome.runtime.getURL('editor/editor.html?' + params) };
  if (fromTab?.index != null) { props.index = fromTab.index + 1; props.openerTabId = fromTab.id; }
  await chrome.tabs.create(props);
}

// ---------------------------------------------------------------- main entry
async function run(mode, tab, delaySec) {
  if (!tab) tab = await getActiveTab();
  if (!tab) throw new Error('No active tab found.');
  if (isRestricted(tab.url)) throw new Error("Chrome doesn't allow screenshots of this page. Open a normal website and try again.");
  const settings = await getSettings();
  const delay = Number.isFinite(delaySec) ? delaySec : settings.delay || 0;
  if (delay > 0) await countdown(delay, settings.accent);
  else await sleep(180); // let the popup / context menu disappear

  if (mode === 'area') return startArea(tab, settings);
  if (mode === 'visible') return captureVisible(tab, settings);
  if (mode === 'full') return captureFull(tab, settings);
  throw new Error('Unknown capture mode');
}

async function shot(tab) {
  for (let i = 0; i < 4; i++) {
    try {
      return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    } catch (e) {
      if (/MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/i.test(String(e)) && i < 3) { await sleep(700); continue; }
      throw e;
    }
  }
}

// ---------------------------------------------------------------- area (Lightshot style)
async function startArea(tab, settings) {
  const dataUrl = await shot(tab);
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['lib/icons.js', 'lib/editor-core.js', 'content/overlay.js']
  });
  const [a1, a2] = ACCENTS[settings.accent] || ACCENTS.blue;
  await chrome.tabs.sendMessage(tab.id, { type: 'snap:open', dataUrl, a1, a2, format: settings.format });
}

// ---------------------------------------------------------------- visible part
async function captureVisible(tab, settings) {
  const dataUrl = await shot(tab);
  const blob = await dataUrlToBlob(dataUrl);
  await finish(blob, 'visible', tab, settings);
}

async function finish(blob, kind, tab, settings, extra = {}) {
  const id = await addShot({ blob, kind, title: tab.title || '', url: tab.url || '', dpr: extra.dpr || 1 });
  const params = new URLSearchParams({ id });
  if (settings.after === 'copy') { params.set('act', 'copy'); params.set('close', '1'); }
  else if (settings.after === 'download') { params.set('act', 'download'); params.set('close', '1'); }
  if (extra.truncated) params.set('note', 'truncated');
  await chrome.tabs.create({
    url: chrome.runtime.getURL('editor/editor.html?' + params),
    index: tab.index + 1,
    openerTabId: tab.id
  });
}

// ---------------------------------------------------------------- full page
// These three functions are serialised and executed INSIDE the page.
function snapPrep() {
  const S = (window.__snapsFP = {});
  const st = document.createElement('style');
  st.textContent = 'html,body{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}';
  document.documentElement.appendChild(st);
  S.style = st;

  const de = document.scrollingElement || document.documentElement;
  const vw = innerWidth, vh = innerHeight;
  let el = null;
  if (de.scrollHeight - vh < 40) {
    // The page itself doesn't scroll – look for the big inner scroller (web apps, docs, chats…)
    let bestExtra = 40;
    for (const e of document.querySelectorAll('*')) {
      const oy = getComputedStyle(e).overflowY;
      if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') continue;
      const extra = e.scrollHeight - e.clientHeight;
      if (extra <= bestExtra) continue;
      const r = e.getBoundingClientRect();
      if (r.width * r.height < vw * vh * 0.4) continue;
      el = e; bestExtra = extra;
    }
  }
  S.el = el;
  const base = { vw, vh, dpr: devicePixelRatio, title: document.title, url: location.href };
  if (el) {
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left), y = Math.max(0, r.top);
    S.start = el.scrollTop;
    return {
      ...base, inner: true, total: el.scrollHeight, start: S.start,
      region: { x, y, w: Math.min(el.clientWidth, vw - x), h: Math.min(el.clientHeight, vh - y) }
    };
  }
  S.start = de.scrollTop;
  const total = Math.max(de.scrollHeight, document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  return { ...base, inner: false, total, start: S.start, region: { x: 0, y: 0, w: vw, h: vh } };
}

function snapScrollTo(y) {
  const S = window.__snapsFP || {};
  const t = S.el || document.scrollingElement || document.documentElement;
  t.scrollTo({ top: y, left: 0, behavior: 'instant' });
  return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => res(t.scrollTop), 80))));
}

function snapHideFixed() {
  const S = window.__snapsFP;
  if (!S) return 0;
  S.hidden = S.hidden || [];
  const area = innerWidth * innerHeight;
  for (const e of document.querySelectorAll('*')) {
    const pos = getComputedStyle(e).position;
    if (pos !== 'fixed' && pos !== 'sticky') continue;
    if (S.el && e.contains(S.el)) continue;
    const r = e.getBoundingClientRect();
    if (r.width * r.height > area * 0.5) continue; // never hide app shells
    S.hidden.push([e, e.style.getPropertyValue('visibility'), e.style.getPropertyPriority('visibility')]);
    e.style.setProperty('visibility', 'hidden', 'important');
  }
  return S.hidden.length;
}

function snapRestore() {
  const S = window.__snapsFP;
  if (!S) return;
  (S.hidden || []).forEach(([e, v, p]) => (v ? e.style.setProperty('visibility', v, p) : e.style.removeProperty('visibility')));
  if (S.style) S.style.remove();
  const t = S.el || document.scrollingElement || document.documentElement;
  t.scrollTo({ top: S.start || 0, left: 0, behavior: 'instant' });
  delete window.__snapsFP;
}

function positionsFor(total, h) {
  if (total <= h) return [0];
  const out = [];
  for (let y = 0; y < total - h; y += h) out.push(y);
  out.push(total - h);
  return out;
}

async function captureFull(tab, settings) {
  const tabId = tab.id;
  const exec = (func, args = []) =>
    chrome.scripting.executeScript({ target: { tabId }, func, args }).then(r => r?.[0]?.result);

  const info = await exec(snapPrep);
  if (!info) throw new Error('Could not read the page for a full-page capture.');
  const color = (ACCENTS[settings.accent] || ACCENTS.blue)[0];

  try {
    await sleep(150); // let the scrollbar-hiding style settle

    let scale = 0, canvas = null, ctx = null, truncated = false;
    let totalCss = info.total;
    let positions = positionsFor(totalCss, info.region.h);
    let lastShot = 0, hidden = false;

    for (let i = 0; i < positions.length; i++) {
      const actual = await exec(snapScrollTo, [positions[i]]);
      await sleep(120);
      const wait = 620 - (Date.now() - lastShot); // Chrome allows ~2 captures / second
      if (wait > 0) await sleep(wait);
      const dataUrl = await shot(tab);
      lastShot = Date.now();
      const bmp = await createImageBitmap(await dataUrlToBlob(dataUrl));

      if (!canvas) {
        scale = bmp.width / info.vw;
        const capCss = Math.floor(MAX_PX / scale);
        if (totalCss > capCss) { totalCss = capCss; truncated = true; positions = positionsFor(totalCss, info.region.h); }
        canvas = new OffscreenCanvas(Math.round(info.region.w * scale), Math.round(totalCss * scale));
        ctx = canvas.getContext('2d');
      }
      const sx = Math.round(info.region.x * scale), sy = Math.round(info.region.y * scale);
      const sw = Math.min(canvas.width, bmp.width - sx), sh = Math.min(Math.round(info.region.h * scale), bmp.height - sy);
      const dy = Math.round(actual * scale);
      ctx.drawImage(bmp, sx, sy, sw, sh, 0, dy, sw, sh);
      bmp.close();

      await setBadge(Math.round(((i + 1) / positions.length) * 100) + '%', color);
      if (i === 0 && positions.length > 1 && !hidden) { await exec(snapHideFixed); hidden = true; }
    }

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    await finish(blob, 'full', tab, settings, { dpr: scale, truncated });
  } finally {
    try { await exec(snapRestore); } catch (_) { /* tab may have navigated */ }
    await setBadge('');
  }
}
