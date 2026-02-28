import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already done
if (!getApps().length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : {
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };

    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

// Import WorkoutStreakService logic (we'll inline it here for API usage)
class WorkoutStreakServiceAPI {
  static getStartOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  static getCalendarDaysDiff(date1, date2) {
    const d1 = this.getStartOfDay(date1);
    const d2 = this.getStartOfDay(date2);
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs(d2.getTime() - d1.getTime()) / oneDay);
  }

  static async updateWorkoutStreak(userId, workoutDate = new Date()) {
    const db = getFirestore();
    
    try {
      // Get current streak data
      let currentStreak = await this.getUserStreakData(userId);

      const today = this.getStartOfDay(workoutDate);
      
      // Get last workout date 
      const lastWorkoutDate = currentStreak.lastWorkoutDate 
        ? currentStreak.lastWorkoutDate.toDate()
        : null;

      // Calculate days since last workout
      const daysSinceLastWorkout = lastWorkoutDate 
        ? this.getCalendarDaysDiff(lastWorkoutDate, today)
        : null;

      console.log('[API Streak] Update check:', {
        today: today.toISOString(),
        lastWorkoutDate: lastWorkoutDate?.toISOString(),
        daysSinceLastWorkout,
        currentStreak: currentStreak.currentStreak
      });

      let newStreak = currentStreak.currentStreak;
      let streakStartDate = currentStreak.streakStartDate;
      let shouldUpdate = true;

      if (daysSinceLastWorkout === null) {
        // FIRST WORKOUT EVER
        newStreak = 1;
        streakStartDate = today;
        console.log('[API Streak] First workout ever! Starting streak at 1');
        
      } else if (daysSinceLastWorkout === 0) {
        // SAME DAY
        console.log('[API Streak] Already worked out today, no change');
        shouldUpdate = false;
        
      } else if (daysSinceLastWorkout === 1) {
        // CONSECUTIVE DAY
        newStreak = currentStreak.currentStreak + 1;
        console.log(`[API Streak] Consecutive day! Streak continues: ${currentStreak.currentStreak} → ${newStreak}`);
        
      } else {
        // MISSED DAYS
        newStreak = 1;
        streakStartDate = today;
        console.log(`[API Streak] Missed ${daysSinceLastWorkout - 1} day(s). Streak reset to 1`);
      }

      if (!shouldUpdate) {
        return currentStreak;
      }

      // Update longest streak
      const newLongestStreak = Math.max(newStreak, currentStreak.longestStreak || 0);
      
      // Increment total workout days
      const newTotalWorkoutDays = (currentStreak.totalWorkoutDays || 0) + 1;

      const updatedStreakData = {
        userId: userId,
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        lastWorkoutDate: today,
        totalWorkoutDays: newTotalWorkoutDays,
        streakStartDate: streakStartDate,
        lastUpdated: new Date(),
        lostStreak: null,
        streakLostDate: null
      };

      // Save to both collections
      const streakRef = db.collection('userStreaks').doc(userId);
      const userRef = db.collection('users').doc(userId);
      
      await streakRef.set(updatedStreakData, { merge: true });
      await userRef.set({ workoutStreak: updatedStreakData }, { merge: true });
      
      console.log('[API Streak] Updated successfully:', updatedStreakData);
      return updatedStreakData;
      
    } catch (error) {
      console.error('[API Streak] Error updating streak:', error);
      throw error;
    }
  }

  static async getUserStreakData(userId) {
    const db = getFirestore();
    
    try {
      const streakRef = db.collection('userStreaks').doc(userId);
      let streakDoc = await streakRef.get();
      
      let streakData;
      
      if (streakDoc.exists) {
        streakData = streakDoc.data();
      } else {
        // Fallback to users collection
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        
        if (userDoc.exists) {
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

      // Validate streak
      if (streakData.lastWorkoutDate && streakData.currentStreak > 0) {
        const lastWorkout = streakData.lastWorkoutDate.toDate();
        const today = new Date();
        const daysSinceLastWorkout = this.getCalendarDaysDiff(lastWorkout, today);

        if (daysSinceLastWorkout > 1) {
          console.log(`[API Streak] EXPIRED! Resetting...`);
          
          const lostStreak = streakData.currentStreak;
          const resetStreakData = {
            ...streakData,
            currentStreak: 0,
            streakStartDate: null,
            lostStreak: lostStreak,
            streakLostDate: new Date()
          };
          
          // Persist the reset
          await streakRef.set(resetStreakData, { merge: true });
          const userRef = db.collection('users').doc(userId);
          await userRef.set({ workoutStreak: resetStreakData }, { merge: true });
          
          return resetStreakData;
        }
      }

      return streakData;
    } catch (error) {
      console.error('[API Streak] Error getting streak data:', error);
      throw error;
    }
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify auth token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Get workout date from request body
    const { workoutDate } = req.body;
    const date = workoutDate ? new Date(workoutDate) : new Date();

    console.log(`[Update Streak API] Updating streak for user ${userId} on ${date.toISOString()}`);

    // Update the streak
    const updatedStreak = await WorkoutStreakServiceAPI.updateWorkoutStreak(userId, date);

    res.status(200).json({
      success: true,
      streak: updatedStreak,
      message: `Streak updated: ${updatedStreak.currentStreak} days`
    });

  } catch (error) {
    console.error('[Update Streak API] Error:', error);
    res.status(500).json({ 
      error: 'Failed to update streak',
      details: error.message 
    });
  }
}