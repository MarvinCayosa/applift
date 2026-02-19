/**
 * Workout Streak Test and Fix Script
 * 
 * This script provides comprehensive testing and debugging tools for the streak system.
 * Place this in your browser console on any page of the app.
 */

(function() {
  'use strict';

  // Make sure Firebase is available
  if (typeof firebase === 'undefined') {
    console.error('❌ Firebase is not available. Please run this script on a page where Firebase is loaded.');
    return;
  }

  window.streakDebugger = {
    
    /**
     * Test the complete streak workflow
     */
    async testCompleteWorkflow() {
      console.log('🧪 TESTING COMPLETE STREAK WORKFLOW');
      console.log('=====================================');
      
      const user = firebase.auth().currentUser;
      if (!user) {
        console.log('❌ Please sign in first');
        return;
      }
      
      try {
        // Step 1: Check current streak
        console.log('\n📊 Step 1: Current Streak Status');
        await this.checkCurrentStreak();
        
        // Step 2: Check today's workouts
        console.log('\n🏋️ Step 2: Today\\'s Workouts');
        await this.checkTodaysWorkouts();
        
        // Step 3: Manually trigger streak update
        console.log('\n⚡ Step 3: Manual Streak Update');
        await this.manualStreakUpdate();
        
        // Step 4: Verify update worked
        console.log('\n✅ Step 4: Verify Update');
        await this.checkCurrentStreak();
        
      } catch (error) {
        console.error('❌ Test failed:', error);
      }
    },

    /**
     * Check current streak status
     */
    async checkCurrentStreak() {
      const user = firebase.auth().currentUser;
      if (!user) return;

      try {
        // Check userStreaks collection
        const streakDoc = await firebase.firestore().doc(`userStreaks/${user.uid}`).get();
        
        if (streakDoc.exists()) {
          const data = streakDoc.data();
          console.log('📈 Current Streak:', data.currentStreak || 0);
          console.log('🏆 Longest Streak:', data.longestStreak || 0);
          console.log('📅 Last Workout:', data.lastWorkoutDate ? data.lastWorkoutDate.toDate().toLocaleString() : 'None');
          console.log('📊 Total Workout Days:', data.totalWorkoutDays || 0);
          
          if (data.lostStreak) {
            console.log('💔 Lost Streak:', data.lostStreak);
          }
          
          return data;
        } else {
          console.log('❌ No streak data found');
          return null;
        }
      } catch (error) {
        console.error('❌ Error checking streak:', error);
        return null;
      }
    },

    /**
     * Check today's workouts
     */
    async checkTodaysWorkouts() {
      const user = firebase.auth().currentUser;
      if (!user) return;

      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      console.log('🔍 Searching for workouts between:');
      console.log('   From:', startOfDay.toLocaleString());
      console.log('   To:', endOfDay.toLocaleString());

      try {
        let totalWorkouts = 0;
        const db = firebase.firestore();
        
        // Get all user workouts
        const userWorkoutsRef = db.collection('userWorkouts').doc(user.uid);
        const collections = await userWorkoutsRef.listCollections();
        
        for (const equipmentCollection of collections) {
          console.log(`🔧 Checking equipment: ${equipmentCollection.id}`);
          
          const exerciseDocs = await equipmentCollection.get();
          
          for (const exerciseDoc of exerciseDocs.docs) {
            console.log(`  💪 Exercise: ${exerciseDoc.id}`);
            
            const logsRef = exerciseDoc.ref.collection('logs');
            const todaysWorkouts = await logsRef
              .where('timestamps.completed', '>=', startOfDay)
              .where('timestamps.completed', '<=', endOfDay)
              .get();
            
            if (!todaysWorkouts.empty) {
              console.log(`    ✅ Found ${todaysWorkouts.size} workout(s) today`);
              todaysWorkouts.forEach(doc => {
                const workout = doc.data();
                console.log(`      - ${doc.id}: ${workout.status}, completed at ${workout.timestamps.completed?.toDate().toLocaleString()}`);
                totalWorkouts++;
              });
            } else {
              console.log(`    ❌ No workouts found today`);
            }
          }
        }
        
        console.log(`📊 Total workouts found today: ${totalWorkouts}`);
        return totalWorkouts;
        
      } catch (error) {
        console.error('❌ Error checking workouts:', error);
        return 0;
      }
    },

    /**
     * Manually update streak
     */
    async manualStreakUpdate() {
      const user = firebase.auth().currentUser;
      if (!user) return;

      console.log('⚡ Attempting manual streak update...');
      
      try {
        // Check if WorkoutStreakService is available
        if (typeof window.WorkoutStreakService !== 'undefined') {
          console.log('✅ Using WorkoutStreakService from window');
          const result = await window.WorkoutStreakService.updateWorkoutStreak(user.uid);
          console.log('📈 Manual update result:', result);
          return result;
        }
        
        // Try to import the service dynamically
        try {
          const module = await import('/services/workoutStreakService.js');
          const WorkoutStreakService = module.WorkoutStreakService;
          const result = await WorkoutStreakService.updateWorkoutStreak(user.uid);
          console.log('📈 Manual update result:', result);
          return result;
        } catch (importError) {
          console.log('❌ Could not import WorkoutStreakService:', importError.message);
          
          // Manual API call as fallback
          console.log('🔥 Using manual API call...');
          
          const response = await fetch('/api/update-streak', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await user.getIdToken()}`
            },
            body: JSON.stringify({
              userId: user.uid,
              workoutDate: new Date().toISOString()
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log('📈 API update result:', result);
            return result;
          } else {
            throw new Error(`API call failed: ${response.status}`);
          }
        }
        
      } catch (error) {
        console.error('❌ Manual update failed:', error);
        throw error;
      }
    },

    /**
     * Create a test workout (for testing purposes)
     */
    async createTestWorkout() {
      const user = firebase.auth().currentUser;
      if (!user) return;

      console.log('🧪 Creating test workout...');
      
      const testWorkout = {
        odUSerId: user.uid,
        odWorkoutId: `test-${Date.now()}`,
        exercise: {
          name: 'Test Exercise',
          equipment: 'Test Equipment',
          namePath: 'test-exercise',
          equipmentPath: 'test-equipment',
        },
        planned: {
          sets: 3,
          reps: 10,
          weight: 50,
          weightUnit: 'lbs',
        },
        results: {
          completedSets: 3,
          completedReps: 30,
          totalReps: 30,
          sets: []
        },
        status: 'completed',
        setType: 'straight',
        gcsPath: 'gs://test/path',
        timestamps: {
          started: new Date(Date.now() - 1200000), // 20 minutes ago
          completed: new Date(), // now
        },
        updatedAt: new Date(),
      };
      
      try {
        const db = firebase.firestore();
        const workoutRef = db
          .collection('userWorkouts')
          .doc(user.uid)
          .collection('test-equipment')
          .doc('test-exercise')
          .collection('logs')
          .doc(testWorkout.odWorkoutId);
        
        await workoutRef.set(testWorkout);
        console.log('✅ Test workout created:', testWorkout.odWorkoutId);
        
        // Now trigger streak update
        await this.manualStreakUpdate();
        
        return testWorkout.odWorkoutId;
        
      } catch (error) {
        console.error('❌ Failed to create test workout:', error);
        throw error;
      }
    },

    /**
     * Force refresh the dashboard streak
     */
    refreshDashboard() {
      console.log('🔄 Triggering dashboard refresh...');
      
      // Dispatch custom event
      window.dispatchEvent(new Event('streak-updated'));
      
      // Also try visibility change and focus events
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      
      console.log('✅ Refresh events dispatched');
    },

    /**
     * Show quick help
     */
    help() {
      console.log(`
🔧 STREAK DEBUGGER COMMANDS
============================

Basic Commands:
- streakDebugger.testCompleteWorkflow()  // Run full diagnostic
- streakDebugger.checkCurrentStreak()    // Check streak status  
- streakDebugger.checkTodaysWorkouts()   // Find today's workouts
- streakDebugger.manualStreakUpdate()    // Force streak update
- streakDebugger.refreshDashboard()      // Refresh dashboard UI

Testing Commands:
- streakDebugger.createTestWorkout()     // Create test workout + update streak

Utilities:
- streakDebugger.help()                  // Show this help

Quick Start:
1. Run: streakDebugger.testCompleteWorkflow()
2. If no workouts found: streakDebugger.createTestWorkout()
3. If UI not updating: streakDebugger.refreshDashboard()
      `);
    }
  };

  // Auto-initialize
  console.log('🔧 Streak Debugger Loaded!');
  console.log('📋 Type streakDebugger.help() for commands');
  console.log('🚀 Quick start: streakDebugger.testCompleteWorkflow()');
  
})();