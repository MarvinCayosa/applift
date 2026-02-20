/**
 * Calorie Calculation Utility for Fitness Workouts
 * 
 * Uses the standard MET (Metabolic Equivalent of Task) formula:
 * Calories = Duration (min) × (MET × 3.5 × Body Weight (kg)) / 200
 * 
 * MET values sourced from:
 * - Compendium of Physical Activities (Arizona State University)
 * - ACSM Guidelines for Exercise Testing and Prescription
 * 
 * @see https://sites.google.com/site/compendiumofphysicalactivities/
 */

/**
 * MET values for strength training exercises
 * Values based on Compendium of Physical Activities and exercise physiology research
 * 
 * General strength training MET ranges:
 * - Light effort: 3.5 MET
 * - Moderate effort: 5.0 MET  
 * - Vigorous effort: 6.0 MET
 * - High intensity/Circuit: 8.0 MET
 */
const EXERCISE_MET_VALUES = {
  // Equipment-based defaults
  equipment: {
    'dumbbell': 5.0,        // Moderate resistance training
    'barbell': 6.0,         // Higher load, compound movements
    'weight-stack': 4.5,    // Machine-guided, slightly lower effort
    'bodyweight': 4.0,      // Calisthenics
    'kettlebell': 6.0,      // Dynamic movements
    'cable': 4.5,           // Similar to weight-stack
    'default': 5.0,
  },
  
  // Specific exercise MET overrides (more accurate when available)
  exercises: {
    // Dumbbell exercises
    'bicep-curls': 4.5,
    'concentration-curls': 4.5,
    'hammer-curls': 4.5,
    'dumbbell-rows': 5.5,
    'dumbbell-press': 5.5,
    'lateral-raises': 4.0,
    'front-raises': 4.0,
    'dumbbell-lunges': 6.0,
    'dumbbell-squats': 6.0,
    'goblet-squats': 6.0,
    
    // Barbell exercises (compound movements = higher MET)
    'bench-press': 6.0,
    'deadlift': 6.5,
    'squats': 6.5,
    'back-squats': 6.5,
    'front-squats': 6.5,
    'overhead-press': 5.5,
    'barbell-rows': 6.0,
    'clean-and-press': 8.0,
    
    // Machine exercises
    'lat-pulldown': 4.5,
    'cable-rows': 4.5,
    'leg-press': 5.0,
    'leg-extension': 4.0,
    'leg-curl': 4.0,
    'chest-press': 4.5,
    'shoulder-press-machine': 4.0,
    
    // Bodyweight
    'push-ups': 4.0,
    'pull-ups': 5.5,
    'chin-ups': 5.5,
    'dips': 5.0,
    'planks': 3.5,
    'crunches': 3.5,
  },
};

/**
 * Intensity multipliers based on workout characteristics
 * These adjust the base MET value based on how the exercise is performed
 */
const INTENSITY_MULTIPLIERS = {
  // Based on rest time between sets
  restTime: {
    short: 1.15,    // < 30 seconds (circuit-style)
    moderate: 1.0,  // 30-90 seconds (standard)
    long: 0.9,      // > 90 seconds (strength focus)
  },
  
  // Based on tempo/velocity (from IMU data if available)
  tempo: {
    explosive: 1.2,    // Fast concentric, controlled eccentric
    controlled: 1.0,   // Standard tempo
    slow: 1.1,         // Time under tension
  },
  
  // Based on weight relative to capacity
  loadIntensity: {
    light: 0.85,     // < 50% capacity
    moderate: 1.0,   // 50-75% capacity
    heavy: 1.15,     // > 75% capacity
  },
};

/**
 * Default body weight if not provided (kg)
 * Based on global average adult weight
 */
const DEFAULT_BODY_WEIGHT_KG = 70;

/**
 * Normalize exercise name to path format for lookup
 * @param {string} name - Exercise name
 * @returns {string} Normalized path
 */
function normalizeExerciseName(name) {
  if (!name) return 'default';
  return name
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Normalize equipment name for lookup
 * @param {string} equipment - Equipment name
 * @returns {string} Normalized equipment
 */
function normalizeEquipment(equipment) {
  if (!equipment) return 'default';
  const normalized = equipment.toLowerCase().replace(/\s+/g, '-');
  if (normalized === 'dumbell') return 'dumbbell'; // Fix common typo
  if (normalized === 'stack' || normalized === 'weight_stack') return 'weight-stack';
  return normalized;
}

/**
 * Get MET value for an exercise
 * Prioritizes specific exercise value, falls back to equipment default
 * 
 * @param {string} exercise - Exercise name
 * @param {string} equipment - Equipment type
 * @returns {number} MET value
 */
export function getExerciseMET(exercise, equipment) {
  const normalizedExercise = normalizeExerciseName(exercise);
  const normalizedEquipment = normalizeEquipment(equipment);
  
  // Try specific exercise first
  if (EXERCISE_MET_VALUES.exercises[normalizedExercise]) {
    return EXERCISE_MET_VALUES.exercises[normalizedExercise];
  }
  
  // Fall back to equipment default
  if (EXERCISE_MET_VALUES.equipment[normalizedEquipment]) {
    return EXERCISE_MET_VALUES.equipment[normalizedEquipment];
  }
  
  return EXERCISE_MET_VALUES.equipment.default;
}

/**
 * Calculate intensity multiplier based on workout characteristics
 * 
 * @param {Object} options - Workout characteristics
 * @param {number} options.avgRestTime - Average rest time in seconds
 * @param {number} options.avgVelocity - Average rep velocity (if available)
 * @param {number} options.weightUsed - Weight used in exercise
 * @param {number} options.estimatedMax - Estimated 1RM (if available)
 * @returns {number} Intensity multiplier
 */
export function calculateIntensityMultiplier(options = {}) {
  let multiplier = 1.0;
  
  // Rest time factor
  if (options.avgRestTime !== undefined) {
    if (options.avgRestTime < 30) {
      multiplier *= INTENSITY_MULTIPLIERS.restTime.short;
    } else if (options.avgRestTime > 90) {
      multiplier *= INTENSITY_MULTIPLIERS.restTime.long;
    }
  }
  
  // Tempo/velocity factor (from IMU data)
  if (options.avgVelocity !== undefined) {
    if (options.avgVelocity > 0.5) { // Fast movement
      multiplier *= INTENSITY_MULTIPLIERS.tempo.explosive;
    }
  }
  
  // Load intensity factor
  if (options.weightUsed && options.estimatedMax) {
    const loadPercent = options.weightUsed / options.estimatedMax;
    if (loadPercent < 0.5) {
      multiplier *= INTENSITY_MULTIPLIERS.loadIntensity.light;
    } else if (loadPercent > 0.75) {
      multiplier *= INTENSITY_MULTIPLIERS.loadIntensity.heavy;
    }
  }
  
  return multiplier;
}

/**
 * Calculate calories burned using the MET formula
 * 
 * Formula: Calories = Duration (min) × (MET × 3.5 × Body Weight (kg)) / 200
 * 
 * @param {Object} params - Calculation parameters
 * @param {number} params.durationMinutes - Workout duration in minutes
 * @param {number} params.met - MET value for the exercise
 * @param {number} params.bodyWeightKg - User's body weight in kg
 * @param {number} params.intensityMultiplier - Optional intensity adjustment
 * @returns {number} Calories burned (rounded)
 */
export function calculateCaloriesFromMET({
  durationMinutes,
  met,
  bodyWeightKg = DEFAULT_BODY_WEIGHT_KG,
  intensityMultiplier = 1.0,
}) {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  if (!met || met <= 0) met = 5.0; // Default moderate resistance training
  
  const adjustedMET = met * intensityMultiplier;
  const calories = durationMinutes * (adjustedMET * 3.5 * bodyWeightKg) / 200;
  
  return Math.round(calories);
}

/**
 * Calculate calories for a complete workout session
 * This is the main function to use when saving workout data
 * 
 * @param {Object} workout - Workout data
 * @param {string} workout.exercise - Exercise name
 * @param {string} workout.equipment - Equipment type
 * @param {number} workout.durationMs - Workout duration in milliseconds
 * @param {number} workout.durationMinutes - Workout duration in minutes (alternative)
 * @param {number} workout.totalReps - Total reps completed
 * @param {number} workout.totalSets - Total sets completed
 * @param {number} workout.weightUsed - Weight used (kg)
 * @param {Object} workout.imuMetrics - IMU sensor data (optional)
 * @param {number} workout.imuMetrics.avgVelocity - Average rep velocity
 * @param {number} workout.imuMetrics.avgRestTime - Average rest between sets
 * @param {number} userBodyWeightKg - User's body weight in kg (optional)
 * @returns {Object} Calorie calculation result with breakdown
 */
export function calculateWorkoutCalories(workout, userBodyWeightKg = DEFAULT_BODY_WEIGHT_KG) {
  // Get duration in minutes
  let durationMinutes = workout.durationMinutes;
  if (!durationMinutes && workout.durationMs) {
    durationMinutes = workout.durationMs / 60000;
  }
  if (!durationMinutes && workout.totalTime) {
    // totalTime might be in seconds
    durationMinutes = workout.totalTime / 60;
  }
  
  // Minimum 1 minute for any workout
  if (!durationMinutes || durationMinutes < 1) {
    // Estimate duration from reps: ~3 seconds per rep average
    const estimatedSeconds = (workout.totalReps || 0) * 3;
    durationMinutes = Math.max(estimatedSeconds / 60, 1);
  }
  
  // Get MET value
  const met = getExerciseMET(workout.exercise, workout.equipment);
  
  // Calculate intensity multiplier
  const intensityMultiplier = calculateIntensityMultiplier({
    avgRestTime: workout.imuMetrics?.avgRestTime,
    avgVelocity: workout.imuMetrics?.avgVelocity,
    weightUsed: workout.weightUsed,
    estimatedMax: workout.estimatedMax,
  });
  
  // Calculate calories
  const calories = calculateCaloriesFromMET({
    durationMinutes,
    met,
    bodyWeightKg: userBodyWeightKg,
    intensityMultiplier,
  });
  
  return {
    calories,
    breakdown: {
      durationMinutes: Math.round(durationMinutes * 10) / 10,
      met,
      intensityMultiplier: Math.round(intensityMultiplier * 100) / 100,
      bodyWeightKg: userBodyWeightKg,
      exercise: workout.exercise,
      equipment: workout.equipment,
    },
  };
}

/**
 * Simple calorie calculation for backward compatibility
 * Uses when full workout data is not available
 * 
 * @param {number} totalReps - Total reps completed
 * @param {number} durationSeconds - Duration in seconds (optional)
 * @param {string} equipment - Equipment type (optional)
 * @returns {number} Estimated calories
 */
export function calculateSimpleCalories(totalReps, durationSeconds = 0, equipment = 'default') {
  // If we have duration, use MET formula with defaults
  if (durationSeconds > 0) {
    const durationMinutes = durationSeconds / 60;
    const met = getExerciseMET(null, equipment);
    return calculateCaloriesFromMET({ durationMinutes, met });
  }
  
  // Fallback: estimate based on reps
  // Research suggests ~0.2-0.5 kcal per rep for moderate resistance training
  // Using 0.3 as middle ground, multiplied by equipment factor
  const equipmentFactor = {
    'barbell': 1.3,
    'dumbbell': 1.0,
    'weight-stack': 0.9,
    'bodyweight': 0.8,
    'default': 1.0,
  };
  
  const normalized = normalizeEquipment(equipment);
  const factor = equipmentFactor[normalized] || equipmentFactor.default;
  
  return Math.round(totalReps * 0.3 * factor);
}

export default {
  calculateWorkoutCalories,
  calculateCaloriesFromMET,
  calculateSimpleCalories,
  getExerciseMET,
  calculateIntensityMultiplier,
  EXERCISE_MET_VALUES,
  DEFAULT_BODY_WEIGHT_KG,
};
