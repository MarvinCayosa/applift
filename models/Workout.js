/**
 * Model Definitions
 * Type definitions and constants for Workout model
 */

export const WorkoutModel = {
  // Workout status
  STATUS: {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
  },

  // Equipment types
  EQUIPMENT: {
    BARBELL: 'barbell',
    DUMBBELL: 'dumbbell',
    WEIGHT_STACK: 'weight_stack',
    BODYWEIGHT: 'bodyweight',
    CABLE: 'cable',
    KETTLEBELL: 'kettlebell',
    MEDICINE_BALL: 'medicine_ball',
  },

  // Workout schema
  SCHEMA: {
    id: 'string (UUID)',
    userId: 'string (UUID)',
    exercise: 'string',
    equipment: 'string (equipment type)',
    sets: 'number',
    reps: 'number',
    weight: 'number (optional)',
    duration: 'number (seconds, optional)',
    restTime: 'number (seconds, optional)',
    notes: 'string (optional)',
    intensity: 'string (low | medium | high, optional)',
    date: 'string (ISO date)',
    status: `'active' | 'completed' | 'archived'`,
    createdAt: 'string (ISO date)',
    updatedAt: 'string (ISO date)',
  },

  // Default workout data
  DEFAULT: {
    exercise: '',
    equipment: 'barbell',
    sets: 3,
    reps: 10,
    weight: null,
    duration: null,
    restTime: 60,
    notes: '',
    intensity: 'medium',
    status: 'active',
  },
}

export default WorkoutModel
