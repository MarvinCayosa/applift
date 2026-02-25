/**
 * Workout Logging Context (Streaming Version)
 * 
 * Provides workout logging state and functions across the app.
 * Uses real-time streaming to GCS with ML-ready data format.
 * 
 * Flow:
 * 1. User starts recording → Initialize streaming
 * 2. Rep detected → Save rep data, return for ML classification
 * 3. ML model classifies → Store classification result
 * 4. Set complete → Move to next set
 * 5. Workout ends → Upload complete JSON to GCS
 * 
 * Data Format (JSON - ML optimized):
 * {
 *   "workoutId": "...",
 *   "sets": [{
 *     "setNumber": 1,
 *     "reps": [{
 *       "repNumber": 1,
 *       "samples": [{ set, rep, timestamp, accelX, accelY, ... }],
 *       "classification": "good_form" // from ML
 *     }]
 *   }]
 * }
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  initializeStreaming,
  addIMUSample,
  onRepDetected,
  onSetComplete,
  onSetSkipped,
  endStreaming,
  cancelStreaming,
  getStreamingState,
  getRepDataForML,
  getSetRepsForML,
  storeRepClassification,
  getCompleteWorkoutData,
  exportWorkoutAsCSV
} from '../services/imuStreamingService';
import { classifyReps } from '../services/mlClassificationService';
import { isNetworkOffline } from '../hooks/useNetworkConnectionWatcher';
import { enqueueJob, getAllPendingJobs } from '../utils/offlineQueue';

const WorkoutLoggingContext = createContext(null);

export function WorkoutLoggingProvider({ children }) {
  const { user } = useAuth();
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [workoutId, setWorkoutId] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [workoutStatus, setWorkoutStatus] = useState(null); // 'in_progress', 'completed', 'incomplete', 'canceled'
  
  // Workout configuration
  const [workoutConfig, setWorkoutConfig] = useState(null);
  
  // Tracking
  const [currentSet, setCurrentSet] = useState(1);
  const [currentRep, setCurrentRep] = useState(0);
  const [completedSets, setCompletedSets] = useState(0);
  const [totalReps, setTotalReps] = useState(0);
  
  // Background ML inference tracking
  const backgroundMLTasks = useRef(new Map()); // setNumber -> Promise
  const [backgroundMLStatus, setBackgroundMLStatus] = useState({}); // setNumber -> 'pending' | 'complete' | 'error'
  const [pendingSetUploads, setPendingSetUploads] = useState(0); // number of queued offline sets

  /**
   * Start streaming session (called when recording begins)
   * This replaces both initializeLog and markStarted
   */
  const startStreaming = useCallback(async (config) => {
    if (!user?.uid) {
      console.error('[WorkoutLogging] No authenticated user');
      setStreamError('User not authenticated');
      return null;
    }

    setStreamError(null);
    setWorkoutStatus('in_progress');

    try {
      // Get auth token
      const token = await user.getIdToken();

      // Initialize streaming service
      const result = await initializeStreaming({
        odUSerId: user.uid,
        token,
        exercise: config.exercise,
        equipment: config.equipment,
        plannedSets: config.plannedSets,
        plannedReps: config.plannedReps,
        weight: config.weight,
        weightUnit: config.weightUnit,
        weightBreakdown: config.weightBreakdown || '',
        setType: config.setType || 'recommended'
      });

      if (result.success) {
        setIsStreaming(true);
        setWorkoutId(result.workoutId);
        setWorkoutConfig(config);
        setCurrentSet(1);
        setCurrentRep(0);
        setCompletedSets(0);
        setTotalReps(0);

        console.log('[WorkoutLogging] Streaming started:', result.workoutId);
        return result;
      } else {
        throw new Error('Failed to initialize streaming');
      }
    } catch (error) {
      console.error('[WorkoutLogging] Failed to start streaming:', error);
      setStreamError(error.message);
      setIsStreaming(false);
      return null;
    }
  }, [user]);

  /**
   * Add IMU sample to stream
   * Called for each incoming BLE IMU packet
   */
  const streamIMUSample = useCallback((sample) => {
    if (!isStreaming) return;
    addIMUSample(sample);
  }, [isStreaming]);

  /**
   * Handle rep detection
   * Returns rep data formatted for ML classification
   */
  const handleRepDetected = useCallback(async (repInfo = {}) => {
    if (!isStreaming) return null;

    try {
      const result = await onRepDetected(repInfo);
      
      if (result) {
        setCurrentRep(result.repNumber);
        setTotalReps(prev => prev + 1);
        console.log(`[WorkoutLogging] Rep ${result.repNumber} of Set ${result.setNumber} recorded (${result.sampleCount} samples)`);
        
        // Return full result including repData for ML
        return result;
      }
      
      return null;
    } catch (error) {
      console.error('[WorkoutLogging] Failed to save rep:', error);
      setStreamError(error.message);
      return null;
    }
  }, [isStreaming]);

  /**
   * Get rep data formatted for ML model
   * Call this after handleRepDetected to get data for classification
   */
  const getRepForML = useCallback((setNumber, repNumber) => {
    return getRepDataForML(setNumber, repNumber);
  }, []);

  /**
   * Store ML classification result for a rep
   */
  const setRepClassification = useCallback((setNumber, repNumber, classification, confidence) => {
    return storeRepClassification(setNumber, repNumber, classification, confidence);
  }, []);

  /**
   * Run background ML inference for a completed set.
   * If online → call classify API immediately.
   * If offline → store set batch in IndexedDB for later upload.
   */
  const runBackgroundMLForSet = useCallback(async (setNumber, exercise) => {
    if (!user?.uid) {
      console.warn(`[WorkoutLogging] ⚠️ No user for ML - Set ${setNumber}`);
      return;
    }
    
    try {
      setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'pending' }));
      console.log(`[WorkoutLogging] ⚡ Starting background ML for Set ${setNumber}...`);
      
      // Get all reps data from the completed set
      const setData = getSetRepsForML(setNumber);
      if (!setData || !setData.reps || setData.reps.length === 0) {
        console.warn(`[WorkoutLogging] ⚠️ No rep data for Set ${setNumber}`);
        setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'error' }));
        return;
      }
      
      console.log(`[WorkoutLogging] 📊 Set ${setNumber} has ${setData.reps.length} reps to classify`);
      setData.reps.forEach((rep, idx) => {
        console.log(`[WorkoutLogging]   Rep ${idx + 1}: ${rep.samples?.length || 0} samples`);
      });

      // ── CHECK NETWORK STATUS BEFORE ATTEMPTING CLASSIFICATION ──
      const offline = isNetworkOffline() || (typeof navigator !== 'undefined' && !navigator.onLine);

      if (offline) {
        // STORE-AND-FORWARD: Queue set data in IndexedDB for later upload
        console.log(`[WorkoutLogging] 📦 Offline — queueing Set ${setNumber} for later classification`);
        
        const sessionId = workoutId || 'unknown';
        await enqueueJob(sessionId, 'set_classification', {
          exercise,
          setNumber,
          reps: setData.reps,
          userId: user.uid,
          queuedAt: Date.now(),
        }, setNumber);

        setPendingSetUploads(prev => prev + 1);
        setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'queued' }));
        console.log(`[WorkoutLogging] ✅ Set ${setNumber} queued for offline upload`);
        return;
      }
      
      // Get auth token
      const token = await user.getIdToken();
      
      // Call ML classification API
      console.log(`[WorkoutLogging] 🔄 Calling ML API for Set ${setNumber}...`);
      const result = await classifyReps(exercise, setData.reps, token);
      
      console.log(`[WorkoutLogging] 📬 ML API response for Set ${setNumber}:`, {
        modelAvailable: result?.modelAvailable,
        classificationsCount: result?.classifications?.length || 0,
        error: result?.error || null
      });
      
      // Check for errors in the result
      if (result?.error) {
        console.error(`[WorkoutLogging] ❌ ML API returned error for Set ${setNumber}: ${result.error}`);
        if (result.details) console.error(`[WorkoutLogging]   Details: ${result.details}`);
        if (result.hint) console.error(`[WorkoutLogging]   Hint: ${result.hint}`);

        // If classification failed for ANY network-related reason, queue for retry.
        // Check both the error message AND current offline status.
        const nowOffline = isNetworkOffline() || (typeof navigator !== 'undefined' && !navigator.onLine);
        const isRetryable = nowOffline
          || result.error.includes('Failed to fetch')
          || result.error.includes('NetworkError')
          || result.error.includes('Network offline')
          || result.error.includes('AbortError')
          || result.error.includes('aborted');

        if (isRetryable) {
          console.log(`[WorkoutLogging] 📦 Classification failed (offline=${nowOffline}) — queueing Set ${setNumber} for retry`);
          const sessionId = workoutId || 'unknown';
          await enqueueJob(sessionId, 'set_classification', {
            exercise,
            setNumber,
            reps: setData.reps,
            userId: user.uid,
            queuedAt: Date.now(),
          }, setNumber);
          setPendingSetUploads(prev => prev + 1);
          setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'queued' }));
          return;
        }

        setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'error' }));
        return;
      }
      
      if (result && result.classifications && result.classifications.length > 0) {
        // Store classifications in the streaming service
        result.classifications.forEach((cls, idx) => {
          const repNumber = setData.reps[idx]?.repNumber || idx + 1;
          console.log(`[WorkoutLogging] 💾 Storing classification Set ${setNumber} Rep ${repNumber}: ${cls.label} (${(cls.confidence * 100).toFixed(1)}%)`);
          storeRepClassification(
            setNumber, 
            repNumber, 
            {
              prediction: cls.prediction,
              label: cls.label,
              confidence: cls.confidence,
              probabilities: cls.probabilities,
              method: result.modelAvailable ? 'ml' : 'rules'
            },
            cls.confidence
          );
        });
        
        console.log(`[WorkoutLogging] ✅ Background ML complete for Set ${setNumber}: ${result.classifications.length} reps classified`);
        setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'complete' }));
      } else {
        console.warn(`[WorkoutLogging] ⚠️ No classifications returned for Set ${setNumber}`);
        setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'error' }));
      }
    } catch (error) {
      console.error(`[WorkoutLogging] ❌ Background ML failed for Set ${setNumber}:`, error);
      console.error(`[WorkoutLogging]   Error name: ${error.name}`);
      console.error(`[WorkoutLogging]   Error message: ${error.message}`);

      // If the failure looks network-related, queue the set for retry
      const nowOffline = isNetworkOffline() || (typeof navigator !== 'undefined' && !navigator.onLine);
      const msg = error.message || '';
      if (nowOffline || msg.includes('Failed to fetch') || msg.includes('aborted') || msg.includes('NetworkError')) {
        try {
          const sessionId = workoutId || 'unknown';
          const setData = getSetRepsForML(setNumber);
          if (setData?.reps?.length > 0) {
            await enqueueJob(sessionId, 'set_classification', {
              exercise,
              setNumber,
              reps: setData.reps,
              userId: user?.uid,
              queuedAt: Date.now(),
            }, setNumber);
            setPendingSetUploads(prev => prev + 1);
            setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'queued' }));
            console.log(`[WorkoutLogging] 📦 Queued Set ${setNumber} for retry after thrown error`);
            return;
          }
        } catch (queueErr) {
          console.warn('[WorkoutLogging] Failed to queue set for retry:', queueErr);
        }
      }

      setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'error' }));
    }
  }, [user, workoutId]);

  /**
   * Handle set completion
   * Finalizes current set and prepares for next
   * Also triggers background ML inference for the completed set
   */
  const handleSetComplete = useCallback(async () => {
    if (!isStreaming) return null;

    try {
      const result = await onSetComplete();
      
      if (result) {
        setCompletedSets(result.completedSet);
        setCurrentSet(result.completedSet + 1);
        setCurrentRep(0);
        console.log(`[WorkoutLogging] Set ${result.completedSet} complete, total reps: ${result.totalReps}`);
        
        // Trigger background ML inference for the completed set (non-blocking)
        if (workoutConfig?.exercise) {
          // Run in background - don't await
          const mlTask = runBackgroundMLForSet(result.completedSet, workoutConfig.exercise);
          backgroundMLTasks.current.set(result.completedSet, mlTask);
        }
      }
      
      return result;
    } catch (error) {
      console.error('[WorkoutLogging] Failed to complete set:', error);
      setStreamError(error.message);
      return null;
    }
  }, [isStreaming, workoutConfig, runBackgroundMLForSet]);

  /**
   * Handle set skipped (incomplete)
   * Tags the set as incomplete in GCS, then advances to next set.
   * Also triggers ML inference for whatever reps were completed.
   */
  const handleSetSkipped = useCallback(async (completedReps, plannedReps) => {
    if (!isStreaming) return null;

    try {
      const result = await onSetSkipped(completedReps, plannedReps);
      
      if (result) {
        setCompletedSets(result.completedSet);
        setCurrentSet(result.completedSet + 1);
        setCurrentRep(0);
        console.log(`[WorkoutLogging] Set ${result.completedSet} skipped (${completedReps}/${plannedReps} reps), total reps: ${result.totalReps}`);
        
        // Still run ML on whatever reps were completed (non-blocking)
        if (workoutConfig?.exercise && completedReps > 0) {
          const mlTask = runBackgroundMLForSet(result.completedSet, workoutConfig.exercise);
          backgroundMLTasks.current.set(result.completedSet, mlTask);
        }
      }
      
      return result;
    } catch (error) {
      console.error('[WorkoutLogging] Failed to skip set:', error);
      setStreamError(error.message);
      return null;
    }
  }, [isStreaming, workoutConfig, runBackgroundMLForSet]);

  /**
   * Wait for all background ML tasks to complete (with timeout)
   */
  const waitForBackgroundML = useCallback(async (timeoutMs = 15000) => {
    const tasks = Array.from(backgroundMLTasks.current.values());
    if (tasks.length === 0) {
      console.log('[WorkoutLogging] No background ML tasks to wait for');
      return;
    }
    
    console.log(`[WorkoutLogging] ⏳ Waiting for ${tasks.length} background ML tasks (timeout: ${timeoutMs}ms)...`);
    
    const startTime = Date.now();
    
    try {
      // Race between tasks completing and timeout
      await Promise.race([
        Promise.allSettled(tasks),
        new Promise(resolve => setTimeout(resolve, timeoutMs))
      ]);
      const elapsed = Date.now() - startTime;
      console.log(`[WorkoutLogging] ✅ Background ML tasks settled in ${elapsed}ms`);
    } catch (error) {
      console.warn('[WorkoutLogging] Some background ML tasks failed:', error);
    }
  }, []);

  /**
   * Flush queued set classifications from IndexedDB.
   * Called when internet reconnects during or after a workout.
   * Processes each queued set_classification job in order.
   * 
   * Returns:
   * - uploaded: number of successfully classified sets
   * - failed: number of failed classifications
   * - classificationsBySet: { setNumber -> [repClassifications] }
   * - sessionClassifications: { sessionId -> { setNumber -> [repClassifications], exercise } }
   *   (grouped by session for proper GCS/Firestore updates)
   */
  const flushPendingSetClassifications = useCallback(async () => {
    if (!user?.uid) return { uploaded: 0, failed: 0, classificationsBySet: {}, sessionClassifications: {} };

    try {
      const pending = await getAllPendingJobs();
      const classificationJobs = pending.filter(j => j.type === 'set_classification' && j.status === 'pending');

      if (classificationJobs.length === 0) {
        setPendingSetUploads(0);
        return { uploaded: 0, failed: 0, classificationsBySet: {}, sessionClassifications: {} };
      }

      console.log(`[WorkoutLogging] 🔄 Flushing ${classificationJobs.length} queued set classifications...`);
      const token = await user.getIdToken();
      let uploaded = 0;
      let failed = 0;
      // Collect classification results keyed by setNumber so the caller
      // can merge them into the (possibly stale) deferred workout data.
      const classificationsBySet = {};
      // Also group by sessionId for proper GCS/Firestore updates when recovering orphaned sessions
      const sessionClassifications = {};

      const { updateJobStatus } = await import('../utils/offlineQueue');

      for (const job of classificationJobs) {
        try {
          await updateJobStatus(job.jobId, 'uploading');

          const { exercise, setNumber, reps } = job.payload;
          const sessionId = job.sessionId;
          const result = await classifyReps(exercise, reps, token);

          if (result && result.classifications && result.classifications.length > 0) {
            // Build per-rep classification objects
            const repClassifications = result.classifications.map((cls, idx) => ({
              repNumber: reps[idx]?.repNumber || idx + 1,
              classification: {
                prediction: cls.prediction,
                label: cls.label,
                confidence: cls.confidence,
                probabilities: cls.probabilities,
                method: result.modelAvailable ? 'ml' : 'rules'
              },
              confidence: cls.confidence,
            }));

            classificationsBySet[setNumber] = repClassifications;
            
            // Group by session for orphaned session recovery
            if (!sessionClassifications[sessionId]) {
              sessionClassifications[sessionId] = { sets: {}, exercise };
            }
            sessionClassifications[sessionId].sets[setNumber] = repClassifications;

            // Also try to store in streaming service (works if session is still alive)
            repClassifications.forEach(rc => {
              storeRepClassification(setNumber, rc.repNumber, rc.classification, rc.confidence);
            });

            setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'complete' }));
            await updateJobStatus(job.jobId, 'done');
            uploaded++;
          } else {
            // Classification returned empty/error — treat as failure so it can be retried
            console.warn(`[WorkoutLogging] Classification returned empty for Set ${setNumber}: ${result?.error || 'no classifications'}`);
            await updateJobStatus(job.jobId, 'failed');
            failed++;
          }
        } catch (err) {
          console.warn(`[WorkoutLogging] Failed to flush set classification ${job.jobId}:`, err);
          await updateJobStatus(job.jobId, 'failed');
          failed++;
        }
      }

      setPendingSetUploads(Math.max(0, pendingSetUploads - uploaded));
      const sessionIds = Object.keys(sessionClassifications);
      console.log(`[WorkoutLogging] ✅ Flushed: ${uploaded} uploaded, ${failed} failed, sets: ${Object.keys(classificationsBySet).join(', ')}, sessions: ${sessionIds.join(', ')}`);
      return { uploaded, failed, classificationsBySet, sessionClassifications };
    } catch (err) {
      console.warn('[WorkoutLogging] flushPendingSetClassifications error:', err);
      return { uploaded: 0, failed: 0, classificationsBySet: {}, sessionClassifications: {} };
    }
  }, [user, pendingSetUploads]);

  /**
   * Check if there are any pending set classification uploads.
   * @returns {Promise<boolean>}
   */
  const checkHasPendingUploads = useCallback(async () => {
    try {
      const pending = await getAllPendingJobs();
      const classificationJobs = pending.filter(j => j.type === 'set_classification' && (j.status === 'pending' || j.status === 'uploading'));
      const count = classificationJobs.length;
      setPendingSetUploads(count);
      return count > 0;
    } catch (_) {
      return pendingSetUploads > 0;
    }
  }, [pendingSetUploads]);

  /**
   * End the workout
   * Determines completion status and saves final metadata.
   * Adapts timeouts when offline — fails fast instead of hanging.
   */
  const finishWorkout = useCallback(async () => {
    if (!isStreaming) return null;

    // Use our own offline flag — navigator.onLine is unreliable on localhost
    let online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    try {
      const { isNetworkOffline } = await import('../hooks/useNetworkConnectionWatcher');
      if (isNetworkOffline()) online = false;
    } catch (_) {}

    try {
      // Wait for background ML — very short timeout when offline
      const mlTimeout = online ? 8000 : 1000;
      console.log(`[WorkoutLogging] ⏳ Waiting for ML tasks (timeout: ${mlTimeout}ms, online: ${online})...`);
      await waitForBackgroundML(mlTimeout);
      
      const result = await endStreaming(true);
      
      setIsStreaming(false);
      setWorkoutStatus(result.status);
      
      console.log(`[WorkoutLogging] Workout finished: ${result.status}`);
      console.log(`[WorkoutLogging] ${result.completedSets}/${result.plannedSets} sets, ${result.completedReps}/${result.plannedReps} reps`);
      
      // Re-check online status (may have changed during endStreaming)
      try {
        const { isNetworkOffline } = await import('../hooks/useNetworkConnectionWatcher');
        if (isNetworkOffline()) online = false;
      } catch (_) {}

      // Save to Firestore via API (skip when offline)
      if (user && online) {
        const saveToFirestore = async (attempt = 1) => {
          try {
            const token = await user.getIdToken();
            const controller = new AbortController();
            // 15s timeout (Vercel cold starts can take 5-10s)
            const tid = setTimeout(() => controller.abort(), 15000);
            await fetch('/api/imu-stream', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                action: 'completeWorkout',
                userId: user.uid,
                workoutId: result.workoutId,
                metadata: result.metadata
              }),
              signal: controller.signal,
            });
            clearTimeout(tid);
            console.log(`[WorkoutLogging] Firestore save succeeded (attempt ${attempt})`);
          } catch (fsErr) {
            console.warn(`[WorkoutLogging] Firestore save failed (attempt ${attempt}):`, fsErr.message);
            if (attempt < 3) {
              // Retry after a short delay
              await new Promise(r => setTimeout(r, 1000 * attempt));
              return saveToFirestore(attempt + 1);
            }
            console.error('[WorkoutLogging] Firestore save failed after 3 attempts');
          }
        };
        await saveToFirestore();

        // Invalidate exercise stats cache so History page shows fresh data
        try {
          const eq = (result.metadata?.equipment || '').trim()
            .replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
            .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
          const ex = (result.metadata?.exercise || '').trim()
            .replace(/([a-z])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
            .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
          const prefix = `exStats_${user.uid}_${eq}_${ex}_`;
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
          }
          console.log('[WorkoutLogging] Cleared exercise stats cache:', prefix);
        } catch (_) {}
      }
      
      return result;
    } catch (error) {
      console.error('[WorkoutLogging] Failed to finish workout:', error);
      setStreamError(error.message);
      return null;
    }
  }, [isStreaming, user, waitForBackgroundML]);

  /**
   * Cancel the workout
   */
  const cancelWorkout = useCallback(async () => {
    try {
      const result = await cancelStreaming();
      
      setIsStreaming(false);
      setWorkoutStatus('canceled');
      
      console.log('[WorkoutLogging] Workout canceled');
      
      // Save cancellation to Firestore
      if (user && result) {
        const token = await user.getIdToken();
        await fetch('/api/imu-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'completeWorkout',
            userId: user.uid,
            workoutId: result.workoutId,
            metadata: result.metadata
          })
        });
      }
      
      return result;
    } catch (error) {
      console.error('[WorkoutLogging] Failed to cancel workout:', error);
      setStreamError(error.message);
      return null;
    }
  }, [user]);

  /**
   * Reset state
   */
  const resetWorkout = useCallback(() => {
    setIsStreaming(false);
    setWorkoutId(null);
    setStreamError(null);
    setWorkoutStatus(null);
    setWorkoutConfig(null);
    setCurrentSet(1);
    setCurrentRep(0);
    setCompletedSets(0);
    setTotalReps(0);
  }, []);

  /**
   * Get current streaming state
   */
  const getState = useCallback(() => {
    return getStreamingState();
  }, []);

  /**
   * Get complete workout data (for export or ML batch processing)
   */
  const getWorkoutData = useCallback(() => {
    return getCompleteWorkoutData();
  }, []);

  /**
   * Export entire workout as CSV string
   */
  const exportAsCSV = useCallback(() => {
    return exportWorkoutAsCSV();
  }, []);

  const value = {
    // State
    isStreaming,
    workoutId,
    streamError,
    workoutStatus,
    workoutConfig,
    currentSet,
    currentRep,
    completedSets,
    totalReps,
    backgroundMLStatus, // Track background ML inference status per set
    pendingSetUploads,  // Number of queued offline set classifications
    
    // Core Actions
    startStreaming,
    streamIMUSample,
    handleRepDetected,
    handleSetComplete,
    handleSetSkipped,
    finishWorkout,
    cancelWorkout,
    resetWorkout,
    getState,
    
    // ML Integration
    getRepForML,           // Get rep data formatted for ML model
    setRepClassification,  // Store ML classification result
    getWorkoutData,        // Get complete workout JSON
    exportAsCSV,           // Export as CSV string
    flushPendingSetClassifications, // Flush queued offline set classifications
    checkHasPendingUploads,        // Check if pending uploads exist
    
    // Legacy compatibility (for existing code)
    currentLog: workoutId ? { logId: workoutId, sessionId: workoutId, status: workoutStatus } : null,
    hasActiveLog: isStreaming,
    logError: streamError,
    uploadProgress: isStreaming ? 'streaming' : null,
    
    // Legacy function mappings
    initializeLog: async (details) => {
      // Store config but don't start streaming yet
      setWorkoutConfig({
        exercise: details.exercise,
        equipment: details.equipment,
        plannedSets: details.sets,
        plannedReps: details.reps,
        weight: details.weight,
        weightUnit: details.weightUnit,
        weightBreakdown: details.weightBreakdown || '',
        setType: details.setType || 'recommended'
      });
      return { logId: 'pending', sessionId: 'pending' };
    },
    markStarted: async () => {
      if (workoutConfig) {
        return await startStreaming(workoutConfig);
      }
      return null;
    },
    setRawData: () => {}, // No-op, data streams directly
    setSetsData: () => {}, // No-op, sets tracked in streaming service
    completeLog: finishWorkout,
    cancelLog: cancelWorkout,
  };

  return (
    <WorkoutLoggingContext.Provider value={value}>
      {children}
    </WorkoutLoggingContext.Provider>
  );
}

/**
 * Hook to use workout logging context
 */
export function useWorkoutLogging() {
  const context = useContext(WorkoutLoggingContext);
  
  if (!context) {
    throw new Error('useWorkoutLogging must be used within a WorkoutLoggingProvider');
  }
  
  return context;
}

export default WorkoutLoggingContext;
