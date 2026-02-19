import { db } from '../config/firestore';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';

/**
 * Workout Streak Service
 * Manages user workout streaks and statistics
 * 
 * *** TIKTOK-STYLE STREAK LOGIC ***
 * 1. Streak = consecutive CALENDAR DAYS with at least 1 workout
 * 2. Today counts immediately when you complete a workout
 * 3. If you didn't work out yesterday BUT you work out today → streak continues!
 *    (This is the key difference - you have until END of today to save your streak)
 * 4. Streak only breaks if you miss an ENTIRE calendar day
 * 5. Multiple workouts per day = still just 1 day (no double counting)
 * 
 * Example timeline:
 * - Monday: Workout at 6pm → Streak = 1
 * - Tuesday: No workout → At midnight, streak would break
 * - Tuesday: Workout at 11pm → Streak = 2 (saved it!)
 * - Wednesday: No workout all day → Streak breaks at midnight
 * - Thursday: Workout → Streak = 1 (fresh start)
 * 
 * Streak data is stored in two places for flexibility:
 * 1. `userStreaks` collection - Easy to view/edit in Firebase console
 * 2. `users/{userId}/workoutStreak` - For backward compatibility
 */
export class WorkoutStreakService {
  
  /**
   * Get the start of day (midnight) for a given date in LOCAL timezone
   * Fixed to handle timezone properly
   */
  static getStartOfDay(date) {
    const d = new Date(date);
    // Use local timezone, not UTC
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Calculate calendar days between two dates
   * Returns 0 if same day, 1 if consecutive days, etc.
   */
  static getCalendarDaysDiff(date1, date2) {
    const d1 = this.getStartOfDay(date1);
    const d2 = this.getStartOfDay(date2);
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs(d2.getTime() - d1.getTime()) / oneDay);
  }

  /**
   * TIKTOK-STYLE: Calculate and update user's current workout streak
   * 
   * Key behaviors:
   * - Working out TODAY continues your streak (even if you didn't work out yesterday YET)
   * - Streak only breaks when you miss an ENTIRE calendar day
   * - Multiple workouts same day = no change (already counted)
   * 
   * @param {string} userId - The user's ID
   * @param {Date} workoutDate - Date of the completed workout
   * @returns {Promise<Object>} Updated streak data
   */
  static async updateWorkoutStreak(userId, workoutDate = new Date()) {
    try {
      // Get current streak data (validates and may reset expired streaks)
      let currentStreak = await this.getUserStreakData(userId);

      const streakRef = doc(db, 'userStreaks', userId);
      const userRef = doc(db, 'users', userId);

      const today = this.getStartOfDay(workoutDate);
      
      // Get last workout date (handle Firestore Timestamp)
      const lastWorkoutDate = currentStreak.lastWorkoutDate 
        ? (currentStreak.lastWorkoutDate.seconds 
          ? new Date(currentStreak.lastWorkoutDate.seconds * 1000)
          : new Date(currentStreak.lastWorkoutDate))
        : null;

      // Calculate days since last workout
      const daysSinceLastWorkout = lastWorkoutDate 
        ? this.getCalendarDaysDiff(lastWorkoutDate, today)
        : null;

      console.log('[Streak] Update check:', {
        today: today.toISOString(),
        todayLocal: today.toLocaleString(),
        lastWorkoutDate: lastWorkoutDate?.toISOString(),
        lastWorkoutDateLocal: lastWorkoutDate?.toLocaleString(),
        daysSinceLastWorkout,
        currentStreak: currentStreak.currentStreak
      });

      // *** TIKTOK LOGIC ***
      let newStreak = currentStreak.currentStreak;
      let streakStartDate = currentStreak.streakStartDate;
      let shouldUpdate = true;

      if (daysSinceLastWorkout === null) {
        // FIRST WORKOUT EVER - start fresh streak
        newStreak = 1;
        streakStartDate = Timestamp.fromDate(today);
        console.log('[Streak] First workout ever! Starting streak at 1');
        
      } else if (daysSinceLastWorkout === 0) {
        // SAME DAY - already worked out today, no change needed
        console.log('[Streak] Already worked out today, no change');
        shouldUpdate = false;
        
      } else if (daysSinceLastWorkout === 1) {
        // CONSECUTIVE DAY - perfect! Continue the streak
        newStreak = currentStreak.currentStreak + 1;
        console.log(`[Streak] Consecutive day! Streak continues: ${currentStreak.currentStreak} → ${newStreak}`);
        
      } else {
        // MISSED DAYS (daysSinceLastWorkout >= 2)
        // Streak is broken - start fresh
        newStreak = 1;
        streakStartDate = Timestamp.fromDate(today);
        console.log(`[Streak] Missed ${daysSinceLastWorkout - 1} day(s). Streak reset to 1`);
      }

      if (!shouldUpdate) {
        return currentStreak;
      }

      // Update longest streak if we beat our record
      const newLongestStreak = Math.max(newStreak, currentStreak.longestStreak || 0);
      
      // Increment total workout days
      const newTotalWorkoutDays = (currentStreak.totalWorkoutDays || 0) + 1;

      const updatedStreakData = {
        userId: userId,
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        lastWorkoutDate: Timestamp.fromDate(today),
        totalWorkoutDays: newTotalWorkoutDays,
        streakStartDate: streakStartDate,
        lastUpdated: Timestamp.now(),
        // Clear lost streak info when user starts working out again
        lostStreak: null,
        streakLostDate: null
      };

      // Save to both collections
      await setDoc(streakRef, updatedStreakData, { merge: true });
      await setDoc(userRef, { workoutStreak: updatedStreakData }, { merge: true });
      
      console.log('[Streak] Updated successfully:', updatedStreakData);

      return updatedStreakData;
    } catch (error) {
      console.error('[Streak] Error updating streak:', error);
      throw error;
    }
  }

  /**
   * Get user's current workout streak data
   * IMPORTANT: This validates the streak and resets if expired
   * 
   * @param {string} userId - The user's ID  
   * @returns {Promise<Object>} User's streak data
   */
  static async getUserStreakData(userId) {
    try {
      const streakRef = doc(db, 'userStreaks', userId);
      let streakDoc = await getDoc(streakRef);
      
      let streakData;
      
      if (streakDoc.exists()) {
        streakData = streakDoc.data();
      } else {
        // Fallback to users collection
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          streakData = userDoc.data().workoutStreak;
        }
      }
      
      // Default values for new users
      if (!streakData) {
        return {
          currentStreak: 0,
          longestStreak: 0,
          lastWorkoutDate: null,
          totalWorkoutDays: 0,
          streakStartDate: null
        };
      }

      // *** VALIDATE STREAK - Check if it should be reset ***
      // Streak breaks if user missed an ENTIRE calendar day
      if (streakData.lastWorkoutDate && streakData.currentStreak > 0) {
        const lastWorkout = streakData.lastWorkoutDate.seconds 
          ? new Date(streakData.lastWorkoutDate.seconds * 1000)
          : new Date(streakData.lastWorkoutDate);
        
        const today = new Date();
        const daysSinceLastWorkout = this.getCalendarDaysDiff(lastWorkout, today);

        console.log('[Streak] Validation check:', {
          lastWorkout: lastWorkout.toISOString(),
          today: today.toISOString(),
          daysSinceLastWorkout,
          currentStreak: streakData.currentStreak
        });

        // TIKTOK RULE: Streak breaks after missing MORE THAN 1 calendar day
        // - 0 days = worked out today ✓
        // - 1 day = worked out yesterday, today still valid ✓  
        // - 2+ days = missed at least 1 full day ✗
        if (daysSinceLastWorkout > 1) {
          console.log(`[Streak] EXPIRED! Missed ${daysSinceLastWorkout - 1} day(s). Resetting...`);
          
          const lostStreak = streakData.currentStreak;
          const resetStreakData = {
            ...streakData,
            currentStreak: 0,
            streakStartDate: null,
            lostStreak: lostStreak,
            streakLostDate: Timestamp.now()
          };
          
          // Persist the reset
          await setDoc(streakRef, resetStreakData, { merge: true });
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, { workoutStreak: resetStreakData }, { merge: true });
          
          return resetStreakData;
        }
      }

      return streakData;
    } catch (error) {
      console.error('[Streak] Error getting streak data:', error);
      throw error;
    }
  }

  /**
   * Get streak statistics for all users (for leaderboards)
   * @param {number} limitCount - Number of top users to return
   * @returns {Promise<Array>} Array of top streak users
   */
  static async getTopStreakUsers(limitCount = 10) {
    try {
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('workoutStreak.currentStreak', '>', 0),
        orderBy('workoutStreak.currentStreak', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      const topUsers = [];
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        topUsers.push({
          userId: doc.id,
          username: userData.username || userData.email,
          currentStreak: userData.workoutStreak?.currentStreak || 0,
          longestStreak: userData.workoutStreak?.longestStreak || 0
        });
      });
      
      return topUsers;
    } catch (error) {
      console.error('Error getting top streak users:', error);
      throw error;
    }
  }

  /**
   * Check if user worked out today
   * @param {string} userId - The user's ID
   * @returns {Promise<boolean>} True if user worked out today
   */
  static async hasWorkedOutToday(userId) {
    try {
      const streakData = await this.getUserStreakData(userId);
      
      if (!streakData.lastWorkoutDate) {
        return false;
      }
      
      const lastWorkout = new Date(streakData.lastWorkoutDate.seconds * 1000);
      const today = new Date();
      
      // Normalize both dates to start of day for calendar day comparison  
      lastWorkout.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      return lastWorkout.getTime() === today.getTime();
    } catch (error) {
      console.error('Error checking if worked out today:', error);
      return false;
    }
  }

  /**
   * Get workout frequency data for analytics
   * @param {string} userId - The user's ID
   * @param {number} days - Number of days to look back (default: 30)
   * @returns {Promise<Object>} Workout frequency analytics
   */
  static async getWorkoutFrequency(userId, days = 30) {
    try {
      const workoutsRef = collection(db, 'workouts');
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const q = query(
        workoutsRef,
        where('userId', '==', userId),
        where('completedAt', '>=', Timestamp.fromDate(startDate)),
        orderBy('completedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const workoutDates = [];
      
      querySnapshot.forEach((doc) => {
        const workout = doc.data();
        if (workout.completedAt) {
          const date = new Date(workout.completedAt.seconds * 1000);
          date.setHours(0, 0, 0, 0);
          workoutDates.push(date.toISOString().split('T')[0]);
        }
      });
      
      // Remove duplicates (multiple workouts same day)
      const uniqueDates = [...new Set(workoutDates)];
      
      return {
        totalWorkouts: querySnapshot.size,
        workoutDays: uniqueDates.length,
        frequency: uniqueDates.length / days,
        averagePerWeek: (uniqueDates.length / days) * 7,
        workoutDates: uniqueDates
      };
    } catch (error) {
      console.error('Error getting workout frequency:', error);
      throw error;
    }
  }
}

export default WorkoutStreakService;
