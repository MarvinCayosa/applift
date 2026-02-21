/**
 * Shared configuration for equipment types.
 * Single source of truth for colors, exercises, images, and labels.
 */

const equipmentConfig = {
  dumbbell: {
    label: 'Dumbbell',
    slug: 'dumbbell',
    primary: '#3B82F6',       // Blue-500
    primaryDark: '#1e5bab',   // Darker muted blue
    heroImage: '/images/workout-cards/dumbbell_overhead_tricep_extensions.png',
    exercises: [
      {
        key: 'overhead-triceps-extension',
        name: 'Overhead Extensions',
        shortName: 'Overhead\nExtensions',
        firestoreNames: ['overhead-triceps-extension', 'overhead triceps extension', 'Overhead Triceps Extension'],
        image: '/images/workout-cards/dumbbell_overhead_tricep_extensions.png',
        variant: 'primary',   // uses primary color
      },
      {
        key: 'concentration-curls',
        name: 'Concentration Curls',
        shortName: 'Concentration\nCurls',
        firestoreNames: ['concentration-curls', 'concentration curls', 'Concentration Curls'],
        image: '/images/workout-cards/dumbbell-concentration-curls.jpg',
        variant: 'dark',      // uses darker shade
      },
    ],
  },

  barbell: {
    label: 'Barbell',
    slug: 'barbell',
    primary: '#EAB308',       // Yellow-500
    primaryDark: '#d09e28',   // Darker muted yellow
    heroImage: '/images/workout-cards/barbell-flat-bench-press.jpg',
    exercises: [
      {
        key: 'flat-bench-barbell-press',
        name: 'Flat Bench Press',
        shortName: 'Flat Bench\nPress',
        firestoreNames: ['flat-bench-barbell-press', 'flat bench barbell press', 'Flat Bench Barbell Press'],
        image: '/images/workout-cards/barbell-flat-bench-press.jpg',
        variant: 'primary',
      },
      {
        key: 'back-squats',
        name: 'Back Squats',
        shortName: 'Back\nSquats',
        firestoreNames: ['back-squats', 'back squats', 'Back Squats'],
        image: '/images/workout-cards/barbell_back_squats.jpg',
        variant: 'dark',
      },
    ],
  },

  'weight-stack': {
    label: 'Weight Stack',
    slug: 'weight-stack',
    primary: '#EF4444',       // Red-500
    primaryDark: '#b22222',   // Darker muted red
    heroImage: '/images/workout-cards/weightstack-lateral-pulldown.jpg',
    exercises: [
      {
        key: 'lateral-pulldown',
        name: 'Lateral Pulldown',
        shortName: 'Lateral\nPulldown',
        firestoreNames: ['lateral-pulldown', 'lateral pulldown', 'Lateral Pulldown'],
        image: '/images/workout-cards/weightstack-lateral-pulldown.jpg',
        variant: 'primary',
      },
      {
        key: 'seated-leg-extension',
        name: 'Seated Leg Extension',
        shortName: 'Seated Leg\nExtension',
        firestoreNames: ['seated-leg-extension', 'seated leg extension', 'Seated Leg Extension'],
        image: '/images/workout-cards/weightstack-seated-leg-extension.jpg',
        variant: 'dark',
      },
    ],
  },
}

export default equipmentConfig
