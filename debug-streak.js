/**
 * Debug Script for Workout Streak Issues
 * 
 * This script will help identify why streak is not activating
 * Run this in browser console on your dashboard page
 */

// Debug function to check current streak status
window.debugStreak = async function() {
  console.log('=== STREAK DEBUG ANALYSIS ===');
  
  // Get current user
  const user = firebase.auth().currentUser;
  if (!user) {
    console.log('❌ No user found. Please sign in first.');
    return;
  }
  
  console.log(`👤 User ID: ${user.uid}`);
  console.log(`📧 Email: ${user.email}`);
  
  try {
    // Check streak data from both locations
    console.log('\n📊 CHECKING STREAK DATA...');
    
    // 1. Check userStreaks collection
    const streakRef = firebase.firestore().doc(`userStreaks/${user.uid}`);
    const streakDoc = await streakRef.get();
    
    if (streakDoc.exists()) {
      const streakData = streakDoc.data();
      console.log('✅ Found streak data in userStreaks collection:', streakData);
      
      // Parse dates
      if (streakData.lastWorkoutDate) {
        const lastWorkout = streakData.lastWorkoutDate.toDate();
        const now = new Date();
        const daysDiff = Math.floor((now - lastWorkout) / (1000 * 60 * 60 * 24));
        
        console.log(`📅 Last workout: ${lastWorkout.toLocaleString()}`);
        console.log(`📅 Current time: ${now.toLocaleString()}`);
        console.log(`⏰ Days since last workout: ${daysDiff}`);
      }
    } else {
      console.log('❌ No streak data found in userStreaks collection');
      
      // Check users collection fallback
      const userRef = firebase.firestore().doc(`users/${user.uid}`);
      const userDoc = await userRef.get();
      
      if (userDoc.exists() && userDoc.data().workoutStreak) {
        console.log('✅ Found streak data in users collection:', userDoc.data().workoutStreak);
      } else {
        console.log('❌ No streak data found in users collection either');
      }
    }
    
    // 2. Check today's workouts
    console.log('\n🏋️ CHECKING TODAY\'S WORKOUTS...');
    
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log(`📅 Checking workouts between: ${startOfDay.toLocaleString()} - ${endOfDay.toLocaleString()}`);
    
    // Query userWorkouts for today's workouts
    const userWorkoutsRef = firebase.firestore().collection('userWorkouts').doc(user.uid);
    const userWorkoutsDoc = await userWorkoutsRef.get();
    
    if (userWorkoutsDoc.exists()) {
      console.log('📂 Found user workouts collection');
      
      // Check all equipment types
      const equipmentCollections = await userWorkoutsRef.listCollections();
      let totalWorkoutsToday = 0;
      
      for (const equipmentCollection of equipmentCollections) {
        console.log(`🔍 Checking equipment: ${equipmentCollection.id}`);
        
        const exerciseDocs = await equipmentCollection.get();
        
        for (const exerciseDoc of exerciseDocs.docs) {
          console.log(`  💪 Checking exercise: ${exerciseDoc.id}`);
          
          const logsCollection = exerciseDoc.ref.collection('logs');
          const todaysWorkouts = await logsCollection
            .where('timestamps.completed', '>=', startOfDay)
            .where('timestamps.completed', '<=', endOfDay)
            .get();
          
          if (!todaysWorkouts.empty) {
            console.log(`    ✅ Found ${todaysWorkouts.size} workout(s) today in ${exerciseDoc.id}`);
            todaysWorkouts.forEach(doc => {
              const workout = doc.data();
              console.log(`      - Workout ${doc.id}: Status=${workout.status}, Completed=${workout.timestamps.completed?.toDate()?.toLocaleString()}`);
            });
            totalWorkoutsToday += todaysWorkouts.size;
          }
        }
      }
      
      console.log(`\n📈 TOTAL WORKOUTS TODAY: ${totalWorkoutsToday}`);
      
      if (totalWorkoutsToday === 0) {
        console.log('❌ No workouts found for today! This might be why streak isn\'t updating.');
        console.log('💡 Possible issues:');
        console.log('   - Workouts not saving with proper timestamps.completed');
        console.log('   - Workouts saving with wrong timezone');
        console.log('   - recordWorkout() not being called after workout completion');
      } else {
        console.log('✅ Found workouts today, but streak not updating. Possible issues:');
        console.log('   - recordWorkout() function not being called');
        console.log('   - Error in WorkoutStreakService.updateWorkoutStreak()');
        console.log('   - Dashboard not refreshing streak data');
      }
      
    } else {
      console.log('❌ No userWorkouts collection found for user');
    }
    
    // 3. Test streak service directly
    console.log('\n🧪 TESTING STREAK SERVICE...');
    
    try {
      // Manually trigger streak update
      console.log('⚡ Manually triggering streak update...');
      
      // Import and call the streak service (if available)
      if (window.WorkoutStreakService) {
        const result = await window.WorkoutStreakService.updateWorkoutStreak(user.uid);
        console.log('✅ Manual streak update result:', result);
      } else {
        console.log('❌ WorkoutStreakService not available in window scope');
        console.log('💡 Try running this on the workout-finished page instead');
      }
      
    } catch (error) {
      console.error('❌ Error testing streak service:', error);
    }
    
  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
  
  console.log('\n=== DEBUG COMPLETE ===');
  console.log('💡 Next steps:');
  console.log('   1. Check if workouts are saving properly with timestamps.completed');
  console.log('   2. Verify recordWorkout() is called after workout completion');
  console.log('   3. Test streak service manually if possible');
};

// Instructions
console.log('🔧 Streak Debug Tool Loaded!');
console.log('📋 Run debugStreak() in console to start analysis');
console.log('');
console.log('Usage: debugStreak()');