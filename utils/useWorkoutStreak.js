import { useState, useEffect } from 'react';
import { WorkoutStreakService } from '../services/workoutStreakService';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook for managing workout streaks
 * @returns {Object} Streak data and methods
 */
export function useWorkoutStreak() {
  const { user } = useAuth();
  const [streakData, setStreakData] = useState({
    currentStreak: 0,
    longestStreak: 0,
    lastWorkoutDate: null,
    totalWorkoutDays: 0,
    streakStartDate: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial streak data
  useEffect(() => {
    const loadStreakData = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await WorkoutStreakService.getUserStreakData(user.uid);
        setStreakData(data);
      } catch (err) {
        console.error('Error loading streak data:', err);
        setError(err.message);
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
      const updatedData = await WorkoutStreakService.updateWorkoutStreak(user.uid, workoutDate);
      setStreakData(updatedData);
      return updatedData;
    } catch (err) {
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
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  };

  // Get streak status message
  const getStreakMessage = () => {
    const streak = streakData.currentStreak;
    
    if (streak === 0) return "Start your streak today!";
    if (streak === 1) return "Great start! Keep it up!";
    if (streak < 7) return "Building momentum!";
    if (streak < 30) return "On fire! Keep going!";
    return "Unstoppable streak!";
  };

  // Get streak icon
  const getStreakIcon = () => {
    const streak = streakData.currentStreak;
    
    if (streak === 0) return "🎯";
    if (streak < 7) return "🔥";
    if (streak < 30) return "💪";
    return "🏆";
  };

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
    streakIcon: getStreakIcon()
  };
}

export default useWorkoutStreak;
