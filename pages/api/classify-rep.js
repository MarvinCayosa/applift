/**
 * Rep Classification API Route
 * 
 * Classifies individual reps using ML models via Cloud Run.
 * Returns clear errors if Cloud Run is unavailable (no silent fallback).
 * 
 * Endpoints:
 * - POST /api/classify-rep - Classify rep(s) for a given exercise
 */

// Cloud Run ML API URL (set after deployment)
const ML_API_URL = process.env.NEXT_PUBLIC_ML_API_URL || process.env.ML_API_URL || 'http://localhost:8080';

// Exercise name to Cloud Run model type mapping
// Just add the PKL file to cloud-run-ml-api/models/ and the mapping here
const EXERCISE_TO_MODEL_TYPE = {
  // Dumbbell exercises
  'concentration_curls': 'CONCENTRATION_CURLS',
  'concentration curls': 'CONCENTRATION_CURLS',
  'Concentration Curls': 'CONCENTRATION_CURLS',
  'bicep_curls': 'CONCENTRATION_CURLS', // Fallback to concentration curls
  
  'overhead_extensions': 'OVERHEAD_EXTENSIONS',
  'overhead_extension': 'OVERHEAD_EXTENSIONS', 
  'overhead triceps extension': 'OVERHEAD_EXTENSIONS',
  'Overhead Triceps Extension': 'OVERHEAD_EXTENSIONS',
  'overhead_triceps_extension': 'OVERHEAD_EXTENSIONS',
  
  // Barbell exercises (models coming soon)
  'bench_press': 'BENCH_PRESS',
  'Bench Press': 'BENCH_PRESS',
  'flat_bench_barbell_press': 'BENCH_PRESS',
  'Flat Bench Barbell Press': 'BENCH_PRESS',
  
  'back_squats': 'BACK_SQUATS',
  'back_squat': 'BACK_SQUATS',
  'Back Squats': 'BACK_SQUATS',
  'Back Squat': 'BACK_SQUATS',
  
  // Weight Stack exercises
  'lateral_pulldown': 'LATERAL_PULLDOWN',
  'lateral pulldown': 'LATERAL_PULLDOWN',
  'Lateral Pulldown': 'LATERAL_PULLDOWN',
  
  'leg_extension': 'LEG_EXTENSION',
  'seated_leg_extension': 'LEG_EXTENSION',
  'Seated Leg Extension': 'LEG_EXTENSION',
  'Leg Extension': 'LEG_EXTENSION',
};

// Quality labels by exercise type
// Dumbbell: Clean, Uncontrolled Movement, Abrupt Initiation
// Barbell: Clean, Uncontrolled Movement, Inclination Asymmetry  
// Weight Stack: Clean, Pulling Too Fast, Releasing Too Fast
const QUALITY_LABELS = {
  // Dumbbell exercises
  'concentration_curls': ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  'overhead_extensions': ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  
  // Barbell exercises
  'bench_press': ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
  'back_squats': ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
  
  // Weight Stack exercises
  'lateral_pulldown': ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
  'leg_extension': ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
};

// Normalize exercise name
function normalizeExerciseName(exercise) {
  if (!exercise) return null;
  return exercise.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Get model type for Cloud Run API
function getModelType(exercise) {
  const normalized = normalizeExerciseName(exercise);
  if (!normalized) return null;
  
  // Direct lookup
  for (const [key, modelType] of Object.entries(EXERCISE_TO_MODEL_TYPE)) {
    const normalizedKey = normalizeExerciseName(key);
    if (normalizedKey === normalized || normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
      return modelType;
    }
  }
  return null;
}

// Get quality labels for an exercise
function getQualityLabels(exercise) {
  const normalized = normalizeExerciseName(exercise);
  if (!normalized) return ['Clean', 'Poor Form', 'Bad Form'];
  
  for (const [key, labels] of Object.entries(QUALITY_LABELS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return labels;
    }
  }
  
  return ['Clean', 'Poor Form', 'Bad Form'];
}

// Helper functions for feature extraction
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

// Extract features from rep data (matching Python feature extraction)
function extractFeatures(repData) {
  const samples = repData.samples || repData;
  
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return null;
  }
  
  const features = {};
  
  // Signal columns to compute features from
  const signalColumns = ['filteredMag', 'filteredX', 'filteredY', 'filteredZ',
                         'accelMag', 'accelX', 'accelY', 'accelZ',
                         'gyroX', 'gyroY', 'gyroZ'];
  
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
    
    const m = mean(signal);
    const s = std(signal);
    const minVal = Math.min(...signal);
    const maxVal = Math.max(...signal);
    const n = signal.length;
    
    features[`${col}_mean`] = m;
    features[`${col}_std`] = s;
    features[`${col}_min`] = minVal;
    features[`${col}_max`] = maxVal;
    features[`${col}_range`] = maxVal - minVal;
    features[`${col}_median`] = percentile(signal, 50);
    features[`${col}_p25`] = percentile(signal, 25);
    features[`${col}_p75`] = percentile(signal, 75);
    features[`${col}_iqr`] = features[`${col}_p75`] - features[`${col}_p25`];
    
    // Skewness
    if (s > 0) {
      features[`${col}_skew`] = signal.reduce((sum, v) => sum + Math.pow((v - m) / s, 3), 0) / n;
    } else {
      features[`${col}_skew`] = 0;
    }
    
    // Kurtosis
    if (s > 0) {
      features[`${col}_kurtosis`] = signal.reduce((sum, v) => sum + Math.pow((v - m) / s, 4), 0) / n - 3;
    } else {
      features[`${col}_kurtosis`] = 0;
    }
    
    // Energy and RMS
    features[`${col}_energy`] = signal.reduce((sum, v) => sum + v * v, 0);
    features[`${col}_rms`] = Math.sqrt(features[`${col}_energy`] / n);
    
    // Difference features
    const diffs = signal.slice(1).map((v, i) => v - signal[i]);
    features[`${col}_diff_mean`] = mean(diffs);
    features[`${col}_diff_std`] = std(diffs);
    features[`${col}_diff_max`] = diffs.length > 0 ? Math.max(...diffs.map(Math.abs)) : 0;
    
    // Peak features
    const peakIdx = signal.indexOf(maxVal);
    features[`${col}_peak_position`] = n > 0 ? peakIdx / n : 0;
    features[`${col}_peak_value`] = maxVal;
  }
  
  return features;
}

// Rule-based classification fallback
function classifyWithRules(features, exercise) {
  const qualityLabels = getQualityLabels(exercise);
  
  if (!features) {
    return {
      prediction: 0,
      label: qualityLabels[0],
      confidence: 0.5,
      probabilities: qualityLabels.map((l, i) => ({ 
        class: i, 
        label: l, 
        probability: i === 0 ? 0.5 : 0.25 
      })),
      method: 'rule_based'
    };
  }
  
  // Simple rule-based heuristics
  let prediction = 0;
  let confidence = 0.7;
  let probabilities = [0.7, 0.2, 0.1];
  
  const duration = features['rep_duration_ms'] || 0;
  const accelMagStd = features['accelMag_std'] || 0;
  const gyroYStd = features['gyroY_std'] || 0;
  
  // Too fast rep
  if (duration < 800) {
    prediction = 1;
    confidence = 0.65;
    probabilities = [0.20, 0.65, 0.15];
  }
  // High acceleration variance = uncontrolled
  else if (accelMagStd > 3.0) {
    prediction = 1;
    confidence = 0.60;
    probabilities = [0.25, 0.60, 0.15];
  }
  // High gyro variance = abrupt
  else if (gyroYStd > 100) {
    prediction = 2;
    confidence = 0.60;
    probabilities = [0.25, 0.15, 0.60];
  }
  // Good form
  else {
    prediction = 0;
    confidence = 0.75;
    probabilities = [0.75, 0.15, 0.10];
  }
  
  return {
    prediction,
    label: qualityLabels[prediction],
    confidence,
    probabilities: probabilities.map((p, i) => ({ 
      class: i, 
      label: qualityLabels[i], 
      probability: p 
    })),
    method: 'rule_based'
  };
}

// Warm up Cloud Run (trigger cold start without waiting for full classify)
async function warmUpCloudRun() {
  try {
    await fetch(`${ML_API_URL}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    console.log('[Classify API] Cloud Run warm-up ping successful');
  } catch (e) {
    // Warm-up failures are expected during cold start, ignore
    console.log('[Classify API] Cloud Run warm-up ping sent (cold start may be in progress)');
  }
}

// Call Cloud Run ML API with retry logic for cold starts
async function classifyWithCloudRun(modelType, features, retries = 2) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Classify API] Attempt ${attempt}/${retries} - calling ${ML_API_URL}/classify`);
      
      const response = await fetch(`${ML_API_URL}/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exercise_type: modelType,
          features: features
        }),
        // 25s timeout (Vercel maxDuration is 30s)
        signal: AbortSignal.timeout(25000)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle FastAPI validation errors (detail is an array) and regular errors (detail is a string)
        let errorMessage;
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          // Pydantic validation errors: [{loc: [...], msg: "...", type: "..."}]
          errorMessage = errorData.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join('; ');
        } else if (errorData.detail) {
          errorMessage = JSON.stringify(errorData.detail);
        } else {
          errorMessage = `Cloud Run API error: ${response.status}`;
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      if (attempt > 1) {
        console.log(`[Classify API] Succeeded on attempt ${attempt} (cold start recovered)`);
      }
      return result;
      
    } catch (error) {
      lastError = error;
      console.warn(`[Classify API] Attempt ${attempt}/${retries} failed: ${error.name}: ${error.message}`);
      
      // If we have retries left and it's a timeout/network error, wait and retry
      if (attempt < retries && (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED'))) {
        console.log(`[Classify API] Waiting 2s before retry (Cloud Run may be cold starting)...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// Main API handler
export default async function handler(req, res) {
  // Set cache control headers to prevent caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { exercise, reps, features: precomputedFeatures } = req.body;
    
    console.log(`[Classify API] Request received for exercise: ${exercise}, reps: ${reps?.length || 0}`);
    
    if (!exercise) {
      return res.status(400).json({ error: 'exercise is required' });
    }
    
    if (!reps && !precomputedFeatures) {
      return res.status(400).json({ error: 'reps or features array is required' });
    }
    
    const modelType = getModelType(exercise);
    const qualityLabels = getQualityLabels(exercise);
    
    // Extract features if raw rep data provided
    let allFeatures = [];
    if (reps && Array.isArray(reps)) {
      for (let i = 0; i < reps.length; i++) {
        try {
          const feat = extractFeatures(reps[i]);
          allFeatures.push(feat);
        } catch (extractError) {
          console.error(`[Classify API] Feature extraction failed for rep ${i}:`, extractError.message);
          allFeatures.push(null);
        }
      }
    } else if (precomputedFeatures) {
      allFeatures = precomputedFeatures;
    }
  
  // If no model mapping exists for this exercise
  if (!modelType) {
    console.warn(`[Classify API] WARNING: No model mapping found for exercise "${exercise}". Add it to EXERCISE_TO_MODEL_TYPE in classify-rep.js`);
    return res.status(400).json({
      error: `No ML model available for exercise: ${exercise}`,
      hint: 'Add exercise mapping to EXERCISE_TO_MODEL_TYPE in pages/api/classify-rep.js',
      exercise,
      modelAvailable: false
    });
  }
  
  // Try Cloud Run ML API
  console.log(`[Classify API] Calling Cloud Run for ${exercise} (${modelType}) at ${ML_API_URL}`);
  console.log(`[Classify API] Processing ${allFeatures.length} reps, features extracted: ${allFeatures.filter(f => f !== null).length}`);
  
  // Send a warm-up ping first (helps with cold starts)
  await warmUpCloudRun();
  
  try {
    const classifications = [];
    
    for (let idx = 0; idx < allFeatures.length; idx++) {
      const feat = allFeatures[idx];
      
      if (!feat) {
        console.log(`[Classify API] Rep ${idx}: No features extracted, using fallback`);
        classifications.push({
          repIndex: idx,
          prediction: 0,
          label: qualityLabels[0],
          confidence: 0.5,
          probabilities: qualityLabels.map((l, i) => ({ 
            class: i, 
            label: l, 
            probability: i === 0 ? 0.5 : 0.25 
          })),
          method: 'fallback'
        });
        continue;
      }
      
      console.log(`[Classify API] Rep ${idx}: Calling Cloud Run with ${Object.keys(feat).length} features`);
      const result = await classifyWithCloudRun(modelType, feat);
        
      classifications.push({
        repIndex: idx,
        prediction: result.prediction,
        label: result.class_name || qualityLabels[result.prediction] || `Class ${result.prediction}`,
        confidence: result.confidence,
        probabilities: result.probabilities.map((p, i) => ({
          class: i,
          label: qualityLabels[i] || `Class ${i}`,
          probability: p
        })),
        method: 'ml_model'
      });
    }
    
    return res.status(200).json({
      exercise,
      modelAvailable: true,
      modelType,
      apiUrl: ML_API_URL,
      qualityLabels,
      classifications
    });
    
  } catch (error) {
    // Log full error details to console for debugging
    console.error('============================================');
    console.error('[Classify API] CLOUD RUN CONNECTION FAILED');
    console.error('============================================');
    console.error(`  URL: ${ML_API_URL}/classify`);
    console.error(`  Exercise: ${exercise} (${modelType})`);
    console.error(`  Error Type: ${error.name}`);
    console.error(`  Error Message: ${error.message}`);
    console.error(`  Cause: ${error.cause ? JSON.stringify(error.cause) : 'N/A'}`);
    
    let hint = 'Check NEXT_PUBLIC_ML_API_URL env var and Cloud Run service status';
    if (error.name === 'AbortError' || error.name === 'TimeoutError' || error.message.includes('timeout')) {
      hint = 'Request timed out after 25s - Cloud Run cold start may need more time. Try again (instance should be warm now).';
    } else if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      hint = 'Cloud Run service unreachable. Check URL and deployment status.';
    } else if (error.message.includes('404')) {
      hint = `Model "${modelType}_RF.pkl" not found on Cloud Run. Deploy the PKL file.`;
    }
    console.error(`  Hint: ${hint}`);
    console.error('============================================');
    
    return res.status(503).json({
      error: 'Cloud Run ML API is unavailable',
      details: `${error.name}: ${error.message}`,
      apiUrl: ML_API_URL,
      exercise,
      modelType,
      hint
    });
  }
  } catch (outerError) {
    // Catch any unexpected errors (parsing, feature extraction, etc.)
    console.error('============================================');
    console.error('[Classify API] UNEXPECTED ERROR');
    console.error('============================================');
    console.error(`  Error Type: ${outerError.name}`);
    console.error(`  Error Message: ${outerError.message}`);
    console.error(`  Stack: ${outerError.stack}`);
    console.error('============================================');
    
    return res.status(500).json({
      error: 'Internal server error',
      details: `${outerError.name}: ${outerError.message}`,
      hint: 'Check Vercel function logs for details'
    });
  }
}
