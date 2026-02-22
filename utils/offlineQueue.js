/**
 * Offline Queue — IndexedDB-based store-and-forward system
 * 
 * Persists workout session data locally when the network is unavailable.
 * On reconnection, queued jobs are uploaded in order with idempotent keys
 * to prevent duplicate uploads.
 *
 * Storage schema (IndexedDB "applift-offline"):
 *   objectStore "pendingUploads" — keyed by jobId
 *     { jobId, sessionId, type, payload, createdAt, status, retryCount }
 *
 * Idempotency: Each job carries a stable `jobId` derived from
 * `${sessionId}:${type}:${setNumber || 'final'}`.  The upload handler
 * must use this to deduplicate on the server side.
 */

const DB_NAME = 'applift-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pendingUploads';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Open (or create) the IndexedDB database. */
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'jobId' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Run a read-write transaction and return when complete. */
async function withStore(mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = callback(store);

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Enqueue a job for later upload.
 *
 * @param {string}  sessionId  – The workout session / log ID.
 * @param {string}  type       – Job type: 'rep', 'set', 'session_complete', 'imu_batch'.
 * @param {object}  payload    – Arbitrary JSON-serialisable data.
 * @param {number} [setNumber] – Optional set number for dedup key.
 * @returns {Promise<string>}  The generated jobId.
 */
export async function enqueueJob(sessionId, type, payload, setNumber = null) {
  const jobId = `${sessionId}:${type}:${setNumber ?? 'final'}:${Date.now()}`;

  await withStore('readwrite', (store) => {
    store.put({
      jobId,
      sessionId,
      type,
      payload,
      createdAt: Date.now(),
      status: 'pending',   // pending | uploading | done | failed
      retryCount: 0,
    });
  });

  console.log(`[OfflineQueue] Enqueued job ${jobId}`);
  return jobId;
}

/**
 * Get all pending jobs for a session, ordered by creation time.
 *
 * @param {string} sessionId
 * @returns {Promise<Array>}
 */
export async function getSessionJobs(sessionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('sessionId');
    const request = index.getAll(sessionId);

    request.onsuccess = () => {
      db.close();
      const jobs = (request.result || []).sort((a, b) => a.createdAt - b.createdAt);
      resolve(jobs);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Get all pending (not yet uploaded) jobs across all sessions.
 *
 * @returns {Promise<Array>}
 */
export async function getAllPendingJobs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.getAll('pending');

    request.onsuccess = () => {
      db.close();
      resolve((request.result || []).sort((a, b) => a.createdAt - b.createdAt));
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Mark a job's status (e.g. 'uploading', 'done', 'failed').
 *
 * @param {string} jobId
 * @param {string} status
 */
export async function updateJobStatus(jobId, status) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(jobId);

    getReq.onsuccess = () => {
      const job = getReq.result;
      if (job) {
        job.status = status;
        if (status === 'failed') job.retryCount = (job.retryCount || 0) + 1;
        store.put(job);
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Remove all jobs for a given session (e.g. on cancel).
 *
 * @param {string} sessionId
 */
export async function clearSessionJobs(sessionId) {
  const jobs = await getSessionJobs(sessionId);
  if (jobs.length === 0) return;

  await withStore('readwrite', (store) => {
    jobs.forEach((j) => store.delete(j.jobId));
  });

  console.log(`[OfflineQueue] Cleared ${jobs.length} jobs for session ${sessionId}`);
}

/**
 * Remove completed jobs older than `maxAgeMs` (default 24 h).
 */
export async function purgeOldJobs(maxAgeMs = 86400000) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const job = cursor.value;
        if (job.status === 'done' && Date.now() - job.createdAt > maxAgeMs) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * Flush all pending jobs by calling the provided `uploadFn`.
 * Jobs are processed sequentially. Failed jobs stay queued.
 *
 * @param {(job: object) => Promise<void>} uploadFn
 * @returns {Promise<{ uploaded: number, failed: number }>}
 */
export async function flushQueue(uploadFn) {
  const pending = await getAllPendingJobs();
  let uploaded = 0;
  let failed = 0;

  for (const job of pending) {
    try {
      await updateJobStatus(job.jobId, 'uploading');
      await uploadFn(job);
      await updateJobStatus(job.jobId, 'done');
      uploaded++;
    } catch (err) {
      console.warn(`[OfflineQueue] Upload failed for ${job.jobId}:`, err);
      await updateJobStatus(job.jobId, 'failed');
      failed++;
    }
  }

  // Clean up completed
  if (uploaded > 0) {
    await purgeOldJobs(0); // Remove done jobs immediately after flush
  }

  console.log(`[OfflineQueue] Flushed: ${uploaded} uploaded, ${failed} failed`);
  return { uploaded, failed };
}
