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
    router.push(`/history?exercise=${encodeURIComponent(workout.exercise)}&date=${encodeURIComponent(workout.date)}`);
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
          <div className="text-sm font-medium text-white truncate mb-1">{workout.exercise}</div>
          <div className="text-xs text-white/70 truncate">{workout.weight} kg | {workout.sets} sets | {workout.reps} reps</div>
        </div>
        <div className="text-xs whitespace-nowrap pb-0.5" style={{ color: 'rgba(255, 255, 255, 0.3)' }}>{workout.date}</div>
      </div>
    </div>
  );
}

