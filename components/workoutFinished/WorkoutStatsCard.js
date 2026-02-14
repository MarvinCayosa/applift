export default function WorkoutStatsCard({ totalReps, calories, totalTime }) {
  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Reps */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center">
        <div className="w-10 h-10 mb-2 flex items-center justify-center">
          <img 
            src="/images/icons/applift-logo.png" 
            alt="Reps" 
            className="w-8 h-8 object-contain"
          />
        </div>
        <div className="text-2xl font-bold text-gray-900">{totalReps || 0}</div>
        <div className="text-xs text-gray-500 mt-1.5">Reps</div>
      </div>

      {/* Calories */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center">
        <div className="w-10 h-10 mb-2 flex items-center justify-center">
          <img 
            src="/images/icons/burn-icon.png" 
            alt="Calories" 
            className="w-8 h-8 object-contain"
          />
        </div>
        <div className="text-2xl font-bold text-gray-900">{calories || 0}</div>
        <div className="text-xs text-gray-500 mt-1.5">Calories</div>
      </div>

      {/* Time */}
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center">
        <div className="w-10 h-10 mb-2 flex items-center justify-center">
          <img 
            src="/images/icons/time-icon.png" 
            alt="Time" 
            className="w-8 h-8 object-contain"
          />
        </div>
        <div className="text-2xl font-bold text-gray-900">{formatTime(totalTime || 0)}</div>
        <div className="text-xs text-gray-500 mt-1.5">Time</div>
      </div>
    </div>
  );
}
