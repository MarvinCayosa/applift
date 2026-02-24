/**
 * AI Recommendation Service
 * Client-side service for fetching and caching AI-generated workout recommendations.
 * Communicates with the server-side API route that calls Vertex AI.
 */

import { db } from '../config/firestore';
import { 
  doc, getDoc, setDoc, updateDoc, serverTimestamp, increment 
} from 'firebase/firestore';

// ============================================================
// FIRESTORE CACHING LAYER
// ============================================================

/**
 * Get cached AI recommendation for a specific exercise from Firestore.
 * Path: users/{uid}/aiRecommendations/{equipment}_{exerciseName}
 */
export async function getCachedRecommendation(uid, equipment, exerciseName) {
  try {
    const docId = `${equipment}_${exerciseName}`.replace(/\s+/g, '_');
    const docRef = doc(db, 'users', uid, 'aiRecommendations', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        exists: true,
        recommendation: data.recommendation,
        reasoning: data.reasoning,
        generatedAt: data.generatedAt,
        regenCount: data.regenCount || 0,
        triggeredBy: data.triggeredBy,
      };
    }

    return { exists: false, recommendation: null };
  } catch (error) {
    console.error('Error fetching cached recommendation:', error);
    return { exists: false, recommendation: null, error: error.message };
  }
}

/**
 * Save AI recommendation to Firestore cache.
 */
export async function cacheRecommendation(uid, equipment, exerciseName, recommendation, reasoning, triggeredBy = 'initial') {
  try {
    const docId = `${equipment}_${exerciseName}`.replace(/\s+/g, '_');
    const docRef = doc(db, 'users', uid, 'aiRecommendations', docId);
    const existing = await getDoc(docRef);

    const data = {
      recommendation,
      reasoning,
      equipment,
      exerciseName,
      triggeredBy,
      generatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (existing.exists()) {
      data.regenCount = increment(1);
      await updateDoc(docRef, data);
    } else {
      data.regenCount = 0;
      data.createdAt = serverTimestamp();
      await setDoc(docRef, data);
    }

    return { success: true };
  } catch (error) {
    console.error('Error caching recommendation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get the regeneration count for a specific exercise recommendation.
 */
export async function getRegenCount(uid, equipment, exerciseName) {
  try {
    const docId = `${equipment}_${exerciseName}`.replace(/\s+/g, '_');
    const docRef = doc(db, 'users', uid, 'aiRecommendations', docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data().regenCount || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error getting regen count:', error);
    return 0;
  }
}

// ============================================================
// AI RECOMMENDATION API CALLS
// ============================================================

const MAX_REGEN_COUNT = 5;

/**
 * Generate an AI recommendation by calling the server-side API route.
 * 
 * @param {Object} params
 * @param {string} params.uid - User ID
 * @param {string} params.idToken - Firebase auth ID token
 * @param {Object} params.userProfile - User profile data
 * @param {string} params.equipment - Equipment type
 * @param {string} params.exerciseName - Exercise name
 * @param {Array} params.pastSessions - Summarized past session data (optional)
 * @param {string} params.triggeredBy - What triggered the generation ('initial' | 'new_session' | 'regenerate')
 * @returns {Object} { success, recommendation, reasoning, error }
 */
export async function generateRecommendation({ 
  uid, idToken, userProfile, equipment, exerciseName, pastSessions = [], triggeredBy = 'initial' 
}) {
  console.log('🚀 [AI Service] Generate recommendation:', {
    uid: uid?.slice(0, 8) + '...',
    hasToken: !!idToken,
    equipment,
    exerciseName,
    triggeredBy,
    pastSessionsCount: pastSessions.length
  });
  try {
    // Check regen limit for manual regeneration
    if (triggeredBy === 'regenerate') {
      const regenCount = await getRegenCount(uid, equipment, exerciseName);
      if (regenCount >= MAX_REGEN_COUNT) {
        return { 
          success: false, 
          error: `Regeneration limit reached (${MAX_REGEN_COUNT}/${MAX_REGEN_COUNT}). Recommendations refresh automatically after each workout.`,
          limitReached: true 
        };
      }
    }

    console.log('📡 [AI Service] Making API request to /api/ai-recommendation');
    const response = await fetch('/api/ai-recommendation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        userProfile: {
          age: userProfile.age,
          gender: userProfile.gender,
          weight: userProfile.weight,
          weightUnit: userProfile.weightUnit || 'kg',
          height: userProfile.height,
          heightUnit: userProfile.heightUnit || 'cm',
          strengthExperience: userProfile.strengthExperience,
          activityLevel: userProfile.activityLevel,
          fitnessGoal: userProfile.fitnessGoal,
          trainingPriority: userProfile.trainingPriority,
          injuries: userProfile.injuries || [],
        },
        equipment,
        exerciseName,
        pastSessions,
        triggeredBy,
      }),
    });

    console.log('📡 [AI Service] Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ [AI Service] API error:', {
        status: response.status,
        statusText: response.statusText,
        errorData
      });
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [AI Service] Success:', {
      hasRecommendation: !!data.recommendation,
      hasReasoning: !!data.reasoning
    });

    // Cache the result
    await cacheRecommendation(
      uid, equipment, exerciseName,
      data.recommendation,
      data.reasoning,
      triggeredBy
    );

    return {
      success: true,
      recommendation: data.recommendation,
      reasoning: data.reasoning,
    };
  } catch (error) {
    console.error('Error generating recommendation:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to generate recommendation',
    };
  }
}

/**
 * Get user's AI recommendation settings (toggle state).
 * Stored in user profile: userProfile.aiRecommendationsEnabled
 */
export async function getAISettings(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data();
      return {
        enabled: data.aiRecommendationsEnabled !== false, // Default to true
      };
    }
    return { enabled: true };
  } catch (error) {
    console.error('Error getting AI settings:', error);
    return { enabled: true };
  }
}

/**
 * Toggle AI recommendations on or off.
 */
export async function setAIEnabled(uid, enabled) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { 
      aiRecommendationsEnabled: enabled,
      updatedAt: serverTimestamp(),
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating AI settings:', error);
    return { success: false, error: error.message };
  }
}
