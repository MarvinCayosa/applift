/**
 * Get Shared Workout API
 * GET: /api/get-shared-workout?id=xxx
 * Public endpoint — no authentication required.
 * Returns the shared session data for display.
 */

import admin from 'firebase-admin';

// Firebase Admin init (reuse existing)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing share ID' });
  }

  try {
    const snap = await db.collection('sharedWorkouts').doc(id).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Shared workout not found' });
    }

    const data = snap.data();

    // Strip internal fields
    const { uid, ...publicData } = data;

    // Convert Firestore timestamp
    if (publicData.createdAt?.toDate) {
      publicData.createdAt = publicData.createdAt.toDate().toISOString();
    }

    return res.status(200).json({ session: publicData });
  } catch (error) {
    console.error('[Get Shared] Error:', error.message);
    return res.status(500).json({ error: 'Failed to retrieve shared workout' });
  }
}
