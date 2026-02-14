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
 * GCS Structure (Organized by Equipment → Exercise):
 * bucket/users/{userId}/{equipment}/{exercise}/{YYYYMMDD}_{workoutId}/
 *   workout_data.json     <- Complete workout data (all sets/reps)
 *   metadata.json         <- Workout metadata (exercise, equipment, status)
 * 
 * Example:
 * bucket/users/abc123/barbell/bench-press/20260202_w1a2b3/
 * bucket/users/abc123/dumbbell/bicep-curl/20260202_w4d5e6/
 * 
 * Firestore Structure:
 * workoutLogs/{equipment}/{exercise}/{workoutId}
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
 * 
 * Handles both:
 * - RepCounter samples (accelMag field)
 * - Streaming buffer samples (rawMagnitude/filteredMagnitude fields)
 */
const sampleToMLFormat = (sample, setNum, repNum, baseTimestamp) => {
  const relativeMs = (sample.timestamp || 0) - baseTimestamp;
  
  // Handle different magnitude field names: RepCounter uses accelMag, streaming uses rawMagnitude
  const accelMag = sample.rawMagnitude ?? sample.accelMag ?? 0;
  const filteredMag = sample.filteredMagnitude ?? sample.accelMag ?? 0; // RepCounter stores filtered as accelMag
  
  return {
    set: setNum,
    rep: repNum,
    timestamp: formatTimestamp(Math.max(0, relativeMs)),
    timestamp_ms: Math.max(0, relativeMs),
    accelX: parseFloat(sample.accelX?.toFixed(4)) || 0,
    accelY: parseFloat(sample.accelY?.toFixed(4)) || 0,
    accelZ: parseFloat(sample.accelZ?.toFixed(4)) || 0,
    accelMag: parseFloat(accelMag?.toFixed?.(4) ?? accelMag) || 0,
    gyroX: parseFloat(sample.gyroX?.toFixed(4)) || 0,
    gyroY: parseFloat(sample.gyroY?.toFixed(4)) || 0,
    gyroZ: parseFloat(sample.gyroZ?.toFixed(4)) || 0,
    roll: parseFloat(sample.roll?.toFixed(2)) || 0,
    pitch: parseFloat(sample.pitch?.toFixed(2)) || 0,
    yaw: parseFloat(sample.yaw?.toFixed(2)) || 0,
    filteredX: parseFloat(sample.filteredX?.toFixed(4)) || sample.accelX || 0,
    filteredY: parseFloat(sample.filteredY?.toFixed(4)) || sample.accelY || 0,
    filteredZ: parseFloat(sample.filteredZ?.toFixed(4)) || sample.accelZ || 0,
    filteredMag: parseFloat(filteredMag?.toFixed?.(4) ?? filteredMag) || 0
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
 * Sanitize string for use in file paths
 * Converts to lowercase, replaces spaces with hyphens, removes special characters
 */
const sanitizeForPath = (str) => {
  if (!str) return 'unknown';
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '')     // Remove special characters
    .replace(/-+/g, '-')            // Replace multiple hyphens with single
    .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens
};

/**
 * Get current date in YYYYMMDD format
 */
const getDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * Generate short workout ID (for cleaner paths)
 * Format: w{timestamp36}{random4}  e.g., "wlx1a2b3"
 */
const generateWorkoutId = () => {
  const timestamp = Date.now().toString(36).slice(-6); // Last 6 chars of timestamp
  const random = Math.random().toString(36).substring(2, 6); // 4 random chars
  return `w${timestamp}${random}`;
};

/**
 * Generate GCS base path for workout
 * Format: users/{userId}/{equipment}/{exercise}/{YYYYMMDD}_{workoutId}/
 */
const getGCSBasePath = (userIdVal, equipmentVal, exerciseVal, workoutIdVal) => {
  const equipment = sanitizeForPath(equipmentVal);
  const exercise = sanitizeForPath(exerciseVal);
  const date = getDateString();
  return `users/${userIdVal}/${equipment}/${exercise}/${date}_${workoutIdVal}`;
};

// Store current GCS base path
let currentGCSBasePath = null;

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

  // Generate GCS base path: users/{userId}/{equipment}/{exercise}/{YYYYMMDD}_{workoutId}
  currentGCSBasePath = getGCSBasePath(odUSerId, equipment, exercise, workoutId);

  // Initialize workout data structure for ML
  workoutData = {
    workoutId,
    odUSerId,
    exercise,
    equipment,
    gcsPath: currentGCSBasePath,
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
    gcsPath: currentGCSBasePath,
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
    timestamp: sample.timestamp || Date.now(),
    relativeTime: sample.relativeTime || 0 // Store relative time for boundary matching
  });
  
  // Log buffer size periodically
  if (currentRepBuffer.length % 50 === 0) {
    console.log(`[IMUStreaming] Buffer size: ${currentRepBuffer.length} samples`);
  }
};

/**
 * Called when a rep is detected
 * Saves the rep data in ML-ready format
 * 
 * NEW: Prioritizes using samples passed directly from RepCounter (single source of truth)
 * Falls back to time-based filtering for legacy compatibility
 * 
 * Returns the rep data for immediate ML classification
 */
export const onRepDetected = async (repInfo = {}) => {
  if (!isStreaming) {
    console.warn('[IMUStreaming] Not streaming, ignoring rep detection');
    return null;
  }

  currentRepNumber++;
  workoutMetadata.totalReps++;

  let samplesToUse = [];
  
  // *** PRIORITY 1: Use samples passed directly from RepCounter ***
  // This is the SINGLE SOURCE OF TRUTH, like index.html's approach
  // RepCounter assigns repNumber to samples and passes them directly
  if (repInfo.samples && repInfo.samples.length > 0) {
    samplesToUse = repInfo.samples;
    console.log(`[IMUStreaming] Rep ${currentRepNumber}: Using ${samplesToUse.length} samples directly from RepCounter (indices ${repInfo.startIndex}-${repInfo.endIndex})`);
  }
  // *** PRIORITY 2: Fallback to time-based filtering (legacy) ***
  else if (repInfo.startTime !== undefined && repInfo.endTime !== undefined && currentRepBuffer.length > 0) {
    const boundaryStart = repInfo.startTime;
    const boundaryEnd = repInfo.endTime;
    
    const bufferTimeRange = currentRepBuffer.length > 0 
      ? `${currentRepBuffer[0].relativeTime?.toFixed(0) || 0}-${currentRepBuffer[currentRepBuffer.length - 1].relativeTime?.toFixed(0) || 0}ms`
      : 'empty';
    console.log(`[IMUStreaming] Rep ${currentRepNumber} fallback: filtering buffer (${currentRepBuffer.length} samples, ${bufferTimeRange}), boundaries: ${boundaryStart.toFixed(0)}-${boundaryEnd.toFixed(0)}ms`);
    
    samplesToUse = currentRepBuffer.filter(sample => {
      const sampleTime = sample.relativeTime !== undefined ? sample.relativeTime : 0;
      return sampleTime >= boundaryStart && sampleTime <= boundaryEnd;
    });
    
    console.log(`[IMUStreaming] Fallback filtered to ${samplesToUse.length} samples`);
    
    // Keep remaining samples for next rep
    const remainingSamples = currentRepBuffer.filter(sample => {
      const sampleTime = sample.relativeTime !== undefined ? sample.relativeTime : 0;
      return sampleTime > boundaryEnd;
    });
    currentRepBuffer = remainingSamples;
  }
  // *** PRIORITY 3: Use entire buffer (legacy) ***
  else if (currentRepBuffer.length > 0) {
    console.log(`[IMUStreaming] Rep ${currentRepNumber} legacy mode: using entire buffer (${currentRepBuffer.length} samples)`);
    samplesToUse = [...currentRepBuffer];
    currentRepBuffer = [];
  }
  
  if (samplesToUse.length === 0) {
    console.warn(`[IMUStreaming] Rep ${currentRepNumber}: No samples available, skipping`);
    return null;
  }

  // Get base timestamp - use the first sample's timestamp
  // For RepCounter samples: timestamp is the relativeTime
  // For buffer samples: use relativeTime or timestamp
  const baseTimestamp = samplesToUse[0]?.timestamp || samplesToUse[0]?.relativeTime || 0;
  const endTimestamp = samplesToUse[samplesToUse.length - 1]?.timestamp || samplesToUse[samplesToUse.length - 1]?.relativeTime || baseTimestamp;
  const duration = repInfo.duration ? repInfo.duration * 1000 : (endTimestamp - baseTimestamp);

  // Convert samples to ML-ready format
  const mlSamples = samplesToUse.map(sample => 
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

  // Reset rep start time for next rep
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

  console.log(`[IMUStreaming] Rep ${currentRepNumber} of Set ${currentSetNumber} recorded (${mlSamples.length} samples, ${Math.round(duration)}ms)`);

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
 * Get all reps from a set for batch ML inference
 * Used for background ML processing after set completion
 */
export const getSetRepsForML = (setNumber) => {
  const setData = workoutData.sets[setNumber - 1];
  if (!setData || !setData.reps || setData.reps.length === 0) return null;
  
  return {
    workoutId,
    exercise: workoutData.exercise,
    equipment: workoutData.equipment,
    setNumber,
    reps: setData.reps.map(rep => ({
      repNumber: rep.repNumber,
      samples: rep.samples,
      sampleCount: rep.sampleCount,
      duration: rep.duration
    }))
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

  // *** REMOVED: Don't auto-save buffer as a rep ***
  // RepCounter is the source of truth - if it didn't detect a rep, there's no rep
  // The old code created phantom reps from leftover buffer samples
  // if (currentRepBuffer.length > 0) {
  //   await onRepDetected();
  // }
  
  // Clear the buffer - these samples were not part of any detected rep
  console.log(`[IMUStreaming] Set ${currentSetNumber} ending, discarding ${currentRepBuffer.length} unused buffer samples`);
  currentRepBuffer = [];

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

  // *** REMOVED: Don't auto-save buffer as a rep ***
  // RepCounter is the source of truth - if it didn't detect a rep, there's no rep
  // if (currentRepBuffer.length > 0) {
  //   await onRepDetected();
  // }
  
  // Clear the buffer
  currentRepBuffer = [];

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
 * Path: users/{userId}/{equipment}/{exercise}/{YYYYMMDD}_{workoutId}/workout_data.json
 */
const uploadWorkoutData = async () => {
  const filePath = `${currentGCSBasePath}/workout_data.json`;
  const content = JSON.stringify(workoutData, null, 2);
  
  try {
    await uploadToGCS(filePath, content, 'application/json');
    console.log('[IMUStreaming] Uploaded workout data to:', filePath);
  } catch (error) {
    console.error('[IMUStreaming] Failed to upload workout data:', error);
    storeLocally(filePath, content);
  }
};

/**
 * Upload metadata.json to GCS
 * Path: users/{userId}/{equipment}/{exercise}/{YYYYMMDD}_{workoutId}/metadata.json
 */
const uploadMetadata = async () => {
  const filePath = `${currentGCSBasePath}/metadata.json`;
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
  currentGCSBasePath = null;
  workoutData = {
    workoutId: null,
    exercise: null,
    equipment: null,
    gcsPath: null,
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
    gcsPath: null,
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
  getSetRepsForML,
  storeRepClassification,
  getCompleteWorkoutData,
  exportWorkoutAsCSV
};
