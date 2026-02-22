import { useRouter } from 'next/router';
import EquipmentIcon from './EquipmentIcon';

export default function WorkoutCard({ workout }) {
  const router = useRouter();

  // Map equipment to background color
  const getEquipmentColor = (equipment) => {
    const colorMap = {
      'Barbell': '#FBBF24', // Yellow
      'Dumbbell': '#3B82F6', // Blue
      'Dumbell': '#3B82F6', // Blue (alternate spelling)
      'Weight Stack': '#EF4444', // Red
    };
    return colorMap[equipment] || '#7c3aed'; // default to purple
  };

  const handleClick = () => {
    // Navigate to session-details with proper query params
    const eq = workout.rawEquipment || workout.equipment?.toLowerCase().replace(/\s+/g, '-') || '';
    const ex = workout.rawExercise || workout.exercise?.toLowerCase().replace(/\s+/g, '-') || '';
    const logId = workout.logId || workout.id;
    router.push(`/session-details?logId=${logId}&eq=${encodeURIComponent(eq)}&ex=${encodeURIComponent(ex)}`);
  };

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all duration-200 cursor-pointer"
      role="button"
      aria-label={`Open history for ${workout.exercise}`}
      onClick={handleClick}
    >
      <div 
        className="w-14 h-14 flex items-center justify-center flex-shrink-0 rounded-[14px] text-white"
        style={{ backgroundColor: getEquipmentColor(workout.equipment) }}
      >
        <EquipmentIcon type={workout.equipment} className="w-8 h-6" />
      </div>
      <div className="flex-1 min-w-0 flex items-end justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm font-medium text-white truncate">{workout.exercise}</span>
            {workout.isIncomplete && (
              <svg 
                className="w-4 h-4 text-yellow-400 flex-shrink-0" 
                fill="currentColor" 
                viewBox="0 0 20 20"
                title="Incomplete workout"
              >
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="text-xs text-white/70 truncate">{workout.weight} kg | {workout.sets} sets | {workout.reps} reps</div>
        </div>
        <div className="text-xs whitespace-nowrap pb-0.5" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{workout.date}</div>
      </div>
    </div>
  );
}

