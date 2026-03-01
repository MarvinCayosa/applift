import { useState, useEffect, useCallback } from 'react';
import { WorkoutStreakService } from '../services/workoutStreakService';
import { useAuth } from '../context/AuthContext';
import { getCachedStreak, setCachedStreak, getMemoryCachedStreak } from './workoutCache';

const DEFAULT_STREAK = {
  currentStreak: 0,
  longestStreak: 0,
  lastWorkoutDate: null,
  totalWorkoutDays: 0,
  streakStartDate: null,
  lostStreak: null,
  streakLostDate: null
};

/**
 * Custom hook for managing workout streaks
 * Uses persistent cache to reduce Firestore reads.
 * Initializes from synchronous memory cache to avoid loading flash on re-navigation.
 * @returns {Object} Streak data and methods
 */
export function useWorkoutStreak() {
  const { user } = useAuth();

  // Initialize from sync memory cache — no loading flash on re-navigation
  const initialData = user?.uid ? getMemoryCachedStreak(user.uid) : null;

  const [streakData, setStreakData] = useState(initialData || DEFAULT_STREAK);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState(null);

  // Load initial streak data (cache-first)
  useEffect(() => {
    const loadStreakData = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        // Only show loading if we have no sync-cached data
        const hasSyncData = getMemoryCachedStreak(user.uid);
        if (!hasSyncData) {
          setLoading(true);
        }
        setError(null);

        // Try cache first
        const cached = await getCachedStreak(user.uid);
        if (cached) {
          console.log(`[useWorkoutStreak] Cache hit (${cached.source})`);
          setStreakData(cached.data);
          setLoading(false);
          return;
        }

        // Cache miss — fetch from Firestore
        const data = await WorkoutStreakService.getUserStreakData(user.uid);
        setStreakData(data);

        // Persist to cache
        setCachedStreak(user.uid, data).catch(() => {});
      } catch (err) {
        console.error('Error loading streak data:', err);
        setError(err.message);

        // Serve stale cache on error
        const stale = await getCachedStreak(user.uid);
        if (stale) setStreakData(stale.data);
      } finally {
        setLoading(false);
      }
    };

    loadStreakData();
  }, [user?.uid]);

  /**
   * Update streak when user completes a workout
   * @param {Date} workoutDate - Date of completed workout (optional, defaults to now)
   * @returns {Promise<Object>} Updated streak data
   */
  const recordWorkout = async (workoutDate) => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    try {
      console.log('[useWorkoutStreak] Recording workout for user:', user.uid, 'Date:', workoutDate || 'now');
      const updatedData = await WorkoutStreakService.updateWorkoutStreak(user.uid, workoutDate);
      console.log('[useWorkoutStreak] Streak updated:', updatedData);
      setStreakData(updatedData);
      // Update persistent cache
      setCachedStreak(user.uid, updatedData).catch(() => {});
      return updatedData;
    } catch (err) {
      console.error('[useWorkoutStreak] Error recording workout:', err);
      setError(err.message);
      throw err;
    }
  };

  /**
   * Check if user has worked out today
   * @returns {Promise<boolean>} True if worked out today
   */
  const hasWorkedOutToday = async () => {
    if (!user?.uid) return false;
    
    try {
      return await WorkoutStreakService.hasWorkedOutToday(user.uid);
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  /**
   * Get workout frequency analytics
   * @param {number} days - Days to look back (default: 30)
   * @returns {Promise<Object>} Frequency data
   */
  const getFrequencyData = async (days = 30) => {
    if (!user?.uid) return null;
    
    try {
      return await WorkoutStreakService.getWorkoutFrequency(user.uid, days);
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  /**
   * Refresh streak data from database
   */
  const refreshStreakData = async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      setError(null);
      const data = await WorkoutStreakService.getUserStreakData(user.uid);
      setStreakData(data);
      // Update persistent cache
      setCachedStreak(user.uid, data).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Format last workout date for display
  const getLastWorkoutText = () => {
    if (!streakData.lastWorkoutDate) return null;
    
    const date = new Date(streakData.lastWorkoutDate.seconds * 1000);
    const now = new Date();
    
    // Compare calendar dates (not time difference)
    // This ensures proper "Yesterday" labeling regardless of time
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((todayOnly - dateOnly) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  };

  // Get streak status message
  const getStreakMessage = () => {
    const streak = streakData.currentStreak;
    const lostStreak = streakData.lostStreak;
    
    // If streak is 0 and there was a lost streak, show the loss message
    if (streak === 0 && lostStreak && lostStreak > 0) {
      return `${lostStreak} day streak lost`;
    }
    
    // If streak is 0 and no prior streak, encourage to start
    if (streak === 0) return "Start your streak!";
    
    if (streak === 1) return "Great start! Keep it up!";
    if (streak < 7) return "Building momentum!";
    if (streak < 30) return "On fire! Keep going!";
    return "Unstoppable streak!";
  };

  // Get streak icon
  const getStreakIcon = () => {
    const streak = streakData.currentStreak;
    const lostStreak = streakData.lostStreak;
    
    // Show broken heart if streak was lost
    if (streak === 0 && lostStreak && lostStreak > 0) return "💔";
    
    if (streak === 0) return "🎯";
    if (streak < 7) return "🔥";
    if (streak < 30) return "💪";
    return "🏆";
  };

  // Check if streak was recently lost
  const isStreakLost = streakData.currentStreak === 0 && streakData.lostStreak > 0;

  return {
    // Data
    streakData,
    loading,
    error,
    
    // Methods
    recordWorkout,
    hasWorkedOutToday,
    getFrequencyData,
    refreshStreakData,
    
    // Computed values
    lastWorkoutText: getLastWorkoutText(),
    streakMessage: getStreakMessage(),
    streakIcon: getStreakIcon(),
    isStreakLost, // New: indicates if streak was recently lost
    lostStreakCount: streakData.lostStreak || 0 // New: the number of days lost
  };
}

export default useWorkoutStreak;
