// 极简 IndexedDB 键值存储：单个 object store "kv"
const DB_NAME = 'asterism';
const STORE = 'kv';
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kv = {
  get: key => run('readonly', s => s.get(key)),
  set: (key, value) => run('readwrite', s => s.put(value, key)),
  del: key => run('readwrite', s => s.delete(key)),

  async entries() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const out = {};
      const tx = db.transaction(STORE, 'readonly');
      tx.objectStore(STORE).openCursor().onsuccess = e => {
        const cur = e.target.result;
        if (cur) { out[cur.key] = cur.value; cur.continue(); }
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
    });
  },

  // 整库替换（导入备份用），在同一个事务里完成，失败则全部回滚
  async replaceAll(data) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      s.clear();
      for (const [k, v] of Object.entries(data)) s.put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
};
