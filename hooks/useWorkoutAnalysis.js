/**
 * useWorkoutAnalysis Hook
 * 
 * Fetches and manages workout analysis data from the API.
 * Handles:
 * - Triggering analysis for a workout
 * - Caching analysis results
 * - Real-time updates
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Hook to analyze a workout and get results
 */
export function useWorkoutAnalysis() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Trigger analysis for a workout
   * @param {Object} params - { workoutId, gcsPath, forceReanalyze }
   */
  const analyzeWorkout = useCallback(async ({ workoutId, gcsPath, forceReanalyze = false }) => {
    if (!user?.uid) {
      setError('User not authenticated');
      return null;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      
      const response = await fetch('/api/analyze-workout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          workoutId,
          gcsPath,
          forceReanalyze
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const result = await response.json();
      setAnalysis(result);
      return result;

    } catch (err) {
      console.error('[useWorkoutAnalysis] Error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [user]);

  /**
   * Get existing analysis without re-analyzing
   * If analysis is stale (old version), automatically triggers reanalysis
   * @param {string} workoutId
   * @param {string} gcsPath - Optional GCS path for reanalysis
   */
  const getAnalysis = useCallback(async (workoutId, gcsPath = null) => {
    if (!user?.uid) {
      setError('User not authenticated');
      return null;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      
      const response = await fetch(`/api/analyze-workout?workoutId=${workoutId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 404) {
        // No existing analysis, return null without error
        return null;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch analysis');
      }

      const result = await response.json();
      
      // Check if analysis is stale and needs reanalysis
      if (result._needsReanalysis) {
        console.log(`[useWorkoutAnalysis] Stale analysis (v${result._cachedVersion} → v${result._currentVersion}), reanalyzing...`);
        
        // Trigger reanalysis via POST
        const reanalyzeResponse = await fetch('/api/analyze-workout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            workoutId,
            gcsPath,
            forceReanalyze: true
          })
        });
        
        if (reanalyzeResponse.ok) {
          const freshResult = await reanalyzeResponse.json();
          setAnalysis(freshResult);
          return freshResult;
        } else {
          // Fall back to stale data if reanalysis fails
          console.warn('[useWorkoutAnalysis] Reanalysis failed, using stale data');
          setAnalysis(result);
          return result;
        }
      }
      
      setAnalysis(result);
      return result;

    } catch (err) {
      console.error('[useWorkoutAnalysis] Error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [user]);

  /**
   * Clear the current analysis
   */
  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  return {
    analysis,
    isAnalyzing,
    error,
    analyzeWorkout,
    getAnalysis,
    clearAnalysis
  };
}

/**
 * Transform raw analysis data into format needed by UI components
 */
export function transformAnalysisForUI(analysis) {
  if (!analysis) return null;

  const { summary, fatigue, consistency, setsAnalysis, repMetrics, insights, mlClassification } = analysis;

  // Calculate baseline velocity from first rep for velocity loss calculations
  const firstRepVelocity = repMetrics?.[0]?.peakVelocity || repMetrics?.[0]?.gyroPeak || 0;

  // Transform sets data for WorkoutSummaryCard and RepByRepCard
  const setsData = setsAnalysis?.map(set => ({
    setNumber: set.setNumber,
    reps: set.repsCount,
    classification: set.classification || null,
    repsData: set.repMetrics?.map((rep, idx) => {
      const velocity = rep.peakVelocity || rep.gyroPeak || 0;
      const velocityLossPercent = firstRepVelocity > 0 
        ? ((firstRepVelocity - velocity) / firstRepVelocity) * 100 
        : 0;
      
      return {
        repNumber: rep.repNumber,
        time: (rep.durationMs / 1000).toFixed(1),
        rom: Math.round(rep.romDegrees || rep.rom),
        peakVelocity: velocity?.toFixed ? velocity.toFixed(2) : String(velocity || '0'),
        velocityLossPercent: Math.round(velocityLossPercent * 10) / 10,
        isEffective: velocityLossPercent < 10, // Industry standard threshold
        chartData: rep.chartData || [],
        liftingTime: rep.liftingTime || 0,
        loweringTime: rep.loweringTime || 0,
        smoothnessScore: rep.smoothnessScore || 50,
        quality: rep.smoothnessScore >= 80 ? 'clean' : 'uncontrolled',
        // Include ML classification for each rep
        classification: rep.classification || null
      };
    }) || []
  })) || [];

  // Transform chart data (combined from all reps)
  const chartData = repMetrics?.flatMap(rep => rep.chartData || []) || [];

  // Calculate totals
  const totalReps = summary?.totalReps || 0;
  // Note: totalDurationMs from API is sum of rep durations only (not wall-clock time).
  // The real wall-clock workout time comes from the workout monitor's totalTime query param.
  // We store this as activeTime for reference, but don't use it as totalTime.
  const activeTime = Math.round((summary?.totalDurationMs || 0) / 1000);
  const calories = Math.round(activeTime * 0.15 * totalReps); // Rough estimate

  return {
    // Summary data
    totalSets: summary?.totalSets || 0,
    totalReps,
    activeTime, // Sum of rep durations (not wall-clock time)
    calories,
    
    // Phase timing
    avgConcentric: summary?.avgConcentric || 0,
    avgEccentric: summary?.avgEccentric || 0,
    concentricPercent: summary?.concentricPercent || 50,
    eccentricPercent: summary?.eccentricPercent || 50,
    
    // Fatigue analysis
    fatigueScore: fatigue?.fatigueScore || 0,
    fatigueLevel: fatigue?.fatigueLevel || 'moderate',
    
    // Consistency
    consistencyScore: consistency?.score || 0,
    inconsistentRepIndex: consistency?.inconsistentRepIndex ?? -1,
    
    // Sets data for components
    setsData,
    
    // Chart data for visualization
    chartData,
    
    // Time data (timestamps array)
    timeData: repMetrics?.flatMap((rep, repIdx) => 
      rep.chartData?.map((_, i) => 
        repIdx * 1000 + i * 50 // Approximate timestamps
      ) || []
    ) || [],
    
    // Rep-level data for analysis
    repsData: repMetrics?.map(rep => ({
      repNumber: rep.repNumber,
      setNumber: rep.setNumber,
      classification: rep.classification || null,
      ...rep
    })) || [],
    
    // Insights
    insights: insights || [],
    
    // ROM data
    avgROM: summary?.avgROMDegrees || 0,
    avgSmoothness: summary?.avgSmoothness || 50,
    
    // Velocity metrics for VBT analysis
    baselineVelocity: firstRepVelocity,
    velocityLoss: fatigue?.D_omega ? fatigue.D_omega * 100 : 0, // Overall velocity loss %
    effectiveReps: setsData.flatMap(s => s.repsData).filter(r => r.isEffective).length,
    
    // ML Classification summary
    mlClassification: mlClassification || null,
    
    // Analysis version for cache invalidation
    _analysisVersion: analysis._analysisVersion || 0,
    
    // Raw analysis for debugging
    rawAnalysis: analysis
  };
}

export default useWorkoutAnalysis;
