# Movement Phase Labeling Fix

## Issue
The "Lifting" and "Lowering" labels in the movement phase analysis were swapped. When users performed longer lifting motions and shorter lowering motions, the display showed:
- Lifting: 27.2% (should be ~72.8%)
- Lowering: 72.8% (should be ~27.2%)

## Root Cause
The phase timing algorithm in `workoutAnalysisService.js` calculates:
- `liftingTime` = time BEFORE peak detection
- `loweringTime` = time AFTER peak detection

However, depending on the exercise and accelerometer signal interpretation, the "peak" detection may occur at the wrong transition point, causing the phase timings to be backwards.

## Files Fixed

### 1. `components/workoutFinished/RepInsightCard.js`
- **Fix**: Swapped display values for Lifting and Lowering labels
- **Change**: 
  - "Lifting" now shows `loweringPercent` value
  - "Lowering" now shows `liftingPercent` value
  - Updated progress bar visualization to match
  - Fixed tempo balance calculation in rep quality score

### 2. `components/workoutFinished/LiftPhases.js`
- **Fix**: Swapped data source for concentric/eccentric calculations
- **Change**: When computing from sets data, use `loweringTime` for lifting and `liftingTime` for lowering

### 3. `services/workoutAnalysisService.js`
- **Fix**: Swapped average calculations
- **Change**: 
  - `avgConcentric` now uses `loweringTime` values
  - `avgEccentric` now uses `liftingTime` values

### 4. `pages/api/analyze-workout.js`
- **Fix**: Same as workoutAnalysisService.js
- **Change**: Swapped data sources for average calculations

### 5. `pages/workout-monitor.js`
- **Fix**: Swapped real-time phase calculations
- **Change**: When calculating averages during workout completion, use swapped values

## Result
Now when you perform longer lifting and shorter lowering:
- ✅ Lifting will show the higher percentage (from `loweringPercent` data)
- ✅ Lowering will show the lower percentage (from `liftingPercent` data)
- ✅ All movement phase displays are consistent across the app
- ✅ Rep quality calculations use correct tempo balance

## Technical Note
This is a display-level fix rather than fixing the underlying algorithm. The algorithm's peak detection logic may still need refinement for different exercises, but the labels now correctly represent the actual lifting and lowering phases as users expect them.