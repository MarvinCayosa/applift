/**
 * Share Workout API
 * POST: Creates a shareable link for a workout session.
 * Stores a trimmed snapshot of session data in a public "sharedWorkouts" collection.
 * Returns { shareId, shareUrl }.
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    const { sessionData } = req.body;
    if (!sessionData) {
      return res.status(400).json({ error: 'Missing sessionData' });
    }

    // Check if already shared (avoid duplicates)
    const workoutId = sessionData.workoutId;
    if (workoutId) {
      const existing = await db.collection('sharedWorkouts')
        .where('workoutId', '==', workoutId)
        .where('uid', '==', uid)
        .limit(1)
        .get();
      
      if (!existing.empty) {
        const existingDoc = existing.docs[0];
        const host = req.headers.host || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        return res.status(200).json({
          shareId: existingDoc.id,
          shareUrl: `${protocol}://${host}/shared/${existingDoc.id}`,
        });
      }
    }

    // Create share document with trimmed data (no raw samples/chartData to save space)
    const trimmedSets = (sessionData.setsData || []).map(set => ({
      setNumber: set.setNumber,
      reps: set.reps,
      duration: set.duration,
      targetROM: set.targetROM || null,
      romCalibrated: set.romCalibrated || false,
      romUnit: set.romUnit || '°',
      repsData: (set.repsData || []).map(rep => ({
        repNumber: rep.repNumber,
        time: rep.time,
        duration: rep.duration,
        rom: rep.rom ?? null,
        romFulfillment: rep.romFulfillment ?? null,
        romUnit: rep.romUnit || '°',
        peakVelocity: rep.peakVelocity ?? null,
        smoothnessScore: rep.smoothnessScore ?? null,
        classification: rep.classification || null,
        quality: rep.quality || null,
        liftingTime: rep.liftingTime ?? 0,
        loweringTime: rep.loweringTime ?? 0,
      })),
    }));

    const shareDoc = {
      uid,
      workoutId: workoutId || null,
      exerciseName: sessionData.exerciseName || '',
      equipmentName: sessionData.equipmentName || '',
      weight: sessionData.weight || 0,
      weightUnit: sessionData.weightUnit || 'kg',
      totalSets: sessionData.totalSets || 0,
      totalReps: sessionData.totalReps || 0,
      plannedSets: sessionData.plannedSets || 0,
      plannedReps: sessionData.plannedReps || 0,
      totalTime: sessionData.totalTime || 0,
      calories: sessionData.calories || 0,
      date: sessionData.date || null,
      setsData: trimmedSets,
      // Scores
      fatigueScore: sessionData.fatigueScore ?? null,
      fatigueLevel: sessionData.fatigueLevel || null,
      consistencyScore: sessionData.consistencyScore ?? null,
      // ML Classification
      mlClassification: sessionData.mlClassification || null,
      // Phase timing
      avgConcentric: sessionData.avgConcentric || 0,
      avgEccentric: sessionData.avgEccentric || 0,
      // AI Insights
      aiInsights: sessionData.aiInsights || null,
      // Set type info
      isRecommendation: sessionData.isRecommendation || false,
      isCustomSet: sessionData.isCustomSet || false,
      // Meta
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      displayName: decoded.name || 'AppLift User',
    };

    const docRef = await db.collection('sharedWorkouts').add(shareDoc);

    const host = req.headers.host || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';

    return res.status(200).json({
      shareId: docRef.id,
      shareUrl: `${protocol}://${host}/shared/${docRef.id}`,
    });
  } catch (error) {
    console.error('[Share API] Error:', error.message);
    return res.status(500).json({ error: 'Failed to create share link' });
  }
}
