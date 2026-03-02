# Movement Phase Labeling Fix

## Issue (Original)
The "Lifting" and "Lowering" labels in the movement phase analysis were swapped. When users performed longer lifting motions and shorter lowering motions, the display showed:
- Lifting: 27.2% (should be ~72.8%)
- Lowering: 72.8% (should be ~27.2%)

## Root Cause
The acceleration-based phase timing algorithm (`computePhaseTimings`) finds the **acceleration peak** (maximum force spike), which occurs **early during the concentric phase** (not at the physical turning point). This meant:
- `liftingTime` (before peak) = only the initial part of the lift → too short  
- `loweringTime` (after peak) = rest of lift + all lowering → too long

The **orientation-based** method (`computePhaseTimingsFromOrientation`) correctly finds the physical turning point (extremum in roll/pitch/yaw), so its labels are correct.

## Previous Fix (Display-Level Swap) — NOW REMOVED
Previously, display-level swaps were applied in multiple files to compensate. This was fragile because:
- With orientation data (primary path): algorithm correct + display swap = **WRONG**
- Without orientation data (fallback): algorithm reversed + display swap = correct

## Current Fix (Algorithm-Level)
Instead of display swaps, the **acceleration-based fallback functions** now swap their return values to match the orientation convention:

### Files Fixed

#### 1. `services/workoutAnalysisService.js` — `computePhaseTimings()`
- **Fix**: Swap return values: `liftingTime: loweringTime, loweringTime: liftingTime`
- **Fix**: `avgConcentric` now uses `m.liftingTime`, `avgEccentric` uses `m.loweringTime` (no swap)

#### 2. `pages/api/analyze-workout.js` — `computePhaseTimingsFromPrimaryAxis()`
- Same swap in return values

#### 3. `utils/useWorkoutSession.js` — `computeLocalPhaseTimings()`
- Same swap in return values

#### 4. Display Components — ALL SWAPS REMOVED
- `components/workoutFinished/RepInsightCard.js` — shows `liftingPercent` as Lifting directly
- `components/workoutFinished/LiftPhases.js` — uses `rep.liftingTime` for lifting directly
- `components/sessionDetails/MovementPhasesSection.js` — uses `rep.liftingTime` for lifting directly
- `pages/workout-monitor.js` (`computePhaseAverages`) — uses `rep.liftingTime` for lifting directly

## Result
- Both acceleration-based and orientation-based methods now output consistent values
- `liftingTime` = concentric (lifting) phase duration
- `loweringTime` = eccentric (lowering) phase duration
- No display swaps needed — values shown as-is
- Phase transition marker and seconds display added to rep graph