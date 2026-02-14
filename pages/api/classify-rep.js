/**
 * Rep Classification API Route
 * 
 * Classifies individual reps using ML models.
 * Since .pkl models require Python, this endpoint spawns a Python process.
 * 
 * For production, consider:
 * - Converting models to ONNX for JS runtime
 * - Using a separate Python Cloud Function
 * - Pre-computing classifications during workout upload
 * 
 * Endpoints:
 * - POST /api/classify-rep - Classify rep(s) for a given exercise
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Exercise name to model file mapping
const EXERCISE_MODEL_MAP = {
  // Dumbbell exercises
  'concentration_curls': 'CONCENTRATION_CURLS_RF.pkl',
  'concentration curls': 'CONCENTRATION_CURLS_RF.pkl',
  'Concentration Curls': 'CONCENTRATION_CURLS_RF.pkl',
  
  'overhead_extensions': 'OVERHEAD_EXTENSIONS_RF.pkl',
  'overhead_extension': 'OVERHEAD_EXTENSIONS_RF.pkl', 
  'overhead triceps extension': 'OVERHEAD_EXTENSIONS_RF.pkl',
  'Overhead Triceps Extension': 'OVERHEAD_EXTENSIONS_RF.pkl',
  
  // Weight Stack exercises
  'lateral_pulldown': 'LATERAL_PULLDOWN_RF.pkl',
  'lateral pulldown': 'LATERAL_PULLDOWN_RF.pkl',
  'Lateral Pulldown': 'LATERAL_PULLDOWN_RF.pkl',
  
  // Exercises without models yet (will use fallback)
  'seated_leg_extension': null,
  'Seated Leg Extension': null,
  'bench_press': null,
  'Flat Bench Barbell Press': null,
  'back_squat': null,
  'back_squats': null,
  'Back Squats': null,
  'bicep_curls': 'CONCENTRATION_CURLS_RF.pkl', // Use concentration curls as fallback
};

// Quality labels by exercise
const QUALITY_LABELS = {
  // Dumbbell exercises (Concentration Curls, Overhead Extension)
  'concentration_curls': ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  'overhead_extensions': ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
  
  // Barbell exercises (Bench Press, Back Squat)
  'bench_press': ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
  'back_squat': ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
  
  // Weight Stack exercises (Lateral Pulldown, Seated Leg Extension)
  'lateral_pulldown': ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
  'seated_leg_extension': ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
};

// Normalize exercise name
function normalizeExerciseName(exercise) {
  if (!exercise) return null;
  return exercise.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Get quality labels for an exercise
function getQualityLabels(exercise) {
  const normalized = normalizeExerciseName(exercise);
  if (!normalized) return ['Clean', 'Poor Form', 'Bad Form'];
  
  // Find matching quality labels
  for (const [key, labels] of Object.entries(QUALITY_LABELS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return labels;
    }
  }
  
  return ['Clean', 'Poor Form', 'Bad Form'];
}

// Check if model exists for exercise
function getModelPath(exercise) {
  const normalized = normalizeExerciseName(exercise);
  if (!normalized) return null;
  
  // Find matching model
  for (const [key, modelFile] of Object.entries(EXERCISE_MODEL_MAP)) {
    const normalizedKey = normalizeExerciseName(key);
    if (normalizedKey === normalized || normalized.includes(normalizedKey) || normalizedKey.includes(normalized)) {
      if (modelFile) {
        const modelPath = path.join(process.cwd(), 'ml_scripts', 'models', modelFile);
        if (fs.existsSync(modelPath)) {
          return modelPath;
        }
      }
      return null;
    }
  }
  
  return null;
}

// Extract features from rep data (matching Python feature extraction)
function extractFeatures(repData) {
  const { samples } = repData;
  
  if (!samples || samples.length === 0) {
    return null;
  }
  
  const features = {};
  
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
  
  // Signal columns to compute features from
  const signalColumns = ['filteredMag', 'filteredX', 'filteredY', 'filteredZ',
                         'accelMag', 'accelX', 'accelY', 'accelZ',
                         'gyroMag', 'gyroX', 'gyroY', 'gyroZ'];
  
  // Duration features
  const timestamps = samples.map(s => s.timestamp_ms || s.timestamp || 0);
  features['rep_duration_ms'] = timestamps[timestamps.length - 1] - timestamps[0];
  features['sample_count'] = samples.length;
  if (timestamps.length > 1) {
    const diffs = timestamps.slice(1).map((t, i) => t - timestamps[i]);
    features['avg_sample_rate'] = diffs.length > 0 ? 1000 / mean(diffs) : 0;
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
    features[`${col}_peak_position`] = peakIdx / signal.length;
    features[`${col}_peak_value`] = signal[peakIdx];
  }
  
  return features;
}

// Rule-based classification fallback when no model available
function classifyWithRules(features, exercise) {
  const qualityLabels = getQualityLabels(exercise);
  
  // Default to Clean with high confidence
  let prediction = 0;
  let confidence = 0.85;
  let probabilities = [0.85, 0.10, 0.05];
  
  // Simple heuristic rules based on signal characteristics
  const accelRange = features['accelMag_range'] || features['filteredMag_range'] || 0;
  const gyroStd = features['gyroMag_std'] || features['gyroX_std'] || 0;
  const diffMax = features['accelMag_diff_max'] || features['filteredMag_diff_max'] || 0;
  
  // Check for uncontrolled movement (high variability)
  if (gyroStd > 2.5 || accelRange > 15) {
    prediction = 1;
    confidence = 0.70;
    probabilities = [0.20, 0.70, 0.10];
  }
  
  // Check for abrupt initiation (high rate of change at start)
  if (diffMax > 10 && (features['accelMag_peak_position'] || 0) < 0.2) {
    prediction = 2;
    confidence = 0.65;
    probabilities = [0.20, 0.15, 0.65];
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

// Main API handler
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { exercise, reps, features: precomputedFeatures } = req.body;
  
  if (!exercise) {
    return res.status(400).json({ error: 'exercise is required' });
  }
  
  if (!reps && !precomputedFeatures) {
    return res.status(400).json({ error: 'reps or features array is required' });
  }
  
  const modelPath = getModelPath(exercise);
  const qualityLabels = getQualityLabels(exercise);
  
  // Extract features if raw rep data provided
  let allFeatures = [];
  if (reps && Array.isArray(reps)) {
    for (const rep of reps) {
      const feat = extractFeatures(rep);
      allFeatures.push(feat);
    }
  } else if (precomputedFeatures) {
    allFeatures = precomputedFeatures;
  }
  
  // If no model available, use rule-based classification
  if (!modelPath) {
    console.log(`[Classify API] No model for ${exercise}, using rule-based classification`);
    
    const results = allFeatures.map((feat, idx) => {
      if (!feat) {
        return {
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
        };
      }
      return {
        repIndex: idx,
        ...classifyWithRules(feat, exercise)
      };
    });
    
    return res.status(200).json({
      exercise,
      modelAvailable: false,
      qualityLabels,
      classifications: results
    });
  }
  
  // Model available - use Python classification
  console.log(`[Classify API] Using model: ${modelPath}`);
  
  try {
    // Create Python classification script inline
    const pythonScript = `
import sys
import json
import joblib
import numpy as np

def classify(model_path, features_json):
    # Load model
    model_package = joblib.load(model_path)
    model = model_package['model']
    scaler = model_package['scaler']
    feature_names = model_package['feature_names']
    
    features_list = json.loads(features_json)
    results = []
    
    for feat in features_list:
        if feat is None:
            results.append({
                'prediction': 0,
                'confidence': 0.5,
                'probabilities': [0.5, 0.25, 0.25]
            })
            continue
        
        # Build feature vector
        X = np.array([[feat.get(fn, 0) for fn in feature_names]])
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Scale and predict
        X_scaled = scaler.transform(X)
        pred = model.predict(X_scaled)[0]
        proba = model.predict_proba(X_scaled)[0]
        
        results.append({
            'prediction': int(pred),
            'confidence': float(proba[int(pred)]),
            'probabilities': [float(p) for p in proba]
        })
    
    print(json.dumps(results))

if __name__ == '__main__':
    model_path = sys.argv[1]
    features_json = sys.argv[2]
    classify(model_path, features_json)
`;

    // Write temp script
    const tempScriptPath = path.join(process.cwd(), 'temp_classify.py');
    fs.writeFileSync(tempScriptPath, pythonScript);
    
    // Run Python classification
    const featuresJson = JSON.stringify(allFeatures);
    
    const result = await new Promise((resolve, reject) => {
      const python = spawn('python', [tempScriptPath, modelPath, featuresJson]);
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => { stdout += data.toString(); });
      python.stderr.on('data', (data) => { stderr += data.toString(); });
      
      python.on('close', (code) => {
        // Clean up temp script
        try { fs.unlinkSync(tempScriptPath); } catch (e) {}
        
        if (code !== 0) {
          reject(new Error(stderr || `Python exited with code ${code}`));
        } else {
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch (e) {
            reject(new Error(`Failed to parse Python output: ${stdout}`));
          }
        }
      });
      
      python.on('error', (err) => {
        try { fs.unlinkSync(tempScriptPath); } catch (e) {}
        reject(err);
      });
    });
    
    // Format results
    const classifications = result.map((r, idx) => ({
      repIndex: idx,
      prediction: r.prediction,
      label: qualityLabels[r.prediction] || `Class ${r.prediction}`,
      confidence: r.confidence,
      probabilities: r.probabilities.map((p, i) => ({
        class: i,
        label: qualityLabels[i] || `Class ${i}`,
        probability: p
      })),
      method: 'ml_model'
    }));
    
    return res.status(200).json({
      exercise,
      modelAvailable: true,
      modelPath: path.basename(modelPath),
      qualityLabels,
      classifications
    });
    
  } catch (error) {
    console.error('[Classify API] Python classification failed:', error);
    
    // Fall back to rule-based
    const results = allFeatures.map((feat, idx) => {
      if (!feat) {
        return {
          repIndex: idx,
          prediction: 0,
          label: qualityLabels[0],
          confidence: 0.5,
          probabilities: qualityLabels.map((l, i) => ({ 
            class: i, 
            label: l, 
            probability: i === 0 ? 0.5 : 0.25 
          })),
          method: 'fallback_error'
        };
      }
      return {
        repIndex: idx,
        ...classifyWithRules(feat, exercise),
        method: 'rule_based_fallback'
      };
    });
    
    return res.status(200).json({
      exercise,
      modelAvailable: true,
      modelError: error.message,
      qualityLabels,
      classifications: results
    });
  }
}
