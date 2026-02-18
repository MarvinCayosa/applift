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
   * Run background ML inference for a completed set
   * This runs asynchronously without blocking the UI
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
      setBackgroundMLStatus(prev => ({ ...prev, [setNumber]: 'error' }));
    }
  }, [user]);

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
   * End the workout
   * Determines completion status and saves final metadata
   */
  const finishWorkout = useCallback(async () => {
    if (!isStreaming) return null;

    try {
      // Wait for background ML to complete (max 15 seconds - Cloud Run may need time)
      console.log('[WorkoutLogging] ⏳ Waiting for all ML tasks to complete before finishing...');
      await waitForBackgroundML(15000);
      
      const result = await endStreaming(true);
      
      setIsStreaming(false);
      setWorkoutStatus(result.status);
      
      console.log(`[WorkoutLogging] Workout finished: ${result.status}`);
      console.log(`[WorkoutLogging] ${result.completedSets}/${result.plannedSets} sets, ${result.completedReps}/${result.plannedReps} reps`);
      
      // Save to Firestore via API
      if (user) {
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
    
    // Core Actions
    startStreaming,
    streamIMUSample,
    handleRepDetected,
    handleSetComplete,
    finishWorkout,
    cancelWorkout,
    resetWorkout,
    getState,
    
    // ML Integration
    getRepForML,           // Get rep data formatted for ML model
    setRepClassification,  // Store ML classification result
    getWorkoutData,        // Get complete workout JSON
    exportAsCSV,           // Export as CSV string
    
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
