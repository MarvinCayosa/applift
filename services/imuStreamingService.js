/**
 * IMU Streaming Service
 * 
 * Handles real-time streaming of IMU data to Google Cloud Storage.
 * Optimized for ML feature extraction and real-time classification.
 * 
 * Data Format (JSON - optimized for ML):
 * {
 *   "workoutId": "workout_xxx",
 *   "exercise": "Bench Press",
 *   "equipment": "Barbell",
 *   "sets": [
 *     {
 *       "setNumber": 1,
 *       "reps": [
 *         {
 *           "repNumber": 1,
 *           "startTime": "2026-02-01T...",
 *           "duration": 2500,
 *           "sampleCount": 50,
 *           "samples": [
 *             { "set": 1, "rep": 1, "timestamp": "00.000", "timestamp_ms": 0, "accelX": -0.27, ... },
 *             ...
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 * 
 * GCS Structure:
 * bucket/users/{userId}/workouts/{workoutId}/
 *   workout_data.json     <- Complete workout data (all sets/reps)
 *   metadata.json         <- Workout metadata (exercise, equipment, status)
 * 
 * ML Integration Flow:
 * 1. User starts recording → Initialize workout
 * 2. Rep detected → Send rep data to ML model for classification
 * 3. Classification result → Store with rep, optionally redirect
 * 4. Workout ends → Save complete workout JSON to GCS
 * 
 * For real-time ML:
 * - Call `getRepDataForML(repNumber, setNumber)` after rep detection
 * - Returns formatted data ready for feature extraction
 * - Can be sent to ML endpoint immediately
 */

// Buffer for current rep's IMU data
let currentRepBuffer = [];
let currentSetNumber = 1;
let currentRepNumber = 0;
let isStreaming = false;
let workoutId = null;
let userId = null;
let authToken = null;
let repStartTime = null;

// Complete workout data structure (for GCS storage)
let workoutData = {
  workoutId: null,
  exercise: null,
  equipment: null,
  plannedSets: 0,
  plannedReps: 0,
  weight: 0,
  weightUnit: 'kg',
  setType: 'recommended',
  sets: [] // Array of set objects, each containing reps array
};

// Metadata tracking
let workoutMetadata = {
  exercise: null,
  equipment: null,
  plannedSets: 0,
  plannedReps: 0,
  weight: 0,
  weightUnit: 'kg',
  completedSets: 0,
  completedReps: 0,
  status: 'pending', // pending, in_progress, completed, incomplete, canceled
  startTime: null,
  endTime: null,
  setType: 'recommended', // 'recommended' or 'custom'
};

/**
 * Format timestamp as MM:SS.mmm string
 */
const formatTimestamp = (ms) => {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(3);
  return `${minutes.toString().padStart(2, '0')}:${seconds.padStart(6, '0')}`;
};

/**
 * Convert IMU sample to ML-ready format
 * Includes set and rep context for each sample
 */
const sampleToMLFormat = (sample, setNum, repNum, baseTimestamp) => {
  const relativeMs = sample.timestamp - baseTimestamp;
  return {
    set: setNum,
    rep: repNum,
    timestamp: formatTimestamp(relativeMs),
    timestamp_ms: relativeMs,
    accelX: parseFloat(sample.accelX?.toFixed(4)) || 0,
    accelY: parseFloat(sample.accelY?.toFixed(4)) || 0,
    accelZ: parseFloat(sample.accelZ?.toFixed(4)) || 0,
    accelMag: parseFloat(sample.rawMagnitude?.toFixed(4)) || 0,
    gyroX: parseFloat(sample.gyroX?.toFixed(4)) || 0,
    gyroY: parseFloat(sample.gyroY?.toFixed(4)) || 0,
    gyroZ: parseFloat(sample.gyroZ?.toFixed(4)) || 0,
    roll: parseFloat(sample.roll?.toFixed(2)) || 0,
    pitch: parseFloat(sample.pitch?.toFixed(2)) || 0,
    yaw: parseFloat(sample.yaw?.toFixed(2)) || 0,
    filteredX: parseFloat(sample.filteredX?.toFixed(4)) || sample.accelX || 0,
    filteredY: parseFloat(sample.filteredY?.toFixed(4)) || sample.accelY || 0,
    filteredZ: parseFloat(sample.filteredZ?.toFixed(4)) || sample.accelZ || 0,
    filteredMag: parseFloat(sample.filteredMagnitude?.toFixed(4)) || 0
  };
};

/**
 * Convert rep data to CSV format string (for export/compatibility)
 * Headers: set,rep,timestamp,timestamp_ms,accelX,accelY,accelZ,accelMag,gyroX,gyroY,gyroZ,roll,pitch,yaw,filteredX,filteredY,filteredZ,filteredMag
 */
const repDataToCSV = (repData) => {
  const headers = 'set,rep,timestamp,timestamp_ms,accelX,accelY,accelZ,accelMag,gyroX,gyroY,gyroZ,roll,pitch,yaw,filteredX,filteredY,filteredZ,filteredMag';
  const rows = repData.samples.map(s => 
    `${s.set},${s.rep},${s.timestamp},${s.timestamp_ms},${s.accelX},${s.accelY},${s.accelZ},${s.accelMag},${s.gyroX},${s.gyroY},${s.gyroZ},${s.roll},${s.pitch},${s.yaw},${s.filteredX},${s.filteredY},${s.filteredZ},${s.filteredMag}`
  );
  return [headers, ...rows].join('\n');
};

/**
 * Generate workout ID
 */
const generateWorkoutId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `workout_${timestamp}_${random}`;
};

/**
 * Initialize streaming session
 */
export const initializeStreaming = async (config) => {
  const {
    odUSerId,
    token,
    exercise,
    equipment,
    plannedSets,
    plannedReps,
    weight,
    weightUnit,
    setType = 'recommended'
  } = config;

  userId = odUSerId;
  authToken = token;
  workoutId = generateWorkoutId();
  currentSetNumber = 1;
  currentRepNumber = 0;
  currentRepBuffer = [];
  isStreaming = true;
  repStartTime = null;

  // Initialize workout data structure for ML
  workoutData = {
    workoutId,
    odUSerId,
    exercise,
    equipment,
    plannedSets: parseInt(plannedSets) || 0,
    plannedReps: parseInt(plannedReps) || 0,
    weight: parseFloat(weight) || 0,
    weightUnit: weightUnit || 'kg',
    setType,
    startTime: new Date().toISOString(),
    sets: [
      {
        setNumber: 1,
        startTime: new Date().toISOString(),
        endTime: null,
        reps: []
      }
    ]
  };

  workoutMetadata = {
    odUSerId,
    workoutId,
    exercise,
    equipment,
    plannedSets: parseInt(plannedSets) || 0,
    plannedReps: parseInt(plannedReps) || 0,
    weight: parseFloat(weight) || 0,
    weightUnit: weightUnit || 'kg',
    completedSets: 0,
    completedReps: 0,
    totalReps: 0,
    status: 'in_progress',
    startTime: new Date().toISOString(),
    endTime: null,
    setType,
    sets: {} // Will store set completion info
  };

  // Upload initial metadata
  await uploadMetadata();

  console.log('[IMUStreaming] Initialized streaming session:', workoutId);

  return {
    workoutId,
    success: true
  };
};

/**
 * Add IMU sample to current rep buffer
 * Called for each incoming BLE IMU packet
 */
export const addIMUSample = (sample) => {
  if (!isStreaming) {
    // Only log occasionally to avoid spam
    if (Math.random() < 0.01) {
      console.log('[IMUStreaming] Sample received but not streaming');
    }
    return;
  }
  
  // Set rep start time on first sample
  if (repStartTime === null) {
    repStartTime = sample.timestamp || Date.now();
    console.log('[IMUStreaming] Rep buffer started, first sample received');
  }
  
  currentRepBuffer.push({
    ...sample,
    timestamp: sample.timestamp || Date.now()
  });
  
  // Log buffer size periodically
  if (currentRepBuffer.length % 50 === 0) {
    console.log(`[IMUStreaming] Buffer size: ${currentRepBuffer.length} samples`);
  }
};

/**
 * Called when a rep is detected
 * Saves the rep data in ML-ready format
 * Returns the rep data for immediate ML classification
 */
export const onRepDetected = async (repInfo = {}) => {
  if (!isStreaming || currentRepBuffer.length === 0) {
    console.warn('[IMUStreaming] No data to save for rep');
    return null;
  }

  currentRepNumber++;
  workoutMetadata.totalReps++;

  // Get base timestamp for this rep
  const baseTimestamp = currentRepBuffer[0]?.timestamp || Date.now();
  const endTimestamp = currentRepBuffer[currentRepBuffer.length - 1]?.timestamp || Date.now();
  const duration = endTimestamp - baseTimestamp;

  // Convert samples to ML-ready format
  const mlSamples = currentRepBuffer.map(sample => 
    sampleToMLFormat(sample, currentSetNumber, currentRepNumber, baseTimestamp)
  );

  // Create rep data object
  const repData = {
    repNumber: currentRepNumber,
    setNumber: currentSetNumber,
    startTime: new Date(baseTimestamp).toISOString(),
    endTime: new Date(endTimestamp).toISOString(),
    duration: duration,
    sampleCount: mlSamples.length,
    peakAcceleration: repInfo.peakAcceleration || null,
    samples: mlSamples,
    // ML classification placeholder - to be filled by ML model
    classification: null,
    confidence: null
  };

  // Add to workout data structure
  const currentSetData = workoutData.sets[currentSetNumber - 1];
  if (currentSetData) {
    currentSetData.reps.push(repData);
  }

  // Clear buffer for next rep
  currentRepBuffer = [];
  repStartTime = null;

  // Update metadata
  if (!workoutMetadata.sets[currentSetNumber]) {
    workoutMetadata.sets[currentSetNumber] = {
      reps: 0,
      startTime: new Date().toISOString(),
      endTime: null
    };
  }
  workoutMetadata.sets[currentSetNumber].reps = currentRepNumber;

  console.log(`[IMUStreaming] Rep ${currentRepNumber} of Set ${currentSetNumber} recorded (${mlSamples.length} samples, ${duration}ms)`);

  return {
    setNumber: currentSetNumber,
    repNumber: currentRepNumber,
    repData: repData, // Full rep data for ML
    sampleCount: mlSamples.length,
    duration: duration
  };
};

/**
 * Get rep data formatted for ML model input
 * Call this after onRepDetected to get data ready for classification
 */
export const getRepDataForML = (setNumber = currentSetNumber, repNumber = currentRepNumber) => {
  const setData = workoutData.sets[setNumber - 1];
  if (!setData) return null;
  
  const repData = setData.reps.find(r => r.repNumber === repNumber);
  if (!repData) return null;

  // Return in format ready for ML feature extraction
  return {
    workoutId,
    exercise: workoutData.exercise,
    equipment: workoutData.equipment,
    setNumber: setNumber,
    repNumber: repNumber,
    samples: repData.samples,
    sampleCount: repData.sampleCount,
    duration: repData.duration,
    // Provide both JSON array and CSV string for flexibility
    asCSV: repDataToCSV(repData)
  };
};

/**
 * Store ML classification result for a rep
 * Call this after ML model returns classification
 */
export const storeRepClassification = (setNumber, repNumber, classification, confidence = null) => {
  const setData = workoutData.sets[setNumber - 1];
  if (!setData) return false;
  
  const repData = setData.reps.find(r => r.repNumber === repNumber);
  if (!repData) return false;

  repData.classification = classification;
  repData.confidence = confidence;
  repData.classifiedAt = new Date().toISOString();

  console.log(`[IMUStreaming] Stored classification for Set ${setNumber} Rep ${repNumber}: ${classification} (${confidence})`);
  return true;
};

/**
 * Called when a set is complete
 * Moves to next set and updates metadata
 */
export const onSetComplete = async () => {
  if (!isStreaming) return;

  // Save any remaining buffer as final rep of set
  if (currentRepBuffer.length > 0) {
    await onRepDetected();
  }

  // Mark set as complete in workout data
  const currentSetData = workoutData.sets[currentSetNumber - 1];
  if (currentSetData) {
    currentSetData.endTime = new Date().toISOString();
    currentSetData.totalReps = currentRepNumber;
  }

  // Mark set as complete in metadata
  if (workoutMetadata.sets[currentSetNumber]) {
    workoutMetadata.sets[currentSetNumber].endTime = new Date().toISOString();
  }

  workoutMetadata.completedSets = currentSetNumber;
  workoutMetadata.completedReps += currentRepNumber;

  console.log(`[IMUStreaming] Set ${currentSetNumber} complete with ${currentRepNumber} reps`);

  // Move to next set
  currentSetNumber++;
  currentRepNumber = 0;
  currentRepBuffer = [];
  repStartTime = null;

  // Add new set to workout data
  workoutData.sets.push({
    setNumber: currentSetNumber,
    startTime: new Date().toISOString(),
    endTime: null,
    reps: []
  });

  // Update metadata in GCS
  await uploadMetadata();

  return {
    completedSet: currentSetNumber - 1,
    totalReps: workoutMetadata.completedReps
  };
};

/**
 * End the streaming session
 * Determines if workout was completed or incomplete
 * Uploads complete workout JSON to GCS
 */
export const endStreaming = async (userFinished = true) => {
  if (!isStreaming) return null;

  // Save any remaining data
  if (currentRepBuffer.length > 0) {
    await onRepDetected();
  }

  // If there were reps in current set but set wasn't marked complete
  if (currentRepNumber > 0 && !workoutMetadata.sets[currentSetNumber]?.endTime) {
    // Update workout data
    const currentSetData = workoutData.sets[currentSetNumber - 1];
    if (currentSetData) {
      currentSetData.endTime = new Date().toISOString();
      currentSetData.totalReps = currentRepNumber;
    }

    workoutMetadata.sets[currentSetNumber] = {
      ...workoutMetadata.sets[currentSetNumber],
      reps: currentRepNumber,
      endTime: new Date().toISOString()
    };
    workoutMetadata.completedSets = currentSetNumber;
    workoutMetadata.completedReps += currentRepNumber;
  }

  // Remove empty last set if no reps
  if (workoutData.sets.length > 0) {
    const lastSet = workoutData.sets[workoutData.sets.length - 1];
    if (lastSet.reps.length === 0) {
      workoutData.sets.pop();
    }
  }

  // Determine completion status
  const plannedTotalReps = workoutMetadata.plannedSets * workoutMetadata.plannedReps;
  const completedTotalReps = workoutMetadata.totalReps;
  
  console.log('[IMUStreaming] Completion check:', {
    plannedSets: workoutMetadata.plannedSets,
    completedSets: workoutMetadata.completedSets,
    plannedTotalReps,
    completedTotalReps,
    userFinished
  });
  
  if (!userFinished) {
    workoutMetadata.status = 'canceled';
    workoutData.status = 'canceled';
  } else if (completedTotalReps > 0) {
    // If user finished the workout and did at least 1 rep, consider it completed
    // The detailed completion data (sets/reps) shows actual vs planned
    workoutMetadata.status = 'completed';
    workoutData.status = 'completed';
  } else {
    // No reps recorded at all
    workoutMetadata.status = 'incomplete';
    workoutData.status = 'incomplete';
  }

  workoutMetadata.endTime = new Date().toISOString();
  workoutData.endTime = new Date().toISOString();
  workoutData.completedSets = workoutMetadata.completedSets;
  workoutData.completedReps = completedTotalReps;

  // Upload complete workout data JSON to GCS
  await uploadWorkoutData();
  
  // Final metadata upload
  await uploadMetadata();

  console.log(`[IMUStreaming] Workout ended with status: ${workoutMetadata.status}`);
  console.log(`[IMUStreaming] Completed: ${workoutMetadata.completedSets}/${workoutMetadata.plannedSets} sets, ${completedTotalReps}/${plannedTotalReps} reps`);

  isStreaming = false;

  const result = {
    workoutId,
    status: workoutMetadata.status,
    completedSets: workoutMetadata.completedSets,
    plannedSets: workoutMetadata.plannedSets,
    completedReps: completedTotalReps,
    plannedReps: plannedTotalReps,
    metadata: { ...workoutMetadata },
    workoutData: { ...workoutData } // Include full workout data
  };

  // Reset state
  resetState();

  return result;
};

/**
 * Cancel the workout
 */
export const cancelStreaming = async () => {
  return endStreaming(false);
};

/**
 * Upload complete workout data JSON to GCS
 */
const uploadWorkoutData = async () => {
  const filePath = `users/${userId}/workouts/${workoutId}/workout_data.json`;
  const content = JSON.stringify(workoutData, null, 2);
  
  try {
    await uploadToGCS(filePath, content, 'application/json');
    console.log('[IMUStreaming] Uploaded complete workout data JSON');
  } catch (error) {
    console.error('[IMUStreaming] Failed to upload workout data:', error);
    storeLocally(filePath, content);
  }
};

/**
 * Upload metadata.json to GCS
 */
const uploadMetadata = async () => {
  const filePath = `users/${userId}/workouts/${workoutId}/metadata.json`;
  const content = JSON.stringify(workoutMetadata, null, 2);
  
  try {
    await uploadToGCS(filePath, content, 'application/json');
  } catch (error) {
    console.error('[IMUStreaming] Failed to upload metadata:', error);
    storeLocally(filePath, content);
  }
};

/**
 * Upload content to GCS via API
 */
const uploadToGCS = async (filePath, content, contentType) => {
  // Get signed URL from API
  const response = await fetch('/api/imu-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      action: 'upload',
      userId,
      filePath,
      contentType
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to get upload URL: ${response.status}`);
  }

  const { signedUrl } = await response.json();

  // Upload to GCS
  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType
    },
    body: content
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status}`);
  }

  return filePath;
};

/**
 * Store data locally as fallback
 */
const storeLocally = (filePath, content) => {
  try {
    const key = `imu_fallback_${workoutId}_${Date.now()}`;
    const data = { filePath, content, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(data));
    console.log('[IMUStreaming] Stored locally:', key);
  } catch (error) {
    console.error('[IMUStreaming] Failed to store locally:', error);
  }
};

/**
 * Reset internal state
 */
const resetState = () => {
  currentRepBuffer = [];
  currentSetNumber = 1;
  currentRepNumber = 0;
  isStreaming = false;
  workoutId = null;
  userId = null;
  authToken = null;
  repStartTime = null;
  workoutData = {
    workoutId: null,
    exercise: null,
    equipment: null,
    plannedSets: 0,
    plannedReps: 0,
    weight: 0,
    weightUnit: 'kg',
    setType: 'recommended',
    sets: []
  };
  workoutMetadata = {
    exercise: null,
    equipment: null,
    plannedSets: 0,
    plannedReps: 0,
    weight: 0,
    weightUnit: 'kg',
    completedSets: 0,
    completedReps: 0,
    status: 'pending',
    startTime: null,
    endTime: null,
    setType: 'recommended',
    sets: {}
  };
};

/**
 * Get current streaming state
 */
export const getStreamingState = () => ({
  isStreaming,
  workoutId,
  currentSet: currentSetNumber,
  currentRep: currentRepNumber,
  bufferSize: currentRepBuffer.length,
  metadata: { ...workoutMetadata },
  workoutData: { ...workoutData }
});

/**
 * Get complete workout data (for export or ML batch processing)
 */
export const getCompleteWorkoutData = () => ({ ...workoutData });

/**
 * Export workout as CSV (all sets/reps in one file)
 * Format: set,rep,timestamp,timestamp_ms,accelX,accelY,accelZ,...
 */
export const exportWorkoutAsCSV = () => {
  const headers = 'set,rep,timestamp,timestamp_ms,accelX,accelY,accelZ,accelMag,gyroX,gyroY,gyroZ,roll,pitch,yaw,filteredX,filteredY,filteredZ,filteredMag';
  const rows = [];
  
  for (const set of workoutData.sets) {
    for (const rep of set.reps) {
      for (const sample of rep.samples) {
        rows.push(
          `${sample.set},${sample.rep},${sample.timestamp},${sample.timestamp_ms},${sample.accelX},${sample.accelY},${sample.accelZ},${sample.accelMag},${sample.gyroX},${sample.gyroY},${sample.gyroZ},${sample.roll},${sample.pitch},${sample.yaw},${sample.filteredX},${sample.filteredY},${sample.filteredZ},${sample.filteredMag}`
        );
      }
    }
  }
  
  return [headers, ...rows].join('\n');
};

export default {
  initializeStreaming,
  addIMUSample,
  onRepDetected,
  onSetComplete,
  endStreaming,
  cancelStreaming,
  getStreamingState,
  getRepDataForML,
  storeRepClassification,
  getCompleteWorkoutData,
  exportWorkoutAsCSV
};
