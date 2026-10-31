// Shared settings (ES module) – used by background, popup, editor and gallery.

// One solid colour per theme (second value kept equal so older code paths still work).
export const ACCENTS = {
  blue:   ['#1976d2', '#1976d2', 'Blue'],
  indigo: ['#3f51b5', '#3f51b5', 'Indigo'],
  teal:   ['#00796b', '#00796b', 'Teal'],
  green:  ['#2e7d32', '#2e7d32', 'Green'],
  purple: ['#7b1fa2', '#7b1fa2', 'Purple'],
  red:    ['#c62828', '#c62828', 'Red']
};

export const DEFAULTS = {
  accent: 'blue',
  after: 'editor',   // what to do after visible / full-page capture: editor | copy | download
  format: 'png',     // png | jpg | webp
  delay: 0           // seconds: 0 | 3 | 5 | 10
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(settings || {}) };
  if (!ACCENTS[s.accent]) s.accent = DEFAULTS.accent; // e.g. a theme from an older version
  return s;
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function accentVars(name) {
  const [a1, a2] = ACCENTS[name] || ACCENTS.blue;
  return {
    '--a1': a1,
    '--a2': a2,
    '--a1-rgb': hexToRgb(a1).join(','),
    '--a2-rgb': hexToRgb(a2).join(',')
  };
}

export function applyAccent(name, root = document.documentElement) {
  const vars = accentVars(name);
  for (const k in vars) root.style.setProperty(k, vars[k]);
}

// Pages Chrome never lets extensions capture or script.
const RESTRICTED = /^(chrome|edge|about|devtools|view-source|chrome-extension|chrome-search|chrome-untrusted|brave|opera|vivaldi):/i;
const STORE_PAGES = /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i;
export const isRestricted = url => !!url && (RESTRICTED.test(url) || STORE_PAGES.test(url));

export function stamp(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`;
}

export function fileName(ext, date) {
  return `Snaps_${stamp(date)}.${ext}`;
}
