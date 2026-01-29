// Centralized Firestore initialization
import { getFirestore } from 'firebase/firestore';
import { app } from './firebase';

const db = getFirestore(app);

export { db };
