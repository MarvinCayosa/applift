/**
 * FormQualitySummary Component
 * 
 * Displays ML classification summary for the workout.
 * Shows distribution of rep quality classifications.
 */

export default function FormQualitySummary({ mlClassification, totalReps }) {
  // Default state when no ML data available
  if (!mlClassification) {
    return (
      <div className="bg-gray-800/50 rounded-2xl p-4 sm:p-5 lg:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-white mb-3">Form Quality</h3>
        <p className="text-gray-400 text-sm">Classification data not available</p>
      </div>
    );
  }

  const { 
    cleanPercentage = 0, 
    distributionPercent = {}, 
    qualityLabels = ['Clean', 'Uncontrolled', 'Abrupt'],
    mlModelUsed = false,
    modelAvailable = false
  } = mlClassification;

  // Get the dominant classification
  const getDominantClass = () => {
    if (cleanPercentage >= 70) return { label: 'Excellent Form', color: 'text-green-500', bgColor: 'bg-green-500/20' };
    if (cleanPercentage >= 50) return { label: 'Good Form', color: 'text-green-400', bgColor: 'bg-green-500/10' };
    if (cleanPercentage >= 30) return { label: 'Needs Work', color: 'text-yellow-500', bgColor: 'bg-yellow-500/20' };
    return { label: 'Needs Improvement', color: 'text-red-500', bgColor: 'bg-red-500/20' };
  };

  const dominant = getDominantClass();

  // Colors for different labels — prediction 0=green, 1=yellow, 2=red
  const PRED_2_LABELS = [
    'Abrupt Initiation', 'Abrupt', 'Inclination Asymmetry', 'Inclination',
    'Releasing Too Fast', 'Release Fast', 'Poor Form', 'Bad Form',
  ];
  const getLabelColor = (label, index) => {
    if (label === 'Clean' || index === 0) return '#22c55e'; // Green
    if (PRED_2_LABELS.some((l) => label.includes(l) || l.includes(label)) || index === 2) return '#ef4444'; // Red
    return '#f59e0b'; // Yellow
  };

  return (
    <div className="bg-gray-800/50 rounded-2xl p-4 sm:p-5 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-white">Form Quality</h3>
        {mlModelUsed && (
          <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
            ML
          </span>
        )}
      </div>

      {/* Main Stat */}
      <div className={`rounded-xl p-4 ${dominant.bgColor} mb-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-300 mb-1">Clean Reps</p>
            <p className={`text-3xl sm:text-4xl font-bold ${dominant.color}`}>
              {cleanPercentage}%
            </p>
          </div>
          <div className="text-right">
            <p className={`text-lg sm:text-xl font-semibold ${dominant.color}`}>
              {dominant.label}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {Math.round((cleanPercentage / 100) * (totalReps || 0))} / {totalReps || 0} reps
            </p>
          </div>
        </div>
      </div>

      {/* Distribution Bars */}
      <div className="space-y-3">
        {qualityLabels.map((label, index) => {
          const percent = distributionPercent[label] || 0;
          const color = getLabelColor(label, index);
          
          return (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-300">{label}</span>
                <span className="text-gray-400">{percent}%</span>
              </div>
              <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ 
                    width: `${percent}%`,
                    backgroundColor: color
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Model Status */}
      <div className="mt-4 pt-3 border-t border-gray-700/50">
        <p className="text-xs text-gray-500">
          {mlModelUsed 
            ? 'Classified using trained ML model' 
            : modelAvailable 
              ? 'ML model available but not used' 
              : 'Using rule-based classification'}
        </p>
      </div>
    </div>
  );
}
