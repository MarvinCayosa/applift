// Centralized Firestore initialization with offline persistence
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { app } from './firebase';

// Initialize Firestore with persistent IndexedDB cache and multi-tab support
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export { db };
