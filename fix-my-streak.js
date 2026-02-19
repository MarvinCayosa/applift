/**
 * MANUAL STREAK FIX for user with 3-day streak (Feb 18, 19, 20)
 * 
 * Run this in your browser console on the dashboard page.
 * This will set your streak to 3 days since you have workouts on those dates.
 */

(async function fixMyStreak() {
  console.log('🔧 FIXING YOUR STREAK...');
  console.log('========================');
  
  const user = firebase?.auth()?.currentUser;
  if (!user) {
    console.error('❌ Please sign in first');
    return;
  }
  
  console.log(`👤 User: ${user.email} (${user.uid})`);
  
  const db = firebase.firestore();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate streak start date (Feb 18, 2026)
  const streakStartDate = new Date('2026-02-18');
  streakStartDate.setHours(0, 0, 0, 0);
  
  const streakData = {
    userId: user.uid,
    currentStreak: 3,
    longestStreak: 3,
    lastWorkoutDate: today,
    totalWorkoutDays: 3, // At least 3 from Feb 18, 19, 20
    streakStartDate: streakStartDate,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
    lostStreak: null,
    streakLostDate: null
  };
  
  try {
    // Write to userStreaks collection
    console.log('📝 Writing to userStreaks collection...');
    await db.collection('userStreaks').doc(user.uid).set(streakData, { merge: true });
    
    // Also write to users collection for backup
    console.log('📝 Writing to users collection...');
    await db.collection('users').doc(user.uid).set({ 
      workoutStreak: streakData 
    }, { merge: true });
    
    console.log('✅ Streak data written successfully!');
    console.log('📊 New streak data:', streakData);
    
    // Refresh the dashboard
    console.log('🔄 Refreshing dashboard...');
    window.dispatchEvent(new Event('streak-updated'));
    window.dispatchEvent(new Event('focus'));
    
    console.log('');
    console.log('🎉 SUCCESS! Your streak is now set to 3 days!');
    console.log('📌 Please reload the page to see the updated streak.');
    
    alert('✅ Streak fixed! Your 3-day streak is now recorded. Reload the page to see it!');
    
  } catch (error) {
    console.error('❌ Failed to fix streak:', error);
    alert('Failed to fix streak: ' + error.message);
  }
})();

console.log('🚀 Streak fix script running...');