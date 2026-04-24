import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef, useCallback } from 'react';
import AccelerationChart from '../components/workoutMonitor/AccelerationChart';
import WorkoutNotification from '../components/workoutMonitor/WorkoutNotification';
import DeviceDisconnectedModal from '../components/workoutMonitor/DeviceDisconnectedModal';
import OfflineBanner from '../components/workoutMonitor/OfflineBanner';
import CancelConfirmModal from '../components/workoutMonitor/CancelConfirmModal';
import ResumeCountdown from '../components/workoutMonitor/ResumeCountdown';
import WaitingForInternetModal from '../components/workoutMonitor/WaitingForInternetModal';
import InactivityModal from '../components/InactivityModal';
import ConnectPill from '../components/ConnectPill';
import SetBreakOverlay from '../components/setBreak/SetBreakOverlay';
import { useBluetooth } from '../context/BluetoothProvider';
import { useWorkoutSession } from '../utils/useWorkoutSession';
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';
import { useAuth } from '../context/AuthContext';
import { useBleConnectionWatcher } from '../hooks/useBleConnectionWatcher';
import { useNetworkConnectionWatcher } from '../hooks/useNetworkConnectionWatcher';
import { useWorkoutSessionState, SESSION_STATES } from '../hooks/useWorkoutSessionState';
import { SessionCheckpointManager } from '../utils/sessionCheckpointManager';
import { enqueueJob, clearSessionJobs, flushQueue, getAllPendingJobs, clearAllPendingJobs, updateJobStatus, purgeOldJobs } from '../utils/offlineQueue';
import { classifyReps } from '../services/mlClassificationService';
import { clearCurrentRepBuffer } from '../services/imuStreamingService';
import LoadingScreen from '../components/LoadingScreen';
import { db } from '../config/firestore';
import { doc, setDoc } from 'firebase/firestore';
import { calculateWorkoutCalories } from '../utils/calorieCalculator';

export default function WorkoutMonitor() {
  const router = useRouter();
  const { user } = useAuth();
  const { equipment, workout, plannedSets, plannedReps, weight, weightUnit, setType, restTime } = router.query;

  // Ref to track online status for use inside callbacks (avoids stale closure)
  const isOnlineRef = useRef(true);
  
  // Workout logging context - streaming version
  const { 
    startStreaming, 
    streamIMUSample, 
    handleRepDetected, 
    handleSetComplete,
    handleSetSkipped,
    finishWorkout,
    cancelWorkout,
    isStreaming,
    workoutId,
    currentLog,
    workoutConfig,
    pendingSetUploads,
    flushPendingSetClassifications,
    checkHasPendingUploads,
    backgroundMLStatus,
    resetCurrentSetLogging,
  } = useWorkoutLogging();
  
  // Track last rep count for detecting new reps
  const lastRepCountRef = useRef(0);
  const lastSetRef = useRef(1);
  
  // Analyzing loading screen state
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Stored workout completion data for deferred navigation (when offline at workout end)
  const deferredWorkoutResultRef = useRef(null);

  // ── Session state machine ────────────────────────────────────────────
  const { sessionState, transition, isState } = useWorkoutSessionState();

  // Keep a ref so async callbacks always read the LATEST state
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);

  // ── Checkpoint manager (persists across renders) ─────────────────────
  const checkpointManagerRef = useRef(new SessionCheckpointManager());

  // ── Offline toast state ──────────────────────────────────────────────
  const [offlineToast, setOfflineToast] = useState(null); // null | string
  
  // Helper function to get the correct background image based on equipment and workout
  const getWorkoutImage = () => {
    if (!equipment || !workout) return null;
    
    const equipmentLower = equipment.toLowerCase();
    const workoutLower = workout.toLowerCase();
    
    // Map equipment and workout to actual image filenames
    if (equipmentLower.includes('barbell')) {
      if (workoutLower.includes('bench') || workoutLower.includes('press')) {
        return '/images/workout-cards/barbell-flat-bench-press.jpg';
      } else if (workoutLower.includes('squat')) {
        return '/images/workout-cards/barbell_back_squats.jpg';
      }
      return '/images/workout-cards/barbell-comingsoon.jpg';
    } else if (equipmentLower.includes('dumbbell') || equipmentLower.includes('dumbbell')) {
      if (workoutLower.includes('curl')) {
        return '/images/workout-cards/dumbbell-concentration-curls.jpg';
      } else if (workoutLower.includes('extension') || workoutLower.includes('tricep')) {
        return '/images/workout-cards/dumbbell_overhead_tricep_extensions.png';
      }
      return '/images/workout-cards/dumbbell-comingsoon.jpg';
    } else if (equipmentLower.includes('weight stack') || equipmentLower.includes('weightstack') || equipmentLower.includes('cable')) {
      if (workoutLower.includes('pulldown') || workoutLower.includes('lat')) {
        return '/images/workout-cards/weightstack-lateral-pulldown.jpg';
      } else if (workoutLower.includes('leg') && workoutLower.includes('extension')) {
        return '/images/workout-cards/weightstack-seated-leg-extension.jpg';
      }
      return '/images/workout-cards/weightstack-comingsoon.jpg';
    }
    
    // Default fallback
    return '/images/workout-cards/barbell-comingsoon.jpg';
  };
   
  const {
    connected,
    device,
    scanning,
    devicesFound,
    availability,
    batteryPercent,
    scanDevices,
    connectToDevice,
    disconnect,
  } = useBluetooth();
  
  // Notification state
  const [lastRepNotification, setLastRepNotification] = useState(null);
  
  // Track ConnectPill expansion for title visibility
  const [isPillExpanded, setIsPillExpanded] = useState(false);
  
  // Workout tracking - Use values from query params (passed from selectedWorkout)
  // Use useEffect to update when router.query changes (needed for client-side hydration)
  const [recommendedSets, setRecommendedSets] = useState(4);
  const [recommendedReps, setRecommendedReps] = useState(2);
  const [workoutWeight, setWorkoutWeight] = useState(0);
  const [workoutWeightUnit, setWorkoutWeightUnit] = useState('kg');
  const [workoutSetType, setWorkoutSetType] = useState('recommended');
  const [workoutRestTime, setWorkoutRestTime] = useState(30);

  // Update workout config when query params are available
  useEffect(() => {
    if (plannedSets) setRecommendedSets(parseInt(plannedSets));
    if (plannedReps) setRecommendedReps(parseInt(plannedReps));
    if (weight) setWorkoutWeight(parseFloat(weight));
    if (weightUnit) setWorkoutWeightUnit(weightUnit);
    if (setType) setWorkoutSetType(setType);
    if (restTime) setWorkoutRestTime(parseInt(restTime));
    
    console.log('📋 Workout Config Updated:', {
      sets: plannedSets,
      reps: plannedReps,
      weight: weight,
      weightUnit: weightUnit,
      setType: setType,
      restTime: restTime,
    });
  }, [plannedSets, plannedReps, weight, weightUnit, setType, restTime]);
  
  // Initialize streaming session immediately on page load (mark as unfinished)
  // This removes the delay when user presses start
  const hasInitializedStreaming = useRef(false);
  
  useEffect(() => {
    // Only initialize once when we have all workout params available
    if (hasInitializedStreaming.current) return;
    if (!workout || !equipment) return;

    // Lock IMMEDIATELY (before any await) so concurrent effect firings are blocked.
    // The state-update effect (lines ~134-150) changes recommendedSets etc. on first
    // render, which would re-trigger this effect. Without the early lock, two async
    // calls both pass the guard and double-initialize the streaming session.
    hasInitializedStreaming.current = true;

    const initSession = async () => {
      console.log('🚀 Initializing streaming session on page load...');

      // Clear any stale pending jobs from previous sessions
      await clearAllPendingJobs();

      const result = await startStreaming({
        exercise: workout,
        equipment: equipment,
        plannedSets: parseInt(plannedSets) || recommendedSets,
        plannedReps: parseInt(plannedReps) || recommendedReps,
        weight: parseFloat(weight) || workoutWeight,
        weightUnit: weightUnit || workoutWeightUnit,
        setType: setType || workoutSetType
      });

      if (result?.success) {
        console.log('✅ Streaming session initialized (unfinished):', result.workoutId);
      } else {
        console.warn('⚠️ Failed to initialize streaming session on load');
        // Release lock so a subsequent render can retry
        hasInitializedStreaming.current = false;
      }
    };

    initSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout, equipment, startStreaming]);
  
  // Use the workout session hook for all algorithm logic
  const {
    isRecording,
    isPaused,
    showCountdown,
    countdownValue,
    isOnBreak,
    breakTimeRemaining,
    breakPaused,
    motivationalMessage,
    elapsedTime,
    currentSet,
    repStats,
    workoutStats,
    currentIMU,
    sampleCount,
    dataRate,
    timeData,
    rawAccelData,
    filteredAccelData,
    isSubscribed,
    restTime: sessionRestTime,
    showInactivityModal,
    startRecording: startRecordingSession,
    stopRecording: stopSession,
    togglePause,
    toggleBreakPause,
    stopBreak,
    exportToCSV: getCSV,
    resetReps,
    skipSet,
    resetCurrentSet,
    formatTime,
    truncateToCheckpoint,
    handleInactivityResume,
    handleInactivityEndSession,
    repCounterRef,
    rawDataLog
  } = useWorkoutSession({
    connected,
    recommendedReps,
    recommendedSets,
    restTime: workoutRestTime,
    equipment,
    workout,
    userId: user?.uid,
    // Stream IMU samples to GCS as they come in
    onIMUSample: (sample) => {
      if (isStreaming) {
        streamIMUSample(sample);
      }
    },
    // Handle rep detection - save rep data to GCS
    onRepDetected: async (repInfo) => {
      if (isStreaming) {
        console.log('🏋️ Rep detected:', repInfo);
        await handleRepDetected(repInfo);
      }

      // ── Save checkpoint after every completed rep ──
      const rc = repCounterRef?.current;
      if (rc) {
        const exported = rc.exportData();
        const lastRep = exported.reps.length > 0 ? exported.reps[exported.reps.length - 1] : null;
        checkpointManagerRef.current.saveCheckpoint({
          repCount: rc.getStats().repCount,
          sampleIndex: exported.samples.length,
          elapsedTime,
          fullChartLen: exported.samples.length, // chart arrays grow 1:1 with samples
          lastCompletedRepEndTimestamp: lastRep?.actualEndTime ?? lastRep?.endTime ?? Date.now(),
          lastCompletedRepEndSampleIndex: lastRep?.actualEndIndex ?? exported.samples.length - 1,
        });
      }
    },
    // Handle set completion - move to next set folder in GCS
    onSetComplete: async (setNumber) => {
      if (isStreaming) {
        console.log('✅ Set complete:', setNumber);
        await handleSetComplete();
      }
    },
    onWorkoutComplete: async ({ workoutStats: finalStats, repData, chartData }) => {
      // ── CHECK ONLINE + PENDING UPLOADS BEFORE ANALYZING ──
      let currentlyOnline = isOnlineRef.current;
      let hasPending = false;
      try {
        const pending = await getAllPendingJobs();
        hasPending = pending.some(j => j.type === 'set_classification' && (j.status === 'pending' || j.status === 'uploading'));
      } catch (_) {}

      if (!currentlyOnline || hasPending) {
        // ─── OFFLINE PATH ─────────────────────────────────────────────
        // Transition IMMEDIATELY to prevent the race where
        // handleNetworkOnline fires during the async work below and
        // sees ACTIVE_OFFLINE → does ACTIVE_OFFLINE → ACTIVE (fresh page).
        console.log('[WorkoutMonitor] Offline or pending uploads — deferring analysis');
        transition(SESSION_STATES.WAITING_FOR_INTERNET);

        // Now do the async work (handleSetComplete + finishWorkout).
        // handleNetworkOnline may fire during this window, but it will
        // see WAITING_FOR_INTERNET and check deferredWorkoutResultRef —
        // which is still null, so it will simply return.
        if (isStreaming) {
          console.log('🏁 Workout complete - triggering ML for final set:', finalStats.completedSets);
          await handleSetComplete();
        }

        const result = await finishWorkout();

        // Store deferred navigation data
        deferredWorkoutResultRef.current = {
          finalStats,
          result,
          repData,
          chartData,
        };

        // Internet may have come back while we were doing async work.
        // If so, process immediately — handleNetworkOnline already fired
        // and returned (no deferred data at that time), so it won't fire
        // again.  We must drive the flow ourselves.
        if (isOnlineRef.current) {
          console.log('[WorkoutMonitor] Internet restored during offline completion — processing now');
          await processDeferredWorkout();
        }
        return;
      }

      // ── ONLINE PATH: Show analyzing screen and proceed normally ──
      setIsAnalyzing(true);
      
      // *** FIX: Call handleSetComplete for the LAST set before finishing ***
      // onSetComplete is NOT called for the last set (only onWorkoutComplete)
      // So we must manually trigger ML classification for the final set
      if (isStreaming) {
        console.log('🏁 Workout complete - triggering ML for final set:', finalStats.completedSets);
        await handleSetComplete();
      }
      
      // Small delay to let ML classification start
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Finish streaming and determine completion status
      const result = await finishWorkout();

      // Re-check — finishWorkout may have taken several seconds and the
      // network watcher may have flagged us offline during that time.
      currentlyOnline = isOnlineRef.current;

      if (!currentlyOnline) {
        // Internet dropped during finishWorkout — switch to waiting modal
        setIsAnalyzing(false);
        deferredWorkoutResultRef.current = { finalStats, result, repData, chartData };
        transition(SESSION_STATES.WAITING_FOR_INTERNET);
        return;
      }
      
      // *** CRITICAL: Merge classification data from streaming service ***
      const mergedSetData = buildMergedSetData(finalStats, result);
      
      // Calculate real avg concentric/eccentric from per-rep phase data
      const { avgConcentricVal, avgEccentricVal } = computePhaseAverages(mergedSetData);
      
      // Store workout results in sessionStorage for workout-finished page
      storeWorkoutResults(finalStats, mergedSetData, avgConcentricVal, avgEccentricVal, result);

      // Persist rich setData (ROM calibration, per-rep metrics) to Firestore
      await saveRichSetDataToFirestore(mergedSetData, result);
      
      // Wait for the analyzing animation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Navigate to workout finished page with set-grouped data
      navigateToFinished(finalStats, mergedSetData, avgConcentricVal, avgEccentricVal, result, chartData);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS (extracted for reuse in deferred navigation)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Process deferred workout data: flush pending uploads, merge
   * classifications, re-upload to GCS, and navigate to workout-finished.
   * Called either by handleNetworkOnline or by onWorkoutComplete when
   * internet came back during async completion work.
   */
  async function processDeferredWorkout() {
    const deferred = deferredWorkoutResultRef.current;
    if (!deferred) {
      console.warn('[WorkoutMonitor] processDeferredWorkout called but no deferred data');
      return;
    }

    const { finalStats, result, chartData } = deferred;
    deferredWorkoutResultRef.current = null;

    // 1. Flush GCS uploads (workout_data.json / metadata.json queued while offline)
    try {
      await migrateLocalStorageFallbacks();
      await flushQueue(uploadOfflineJob, 'gcs_upload');
    } catch (_) {}

    // 2. Flush queued set classifications — returns actual results
    let classificationsBySet = {};
    let sessionClassifications = {};
    try {
      const flushResult = await flushPendingSetClassifications();
      classificationsBySet = flushResult.classificationsBySet || {};
      sessionClassifications = flushResult.sessionClassifications || {};
      console.log('[WorkoutMonitor] Flushed classifications for sets:', Object.keys(classificationsBySet), 'sessions:', Object.keys(sessionClassifications));
    } catch (_) {}

    // 3. Merge flush results into the (stale) workoutData snapshot
    if (result?.workoutData?.sets && Object.keys(classificationsBySet).length > 0) {
      for (const [setNumStr, repClassifications] of Object.entries(classificationsBySet)) {
        const setNum = Number(setNumStr);
        const targetSet = result.workoutData.sets.find(s => s.setNumber === setNum);
        if (targetSet && targetSet.reps) {
          for (const rc of repClassifications) {
            const targetRep = targetSet.reps.find(r => r.repNumber === rc.repNumber);
            if (targetRep) {
              targetRep.classification = rc.classification;
              targetRep.confidence = rc.confidence;
              targetRep.classifiedAt = new Date().toISOString();
            }
          }
        }
      }
      console.log('[WorkoutMonitor] Merged classifications into deferred workoutData');

      // 4. Re-upload the patched workout_data.json to GCS
      try {
        const gcsBase = result?.workoutData?.gcsPath || result?.metadata?.gcsPath;
        if (gcsBase && user) {
          const uploadPath = gcsBase.endsWith('/workout_data.json')
            ? gcsBase
            : `${gcsBase}/workout_data.json`;
          const token = await user.getIdToken();
          const signedResp = await fetch('/api/imu-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ action: 'upload', userId: user.uid, filePath: uploadPath, contentType: 'application/json' }),
          });
          if (signedResp.ok) {
            const { signedUrl } = await signedResp.json();
            await fetch(signedUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(result.workoutData),
            });
            console.log('[WorkoutMonitor] Re-uploaded workout_data.json with classifications');
          }
        }
      } catch (uploadErr) {
        console.warn('[WorkoutMonitor] Failed to re-upload patched workout_data.json:', uploadErr);
      }
    }

    // 5. Save workout log to Firestore (skipped during offline finishWorkout)
    if (user && result?.workoutId && result?.metadata) {
      try {
        const token = await user.getIdToken();
        const fsResp = await fetch('/api/imu-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'completeWorkout',
            userId: user.uid,
            workoutId: result.workoutId,
            metadata: result.metadata,
            workoutData: result.workoutData, // Include detailed set/rep data for calorie calculation
          }),
        });
        if (fsResp.ok) {
          console.log('[WorkoutMonitor] ✅ Firestore workout log saved (deferred)');
          // Invalidate all caches so dashboard/equipment pages show fresh data
          try {
            const { clearUserCache } = await import('../services/workoutLogService');
            clearUserCache(user.uid);
            // Clear exercise stats sessionStorage
            const prefix = `exStats_${user.uid}_`;
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
              const key = sessionStorage.key(i);
              if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
            }
          } catch (_) {}
        } else {
          console.warn('[WorkoutMonitor] Firestore save returned', fsResp.status);
        }
      } catch (fsErr) {
        console.warn('[WorkoutMonitor] Firestore save failed:', fsErr.message);
      }
    }

    // 6. Show analyzing screen and navigate
    setIsAnalyzing(true);
    transition(SESSION_STATES.IDLE);

    try {
      const mergedSetData = buildMergedSetData(finalStats, result);
      const { avgConcentricVal, avgEccentricVal } = computePhaseAverages(mergedSetData);
      storeWorkoutResults(finalStats, mergedSetData, avgConcentricVal, avgEccentricVal, result);

      // Persist rich setData (ROM calibration, per-rep metrics) to Firestore
      await saveRichSetDataToFirestore(mergedSetData, result);

      await new Promise(resolve => setTimeout(resolve, 2000));
      navigateToFinished(finalStats, mergedSetData, avgConcentricVal, avgEccentricVal, result, chartData);
    } catch (navErr) {
      console.error('[WorkoutMonitor] Navigation to workout-finished failed:', navErr);
      // Fallback: navigate without chart data so the user is never stranded on this page
      setIsAnalyzing(false);
      router.push({
        pathname: '/workout-finished',
        query: {
          workoutName: workout,
          equipment: equipment,
          totalReps: finalStats?.totalReps ?? 0,
          calories: 0, // Calculated server-side in imu-stream API
          totalTime: finalStats?.totalTime ?? 0,
          avgConcentric: '0.0',
          avgEccentric: '0.0',
          chartData: '[]',
          timeData: '[]',
          setsData: JSON.stringify(finalStats?.setData ?? []),
          recommendedSets,
          recommendedReps,
          weight: workoutWeight,
          weightUnit: workoutWeightUnit,
          setType: workoutSetType,
          status: result?.status || 'completed',
          workoutId: result?.workoutId || workoutId,
          gcsPath: result?.workoutData?.gcsPath || result?.metadata?.gcsPath || '',
        }
      });
    }
  }

  /** Merge classification data from streaming service into local set data */
  function buildMergedSetData(finalStats, result) {
    return finalStats.setData.map((localSet, setIdx) => {
      const streamingSet = result?.workoutData?.sets?.find(
        s => s.setNumber === localSet.setNumber
      ) || result?.workoutData?.sets?.[setIdx];

      if (!streamingSet || !streamingSet.reps) {
        return localSet;
      }

      const mergedRepsData = localSet.repsData?.map((localRep, repIdx) => {
        const streamingRep = streamingSet.reps.find(
          r => r.repNumber === repIdx + 1
        ) || streamingSet.reps[repIdx];

        if (streamingRep?.classification) {
          return {
            ...localRep,
            classification: streamingRep.classification,
            chartData: streamingRep.samples?.map(s => s.filteredMag) || localRep.chartData
          };
        }
        return localRep;
      }) || [];

      return { ...localSet, repsData: mergedRepsData };
    });
  }

  /** Compute average concentric/eccentric from per-rep phase data */
  function computePhaseAverages(mergedSetData) {
    let totalLiftingTime = 0;
    let totalLoweringTime = 0;
    let phaseRepCount = 0;
    mergedSetData.forEach(set => {
      (set.repsData || []).forEach(rep => {
        // liftingTime = concentric (lifting), loweringTime = eccentric (lowering)
        const lt = rep.liftingTime || 0;
        const lo = rep.loweringTime || 0;
        if (lt + lo > 0) {
          totalLiftingTime += lt;
          totalLoweringTime += lo;
          phaseRepCount++;
        }
      });
    });
    return {
      avgConcentricVal: phaseRepCount > 0 ? (totalLiftingTime / phaseRepCount) : 0,
      avgEccentricVal: phaseRepCount > 0 ? (totalLoweringTime / phaseRepCount) : 0,
    };
  }

  /** Store workout results in sessionStorage */
  function storeWorkoutResults(finalStats, mergedSetData, avgConcentricVal, avgEccentricVal, result) {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('workoutResults', JSON.stringify({
        totalSets: finalStats.completedSets,
        totalReps: finalStats.totalReps,
        totalTime: finalStats.totalTime,
        calories: 0, // Calculated server-side in imu-stream API
        avgConcentric: avgConcentricVal.toFixed(1),
        avgEccentric: avgEccentricVal.toFixed(1),
        setData: mergedSetData,
        status: result?.status || 'completed',
        workoutId: result?.workoutId || workoutId,
      }));
    }
  }

  /**
   * Persist the rich setData (including ROM calibration fields) to Firestore.
   * The streaming metadata only has a simple tracking object for sets,
   * so ROM-related fields (targetROM, romCalibrated, romUnit, romFulfillment)
   * would otherwise be lost. This update merges them into the existing doc.
   * 
   * ALSO calculates and saves calories using MET formula with ACTIVE time only.
   */
  async function saveRichSetDataToFirestore(mergedSetData, result) {
    console.log('[WorkoutMonitor] 🔥 saveRichSetDataToFirestore called:', {
      hasUser: !!user?.uid,
      hasSetData: !!mergedSetData?.length,
      hasWorkoutId: !!result?.workoutId,
      setDataLength: mergedSetData?.length,
      workoutId: result?.workoutId,
    });
    
    if (!user?.uid || !mergedSetData?.length || !result?.workoutId) return;

    try {
      // Strip heavy fields (chartData, timeData, samples) to keep Firestore lean
      const cleanSetData = mergedSetData.map(set => ({
        setNumber: set.setNumber ?? 0,
        reps: set.reps ?? 0,
        duration: set.duration ?? 0,
        targetROM: set.targetROM ?? null,
        romCalibrated: set.romCalibrated ?? false,
        romUnit: set.romUnit || '°',
        repsData: (set.repsData || []).map(rep => ({
          repNumber: rep.repNumber ?? 0,
          time: rep.time ?? 0,
          duration: rep.duration ?? 0,
          durationMs: rep.durationMs ?? 0,
          rom: rep.rom ?? null,
          romFulfillment: rep.romFulfillment ?? null,
          romUnit: rep.romUnit ?? '°',
          peakVelocity: rep.peakVelocity ?? null,
          velocityLossPercent: rep.velocityLossPercent ?? null,
          isEffective: rep.isEffective ?? null,
          smoothnessScore: rep.smoothnessScore ?? null,
          meanJerk: rep.meanJerk ?? null,
          isClean: rep.isClean ?? null,
          quality: rep.quality ?? null,
          liftingTime: rep.liftingTime ?? 0,
          loweringTime: rep.loweringTime ?? 0,
          peakTimePercent: rep.peakTimePercent ?? null,
          classification: rep.classification || null,
        })),
      }));

      // Calculate calories using MET formula with ACTIVE time only
      const totalReps = cleanSetData.reduce((sum, set) => sum + (set.reps || 0), 0);
      
      // DEBUG: Log the actual rep durations we're working with
      console.log('[WorkoutMonitor] 🔍 Rep duration debug:', {
        totalSets: cleanSetData.length,
        totalReps,
        sampleSet: cleanSetData[0]?.repsData?.slice(0, 3).map(r => ({
          repNumber: r.repNumber,
          duration: r.duration,
          durationMs: r.durationMs,
          time: r.time,
        })),
      });
      
      const calorieResult = calculateWorkoutCalories({
        exercise: result.metadata?.exercise || workout,
        equipment: result.metadata?.equipment || equipment,
        totalReps,
        setData: cleanSetData, // Has rep durations for accurate active time
      });
      
      console.log('[WorkoutMonitor] 💪 Calculated calories:', calorieResult.calories, 'kcal', calorieResult.breakdown);

      // Build Firestore doc path: userWorkouts/{uid}/{equipment}/{exercise}/logs/{workoutId}
      const sanitize = (str) =>
        (str || 'unknown').trim()
          .replace(/([a-z])([A-Z])/g, '$1-$2')
          .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

      const eq = sanitize(result.metadata?.equipment || equipment);
      const ex = sanitize(result.metadata?.exercise || workout);

      const docRef = doc(db, 'userWorkouts', user.uid, eq, ex, 'logs', result.workoutId);
      await setDoc(docRef, { 
        results: { 
          setData: cleanSetData,
          calories: calorieResult.calories,
        } 
      }, { merge: true });
      console.log('[WorkoutMonitor] ✅ Rich setData (with ROM) and calories saved to Firestore');
    } catch (err) {
      console.warn('[WorkoutMonitor] Failed to save rich setData:', err.message);
    }
  }

  /** Navigate to workout-finished page */
  function navigateToFinished(finalStats, mergedSetData, avgConcentricVal, avgEccentricVal, result, chartData) {
    router.push({
      pathname: '/workout-finished',
      query: {
        workoutName: workout,
        equipment: equipment,
        totalReps: finalStats.totalReps,
        calories: 0, // Calculated server-side in imu-stream API
        totalTime: finalStats.totalTime,
        avgConcentric: avgConcentricVal.toFixed(1),
        avgEccentric: avgEccentricVal.toFixed(1),
        chartData: JSON.stringify(chartData.filteredAccelData),
        timeData: JSON.stringify(chartData.timeData),
        setsData: JSON.stringify(mergedSetData),
        recommendedSets: recommendedSets,
        recommendedReps: recommendedReps,
        weight: workoutWeight,
        weightUnit: workoutWeightUnit,
        setType: workoutSetType,
        status: result?.status || 'completed',
        workoutId: result?.workoutId || workoutId,
        gcsPath: result?.workoutData?.gcsPath || result?.metadata?.gcsPath || '',
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SESSION STATE MACHINE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════

  // Transition to ACTIVE when recording starts
  useEffect(() => {
    if (isRecording && !isPaused && sessionState === SESSION_STATES.IDLE) {
      transition(SESSION_STATES.ACTIVE);
    }
  }, [isRecording, isPaused]);

  // ── BLE Connection Watcher ─────────────────────────────────────────
  const handleBleDisconnect = useCallback(() => {
    if (!isRecording) return;

    console.log('[WorkoutMonitor] ⚠️ BLE disconnected during recording - rolling back partial rep data');

    // 1. Pause session immediately
    if (!isPaused) togglePause();

    // 2. Get the last checkpoint (saved after each completed rep)
    const cpManager = checkpointManagerRef.current;
    const checkpoint = cpManager.getCheckpoint();

    // 3. Immediately rollback to checkpoint - discard partial rep data
    //    This clears any incomplete rep from chart, counter, and buffers
    if (checkpoint) {
      // Clear the IMU streaming buffer (partial rep samples)
      const clearedSamples = clearCurrentRepBuffer(checkpoint.repCount);
      console.log(`[WorkoutMonitor] Cleared ${clearedSamples} partial rep samples from IMU buffer`);

      // Rollback rep counter, chart data, and states to last completed rep
      const rolledBack = truncateToCheckpoint(checkpoint);
      if (rolledBack) {
        console.log(`[WorkoutMonitor] ✅ Rolled back to checkpoint: ${checkpoint.repCount} reps, ${checkpoint.sampleIndex} samples`);
      }
    } else {
      // No checkpoint yet - just clear the streaming buffer
      clearCurrentRepBuffer(0);
      console.log('[WorkoutMonitor] No checkpoint available - cleared IMU buffer only');
    }

    // 4. Transition state machine
    transition(SESSION_STATES.PAUSED_BLE_DISCONNECTED);
  }, [isRecording, isPaused, togglePause, transition, truncateToCheckpoint]);

  const handleBleReconnect = useCallback(() => {
    // Rollback already happened in handleBleDisconnect
    // Just show resume countdown and continue from last completed rep
    console.log('[WorkoutMonitor] ✅ BLE reconnected - resuming from last completed rep');

    // Reset rep detection state to prevent false rep on resume
    // This ensures the first motion after reconnection doesn't immediately trigger a rep
    if (repStatsRef.current) {
      repStatsRef.current.inRep = false;
      repStatsRef.current.lastPeakTime = 0;
    }

    // Show resume countdown
    transition(SESSION_STATES.RESUMING_COUNTDOWN);
  }, [transition]);

  const {
    isReconnecting,
    reconnectFailed,
    reconnectAttempt,
    maxAttempts,
    attemptReconnect,
    cancelAutoReconnect,
  } = useBleConnectionWatcher({
    connected,
    isRecording,
    device,
    connectToDevice,
    onDisconnect: handleBleDisconnect,
    onReconnect: handleBleReconnect,
    autoReconnect: true, // Enable automatic reconnection
  });

  // ── Offline upload helper (reusable by both flush and startup) ─────
  const uploadOfflineJob = useCallback(async (job) => {
    if (job.type !== 'gcs_upload') {
      throw new Error(`uploadOfflineJob: unsupported job type "${job.type}"`);
    }

    const { filePath, content, contentType, userId: jobUserId } = job.payload;
    const token = user ? await user.getIdToken() : null;
    if (!token) throw new Error('No auth token for offline sync');

    const resp = await fetch('/api/imu-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ action: 'upload', userId: jobUserId, filePath, contentType: contentType || 'application/json' }),
    });
    if (!resp.ok) throw new Error(`Signed URL failed: ${resp.status}`);
    const { signedUrl } = await resp.json();

    const up = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType || 'application/json' },
      body: content,
    });
    if (!up.ok) throw new Error(`GCS upload failed: ${up.status}`);
    console.log('[OfflineSync] ✅ Uploaded:', filePath);
  }, [user]);

  // ── Comprehensive offline sync with classification merging ─────────────────
  const comprehensiveOfflineSync = useCallback(async () => {
    if (!user?.uid) return { uploaded: 0, failed: 0 };

    try {
      console.log('[OfflineSync] 🔄 Starting comprehensive offline sync...');
      
      // 1. Get all pending jobs
      const pending = await getAllPendingJobs();
      const gcsJobs = pending.filter(j => j.type === 'gcs_upload' && j.status === 'pending');
      const classificationJobs = pending.filter(j => j.type === 'set_classification' && j.status === 'pending');
      
      // Group jobs by sessionId for coordinated processing
      const sessionJobs = {};
      
      // Index GCS upload jobs by session
      gcsJobs.forEach(job => {
        const sessionId = job.sessionId;
        if (!sessionJobs[sessionId]) sessionJobs[sessionId] = { gcsJobs: [], classificationJobs: [] };
        sessionJobs[sessionId].gcsJobs.push(job);
      });
      
      // Index classification jobs by session
      classificationJobs.forEach(job => {
        const sessionId = job.sessionId;
        if (!sessionJobs[sessionId]) sessionJobs[sessionId] = { gcsJobs: [], classificationJobs: [] };
        sessionJobs[sessionId].classificationJobs.push(job);
      });

      let totalUploaded = 0;
      let totalFailed = 0;

      // Process each session independently
      for (const [sessionId, jobs] of Object.entries(sessionJobs)) {
        try {
          console.log(`[OfflineSync] Processing session ${sessionId}: ${jobs.gcsJobs.length} GCS jobs, ${jobs.classificationJobs.length} classification jobs`);
          
          // Find workout_data.json job for this session
          const workoutDataJob = jobs.gcsJobs.find(job => 
            job.payload.filePath && job.payload.filePath.includes('workout_data.json')
          );
          
          if (!workoutDataJob) {
            console.warn(`[OfflineSync] No workout_data.json found for session ${sessionId}, uploading jobs separately`);
            // Fall back to regular upload for this session
            for (const job of jobs.gcsJobs) {
              try {
                await uploadOfflineJob(job);
                await updateJobStatus(job.jobId, 'done');
                totalUploaded++;
              } catch (err) {
                console.warn(`[OfflineSync] Upload failed for ${job.jobId}:`, err);
                await updateJobStatus(job.jobId, 'failed');
                totalFailed++;
              }
            }
            continue;
          }

          // Parse workout data content
          let workoutData;
          try {
            workoutData = JSON.parse(workoutDataJob.payload.content);
          } catch (err) {
            console.warn(`[OfflineSync] Failed to parse workout data for session ${sessionId}:`, err);
            totalFailed += jobs.gcsJobs.length;
            continue;
          }

          // Process set classifications for this session
          const token = await user.getIdToken();
          let hasNewClassifications = false;

          for (const job of jobs.classificationJobs) {
            try {
              await updateJobStatus(job.jobId, 'uploading');
              
              const { exercise, setNumber, reps } = job.payload;
              const result = await classifyReps(exercise, reps, token);
              
              if (result && result.classifications && result.classifications.length > 0) {
                // Find the target set in workout data
                const targetSet = workoutData.sets?.find(s => s.setNumber === setNumber);
                if (targetSet && targetSet.reps) {
                  // Merge classifications into reps
                  result.classifications.forEach((cls, idx) => {
                    const repNumber = reps[idx]?.repNumber || idx + 1;
                    const targetRep = targetSet.reps.find(r => r.repNumber === repNumber);
                    if (targetRep) {
                      targetRep.classification = {
                        prediction: cls.prediction,
                        label: cls.label,
                        confidence: cls.confidence,
                        probabilities: cls.probabilities,
                        method: result.modelAvailable ? 'ml' : 'rules'
                      };
                      targetRep.confidence = cls.confidence;
                      targetRep.classifiedAt = new Date().toISOString();
                      hasNewClassifications = true;
                    }
                  });
                }
                await updateJobStatus(job.jobId, 'done');
              } else {
                console.warn(`[OfflineSync] Classification returned empty for Set ${setNumber}: ${result?.error || 'no classifications'}`);
                await updateJobStatus(job.jobId, 'failed');
                totalFailed++;
              }
            } catch (err) {
              console.warn(`[OfflineSync] Failed to classify set ${job.jobId}:`, err);
              await updateJobStatus(job.jobId, 'failed');
              totalFailed++;
            }
          }

          // Upload workout_data.json with merged classifications
          try {
            // Update the content with merged classifications
            const updatedContent = JSON.stringify(workoutData);
            const modifiedJob = {
              ...workoutDataJob,
              payload: {
                ...workoutDataJob.payload,
                content: updatedContent
              }
            };
            
            await uploadOfflineJob(modifiedJob);
            await updateJobStatus(workoutDataJob.jobId, 'done');
            totalUploaded++;
            
            if (hasNewClassifications) {
              console.log(`[OfflineSync] ✅ Uploaded workout_data.json with merged classifications for session ${sessionId}`);
            }
          } catch (err) {
            console.warn(`[OfflineSync] Failed to upload workout_data.json for session ${sessionId}:`, err);
            await updateJobStatus(workoutDataJob.jobId, 'failed');
            totalFailed++;
          }

          // Upload other GCS jobs for this session  
          for (const job of jobs.gcsJobs) {
            if (job === workoutDataJob) continue; // Already handled
            try {
              await uploadOfflineJob(job);
              await updateJobStatus(job.jobId, 'done');
              totalUploaded++;
            } catch (err) {
              console.warn(`[OfflineSync] Upload failed for ${job.jobId}:`, err);
              await updateJobStatus(job.jobId, 'failed');
              totalFailed++;
            }
          }

          // Save to Firestore if we have workout metadata
          if (hasNewClassifications && workoutData.workoutId) {
            try {
              const fsResp = await fetch('/api/imu-stream', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                  action: 'completeWorkout',
                  userId: user.uid,
                  workoutId: workoutData.workoutId,
                  metadata: {
                    gcsPath: workoutDataJob.payload.filePath,
                    exercise: workoutData.exercise,
                    equipment: workoutData.equipment,
                    completedSets: workoutData.sets?.length || 0,
                    completedReps: workoutData.sets?.reduce((total, set) => total + (set.reps?.length || 0), 0) || 0,
                    status: 'completed',
                    endTime: new Date().toISOString(),
                  },
                }),
              });
              if (fsResp.ok) {
                console.log(`[OfflineSync] ✅ Firestore workout log saved for session ${sessionId}`);
                // Invalidate all caches so dashboard/equipment pages show fresh data
                try {
                  const { clearUserCache } = await import('../services/workoutLogService');
                  clearUserCache(user.uid);
                  const prefix = `exStats_${user.uid}_`;
                  for (let i = sessionStorage.length - 1; i >= 0; i--) {
                    const cacheKey = sessionStorage.key(i);
                    if (cacheKey?.startsWith(prefix)) sessionStorage.removeItem(cacheKey);
                  }
                } catch (_) {}
              } else {
                console.warn(`[OfflineSync] Firestore save failed for session ${sessionId}, status: ${fsResp.status}`);
              }
            } catch (fsErr) {
              console.warn(`[OfflineSync] Firestore save error for session ${sessionId}:`, fsErr.message);
            }
          }

        } catch (sessionErr) {
          console.warn(`[OfflineSync] Failed to process session ${sessionId}:`, sessionErr);
          totalFailed += jobs.gcsJobs.length + jobs.classificationJobs.length;
        }
      }

      // Clean up completed jobs
      if (totalUploaded > 0) {
        await purgeOldJobs(0); // Remove done jobs immediately after flush
      }

      console.log(`[OfflineSync] ✅ Comprehensive sync complete: ${totalUploaded} uploaded, ${totalFailed} failed`);
      return { uploaded: totalUploaded, failed: totalFailed };
      
    } catch (err) {
      console.warn('[OfflineSync] Comprehensive sync failed:', err);
      return { uploaded: 0, failed: 0 };
    }
  }, [user, uploadOfflineJob]);

  // ── Migrate old localStorage imu_fallback_* → IndexedDB queue ─────
  const migrateLocalStorageFallbacks = useCallback(async () => {
    if (typeof localStorage === 'undefined') return;

    const keysToMigrate = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('imu_fallback_')) keysToMigrate.push(key);
    }

    if (keysToMigrate.length === 0) return;
    console.log(`[OfflineSync] Migrating ${keysToMigrate.length} localStorage fallback(s) to IndexedDB`);

    for (const key of keysToMigrate) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        await enqueueJob(data.userId || 'migrated', 'gcs_upload', {
          filePath: data.filePath,
          content: data.content,
          contentType: data.contentType || 'application/json',
          userId: data.userId || '',
        });
        localStorage.removeItem(key);
        console.log('[OfflineSync] Migrated:', key);
      } catch (err) {
        console.warn('[OfflineSync] Failed to migrate', key, err);
      }
    }
  }, []);

  // ── Network Connection Watcher ─────────────────────────────────────
  const handleNetworkOffline = useCallback(() => {
    const currentState = sessionStateRef.current;
    console.log('[WorkoutMonitor] 🔴 Network offline detected, isRecording:', isRecording, 'state:', currentState);

    // Act on offline for ANY non-IDLE state (including when isRecording is
    // already false during the completion flow — that was the old bug).
    if (currentState === SESSION_STATES.IDLE) {
      console.log('[WorkoutMonitor] ⚠️ Ignoring offline - state is IDLE');
      return;
    }

    // Only transition if we're not already handling a BLE disconnect, cancel, or waiting
    if (currentState === SESSION_STATES.ACTIVE) {
      console.log('[WorkoutMonitor] ✅ Transitioning ACTIVE → ACTIVE_OFFLINE');
      transition(SESSION_STATES.ACTIVE_OFFLINE);
    } else {
      console.log('[WorkoutMonitor] ⚠️ Not transitioning - current state:', currentState);
    }
  }, [transition]);

  const handleNetworkOnline = useCallback(async () => {
    const currentState = sessionStateRef.current;

    // Restore from ACTIVE_OFFLINE → ACTIVE
    if (currentState === SESSION_STATES.ACTIVE_OFFLINE) {
      transition(SESSION_STATES.ACTIVE);
    }

    // ── If we were WAITING_FOR_INTERNET, internet is back → proceed ──
    if (currentState === SESSION_STATES.WAITING_FOR_INTERNET) {
      // If the deferred data isn't ready yet (onWorkoutComplete is still
      // doing async handleSetComplete / finishWorkout), just return.
      // The completion handler will check isOnlineRef after its async work
      // and call processDeferredWorkout() itself.
      if (!deferredWorkoutResultRef.current) {
        console.log('[WorkoutMonitor] WAITING_FOR_INTERNET but deferred data not ready — completion handler will drive');
        return;
      }

      // Deferred data is ready — process it
      try {
        await processDeferredWorkout();
      } catch (err) {
        console.error('[WorkoutMonitor] processDeferredWorkout threw unexpectedly:', err);
        // Don't leave user stranded — fall through to reload the page as last resort
        setIsAnalyzing(false);
        transition(SESSION_STATES.IDLE);
      }
      return;
    }

    // Flush queued offline jobs + migrate any old localStorage fallbacks
    try {
      // 1. Migrate old localStorage fallback items into IndexedDB first
      await migrateLocalStorageFallbacks();

      // 2. Use comprehensive sync that merges classifications before uploading 
      const result = await comprehensiveOfflineSync();

      if (result.uploaded > 0) {
        setOfflineToast(`Connection restored — ${result.uploaded} file(s) synced with ML classifications.`);
        setTimeout(() => setOfflineToast(null), 4000);
      }
    } catch (err) {
      console.warn('[OfflineSync] Comprehensive sync failed:', err);
      setOfflineToast('Sync failed — will retry later.');
      setTimeout(() => setOfflineToast(null), 4000);
    }
  }, [transition, comprehensiveOfflineSync, migrateLocalStorageFallbacks]);

  const { isOnline } = useNetworkConnectionWatcher({
    onOffline: handleNetworkOffline,
    onOnline: handleNetworkOnline,
  });

  // Keep the online ref in sync for use inside callbacks
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // On mount, try to flush any leftover offline jobs from previous sessions
  useEffect(() => {
    if (isOnline && user) {
      migrateLocalStorageFallbacks()
        .then(() => comprehensiveOfflineSync())
        .then(r => {
          if (r.uploaded > 0) {
            setOfflineToast(`Synced ${r.uploaded} offline file(s) with ML classifications.`);
            setTimeout(() => setOfflineToast(null), 4000);
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resume countdown done handler ──────────────────────────────────
  const handleResumeCountdownDone = useCallback(() => {
    // Unpause and return to active
    if (isPaused) togglePause();

    if (isOnline) {
      transition(SESSION_STATES.ACTIVE);
    } else {
      transition(SESSION_STATES.ACTIVE_OFFLINE);
    }
  }, [isPaused, isOnline, togglePause, transition]);

  // ── Cancel workout handlers ────────────────────────────────────────
  const handleRequestCancel = useCallback(() => {
    transition(SESSION_STATES.CANCEL_CONFIRM);
  }, [transition]);

  const handleKeepWorkout = useCallback(() => {
    // Return to the state we were in before cancel was requested
    if (deferredWorkoutResultRef.current) {
      // We were waiting for internet when cancel was requested
      transition(SESSION_STATES.WAITING_FOR_INTERNET);
    } else if (!connected) {
      transition(SESSION_STATES.PAUSED_BLE_DISCONNECTED);
    } else if (!isOnline) {
      transition(SESSION_STATES.ACTIVE_OFFLINE);
    } else {
      transition(SESSION_STATES.ACTIVE);
    }
  }, [connected, isOnline, transition]);

  const handleDiscardWorkout = useCallback(async () => {
    // Stop everything
    stopSession();

    if (isStreaming) {
      await cancelWorkout();
    }

    // Clear offline queue for this session
    if (workoutId) {
      await clearSessionJobs(workoutId);
    }

    // Clear checkpoint
    checkpointManagerRef.current.clear();

    // Clear any deferred workout data
    deferredWorkoutResultRef.current = null;

    transition(SESSION_STATES.IDLE);
    router.back();
  }, [stopSession, isStreaming, cancelWorkout, workoutId, transition, router]);

  // ── Waiting for Internet handlers ──────────────────────────────────
  const handleKeepWaiting = useCallback(() => {
    // Stay on the monitor page — the WAITING_FOR_INTERNET state persists,
    // the modal stays visible. When internet returns, handleNetworkOnline
    // will automatically proceed.
    // If user wants to dismiss the modal temporarily, keep the state.
  }, []);

  const handleWaitingCancel = useCallback(async () => {
    // Discard everything — same as cancel workout
    stopSession();

    if (isStreaming) {
      await cancelWorkout();
    }

    if (workoutId) {
      await clearSessionJobs(workoutId);
    }

    checkpointManagerRef.current.clear();
    deferredWorkoutResultRef.current = null;
    setIsAnalyzing(false);

    transition(SESSION_STATES.IDLE);
    router.back();
  }, [stopSession, isStreaming, cancelWorkout, workoutId, transition, router]);
  
  // Start recording with streaming
  const startRecording = async () => {
    console.log('🎬 Starting recording with config:', {
      exercise: workout,
      equipment: equipment,
      plannedSets: recommendedSets,
      plannedReps: recommendedReps,
      weight: workoutWeight,
      weightUnit: workoutWeightUnit,
      setType: workoutSetType
    });

    // Check if streaming is already initialized (from page load)
    if (isStreaming) {
      console.log('🎬 Streaming already active, starting recording session...');
      startRecordingSession();
      return;
    }

    // Fallback: Start the streaming session if not already initialized
    const result = await startStreaming({
      exercise: workout,
      equipment: equipment,
      plannedSets: recommendedSets,
      plannedReps: recommendedReps,
      weight: workoutWeight,
      weightUnit: workoutWeightUnit,
      setType: workoutSetType
    });
    
    if (result?.success) {
      console.log('🎬 Streaming started:', result.workoutId);
      startRecordingSession();
    } else {
      console.error('Failed to start streaming');
      alert('Failed to start workout recording. Please try again.');
    }
  };
  
  // Handle stop recording — now routes through cancel confirmation
  const stopRecording = async () => {
    handleRequestCancel();
  };

  // Handle skip set - save partial reps as incomplete and advance
  const handleSkipSet = async () => {
    const skippedSetData = skipSet();
    
    // Tag the set as incomplete in GCS
    if (isStreaming && skippedSetData) {
      console.log('⏭️ Set skipped:', skippedSetData);
      await handleSetSkipped(skippedSetData.completedReps, skippedSetData.plannedReps);
    }
  };

  // Handle reset current set - clear reps and start over
  const handleResetSet = () => {
    resetCurrentSet();
    resetCurrentSetLogging();
  };

  return (
    <div className="relative h-screen w-screen bg-black text-white overflow-hidden">
      <Head>
        <title>Workout Monitor — {workout} — AppLift</title>
      </Head>

      {/* Full-screen analyzing loading screen */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-[200]">
          <LoadingScreen message="Analyzing your session..." showLogo={true} />
        </div>
      )}

      {/* ── Error-handling overlays ─────────────────────────────────── */}

      {/* BLE Disconnected Modal */}
      <DeviceDisconnectedModal
        visible={isState(SESSION_STATES.PAUSED_BLE_DISCONNECTED)}
        isReconnecting={isReconnecting}
        reconnectFailed={reconnectFailed}
        reconnectAttempt={reconnectAttempt}
        maxAttempts={maxAttempts}
        currentRep={repStats.repCount}
        plannedReps={recommendedReps}
        onReconnect={attemptReconnect}
        onCancelAutoReconnect={cancelAutoReconnect}
        onCancel={handleRequestCancel}
      />

      {/* Resume Countdown (after BLE reconnects) */}
      <ResumeCountdown
        active={isState(SESSION_STATES.RESUMING_COUNTDOWN)}
        onDone={handleResumeCountdownDone}
      />

      {/* Cancel Confirmation Modal */}
      <CancelConfirmModal
        visible={isState(SESSION_STATES.CANCEL_CONFIRM)}
        onKeep={handleKeepWorkout}
        onDiscard={handleDiscardWorkout}
      />

      {/* Inactivity Modal */}
      <InactivityModal
        isOpen={showInactivityModal}
        onResume={handleInactivityResume}
        onEndSession={handleInactivityEndSession}
      />

      {/* Waiting for Internet Modal (workout complete but offline) */}
      <WaitingForInternetModal
        visible={isState(SESSION_STATES.WAITING_FOR_INTERNET)}
        pendingCount={pendingSetUploads}
        onKeepWaiting={handleKeepWaiting}
        onCancel={handleWaitingCancel}
      />

      {/* Offline Banner (non-blocking) */}
      <OfflineBanner
        visible={isState(SESSION_STATES.ACTIVE_OFFLINE)}
        onCancel={handleRequestCancel}
      />

      {/* Connection-restored toast */}
      {offlineToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[130] animate-fadeIn">
          <div
            className="px-5 py-2.5 rounded-full text-sm font-medium text-white"
            style={{
              background: 'rgba(30, 30, 35, 0.92)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          >
            {offlineToast}
          </div>
        </div>
      )}

      {/* ── End error-handling overlays ─────────────────────────────── */}

      {/* Countdown Overlay */}
      {showCountdown && (
        <div className="countdown-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-fadeIn">
          <div className="text-7xl sm:text-8xl md:text-9xl font-bold text-white animate-pulse">
            {countdownValue}
          </div>
        </div>
      )}

      {/* Break Overlay with Set Performance Analysis */}
      <SetBreakOverlay
        isOpen={isOnBreak}
        setData={workoutStats.setData.length > 0 ? workoutStats.setData[workoutStats.setData.length - 1] : null}
        currentSet={workoutStats.completedSets}
        totalSets={recommendedSets}
        timeRemaining={breakTimeRemaining}
        totalTime={sessionRestTime}
        isPaused={breakPaused}
        onTogglePause={toggleBreakPause}
        onSkip={stopBreak}
        motivationalMessage={motivationalMessage}
        backgroundMLStatus={backgroundMLStatus}
        exerciseName={workout}
        equipment={equipment}
        weight={weight}
        weightUnit={weightUnit}
      />

      {/* Rep Notification */}
      <WorkoutNotification 
        notification={lastRepNotification}
        onDismiss={() => setLastRepNotification(null)}
      />

      {/* Header with semi-transparent background */}
      <div className="absolute top-0 left-0 right-0 z-30 px-4 pt-2.5 sm:pt-3.5 pt-pwa-dynamic pb-4" style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0) 100%)'
      }}>
        {/* Top row - Back Button and Connection Pill */}
        <div className="flex items-center justify-between mb-2">
          {/* Back Button - fades out when workout starts */}
          <button
            onClick={() => router.back()}
            className={`flex items-center gap-2 text-white transition-opacity duration-500 ${
              sessionState === SESSION_STATES.IDLE ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            aria-label="Go back"
          >
            <svg 
              className="w-6 h-6" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M15 19l-7-7 7-7" 
              />
            </svg>
          </button>

          {/* Workout Title - centered */}
          <div 
            className={`absolute left-1/2 transform -translate-x-1/2 text-center transition-opacity duration-300 px-16 max-w-full ${
              isPillExpanded ? 'opacity-0' : 'opacity-0 animate-fade-in'
            }`}
          >
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{workout}</h1>
          </div>

          <div className="flex-1"></div>

          <ConnectPill
            connected={connected}
            device={device}
            onScan={scanDevices}
            onConnect={connectToDevice}
            onDisconnect={disconnect}
            scanning={scanning}
            devicesFound={devicesFound}
            availability={availability}
            batteryPercent={batteryPercent}
            collapse={1}
            onExpandChange={setIsPillExpanded}
          />
        </div>
        
        {/* Workout Config Badges */}
        <div className="flex items-center justify-center gap-2 opacity-0 animate-fade-in-up" style={{ animationDelay: '1.8s' }}>
          {/* Set Type Badge */}
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            workoutSetType === 'custom' 
              ? 'bg-gray-400 text-gray-900' 
              : 'bg-purple-400 text-purple-900'
          }`}>
            {workoutSetType === 'custom' ? 'Custom Set' : 'Recommended Set'}
          </span>
          
          {/* Equipment Badge */}
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            equipment?.toLowerCase().includes('barbell') ? 'bg-yellow-400 text-yellow-900' :
            equipment?.toLowerCase().includes('dumbbell') || equipment?.toLowerCase().includes('dumbbell') ? 'bg-blue-400 text-blue-900' :
            equipment?.toLowerCase().includes('weight stack') || equipment?.toLowerCase().includes('weightstack') || equipment?.toLowerCase().includes('cable') ? 'bg-red-400 text-red-900' :
            'bg-teal-400 text-teal-900'
          }`}>
            {equipment}
          </span>
          
          {/* Weight Badge (only show if weight > 0) */}
          <span className="text-xs px-3 py-1 rounded-full font-medium bg-amber-400 text-amber-900">
            {workoutWeight > 0 ? `${workoutWeight} ${workoutWeightUnit}` : `0 ${workoutWeightUnit}`}
          </span>
        </div>
      </div>

      <main className="relative h-full w-full flex items-center justify-center">

        {/* Chart - Constrained Size */}
        <div className="w-full md:max-w-3xl h-[40vh] md:h-[45vh] z-10">
          <AccelerationChart
            timeData={timeData}
            filteredData={filteredAccelData}
            thresholdHigh={repStats.thresholdHigh}
            thresholdLow={repStats.thresholdLow}
          />
        </div>
      </main>

      {/* Bottom Container - Frosted Glass Overlay */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-8" style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }}>
        <div className="mx-auto w-full max-w-lg">
          {/* Bottom Container - Buttons and Info Cards */}
          <div>
            {/* Timer/Start Button Bar */}
            <div className="flex items-center justify-between mb-3 opacity-0 animate-fade-in-up" style={{ animationDelay: '2.1s' }}>
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={!connected || !isSubscribed}
                    className="w-full py-4 rounded-full font-bold text-white text-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                    style={{
                      background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
                      boxShadow: '0 8px 24px rgba(147, 51, 234, 0.4)'
                    }}
                  >
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <span>Start Recording</span>
                  </button>
                ) : (
                  <>
                    {!isPaused ? (
                      <button
                        onClick={togglePause}
                        className="w-full py-4 rounded-full font-bold text-white text-xl transition-all flex items-center justify-center gap-3"
                        style={{
                          background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
                          boxShadow: '0 8px 24px rgba(147, 51, 234, 0.4)'
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                          </svg>
                        </div>
                        <span>{formatTime(elapsedTime)}</span>
                      </button>
                    ) : (
                      <div className="w-full space-y-2">
                        {/* Main resume/stop bar */}
                        <button
                          onClick={togglePause}
                          className="w-full py-4 rounded-full font-bold text-white text-xl transition-all flex items-center justify-between px-6"
                          style={{
                            background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
                            boxShadow: '0 8px 24px rgba(147, 51, 234, 0.4)'
                          }}
                        >
                          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          </div>
                          <span>{formatTime(elapsedTime)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              stopRecording();
                            }}
                            className="w-12 h-12 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-all"
                          >
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <rect x="6" y="6" width="12" height="12"/>
                            </svg>
                          </button>
                        </button>
                        
                        {/* Skip Set + Reset Set buttons row */}
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetSet();
                            }}
                            className="flex-1 py-2.5 rounded-full font-semibold text-white text-sm transition-all flex items-center justify-center gap-2"
                            style={{
                              background: 'rgba(255, 255, 255, 0.1)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                            }}
                          >
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Reset Set
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSkipSet();
                            }}
                            className="flex-1 py-2.5 rounded-full font-semibold text-white text-sm transition-all flex items-center justify-center gap-2"
                            style={{
                              background: 'rgba(234, 179, 8, 0.15)',
                              border: '1px solid rgba(234, 179, 8, 0.4)',
                            }}
                          >
                            <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                            </svg>
                            <span className="text-yellow-400">Skip Set</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Info Cards Row */}
              <div className="grid grid-cols-2 gap-3 opacity-0 animate-fade-in-up" style={{ animationDelay: '2.4s' }}>
                {/* Rep Count Card */}
                <div className="rounded-2xl p-4 backdrop-blur-md flex flex-col" style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  aspectRatio: '1.4'
                }}>
                  {/* Top Section - Label */}
                  <div className="mb-2">
                    <span className="text-base font-semibold text-white/90">Reps</span>
                  </div>
                  {/* Middle Section - Main Values */}
                  <div className="flex items-baseline gap-2 mb-auto">
                    <span className="text-5xl font-extrabold text-white leading-none">{repStats.repCount}</span>
                    <span className="text-2xl font-semibold text-white/40">/</span>
                    <span className="text-3xl font-semibold text-white/60">{recommendedReps}</span>
                  </div>
                  {/* Bottom Section - Progress Bar (aligned with set card) */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mt-2.5">
                    <div 
                      className="h-full rounded-full transition-all duration-300 ease-in-out"
                      style={{
                        width: `${Math.min((repStats.repCount / recommendedReps) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #EAB308 0%, #CA8A04 50%, #A16207 100%)',
                        boxShadow: '0 0 10px 2px rgba(234, 179, 8, 0.6)'
                      }}
                    />
                  </div>
                </div>

                {/* Set Card */}
                <div className="rounded-2xl p-4 flex flex-col backdrop-blur-md" style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  aspectRatio: '1.4'
                }}>
                  {/* Top Section - Label */}
                  <div className="mb-2">
                    <span className="text-base font-semibold text-white/90">Sets</span>
                  </div>
                  {/* Middle Section - Main Values */}
                  <div className="flex items-baseline gap-2 mb-auto">
                    <span className="text-5xl font-extrabold text-white leading-none">{currentSet}</span>
                    <span className="text-2xl font-semibold text-white/40">/</span>
                    <span className="text-3xl font-semibold text-white/60">{recommendedSets}</span>
                  </div>
                  {/* Bottom Section - Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mt-2.5">
                    <div 
                      className="h-full rounded-full transition-all duration-300 ease-in-out"
                      style={{
                        width: `${Math.min((currentSet / recommendedSets) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
                        boxShadow: '0 0 10px 2px rgba(59, 130, 246, 0.6)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
