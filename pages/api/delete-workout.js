/**
 * Delete Workout API Route
 *
 * Hard-deletes a single workout session from both Firestore and GCS.
 * Called when user discards / cancels a workout.
 *
 * Accepts:
 *   - workoutId  (required)
 *   - gcsPath    (optional — full GCS prefix to delete)
 *   - equipment  (optional — used to build Firestore path)
 *   - exercise   (optional — used to build Firestore path)
 *
 * Deletes:
 *   1. GCS folder  users/{userId}/{equipment}/{exercise}/{date}_{workoutId}/
 *   2. Firestore   userWorkouts/{userId}/{equipment}/{exercise}/logs/{workoutId}
 *   3. Firestore   userWorkouts/{userId}/{equipment}/{exercise}/analytics/{workoutId}
 *   4. Legacy      workoutLogs/{workoutId}  (if exists)
 */

import { Storage } from '@google-cloud/storage';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ── Firebase Admin init ──────────────────────────────────────────────
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
    console.error('[DeleteWorkout] Firebase Admin init error:', error);
  }
} else {
  adminDb = getFirestore();
}

// ── GCS init ─────────────────────────────────────────────────────────
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
  console.error('[DeleteWorkout] GCS init error:', error);
}

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'applift-imu-data';

// ── Helpers ──────────────────────────────────────────────────────────
const sanitizeForPath = (str) => {
  if (!str) return 'unknown';
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
};

async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
  } catch {
    return null;
  }
}

// ── Delete GCS files under a prefix ──────────────────────────────────
async function deleteGCSFiles(prefix) {
  if (!storage || !prefix) return { deleted: 0, error: null };

  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const [files] = await bucket.getFiles({ prefix });

    if (files.length === 0) {
      console.log(`[DeleteWorkout] No GCS files found for prefix: ${prefix}`);
      return { deleted: 0, error: null };
    }

    await Promise.all(files.map((f) => f.delete()));
    console.log(`[DeleteWorkout] Deleted ${files.length} GCS files under ${prefix}`);
    return { deleted: files.length, error: null };
  } catch (error) {
    console.error('[DeleteWorkout] GCS deletion error:', error);
    return { deleted: 0, error: error.message };
  }
}

// ── Delete Firestore documents ───────────────────────────────────────
async function deleteFirestoreDocs(userId, equipment, exercise, workoutId) {
  if (!adminDb) return { deleted: 0, error: null };

  let totalDeleted = 0;

  try {
    const eq = sanitizeForPath(equipment);
    const ex = sanitizeForPath(exercise);

    if (eq && ex && eq !== 'unknown' && ex !== 'unknown') {
      const exerciseDocRef = adminDb
        .collection('userWorkouts')
        .doc(userId)
        .collection(eq)
        .doc(ex);

      // Delete logs/{workoutId}
      const logRef = exerciseDocRef.collection('logs').doc(workoutId);
      const logSnap = await logRef.get();
      if (logSnap.exists) {
        await logRef.delete();
        totalDeleted++;
        console.log(`[DeleteWorkout] Deleted logs/${workoutId}`);
      }

      // Delete analytics/{workoutId}
      const analyticsRef = exerciseDocRef.collection('analytics').doc(workoutId);
      const analyticsSnap = await analyticsRef.get();
      if (analyticsSnap.exists) {
        await analyticsRef.delete();
        totalDeleted++;
        console.log(`[DeleteWorkout] Deleted analytics/${workoutId}`);
      }
    }

    // Delete from legacy workoutLogs collection (match by odWorkoutId)
    const legacyQuery = adminDb
      .collection('workoutLogs')
      .where('odWorkoutId', '==', workoutId)
      .limit(5);
    const legacySnap = await legacyQuery.get();

    if (!legacySnap.empty) {
      const batch = adminDb.batch();
      legacySnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += legacySnap.size;
      console.log(`[DeleteWorkout] Deleted ${legacySnap.size} legacy workoutLogs docs`);
    }

    return { deleted: totalDeleted, error: null };
  } catch (error) {
    console.error('[DeleteWorkout] Firestore deletion error:', error);
    return { deleted: totalDeleted, error: error.message };
  }
}

// ── Handler ──────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const decoded = await verifyToken(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = decoded.uid;
  const { workoutId, gcsPath, equipment, exercise } = req.body;

  if (!workoutId) {
    return res.status(400).json({ error: 'workoutId is required' });
  }

  console.log(`[DeleteWorkout] Deleting workout ${workoutId} for user ${userId}`);

  // Build GCS prefix — prefer explicit gcsPath, fall back to equipment/exercise pattern
  let gcsPrefix = '';
  if (gcsPath) {
    // gcsPath may be like "users/{uid}/{eq}/{ex}/{date}_{wid}"
    // or "gs://bucket/users/..." — strip bucket URI if present
    gcsPrefix = gcsPath.replace(/^gs:\/\/[^/]+\//, '');
    // Ensure trailing slash for directory listing
    if (gcsPrefix && !gcsPrefix.endsWith('/')) gcsPrefix += '/';
  } else if (equipment && exercise) {
    // We don't know the exact date prefix, so search by workoutId suffix
    const eq = sanitizeForPath(equipment);
    const ex = sanitizeForPath(exercise);
    gcsPrefix = `users/${userId}/${eq}/${ex}/`;
  }

  // Execute deletions in parallel
  const [gcsResult, firestoreResult] = await Promise.all([
    gcsPrefix ? deleteGCSFilesForWorkout(userId, gcsPrefix, workoutId) : { deleted: 0, error: null },
    deleteFirestoreDocs(userId, equipment, exercise, workoutId),
  ]);

  const success = !gcsResult.error && !firestoreResult.error;

  console.log(`[DeleteWorkout] Done for ${workoutId}:`, {
    gcsDeleted: gcsResult.deleted,
    firestoreDeleted: firestoreResult.deleted,
    success,
  });

  return res.status(200).json({
    success,
    details: {
      gcsFilesDeleted: gcsResult.deleted,
      firestoreDocsDeleted: firestoreResult.deleted,
      gcsError: gcsResult.error || null,
      firestoreError: firestoreResult.error || null,
    },
  });
}

/**
 * Delete GCS files for a specific workout.
 * If gcsPrefix already points to the exact workout folder, delete it directly.
 * If it's a broader prefix (equipment/exercise level), filter files matching the workoutId.
 */
async function deleteGCSFilesForWorkout(userId, gcsPrefix, workoutId) {
  if (!storage) return { deleted: 0, error: null };

  try {
    const bucket = storage.bucket(BUCKET_NAME);

    // If gcsPrefix already contains the workoutId (exact folder), use it directly
    if (gcsPrefix.includes(workoutId)) {
      return deleteGCSFiles(gcsPrefix);
    }

    // Otherwise, list files under the broader prefix and filter by workoutId
    const [files] = await bucket.getFiles({ prefix: gcsPrefix });
    const matchingFiles = files.filter((f) => f.name.includes(workoutId));

    if (matchingFiles.length === 0) {
      console.log(`[DeleteWorkout] No GCS files matching workoutId=${workoutId}`);
      return { deleted: 0, error: null };
    }

    await Promise.all(matchingFiles.map((f) => f.delete()));
    console.log(`[DeleteWorkout] Deleted ${matchingFiles.length} GCS files for workout ${workoutId}`);
    return { deleted: matchingFiles.length, error: null };
  } catch (error) {
    console.error('[DeleteWorkout] GCS workout deletion error:', error);
    return { deleted: 0, error: error.message };
  }
}
