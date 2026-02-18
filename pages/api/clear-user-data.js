/**
 * Clear User Data API Route
 * 
 * Deletes ALL user data for a fresh start:
 * 1. Workout logs from Firestore (userWorkouts subcollection)
 * 2. IMU data files from GCS (users/{userId}/*)
 * 3. User streak data
 * 4. Cached data
 * 
 * DOES NOT DELETE:
 * - User account (Firebase Auth)
 * - User profile (users collection document)
 * - Goals and preferences (kept in user profile)
 */

import { Storage } from '@google-cloud/storage';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
let adminDb;
if (!getApps().length) {
  try {
    const app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCS_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
      }),
    });
    adminDb = getFirestore(app);
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
} else {
  adminDb = getFirestore();
}

// Initialize Google Cloud Storage
let storage;
try {
  storage = new Storage({
    projectId: process.env.GCS_PROJECT_ID,
    credentials: {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  });
} catch (error) {
  console.error('GCS initialization error:', error);
}

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'applift-imu-data';

/**
 * Verify Firebase ID token
 */
async function verifyAuthToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Delete all files in a GCS folder
 */
async function deleteGCSFolder(userId) {
  if (!storage) {
    console.warn('[ClearData] GCS not initialized, skipping GCS deletion');
    return { deleted: 0, error: null };
  }

  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const prefix = `users/${userId}/`;
    
    // List all files with the user's prefix
    const [files] = await bucket.getFiles({ prefix });
    
    if (files.length === 0) {
      console.log(`[ClearData] No GCS files found for user: ${userId}`);
      return { deleted: 0, error: null };
    }

    // Delete all files
    const deletePromises = files.map(file => file.delete());
    await Promise.all(deletePromises);
    
    console.log(`[ClearData] Deleted ${files.length} GCS files for user: ${userId}`);
    return { deleted: files.length, error: null };
  } catch (error) {
    console.error('[ClearData] GCS deletion error:', error);
    return { deleted: 0, error: error.message };
  }
}

/**
 * Delete all workout logs from Firestore
 * Delete the entire user document: userWorkouts/{userId}
 * This automatically deletes all subcollections (barbell, dumbbell, etc.)
 */
async function deleteFirestoreWorkoutLogs(userId) {
  if (!adminDb) {
    console.warn('[ClearData] Firestore Admin not initialized, skipping Firestore deletion');
    return { deleted: 0, error: null };
  }

  try {
    let totalDeleted = 0;

    // 1. Delete the entire userWorkouts/{userId} document and all subcollections
    const userWorkoutsDocRef = adminDb.collection('userWorkouts').doc(userId);
    
    // Get count of subcollections for reporting
    const subcollections = await userWorkoutsDocRef.listCollections();
    console.log(`[ClearData] Found ${subcollections.length} equipment subcollections for user: ${userId}`);
    
    // Count documents in all subcollections before deletion
    for (const subcollection of subcollections) {
      const snapshot = await subcollection.get();
      totalDeleted += snapshot.size;
      console.log(`[ClearData] Will delete ${snapshot.size} docs from ${subcollection.id} subcollection`);
    }
    
    // Delete the entire user document (this deletes all subcollections automatically)
    await adminDb.recursiveDelete(userWorkoutsDocRef);
    console.log(`[ClearData] Deleted entire userWorkouts/${userId} document with all subcollections`);

    // 2. Delete legacy workoutLogs collection docs for this user
    const legacyLogsRef = adminDb.collection('workoutLogs');
    const legacyQuery = legacyLogsRef.where('userId', '==', userId);
    const legacySnapshot = await legacyQuery.get();
    
    if (!legacySnapshot.empty) {
      const batch = adminDb.batch();
      legacySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      totalDeleted += legacySnapshot.size;
      console.log(`[ClearData] Deleted ${legacySnapshot.size} docs from legacy workoutLogs`);
    }

    // 3. Delete user streak data
    const streakRef = adminDb.collection('userStreaks').doc(userId);
    const streakDoc = await streakRef.get();
    if (streakDoc.exists) {
      await streakRef.delete();
      totalDeleted += 1;
      console.log(`[ClearData] Deleted user streak document`);
    }

    // 4. Reset workoutStreak in user profile (but keep the profile)
    const userRef = adminDb.collection('users').doc(userId);
    await userRef.update({
      workoutStreak: {
        currentStreak: 0,
        longestStreak: 0,
        lastWorkoutDate: null,
        totalWorkoutDays: 0,
        streakStartDate: null,
        lostStreak: null,
        streakLostDate: null
      }
    });
    console.log(`[ClearData] Reset user streak in profile`);

    return { deleted: totalDeleted, error: null };
  } catch (error) {
    console.error('[ClearData] Firestore deletion error:', error);
    return { deleted: 0, error: error.message };
  }
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const decodedToken = await verifyAuthToken(req.headers.authorization);
    
    if (!decodedToken) {
      return res.status(401).json({ error: 'Unauthorized - Invalid or missing token' });
    }

    const userId = decodedToken.uid;
    console.log(`[ClearData] Starting data clear for user: ${userId}`);

    // Verify the request body matches the authenticated user (extra security)
    const { confirmUserId } = req.body;
    if (confirmUserId && confirmUserId !== userId) {
      return res.status(403).json({ error: 'User ID mismatch' });
    }

    // Delete data from both GCS and Firestore in parallel
    const [gcsResult, firestoreResult] = await Promise.all([
      deleteGCSFolder(userId),
      deleteFirestoreWorkoutLogs(userId)
    ]);

    const success = !gcsResult.error && !firestoreResult.error;
    const totalDeleted = gcsResult.deleted + firestoreResult.deleted;

    console.log(`[ClearData] Completed for user: ${userId}`, {
      gcsFilesDeleted: gcsResult.deleted,
      firestoreDocsDeleted: firestoreResult.deleted,
      success
    });

    return res.status(200).json({
      success,
      message: success 
        ? 'All data cleared successfully' 
        : 'Partial data cleared with some errors',
      details: {
        gcsFilesDeleted: gcsResult.deleted,
        firestoreDocsDeleted: firestoreResult.deleted,
        gcsError: gcsResult.error,
        firestoreError: firestoreResult.error
      }
    });

  } catch (error) {
    console.error('[ClearData] Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Failed to clear user data',
      message: error.message 
    });
  }
}
