/**
 * Workout Log Service
 * 
 * Handles workout session logging to Firestore with the following lifecycle:
 * 1. Pre-workout: Create log with planned exercise details (pending status)
 * 2. During workout: Update with real-time data if needed
 * 3. Post-workout: Save summary results and mark as completed
 * 4. On cancel: Mark as canceled
 * 
 * Schema:
 * - userId: string (Firebase Auth UID)
 * - sessionId: string (unique session identifier)
 * - status: 'pending' | 'in_progress' | 'completed' | 'canceled'
 * - exercise: { name, equipment, targetMuscles }
 * - planned: { sets, reps, weight, weightUnit }
 * - results: { totalSets, totalReps, totalTime, calories, setData[], avgConcentric, avgEccentric }
 * - imuDataPath: string (GCS path to raw IMU CSV)
 * - timestamps: { created, started, completed }
 */

import { db } from '../config/firestore';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

// Collection reference
const WORKOUT_LOGS_COLLECTION = 'workoutLogs';

/**
 * Generate a unique session ID
 */
const generateSessionId = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `session_${timestamp}_${randomPart}`;
};

/**
 * Create a new workout log (called when user clicks "Let's Workout")
 * Status: 'pending' - workout planned but not started
 */
export const createWorkoutLog = async (userId, workoutDetails) => {
  if (!userId) {
    throw new Error('User ID is required to create workout log');
  }

  const sessionId = generateSessionId();
  
  const logData = {
    userId,
    sessionId,
    status: 'pending',
    exercise: {
      name: workoutDetails.exerciseName,
      equipment: workoutDetails.equipment,
      targetMuscles: workoutDetails.targetMuscles || [],
    },
    planned: {
      sets: workoutDetails.plannedSets || 0,
      reps: workoutDetails.plannedReps || 0,
      weight: workoutDetails.weight || 0,
      weightUnit: workoutDetails.weightUnit || 'kg',
    },
    results: null, // Will be populated after workout
    imuDataPath: null, // Will be set after GCS upload
    timestamps: {
      created: serverTimestamp(),
      started: null,
      completed: null,
    },
  };

  try {
    const docRef = await addDoc(collection(db, WORKOUT_LOGS_COLLECTION), logData);
    console.log('[WorkoutLogService] Created workout log:', docRef.id, sessionId);
    
    return {
      logId: docRef.id,
      sessionId,
      ...logData,
    };
  } catch (error) {
    console.error('[WorkoutLogService] Error creating workout log:', error);
    throw error;
  }
};

/**
 * Start the workout (called when recording begins)
 * Status: 'in_progress'
 */
export const startWorkoutLog = async (logId) => {
  if (!logId) {
    throw new Error('Log ID is required to start workout');
  }

  try {
    const logRef = doc(db, WORKOUT_LOGS_COLLECTION, logId);
    await updateDoc(logRef, {
      status: 'in_progress',
      'timestamps.started': serverTimestamp(),
    });
    
    console.log('[WorkoutLogService] Started workout:', logId);
    return true;
  } catch (error) {
    console.error('[WorkoutLogService] Error starting workout:', error);
    throw error;
  }
};

/**
 * Complete the workout with results (called from workout-finished page)
 * Status: 'completed'
 */
export const completeWorkoutLog = async (logId, results, imuDataPath = null) => {
  if (!logId) {
    throw new Error('Log ID is required to complete workout');
  }

  try {
    const logRef = doc(db, WORKOUT_LOGS_COLLECTION, logId);
    
    const updateData = {
      status: 'completed',
      results: {
        totalSets: results.totalSets || 0,
        totalReps: results.totalReps || 0,
        totalTime: results.totalTime || 0,
        calories: results.calories || 0,
        avgConcentric: results.avgConcentric || 0,
        avgEccentric: results.avgEccentric || 0,
        setData: results.setData || [],
      },
      'timestamps.completed': serverTimestamp(),
    };

    if (imuDataPath) {
      updateData.imuDataPath = imuDataPath;
    }

    await updateDoc(logRef, updateData);
    
    console.log('[WorkoutLogService] Completed workout:', logId);
    return true;
  } catch (error) {
    console.error('[WorkoutLogService] Error completing workout:', error);
    throw error;
  }
};

/**
 * Cancel/abandon the workout
 * Status: 'canceled'
 */
export const cancelWorkoutLog = async (logId, reason = 'user_canceled') => {
  if (!logId) {
    console.warn('[WorkoutLogService] No log ID provided for cancellation');
    return false;
  }

  try {
    const logRef = doc(db, WORKOUT_LOGS_COLLECTION, logId);
    await updateDoc(logRef, {
      status: 'canceled',
      cancelReason: reason,
      'timestamps.completed': serverTimestamp(),
    });
    
    console.log('[WorkoutLogService] Canceled workout:', logId);
    return true;
  } catch (error) {
    console.error('[WorkoutLogService] Error canceling workout:', error);
    throw error;
  }
};

/**
 * Update IMU data path after GCS upload
 */
export const updateIMUDataPath = async (logId, imuDataPath) => {
  if (!logId || !imuDataPath) {
    throw new Error('Log ID and IMU data path are required');
  }

  try {
    const logRef = doc(db, WORKOUT_LOGS_COLLECTION, logId);
    await updateDoc(logRef, {
      imuDataPath,
    });
    
    console.log('[WorkoutLogService] Updated IMU data path:', logId);
    return true;
  } catch (error) {
    console.error('[WorkoutLogService] Error updating IMU data path:', error);
    throw error;
  }
};

/**
 * Get a single workout log by ID
 */
export const getWorkoutLog = async (logId) => {
  try {
    const logRef = doc(db, WORKOUT_LOGS_COLLECTION, logId);
    const logSnap = await getDoc(logRef);
    
    if (logSnap.exists()) {
      return { id: logSnap.id, ...logSnap.data() };
    }
    return null;
  } catch (error) {
    console.error('[WorkoutLogService] Error getting workout log:', error);
    throw error;
  }
};

/**
 * Get all completed workout logs for a user
 * Supports both old format (userId, timestamps.created) and new format (odUSerId)
 * Note: Sorting done client-side to avoid needing composite Firestore indexes
 */
export const getUserWorkoutLogs = async (userId, options = {}) => {
  const { 
    status = 'completed', 
    limitCount = 50,
    startDate = null,
    endDate = null 
  } = options;

  try {
    let logs = [];
    
    // Try new format first (odUSerId)
    try {
      const q1 = query(
        collection(db, WORKOUT_LOGS_COLLECTION),
        where('odUSerId', '==', userId),
        where('status', '==', status),
        limit(limitCount * 2) // Get extra to account for filtering
      );
      
      const snapshot1 = await getDocs(q1);
      snapshot1.forEach((doc) => {
        const data = doc.data();
        logs.push({ id: doc.id, ...data });
      });
      
      console.log('[WorkoutLogService] Found', logs.length, 'logs with odUSerId');
    } catch (err) {
      console.log('[WorkoutLogService] Query with odUSerId failed:', err.message);
    }

    // Also try old format (userId) if no results
    if (logs.length === 0) {
      try {
        const q2 = query(
          collection(db, WORKOUT_LOGS_COLLECTION),
          where('userId', '==', userId),
          where('status', '==', status),
          limit(limitCount * 2)
        );
        
        const snapshot2 = await getDocs(q2);
        snapshot2.forEach((doc) => {
          const data = doc.data();
          logs.push({ id: doc.id, ...data });
        });
        
        console.log('[WorkoutLogService] Found', logs.length, 'logs with userId');
      } catch (err) {
        console.log('[WorkoutLogService] Query with userId also failed:', err.message);
      }
    }

    // Sort by timestamp (client-side to avoid composite index requirement)
    logs.sort((a, b) => {
      const dateA = a.timestamps?.started?.toDate?.() || 
                    a.timestamps?.created?.toDate?.() || 
                    (a.startTime ? new Date(a.startTime) : new Date(0));
      const dateB = b.timestamps?.started?.toDate?.() || 
                    b.timestamps?.created?.toDate?.() || 
                    (b.startTime ? new Date(b.startTime) : new Date(0));
      return dateB - dateA; // Descending order
    });

    // Filter by date range if specified
    if (startDate || endDate) {
      logs = logs.filter(log => {
        const createdAt = log.timestamps?.started?.toDate?.() || 
                          log.timestamps?.created?.toDate?.() ||
                          (log.startTime ? new Date(log.startTime) : new Date(0));
        if (startDate && createdAt < startDate) return false;
        if (endDate && createdAt > endDate) return false;
        return true;
      });
    }
    
    // Apply limit after sorting
    return logs.slice(0, limitCount);
  } catch (error) {
    console.error('[WorkoutLogService] Error getting user workout logs:', error);
    throw error;
  }
};

/**
 * Get workout logs for a specific date range (for dashboard/history)
 */
export const getWorkoutLogsByDateRange = async (userId, startDate, endDate) => {
  try {
    const startTimestamp = Timestamp.fromDate(startDate);
    const endTimestamp = Timestamp.fromDate(endDate);

    const q = query(
      collection(db, WORKOUT_LOGS_COLLECTION),
      where('userId', '==', userId),
      where('status', '==', 'completed'),
      where('timestamps.created', '>=', startTimestamp),
      where('timestamps.created', '<=', endTimestamp),
      orderBy('timestamps.created', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const logs = [];
    
    querySnapshot.forEach((doc) => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    
    return logs;
  } catch (error) {
    console.error('[WorkoutLogService] Error getting workout logs by date range:', error);
    throw error;
  }
};

/**
 * Get aggregated stats for dashboard
 * Handles both old and new data formats
 */
export const getUserWorkoutStats = async (userId) => {
  try {
    const logs = await getUserWorkoutLogs(userId, { status: 'completed', limitCount: 1000 });
    
    const stats = {
      totalWorkouts: logs.length,
      totalReps: 0,
      totalSets: 0,
      totalTime: 0,
      totalCalories: 0,
      equipmentDistribution: {},
      exerciseCount: {},
      weeklyWorkouts: 0,
      monthlyWorkouts: 0,
    };

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    logs.forEach((log) => {
      // Aggregate results - handle both old format (log.results) and new format (root level)
      if (log.results) {
        stats.totalReps += log.results.totalReps || 0;
        stats.totalSets += log.results.totalSets || 0;
        stats.totalTime += log.results.totalTime || 0;
        stats.totalCalories += log.results.calories || 0;
      } else {
        // New format - data at root level
        stats.totalReps += log.totalReps || 0;
        // Count sets from sets object
        const setsObj = log.sets || {};
        const setCount = Object.keys(setsObj).length;
        stats.totalSets += setCount;
      }

      // Equipment distribution - handle both formats
      const equipment = log.exercise?.equipment || log.equipment;
      if (equipment) {
        stats.equipmentDistribution[equipment] = (stats.equipmentDistribution[equipment] || 0) + 1;
      }

      // Exercise count - handle both formats
      const exercise = log.exercise?.name || log.exercise;
      if (exercise) {
        stats.exerciseCount[exercise] = (stats.exerciseCount[exercise] || 0) + 1;
      }

      // Weekly/Monthly counts - handle both timestamp formats
      const createdAt = log.timestamps?.started?.toDate?.() || 
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null);
      if (createdAt) {
        if (createdAt >= oneWeekAgo) stats.weeklyWorkouts++;
        if (createdAt >= oneMonthAgo) stats.monthlyWorkouts++;
      }
    });

    return stats;
  } catch (error) {
    console.error('[WorkoutLogService] Error getting user workout stats:', error);
    throw error;
  }
};

/**
 * Get the last workout for a user
 */
export const getLastWorkout = async (userId) => {
  try {
    const logs = await getUserWorkoutLogs(userId, { status: 'completed', limitCount: 1 });
    return logs.length > 0 ? logs[0] : null;
  } catch (error) {
    console.error('[WorkoutLogService] Error getting last workout:', error);
    throw error;
  }
};

/**
 * Get workout history grouped by date (for calendar view)
 */
export const getWorkoutCalendarData = async (userId, year, month) => {
  try {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);
    
    const logs = await getWorkoutLogsByDateRange(userId, startDate, endDate);
    
    // Group by day
    const workoutDays = {};
    logs.forEach((log) => {
      const createdAt = log.timestamps?.created?.toDate?.();
      if (createdAt) {
        const day = createdAt.getDate();
        if (!workoutDays[day]) {
          workoutDays[day] = [];
        }
        workoutDays[day].push({
          id: log.id,
          exercise: log.exercise?.name,
          equipment: log.exercise?.equipment,
          reps: log.results?.totalReps,
          sets: log.results?.totalSets,
          duration: log.results?.totalTime,
          startTime: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        });
      }
    });
    
    return workoutDays;
  } catch (error) {
    console.error('[WorkoutLogService] Error getting workout calendar data:', error);
    throw error;
  }
};

export default {
  createWorkoutLog,
  startWorkoutLog,
  completeWorkoutLog,
  cancelWorkoutLog,
  updateIMUDataPath,
  getWorkoutLog,
  getUserWorkoutLogs,
  getWorkoutLogsByDateRange,
  getUserWorkoutStats,
  getLastWorkout,
  getWorkoutCalendarData,
};
