import { getSettings, setSettings, applyAccent, ACCENTS, isRestricted } from '../lib/settings.js';
import { listShots } from '../lib/db.js';

const I = window.SNAP_ICONS;
const $ = (s, r = document) => r.querySelector(s);

const DEFAULT_KEYS = { 'capture-area': 'Alt+Shift+A', 'capture-visible': 'Alt+Shift+V', 'capture-full': 'Alt+Shift+F' };

function seg(el, options, value, onPick) {
  el.innerHTML = '';
  options.forEach(([val, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = val === value ? 'on' : '';
    b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      onPick(val);
    });
    el.appendChild(b);
  });
}

function renderKeys(shortcut) {
  return shortcut.split(/\+|\s/).filter(Boolean).map(k => `<kbd>${k}</kbd>`).join('');
}

async function init() {
  const settings = await getSettings();
  applyAccent(settings.accent);

  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = I.svg(el.dataset.icon, el.classList.contains('avatar') ? 24 : 20);
  });
  $('#openGallery').innerHTML = I.svg('gallery', 24);

  // real (possibly user-customised) shortcuts
  let cmds = [];
  try { cmds = await chrome.commands.getAll(); } catch (_) { /* noop */ }
  document.querySelectorAll('.keys').forEach(el => {
    const c = cmds.find(x => x.name === el.dataset.cmd);
    const sc = (c && c.shortcut) || DEFAULT_KEYS[el.dataset.cmd] || '';
    el.innerHTML = sc ? renderKeys(sc) : '<kbd>—</kbd>';
  });

  // can we capture this tab?
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && isRestricted(tab.url)) {
    $('#warn').hidden = false;
    document.querySelectorAll('.act').forEach(b => (b.disabled = true));
  }

  document.querySelectorAll('.act').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { await chrome.runtime.sendMessage({ type: 'capture', mode: btn.dataset.mode }); } catch (_) { /* noop */ }
      window.close();
    });
  });

  // preferences
  seg($('#segDelay'), [[0, 'Off'], [3, '3s'], [5, '5s'], [10, '10s']], settings.delay, v => setSettings({ delay: v }));
  seg($('#segAfter'), [['editor', 'Editor'], ['copy', 'Copy'], ['download', 'Download']], settings.after, v => setSettings({ after: v }));
  seg($('#segFormat'), [['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']], settings.format, v => setSettings({ format: v }));

  const sw = $('#swatches');
  Object.entries(ACCENTS).forEach(([key, [c1, , name]]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = name;
    b.style.setProperty('--c1', c1);
    b.innerHTML = I.svg('check', 16);
    if (key === settings.accent) b.classList.add('on');
    b.addEventListener('click', () => {
      sw.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      applyAccent(key);
      setSettings({ accent: key });
    });
    sw.appendChild(b);
  });

  // links
  const openPage = path => { chrome.tabs.create({ url: chrome.runtime.getURL(path) }); window.close(); };
  $('#openGallery').addEventListener('click', () => openPage('gallery/gallery.html'));
  $('#viewAll').addEventListener('click', e => { e.preventDefault(); openPage('gallery/gallery.html'); });
  $('#shortcuts').addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); window.close(); });

  // recent captures
  const strip = $('#strip');
  try {
    const shots = (await listShots()).slice(0, 8);
    if (!shots.length) {
      strip.innerHTML = `<div class="empty">${I.svg('image', 20)} Your captures will appear here</div>`;
    } else {
      shots.forEach(s => {
        const d = document.createElement('div');
        d.className = 'th';
        d.title = `${s.width}×${s.height} · ${new Date(s.createdAt).toLocaleString()}`;
        d.style.backgroundImage = `url(${URL.createObjectURL(s.thumb)})`;
        d.addEventListener('click', () => openPage('editor/editor.html?id=' + s.id));
        strip.appendChild(d);
      });
    }
  } catch (_) {
    strip.innerHTML = '<div class="empty">No captures yet</div>';
  }
}

init();
