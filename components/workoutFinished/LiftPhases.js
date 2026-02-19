import { useRouter } from 'next/router';
import { useMemo } from 'react';

export default function LiftPhases({ 
  avgConcentric: propsConcentric, 
  avgEccentric: propsEccentric,
  concentricPercent: propsConcentricPercent,
  eccentricPercent: propsEccentricPercent,
  setsData  // Fallback: compute averages from per-rep phase data
}) {
  const router = useRouter();
  const { avgConcentric: queryConcentric, avgEccentric: queryEccentric } = router.query;

  // Compute average phase timings from setsData if props aren't provided
  const computedFromSets = useMemo(() => {
    if (!setsData || setsData.length === 0) return null;
    let totalLifting = 0;
    let totalLowering = 0;
    let count = 0;
    setsData.forEach(set => {
      (set.repsData || []).forEach(rep => {
        const lt = rep.liftingTime || 0;
        const lo = rep.loweringTime || 0;
        if (lt + lo > 0) {
          totalLifting += lt;
          totalLowering += lo;
          count++;
        }
      });
    });
    if (count === 0) return null;
    const avgLift = totalLifting / count;
    const avgLower = totalLowering / count;
    const total = avgLift + avgLower;
    return {
      concentric: avgLift,
      eccentric: avgLower,
      concentricPercent: total > 0 ? (avgLift / total) * 100 : 50,
      eccentricPercent: total > 0 ? (avgLower / total) * 100 : 50
    };
  }, [setsData]);

  // Priority: props > computed from setsData > query params > 0
  const concentric = propsConcentric ?? computedFromSets?.concentric ?? (parseFloat(queryConcentric) || 0);
  const eccentric = propsEccentric ?? computedFromSets?.eccentric ?? (parseFloat(queryEccentric) || 0);
  const total = concentric + eccentric || 1;

  // Calculate percentages
  const rawConcentricPercent = propsConcentricPercent ?? computedFromSets?.concentricPercent ?? ((concentric / total) * 100);
  const rawEccentricPercent = propsEccentricPercent ?? computedFromSets?.eccentricPercent ?? ((eccentric / total) * 100);
  
  // Format to 1 decimal place
  const concentricPercent = parseFloat(rawConcentricPercent).toFixed(1);
  const eccentricPercent = parseFloat(rawEccentricPercent).toFixed(1);

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
      <div className="mt-5 pt-5 border-t border-white/5 flex items-center justify-between text-sm">
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
