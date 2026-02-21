/**
 * Workout Data API Route
 *
 * Fetches workout_data.json from GCS for a given session.
 * Used by the session summary page to render IMU graphs.
 *
 * Query params:
 *   gcsPath  – full gs:// path   (preferred)
 *   OR userId + equipment + exercise + workoutId  (constructs the path)
 *
 * Returns the parsed workout_data.json or { error }.
 */

import { Storage } from '@google-cloud/storage';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Firebase Admin
if (!getApps().length) {
  try {
    const pk = (process.env.FIREBASE_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCS_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL,
        privateKey: pk,
      }),
    });
  } catch (e) {
    console.error('[WorkoutData API] Firebase init error:', e);
  }
}

// GCS
let storage;
try {
  storage = new Storage({
    projectId: process.env.GCS_PROJECT_ID,
    credentials: {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  });
} catch (e) {
  console.error('[WorkoutData API] GCS init error:', e);
}

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'applift-imu-data';

async function verifyAuth(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!storage) {
    return res.status(500).json({ error: 'GCS not configured' });
  }

  // Auth
  const decoded = await verifyAuth(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Params (support both query and body)
  const params = { ...req.query, ...req.body };
  let { gcsPath, userId, equipment, exercise, workoutId } = params;

  // Security – user must own the data
  if (userId && userId !== decoded.uid) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  userId = userId || decoded.uid;

  // Build GCS file path
  let filePath;
  if (gcsPath) {
    filePath = gcsPath.replace(`gs://${BUCKET_NAME}/`, '');
    if (!filePath.endsWith('.json')) {
      filePath = `${filePath}/workout_data.json`;
    }
  } else if (equipment && exercise && workoutId) {
    // Try listing files to find the correct date-prefixed folder
    const prefix = `users/${userId}/${equipment}/${exercise}/`;
    try {
      const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix });
      const match = files.find(
        (f) => f.name.includes(workoutId) && f.name.endsWith('workout_data.json')
      );
      if (match) {
        filePath = match.name;
      }
    } catch (e) {
      console.error('[WorkoutData API] Listing error:', e);
    }

    if (!filePath) {
      return res.status(404).json({ error: 'Workout data not found in GCS' });
    }
  } else {
    return res.status(400).json({ error: 'Provide gcsPath, or equipment+exercise+workoutId' });
  }

  // Ensure user path matches
  if (!filePath.includes(`users/${userId}/`)) {
    return res.status(403).json({ error: 'Forbidden – path mismatch' });
  }

  try {
    console.log('[WorkoutData API] Fetching:', filePath);
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found', filePath });
    }

    const [content] = await file.download();
    const data = JSON.parse(content.toString('utf8'));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[WorkoutData API] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
