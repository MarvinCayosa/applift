/**
 * ML Classification API Client
 * Client for communicating with the Cloud Run ML classification service
 */

const ML_API_BASE_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8080';

/**
 * Classification request interface
 * @typedef {Object} ClassificationRequest
 * @property {string} exercise_type - Type of exercise (e.g., "CONCENTRATION_CURLS")
 * @property {Object} features - Feature dictionary for classification
 */

/**
 * Classification response interface
 * @typedef {Object} ClassificationResponse
 * @property {number} prediction - Predicted class/quality score
 * @property {number} confidence - Confidence level (0-1)
 * @property {number[]} probabilities - Probability distribution
 * @property {string} exercise_type - Exercise type that was classified
 * @property {string} model_used - Name of the model file used
 */

export class MLApiError extends Error {
  constructor(message, status = null, response = null) {
    super(message);
    this.name = 'MLApiError';
    this.status = status;
    this.response = response;
  }
}

/**
 * Check if the ML API is available
 * @returns {Promise<boolean>} True if API is healthy
 */
export async function checkMLApiHealth() {
  try {
    const response = await fetch(`${ML_API_BASE_URL}/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    return response.ok;
  } catch (error) {
    console.error('ML API health check failed:', error);
    return false;
  }
}

/**
 * Get list of available ML models
 * @returns {Promise<Object>} Available models information
 */
export async function getAvailableModels() {
  try {
    const response = await fetch(`${ML_API_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new MLApiError(
        `Failed to get models: ${response.statusText}`,
        response.status,
        response
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting available models:', error);
    throw error;
  }
}

/**
 * Classify a single exercise using ML model
 * @param {string} exerciseType - Type of exercise to classify
 * @param {Object} features - Features extracted from workout data
 * @returns {Promise<ClassificationResponse>} Classification result
 */
export async function classifyExercise(exerciseType, features) {
  try {
    // Validate input
    if (!exerciseType || typeof exerciseType !== 'string') {
      throw new MLApiError('Exercise type is required and must be a string');
    }

    if (!features || typeof features !== 'object') {
      throw new MLApiError('Features are required and must be an object');
    }

    const requestBody = {
      exercise_type: exerciseType.toUpperCase(),
      features: features
    };

    console.log('Sending classification request:', {
      url: `${ML_API_BASE_URL}/classify`,
      body: requestBody
    });

    const response = await fetch(`${ML_API_BASE_URL}/classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new MLApiError(
        `Classification failed: ${errorData.detail || response.statusText}`,
        response.status,
        errorData
      );
    }

    const result = await response.json();
    console.log('Classification result:', result);

    return result;
  } catch (error) {
    console.error('Error during exercise classification:', error);
    throw error;
  }
}

/**
 * Classify multiple exercises in batch
 * @param {ClassificationRequest[]} requests - Array of classification requests
 * @returns {Promise<Object>} Batch classification results
 */
export async function classifyExercisesBatch(requests) {
  try {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new MLApiError('Requests must be a non-empty array');
    }

    const response = await fetch(`${ML_API_BASE_URL}/batch-classify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requests)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new MLApiError(
        `Batch classification failed: ${errorData.detail || response.statusText}`,
        response.status,
        errorData
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error during batch classification:', error);
    throw error;
  }
}

/**
 * Helper function to map exercise names to model format
 * @param {string} exerciseName - Human readable exercise name
 * @returns {string} Model-compatible exercise type
 */
export function mapExerciseNameToModelType(exerciseName) {
  const exerciseMap = {
    'concentration curls': 'CONCENTRATION_CURLS',
    'concentration_curls': 'CONCENTRATION_CURLS',
    'bicep curls': 'CONCENTRATION_CURLS',
    'curls': 'CONCENTRATION_CURLS',
    
    'lateral pulldown': 'LATERAL_PULLDOWN',
    'lateral_pulldown': 'LATERAL_PULLDOWN',
    'pulldown': 'LATERAL_PULLDOWN',
    'lat pulldown': 'LATERAL_PULLDOWN',
    
    'overhead extensions': 'OVERHEAD_EXTENSIONS',
    'overhead_extensions': 'OVERHEAD_EXTENSIONS',
    'overhead extension': 'OVERHEAD_EXTENSIONS',
    'tricep extensions': 'OVERHEAD_EXTENSIONS',
    'extensions': 'OVERHEAD_EXTENSIONS'
  };

  const normalized = exerciseName.toLowerCase().trim();
  return exerciseMap[normalized] || exerciseName.toUpperCase();
}

/**
 * Helper function to interpret classification results
 * @param {ClassificationResponse} result - Classification result from API
 * @returns {Object} Interpreted result with quality assessment
 */
export function interpretClassificationResult(result) {
  const { prediction, confidence, probabilities } = result;
  
  // Determine quality based on prediction (assuming 0=poor, 1=fair, 2=good, 3=excellent)
  const qualityLabels = ['Poor', 'Fair', 'Good', 'Excellent'];
  const qualityLabel = qualityLabels[prediction] || 'Unknown';
  
  // Determine confidence level
  let confidenceLevel = 'Low';
  if (confidence >= 0.8) confidenceLevel = 'High';
  else if (confidence >= 0.6) confidenceLevel = 'Medium';
  
  // Generate feedback message
  let feedback = '';
  if (prediction <= 1 && confidence >= 0.7) {
    feedback = 'Form needs improvement. Focus on controlled movements.';
  } else if (prediction >= 2 && confidence >= 0.7) {
    feedback = 'Good form! Keep up the excellent work.';
  } else if (confidence < 0.6) {
    feedback = 'Unable to assess form reliably. Ensure proper sensor placement.';
  }

  return {
    qualityLabel,
    confidenceLevel,
    feedback,
    score: prediction,
    confidence: Math.round(confidence * 100),
    probabilities: probabilities.map(p => Math.round(p * 100)),
    raw: result
  };
}

/**
 * Convert workout sensor data to ML features
 * @param {Object} sensorData - Raw sensor data from workout
 * @returns {Object} Features formatted for ML model
 */
export function convertSensorDataToFeatures(sensorData) {
  // This function should extract relevant features from your sensor data
  // Adjust based on what features your models expect
  
  if (!sensorData || typeof sensorData !== 'object') {
    throw new Error('Invalid sensor data provided');
  }

  // Example feature extraction - modify based on your actual data structure
  const features = {
    // Acceleration features
    mean_acceleration_x: sensorData.acceleration?.x?.mean || 0,
    mean_acceleration_y: sensorData.acceleration?.y?.mean || 0,
    mean_acceleration_z: sensorData.acceleration?.z?.mean || 0,
    max_acceleration: sensorData.acceleration?.magnitude?.max || 0,
    min_acceleration: sensorData.acceleration?.magnitude?.min || 0,
    
    // Gyroscope features  
    mean_gyro_x: sensorData.gyroscope?.x?.mean || 0,
    mean_gyro_y: sensorData.gyroscope?.y?.mean || 0,
    mean_gyro_z: sensorData.gyroscope?.z?.mean || 0,
    max_angular_velocity: sensorData.gyroscope?.magnitude?.max || 0,
    
    // Timing features
    rep_duration: sensorData.timing?.duration || 0,
    peaks_count: sensorData.peaks?.count || 0,
    
    // Movement quality features
    smoothness: sensorData.quality?.smoothness || 0,
    consistency: sensorData.quality?.consistency || 0,
    range_of_motion: sensorData.quality?.range_of_motion || 0,
    
    // Add any other features your models expect
  };

  // Remove any NaN or undefined values
  Object.keys(features).forEach(key => {
    if (isNaN(features[key]) || features[key] === undefined) {
      features[key] = 0;
    }
  });

  return features;
}

export default {
  checkMLApiHealth,
  getAvailableModels,
  classifyExercise,
  classifyExercisesBatch,
  mapExerciseNameToModelType,
  interpretClassificationResult,
  convertSensorDataToFeatures,
  MLApiError
};