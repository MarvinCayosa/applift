/**
 * useWorkoutLogs Hook
 * 
 * Optimized: ONE Firestore fetch, everything derived from it.
 * Persistent caching via IndexedDB for offline support.
 * 
 * Before: 3 parallel Firestore reads (logs + stats + lastWorkout)
 *   - getUserWorkoutLogs (500 doc reads)
 *   - getUserWorkoutStats -> internally calls getUserWorkoutLogs AGAIN (1000 doc reads)
 *   - getLastWorkout -> internally calls getUserWorkoutLogs AGAIN (10 doc reads)
 *   Total: ~1500+ reads per dashboard load
 * 
 * After: 1 Firestore fetch, stats + lastWorkout computed client-side
 *   Total: ~500 reads (or 0 if cached)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getUserWorkoutLogs,
  getWorkoutCalendarData,
} from '../services/workoutLogService';
import {
  getCachedLogs,
  setCachedLogs,
  getMemoryCachedLogs,
  parseLogDate,
} from './workoutCache';

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

  // Initialize from sync memory cache — avoids loading flash on re-navigation
  const initialLogs = user?.uid ? getMemoryCachedLogs(user.uid) : null;

  const [logs, setLogs] = useState(initialLogs || []);
  const [calendarData, setCalendarData] = useState({});
  const [loading, setLoading] = useState(!initialLogs);
  const [error, setError] = useState(null);

  // ─── Single fetch: logs from cache or Firestore ─────────────
  const fetchLogs = useCallback(async (forceRefresh = false) => {
    if (!user?.uid) return [];

    try {
      // Try persistent cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = await getCachedLogs(user.uid);
        if (cached) {
          console.log(`[useWorkoutLogs] Cache hit (${cached.source}), ${cached.data.length} logs`);
          setLogs(cached.data);
          return cached.data;
        }
      }

      // Cache miss or forced refresh — fetch from Firestore
      console.log('[useWorkoutLogs] Fetching from Firestore...');
      const fetchedLogs = await getUserWorkoutLogs(user.uid, {
        status: null,
        limitCount,
      });

      setLogs(fetchedLogs);

      // Persist to cache (background)
      setCachedLogs(user.uid, fetchedLogs).catch(() => {});

      return fetchedLogs;
    } catch (err) {
      console.error('[useWorkoutLogs] Error fetching logs:', err);
      setError(err.message);

      // On error, try to serve stale cache
      const staleCache = await getCachedLogs(user.uid);
      if (staleCache) {
        console.log('[useWorkoutLogs] Serving stale cache after error');
        setLogs(staleCache.data);
        return staleCache.data;
      }

      return [];
    }
  }, [user?.uid, limitCount]);

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

  // ─── Single entry point: fetch everything needed ────────────
  const fetchAllData = useCallback(async () => {
    if (!user?.uid || !isAuthenticated) {
      setLoading(false);
      return;
    }

    // Only show loading spinner if we have no data yet (avoids flash on re-navigation)
    const hasSyncData = getMemoryCachedLogs(user.uid);
    if (!hasSyncData) {
      setLoading(true);
    }
    setError(null);

    try {
      // Only fetch logs — stats and lastWorkout are derived below
      const promises = [fetchLogs()];
      
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
    fetchCalendarData,
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

  // Force refresh (bypasses cache)
  const refresh = useCallback(async () => {
    if (!user?.uid || !isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      const promises = [fetchLogs(true)]; // force refresh
      if (includeCalendar) {
        promises.push(fetchCalendarData(calendarYear, calendarMonth));
      }
      await Promise.all(promises);
    } catch (err) {
      console.error('[useWorkoutLogs] Error refreshing:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, isAuthenticated, fetchLogs, fetchCalendarData, includeCalendar, calendarYear, calendarMonth]);

  // ─── Derive stats from logs (no extra Firestore reads) ──────
  const stats = useMemo(() => {
    if (logs.length === 0) return null;

    const result = {
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
      // Aggregate results
      if (log.results) {
        result.totalReps += log.results.totalReps || log.results.completedReps || 0;
        result.totalSets += log.results.totalSets || log.results.completedSets || 0;
        result.totalTime += log.results.totalTime || 0;
        result.totalCalories += log.results.calories || 0;
      } else {
        result.totalReps += log.totalReps || 0;
        const setsObj = log.sets || {};
        result.totalSets += Object.keys(setsObj).length;
      }

      // Equipment distribution
      let equipment = log._equipment || 
                      log['exercise.equipmentPath'] ||
                      (typeof log.exercise === 'object' ? log.exercise?.equipment : null) ||
                      log.equipment;
      if (equipment) {
        equipment = equipment.toLowerCase();
        if (equipment === 'dumbell') equipment = 'dumbbell';
        if (equipment === 'stack') equipment = 'weight-stack';
        if (equipment === 'weight stack') equipment = 'weight-stack';
        result.equipmentDistribution[equipment] = (result.equipmentDistribution[equipment] || 0) + 1;
      }

      // Exercise count
      let exercise = log._exercise || 
                     log['exercise.namePath'] ||
                     (typeof log.exercise === 'object' ? log.exercise?.name : null) ||
                     (typeof log.exercise === 'string' ? log.exercise : null) ||
                     log.exerciseName;
      if (exercise) {
        result.exerciseCount[exercise] = (result.exerciseCount[exercise] || 0) + 1;
      }

      // Weekly/Monthly counts
      const createdAt = parseLogDate(log);
      if (createdAt) {
        if (createdAt >= oneWeekAgo) result.weeklyWorkouts++;
        if (createdAt >= oneMonthAgo) result.monthlyWorkouts++;
      }
    });

    return result;
  }, [logs]);

  // ─── Derive lastWorkout from logs (no extra Firestore read) ─
  const lastWorkout = useMemo(() => {
    return logs.length > 0 ? logs[0] : null; // logs are already sorted desc
  }, [logs]);

  // Computed values
  const hasWorkouts = logs.length > 0;
  const totalWorkouts = stats?.totalWorkouts || logs.length;
  const weeklyWorkouts = stats?.weeklyWorkouts || 0;
  const monthlyWorkouts = stats?.monthlyWorkouts || 0;

  // Helper to normalize equipment for display (kebab-case to Title Case)
  const normalizeEquipment = (eq) => {
    if (!eq || eq === 'Unknown') return 'Unknown';
    return eq.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Helper to normalize exercise name for display (kebab-case to Title Case)
  const normalizeExercise = (ex) => {
    if (!ex || ex === 'Unknown Exercise') return 'Unknown Exercise';
    return ex.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  // Format recent workouts for display
  const recentWorkouts = useMemo(() => logs.map(log => {
    const rawExercise = log._exercise || log.exercise?.name || log.exercise || 'Unknown Exercise';
    const exerciseName = normalizeExercise(rawExercise);
    const rawEquipment = log._equipment || log.exercise?.equipment || log.equipment || 'Unknown';
    const equipment = normalizeEquipment(rawEquipment);
    const weight = log.planned?.weight || log.weight || 0;
    const weightUnit = log.planned?.weightUnit || log.weightUnit || 'kg';
    const reps = log.results?.totalReps || log.totalReps || 0;
    const sets = log.results?.totalSets || (log.sets ? Object.keys(log.sets).length : 0) || log.planned?.sets || 0;
    const plannedSets = log.planned?.sets || sets;
    const plannedReps = (log.planned?.sets || 1) * (log.planned?.reps || 10);
    const isIncomplete = sets < plannedSets || reps < plannedReps;
    const duration = log.results?.totalTime || 0;
    const timestamp = parseLogDate(log);
    
    return {
      id: log.id,
      logId: log.id,
      exercise: exerciseName,
      rawExercise: log._exercise || rawExercise.toLowerCase().replace(/\s+/g, '-'),
      rawEquipment: log._equipment || rawEquipment.toLowerCase().replace(/\s+/g, '-'),
      equipment,
      weight,
      weightUnit,
      reps,
      sets,
      plannedSets,
      plannedReps,
      isIncomplete,
      duration,
      date: formatRelativeDate(timestamp),
      createdAt: timestamp,
    };
  }), [logs]);

  // Equipment distribution for charts
  const equipmentDistribution = useMemo(() => 
    Object.entries(stats?.equipmentDistribution || {}).map(
      ([equipment, count]) => ({
        equipment,
        count,
        percentage: totalWorkouts > 0 ? Math.round((count / totalWorkouts) * 100) : 0,
      })
    ), [stats, totalWorkouts]);

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
    fetchCalendarData,
  };
}

/**
 * Format a date as a relative string (e.g., "2 days ago")
 * Uses calendar date comparison for accurate "Yesterday" labeling
 */
function formatRelativeDate(date) {
  if (!date) return 'Unknown';
  
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  // For recent times (< 24 hours), use time-based display
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  
  // For days, compare calendar dates (not time difference)
  // This ensures proper "Yesterday" labeling regardless of time
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((todayOnly - dateOnly) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (weeks === 1) return '1 week ago';
  if (weeks < 4) return `${weeks} weeks ago`;
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  
  return date.toLocaleDateString();
}

export default useWorkoutLogs;
