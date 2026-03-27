# Calorie Calculation - Final Implementation

## Single Source of Truth: MET Formula

All calorie calculations now use the scientifically-based MET (Metabolic Equivalent of Task) formula:

```
Calories = Duration (min) × (MET × 3.5 × Body Weight (kg)) / 200
```

## Implementation Location

**Server-Side Only**: `pages/api/imu-stream.js`
- Function: `calculateCaloriesMET()`
- Calculates calories when workout is saved to Firestore
- Uses ACTIVE time only (sum of rep durations, excludes rest)
- Stores result in `results.calories` field

## Data Flow

```
1. Workout Completed
   ↓
2. imu-stream API calculates calories using MET formula
   ↓
3. Saves to Firestore: userWorkouts/{uid}/{equipment}/{exercise}/logs/{workoutId}
   ↓
4. workout-finished page fetches calories from Firestore
   ↓
5. Displays accurate calories to user
```

## Removed Calculations

### ❌ Removed from `pages/workout-monitor.js`
**Before:**
```javascript
calories: Math.round(finalStats.totalReps * 5)  // 5 kcal per rep
```

**After:**
```javascript
calories: 0  // Placeholder, real value from Firestore
```

### ❌ Removed from `hooks/useWorkoutAnalysis.js`
**Before:**
```javascript
const calories = Math.round(activeTime * 0.15 * totalReps);  // Arbitrary formula
```

**After:**
```javascript
const calories = 0;  // Placeholder, real value from Firestore
```

## workout-finished.js Changes

### Added Firestore Fetch
```javascript
// Fetch calories from Firestore (calculated server-side with MET formula)
useEffect(() => {
  const fetchCalories = async () => {
    const docRef = doc(db, 'userWorkouts', user.uid, eq, ex, 'logs', workoutId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const serverCalories = data.results?.calories;
      setFirestoreCalories(serverCalories);
    }
  };
  fetchCalories();
}, [user?.uid, workoutId, equipment, workoutName]);
```

### Priority Order
```javascript
calories: firestoreCalories ?? analysisData?.calories ?? parseInt(calories) || 0
```

1. `firestoreCalories` - Server-calculated MET-based (PREFERRED)
2. `analysisData?.calories` - Fallback (now always 0)
3. `parseInt(calories)` - Query param (now always 0)
4. `0` - Default

## MET Values by Equipment

Defined in `pages/api/imu-stream.js`:

```javascript
const EQUIPMENT_MET = {
  'dumbbell': 5.0,
  'barbell': 6.0,
  'weight-stack': 4.5,
  'kettlebell': 6.0,
  'bodyweight': 4.0,
  'cable': 4.5,
  'default': 5.0,
};
```

## Example Calculations

### Bench Press (9 reps, ~30s active)
- MET: 6.0
- Body weight: 70 kg
- Active time: 30 seconds = 0.5 minutes
- Calculation: 0.5 × (6.0 × 3.5 × 70) / 200 = **7.35 kcal**

### Back Squats (30 reps, ~90s active)
- MET: 6.5
- Body weight: 70 kg
- Active time: 90 seconds = 1.5 minutes
- Calculation: 1.5 × (6.5 × 3.5 × 70) / 200 = **31.7 kcal**

### Dumbbell Curls (30 reps, ~90s active)
- MET: 4.5
- Body weight: 70 kg
- Active time: 90 seconds = 1.5 minutes
- Calculation: 1.5 × (4.5 × 3.5 × 70) / 200 = **21.9 kcal**

## Active Time Calculation

The server-side API calculates active time by summing rep durations:

```javascript
let activeDurationMs = 0;
workoutData.sets.forEach(set => {
  set.reps.forEach(rep => {
    activeDurationMs += rep.duration; // milliseconds
  });
});
```

This excludes:
- Rest between sets
- Rest between reps
- Time adjusting equipment
- Any pauses

## Logging

Server-side logs (check Vercel function logs):
```
[IMU-Stream] Calculated active duration from workoutData:
  totalSets: 3
  totalReps: 9
  activeDurationMs: 27000
  activeMinutes: 0.45

[IMU-Stream] Calorie calculation:
  durationMs: 27000
  durationMinutes: 0.45
  equipment: barbell
  met: 6.0
  bodyWeightKg: 70
  result: 7
```

Client-side logs (browser console):
```
[WorkoutFinished] ✅ Fetched calories from Firestore: 7 kcal
```

## Future Enhancements

1. **User Body Weight**: Currently defaults to 70kg. Should fetch from user profile.
2. **Exercise-Specific METs**: Add more granular MET values per exercise type.
3. **Intensity Multipliers**: Use rest time, tempo, and load to adjust MET values.
4. **Historical Calibration**: Track accuracy over time and adjust formulas.

## Testing

1. Complete a new workout (e.g., 9 reps of bench press)
2. Check Vercel logs for `[IMU-Stream]` messages
3. Check browser console for `[WorkoutFinished]` messages
4. Verify calories match expected range (7-9 kcal for 9 reps)

## Files Modified

1. `pages/api/imu-stream.js` - Server-side MET calculation (MAIN)
2. `pages/workout-monitor.js` - Removed placeholder calculation
3. `hooks/useWorkoutAnalysis.js` - Removed arbitrary formula
4. `pages/workout-finished.js` - Added Firestore fetch
5. `utils/calorieCalculator.js` - Reference implementation (not used in production flow)

## Verification

Use the debug script to verify:
```javascript
// In browser console on workout-finished page:
await debugCalorieSession()
```

This will show:
- Active duration vs total duration
- Calories from Firestore
- Expected calories based on MET formula
- Any discrepancies
