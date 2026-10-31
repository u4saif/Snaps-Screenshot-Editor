// IndexedDB history store (ES module). The extension origin is shared by the
// service worker and all extension pages, so everyone sees the same gallery.

const DB_NAME = 'snapnova'; // internal name kept so existing captures stay available
const STORE = 'shots';
const MAX_ITEMS = 250;

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(store)).then(v => { out = v; }).catch(reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

// Cover-cropped thumbnail (top aligned so tall full-page shots show their header).
export async function makeThumb(blob, tw = 420, th = 280) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.max(tw / bmp.width, th / bmp.height);
  const dw = bmp.width * scale;
  const dx = (tw - dw) / 2;
  const c = new OffscreenCanvas(tw, th);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#12121c';
  ctx.fillRect(0, 0, tw, th);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, dx, 0, dw, bmp.height * scale);
  const dims = { width: bmp.width, height: bmp.height };
  bmp.close();
  const thumb = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  return { thumb, ...dims };
}

export async function addShot({ blob, kind = 'area', title = '', url = '', dpr = 1 }) {
  const { thumb, width, height } = await makeThumb(blob);
  const rec = { id: newId(), createdAt: Date.now(), kind, title, url, dpr, width, height, size: blob.size, blob, thumb };
  await tx('readwrite', s => wrap(s.put(rec)));
  pruneOld().catch(() => {});
  return rec.id;
}

export async function getShot(id) {
  return tx('readonly', s => wrap(s.get(id)));
}

export async function listShots() {
  const all = await tx('readonly', s => wrap(s.getAll()));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteShot(id) {
  return tx('readwrite', s => wrap(s.delete(id)));
}

export async function clearShots() {
  return tx('readwrite', s => wrap(s.clear()));
}

async function pruneOld() {
  const all = await listShots();
  const extra = all.slice(MAX_ITEMS);
  for (const r of extra) await deleteShot(r.id);
}
