/**
 * SetVelocityOverview
 * 
 * Shows velocity trend visualization and metrics for the completed set.
 * Minimalist design showing velocity drop per rep.
 */

import { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

export default function SetVelocityOverview({
  repsData = [],
  setNumber,
  isLoading = false
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [isClosingInfo, setIsClosingInfo] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleOverlayTouchStart = (e) => { setDragStartY(e.touches[0].clientY); setIsDragging(true); };
  const handleOverlayTouchMove = (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragStartY;
    if (diff > 0) setDragCurrentY(diff);
  };
  const closeInfo = () => {
    setIsClosingInfo(true);
    setTimeout(() => { setShowInfo(false); setIsClosingInfo(false); setDragCurrentY(0); }, 250);
  };
  const handleOverlayTouchEnd = () => {
    setIsDragging(false);
    if (dragCurrentY > 100) closeInfo(); else setDragCurrentY(0);
  };
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
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wide">Velocity Analysis</h3>
          <button
            onClick={() => setShowInfo(true)}
            className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center text-white/30 active:text-white/60 active:bg-white/[0.15] transition-colors"
            aria-label="What is velocity analysis?"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
          </button>
        </div>
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

      {/* Velocity Analysis Info Modal */}
      {showInfo && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          onClick={closeInfo}
        >
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${isClosingInfo ? 'opacity-0' : 'opacity-100'}`} />
          <div
            className={`relative w-full max-w-lg rounded-t-2xl bg-[#1e1e1e] border-t border-white/10 pb-8 ${isClosingInfo ? 'animate-slideDown' : 'animate-slideUp'}`}
            style={{ transform: isDragging ? `translateY(${dragCurrentY}px)` : undefined }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleOverlayTouchStart}
              onTouchMove={handleOverlayTouchMove}
              onTouchEnd={handleOverlayTouchEnd}
            >
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              <h4 className="text-[16px] font-bold text-white mb-3">Velocity Analysis</h4>
              <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                This shows how fast you moved the weight on each rep. Speed naturally drops as you get tired — tracking it helps you know when to stop or rest.
              </p>

              {/* Visual example */}
              <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 via-slate-500/10 to-cyan-500/10 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-cyan-400 font-medium">Best Rep</span>
                  <span className="text-[11px] text-red-400/70 font-medium">Getting Tired</span>
                </div>
                <div className="flex items-end justify-between h-8 gap-1">
                  {[90, 100, 95, 85, 75, 65, 55, 50].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-cyan-400" style={{ height: `${h}%`, opacity: h >= 80 ? 0.9 : 0.45 }} />
                  ))}
                </div>
                <p className="text-[11px] text-white/40 mt-2 text-center">Bright = Effective rep. Dim = Speed dropped too much</p>
              </div>

              <div className="space-y-3 mb-4">
                <p className="text-[13px] font-semibold text-white/70">What the numbers mean:</p>
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-[13px] font-semibold text-white/80">Effective Reps</span>
                    <p className="text-[12px] text-white/40 leading-relaxed">Reps where your speed stayed within 20% of your best rep. These are the reps that actually build strength and muscle.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-[13px] font-semibold text-white/80">Fatigued Reps</span>
                    <p className="text-[12px] text-white/40 leading-relaxed">Reps where your speed dropped more than 20%. Your muscles are tired and form may start to break down.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-[13px] font-semibold text-white/80">Velocity Drop %</span>
                    <p className="text-[12px] text-white/40 leading-relaxed">How much slower your last few reps were compared to your best rep. Under 20% is good. Over 30% means you pushed hard into fatigue.</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.04] p-3 mb-2">
                <p className="text-[12px] text-white/50 leading-relaxed">
                  <span className="text-white/70 font-medium">Tip:</span> If your velocity drop is consistently over 30%, try resting longer between sets or reducing the weight slightly.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
