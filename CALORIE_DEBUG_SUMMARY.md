# Calorie Calculation - Debug Summary

## Current Issue: 810 kcal for 45 reps

Your workout shows **810 kcal** which is **24.5x too high**.

### Expected Value
- Exercise: Bench Press (MET = 6.0)
- Reps: 45 reps × 3 seconds = 135 seconds = 2.25 minutes active
- Formula: 2.25 × (6.0 × 3.5 × 70) / 200 = **33 kcal**

## Why You're Seeing 810 kcal

Your workout was completed **BEFORE** the fix was deployed. The wrong value is stored in:

1. **Firestore `logs` document** - Calculated by old `imu-stream` API
2. **Firestore `analytics` document** - Calculated by old analysis
3. **SessionStorage cache** - Cached from the analysis

All three sources have the OLD incorrect calculation.

## What Was Fixed

### 1. Server-Side API (`pages/api/imu-stream.js`) ✅
- Now calculates calories using ACTIVE time only (sum of rep durations)
- Uses MET formula correctly
- Stores in Firestore `results.calories`

### 2. Client-Side Placeholders Removed ✅
- `workout-monitor.js`: Removed `totalReps * 5` formula
- `useWorkoutAnalysis.js`: Set to 0 (placeholder)

### 3. Firestore Fetch Added ✅
- `workout-finished.js` now fetches calories from Firestore
- Priority: Firestore → analysis → query param
- Added debug logging

## How to Verify the Fix

### Step 1: Complete a NEW Workout
The fix only applies to NEW workouts completed after deployment.

### Step 2: Check Browser Console
Look for these logs:
```
[WorkoutFinished] Fetching calories from Firestore path: userWorkouts/...
[WorkoutFinished] Firestore document data: { calories: XX, activeDurationMs: YY, ... }
[WorkoutFinished] ✅ Fetched calories from Firestore: XX kcal
```

### Step 3: Verify the Value
For 45 reps of bench press:
- **Expected**: 30-35 kcal ✅
- **Old (wrong)**: 810 kcal ❌

## Debug Commands

### Check Firestore Document
```javascript
// In browser console on workout-finished page
const docRef = doc(db, 'userWorkouts', user.uid, 'barbell', 'flat-bench-press', 'logs', workoutId);
const docSnap = await getDoc(docRef);
console.log('Firestore data:', docSnap.data());
```

### Check Analysis Data
```javascript
// In browser console
console.log('Analysis data:', analysisData);
console.log('Firestore calories:', firestoreCalories);
```

### Clear Cache
```javascript
// Clear sessionStorage cache
sessionStorage.clear();
// Then refresh the page
```

## Expected Server Logs (Vercel)

When a NEW workout is completed, check Vercel function logs for:

```
[IMU-Stream] Calculated active duration from workoutData:
  totalSets: 3
  totalReps: 45
  activeDurationMs: 135000
  activeMinutes: 2.25

[IMU-Stream] Calorie calculation:
  durationMs: 135000
  durationMinutes: 2.25
  equipment: barbell
  met: 6.0
  bodyWeightKg: 70
  formula: 2.25 × (6.0 × 3.5 × 70) / 200
  result: 33
```

## Why Old Workouts Still Show Wrong Calories

The Firestore documents for old workouts contain the wrong calories and won't be updated automatically. Only NEW workouts will have correct calories.

If you want to fix old workouts, you would need to:
1. Re-calculate calories for each workout
2. Update the Firestore documents
3. Clear the analytics cache

But it's easier to just complete a new workout and verify the fix is working.

## Summary

✅ **Fix is complete** - All code changes are done
⏳ **Waiting for deployment** - Changes need to be deployed to production
🔄 **Need new workout** - Complete a new workout to see correct calories
📊 **Expected result**: ~33 kcal for 45 reps of bench press (not 810 kcal)
