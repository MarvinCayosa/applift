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
  storeRepClassification,
  getCompleteWorkoutData,
  exportWorkoutAsCSV
} from '../services/imuStreamingService';

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
   * Handle set completion
   * Finalizes current set and prepares for next
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
      }
      
      return result;
    } catch (error) {
      console.error('[WorkoutLogging] Failed to complete set:', error);
      setStreamError(error.message);
      return null;
    }
  }, [isStreaming]);

  /**
   * End the workout
   * Determines completion status and saves final metadata
   */
  const finishWorkout = useCallback(async () => {
    if (!isStreaming) return null;

    try {
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
  }, [isStreaming, user]);

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
