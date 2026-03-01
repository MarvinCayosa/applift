// Centralized Firestore initialization with offline persistence
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { app } from './firebase';

const db = getFirestore(app);

// Enable offline persistence (IndexedDB-backed)
// This lets Firestore serve cached data when offline and sync when back online
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open — persistence can only be enabled in one tab at a time
      console.warn('[Firestore] Persistence failed: multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // Browser doesn't support IndexedDB persistence
      console.warn('[Firestore] Persistence not supported in this browser');
    }
  });
}

export { db };
