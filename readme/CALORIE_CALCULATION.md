# Calorie Calculation System

## Overview

AppLift uses a scientifically-backed calorie calculation system based on the **MET (Metabolic Equivalent of Task)** formula, which is the industry standard used by fitness apps like Apple Fitness, Fitbit, MyFitnessPal, and Garmin.

## The MET Formula

```
Calories = Duration (min) × (MET × 3.5 × Body Weight (kg)) / 200
```

### Components:
- **Duration**: Time spent exercising in minutes
- **MET**: Metabolic Equivalent of Task (exercise intensity value)
- **3.5**: Constant representing oxygen consumption at rest (3.5 mL/kg/min)
- **Body Weight**: User's weight in kilograms
- **200**: Conversion factor to get kilocalories

## What is MET?

MET (Metabolic Equivalent of Task) is a measure of exercise intensity. It represents the ratio of your working metabolic rate to your resting metabolic rate.

| MET Value | Intensity Level | Example Activities |
|-----------|-----------------|-------------------|
| 1.0 | At rest | Sitting quietly |
| 2.0-3.0 | Light | Walking slowly, stretching |
| 3.0-6.0 | Moderate | Weight training, yoga |
| 6.0-9.0 | Vigorous | Heavy weight training, HIIT |
| 9.0+ | Very vigorous | Sprinting, competitive sports |

## MET Values Used in AppLift

### By Equipment Type

| Equipment | MET Value | Rationale |
|-----------|-----------|-----------|
| Barbell | 6.0 | Compound movements, heavy loads |
| Dumbbell | 5.0 | Standard resistance training |
| Kettlebell | 6.0 | Dynamic, full-body movements |
| Weight Stack (Machine) | 4.5 | Guided movement, less stabilization |
| Bodyweight | 4.0 | Calisthenics |
| Cable | 4.5 | Similar to machines |

### By Specific Exercise

| Exercise | MET Value | Category |
|----------|-----------|----------|
| Deadlift | 6.5 | Compound/Heavy |
| Squats | 6.5 | Compound/Heavy |
| Bench Press | 6.0 | Compound |
| Clean and Press | 8.0 | Olympic/Power |
| Bicep Curls | 4.5 | Isolation |
| Lateral Raises | 4.0 | Isolation |
| Leg Extension | 4.0 | Machine/Isolation |

## Intensity Multipliers

AppLift adjusts calorie calculations based on workout characteristics:

### Rest Time (Circuit vs Traditional)
- **Short rest (<30s)**: ×1.15 (higher metabolic demand)
- **Moderate rest (30-90s)**: ×1.0 (baseline)
- **Long rest (>90s)**: ×0.9 (lower sustained effort)

### Movement Tempo (from IMU data)
- **Explosive**: ×1.2 (fast concentric phase)
- **Controlled**: ×1.0 (standard tempo)
- **Slow (TUT)**: ×1.1 (time under tension)

### Load Intensity
- **Light (<50% 1RM)**: ×0.85
- **Moderate (50-75% 1RM)**: ×1.0
- **Heavy (>75% 1RM)**: ×1.15

## Example Calculations

### Example 1: Standard Dumbbell Workout
- Duration: 30 minutes
- Exercise: Bicep Curls (MET 4.5)
- Body Weight: 70 kg

```
Calories = 30 × (4.5 × 3.5 × 70) / 200
Calories = 30 × 1102.5 / 200
Calories = 165 kcal
```

### Example 2: Heavy Barbell Workout with Intensity
- Duration: 45 minutes
- Exercise: Deadlifts (MET 6.5)
- Body Weight: 80 kg
- Intensity Multiplier: 1.15 (heavy load, short rest)

```
Adjusted MET = 6.5 × 1.15 = 7.475
Calories = 45 × (7.475 × 3.5 × 80) / 200
Calories = 45 × 2093 / 200
Calories = 471 kcal
```

## Data Sources

Our MET values are based on:

1. **Compendium of Physical Activities** (Arizona State University)
   - The gold standard for MET values
   - https://sites.google.com/site/compendiumofphysicalactivities/

2. **ACSM Guidelines for Exercise Testing and Prescription**
   - American College of Sports Medicine standards

3. **Research Papers**:
   - Ainsworth BE, et al. "2011 Compendium of Physical Activities"
   - Resistance training energy expenditure studies

## How Other Apps Calculate Calories

| App | Method | Notes |
|-----|--------|-------|
| Apple Fitness | MET + Heart Rate | Uses HR for personalization |
| Fitbit | MET + Activity Zones | Time-in-zone based |
| MyFitnessPal | MET formula | Database of activities |
| Garmin | MET + VO2 estimate | Sport-specific algorithms |
| Strava | MET + power data | Cycling/running focused |

AppLift uses the **MET formula** as the base, enhanced with:
- Exercise-specific MET values
- Equipment type adjustments
- IMU-based intensity detection (tempo, ROM)
- Load intensity estimation

## Implementation in AppLift

### File Structure
```
utils/
  calorieCalculator.js    # Main calculation functions
```

### Key Functions

```javascript
// Calculate calories for a complete workout
import { calculateWorkoutCalories } from '../utils/calorieCalculator';

const result = calculateWorkoutCalories({
  exercise: 'Concentration Curls',
  equipment: 'dumbbell',
  durationMinutes: 15,
  totalReps: 32,
  totalSets: 4,
  weightUsed: 10,
  imuMetrics: {
    avgVelocity: 0.3,
    avgRestTime: 60,
  }
}, userBodyWeightKg);

// result.calories = calculated value
// result.breakdown = detailed breakdown
```

### Fallback Calculation

When duration is unknown, we estimate from reps:
- Average ~3 seconds per rep
- ~5 kcal per rep (simplified estimate)
- Adjusted by equipment type

## Future Improvements

1. **Heart Rate Integration**: If HR sensor data becomes available, factor in actual HR for more accurate EPOC (excess post-exercise oxygen consumption)

2. **User Fitness Level**: Adjust MET values based on training experience (beginners burn more calories for same relative effort)

3. **Body Composition**: Factor in muscle mass vs fat mass for more accurate resting metabolic rate

4. **Machine Learning**: Use historical workout data to personalize calorie estimates per user

## Accuracy Notes

Calorie calculations are **estimates**. Actual calories burned vary based on:
- Individual metabolism
- Fitness level
- Actual effort exerted
- Environmental factors (temperature, humidity)
- Recovery between sets (active vs passive)

Our system provides a **good approximation** consistent with industry standards and is suitable for tracking progress over time.
