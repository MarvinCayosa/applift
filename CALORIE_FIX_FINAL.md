# Calorie Calculation - Final Fix

## Problem
Calories were showing 0 because of a Firestore merge conflict:
1. Server-side API writes `results: {completedSets, totalReps, activeDurationMs, ...}` 
2. Client-side writes `results: {setData, calories}`
3. Firestore's `{ merge: true }` doesn't deep-merge nested objects - one overwrites the other!

## Root Cause
When using `setDoc(ref, { results: {...} }, { merge: true })`, Firestore replaces the entire `results` object rather than merging its fields. This caused the client's `calories` field to be lost when the server wrote its `results` object, or vice versa.

## Solution
Use dot notation for nested field updates to ensure proper merging:

```javascript
// BEFORE (wrong - replaces entire results object)
await setDoc(docRef, { 
  results: { 
    setData: cleanSetData,
    calories: calorieResult.calories,
  } 
}, { merge: true });

// AFTER (correct - merges individual fields)
await setDoc(docRef, { 
  'results.setData': cleanSetData,
  'results.calories': calorieResult.calories,
}, { merge: true });
```

This ensures the client's `calories` and `setData` fields are added to the existing `results` object without removing the server's `completedSets`, `totalReps`, `activeDurationMs`, etc.

## Changes Made

### 1. Removed Server-Side Calorie Calculation
**File:** `pages/api/imu-stream.js`
- Removed `EQUIPMENT_MET` constant
- Removed `calculateCaloriesMET()` function  
- Server no longer calculates or writes calories
- Added comment explaining calories are calculated client-side

### 2. Fixed Client-Side Firestore Write
**File:** `pages/workout-monitor.js` → `saveRichSetDataToFirestore()`
- Changed from nested object to dot notation: `'results.setData'` and `'results.calories'`
- This properly merges into existing `results` object
- Calculates using `calculateWorkoutCalories()` from `utils/calorieCalculator.js`
- Uses MET formula with ACTIVE time only (rep durations, no rest)

### 3. Added Debug Logging
**File:** `pages/workout-monitor.js`
- Logs function entry with parameters
- Logs rep duration sample data
- Logs calorie calculation result

## How It Works Now

1. **During Workout** (`workout-monitor.js`):
   - User completes workout
   - `finishWorkout()` calls server API with `action: 'completeWorkout'`
   - Server writes: `results: {completedSets, totalReps, activeDurationMs, totalDurationMs, sets}`
   - Then `saveRichSetDataToFirestore()` is called client-side
   - Client merges: `'results.setData'` and `'results.calories'` using dot notation
   - Final Firestore document has ALL fields

2. **On Workout Finished Page** (`workout-finished.js`):
   - Fetches workout document from Firestore
   - Reads `results.calories` field (now present!)
   - Displays in UI

## Expected Results

**Example: 10 reps of concentration curls**
- Active time: ~30 seconds (3 sec/rep × 10 reps)
- Duration: 0.5 minutes
- MET: 4.5 (dumbbell curls)
- Body weight: 70 kg
- Calculation: `0.5 × (4.5 × 3.5 × 70) / 200 = 6 kcal`

**Example: 45 reps of bench press**
- Active time: ~135 seconds (3 sec/rep × 45 reps)
- Duration: 2.25 minutes
- MET: 6.0 (bench press)
- Body weight: 70 kg
- Calculation: `2.25 × (6.0 × 3.5 × 70) / 200 = 33 kcal`

## Console Logs to Check

```
[WorkoutMonitor] 🔥 saveRichSetDataToFirestore called: {hasUser: true, hasSetData: true, hasWorkoutId: true, ...}
[WorkoutMonitor] 🔍 Rep duration debug: {totalSets: 2, totalReps: 10, sampleSet: [{duration: 3.2, ...}, ...]}
[CalorieCalculator] Input: {exercise: "Concentration Curls", equipment: "Dumbbell", totalReps: 10, ...}
[CalorieCalculator] Calculated active time from rep durations: {totalActiveSeconds: 32, durationMinutes: 0.53}
[CalorieCalculator] Calculation: {durationMinutes: 0.53, met: 4.5, formula: "0.53 × (4.50 × 3.5 × 70) / 200", result: 6}
[WorkoutMonitor] 💪 Calculated calories: 6 kcal {durationMinutes: 0.5, met: 4.5, ...}
[WorkoutMonitor] ✅ Rich setData (with ROM) and calories saved to Firestore
```

Then on workout-finished:
```
[WorkoutFinished] Fetching calories from Firestore path: userWorkouts/.../logs/...
[WorkoutFinished] Firestore document data: {hasResults: true, calories: 6, ...}
[WorkoutFinished] ✅ Fetched calories from Firestore: 6 kcal
```

## Files Modified
1. `pages/api/imu-stream.js` - Removed server-side calorie calculation
2. `pages/workout-monitor.js` - Fixed Firestore write to use dot notation, added debug logs
3. `utils/calorieCalculator.js` - No changes (already correct)
4. `pages/workout-finished.js` - No changes (already correct)

## Key Takeaway
**Firestore's `{ merge: true }` only merges top-level fields!** To merge nested object fields, use dot notation: `'parent.child': value`
