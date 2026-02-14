/**
 * Workout Analysis API Route
 * 
 * Analyzes workout data from GCS and stores results in Firestore.
 * 
 * Endpoints:
 * - POST /api/analyze-workout - Analyze a workout by workoutId/gcsPath
 * - GET /api/analyze-workout?workoutId=xxx - Get existing analysis
 * 
 * Flow:
 * 1. Fetch workout_data.json from GCS
 * 2. Run comprehensive analysis (fatigue, consistency, smoothness, ROM)
 * 3. Store results in Firestore: userWorkouts/{userId}/{equipment}/{exercise}/analytics/{workoutId}
 * 4. Return analysis results
 */

import { Storage } from '@google-cloud/storage';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { 
  extractMLFeatures, 
  classifyWithRules, 
  getQualityLabels, 
  hasModel,
  getModelFilename,
  normalizeExerciseName 
} from '../../services/mlClassificationService';
import { resegmentWorkout } from '../../services/repResegmentation';
import { spawn } from 'child_process';
import path from 'path';

export const config = {
  api: {
    bodyParser: true,
  },
};

// Lazy initialization
let firebaseInitialized = false;
let firebaseInitError = null;
let storage = null;
let storageInitError = null;

function initFirebase() {
  if (firebaseInitialized || firebaseInitError) return;
  
  try {
    if (!getApps().length) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
        throw new Error('Missing Firebase environment variables');
      }
      
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    }
    firebaseInitialized = true;
    console.log('[Analyze API] Firebase initialized');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    firebaseInitError = error;
  }
}

function initGCS() {
  if (storage || storageInitError) return;
  
  try {
    const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!process.env.GCS_PROJECT_ID || !process.env.GCS_CLIENT_EMAIL || !privateKey) {
      throw new Error('Missing GCS environment variables');
    }
    
    storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });
    console.log('[Analyze API] GCS initialized');
  } catch (error) {
    console.error('GCS initialization error:', error);
    storageInitError = error;
  }
}

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'applift-imu-data';

/**
 * Verify Firebase ID token
 */
async function verifyAuthToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Fetch workout data JSON from GCS
 */
async function fetchWorkoutData(gcsPath) {
  try {
    // Remove bucket prefix if present
    let filePath = gcsPath;
    if (filePath.startsWith(`gs://${BUCKET_NAME}/`)) {
      filePath = filePath.replace(`gs://${BUCKET_NAME}/`, '');
    }
    
    // Ensure we're fetching the workout_data.json file
    if (!filePath.endsWith('/workout_data.json') && !filePath.endsWith('.json')) {
      filePath = `${filePath}/workout_data.json`;
    }
    
    console.log('[Analyze API] Fetching from GCS:', filePath);
    
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    const [content] = await file.download();
    const workoutData = JSON.parse(content.toString('utf8'));
    
    console.log('[Analyze API] Successfully fetched workout data');
    return workoutData;
  } catch (error) {
    console.error('[Analyze API] Error fetching workout data:', error);
    throw error;
  }
}

/**
 * Store analysis results in Firestore
 * Structure: userWorkouts/{userId}/{equipment}/{exercise}/analytics/{workoutId}
 * Note: equipment and exercise are normalized to lowercase with hyphens for consistency with logs
 */
async function storeAnalysis(analysis) {
  try {
    const db = getFirestore();
    
    // Validate required fields
    if (!analysis.userId || !analysis.equipment || !analysis.exercise || !analysis.workoutId) {
      throw new Error('Missing required fields: userId, equipment, exercise, or workoutId');
    }
    
    // Normalize equipment and exercise to match logs collection naming convention
    // Convert to lowercase and replace spaces/underscores with hyphens
    const normalizedEquipment = analysis.equipment.toLowerCase().replace(/[\s_]+/g, '-');
    const normalizedExercise = analysis.exercise.toLowerCase().replace(/[\s_]+/g, '-');
    
    // Use nested structure matching userWorkouts - same path as logs
    const docRef = db
      .collection('userWorkouts')
      .doc(analysis.userId)
      .collection(normalizedEquipment)
      .doc(normalizedExercise)
      .collection('analytics')
      .doc(analysis.workoutId);
    
    await docRef.set({
      ...analysis,
      // Store original values for reference
      equipmentOriginal: analysis.equipment,
      exerciseOriginal: analysis.exercise,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`[Analyze API] Stored analysis: userWorkouts/${analysis.userId}/${normalizedEquipment}/${normalizedExercise}/analytics/${analysis.workoutId}`);
    return true;
  } catch (error) {
    console.error('[Analyze API] Error storing analysis:', error);
    throw error;
  }
}

/**
 * Get existing analysis from Firestore
 * Structure: userWorkouts/{userId}/{equipment}/{exercise}/analytics/{workoutId}
 */
async function getAnalysis(workoutId, userId, equipment, exercise) {
  try {
    const db = getFirestore();
    
    // Validate required parameters
    if (!userId || !equipment || !exercise || !workoutId) {
      console.warn('[Analyze API] Missing parameters for getAnalysis:', { workoutId, userId, equipment, exercise });
      return null;
    }
    
    // Normalize equipment and exercise to match stored naming convention
    const normalizedEquipment = equipment.toLowerCase().replace(/[\s_]+/g, '-');
    const normalizedExercise = exercise.toLowerCase().replace(/[\s_]+/g, '-');
    
    const docRef = db
      .collection('userWorkouts')
      .doc(userId)
      .collection(normalizedEquipment)
      .doc(normalizedExercise)
      .collection('analytics')
      .doc(workoutId);
      
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return null;
    }
    
    return doc.data();
  } catch (error) {
    console.error('[Analyze API] Error getting analysis:', error);
    throw error;
  }
}

// ============================================================================
// ANALYSIS FUNCTIONS (Server-side implementation)
// These mirror the client-side workoutAnalysisService.js
// ============================================================================

// ============================================================================
// ML CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Classify a single rep using ML model or rule-based fallback
 * @param {Object} repData - Rep data with samples
 * @param {string} exercise - Exercise name
 * @returns {Promise<Object>} Classification result
 */
async function classifyRep(repData, exercise) {
  const features = extractMLFeatures(repData.samples || repData);
  
  if (!features) {
    return {
      prediction: 0,
      label: 'Clean',
      confidence: 0.5,
      method: 'no_features',
      modelUsed: false
    };
  }
  
  // Check if ML model exists for this exercise
  const modelFile = getModelFilename(exercise);
  const qualityLabels = getQualityLabels(exercise);
  
  if (!modelFile) {
    // Use rule-based fallback
    const result = classifyWithRules(features, exercise);
    return {
      ...result,
      modelUsed: false,
      qualityLabels
    };
  }
  
  // Try to use ML model via Python subprocess
  try {
    const modelPath = path.join(process.cwd(), 'ml_scripts', 'models', modelFile);
    const classifyScriptPath = path.join(process.cwd(), 'ml_scripts', 'classify_single_rep.py');
    
    // Check if Python script exists, if not use rules
    const fs = await import('fs').then(m => m.promises);
    try {
      await fs.access(classifyScriptPath);
    } catch {
      console.log(`[ML Classification] Python script not found, using rules for ${exercise}`);
      const result = classifyWithRules(features, exercise);
      return { ...result, modelUsed: false, qualityLabels };
    }
    
    // Find the correct Python executable (prefer venv)
    const venvPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const venvPythonUnix = path.join(process.cwd(), '.venv', 'bin', 'python');
    let pythonCmd = 'python';
    try {
      await fs.access(venvPython);
      pythonCmd = venvPython;
    } catch {
      try {
        await fs.access(venvPythonUnix);
        pythonCmd = venvPythonUnix;
      } catch {
        // Fall back to system python
      }
    }
    console.log(`[ML Classification] Using Python: ${pythonCmd}`);

    // Spawn Python process for ML classification
    const mlResult = await new Promise((resolve, reject) => {
      const python = spawn(pythonCmd, [
        classifyScriptPath,
        modelPath,
        JSON.stringify(features)
      ], {
        timeout: 10000 // 10 second timeout
      });
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const result = JSON.parse(stdout.trim());
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse ML output: ${stdout}`));
          }
        } else {
          console.error(`[ML Classification] Python stderr: ${stderr}`);
          reject(new Error(`Python process failed (code ${code}): ${stderr}`));
        }
      });
      
      python.on('error', (err) => {
        reject(err);
      });
    });
    
    return {
      prediction: mlResult.prediction || 0,
      label: qualityLabels[mlResult.prediction] || 'Clean',
      confidence: mlResult.confidence || mlResult.probability || 0.8,
      probabilities: mlResult.probabilities || qualityLabels.map((l, i) => ({
        class: i,
        label: l,
        probability: i === mlResult.prediction ? (mlResult.confidence || 0.8) : (1 - (mlResult.confidence || 0.8)) / (qualityLabels.length - 1)
      })),
      method: 'ml_model',
      modelUsed: true,
      modelFile,
      qualityLabels
    };
  } catch (error) {
    console.error(`[ML Classification] Error using ML model for ${exercise}:`, error.message);
    // Fall back to rule-based
    const result = classifyWithRules(features, exercise);
    return {
      ...result,
      modelUsed: false,
      mlError: error.message,
      qualityLabels
    };
  }
}

/**
 * Classify all reps in a workout
 * Skips reps that already have classification from background ML
 * @param {Array} sets - Array of sets with reps
 * @param {string} exercise - Exercise name
 * @returns {Promise<Object>} Classification summary
 */
async function classifyWorkoutReps(sets, exercise) {
  const classifications = [];
  const qualityLabels = getQualityLabels(exercise);
  const modelAvailable = hasModel(exercise);
  
  let totalReps = 0;
  let cleanReps = 0;
  let mlModelUsed = false;
  let skippedFromBackground = 0;
  
  for (const set of sets) {
    if (!set.reps || set.reps.length === 0) continue;
    
    for (const rep of set.reps) {
      let classification;
      
      // Check if rep already has classification from background ML
      if (rep.classification && typeof rep.classification === 'object' && rep.classification.label) {
        // Use existing classification - skip ML inference
        classification = {
          prediction: rep.classification.prediction ?? 0,
          label: rep.classification.label,
          confidence: rep.classification.confidence ?? 0.8,
          probabilities: rep.classification.probabilities ?? null,
          method: rep.classification.method ?? 'background',
          modelUsed: rep.classification.method === 'ml_model'
        };
        skippedFromBackground++;
        console.log(`[Analyze API] Using background classification for Set ${set.setNumber} Rep ${rep.repNumber}: ${classification.label}`);
      } else {
        // No existing classification - run ML inference
        classification = await classifyRep(rep, exercise);
      }
      
      classifications.push({
        setNumber: set.setNumber,
        repNumber: rep.repNumber,
        ...classification
      });
      
      totalReps++;
      if (classification.prediction === 0) cleanReps++;
      if (classification.modelUsed) mlModelUsed = true;
    }
  }
  
  if (skippedFromBackground > 0) {
    console.log(`[Analyze API] Skipped ${skippedFromBackground} reps with background classification`);
  }
  
  // Calculate distribution
  const distribution = {};
  for (const label of qualityLabels) {
    distribution[label] = 0;
  }
  
  for (const c of classifications) {
    if (distribution.hasOwnProperty(c.label)) {
      distribution[c.label]++;
    }
  }
  
  // Convert to percentages
  const distributionPercent = {};
  for (const [label, count] of Object.entries(distribution)) {
    distributionPercent[label] = totalReps > 0 ? Math.round((count / totalReps) * 100) : 0;
  }
  
  return {
    exercise,
    modelAvailable,
    mlModelUsed,
    qualityLabels,
    totalReps,
    cleanReps,
    cleanPercentage: totalReps > 0 ? Math.round((cleanReps / totalReps) * 100) : 0,
    distribution,
    distributionPercent,
    classifications
  };
}

// ============================================================================
// END ML CLASSIFICATION FUNCTIONS
// ============================================================================

const mean = (arr) => {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

const std = (arr) => {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
  return Math.sqrt(variance);
};

const percentile = (arr, p) => {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

function findPeaks(signal, prominenceThreshold = 0.05) {
  if (!signal || signal.length < 3) return { peaks: [], valleys: [] };
  
  const peaks = [];
  const valleys = [];
  const range = Math.max(...signal) - Math.min(...signal);
  const minProminence = range * prominenceThreshold;
  
  for (let i = 1; i < signal.length - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      const leftDepth = signal[i] - Math.min(...signal.slice(Math.max(0, i - 5), i));
      const rightDepth = signal[i] - Math.min(...signal.slice(i + 1, Math.min(signal.length, i + 6)));
      const prominence = Math.min(leftDepth, rightDepth);
      if (prominence >= minProminence) {
        peaks.push({ index: i, value: signal[i] });
      }
    }
    if (signal[i] < signal[i - 1] && signal[i] < signal[i + 1]) {
      const leftHeight = Math.max(...signal.slice(Math.max(0, i - 5), i)) - signal[i];
      const rightHeight = Math.max(...signal.slice(i + 1, Math.min(signal.length, i + 6))) - signal[i];
      const prominence = Math.min(leftHeight, rightHeight);
      if (prominence >= minProminence) {
        valleys.push({ index: i, value: signal[i] });
      }
    }
  }
  
  return { peaks, valleys };
}

function computeAngleFromAccelerometer(accelX, accelY, accelZ) {
  if (!accelX || !accelY || !accelZ || accelX.length === 0) return [];
  
  const angles = [];
  for (let i = 0; i < accelX.length; i++) {
    const x = accelX[i];
    const y = accelY[i];
    const z = accelZ[i];
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    if (magnitude === 0) {
      angles.push(0);
      continue;
    }
    const pitch = Math.atan2(y, Math.sqrt(x * x + z * z));
    angles.push((pitch * 180 / Math.PI) + 90);
  }
  return angles;
}

function computeROMDegrees(accelX, accelY, accelZ) {
  const angles = computeAngleFromAccelerometer(accelX, accelY, accelZ);
  if (angles.length === 0) {
    return { romDegrees: 0, minAngle: 0, maxAngle: 0, meanAngle: 0 };
  }
  const minAngle = Math.min(...angles);
  const maxAngle = Math.max(...angles);
  return {
    romDegrees: maxAngle - minAngle,
    minAngle,
    maxAngle,
    meanAngle: mean(angles)
  };
}

function computeSmoothnessMetrics(accelX, accelY, accelZ, timestamps, filteredMag = null) {
  if (!accelX || accelX.length < 4) {
    return { irregularityScore: 0, smoothnessScore: 50 };
  }
  
  const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
  if (duration <= 0) return { irregularityScore: 0, smoothnessScore: 50 };
  
  const dt = duration / (timestamps.length - 1);
  
  let signal;
  if (filteredMag && filteredMag.length === accelX.length) {
    signal = filteredMag;
  } else {
    signal = accelX.map((x, i) => Math.sqrt(x * x + accelY[i] * accelY[i] + accelZ[i] * accelZ[i]));
  }
  
  const rom = Math.max(...signal) - Math.min(...signal);
  const safeRom = rom < 0.1 ? 0.1 : rom;
  
  const velocity = [];
  for (let i = 1; i < signal.length; i++) {
    velocity.push((signal[i] - signal[i - 1]) / dt);
  }
  
  const jerk = [];
  for (let i = 1; i < velocity.length; i++) {
    jerk.push(Math.abs((velocity[i] - velocity[i - 1]) / dt));
  }
  
  const meanJerk = jerk.length > 0 ? mean(jerk) : 0;
  const normalizedJerk = meanJerk / safeRom;
  
  let directionChanges = 0;
  for (let i = 1; i < velocity.length; i++) {
    if ((velocity[i] > 0 && velocity[i - 1] < 0) || (velocity[i] < 0 && velocity[i - 1] > 0)) {
      directionChanges++;
    }
  }
  const directionRate = directionChanges / duration;
  
  const { peaks, valleys } = findPeaks(signal, 0.05);
  const totalPeaks = peaks.length + valleys.length;
  const excessPeaks = Math.max(0, totalPeaks - 2);
  
  const jerkContrib = Math.min(40, Math.max(0, normalizedJerk - 1.5) * 13.3);
  const dirContrib = Math.min(35, Math.max(0, directionRate - 0.5) * 10);
  const peaksContrib = Math.min(25, excessPeaks * 3.3);
  
  const irregularityScore = jerkContrib + dirContrib + peaksContrib;
  const smoothnessScore = Math.max(0, Math.min(100, 100 - irregularityScore));
  
  return {
    irregularityScore: Math.round(irregularityScore * 100) / 100,
    smoothnessScore: Math.round(smoothnessScore * 100) / 100,
    normalizedJerk,
    meanJerk
  };
}

function computePhaseTimings(signal, timestamps) {
  if (!signal || signal.length < 3) return { liftingTime: 0, loweringTime: 0 };
  
  // Check if timestamps are valid (not all zeros)
  const hasValidTimestamps = timestamps && timestamps.length === signal.length 
    && timestamps.some(t => t > 0) 
    && (timestamps[timestamps.length - 1] - timestamps[0]) > 0;
  
  // Find valley (minimum) and peak (maximum) indices
  let valleyIdx = 0;
  let peakIdx = 0;
  let minVal = signal[0];
  let maxVal = signal[0];
  
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] < minVal) {
      minVal = signal[i];
      valleyIdx = i;
    }
    if (signal[i] > maxVal) {
      maxVal = signal[i];
      peakIdx = i;
    }
  }
  
  // If peak and valley are at same position, no phase split possible
  if (peakIdx === valleyIdx) return { liftingTime: 0, loweringTime: 0 };
  
  let liftingTime = 0;
  let loweringTime = 0;
  
  if (hasValidTimestamps) {
    // Use actual timestamps for accurate timing
    if (valleyIdx < peakIdx) {
      for (let i = 1; i < signal.length; i++) {
        const dt = (timestamps[i] - timestamps[i - 1]) / 1000;
        if (dt <= 0) continue;
        if (i <= peakIdx) {
          liftingTime += dt;
        } else {
          loweringTime += dt;
        }
      }
    } else {
      for (let i = 1; i < signal.length; i++) {
        const dt = (timestamps[i] - timestamps[i - 1]) / 1000;
        if (dt <= 0) continue;
        if (i <= valleyIdx) {
          loweringTime += dt;
        } else {
          liftingTime += dt;
        }
      }
    }
  } else {
    // No valid timestamps — estimate from sample count (~20ms per sample at 50Hz)
    const totalDuration = signal.length * 0.02;
    if (valleyIdx < peakIdx) {
      liftingTime = (peakIdx / signal.length) * totalDuration;
      loweringTime = ((signal.length - peakIdx) / signal.length) * totalDuration;
    } else {
      loweringTime = (valleyIdx / signal.length) * totalDuration;
      liftingTime = ((signal.length - valleyIdx) / signal.length) * totalDuration;
    }
  }
  
  console.log('[Phase Timing]', {
    signalLength: signal.length,
    hasValidTimestamps,
    valleyIdx, peakIdx,
    minVal: minVal.toFixed(2), maxVal: maxVal.toFixed(2),
    liftingTime: liftingTime.toFixed(3), loweringTime: loweringTime.toFixed(3)
  });
  
  return { liftingTime, loweringTime };
}

function computeRepMetrics(repData) {
  const { samples, duration, sampleCount, repNumber, setNumber } = repData;
  
  if (!samples || samples.length < 3) {
    return {
      repNumber,
      setNumber,
      durationMs: duration || 0,
      sampleCount: sampleCount || 0,
      error: 'Insufficient samples'
    };
  }
  
  const accelX = samples.map(s => s.accelX || 0);
  const accelY = samples.map(s => s.accelY || 0);
  const accelZ = samples.map(s => s.accelZ || 0);
  const gyroX = samples.map(s => s.gyroX || 0);
  const gyroY = samples.map(s => s.gyroY || 0);
  const gyroZ = samples.map(s => s.gyroZ || 0);
  // Try both field names: filteredMag and filteredMagnitude (from streaming vs stored data)
  const filteredMag = samples.map(s => s.filteredMag || s.filteredMagnitude || s.accelMag || 0);
  const timestamps = samples.map(s => s.timestamp_ms || 0);
  
  const durationMs = duration || (timestamps[timestamps.length - 1] - timestamps[0]);
  
  // ROM metrics
  const peak = Math.max(...filteredMag);
  const trough = Math.min(...filteredMag);
  const rom = peak - trough;
  
  // ROM in degrees
  const romDegrees = computeROMDegrees(accelX, accelY, accelZ);
  
  // Smoothness
  const smoothnessMetrics = computeSmoothnessMetrics(accelX, accelY, accelZ, timestamps, filteredMag);
  
  // Gyro metrics
  const gyroMag = gyroX.map((x, i) => Math.sqrt(x * x + gyroY[i] * gyroY[i] + gyroZ[i] * gyroZ[i]));
  const gyroPeak = Math.max(...gyroMag);
  const gyroRms = Math.sqrt(mean(gyroMag.map(g => g * g)));
  
  // Shakiness
  let shakiness = 0;
  if (timestamps.length > 2 && durationMs > 0) {
    const dt = (durationMs / 1000) / (timestamps.length - 1);
    const angularAccel = [];
    for (let i = 1; i < gyroMag.length; i++) {
      angularAccel.push((gyroMag[i] - gyroMag[i - 1]) / dt);
    }
    shakiness = Math.sqrt(mean(angularAccel.map(a => a * a)));
  }
  
  // Phase timings
  const { liftingTime, loweringTime } = computePhaseTimings(filteredMag, timestamps);
  
  // Peak acceleration
  const peakAcceleration = Math.max(...samples.map(s => 
    s.accelMag || Math.sqrt((s.accelX || 0) ** 2 + (s.accelY || 0) ** 2 + (s.accelZ || 0) ** 2)
  ));
  
  return {
    repNumber,
    setNumber,
    durationMs,
    sampleCount: samples.length,
    rom,
    peak,
    trough,
    romDegrees: romDegrees.romDegrees,
    minAngle: romDegrees.minAngle,
    maxAngle: romDegrees.maxAngle,
    smoothnessScore: smoothnessMetrics.smoothnessScore,
    meanJerk: smoothnessMetrics.irregularityScore,
    gyroPeak,
    gyroRms,
    shakiness,
    liftingTime,
    loweringTime,
    totalPhaseTime: liftingTime + loweringTime,
    liftingPercent: liftingTime + loweringTime > 0 
      ? (liftingTime / (liftingTime + loweringTime)) * 100 
      : 50,
    peakAcceleration,
    peakVelocity: gyroPeak,
    chartData: filteredMag
  };
}

function computeFatigueIndicators(repMetricsList) {
  if (!repMetricsList || repMetricsList.length < 3) {
    return {
      fatigueScore: 0,
      fatigueLevel: 'insufficient_data',
      consistencyScore: 0,
      performanceReport: {
        sessionQuality: 'Insufficient Data',
        keyFindings: ['⚠️ Need at least 3 reps for analysis']
      }
    };
  }
  
  const nReps = repMetricsList.length;
  const third = Math.max(1, Math.floor(nReps / 3));
  
  const gyroPeaks = repMetricsList.map(m => m.gyroPeak || 0);
  const hasGyro = gyroPeaks.some(g => g > 0);
  const shakiness = repMetricsList.map(m => m.shakiness || 0);
  const hasShakiness = shakiness.some(s => s > 0);
  const durations = repMetricsList.map(m => m.durationMs || 0);
  const jerkValues = repMetricsList.map(m => m.meanJerk || 0);
  const roms = repMetricsList.map(m => m.romDegrees || m.rom || 0);
  const smoothnessValues = repMetricsList.map(m => m.smoothnessScore || 50);
  const peaks = repMetricsList.map(m => m.peak || 0);
  
  // D_omega
  let D_omega, gyroDirection;
  if (hasGyro) {
    const avgGyroFirst = mean(gyroPeaks.slice(0, third));
    const avgGyroLast = mean(gyroPeaks.slice(-third));
    D_omega = avgGyroFirst > 0 ? Math.abs(avgGyroFirst - avgGyroLast) / avgGyroFirst : 0;
    gyroDirection = avgGyroLast < avgGyroFirst ? 'drop' : 'surge';
  } else {
    const avgPeakFirst = mean(peaks.slice(0, third));
    const avgPeakLast = mean(peaks.slice(-third));
    D_omega = avgPeakFirst > 0 ? Math.abs(avgPeakFirst - avgPeakLast) / avgPeakFirst : 0;
    gyroDirection = avgPeakLast < avgPeakFirst ? 'drop' : 'surge';
  }
  
  // I_T
  const avgDurFirst = mean(durations.slice(0, third));
  const avgDurLast = mean(durations.slice(-third));
  const I_T = avgDurFirst > 0 ? (avgDurLast - avgDurFirst) / avgDurFirst : 0;
  
  // I_J
  const avgJerkFirst = mean(jerkValues.slice(0, third));
  const avgJerkLast = mean(jerkValues.slice(-third));
  const I_J = avgJerkFirst > 0 ? (avgJerkLast - avgJerkFirst) / avgJerkFirst : 0;
  
  // I_S
  let I_S = 0;
  if (hasShakiness) {
    const avgShakyFirst = mean(shakiness.slice(0, third));
    const avgShakyLast = mean(shakiness.slice(-third));
    I_S = avgShakyFirst > 0 ? (avgShakyLast - avgShakyFirst) / avgShakyFirst : 0;
  }
  
  // Composite fatigue score
  const D_omega_clamped = Math.max(0, D_omega);
  const I_T_clamped = Math.max(0, I_T);
  const I_J_clamped = Math.max(0, I_J);
  const I_S_clamped = Math.max(0, I_S);
  
  let fatigueRaw = (0.35 * D_omega_clamped) +
                   (0.25 * I_T_clamped) +
                   (0.20 * I_J_clamped) +
                   (0.20 * I_S_clamped);
  
  const worstIndicator = Math.max(D_omega_clamped, I_T_clamped, I_J_clamped, I_S_clamped);
  if (worstIndicator > 0.40) {
    fatigueRaw = Math.min(1.0, fatigueRaw + (worstIndicator - 0.40) * 0.5);
  }
  
  const fatigueScore = Math.min(100, fatigueRaw * 100);
  
  let fatigueLevel;
  if (fatigueScore < 10) fatigueLevel = 'minimal';
  else if (fatigueScore < 20) fatigueLevel = 'low';
  else if (fatigueScore < 35) fatigueLevel = 'moderate';
  else if (fatigueScore < 55) fatigueLevel = 'high';
  else fatigueLevel = 'severe';
  
  // Consistency
  const getConsistency = (values) => {
    if (values.length < 2 || mean(values) === 0) return 0;
    const cv = std(values) / mean(values);
    return Math.max(0, Math.min(100, 100 - cv * 333));
  };
  
  const consistencyScore = mean([
    getConsistency(roms),
    getConsistency(smoothnessValues),
    getConsistency(durations),
    getConsistency(peaks)
  ]);
  
  // Key findings
  const keyFindings = [];
  if (fatigueScore < 10) {
    keyFindings.push('✅ Excellent fatigue resistance');
  } else if (fatigueScore > 45) {
    keyFindings.push('⚠️ Significant fatigue detected');
  }
  
  if (consistencyScore > 85) {
    keyFindings.push('✅ Highly consistent movements');
  } else if (consistencyScore < 60) {
    keyFindings.push('⚠️ High variability in rep execution');
  }
  
  if (keyFindings.length === 0) {
    keyFindings.push('📊 Moderate performance');
  }
  
  return {
    fatigueScore: Math.round(fatigueScore * 10) / 10,
    fatigueLevel,
    D_omega: Math.round(D_omega * 10000) / 10000,
    I_T: Math.round(I_T * 10000) / 10000,
    I_J: Math.round(I_J * 10000) / 10000,
    I_S: Math.round(I_S * 10000) / 10000,
    gyroDirection,
    consistencyScore: Math.round(consistencyScore * 10) / 10,
    performanceReport: {
      sessionQuality: fatigueScore < 10 ? 'Excellent' :
                      fatigueScore < 20 ? 'Good' :
                      fatigueScore < 35 ? 'Fair' :
                      fatigueScore < 55 ? 'Poor' : 'Very Poor',
      consistencyRating: consistencyScore >= 70 ? 'Good' :
                        consistencyScore >= 50 ? 'Fair' : 'Poor',
      keyFindings
    }
  };
}

function computeRepConsistency(repChartDataList) {
  if (!repChartDataList || repChartDataList.length < 2) {
    return { consistencyScore: 100, inconsistentRepIndex: -1 };
  }
  
  const maxLen = Math.max(...repChartDataList.map(c => c.length));
  const normalizedCurves = repChartDataList.map(curve => {
    if (curve.length === maxLen) return curve;
    const resampled = [];
    for (let i = 0; i < maxLen; i++) {
      const srcIdx = (i / (maxLen - 1)) * (curve.length - 1);
      const low = Math.floor(srcIdx);
      const high = Math.ceil(srcIdx);
      const frac = srcIdx - low;
      resampled.push(curve[low] * (1 - frac) + (curve[high] || curve[low]) * frac);
    }
    return resampled;
  });
  
  const meanCurve = [];
  for (let i = 0; i < maxLen; i++) {
    meanCurve.push(mean(normalizedCurves.map(c => c[i])));
  }
  
  const deviations = normalizedCurves.map(curve => {
    let totalDev = 0;
    for (let i = 0; i < maxLen; i++) {
      totalDev += Math.pow(curve[i] - meanCurve[i], 2);
    }
    return Math.sqrt(totalDev / maxLen);
  });
  
  const maxDeviation = Math.max(...deviations);
  const inconsistentRepIndex = deviations.indexOf(maxDeviation);
  const avgDeviation = mean(deviations);
  const meanValue = mean(meanCurve);
  const normalizedDev = meanValue > 0 ? avgDeviation / meanValue : 0;
  const consistencyScore = Math.max(0, Math.min(100, Math.round(100 * (1 - normalizedDev * 2))));
  
  return { consistencyScore, inconsistentRepIndex };
}

/**
 * Main analysis function
 */
function analyzeWorkout(workoutData) {
  if (!workoutData || !workoutData.sets || workoutData.sets.length === 0) {
    return {
      error: 'No workout data available',
      workoutId: workoutData?.workoutId,
      analyzedAt: new Date().toISOString()
    };
  }
  
  const { workoutId, exercise, equipment, sets, odUSerId } = workoutData;
  
  const allRepMetrics = [];
  const setsAnalysis = [];
  
  for (const set of sets) {
    if (!set.reps || set.reps.length === 0) continue;
    
    const setRepMetrics = [];
    for (const rep of set.reps) {
      const metrics = computeRepMetrics(rep);
      setRepMetrics.push(metrics);
      allRepMetrics.push(metrics);
    }
    
    const setFatigue = computeFatigueIndicators(setRepMetrics);
    const setChartData = setRepMetrics.map(m => m.chartData || []).filter(c => c.length > 0);
    const setConsistency = computeRepConsistency(setChartData);
    
    setsAnalysis.push({
      setNumber: set.setNumber,
      repsCount: setRepMetrics.length,
      repMetrics: setRepMetrics,
      fatigueAnalysis: setFatigue,
      consistencyScore: setConsistency.consistencyScore,
      inconsistentRepIndex: setConsistency.inconsistentRepIndex,
      avgDuration: mean(setRepMetrics.map(m => m.durationMs)),
      avgROM: mean(setRepMetrics.map(m => m.romDegrees || m.rom)),
      avgSmoothness: mean(setRepMetrics.map(m => m.smoothnessScore)),
      totalTime: setRepMetrics.reduce((sum, m) => sum + (m.durationMs || 0), 0)
    });
  }
  
  const overallFatigue = computeFatigueIndicators(allRepMetrics);
  const allChartData = allRepMetrics.map(m => m.chartData || []).filter(c => c.length > 0);
  const overallConsistency = computeRepConsistency(allChartData);
  
  const avgConcentric = mean(allRepMetrics.map(m => m.liftingTime || 0));
  const avgEccentric = mean(allRepMetrics.map(m => m.loweringTime || 0));
  const avgROMDegrees = mean(allRepMetrics.map(m => m.romDegrees || 0));
  const avgSmoothness = mean(allRepMetrics.map(m => m.smoothnessScore || 50));
  const avgDuration = mean(allRepMetrics.map(m => m.durationMs || 0));
  const totalDuration = allRepMetrics.reduce((sum, m) => sum + (m.durationMs || 0), 0);
  
  return {
    workoutId,
    userId: odUSerId,
    exercise,
    equipment,
    analyzedAt: new Date().toISOString(),
    
    summary: {
      totalSets: setsAnalysis.length,
      totalReps: allRepMetrics.length,
      totalDurationMs: totalDuration,
      avgDurationMs: avgDuration,
      avgROMDegrees,
      avgSmoothness,
      avgConcentric,
      avgEccentric,
      concentricPercent: avgConcentric + avgEccentric > 0 
        ? (avgConcentric / (avgConcentric + avgEccentric)) * 100 
        : 50,
      eccentricPercent: avgConcentric + avgEccentric > 0 
        ? (avgEccentric / (avgConcentric + avgEccentric)) * 100 
        : 50
    },
    
    fatigue: overallFatigue,
    
    consistency: {
      score: overallConsistency.consistencyScore,
      inconsistentRepIndex: overallConsistency.inconsistentRepIndex,
      rating: overallFatigue.performanceReport.consistencyRating
    },
    
    setsAnalysis,
    repMetrics: allRepMetrics,
    insights: overallFatigue.performanceReport.keyFindings
  };
}

// ============================================================================
// API HANDLER
// ============================================================================

export default async function handler(req, res) {
  // Initialize services
  initFirebase();
  initGCS();
  
  if (firebaseInitError || storageInitError) {
    return res.status(500).json({
      error: 'Service initialization failed',
      details: firebaseInitError?.message || storageInitError?.message
    });
  }
  
  // Verify auth
  const user = await verifyAuthToken(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    if (req.method === 'GET') {
      // Get existing analysis
      const { workoutId, userId, equipment, exercise } = req.query;
      
      if (!workoutId) {
        return res.status(400).json({ error: 'workoutId is required' });
      }
      
      // Use provided userId or fall back to authenticated user
      const targetUserId = userId || user.uid;
      
      // If equipment and exercise are provided, use direct path
      if (equipment && exercise) {
        const analysis = await getAnalysis(workoutId, targetUserId, equipment, exercise);
        
        if (!analysis) {
          return res.status(404).json({ error: 'Analysis not found' });
        }
        
        return res.status(200).json(analysis);
      }
      
      // Otherwise, search across all equipment/exercise collections
      try {
        const db = getFirestore();
        const analyticsQuery = await db
          .collection('userWorkouts')
          .doc(targetUserId)
          .listCollections();
        
        // Search through equipment collections
        for (const equipmentCol of analyticsQuery) {
          const exerciseDocs = await equipmentCol.listDocuments();
          
          for (const exerciseDoc of exerciseDocs) {
            const analyticsDoc = await exerciseDoc
              .collection('analytics')
              .doc(workoutId)
              .get();
              
            if (analyticsDoc.exists) {
              return res.status(200).json(analyticsDoc.data());
            }
          }
        }
        
        return res.status(404).json({ error: 'Analysis not found' });
      } catch (searchError) {
        console.error('[Analyze API] Error searching for analysis:', searchError);
        return res.status(500).json({ error: 'Failed to search for analysis' });
      }
      
    } else if (req.method === 'POST') {
      // Analyze workout
      const { workoutId, gcsPath, forceReanalyze = false } = req.body;
      const ANALYSIS_VERSION = 3; // Bump this when analysis pipeline changes significantly
      
      if (!workoutId && !gcsPath) {
        return res.status(400).json({ error: 'workoutId or gcsPath is required' });
      }
      
      // Fetch workout data from GCS first to get equipment/exercise info
      let workoutData;
      try {
        const path = gcsPath || `users/${user.uid}/**/workout_data.json`;
        // If we have workoutId, construct the path
        if (workoutId && !gcsPath) {
          // Try to find the workout from Firestore to get the path
          const db = getFirestore();
          const workoutDoc = await db.collectionGroup('logs')
            .where('odWorkoutId', '==', workoutId)
            .limit(1)
            .get();
          
          if (!workoutDoc.empty) {
            const workoutInfo = workoutDoc.docs[0].data();
            if (workoutInfo.gcsPath) {
              workoutData = await fetchWorkoutData(workoutInfo.gcsPath);
            }
          }
        }
        
        if (!workoutData && gcsPath) {
          workoutData = await fetchWorkoutData(gcsPath);
        }
        
        if (!workoutData) {
          return res.status(404).json({ error: 'Workout data not found' });
        }
      } catch (fetchError) {
        console.error('[Analyze API] Failed to fetch workout data:', fetchError);
        return res.status(404).json({ 
          error: 'Failed to fetch workout data',
          details: fetchError.message 
        });
      }
      
      // Check for existing analysis (now that we have equipment/exercise from workoutData)
      if (!forceReanalyze && workoutId && workoutData.odUSerId && workoutData.equipment && workoutData.exercise) {
        const existing = await getAnalysis(workoutId, workoutData.odUSerId, workoutData.equipment, workoutData.exercise);
        if (existing && existing._analysisVersion === ANALYSIS_VERSION) {
          console.log('[Analyze API] Returning existing analysis (v' + ANALYSIS_VERSION + ')');
          return res.status(200).json(existing);
        } else if (existing) {
          console.log('[Analyze API] Stale analysis version, will reanalyze');
        }
      }
      
      // ============================================================================
      // PREPROCESSING: Resegment reps using valley-to-valley detection
      // This corrects rep boundaries that may have gaps or incorrect merging
      // from the live workout monitor's peak-based detection
      // ============================================================================
      console.log('[Analyze API] Running rep resegmentation preprocessing...');
      try {
        workoutData = resegmentWorkout(workoutData);
        console.log('[Analyze API] Resegmentation complete');
      } catch (resegError) {
        console.error('[Analyze API] Resegmentation failed (non-fatal):', resegError);
        console.log('[Analyze API] Continuing with original segmentation...');
      }
      
      // Run analysis
      console.log('[Analyze API] Running analysis for workout:', workoutData.workoutId);
      const analysis = analyzeWorkout(workoutData);
      
      if (analysis.error) {
        return res.status(400).json(analysis);
      }
      
      // Run ML classification for each rep
      console.log('[Analyze API] Running ML classification for exercise:', workoutData.exercise);
      try {
        const classificationResults = await classifyWorkoutReps(workoutData.sets, workoutData.exercise);
        
        // Add classification to analysis
        analysis.mlClassification = {
          modelAvailable: classificationResults.modelAvailable,
          mlModelUsed: classificationResults.mlModelUsed,
          qualityLabels: classificationResults.qualityLabels,
          cleanPercentage: classificationResults.cleanPercentage,
          distribution: classificationResults.distribution,
          distributionPercent: classificationResults.distributionPercent
        };
        
        // Add classification to each rep in repMetrics
        if (classificationResults.classifications && analysis.repMetrics) {
          for (const classification of classificationResults.classifications) {
            const repIndex = analysis.repMetrics.findIndex(
              r => r.setNumber === classification.setNumber && r.repNumber === classification.repNumber
            );
            if (repIndex !== -1) {
              analysis.repMetrics[repIndex].classification = {
                prediction: classification.prediction,
                label: classification.label,
                confidence: classification.confidence,
                method: classification.method
              };
            }
          }
        }
        
        // Add classification to setsAnalysis
        if (classificationResults.classifications && analysis.setsAnalysis) {
          for (const setAnalysis of analysis.setsAnalysis) {
            const setClassifications = classificationResults.classifications.filter(
              c => c.setNumber === setAnalysis.setNumber
            );
            const cleanInSet = setClassifications.filter(c => c.prediction === 0).length;
            setAnalysis.classification = {
              totalReps: setClassifications.length,
              cleanReps: cleanInSet,
              cleanPercentage: setClassifications.length > 0 
                ? Math.round((cleanInSet / setClassifications.length) * 100) 
                : 0
            };
          }
        }
        
        console.log('[Analyze API] Classification complete:', {
          totalReps: classificationResults.totalReps,
          cleanPercentage: classificationResults.cleanPercentage,
          modelUsed: classificationResults.mlModelUsed
        });
      } catch (classificationError) {
        console.error('[Analyze API] Classification error (non-fatal):', classificationError.message);
        analysis.mlClassification = {
          error: classificationError.message,
          modelAvailable: false,
          mlModelUsed: false
        };
      }
      
      // Store in Firestore with version stamp
      analysis._analysisVersion = ANALYSIS_VERSION;
      await storeAnalysis(analysis);
      
      return res.status(200).json(analysis);
      
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
  } catch (error) {
    console.error('[Analyze API] Error:', error);
    return res.status(500).json({ 
      error: 'Analysis failed',
      details: error.message 
    });
  }
}
