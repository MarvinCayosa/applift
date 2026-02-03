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
 * Streak data is stored in two places for flexibility:
 * 1. `userStreaks` collection - Easy to view/edit in Firebase console
 * 2. `users/{userId}/workoutStreak` - For backward compatibility
 */
export class WorkoutStreakService {
  
  /**
   * Calculate and update user's current workout streak
   * Should be called whenever a user completes a workout
   * @param {string} userId - The user's ID
   * @param {Date} workoutDate - Date of the completed workout
   * @returns {Promise<Object>} Updated streak data
   */
  static async updateWorkoutStreak(userId, workoutDate = new Date()) {
    try {
      // Try to get streak from userStreaks collection first, then fallback to users collection
      const streakRef = doc(db, 'userStreaks', userId);
      const userRef = doc(db, 'users', userId);
      
      // Try userStreaks first
      let streakDoc = await getDoc(streakRef);
      let currentStreak;
      
      if (streakDoc.exists()) {
        currentStreak = streakDoc.data();
      } else {
        // Fallback to users collection
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          currentStreak = userDoc.data().workoutStreak || null;
        }
      }
      
      // Default values if no streak data found
      if (!currentStreak) {
        currentStreak = {
          currentStreak: 0,
          longestStreak: 0,
          lastWorkoutDate: null,
          totalWorkoutDays: 0,
          streakStartDate: null
        };
      }

      const today = new Date(workoutDate);
      today.setHours(0, 0, 0, 0); // Start of day
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Check if user already worked out today
      const lastWorkoutDate = currentStreak.lastWorkoutDate 
        ? (currentStreak.lastWorkoutDate.seconds 
          ? new Date(currentStreak.lastWorkoutDate.seconds * 1000)
          : new Date(currentStreak.lastWorkoutDate))
        : null;

      if (lastWorkoutDate) {
        lastWorkoutDate.setHours(0, 0, 0, 0);
        
        // If already worked out today, don't update streak
        if (lastWorkoutDate.getTime() === today.getTime()) {
          return currentStreak;
        }
      }

      let newStreak = currentStreak.currentStreak;
      let streakStartDate = currentStreak.streakStartDate;

      if (!lastWorkoutDate) {
        // First workout ever
        newStreak = 1;
        streakStartDate = Timestamp.fromDate(today);
      } else if (lastWorkoutDate.getTime() === yesterday.getTime()) {
        // Consecutive day - continue streak
        newStreak = currentStreak.currentStreak + 1;
      } else if (lastWorkoutDate.getTime() < yesterday.getTime()) {
        // Streak broken - start new streak
        newStreak = 1;
        streakStartDate = Timestamp.fromDate(today);
      }

      // Update longest streak if current streak is longer
      const newLongestStreak = Math.max(newStreak, currentStreak.longestStreak);
      
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
        // Clear lostStreak when user starts working out again
        lostStreak: null,
        streakLostDate: null
      };

      // Save to userStreaks collection (primary - easy to manage in Firebase console)
      await setDoc(streakRef, updatedStreakData, { merge: true });
      
      // Also update users collection for backward compatibility
      await setDoc(userRef, {
        workoutStreak: updatedStreakData
      }, { merge: true });

      return updatedStreakData;
    } catch (error) {
      console.error('Error updating workout streak:', error);
      throw error;
    }
  }

  /**
   * Get user's current workout streak data
   * @param {string} userId - The user's ID  
   * @returns {Promise<Object>} User's streak data
   */
  static async getUserStreakData(userId) {
    try {
      // Try userStreaks collection first
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
      
      // Default values
      if (!streakData) {
        return {
          currentStreak: 0,
          longestStreak: 0,
          lastWorkoutDate: null,
          totalWorkoutDays: 0,
          streakStartDate: null
        };
      }

      // Check if streak should be reset (if last workout was more than 1 day ago)
      if (streakData.lastWorkoutDate && streakData.currentStreak > 0) {
        const lastWorkout = streakData.lastWorkoutDate.seconds 
          ? new Date(streakData.lastWorkoutDate.seconds * 1000)
          : new Date(streakData.lastWorkoutDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        lastWorkout.setHours(0, 0, 0, 0);
        
        const daysDiff = Math.floor((today - lastWorkout) / (1000 * 60 * 60 * 24));
        
        // If more than 1 day has passed, reset current streak
        if (daysDiff > 1) {
          const lostStreak = streakData.currentStreak; // Save the streak that was lost
          const resetStreakData = {
            ...streakData,
            currentStreak: 0,
            streakStartDate: null,
            lostStreak: lostStreak, // Track the lost streak for UI message
            streakLostDate: Timestamp.now()
          };
          
          // Update in both collections
          await setDoc(streakRef, resetStreakData, { merge: true });
          
          const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            workoutStreak: resetStreakData
          }, { merge: true });
          
          return resetStreakData;
        }
      }

      return streakData;
    } catch (error) {
      console.error('Error getting user streak data:', error);
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
