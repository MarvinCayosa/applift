/**
 * useAIRecommendation Hook
 * 
 * Manages AI recommendation lifecycle:
 * - Check cache first (Firestore)
 * - Only call API when needed (no cached data, new session, or manual regen)
 * - Handle offline gracefully (use cached data)
 * - Respect AI toggle setting
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  getCachedRecommendation, 
  generateRecommendation, 
  getRegenCount 
} from '../services/aiRecommendationService';

const MAX_REGEN = 5;

export function useAIRecommendation({ equipment, exerciseName, pastSessions = [], enabled = true }) {
  const { user, userProfile } = useAuth();
  
  const [recommendation, setRecommendation] = useState(null); // { weight, sets, reps, restTimeSeconds }
  const [reasoning, setReasoning] = useState(null); // { safetyJustification, guidelineReference, progressionNotes }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [regenCount, setRegenCount] = useState(0);
  const [isFromCache, setIsFromCache] = useState(false);
  
  // Prevent duplicate calls
  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /**
   * Load recommendation — checks cache first, generates if needed.
   */
  const loadRecommendation = useCallback(async (forceGenerate = false, trigger = 'initial') => {
    console.log('🎯 [AI Hook] loadRecommendation called:', {
      uid: user?.uid?.slice(0, 8) + '...',
      equipment,
      exerciseName,
      enabled,
      forceGenerate,
      trigger,
      pastSessionsCount: pastSessions.length
    });

    if (!user?.uid || !equipment || !exerciseName || !enabled) {
      console.log('⏭️ [AI Hook] Skipping - missing requirements:', {
        hasUser: !!user?.uid,
        hasEquipment: !!equipment,
        hasExerciseName: !!exerciseName,
        enabled
      });
      return;
    }
    
    if (fetchingRef.current) {
      console.log('⏭️ [AI Hook] Already fetching, skipping...');
      return;
    }

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Step 1: Check Firestore cache (unless forcing regeneration)
      if (!forceGenerate) {
        const cached = await getCachedRecommendation(user.uid, equipment, exerciseName);
        
        if (cached.exists && cached.recommendation) {
          const cachedSessionCount = cached.sessionCountAtGeneration ?? 0;
          const currentSessionCount = pastSessions.length;
          
          console.log('📊 [AI Hook] Session count check:', {
            cachedSessionCount,
            currentSessionCount,
            needsRefresh: currentSessionCount > cachedSessionCount
          });
          
          // If user completed more sessions since last recommendation, auto-regenerate
          if (currentSessionCount > cachedSessionCount) {
            console.log('🔄 [AI Hook] New session detected! Triggering fresh recommendation...');
            // Don't return cache - fall through to generate new recommendation
            // Set trigger to 'new_session' for this auto-refresh
            trigger = 'new_session';
          } else {
            // Use cached recommendation
            if (mountedRef.current) {
              setRecommendation(cached.recommendation);
              setReasoning(cached.reasoning);
              setRegenCount(cached.regenCount || 0);
              setIsFromCache(true);
              setLoading(false);
              fetchingRef.current = false;
            }
            return;
          }
        }
      }

      // Step 2: Check if offline
      if (!navigator.onLine) {
        // Try cache as fallback even if forceGenerate was requested
        const cached = await getCachedRecommendation(user.uid, equipment, exerciseName);
        if (cached.exists && cached.recommendation) {
          if (mountedRef.current) {
            setRecommendation(cached.recommendation);
            setReasoning(cached.reasoning);
            setRegenCount(cached.regenCount || 0);
            setIsFromCache(true);
            setError('You are offline. Showing last cached recommendation.');
            setLoading(false);
            fetchingRef.current = false;
          }
          return;
        }
        
        if (mountedRef.current) {
          setError('You are offline and no cached recommendation is available.');
          setLoading(false);
          fetchingRef.current = false;
        }
        return;
      }

      // Step 3: Generate new recommendation via API
      console.log('🔄 [AI Hook] Generating new recommendation via API');
      const idToken = await user.getIdToken();
      console.log('🔑 [AI Hook] Got ID token, length:', idToken?.length);
      
      const result = await generateRecommendation({
        uid: user.uid,
        idToken,
        userProfile: userProfile || {},
        equipment,
        exerciseName,
        pastSessions,
        triggeredBy: trigger,
      });

      console.log('✅ [AI Hook] API result:', {
        success: result.success,
        hasRecommendation: !!result.recommendation,
        hasReasoning: !!result.reasoning,
        error: result.error
      });

      if (!mountedRef.current) return;

      if (result.success) {
        setRecommendation(result.recommendation);
        setReasoning(result.reasoning);
        setIsFromCache(false);
        // Refresh regen count
        const count = await getRegenCount(user.uid, equipment, exerciseName);
        setRegenCount(count);
      } else {
        setError(result.error || 'Failed to generate recommendation');
        
        // If API failed, try cache as fallback
        if (!result.limitReached) {
          const cached = await getCachedRecommendation(user.uid, equipment, exerciseName);
          if (cached.exists && cached.recommendation) {
            setRecommendation(cached.recommendation);
            setReasoning(cached.reasoning);
            setIsFromCache(true);
          }
        }
      }
    } catch (err) {
      console.error('❌ [AI Hook] Error in loadRecommendation:', err.message);
      console.error('❌ [AI Hook] Full error:', err);
      if (mountedRef.current) {
        setError(err.message || 'An unexpected error occurred');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
      fetchingRef.current = false;
    }
  }, [user, userProfile, equipment, exerciseName, pastSessions, enabled]);

  /**
   * Regenerate recommendation (manual button press).
   */
  const regenerate = useCallback(async () => {
    if (regenCount >= MAX_REGEN) {
      setError(`Regeneration limit reached (${MAX_REGEN}/${MAX_REGEN}). Recommendations refresh automatically after each workout.`);
      return;
    }
    await loadRecommendation(true, 'regenerate');
  }, [loadRecommendation, regenCount]);

  /**
   * Trigger recommendation refresh after a new session.
   */
  const refreshAfterSession = useCallback(async (newPastSessions) => {
    await loadRecommendation(true, 'new_session');
  }, [loadRecommendation]);

  // Auto-load on mount (only when enabled and exercise is set)
  useEffect(() => {
    if (enabled && equipment && exerciseName && user?.uid) {
      loadRecommendation(false, 'initial');
    }
  }, [enabled, equipment, exerciseName, user?.uid]);

  return {
    recommendation,
    reasoning,
    loading,
    error,
    regenCount,
    maxRegen: MAX_REGEN,
    isFromCache,
    canRegenerate: regenCount < MAX_REGEN,
    regenerate,
    refreshAfterSession,
    reload: () => loadRecommendation(false, 'initial'),
  };
}
