import { listShots, getShot, deleteShot, clearShots, addShot } from '../lib/db.js';
import { getSettings, applyAccent, fileName } from '../lib/settings.js';

const I = window.SNAP_ICONS;
const $ = (s, r = document) => r.querySelector(s);

let shots = [], filter = 'all', urls = [];
const KIND = { area: 'Area', visible: 'Visible', full: 'Full page', edit: 'Edited' };

let toastTimer;
function toast(text) {
  $('#toastText').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2000);
}

function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

function buildChips() {
  const chips = $('#chips');
  chips.innerHTML = '';
  [['all', 'All'], ['area', 'Area'], ['visible', 'Visible'], ['full', 'Full page'], ['edit', 'Edited']].forEach(([k, label]) => {
    const n = k === 'all' ? shots.length : shots.filter(s => s.kind === k).length;
    if (k !== 'all' && !n) return;
    const b = document.createElement('button');
    b.innerHTML = `${label}<span class="n">${n}</span>`;
    b.className = k === filter ? 'on' : '';
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { filter = k; buildChips(); render(); });
    chips.appendChild(b);
  });
}

function iconBtn(icon, title, fn, cls = '') {
  const b = document.createElement('button');
  b.className = 'btn icon ' + cls;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = I.svg(icon, 20);
  b.addEventListener('click', e => { e.stopPropagation(); fn(b); });
  return b;
}

const openEditor = id => chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html?id=' + id) });

async function copyShot(id) {
  const rec = await getShot(id);
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': rec.blob })]);
    toast('Copied to clipboard  ✓');
  } catch (_) { toast('Could not copy'); }
}

async function downloadShot(id) {
  const rec = await getShot(id);
  const url = URL.createObjectURL(rec.blob);
  try {
    await chrome.downloads.download({ url, filename: `Snaps/${fileName('png', new Date(rec.createdAt))}`, conflictAction: 'uniquify' });
    toast('Saved to Downloads/Snaps  ✓');
  } catch (_) {
    const a = document.createElement('a'); a.href = url; a.download = fileName('png', new Date(rec.createdAt)); a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function render() {
  urls.forEach(u => URL.revokeObjectURL(u));
  urls = [];
  const main = $('#main');
  main.innerHTML = '';
  const list = shots.filter(s => filter === 'all' || s.kind === filter);
  $('#empty').hidden = list.length > 0;
  $('#count').textContent = shots.length ? `${shots.length} capture${shots.length === 1 ? '' : 's'}` : 'Gallery';
  $('#btnClear').hidden = !shots.length;

  let lastDay = '', grid = null, i = 0;
  for (const s of list) {
    const label = dayLabel(s.createdAt);
    if (label !== lastDay) {
      lastDay = label;
      const h = document.createElement('div'); h.className = 'day'; h.textContent = label;
      grid = document.createElement('div'); grid.className = 'grid';
      main.append(h, grid);
    }
    const card = document.createElement('article');
    card.className = 'card';
    card.style.animationDelay = Math.min(i++, 14) * 30 + 'ms';
    const img = document.createElement('img');
    img.className = 'thumb'; img.alt = s.title || 'capture'; img.loading = 'lazy';
    const u = URL.createObjectURL(s.thumb); urls.push(u); img.src = u;
    img.addEventListener('click', () => openEditor(s.id));
    const acts = document.createElement('div'); acts.className = 'card-actions';
    const grow = document.createElement('span'); grow.className = 'grow';
    acts.append(
      iconBtn('pen', 'Edit', () => openEditor(s.id)),
      iconBtn('copy', 'Copy', () => copyShot(s.id)),
      iconBtn('download', 'Download', () => downloadShot(s.id)),
      grow,
      iconBtn('trash', 'Delete', async () => {
        card.classList.add('leaving');
        await deleteShot(s.id);
        shots = shots.filter(x => x.id !== s.id);
        setTimeout(() => { buildChips(); render(); }, 220);
      }, 'danger')
    );
    const foot = document.createElement('div'); foot.className = 'card-body';
    const time = new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    foot.innerHTML = `<div><b>${(host(s.url) || s.title || 'Capture').replace(/</g, '&lt;')}</b><small>${time} · ${s.width}×${s.height}</small></div><span class="chip">${KIND[s.kind] || s.kind}</span>`;
    card.append(img, foot, acts);
    grid.appendChild(card);
  }
}

async function refresh() {
  shots = await listShots();
  buildChips();
  render();
}

(async function init() {
  const settings = await getSettings();
  applyAccent(settings.accent);
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = I.svg(el.dataset.icon, el.classList.contains('badge') ? 40 : 20); });
  $('#closeWelcome').innerHTML = I.svg('close', 20);
  $('#closeWelcome').addEventListener('click', () => ($('#welcome').hidden = true));
  if (new URLSearchParams(location.search).get('welcome')) $('#welcome').hidden = false;

  $('#btnOpen').addEventListener('click', () => $('#fileIn').click());
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    await addShot({ blob: f, kind: 'edit', title: f.name });
    toast('Imported  ✓');
    refresh();
  });
  $('#btnClear').addEventListener('click', async () => {
    if (!confirm('Delete all captures from the gallery? This cannot be undone.')) return;
    await clearShots();
    refresh();
  });
  await refresh();
})();
