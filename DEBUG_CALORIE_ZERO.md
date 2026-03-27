# Debug Guide: Calories Showing Zero

## Problem
Calories are showing 0 on the workout-finished page despite having a calculation function.

## Possible Causes

### 1. Function Not Being Called
**Check:** Look for this log in browser console:
```
[WorkoutMonitor] 🔥 saveRichSetDataToFirestore called:
```

**If missing:** The function isn't running. Possible reasons:
- `user?.uid` is null
- `mergedSetData` is empty
- `result?.workoutId` is missing

### 2. Rep Duration Data Missing
**Check:** Look for this log:
```
[WorkoutMonitor] 🔍 Rep duration debug:
```

**If durations are 0 or undefined:** The rep data doesn't have duration values.
- Check if `rep.duration` exists in the workout session data
- Check if `rep.durationMs` exists as fallback

### 3. Calorie Calculation Failing
**Check:** Look for these logs:
```
[CalorieCalculator] Input:
[CalorieCalculator] Calculated active time from rep durations:
[CalorieCalculator] Calculation:
[WorkoutMonitor] 💪 Calculated calories:
```

**If calculation shows 0:** 
- Duration might be 0
- MET value might be missing
- Formula might be returning 0

### 4. Firestore Write Failing
**Check:** Look for this log:
```
[WorkoutMonitor] ✅ Rich setData (with ROM) and calories saved to Firestore
```

**If missing:** The Firestore write failed.
- Check for error logs
- Check network tab for failed requests
- Check Firestore rules

### 5. Firestore Read Failing
**Check:** Look for these logs on workout-finished page:
```
[WorkoutFinished] Fetching calories from Firestore path:
[WorkoutFinished] Firestore document data:
[WorkoutFinished] ✅ Fetched calories from Firestore:
```

**If "No calories found":** The field wasn't written or was overwritten.

### 6. Race Condition
The server-side API (`imu-stream.js`) creates the Firestore document first, then the client-side merges in calories. If there's a timing issue, the calories might not be there yet.

**Solution:** Add a delay or retry logic in workout-finished page.

## Quick Fix to Test

Add this temporary code to workout-finished.js to see what's actually in Firestore:

```javascript
useEffect(() => {
  if (!user?.uid || !workoutId) return;
  
  const fetchDoc = async () => {
    const docRef = doc(db, 'userWorkouts', user.uid, 'dumbbell', 'concentration-curls', 'logs', workoutId);
    const snap = await getDoc(docRef);
    console.log('FULL FIRESTORE DOC:', snap.data());
  };
  
  fetchDoc();
}, [user?.uid, workoutId]);
```

This will show you EVERYTHING in the document, including whether `results.calories` exists.

## Expected Console Output (Working)

```
[WorkoutMonitor] 🔥 saveRichSetDataToFirestore called: {hasUser: true, hasSetData: true, hasWorkoutId: true, setDataLength: 2, workoutId: "abc123"}
[WorkoutMonitor] 🔍 Rep duration debug: {totalSets: 2, totalReps: 10, sampleSet: [{repNumber: 1, duration: 3.2, durationMs: 3200, time: 3.2}, ...]}
[CalorieCalculator] Input: {exercise: "Concentration Curls", equipment: "Dumbbell", totalReps: 10, ...}
[CalorieCalculator] Calculated active time from rep durations: {totalActiveSeconds: 32, durationMinutes: 0.53}
[CalorieCalculator] Calculation: {durationMinutes: 0.53, met: 4.5, bodyWeightKg: 70, formula: "0.53 × (4.50 × 3.5 × 70) / 200", result: 6}
[WorkoutMonitor] 💪 Calculated calories: 6 kcal {durationMinutes: 0.5, met: 4.5, intensityMultiplier: 1, bodyWeightKg: 70, exercise: "Concentration Curls", equipment: "Dumbbell"}
[WorkoutMonitor] ✅ Rich setData (with ROM) and calories saved to Firestore
```

Then on workout-finished page:
```
[WorkoutFinished] Fetching calories from Firestore path: userWorkouts/uid123/dumbbell/concentration-curls/logs/abc123
[WorkoutFinished] Firestore document data: {hasResults: true, calories: 6, activeDurationMs: 32000, totalDurationMs: 78000}
[WorkoutFinished] ✅ Fetched calories from Firestore: 6 kcal
```

## Next Steps

1. Complete a workout
2. Open browser console (F12)
3. Check for the logs above
4. Report which logs are missing or showing unexpected values
