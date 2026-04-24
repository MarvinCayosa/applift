# AI Recommendation Improvements

## Overview
Enhanced the AI recommendation system to leverage advanced biomechanical metrics (velocity loss and smoothness/jerk) for more intelligent load progression decisions.

## Key Metrics Now Utilized

### 1. Velocity Loss (avgVelocityLoss)
- **Definition**: % drop in peak angular velocity from first to last rep in a set
- **Source**: Calculated from gyroscope data (D_ω component of fatigue score)
- **Industry Standards**:
  - <10%: Excellent power output maintained
  - 10-20%: Moderate fatigue
  - 20-30%: High fatigue
  - >30%: Excessive fatigue

### 2. Smoothness Score (avgSmoothness)
- **Definition**: Movement control score (0-100) derived from mean jerk magnitude
- **Source**: Calculated from accelerometer data (rate of acceleration change)
- **Interpretation**:
  - 75-100: Smooth, controlled movement
  - 45-74: Moderate control
  - <45: Jerky/rushed movement

## Load Progression Decision Matrix

The AI now uses a 2x2 matrix combining velocity loss and smoothness:

| Velocity Loss | Smoothness | Decision |
|--------------|------------|----------|
| Low (<10%) | High (>75) | **INCREASE** load by 5-10% |
| Low (<10%) | Low (<45) | **MAINTAIN** load, cue "slow down" |
| High (>20%) | High (>75) | **MAINTAIN** load, add rest day |
| High (>20%) | Low (<45) | **REDUCE** load by 10-15% |

## Changes Made

### 1. Enhanced System Prompt
- Added detailed velocity loss interpretation guidelines
- Added smoothness score interpretation guidelines
- Created load progression decision matrix
- Emphasized these metrics as "MOST IMPORTANT" for load decisions

### 2. Improved Output Requirements
- **Rationale**: MUST reference specific velocity loss % and smoothness score from last session
- **Next Steps**: Must include specific metric targets (e.g., "aim for <15% velocity loss" or "maintain smoothness >70")

### 3. Data Already Available
The metrics were already being passed to the AI API from `pages/selectedWorkout.js`:
```javascript
avgVelocityLoss: analytics?.fatigue?.D_omega != null ? analytics.fatigue.D_omega * 100 : null,
avgSmoothness: analytics?.summary?.avgSmoothness ?? null,
```

## Example AI Responses (Expected)

### Before (Generic)
```
"rationale": "Based on your intermediate experience and past performance, this load is appropriate for continued strength development."
```

### After (Specific)
```
"rationale": "Last session showed 8% velocity loss and 82 smoothness score - excellent power maintenance and control. Ready to progress load by 5kg to continue strength gains."
```

## Benefits

1. **Data-Driven Decisions**: AI now makes load recommendations based on objective biomechanical data, not just generic experience levels
2. **Personalized Progression**: Each user's actual performance metrics drive their progression rate
3. **Injury Prevention**: Low smoothness scores trigger load reductions to prevent form breakdown
4. **Optimal Training Stimulus**: Velocity loss thresholds ensure users train in the optimal fatigue zone
5. **Transparent Reasoning**: Users see exactly why the AI recommended a specific load

## Technical Details

### Velocity Loss Calculation
```
velocityLoss = ((firstRepVelocity - lastRepVelocity) / firstRepVelocity) × 100
```

### Smoothness Calculation
```
jerk = d³position/dt³ (rate of acceleration change)
meanJerk = average absolute jerk magnitude
normalizedJerk = meanJerk / (movementDistance² / duration⁵)
smoothness = 100 - normalized(normalizedJerk)
```

## Future Enhancements

1. **Trend Analysis**: Track velocity loss and smoothness trends over multiple sessions
2. **Fatigue Prediction**: Predict when user needs deload week based on cumulative velocity loss
3. **Exercise-Specific Thresholds**: Different velocity loss targets for different exercises (e.g., squats vs curls)
4. **Real-Time Feedback**: Show velocity loss and smoothness during workout for immediate adjustments

## Testing Recommendations

1. Test with user who has consistent low velocity loss (<10%) - should see load increases
2. Test with user who has high velocity loss (>25%) - should see load maintenance or reduction
3. Test with user who has low smoothness (<45) - should see form-focused recommendations
4. Test first-time user (no history) - should still get reasonable recommendations based on experience level

## Related Files

- `pages/api/ai-recommendation.js` - Main AI recommendation API (updated)
- `pages/selectedWorkout.js` - Prepares past session data with metrics
- `pages/api/analyze-workout.js` - Calculates velocity loss and smoothness
- `services/movementQualityService.js` - Smoothness calculation logic
- `hooks/useWorkoutAnalysis.js` - Transforms analysis data for UI
