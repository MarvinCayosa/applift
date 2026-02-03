/**
 * useWorkoutLogs Hook
 * 
 * Fetches and manages workout logs data for dashboard and history views.
 * Provides real-time updates and caching for better performance.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getUserWorkoutLogs,
  getUserWorkoutStats,
  getLastWorkout,
  getWorkoutCalendarData,
} from '../services/workoutLogService';

export function useWorkoutLogs(options = {}) {
  const { user, isAuthenticated } = useAuth();
  const { 
    autoFetch = true, 
    limitCount = 20,
    includeStats = true,
    includeCalendar = false,
    calendarYear = new Date().getFullYear(),
    calendarMonth = new Date().getMonth(),
  } = options;

  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastWorkout, setLastWorkout] = useState(null);
  const [calendarData, setCalendarData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch workout logs
  const fetchLogs = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const fetchedLogs = await getUserWorkoutLogs(user.uid, {
        status: null, // Get all workouts
        limitCount,
      });
      setLogs(fetchedLogs);
      return fetchedLogs;
    } catch (err) {
      console.error('[useWorkoutLogs] Error fetching logs:', err);
      setError(err.message);
      return [];
    }
  }, [user?.uid, limitCount]);

  // Fetch workout stats
  const fetchStats = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const fetchedStats = await getUserWorkoutStats(user.uid);
      setStats(fetchedStats);
      return fetchedStats;
    } catch (err) {
      console.error('[useWorkoutLogs] Error fetching stats:', err);
      // Don't set error for stats, as logs might still work
      return null;
    }
  }, [user?.uid]);

  // Fetch last workout
  const fetchLastWorkout = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const workout = await getLastWorkout(user.uid);
      setLastWorkout(workout);
      return workout;
    } catch (err) {
      console.error('[useWorkoutLogs] Error fetching last workout:', err);
      return null;
    }
  }, [user?.uid]);

  // Fetch calendar data for a specific month
  const fetchCalendarData = useCallback(async (year, month) => {
    if (!user?.uid) return;

    try {
      const data = await getWorkoutCalendarData(user.uid, year, month);
      setCalendarData(prev => ({
        ...prev,
        [`${year}-${month}`]: data,
      }));
      return data;
    } catch (err) {
      console.error('[useWorkoutLogs] Error fetching calendar data:', err);
      return {};
    }
  }, [user?.uid]);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    if (!user?.uid || !isAuthenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const promises = [fetchLogs(), fetchLastWorkout()];
      
      if (includeStats) {
        promises.push(fetchStats());
      }
      
      if (includeCalendar) {
        promises.push(fetchCalendarData(calendarYear, calendarMonth));
      }

      await Promise.all(promises);
    } catch (err) {
      console.error('[useWorkoutLogs] Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [
    user?.uid, 
    isAuthenticated, 
    fetchLogs, 
    fetchStats, 
    fetchLastWorkout, 
    fetchCalendarData,
    includeStats,
    includeCalendar,
    calendarYear,
    calendarMonth,
  ]);

  // Auto-fetch on mount and when user changes
  useEffect(() => {
    if (autoFetch && isAuthenticated && user?.uid) {
      fetchAllData();
    }
  }, [autoFetch, isAuthenticated, user?.uid]);

  // Refresh function
  const refresh = useCallback(async () => {
    await fetchAllData();
  }, [fetchAllData]);

  // Computed values
  const hasWorkouts = logs.length > 0;
  const totalWorkouts = stats?.totalWorkouts || logs.length;
  const weeklyWorkouts = stats?.weeklyWorkouts || 0;
  const monthlyWorkouts = stats?.monthlyWorkouts || 0;

  // Helper to normalize equipment for display (kebab-case to Title Case)
  const normalizeEquipment = (eq) => {
    if (!eq || eq === 'Unknown') return 'Unknown';
    // Convert kebab-case to Title Case: "weight-stack" -> "Weight Stack"
    return eq.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Helper to normalize exercise name for display (kebab-case to Title Case)
  const normalizeExercise = (ex) => {
    if (!ex || ex === 'Unknown Exercise') return 'Unknown Exercise';
    // Convert kebab-case to Title Case: "seated-leg-extension" -> "Seated Leg Extension"
    return ex.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Format recent workouts for display - handle both old and new data formats
  // Show ALL workouts, not limited to 5
  const recentWorkouts = logs.map(log => {
    // Get exercise name - handle both formats, prefer _exercise from path
    const rawExercise = log._exercise || log.exercise?.name || log.exercise || 'Unknown Exercise';
    const exerciseName = normalizeExercise(rawExercise);
    // Get equipment - handle both formats, prefer _equipment from path (most reliable)
    const rawEquipment = log._equipment || log.exercise?.equipment || log.equipment || 'Unknown';
    const equipment = normalizeEquipment(rawEquipment);
    // Get weight - handle both formats
    const weight = log.planned?.weight || log.weight || 0;
    const weightUnit = log.planned?.weightUnit || log.weightUnit || 'kg';
    // Get reps - handle both formats
    const reps = log.results?.totalReps || log.totalReps || 0;
    // Get sets - handle both formats, with fallback to planned sets
    const sets = log.results?.totalSets || (log.sets ? Object.keys(log.sets).length : 0) || log.planned?.sets || 0;
    // Get duration
    const duration = log.results?.totalTime || 0;
    // Get date - handle both timestamp formats
    const timestamp = log.timestamps?.started?.toDate?.() || 
                     log.timestamps?.created?.toDate?.() ||
                     (log.startTime ? new Date(log.startTime) : null);
    
    return {
      id: log.id,
      exercise: exerciseName,
      equipment,
      weight,
      weightUnit,
      reps,
      sets,
      duration,
      date: formatRelativeDate(timestamp),
      createdAt: timestamp,
    };
  });

  // Equipment distribution for charts
  const equipmentDistribution = Object.entries(stats?.equipmentDistribution || {}).map(
    ([equipment, count]) => ({
      equipment,
      count,
      percentage: totalWorkouts > 0 ? Math.round((count / totalWorkouts) * 100) : 0,
    })
  );

  return {
    // Data
    logs,
    stats,
    lastWorkout,
    calendarData,
    recentWorkouts,
    equipmentDistribution,
    
    // Computed
    hasWorkouts,
    totalWorkouts,
    weeklyWorkouts,
    monthlyWorkouts,
    
    // State
    loading,
    error,
    
    // Actions
    refresh,
    fetchLogs,
    fetchStats,
    fetchLastWorkout,
    fetchCalendarData,
  };
}

/**
 * Format a date as a relative string (e.g., "2 days ago")
 */
function formatRelativeDate(date) {
  if (!date) return 'Unknown';
  
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (weeks === 1) return '1 week ago';
  if (weeks < 4) return `${weeks} weeks ago`;
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  
  return date.toLocaleDateString();
}

export default useWorkoutLogs;
