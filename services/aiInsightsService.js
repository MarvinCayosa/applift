/**
 * AI Session Insights Service
 * Client-side service to generate and cache AI session insights.
 *
 * Flow:
 *  1. Check Firestore cache in the workout log doc (aiInsights field)
 *  2. If cached → return it immediately
 *  3. If not → call /api/ai-insights → save to Firestore → return
 *
 * One generation per session. No regenerations.
 */

import { db } from '../config/firestore';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Sanitize a string to a Firestore-safe path segment.
 */
function sanitize(str) {
  return (str || 'unknown')
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Fetch cached AI insights from the workout log document.
 * Returns { summary, bullets, generatedAt } or null.
 */
export async function getCachedInsights(userId, equipment, exercise, workoutId) {
  try {
    const eq = sanitize(equipment);
    const ex = sanitize(exercise);
    const ref = doc(db, 'userWorkouts', userId, eq, ex, 'logs', workoutId);
    const snap = await getDoc(ref);
    const data = snap.data();
    if (data?.aiInsights?.summary) {
      return data.aiInsights;
    }
    return null;
  } catch (err) {
    console.warn('[AIInsights] Cache fetch failed:', err.message);
    return null;
  }
}

/**
 * Generate AI insights for a workout session.
 * Calls the API, saves to Firestore, and returns the result.
 *
 * @param {Object} params
 * @param {Object} params.user - Firebase auth user (must have getIdToken)
 * @param {string} params.equipment - Equipment name
 * @param {string} params.exerciseName - Exercise name
 * @param {string} params.workoutId - Workout ID
 * @param {Object} params.metrics - All workout metrics to send to the AI
 * @returns {{ summary: string, bullets: string[], generatedAt: string } | null}
 */
export async function generateInsights({ user, equipment, exerciseName, workoutId, metrics }) {
  try {
    const token = await user.getIdToken();

    const res = await fetch('/api/ai-insights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ metrics }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    const { summary, bullets } = await res.json();

    const insights = {
      summary,
      bullets,
      generatedAt: new Date().toISOString(),
    };

    // Persist to Firestore workout log
    const eq = sanitize(equipment);
    const ex = sanitize(exerciseName);
    const ref = doc(db, 'userWorkouts', user.uid, eq, ex, 'logs', workoutId);
    await setDoc(ref, { aiInsights: insights }, { merge: true });
    console.log('[AIInsights] Saved insights to Firestore');

    return insights;
  } catch (err) {
    console.error('[AIInsights] Generation failed:', err.message);
    return null;
  }
}
