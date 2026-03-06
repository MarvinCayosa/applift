/**
 * SetVelocityOverview
 * 
 * Shows velocity trend visualization and metrics for the completed set.
 * Minimalist design showing velocity drop per rep.
 */

import { useMemo } from 'react';

export default function SetVelocityOverview({
  repsData = [],
  setNumber,
  isLoading = false
}) {
  // Calculate velocity data with Best Rep vs Mean Last 3 methodology
  const velocityData = useMemo(() => {
    if (repsData.length === 0) return { hasData: false, reps: [], baseline: 0, overallDrop: 0, effectiveCount: 0 };
    
    const velocities = repsData.map((r, i) => ({
      rep: i + 1,
      velocity: r.meanVelocity || r.peakVelocity || 0
    })).filter(v => v.velocity > 0);
    
    if (velocities.length < 1) return { hasData: false, reps: [], baseline: 0, overallDrop: 0, effectiveCount: 0 };
    
    // ── Best Rep vs Mean Last 3 methodology (González-Badillo et al.) ──────
    // Baseline = Best Rep (highest MPV) — true peak neuromuscular output
    // Benefits: Avoids slow first rep, represents actual capability
    const baseline = Math.max(...velocities.map(v => v.velocity));
    const threshold = baseline * 0.8; // 20% drop threshold
    
    // Calculate drop for each rep relative to Best Rep
    const repsWithDrop = velocities.map(v => {
      const dropPercent = baseline > 0 ? ((baseline - v.velocity) / baseline) * 100 : 0;
      const isBestRep = Math.abs(v.velocity - baseline) < 0.001;
      return {
        ...v,
        dropPercent: Math.max(0, dropPercent),
        isEffective: v.velocity >= threshold,
        isBestRep,
        normalizedHeight: baseline > 0 ? (v.velocity / baseline) * 100 : 100
      };
    });
    
    // ── VL = (Best - Mean Last 3) / Best × 100 ─────────────────────────────
    // Using last 3 reps (or all if < 3) — robust measure of fatigued state
    const lastN = Math.min(3, velocities.length);
    const lastReps = velocities.slice(-lastN);
    const avgLast = lastReps.reduce((a, b) => a + b.velocity, 0) / lastReps.length;
    const overallDrop = baseline > 0 ? Math.round(((baseline - avgLast) / baseline) * 100) : 0;
    
    // Effective reps count (within 20% of best rep)
    const effectiveCount = repsWithDrop.filter(r => r.isEffective).length;
    
    return {
      hasData: true,
      reps: repsWithDrop,
      baseline: Math.round(baseline * 100) / 100,
      threshold: Math.round(threshold * 100) / 100,
      overallDrop: Math.max(0, overallDrop),
      effectiveCount,
      totalReps: repsData.length
    };
  }, [repsData]);

  // Status badge
  const statusBadge = useMemo(() => {
    if (!velocityData.hasData) return { label: '--', color: 'bg-gray-500/20 text-gray-400' };
    if (velocityData.overallDrop < 15) return { label: 'Strong', color: 'bg-green-500/20 text-green-400' };
    if (velocityData.overallDrop < 25) return { label: 'Good', color: 'bg-yellow-500/20 text-yellow-400' };
    return { label: 'Fatigued', color: 'bg-red-500/20 text-red-400' };
  }, [velocityData]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-white/40">Analyzing...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wide">Velocity Analysis</h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge.color}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Velocity Chart - Bar chart showing velocity relative to baseline */}
      {velocityData.hasData && velocityData.reps.length > 0 && (
        <div className="bg-white/[0.06] rounded-xl p-3">
          {/* Chart container */}
          <div className="relative h-20">
            {/* Threshold line at 80% (20% drop) */}
            <div 
              className="absolute left-0 right-0 border-t border-dashed border-yellow-500/40 pointer-events-none"
              style={{ bottom: '80%' }}
            >
              <span className="absolute -right-1 -top-2.5 text-[8px] text-yellow-500/60">-20%</span>
            </div>
            
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-30">
              {[0,1,2,3].map(i => <div key={i} className="border-t border-white/10" />)}
            </div>
            
            {/* Bars container */}
            <div className="relative h-full flex items-end gap-1 px-1">
              {velocityData.reps.map((data, i) => {
                // Use normalizedHeight which is velocity/baseline * 100
                // This means baseline rep = 100%, a rep at 80% of baseline = 80%, etc.
                const barHeight = Math.max(5, Math.min(100, data.normalizedHeight));
                const barColor = data.isEffective ? 'bg-green-500' : 'bg-red-500';
                
                return (
                  <div 
                    key={data.rep}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                  >
                    {/* Bar with animation */}
                    <div 
                      className={`w-full max-w-[32px] rounded-t ${barColor} transition-all duration-500 ease-out`}
                      style={{ 
                        height: `${barHeight}%`,
                        opacity: 0.85,
                        animationDelay: `${i * 100}ms`
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Rep labels */}
          <div className="flex gap-1 px-1 mt-1">
            {velocityData.reps.map(data => (
              <div key={data.rep} className="flex-1 text-center">
                <span className="text-[9px] text-gray-500">{data.rep}</span>
              </div>
            ))}
          </div>
          
          {/* Legend */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[9px]">
            <span className="text-gray-500">
              Baseline: <span className="text-white">{velocityData.baseline} m/s</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm bg-green-500" />
                <span className="text-gray-500">Effective</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm bg-red-500" />
                <span className="text-gray-500">Fatigued</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Metrics Row - Compact 2 columns */}
      <div className="grid grid-cols-2 gap-2">
        {/* Effective Reps */}
        <div className="bg-white/[0.06] rounded-xl p-3 text-center">
          <div className="text-[9px] text-white/40 uppercase tracking-wide">Effective Reps</div>
          <div className={`text-lg font-bold ${
            velocityData.effectiveCount / velocityData.totalReps >= 0.7 ? 'text-green-400' :
            velocityData.effectiveCount / velocityData.totalReps >= 0.4 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {velocityData.hasData ? `${velocityData.effectiveCount}/${velocityData.totalReps}` : '--'}
          </div>
        </div>

        {/* Velocity Drop */}
        <div className="bg-white/[0.06] rounded-xl p-3 text-center">
          <div className="text-[9px] text-white/40 uppercase tracking-wide">Velocity Drop</div>
          <div className={`text-lg font-bold ${
            velocityData.overallDrop < 15 ? 'text-green-400' :
            velocityData.overallDrop < 25 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {velocityData.hasData ? `${velocityData.overallDrop}%` : '--'}
          </div>
        </div>
      </div>

    </div>
  );
}
