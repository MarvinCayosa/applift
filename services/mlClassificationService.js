/**
 * ML Classification Service
 * 
 * Handles rep quality classification using ML models or rule-based fallback.
 * 
 * Exercise Model Support (6 total):
 * - concentration_curls: CONCENTRATION_CURLS_RF.pkl ✓
 * - overhead_extensions: OVERHEAD_EXTENSIONS_RF.pkl ✓
 * - lateral_pulldown: LATERAL_PULLDOWN_RF.pkl ✓
 * - leg_extension: LEG_EXTENSION_RF.pkl ✓
 * - bench_press: BENCH_PRESS_RF.pkl (coming soon)
 * - back_squats: BACK_SQUATS_RF.pkl (coming soon)
 * 
 * To add a new model: just place the .pkl file in cloud-run-ml-api/models/
 * with the naming pattern: EXERCISE_NAME_RF.pkl
 */

// Exercise name to model file mapping
// Just add the PKL file and add mapping here - Cloud Run will auto-detect it
export const EXERCISE_MODEL_MAP = {
  // Dumbbell exercises
  'concentration_curls': 'CONCENTRATION_CURLS_RF.pkl',
  'concentration curls': 'CONCENTRATION_CURLS_RF.pkl',
  'Concentration Curls': 'CONCENTRATION_CURLS_RF.pkl',
  'bicep_curls': 'CONCENTRATION_CURLS_RF.pkl', // Fallback  
  
  'overhead_extensions': 'OVERHEAD_EXTENSIONS_RF.pkl',
  'overhead_extension': 'OVERHEAD_EXTENSIONS_RF.pkl', 
  'overhead_triceps_extension': 'OVERHEAD_EXTENSIONS_RF.pkl',
  'Overhead Triceps Extension': 'OVERHEAD_EXTENSIONS_RF.pkl',
  
  // Barbell exercises (models training - will work when PKL added)
  'bench_press': 'BENCH_PRESS_RF.pkl',
  'Bench Press': 'BENCH_PRESS_RF.pkl',
  'flat_bench_barbell_press': 'BENCH_PRESS_RF.pkl',
  'Flat Bench Barbell Press': 'BENCH_PRESS_RF.pkl',
  
  'back_squats': 'BACK_SQUATS_RF.pkl',
  'back_squat': 'BACK_SQUATS_RF.pkl',
  'Back Squats': 'BACK_SQUATS_RF.pkl',
  'Back Squat': 'BACK_SQUATS_RF.pkl',
  
  // Weight Stack exercises
  'lateral_pulldown': 'LATERAL_PULLDOWN_RF.pkl',
  'lateral pulldown': 'LATERAL_PULLDOWN_RF.pkl',
  'Lateral Pulldown': 'LATERAL_PULLDOWN_RF.pkl',
  
  'leg_extension': 'LEG_EXTENSION_RF.pkl',
  'seated_leg_extension': 'LEG_EXTENSION_RF.pkl',
  'Seated Leg Extension': 'LEG_EXTENSION_RF.pkl',
  'Leg Extension': 'LEG_EXTENSION_RF.pkl',
};

// Quality labels by exercise type
// Dumbbell: Clean, Uncontrolled Movement, Abrupt Initiation
// Barbell: Clean, Uncontrolled Movement, Inclination Asymmetry  
// Weight Stack: Clean, Pulling Too Fast, Releasing Too Fast
export const QUALITY_LABELS_BY_EXERCISE = {
  // Dumbbell exercises
  'concentration_curls': ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  'overhead_extensions': ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  'bicep_curls': ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  
  // Barbell exercises
  'bench_press': ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
  'back_squats': ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
  
  // Weight Stack exercises
  'lateral_pulldown': ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
  'leg_extension': ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
};

// Default quality labels
export const DEFAULT_QUALITY_LABELS = ['Clean', 'Poor Form', 'Bad Form'];

/**
 * Normalize exercise name to snake_case
 */
export function normalizeExerciseName(exercise) {
  if (!exercise) return null;
  return exercise.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Get quality labels for an exercise
 */
export function getQualityLabels(exercise) {
  const normalized = normalizeExerciseName(exercise);
  if (!normalized) return DEFAULT_QUALITY_LABELS;
  
  // Direct match
  if (QUALITY_LABELS_BY_EXERCISE[normalized]) {
    return QUALITY_LABELS_BY_EXERCISE[normalized];
  }
  
  // Partial match
  for (const [key, labels] of Object.entries(QUALITY_LABELS_BY_EXERCISE)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return labels;
    }
  }
  
  return DEFAULT_QUALITY_LABELS;
}

/**
 * Check if model exists for exercise
 */
export function hasModel(exercise) {
  const normalized = normalizeExerciseName(exercise);
  if (!normalized) return false;
  
  for (const [key, modelFile] of Object.entries(EXERCISE_MODEL_MAP)) {
    const normalizedKey = normalizeExerciseName(key);
    if (normalizedKey === normalized || normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
      return modelFile !== null;
    }
  }
  
  return false;
}

/**
 * Get model filename for an exercise
 */
export function getModelFilename(exercise) {
  const normalized = normalizeExerciseName(exercise);
  if (!normalized) return null;
  
  for (const [key, modelFile] of Object.entries(EXERCISE_MODEL_MAP)) {
    const normalizedKey = normalizeExerciseName(key);
    if (normalizedKey === normalized || normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
      return modelFile;
    }
  }
  
  return null;
}

// Helper functions
const mean = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const std = (arr) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / arr.length);
};
const percentile = (arr, p) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + (sorted[upper] || sorted[lower]) * weight;
};

/**
 * Extract ML features from a single rep's sample data
 * Matches the format expected by trained models
 */
export function extractMLFeatures(repData) {
  const samples = repData.samples || repData;
  
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return null;
  }
  
  const features = {};
  
  // Signal columns to compute features from
  const signalColumns = ['filteredMag', 'filteredX', 'filteredY', 'filteredZ',
                         'accelMag', 'accelX', 'accelY', 'accelZ',
                         'gyroMag', 'gyroX', 'gyroY', 'gyroZ'];
  
  // Duration features
  const timestamps = samples.map(s => s.timestamp_ms || s.timestamp || 0);
  features['rep_duration_ms'] = timestamps.length > 0 ? timestamps[timestamps.length - 1] - timestamps[0] : 0;
  features['sample_count'] = samples.length;
  if (timestamps.length > 1) {
    const diffs = timestamps.slice(1).map((t, i) => t - timestamps[i]).filter(d => d > 0);
    features['avg_sample_rate'] = diffs.length > 0 ? 1000 / mean(diffs) : 0;
  } else {
    features['avg_sample_rate'] = 0;
  }
  
  // Compute features for each signal column
  for (const col of signalColumns) {
    const signal = samples.map(s => s[col]).filter(v => v !== undefined && v !== null && !isNaN(v));
    
    if (signal.length === 0) {
      // Set all features for this column to 0
      features[`${col}_mean`] = 0;
      features[`${col}_std`] = 0;
      features[`${col}_min`] = 0;
      features[`${col}_max`] = 0;
      features[`${col}_range`] = 0;
      features[`${col}_median`] = 0;
      features[`${col}_p25`] = 0;
      features[`${col}_p75`] = 0;
      features[`${col}_iqr`] = 0;
      features[`${col}_skew`] = 0;
      features[`${col}_kurtosis`] = 0;
      features[`${col}_energy`] = 0;
      features[`${col}_rms`] = 0;
      features[`${col}_diff_mean`] = 0;
      features[`${col}_diff_std`] = 0;
      features[`${col}_diff_max`] = 0;
      features[`${col}_peak_position`] = 0;
      features[`${col}_peak_value`] = 0;
      continue;
    }
    
    // Basic statistics
    features[`${col}_mean`] = mean(signal);
    features[`${col}_std`] = std(signal);
    features[`${col}_min`] = Math.min(...signal);
    features[`${col}_max`] = Math.max(...signal);
    features[`${col}_range`] = Math.max(...signal) - Math.min(...signal);
    features[`${col}_median`] = percentile(signal, 50);
    
    // Percentiles
    features[`${col}_p25`] = percentile(signal, 25);
    features[`${col}_p75`] = percentile(signal, 75);
    features[`${col}_iqr`] = features[`${col}_p75`] - features[`${col}_p25`];
    
    // Shape statistics (skewness and kurtosis)
    const m = mean(signal);
    const s = std(signal);
    if (s > 0 && signal.length > 2) {
      const skew = signal.reduce((sum, v) => sum + Math.pow((v - m) / s, 3), 0) / signal.length;
      const kurt = signal.reduce((sum, v) => sum + Math.pow((v - m) / s, 4), 0) / signal.length - 3;
      features[`${col}_skew`] = isFinite(skew) ? skew : 0;
      features[`${col}_kurtosis`] = isFinite(kurt) ? kurt : 0;
    } else {
      features[`${col}_skew`] = 0;
      features[`${col}_kurtosis`] = 0;
    }
    
    // Energy and power
    features[`${col}_energy`] = signal.reduce((sum, v) => sum + v * v, 0);
    features[`${col}_rms`] = Math.sqrt(features[`${col}_energy`] / signal.length);
    
    // Rate of change (first derivative stats)
    if (signal.length > 1) {
      const diff = signal.slice(1).map((v, i) => v - signal[i]);
      features[`${col}_diff_mean`] = mean(diff);
      features[`${col}_diff_std`] = std(diff);
      features[`${col}_diff_max`] = Math.max(...diff.map(Math.abs));
    } else {
      features[`${col}_diff_mean`] = 0;
      features[`${col}_diff_std`] = 0;
      features[`${col}_diff_max`] = 0;
    }
    
    // Peak-related features
    const peakIdx = signal.indexOf(Math.max(...signal));
    features[`${col}_peak_position`] = signal.length > 0 ? peakIdx / signal.length : 0;
    features[`${col}_peak_value`] = signal[peakIdx] || 0;
  }
  
  return features;
}

/**
 * Rule-based classification when no ML model available
 */
export function classifyWithRules(features, exercise) {
  const qualityLabels = getQualityLabels(exercise);
  
  // Default to Clean with moderate confidence
  let prediction = 0;
  let confidence = 0.75;
  let probabilities = [0.75, 0.15, 0.10];
  
  if (!features) {
    return {
      prediction,
      label: qualityLabels[prediction],
      confidence: 0.5,
      probabilities: qualityLabels.map((l, i) => ({ 
        class: i, 
        label: l, 
        probability: i === 0 ? 0.5 : 0.25 
      })),
      method: 'no_features'
    };
  }
  
  // Extract key metrics for rule-based classification
  const accelRange = features['accelMag_range'] || features['filteredMag_range'] || 0;
  const gyroStd = features['gyroMag_std'] || features['gyroX_std'] || features['gyroY_std'] || 0;
  const gyroMax = features['gyroMag_max'] || features['gyroX_max'] || 0;
  const diffMax = features['accelMag_diff_max'] || features['filteredMag_diff_max'] || 0;
  const rms = features['accelMag_rms'] || features['filteredMag_rms'] || 0;
  const peakPos = features['accelMag_peak_position'] || features['filteredMag_peak_position'] || 0.5;
  
  // Normalized exercise type for specific rules
  const normalized = normalizeExerciseName(exercise);
  
  // Weight stack exercises (Lateral Pulldown, Seated Leg Extension)
  if (normalized && (normalized.includes('pulldown') || normalized.includes('leg_extension'))) {
    // Check for "Pulling Too Fast" (high gyro at start)
    if (gyroMax > 4 && peakPos < 0.3) {
      prediction = 1;
      confidence = 0.70;
      probabilities = [0.20, 0.70, 0.10];
    }
    // Check for "Releasing Too Fast" (high gyro at end)
    else if (gyroMax > 3.5 && peakPos > 0.7) {
      prediction = 2;
      confidence = 0.65;
      probabilities = [0.20, 0.15, 0.65];
    }
  }
  // Barbell exercises (Bench Press, Back Squat)
  else if (normalized && (normalized.includes('bench') || normalized.includes('squat'))) {
    // Check for "Uncontrolled Movement" (high variability)
    if (gyroStd > 2.0 || accelRange > 12) {
      prediction = 1;
      confidence = 0.68;
      probabilities = [0.22, 0.68, 0.10];
    }
    // Check for "Inclination Asymmetry" (uneven acceleration pattern)
    else if (Math.abs(features['accelX_mean'] - features['accelZ_mean']) > 3) {
      prediction = 2;
      confidence = 0.60;
      probabilities = [0.25, 0.15, 0.60];
    }
  }
  // Dumbbell exercises (Concentration Curls, Overhead Extension)
  else {
    // Check for "Uncontrolled Movement" (high variability)
    if (gyroStd > 2.5 || accelRange > 15) {
      prediction = 1;
      confidence = 0.70;
      probabilities = [0.20, 0.70, 0.10];
    }
    // Check for "Abrupt Initiation" (high rate of change at start)
    else if (diffMax > 10 && peakPos < 0.25) {
      prediction = 2;
      confidence = 0.65;
      probabilities = [0.20, 0.15, 0.65];
    }
  }
  
  return {
    prediction,
    label: qualityLabels[prediction],
    confidence,
    probabilities: qualityLabels.map((l, i) => ({ 
      class: i, 
      label: l, 
      probability: probabilities[i] || 0 
    })),
    method: 'rule_based'
  };
}

/**
 * Classify reps using the classification API
 * @param {string} exercise - Exercise name
 * @param {Array} reps - Array of rep data with samples
 * @param {string} authToken - Auth token for API call
 * @returns {Promise<Object>} Classification results
 */
export async function classifyReps(exercise, reps, authToken) {
  try {
    const response = await fetch('/api/classify-rep', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        exercise,
        reps
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Log detailed warning to console
      console.warn('==========================================');
      console.warn('[ClassificationService] ML CLASSIFICATION FAILED');
      console.warn('==========================================');
      console.warn(`  Exercise: ${exercise}`);
      console.warn(`  Status: ${response.status} ${response.statusText}`);
      console.warn(`  Error: ${errorData.error || 'Unknown'}`);
      console.warn(`  Details: ${errorData.details || 'N/A'}`);
      console.warn(`  API URL: ${errorData.apiUrl || 'N/A'}`);
      if (errorData.hint) console.warn(`  Hint: ${errorData.hint}`);
      console.warn('==========================================');
      
      // Return error info so UI can display a warning
      return {
        exercise,
        modelAvailable: false,
        classifications: [],
        error: errorData.error || `Classification failed: ${response.status}`,
        details: errorData.details,
        hint: errorData.hint,
        apiUrl: errorData.apiUrl
      };
    }
    
    return await response.json();
  } catch (error) {
    console.error('==========================================');
    console.error('[ClassificationService] NETWORK ERROR');
    console.error('==========================================');
    console.error(`  Exercise: ${exercise}`);
    console.error(`  Error: ${error.message}`);
    console.error('  Could not reach /api/classify-rep endpoint');
    console.error('==========================================');
    
    return {
      exercise,
      modelAvailable: false,
      classifications: [],
      error: error.message
    };
  }
}

export default {
  EXERCISE_MODEL_MAP,
  QUALITY_LABELS_BY_EXERCISE,
  normalizeExerciseName,
  getQualityLabels,
  hasModel,
  getModelFilename,
  extractMLFeatures,
  classifyWithRules,
  classifyReps
};
