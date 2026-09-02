/* =========================================================
   POLARLOG — OFFLINE DATA LAYER (IndexedDB)
   Two object stores:
     - "cache"  : last-known-good response for each GET endpoint,
                  so pages can render real data (not just an empty
                  shell) when the network is unavailable.
     - "outbox" : writes (POST/PUT/DELETE) made while offline,
                  replayed against the real API once back online.
   Loaded before config.js — config.js calls into window.OfflineDB.
========================================================= */
(function () {
  const DB_NAME = "polarlog-offline";
  const DB_VERSION = 1;
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache", { keyPath: "endpoint" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  // ---------- cache: last-known GET response per endpoint ----------
  async function getCache(endpoint) {
    try {
      const store = await tx("cache", "readonly");
      return await new Promise((resolve, reject) => {
        const req = store.get(endpoint);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("[offline-db] getCache failed", err);
      return null;
    }
  }

  async function setCache(endpoint, data) {
    try {
      const store = await tx("cache", "readwrite");
      return await new Promise((resolve, reject) => {
        const req = store.put({ endpoint, data, updatedAt: Date.now() });
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("[offline-db] setCache failed", err);
      return false;
    }
  }

  // ---------- outbox: queued writes made while offline ----------
  async function addToOutbox(entry) {
    const store = await tx("outbox", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.add({
        method: entry.method,
        endpoint: entry.endpoint,
        body: entry.body,
        createdAt: Date.now(),
        attempts: 0,
        status: "pending",
        lastError: null,
      });
      req.onsuccess = () => resolve(req.result); // new id
      req.onerror = () => reject(req.error);
    });
  }

  async function listOutbox() {
    const store = await tx("outbox", "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function updateOutboxEntry(id, patch) {
    const store = await tx("outbox", "readwrite");
    return new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) return resolve(false);
        const putReq = store.put(Object.assign(existing, patch));
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async function removeFromOutbox(id) {
    const store = await tx("outbox", "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  window.OfflineDB = {
    getCache,
    setCache,
    addToOutbox,
    listOutbox,
    updateOutboxEntry,
    removeFromOutbox,
  };
})();
