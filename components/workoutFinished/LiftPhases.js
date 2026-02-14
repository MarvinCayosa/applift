import { useRouter } from 'next/router';

export default function LiftPhases() {
  const router = useRouter();
  const { avgConcentric, avgEccentric, totalReps } = router.query;

  // Parse values
  const concentric = parseFloat(avgConcentric) || 0;
  const eccentric = parseFloat(avgEccentric) || 0;
  const total = concentric + eccentric || 1;
  const reps = parseInt(totalReps) || 0;

  // Calculate percentages
  const concentricPercent = ((concentric / total) * 100).toFixed(1);
  const eccentricPercent = ((eccentric / total) * 100).toFixed(1);

  // Calculate delta/change metrics (placeholder - can be enhanced with historical data)
  const concentricDelta = Math.round(concentric * 10); // Example calculation
  const eccentricDelta = Math.round(eccentric * 8); // Example calculation

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 shadow-xl content-fade-up-3">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">Movement Phases</h3>
      </div>

      {/* Progress Bar - Stacked Horizontally */}
      <div className="mb-5">
        <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
          {/* Concentric portion */}
          <div 
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${concentricPercent}%` }}
          />
          {/* Eccentric portion */}
          <div 
            className="absolute inset-y-0 bg-gradient-to-r from-yellow-500 to-orange-400 transition-all duration-500"
            style={{ left: `${concentricPercent}%`, right: 0 }}
          />
        </div>
      </div>

      {/* Labels and Percentages below Progress Bar */}
      <div className="flex items-start justify-between mb-5">
        {/* Concentric Side */}
        <div className="flex items-center gap-2">
          {/* Vertical Indicator Bar */}
          <div className="w-1 h-12 bg-gradient-to-b from-teal-500 to-cyan-400 rounded-full" />
          
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-white">{concentricPercent}%</span>
            <span className="text-xs text-gray-400">Lifting Power</span>
          </div>
        </div>

        {/* Eccentric Side */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold text-white">{eccentricPercent}%</span>
            <span className="text-xs text-gray-400">Lowering Control</span>
          </div>
          
          {/* Vertical Indicator Bar */}
          <div className="w-1 h-12 bg-gradient-to-b from-yellow-500 to-orange-400 rounded-full" />
        </div>
      </div>

      {/* Average Time Section */}
      <div className="mt-4.5 pt-4.5 border-t border-white/5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Avg Time:</span>
          <span className="text-teal-400 font-semibold">{concentric.toFixed(1)}s</span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Avg Time:</span>
          <span className="text-orange-400 font-semibold">{eccentric.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}
