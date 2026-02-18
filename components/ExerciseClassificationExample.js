import React, { useState, useEffect } from 'react';
import { 
  classifyExercise, 
  checkMLApiHealth, 
  interpretClassificationResult,
  convertSensorDataToFeatures,
  mapExerciseNameToModelType,
  MLApiError 
} from '../utils/mlApi';

/**
 * Example component showing ML API integration
 * Use this as a reference for integrating ML classification into your workout components
 */
export default function ExerciseClassificationExample({ workoutData, exerciseType }) {
  const [classification, setClassification] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiHealthy, setApiHealthy] = useState(false);

  // Check ML API health on mount
  useEffect(() => {
    const checkHealth = async () => {
      const healthy = await checkMLApiHealth();
      setApiHealthy(healthy);
    };
    checkHealth();
  }, []);

  // Classify exercise when workout data changes
  useEffect(() => {
    if (workoutData && exerciseType && apiHealthy) {
      classifyWorkout();
    }
  }, [workoutData, exerciseType, apiHealthy]);

  const classifyWorkout = async () => {
    try {
      setLoading(true);
      setError(null);

      // Convert exercise name to model format
      const modelExerciseType = mapExerciseNameToModelType(exerciseType);
      
      // Convert sensor data to features
      const features = convertSensorDataToFeatures(workoutData);
      
      // Classify using ML API
      const result = await classifyExercise(modelExerciseType, features);
      
      // Interpret results for UI display
      const interpretation = interpretClassificationResult(result);
      
      setClassification({
        ...result,
        interpretation
      });

    } catch (err) {
      console.error('Classification error:', err);
      
      if (err instanceof MLApiError) {
        setError(`ML API Error: ${err.message}`);
      } else {
        setError(`Classification failed: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const getQualityColor = (score) => {
    if (score >= 3) return 'text-green-500';
    if (score >= 2) return 'text-yellow-500';
    if (score >= 1) return 'text-orange-500';
    return 'text-red-500';
  };

  const getQualityIcon = (score) => {
    if (score >= 3) return '🏆';
    if (score >= 2) return '👍';
    if (score >= 1) return '👌';
    return '⚠️';
  };

  if (!apiHealthy) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <span className="text-red-500">⚠️</span>
          <h3 className="text-red-800 font-medium">ML Service Unavailable</h3>
        </div>
        <p className="text-red-600 text-sm mt-1">
          Exercise quality analysis is currently unavailable. 
          Please check your connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Exercise Quality Analysis</h3>
        <button 
          onClick={classifyWorkout}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
        >
          {loading ? 'Analyzing...' : 'Analyze Form'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600">Analyzing your workout form...</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <span className="text-red-500">❌</span>
            <h4 className="text-red-800 font-medium">Analysis Failed</h4>
          </div>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      )}

      {classification && (
        <div className="space-y-4">
          {/* Overall Score */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {getQualityIcon(classification.prediction)}
              </span>
              <div>
                <h4 className="font-semibold text-gray-900">
                  Form Quality: 
                  <span className={`ml-2 ${getQualityColor(classification.prediction)}`}>
                    {classification.interpretation.qualityLabel}
                  </span>
                </h4>
                <p className="text-sm text-gray-600">
                  Confidence: {classification.interpretation.confidence}% 
                  ({classification.interpretation.confidenceLevel})
                </p>
              </div>
            </div>
          </div>

          {/* Feedback */}
          {classification.interpretation.feedback && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">💡 Feedback</h4>
              <p className="text-blue-800 text-sm">
                {classification.interpretation.feedback}
              </p>
            </div>
          )}

          {/* Detailed Scores */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <h5 className="font-medium text-gray-700 text-sm mb-2">Quality Score</h5>
              <div className="flex items-center gap-2">
                <div className="bg-blue-500 h-2 rounded-full flex-1">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(classification.prediction / 3) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {classification.prediction}/3
                </span>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <h5 className="font-medium text-gray-700 text-sm mb-2">Confidence</h5>
              <div className="flex items-center gap-2">
                <div className="bg-green-500 h-2 rounded-full flex-1">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${classification.interpretation.confidence}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {classification.interpretation.confidence}%
                </span>
              </div>
            </div>
          </div>

          {/* Probability Distribution */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h5 className="font-medium text-gray-700 mb-3">Quality Distribution</h5>
            <div className="space-y-2">
              {['Poor', 'Fair', 'Good', 'Excellent'].map((label, index) => {
                const probability = classification.interpretation.probabilities[index] || 0;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-600 w-16">
                      {label}
                    </span>
                    <div className="bg-gray-300 h-2 rounded-full flex-1">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          index === classification.prediction ? 'bg-blue-500' : 'bg-gray-400'
                        }`}
                        style={{ width: `${probability}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 w-8">
                      {probability}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Technical Details (collapsible) */}
          <details className="bg-gray-50 rounded-lg p-4">
            <summary className="font-medium text-gray-700 cursor-pointer">
              Technical Details
            </summary>
            <div className="mt-3 text-sm text-gray-600">
              <p><strong>Exercise:</strong> {classification.exercise_type}</p>
              <p><strong>Model:</strong> {classification.model_used}</p>
              <p><strong>Raw Prediction:</strong> {classification.prediction}</p>
              <p><strong>Raw Confidence:</strong> {classification.confidence.toFixed(4)}</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// Example of how to use this component in your workout pages:
/*
function WorkoutMonitorPage() {
  const [workoutData, setWorkoutData] = useState(null);
  const [currentExercise, setCurrentExercise] = useState('concentration curls');

  // Your existing workout monitoring logic...

  return (
    <div className="p-4">
      {/* Your existing workout UI */}
      
      {/* Add ML classification */}
      <ExerciseClassificationExample 
        workoutData={workoutData}
        exerciseType={currentExercise}
      />
    </div>
  );
}
*/