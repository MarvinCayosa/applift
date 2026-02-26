/**
 * useSessionDetailsData Hook
 *
 * Combines Firestore session log + analytics + GCS workout_data.json
 * into a single view-model consumed by Session Details components.
 *
 * Firestore paths:
 *   Log:       userWorkouts/{userId}/{equipment}/{exercise}/logs/{workoutId}
 *   Analytics: userWorkouts/{userId}/{equipment}/{exercise}/analytics/{workoutId}
 *
 * GCS:
 *   workout_data.json fetched via /api/workout-data
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getWorkoutLogByPath } from '../services/workoutLogService';
import { transformAnalysisForUI } from './useWorkoutAnalysis';
import { db } from '../config/firestore';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { loadCalibrationFromFirestore, loadCalibration } from '../components/CalibrationModal';

/**
 * @param {Object} params
 * @param {string} params.logId      – Firestore document ID of the workout log
 * @param {string} params.equipment  – equipment slug (e.g. 'dumbbell')
 * @param {string} params.exercise   – exercise slug (e.g. 'overhead-triceps-extension')
 */
export default function useSessionDetailsData({ logId, equipment, exercise }) {
  const { user } = useAuth();

  // Raw Firestore data
  const [log, setLog] = useState(null);
  const [rawAnalysis, setRawAnalysis] = useState(null);
  const [gcsData, setGcsData] = useState(null);
  const [romCalibration, setRomCalibration] = useState(null);

  // Loading / error states
  const [logLoading, setLogLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [gcsLoading, setGcsLoading] = useState(false);
  const [error, setError] = useState(null);

  // ────────────────────────────────────────────────────
  // 1. Fetch session log from Firestore
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!logId || !user?.uid) return; // keep loading=true until params arrive

    setLogLoading(true);
    getWorkoutLogByPath(user.uid, equipment || '', exercise || '', logId)
      .then((data) => {
        setLog(data);
        setLogLoading(false);
      })
      .catch((err) => {
        console.error('[useSessionDetailsData] log fetch error:', err);
        setError(err.message);
        setLogLoading(false);
      });
  }, [logId, user?.uid, equipment, exercise]);

  // ────────────────────────────────────────────────────
  // 2. Fetch analytics from Firestore
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!logId || !user?.uid) return; // keep loading=true until params arrive

    const fetchAnalytics = async () => {
      setAnalyticsLoading(true);
      try {
        // Try direct path first
        if (equipment && exercise) {
          const normalizedEq = equipment.toLowerCase().replace(/[\s_]+/g, '-');
          const normalizedEx = exercise.toLowerCase().replace(/[\s_]+/g, '-');
          const docRef = doc(db, 'userWorkouts', user.uid, normalizedEq, normalizedEx, 'analytics', logId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setRawAnalysis(snap.data());
            setAnalyticsLoading(false);
            return;
          }
        }

        // Fallback: use the API (pass equipment+exercise for direct lookup)
        const token = await user.getIdToken();
        const params = new URLSearchParams({ workoutId: logId });
        if (equipment) params.set('equipment', equipment.toLowerCase().replace(/[\s_]+/g, '-'));
        if (exercise) params.set('exercise', exercise.toLowerCase().replace(/[\s_]+/g, '-'));
        const res = await fetch(`/api/analyze-workout?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRawAnalysis(data);
        }
      } catch (err) {
        console.warn('[useSessionDetailsData] analytics fetch error:', err.message);
      } finally {
        setAnalyticsLoading(false);
      }
    };

    fetchAnalytics();
  }, [logId, user?.uid, equipment, exercise]);

  // ────────────────────────────────────────────────
  // 2b. Load ROM calibration for this exercise
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.uid || !equipment || !exercise) return;
    
    // Try Firestore first, then fall back to localStorage
    loadCalibrationFromFirestore(user.uid, equipment, exercise).then((calibrationData) => {
      if (calibrationData && calibrationData.targetROM) {
        setRomCalibration(calibrationData);
        console.log('[useSessionDetailsData] ✅ Loaded ROM calibration from Firestore:', calibrationData.targetROM);
      } else {
        // Fall back to localStorage
        const localCalibration = loadCalibration(equipment, exercise);
        if (localCalibration && localCalibration.targetROM) {
          setRomCalibration(localCalibration);
          console.log('[useSessionDetailsData] ✅ Loaded ROM calibration from localStorage:', localCalibration.targetROM);
        } else {
          console.log('[useSessionDetailsData] No ROM calibration found for', equipment, exercise);
        }
      }
    }).catch(() => {
      // On error, try localStorage
      const localCalibration = loadCalibration(equipment, exercise);
      if (localCalibration && localCalibration.targetROM) {
        setRomCalibration(localCalibration);
        console.log('[useSessionDetailsData] ✅ Loaded ROM calibration from localStorage (after error):', localCalibration.targetROM);
      }
    });
  }, [user?.uid, equipment, exercise]);

  // ────────────────────────────────────────────────────
  // 3. Fetch GCS workout_data.json once log is available
  // ────────────────────────────────────────────────────
  useEffect(() => {
    if (!log || !user) return;

    const gcsPath = log.gcsPath;
    const odWorkoutId = log.odWorkoutId || log.sessionId || logId;
    if (!gcsPath && !odWorkoutId) {
      setGcsLoading(false);
      return;
    }

    setGcsLoading(true);

    const fetchGCS = async () => {
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams();

        if (gcsPath) {
          params.set('gcsPath', gcsPath);
        } else {
          params.set('equipment', log._equipment || equipment || '');
          params.set('exercise', log._exercise || exercise || '');
          params.set('workoutId', odWorkoutId);
        }

        const res = await fetch(`/api/workout-data?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const { data } = await res.json();
          setGcsData(data);
        }
      } catch (err) {
        console.warn('[useSessionDetailsData] GCS fetch error:', err.message);
      } finally {
        setGcsLoading(false);
      }
    };

    fetchGCS();
  }, [log, user, logId, equipment, exercise]);

  // ────────────────────────────────────────────────────
  // 4. Build the view-model
  // ────────────────────────────────────────────────────
  const analysisUI = useMemo(() => {
    if (!rawAnalysis) return null;
    return transformAnalysisForUI(rawAnalysis);
  }, [rawAnalysis]);
  // Helper to apply ROM calibration context to a set
  const enhanceWithROMContext = useCallback((setData) => {
    if (!romCalibration || !setData) return setData;
    
    // Check if this set has any ROM data (from reps)
    const hasROMData = setData.repsData?.some(rep => 
      rep.rom != null || rep.romFulfillment != null
    );
    
    if (hasROMData) {
      console.log('[useSessionDetailsData] Enhancing set', setData.setNumber, 'with ROM calibration:', romCalibration.targetROM);
      return {
        ...setData,
        romCalibrated: true,
        targetROM: romCalibration.targetROM,
        romUnit: romCalibration.unit || '°',
      };
    }
    
    return setData;
  }, [romCalibration]);
  const viewModel = useMemo(() => {
    if (!log) return null;

    // Dates
    const startDate =
      log.timestamps?.started?.toDate?.() ||
      log.timestamps?.created?.toDate?.() ||
      (log.timestamps?.started ? new Date(log.timestamps.started) : null) ||
      (log.startTime ? new Date(log.startTime) : null) ||
      (log.timestamps?.created ? new Date(log.timestamps.created) : null);

    // Basic session info
    const totalSets = log.results?.totalSets || log.results?.completedSets || analysisUI?.totalSets || 0;
    const totalReps = log.results?.totalReps || log.results?.completedReps || analysisUI?.totalReps || 0;
    // Planned values (what was intended)
    const plannedSets = log.planned?.sets || totalSets;
    const plannedRepsPerSet = log.planned?.reps || (totalSets > 0 ? Math.ceil(totalReps / totalSets) : 10);
    // For backwards compatibility, keep sets/reps as they were used (now using planned for header display)
    const sets = plannedSets;
    const reps = plannedRepsPerSet;
    const weight = log.planned?.weight || log.exercise?.weight || 0;
    const weightUnit = log.planned?.weightUnit || 'kg';
    const calories = log.results?.calories || analysisUI?.calories || 0;
    const totalTimeSec = log.results?.totalTime || 0;
    const durationMs = log.results?.durationMs || 0;
    const totalTime = durationMs ? Math.round(durationMs / 1000) : totalTimeSec;
    const restTimeSec = log.results?.restTime || 40; // default 40s 

    const exerciseName =
      log.exercise?.name || exercise?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '';
    const equipmentName =
      log.exercise?.equipment || equipment?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '';

    // SetData from log or analysis
    // results.setData is the rich array saved by workout-monitor (has ROM calibration)
    // results.sets might be a simple tracking OBJECT { "1": { reps: 3 } } from imu-stream metadata
    // We need to handle both formats
    const rawSetData = log.results?.setData || log.results?.sets || analysisUI?.setsData || [];
    const setData = (() => {
      if (Array.isArray(rawSetData)) return rawSetData;
      // Convert object format { "1": { reps: 3, ... }, "2": { ... } } to array
      if (rawSetData && typeof rawSetData === 'object') {
        return Object.entries(rawSetData)
          .map(([key, val]) => ({
            setNumber: parseInt(key) || 0,
            reps: val?.reps || 0,
            ...val,
          }))
          .sort((a, b) => a.setNumber - b.setNumber);
      }
      return [];
    })();

    // SetsData enriched with analysis (same merge logic as workout-finished)
    const mergedSetsData = (() => {
      const local = Array.isArray(setData) ? setData : [];
      if (local.length === 0 && analysisUI?.setsData?.length > 0) return analysisUI.setsData;
      if (!analysisUI?.setsData || analysisUI.setsData.length === 0) {
        // No analytics — try to enrich from GCS classification data
        if (gcsData?.sets?.length > 0 && local.length > 0) {
          return local.map((localSet, idx) => {
            const gcsSet = gcsData.sets.find((s) => s.setNumber === (localSet.setNumber || idx + 1)) || gcsData.sets[idx];
            if (!gcsSet?.reps?.length) return localSet;

            // Build repsData from GCS if local doesn't have it
            if (!localSet.repsData || localSet.repsData.length === 0) {
              return {
                ...localSet,
                repsData: gcsSet.reps.map((gcsRep, ri) => ({
                  repNumber: gcsRep.repNumber || ri + 1,
                  classification: gcsRep.classification || null,
                  smoothnessScore: gcsRep.smoothnessScore,
                  quality: gcsRep.quality,
                  liftingTime: gcsRep.liftingTime ?? 0,
                  loweringTime: gcsRep.loweringTime ?? 0,
                  peakVelocity: gcsRep.peakVelocity,
                  rom: gcsRep.rom || gcsRep.romDegrees,
                })),
              };
            }

            // Merge GCS classification into existing repsData
            return {
              ...localSet,
              repsData: localSet.repsData.map((lr, ri) => {
                const gcsRep = gcsSet.reps[ri];
                if (!gcsRep) return lr;
                return {
                  ...lr,
                  classification: lr.classification || gcsRep.classification || null,
                  smoothnessScore: lr.smoothnessScore ?? gcsRep.smoothnessScore,
                  quality: lr.quality || gcsRep.quality,
                };
              }),
            };
          });
        }
        return local;
      }

      return local.map((localSet, idx) => {
        const analysisSet =
          analysisUI.setsData.find((s) => s.setNumber === localSet.setNumber) ||
          analysisUI.setsData[idx];
        if (!analysisSet) return localSet;

        const merged = { ...localSet, classification: analysisSet.classification || localSet.classification };

        if (
          localSet.repsData &&
          analysisSet.repsData &&
          localSet.repsData.length === analysisSet.repsData.length
        ) {
          merged.repsData = localSet.repsData.map((lr, ri) => {
            const ar = analysisSet.repsData[ri];
            return {
              ...lr,
              classification: ar?.classification || lr.classification || null,
              smoothnessScore: ar?.smoothnessScore ?? lr.smoothnessScore,
              quality: ar?.quality || lr.quality,
              liftingTime: ar?.liftingTime ?? lr.liftingTime ?? 0,
              loweringTime: ar?.loweringTime ?? lr.loweringTime ?? 0,
              peakVelocity: ar?.peakVelocity ?? lr.peakVelocity,
              rom: ar?.rom ?? lr.rom,
              chartData: ar?.chartData?.length > 0 ? ar.chartData : lr.chartData,
            };
          });
        } else if (analysisSet.repsData?.length > 0) {
          merged.repsData = analysisSet.repsData;
          merged.reps = analysisSet.repsData.length;
        }

        return merged;
      });
    })();

    // Apply ROM calibration context to all sets
    const romEnhancedSetsData = mergedSetsData.map(enhanceWithROMContext);

    // Debug log
    if (romEnhancedSetsData.length > 0) {
      const firstSet = romEnhancedSetsData[0];
      console.log('[useSessionDetailsData] romEnhancedSetsData first set:', {
        romCalibrated: firstSet.romCalibrated,
        targetROM: firstSet.targetROM,
        romUnit: firstSet.romUnit,
        repsCount: firstSet.repsData?.length,
        firstRepROM: firstSet.repsData?.[0]?.rom,
        firstRepROMFulfillment: firstSet.repsData?.[0]?.romFulfillment,
      });
    }

    // Chart data from analysis or GCS
    const chartData =
      analysisUI?.chartData?.length > 0
        ? analysisUI.chartData.map((d) => Math.abs(d))
        : [];

    // Determine if this is a recommendation or custom set
    const isRecommendation = log.setType === 'recommended' || log.setType === 'recommendation' || log.isRecommendation === true;
    const isCustomSet = log.setType === 'custom' || log.isCustomSet === true;

    return {
      // Header
      exerciseName,
      equipmentName,
      date: startDate,
      weight,
      weightUnit,
      sets,
      reps,
      restTimeSec,
      // Planned vs actual values for progress tracking
      plannedSets,
      plannedRepsPerSet,
      totalSets,
      totalReps,
      isRecommendation,
      isCustomSet,

      // Timing & Calories
      totalTime,
      calories,

      // Sets data (merged with analysis)
      mergedSetsData: romEnhancedSetsData,

      // Overall chart data
      chartData,

      // Phase timing
      avgConcentric: analysisUI?.avgConcentric || log.results?.avgConcentric || 0,
      avgEccentric: analysisUI?.avgEccentric || log.results?.avgEccentric || 0,
      concentricPercent: analysisUI?.concentricPercent || 0,
      eccentricPercent: analysisUI?.eccentricPercent || 0,

      // Fatigue
      fatigueScore: analysisUI?.fatigueScore || 0,
      fatigueLevel: analysisUI?.fatigueLevel || 'Low',

      // Consistency
      consistencyScore: analysisUI?.consistencyScore || 0,
      inconsistentRepIndex: analysisUI?.inconsistentRepIndex ?? -1,

      // Velocity
      baselineVelocity: analysisUI?.baselineVelocity || 0,
      velocityLoss: analysisUI?.velocityLoss || 0,
      effectiveReps: analysisUI?.effectiveReps || 0,

      // ML Classification
      mlClassification: analysisUI?.mlClassification || null,

      // Insights
      insights: analysisUI?.insights || [],

      // Raw references (for navigation to performance details)
      workoutId: logId,
      gcsPath: log.gcsPath || '',

      // GCS data (for movement graph)
      gcsData,
    };
  }, [log, analysisUI, gcsData, logId, equipment, exercise, enhanceWithROMContext]);

  // ────────────────────────────────────────────────────
  // Overall loading state
  // ────────────────────────────────────────────────────
  const isLoading = logLoading || analyticsLoading;

  return {
    viewModel,
    isLoading,
    gcsLoading,
    error,
    refetch: useCallback(() => {
      setLog(null);
      setRawAnalysis(null);
      setGcsData(null);
      setError(null);
    }, []),
  };
}
