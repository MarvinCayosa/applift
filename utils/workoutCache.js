/**
 * Persistent Workout Cache
 * 
 * IndexedDB-backed cache for workout logs and derived data.
 * Survives page reloads and enables offline mode.
 * 
 * Strategy:
 * - On first load: fetch from Firestore, store in IndexedDB + memory
 * - On subsequent loads: serve from memory if fresh, else IndexedDB, else Firestore
 * - After a new workout: invalidate cache, re-fetch
 * - Offline: serve from IndexedDB (+ Firestore offline persistence as fallback)
 */

const DB_NAME = 'applift-cache';
const DB_VERSION = 1;
const STORES = {
  logs: 'workout-logs',
  meta: 'cache-meta',
};

// In-memory layer (fastest)
const memoryCache = new Map();

// Default TTLs
const MEMORY_TTL = 5 * 60 * 1000;  // 5 minutes in-memory
const IDB_TTL = 30 * 60 * 1000;    // 30 minutes for IndexedDB

/**
 * Open (or create) the IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.logs)) {
        db.createObjectStore(STORES.logs);
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta);
      }
    };
  });
}

/**
 * Write data to IndexedDB
 */
async function idbSet(storeName, key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[WorkoutCache] IDB write failed:', err.message);
  }
}

/**
 * Read data from IndexedDB
 */
async function idbGet(storeName, key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('[WorkoutCache] IDB read failed:', err.message);
    return undefined;
  }
}

/**
 * Delete a key from IndexedDB
 */
async function idbDelete(storeName, key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[WorkoutCache] IDB delete failed:', err.message);
  }
}

/**
 * Clear all data from an IndexedDB store
 */
async function idbClear(storeName) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[WorkoutCache] IDB clear failed:', err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────

/**
 * Synchronously read logs from the in-memory cache.
 * Returns the data array or null. No async, no IndexedDB.
 * Use this to initialize React state without a loading flash.
 */
export function getMemoryCachedLogs(userId) {
  const key = `logs_${userId}`;
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL) {
    return mem.data;
  }
  return null;
}

/**
 * Synchronously read streak from the in-memory cache.
 */
export function getMemoryCachedStreak(userId) {
  const key = `streak_${userId}`;
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL) {
    return mem.data;
  }
  return null;
}

/**
 * Synchronously read movement quality from the in-memory cache.
 */
export function getMemoryCachedMovementQuality(userId) {
  const key = `movementQuality_${userId}`;
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL) {
    return mem.data;
  }
  return null;
}

/**
 * Get cached workout logs for a user.
 * Checks memory first, then IndexedDB.
 * Returns { data, source } or null if nothing cached / expired.
 */
export async function getCachedLogs(userId) {
  const key = `logs_${userId}`;

  // 1. Check memory
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL) {
    return { data: mem.data, source: 'memory' };
  }

  // 2. Check IndexedDB
  const idbEntry = await idbGet(STORES.logs, key);
  if (idbEntry && Date.now() - idbEntry.timestamp < IDB_TTL) {
    // Promote back to memory
    memoryCache.set(key, { data: idbEntry.data, timestamp: idbEntry.timestamp });
    return { data: idbEntry.data, source: 'indexeddb' };
  }

  return null;
}

/**
 * Store workout logs in both memory and IndexedDB.
 * Logs are serialized (Firestore Timestamps converted to ISO strings).
 */
export async function setCachedLogs(userId, logs) {
  const key = `logs_${userId}`;
  const now = Date.now();

  // Serialize Firestore Timestamps for IndexedDB storage
  const serialized = logs.map(log => serializeLog(log));

  // Memory
  memoryCache.set(key, { data: serialized, timestamp: now });

  // IndexedDB (background, non-blocking)
  idbSet(STORES.logs, key, { data: serialized, timestamp: now }).catch(() => {});
}

/**
 * Get cached streak data for a user.
 */
export async function getCachedStreak(userId) {
  const key = `streak_${userId}`;

  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL) {
    return { data: mem.data, source: 'memory' };
  }

  const idbEntry = await idbGet(STORES.meta, key);
  if (idbEntry && Date.now() - idbEntry.timestamp < IDB_TTL) {
    memoryCache.set(key, { data: idbEntry.data, timestamp: idbEntry.timestamp });
    return { data: idbEntry.data, source: 'indexeddb' };
  }

  return null;
}

/**
 * Store streak data in both memory and IndexedDB.
 */
export async function setCachedStreak(userId, streakData) {
  const key = `streak_${userId}`;
  const now = Date.now();

  const serialized = serializeStreak(streakData);

  memoryCache.set(key, { data: serialized, timestamp: now });
  idbSet(STORES.meta, key, { data: serialized, timestamp: now }).catch(() => {});
}

/**
 * Get cached movement quality data for a user.
 */
export async function getCachedMovementQuality(userId) {
  const key = `movementQuality_${userId}`;

  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.timestamp < MEMORY_TTL) {
    return { data: mem.data, source: 'memory' };
  }

  const idbEntry = await idbGet(STORES.meta, key);
  if (idbEntry && Date.now() - idbEntry.timestamp < IDB_TTL) {
    memoryCache.set(key, { data: idbEntry.data, timestamp: idbEntry.timestamp });
    return { data: idbEntry.data, source: 'indexeddb' };
  }

  return null;
}

/**
 * Store movement quality data in both memory and IndexedDB.
 */
export async function setCachedMovementQuality(userId, qualityData) {
  const key = `movementQuality_${userId}`;
  const now = Date.now();

  memoryCache.set(key, { data: qualityData, timestamp: now });
  idbSet(STORES.meta, key, { data: qualityData, timestamp: now }).catch(() => {});
}

/**
 * Invalidate all caches for a user.
 * Call after completing a new workout.
 */
export async function invalidateUserCache(userId) {
  const logKey = `logs_${userId}`;
  const streakKey = `streak_${userId}`;
  const statsKey = `stats_${userId}`;
  const mqKey = `movementQuality_${userId}`;

  // Clear memory
  memoryCache.delete(logKey);
  memoryCache.delete(streakKey);
  memoryCache.delete(statsKey);
  memoryCache.delete(mqKey);

  // Clear IndexedDB
  await Promise.all([
    idbDelete(STORES.logs, logKey),
    idbDelete(STORES.meta, streakKey),
    idbDelete(STORES.meta, statsKey),
    idbDelete(STORES.meta, mqKey),
  ]).catch(() => {});

  console.log('[WorkoutCache] Invalidated all caches for user:', userId);
}

/**
 * Clear the entire cache (e.g. on sign-out).
 */
export async function clearAllCache() {
  memoryCache.clear();
  await Promise.all([
    idbClear(STORES.logs),
    idbClear(STORES.meta),
  ]).catch(() => {});
  console.log('[WorkoutCache] Cleared all caches');
}

// ─── Serialization helpers ────────────────────────────────────

/**
 * Convert a Firestore log document to a plain serializable object.
 * Firestore Timestamps become ISO strings so they survive IndexedDB.
 */
function serializeLog(log) {
  const serialized = { ...log };

  // Convert Firestore Timestamps in timestamps object
  if (serialized.timestamps) {
    const ts = { ...serialized.timestamps };
    for (const [field, val] of Object.entries(ts)) {
      if (val && typeof val.toDate === 'function') {
        ts[field] = val.toDate().toISOString();
      } else if (val && val.seconds !== undefined) {
        ts[field] = new Date(val.seconds * 1000).toISOString();
      }
    }
    serialized.timestamps = ts;
  }

  // Convert startTime if it's a Timestamp
  if (serialized.startTime && typeof serialized.startTime.toDate === 'function') {
    serialized.startTime = serialized.startTime.toDate().toISOString();
  }

  // Mark as serialized so consumers know timestamps are ISO strings
  serialized._serialized = true;

  return serialized;
}

/**
 * Convert streak data to a plain serializable object.
 */
function serializeStreak(data) {
  const serialized = { ...data };

  if (serialized.lastWorkoutDate && typeof serialized.lastWorkoutDate.toDate === 'function') {
    serialized.lastWorkoutDate = { seconds: Math.floor(serialized.lastWorkoutDate.toDate().getTime() / 1000) };
  }
  if (serialized.streakStartDate && typeof serialized.streakStartDate.toDate === 'function') {
    serialized.streakStartDate = { seconds: Math.floor(serialized.streakStartDate.toDate().getTime() / 1000) };
  }
  if (serialized.streakLostDate && typeof serialized.streakLostDate.toDate === 'function') {
    serialized.streakLostDate = { seconds: Math.floor(serialized.streakLostDate.toDate().getTime() / 1000) };
  }
  if (serialized.lastUpdated && typeof serialized.lastUpdated.toDate === 'function') {
    serialized.lastUpdated = { seconds: Math.floor(serialized.lastUpdated.toDate().getTime() / 1000) };
  }

  return serialized;
}

/**
 * Parse a date from either a Firestore Timestamp, ISO string, or Date object.
 * Use this in components/hooks to handle cached (serialized) vs fresh data.
 */
export function parseLogDate(log) {
  if (!log) return null;

  const ts = log.timestamps;
  if (!ts) {
    return log.startTime ? new Date(log.startTime) : null;
  }

  const raw = ts.started || ts.created;
  if (!raw) return log.startTime ? new Date(log.startTime) : null;

  // Firestore Timestamp
  if (typeof raw.toDate === 'function') return raw.toDate();
  // Seconds-based object
  if (raw.seconds !== undefined) return new Date(raw.seconds * 1000);
  // ISO string (from cache)
  if (typeof raw === 'string') return new Date(raw);

  return null;
}
