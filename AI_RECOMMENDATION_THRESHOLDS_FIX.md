# AI Recommendation - Correct Thresholds from Codebase

## Issue
The AI recommendation system prompt needs to use the EXACT thresholds defined in your codebase, not generic industry standards.

## Your Actual Thresholds (from code analysis)

### 1. Velocity Loss Thresholds
**Source**: `components/sessionDetails/FatigueCarousel.js` line 155
```javascript
vlLevel: velocityLoss < 10 ? 'Minimal' : 
         velocityLoss < 20 ? 'Low' : 
         velocityLoss < 30 ? 'Moderate' : 
         velocityLoss < 40 ? 'High' : 'Near Failure'
```

**Thresholds**:
- <10%: Minimal (excellent power maintenance)
- 10-20%: Low (moderate fatigue)
- 20-30%: Moderate (significant fatigue)
- 30-40%: High (high fatigue)
- >40%: Near Failure (excessive fatigue)

**Effective Rep Definition**: `hooks/useWorkoutAnalysis.js` line 169
```javascript
isEffective: velocityLossPercent < 10
```

### 2. Fatigue Score Thresholds
**Source**: `pages/api/analyze-workout.js` lines 1051-1055
```javascript
if (fatigueScore < 15) fatigueLevel = 'minimal';
else if (fatigueScore < 30) fatigueLevel = 'low';
else if (fatigueScore < 50) fatigueLevel = 'moderate';
else if (fatigueScore < 70) fatigueLevel = 'high';
else fatigueLevel = 'severe';
```

**Thresholds**:
- <15%: Minimal
- 15-30%: Low
- 30-50%: Moderate
- 50-70%: High
- >70%: Severe

### 3. Smoothness Score Calculation
**Source**: `pages/api/analyze-workout.js` lines 704-756

**Normalized Jerk Range**:
```javascript
const NORM_JERK_MIN = 0.3;  // Very smooth (controlled) → 100 score
const NORM_JERK_MAX = 3.0;  // Very jerky (uncontrolled) → 0 score
```

**Formula**:
```javascript
smoothnessScore = 100 - ((normalizedJerk - 0.3) * (100 / 2.7))
```

**Interpretation** (not explicitly defined in code, but based on usage):
- High smoothness: >70 (controlled movement)
- Moderate smoothness: 40-70 (acceptable control)
- Low smoothness: <40 (jerky/rushed)

## Recommended AI Prompt Updates

### KEY METRICS Section
Replace with:
```
KEY METRICS (interpret holistically, use these thresholds as guidelines):
- cleanRepPct: % of reps classified "Clean" by ML model. Higher = better form.
- fatigueScore: Composite fatigue score (0-100%). Thresholds: <15% minimal, 15-30% low, 30-50% moderate, 50-70% high, >70% severe.
- consistencyScore: % rep-to-rep consistency. Higher = more consistent.
- velocityLoss (avgVelocityLoss): % drop in peak angular velocity from first to last rep. THIS IS THE MOST IMPORTANT METRIC for load progression. Thresholds: <10% minimal, 10-20% low, 20-30% moderate, 30-40% high, >40% near failure.
- smoothness (avgSmoothness): Movement control score (0-100). Derived from jerk (rate of acceleration change). Based on normalized jerk range 0.3-3.0. Higher = smoother, more controlled movement.
```

### VELOCITY LOSS INTERPRETATION Section
Replace with:
```
VELOCITY LOSS INTERPRETATION (CRITICAL FOR LOAD DECISIONS):
- <10% (Minimal): Excellent power output maintained. User can handle MORE load (5-10% increase) or add volume.
- 10-20% (Low): Moderate fatigue. MAINTAIN current load, consider adding 1 set if recovery is good.
- 20-30% (Moderate): Significant fatigue. MAINTAIN load, do NOT increase. Focus on recovery.
- 30-40% (High): High fatigue. REDUCE load by 5-10% OR reduce volume by 1 set.
- >40% (Near Failure): Excessive fatigue. REDUCE load by 10-15% to prevent overtraining.
```

### Add SMOOTHNESS INTERPRETATION Section
```
SMOOTHNESS INTERPRETATION (MOVEMENT QUALITY):
- Smoothness is calculated from normalized jerk (0.3 = very smooth → 100 score, 3.0 = very jerky → 0 score).
- High smoothness (>70): Controlled, quality movement. Safe to progress load if velocity loss is low.
- Moderate smoothness (40-70): Acceptable control. Maintain load, cue "focus on tempo and control".
- Low smoothness (<40): Jerky/rushed movement. REDUCE load by 10-15% to improve movement quality.
```

### Add FATIGUE SCORE INTERPRETATION Section
```
FATIGUE SCORE INTERPRETATION:
- <15% (Minimal): Fresh, ready for progression.
- 15-30% (Low): Normal training fatigue, can maintain or progress.
- 30-50% (Moderate): Accumulating fatigue, maintain load.
- 50-70% (High): Significant fatigue, consider deload or rest.
- >70% (Severe): Overreaching, reduce load and volume.
```

### LOAD PROGRESSION DECISION MATRIX Section
Replace with:
```
LOAD PROGRESSION DECISION MATRIX:
Combine velocityLoss + smoothness + fatigueScore to make intelligent decisions:
1. Low velocity loss (<10%) + High smoothness (>70) + Low fatigue (<30%): INCREASE load by 5-10%
2. Low velocity loss (<10%) + Low smoothness (<40): MAINTAIN load, cue "slow down, control the movement"
3. Moderate velocity loss (20-30%) + High smoothness (>70): User is fatigued but form is good. MAINTAIN load, add rest day.
4. High velocity loss (>30%) + Any smoothness: REDUCE load by 10-15%, prioritize recovery.
5. Any velocity loss + Low smoothness (<40): REDUCE load by 10-15% to improve movement quality.
```

### OUTPUT FORMAT Section
Update rationale requirement:
```
"rationale": "<2-3 sentences MUST reference specific velocity loss %, smoothness score, and fatigue score from last session if available, explain load decision based on these metrics>",
```

## File to Update
`pages/api/ai-recommendation.js` - Lines 57-130 (SYSTEM_PROMPT constant)

## Current Issue
The SYSTEM_PROMPT in the file appears to be corrupted with duplicate OUTPUT FORMAT sections. The file needs to be carefully reconstructed with the correct thresholds.

## Testing After Fix
1. Test with user who has velocity loss <10% - should see load increase recommendations
2. Test with user who has velocity loss >30% - should see load reduction recommendations
3. Test with user who has low smoothness <40 - should see form-focused recommendations
4. Verify AI rationale mentions specific velocity loss %, smoothness, and fatigue values

## Benefits
- AI recommendations will be consistent with your UI's fatigue level indicators
- Users will see the same thresholds in the UI and in AI explanations
- Load progression decisions will be based on your validated biomechanical thresholds
- More accurate and personalized recommendations
