/**
 * Quick Streak Fix Script
 * 
 * Copy and paste this into your browser console on the dashboard page
 * This will immediately create a test workout and update your streak
 */

(async function quickStreakFix() {
  console.log('🔧 QUICK STREAK FIX STARTING...');
  console.log('================================');
  
  // Check if user is signed in
  const user = firebase?.auth()?.currentUser;
  if (!user) {
    console.error('❌ Please sign in first, then run this script again');
    return;
  }
  
  console.log(`👤 User: ${user.email} (${user.uid})`);
  
  try {
    // Step 1: Create a workout for today
    console.log('\n🏋️ Step 1: Creating workout for today...');
    
    const workoutId = `manual-fix-${Date.now()}`;
    const now = new Date();
    
    const testWorkout = {
      odUSerId: user.uid,
      odWorkoutId: workoutId,
      exercise: {
        name: 'Streak Test',
        equipment: 'Bodyweight',
        namePath: 'streak-test',
        equipmentPath: 'bodyweight',
      },
      planned: {
        sets: 1,
        reps: 5,
        weight: 0,
        weightUnit: 'lbs',
      },
      results: {
        completedSets: 1,
        completedReps: 5,
        totalReps: 5,
        sets: [{
          setNumber: 1,
          reps: 5,
          weight: 0,
          duration: 30000,
          restTime: 0
        }]
      },
      status: 'completed',
      setType: 'straight',
      gcsPath: `gs://applift-bucket/users/${user.uid}/bodyweight/streak-test`,
      timestamps: {
        started: new Date(now.getTime() - 60000), // 1 minute ago
        completed: now, // Right now
      },
      updatedAt: now,
    };
    
    // Save workout to Firestore
    const db = firebase.firestore();
    
    // First create the exercise document (so it's not virtual)
    const exerciseDocRef = db
      .collection('userWorkouts')
      .doc(user.uid)
      .collection('bodyweight')
      .doc('streak-test');
    
    await exerciseDocRef.set({
      name: 'streak-test',
      equipment: 'bodyweight',
      updatedAt: now,
    }, { merge: true });
    
    // Then save the workout
    const workoutRef = exerciseDocRef.collection('logs').doc(workoutId);
    await workoutRef.set(testWorkout);
    
    console.log('✅ Test workout created successfully!');
    
    // Step 2: Update streak using API
    console.log('\n⚡ Step 2: Updating streak...');
    
    try {
      const response = await fetch('/api/update-streak', {
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({
          userId: user.uid,
          workoutDate: now.toISOString()
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Streak updated via API:', result);
        
        // Step 3: Refresh dashboard
        console.log('\n🔄 Step 3: Refreshing dashboard...');
        
        // Trigger all possible refresh events
        window.dispatchEvent(new Event('streak-updated'));
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        
        // Also try to refresh page data if useWorkoutStreak hook is available
        if (window.refreshStreakData) {
          await window.refreshStreakData();
        }
        
        console.log('✅ Dashboard refresh triggered');
        
        // Step 4: Show final result
        console.log('\n📊 Step 4: Final streak status...');
        
        setTimeout(async () => {
          const streakDoc = await db.doc(`userStreaks/${user.uid}`).get();
          if (streakDoc.exists()) {
            const streakData = streakDoc.data();
            console.log('🎉 SUCCESS! Current streak:', streakData.currentStreak);
            console.log('🏆 Longest streak:', streakData.longestStreak);
            console.log('📅 Last workout:', streakData.lastWorkoutDate?.toDate()?.toLocaleString());
            
            alert(`🎉 Streak Fixed! Current streak: ${streakData.currentStreak} days`);
          }
        }, 1000);
        
      } else {
        throw new Error(`API call failed: ${response.status}`);
      }
      
    } catch (apiError) {
      console.warn('⚠️ API call failed, trying direct service call...');
      
      // Fallback: Try to use the service directly if available in window
      if (window.WorkoutStreakService) {
        const result = await window.WorkoutStreakService.updateWorkoutStreak(user.uid, now);
        console.log('✅ Streak updated via service:', result);
      } else {
        console.error('❌ Could not update streak via API or service');
        console.log('💡 Try reloading the page and running the debugger');
      }
    }
    
  } catch (error) {
    console.error('❌ Quick fix failed:', error);
    console.log('💡 Try running the full debugger: streakDebugger.testCompleteWorkflow()');
  }
  
  console.log('\n✅ QUICK FIX COMPLETE');
  console.log('If your streak still shows 0, try reloading the page.');
})();

console.log('🚀 Quick Streak Fix script loaded and running...');