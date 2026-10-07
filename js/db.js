// Локальное хранилище в IndexedDB: слова, модули и настройки (kv).
const DB_NAME = 'espanol';
const VERSION = 1;
const STORES = ['words', 'modules', 'kv'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('modules')) db.createObjectStore('modules', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  all: store => tx(store, 'readonly', s => s.getAll()),
  put: (store, obj) => tx(store, 'readwrite', s => { s.put(obj); }),
  putMany: (store, list) => tx(store, 'readwrite', s => { list.forEach(o => s.put(o)); }),
  del: (store, id) => tx(store, 'readwrite', s => { s.delete(id); }),
  delMany: (store, ids) => tx(store, 'readwrite', s => { ids.forEach(id => s.delete(id)); }),
  getKv: key => tx('kv', 'readonly', s => s.get(key)),
  setKv: (key, val) => tx('kv', 'readwrite', s => { s.put(val, key); }),

  async exportAll() {
    const [words, modules] = await Promise.all([db.all('words'), db.all('modules')]);
    const profile = (await db.getKv('profile')) || {};
    const { geminiKey, ...safeProfile } = profile; // ключ в резервную копию не кладём
    return { app: 'espanol', version: 1, exportedAt: new Date().toISOString(), profile: safeProfile, modules, words };
  },

  async importAll(data) {
    if (!data || data.app !== 'espanol' || !Array.isArray(data.words)) throw new Error('Это не резервная копия приложения');
    const current = (await db.getKv('profile')) || {};
    await tx('words', 'readwrite', s => { s.clear(); data.words.forEach(w => s.put(w)); });
    await tx('modules', 'readwrite', s => { s.clear(); (data.modules || []).forEach(m => s.put(m)); });
    await db.setKv('profile', { ...data.profile, geminiKey: current.geminiKey });
  },

  async clearAll() {
    for (const s of STORES) await tx(s, 'readwrite', st => { st.clear(); });
  },
};

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
