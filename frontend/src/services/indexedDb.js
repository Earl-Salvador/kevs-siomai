// IndexedDB service for offline order storage
const DB_NAME = 'KevsSiomaiDB';
const DB_VERSION = 1;
const STORE_ORDERS = 'offline_orders';
const STORE_SYNC_LOG = 'sync_log';

let dbInstance = null;

export function openDb() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(dbInstance);
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        const store = db.createObjectStore(STORE_ORDERS, { keyPath: 'local_id', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC_LOG)) {
        db.createObjectStore(STORE_SYNC_LOG, { keyPath: 'batch_id' });
      }
    };
  });
}

export async function saveOfflineOrder(orderData) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_ORDERS);
    const record = {
      ...orderData,
      synced: false,
      created_at: orderData.created_at || new Date().toISOString(),
    };
    const req = store.add(record);
    req.onsuccess = () => resolve({ ...record, local_id: req.result });
    req.onerror = () => reject(req.error);
  });
}

export async function getUnsynced() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readonly');
    const store = tx.objectStore(STORE_ORDERS);
    const index = store.index('synced');
    const req = index.getAll(false);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllOfflineOrders() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readonly');
    const store = tx.objectStore(STORE_ORDERS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function markAsSynced(localIds) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_ORDERS);
    let done = 0;
    if (localIds.length === 0) { resolve(); return; }
    localIds.forEach(id => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.synced = true;
          store.put(record);
        }
        done++;
        if (done === localIds.length) resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

export async function getUnsyncedCount() {
  const unsynced = await getUnsynced();
  return unsynced.length;
}

export async function clearSynced() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDERS, 'readwrite');
    const store = tx.objectStore(STORE_ORDERS);
    const index = store.index('synced');
    const req = index.openCursor(IDBKeyRange.only(true));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}
