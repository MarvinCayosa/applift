/**
 * IMU Data Upload Service
 * 
 * Handles uploading raw IMU sensor data to Google Cloud Storage.
 * Uses signed URLs for secure, direct uploads from the client.
 * 
 * File structure in GCS:
 * bucket/
 *   users/
 *     {userId}/
 *       sessions/
 *         {sessionId}/
 *           imu_data.csv
 * 
 * CSV Format:
 * timestamp,accelX,accelY,accelZ,gyroX,gyroY,gyroZ,roll,pitch,yaw,rawMagnitude,filteredMagnitude,setNumber,repNumber,repLabel
 */

// API endpoint for getting signed upload URL
const UPLOAD_API_ENDPOINT = '/api/imu-upload';

/**
 * Generate CSV content from IMU data log with set/rep markers
 * @param {Array} rawDataLog - Array of IMU data samples
 * @param {Array} setsData - Array of set data with rep information
 * @param {Object} metadata - Session metadata (exercise, equipment, etc.)
 * @returns {string} CSV content
 */
export const generateIMUCSV = (rawDataLog, setsData = [], metadata = {}) => {
  if (!rawDataLog || rawDataLog.length === 0) {
    console.warn('[IMUUploadService] No data to export');
    return null;
  }

  // CSV header
  const headers = [
    'timestamp_ms',
    'accel_x',
    'accel_y', 
    'accel_z',
    'gyro_x',
    'gyro_y',
    'gyro_z',
    'roll',
    'pitch',
    'yaw',
    'raw_magnitude',
    'filtered_magnitude',
    'set_number',
    'rep_number',
    'rep_label',
    'is_rep_peak'
  ].join(',');

  // Create rep markers lookup from setsData
  const repMarkers = buildRepMarkersLookup(setsData);

  // Generate CSV rows
  const rows = rawDataLog.map((sample) => {
    // Find rep marker for this timestamp
    const marker = findRepMarker(sample.timestamp, repMarkers);
    
    return [
      sample.timestamp,
      sample.accelX?.toFixed(6) || 0,
      sample.accelY?.toFixed(6) || 0,
      sample.accelZ?.toFixed(6) || 0,
      sample.gyroX?.toFixed(6) || 0,
      sample.gyroY?.toFixed(6) || 0,
      sample.gyroZ?.toFixed(6) || 0,
      sample.roll?.toFixed(4) || 0,
      sample.pitch?.toFixed(4) || 0,
      sample.yaw?.toFixed(4) || 0,
      sample.rawMagnitude?.toFixed(6) || 0,
      sample.filteredMagnitude?.toFixed(6) || 0,
      marker.setNumber,
      marker.repNumber,
      marker.repLabel,
      marker.isPeak ? 1 : 0
    ].join(',');
  });

  // Add metadata as comments at the top
  const metadataComments = [
    `# AppLift IMU Data Export`,
    `# Generated: ${new Date().toISOString()}`,
    `# User ID: ${metadata.userId || 'unknown'}`,
    `# Session ID: ${metadata.sessionId || 'unknown'}`,
    `# Exercise: ${metadata.exerciseName || 'unknown'}`,
    `# Equipment: ${metadata.equipment || 'unknown'}`,
    `# Planned Sets: ${metadata.plannedSets || 0}`,
    `# Planned Reps: ${metadata.plannedReps || 0}`,
    `# Weight: ${metadata.weight || 0} ${metadata.weightUnit || 'kg'}`,
    `# Total Samples: ${rawDataLog.length}`,
    `# Sample Rate: ~20Hz`,
    `#`
  ].join('\n');

  return `${metadataComments}\n${headers}\n${rows.join('\n')}`;
};

/**
 * Build a lookup structure for rep markers from setsData
 */
const buildRepMarkersLookup = (setsData) => {
  const markers = [];
  
  if (!setsData || setsData.length === 0) {
    return markers;
  }

  setsData.forEach((set, setIndex) => {
    const setNumber = set.setNumber || setIndex + 1;
    
    if (set.repsData && Array.isArray(set.repsData)) {
      set.repsData.forEach((rep, repIndex) => {
        // Store rep timing info if available
        if (rep.startTime !== undefined && rep.endTime !== undefined) {
          markers.push({
            setNumber,
            repNumber: repIndex + 1,
            startTime: rep.startTime,
            endTime: rep.endTime,
            peakTime: rep.peakTime,
            label: `Set${setNumber}_Rep${repIndex + 1}`
          });
        }
      });
    }
  });

  return markers;
};

/**
 * Find rep marker for a given timestamp
 */
const findRepMarker = (timestamp, markers) => {
  for (const marker of markers) {
    if (timestamp >= marker.startTime && timestamp <= marker.endTime) {
      return {
        setNumber: marker.setNumber,
        repNumber: marker.repNumber,
        repLabel: marker.label,
        isPeak: marker.peakTime && Math.abs(timestamp - marker.peakTime) < 50 // Within 50ms of peak
      };
    }
  }
  
  // No marker found - return zeros
  return {
    setNumber: 0,
    repNumber: 0,
    repLabel: '',
    isPeak: false
  };
};

/**
 * Upload IMU CSV data to Google Cloud Storage via signed URL
 * @param {string} csvContent - The CSV content to upload
 * @param {string} userId - Firebase Auth user ID
 * @param {string} sessionId - Workout session ID
 * @param {string} authToken - Firebase Auth ID token for authentication
 * @returns {Promise<{success: boolean, path: string}>}
 */
export const uploadIMUData = async (csvContent, userId, sessionId, authToken) => {
  if (!csvContent) {
    throw new Error('No CSV content to upload');
  }

  if (!userId || !sessionId) {
    throw new Error('User ID and Session ID are required for upload');
  }

  try {
    // Step 1: Get signed upload URL from our API
    const signedUrlResponse = await fetch(UPLOAD_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        action: 'getSignedUrl',
        userId,
        sessionId,
        contentType: 'text/csv',
      }),
    });

    if (!signedUrlResponse.ok) {
      const error = await signedUrlResponse.json();
      throw new Error(error.message || 'Failed to get upload URL');
    }

    const { signedUrl, filePath } = await signedUrlResponse.json();

    // Step 2: Upload directly to GCS using signed URL
    const uploadResponse = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/csv',
      },
      body: csvContent,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    console.log('[IMUUploadService] Successfully uploaded to:', filePath);

    return {
      success: true,
      path: filePath,
    };
  } catch (error) {
    console.error('[IMUUploadService] Upload error:', error);
    throw error;
  }
};

/**
 * Upload IMU data with retry logic
 */
export const uploadIMUDataWithRetry = async (csvContent, userId, sessionId, authToken, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadIMUData(csvContent, userId, sessionId, authToken);
    } catch (error) {
      lastError = error;
      console.warn(`[IMUUploadService] Upload attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError;
};

/**
 * Store CSV locally as fallback (using IndexedDB or localStorage)
 * This can be used when upload fails and user wants to save locally
 */
export const storeCSVLocally = async (csvContent, sessionId, metadata = {}) => {
  try {
    // Use sessionStorage for immediate access
    const key = `imu_data_${sessionId}`;
    const data = {
      csvContent,
      metadata,
      timestamp: Date.now(),
      uploaded: false,
    };
    
    // Try localStorage first (persists across sessions)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
      console.log('[IMUUploadService] Stored CSV locally:', key);
      return { success: true, key };
    }
    
    return { success: false, error: 'Local storage not available' };
  } catch (error) {
    console.error('[IMUUploadService] Error storing CSV locally:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Retrieve locally stored CSV data
 */
export const getLocalCSV = (sessionId) => {
  try {
    const key = `imu_data_${sessionId}`;
    const data = localStorage.getItem(key);
    
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('[IMUUploadService] Error retrieving local CSV:', error);
    return null;
  }
};

/**
 * Remove locally stored CSV (after successful upload)
 */
export const removeLocalCSV = (sessionId) => {
  try {
    const key = `imu_data_${sessionId}`;
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('[IMUUploadService] Error removing local CSV:', error);
    return false;
  }
};

export default {
  generateIMUCSV,
  uploadIMUData,
  uploadIMUDataWithRetry,
  storeCSVLocally,
  getLocalCSV,
  removeLocalCSV,
};
