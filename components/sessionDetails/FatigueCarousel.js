/**
 * FatigueCarousel — Velocity Loss & Smoothness Analysis Cards
 *
 * Two-card carousel:
 * 1. Velocity Loss:
 *    • VL Formula: (Best Rep - Mean Last 3) / Best Rep × 100 (González-Badillo et al.)
 *    • Cyan color scheme for bars
 *    • VL Thresholds: <10% minimal, 10-20% low, 20-30% moderate, 30-40% high, >40% near failure
 * 
 * 2. Smoothness (Mean Jerk Magnitude):
 *    • Based on Flash & Hogan (1985) minimum-jerk model
 *    • Lower jerk = smoother movement (0-100 scale, higher = smoother)
 *    • References: Rohrer et al. (2002), Balasubramanian et al. (2012)
 */

import { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

export default function FatigueCarousel({ setsData, smoothnessData, fatigueScore: propScore, fatigueLevel: propLevel, fatigueComponents: propComponents, selectedSet = 'all' }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showVelocityInfo, setShowVelocityInfo] = useState(false);
  const [showSmoothnessInfo, setShowSmoothnessInfo] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosingOverlay, setIsClosingOverlay] = useState(false);
  const [velocitySetFilter, setVelocitySetFilter] = useState('all');
  const [smoothnessSetFilter, setSmoothnessSetFilter] = useState('all');

  // ── Swipe state for carousel ───────────────────────────────
  const [swipeStartX, setSwipeStartX] = useState(0);
  const [swipeCurrentX, setSwipeCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // ── Set filter options for tap-cycle ───────────────────────
  const setFilterOptions = useMemo(() => {
    const setNums = new Set();
    (setsData || []).forEach(s => setNums.add(s.setNumber));
    const sorted = Array.from(setNums).sort((a, b) => a - b);
    return ['all', ...sorted.map(String)];
  }, [setsData]);

  const cycleVelocityFilter = () => {
    setVelocitySetFilter(prev => {
      const idx = setFilterOptions.indexOf(prev);
      return setFilterOptions[(idx + 1) % setFilterOptions.length];
    });
  };

  const cycleSmoothnessFilter = () => {
    setSmoothnessSetFilter(prev => {
      const idx = setFilterOptions.indexOf(prev);
      return setFilterOptions[(idx + 1) % setFilterOptions.length];
    });
  };

  // ── Slide navigation ───────────────────────────────────────
  const TOTAL_SLIDES = smoothnessData && smoothnessData.length > 0 ? 2 : 1;
  const nextSlide = () => setCurrentSlide(prev => (prev + 1) % TOTAL_SLIDES);
  const prevSlide = () => setCurrentSlide(prev => (prev - 1 + TOTAL_SLIDES) % TOTAL_SLIDES);

  // ── Swipe handlers for carousel ───────────────────────────
  const handleSwipeStart = (e) => {
    setSwipeStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };
  const handleSwipeMove = (e) => {
    if (!isSwiping) return;
    setSwipeCurrentX(e.touches[0].clientX);
  };
  const handleSwipeEnd = () => {
    if (!isSwiping) return;
    const diff = swipeCurrentX - swipeStartX;
    if (Math.abs(diff) > 50) {
      if (diff < 0 && currentSlide < TOTAL_SLIDES - 1) {
        setCurrentSlide(prev => prev + 1);
      } else if (diff > 0 && currentSlide > 0) {
        setCurrentSlide(prev => prev - 1);
      }
    }
    setIsSwiping(false);
    setSwipeStartX(0);
    setSwipeCurrentX(0);
  };

  // ── Drag-to-dismiss handlers for info overlay ──────────────────────
  const handleOverlayTouchStart = (e) => {
    setDragStartY(e.touches[0].clientY);
    setIsDragging(true);
  };
  const handleOverlayTouchMove = (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragStartY;
    if (diff > 0) setDragCurrentY(diff);
  };
  const closeOverlay = (setter) => {
    setIsClosingOverlay(true);
    setTimeout(() => {
      setter(false);
      setIsClosingOverlay(false);
      setDragCurrentY(0);
    }, 250);
  };
  const handleOverlayTouchEnd = (setter) => {
    setIsDragging(false);
    if (dragCurrentY > 100) {
      closeOverlay(setter);
    } else {
      setDragCurrentY(0);
    }
  };

  // ====================================================================
  // VELOCITY LOSS METRICS — Best Rep vs Mean Last 3 methodology
  // VL = (Best Rep - Mean Last 3) / Best Rep × 100 (González-Badillo et al.)
  // ====================================================================
  const velocity = useMemo(() => {
    const activeFilter = velocitySetFilter;
    const sets = activeFilter === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(activeFilter));

    const vels = [];
    sets.forEach(set =>
      (set.repsData || []).forEach((rep, i) => {
        const mcv = parseFloat(rep.meanVelocity) || 0;
        const pv = parseFloat(rep.peakVelocity) || 0;
        const v = mcv > 0 ? mcv : pv;
        vels.push({
          rep: rep.repNumber || i + 1,
          set: set.setNumber,
          v: Math.round(v * 100) / 100,
          isFirstInSet: (rep.repNumber || i + 1) === 1,
        });
      })
    );
    if (vels.length === 0) return { vels: [], baseline: 0, threshold: 0, cv: 0, max: 0, effective: 0, total: 0, velocityLoss: 0, vlLevel: 'No Data' };

    // ── Best Rep vs Mean Last 3 methodology (González-Badillo et al.) ──────
    const MIN_V = 0.02;
    const allV = vels.map(x => x.v).filter(v => v > MIN_V);

    // ── Baseline = Best Rep (max velocity) ─────────────────────────────────
    const baseline = allV.length > 0 ? Math.max(...allV) : 0;

    const max = Math.max(...vels.map(x => x.v), 0.5);
    const meanV = allV.length > 0 ? allV.reduce((s, v) => s + v, 0) / allV.length : 0;
    const stdV = allV.length > 1 ? Math.sqrt(allV.reduce((sum, v) => sum + (v - meanV) ** 2, 0) / (allV.length - 1)) : 0;
    const cvVal = meanV > 0 ? (stdV / meanV) * 100 : 0;
    const thresholdVel = baseline * 0.8; // −20%

    // ── VL = (Best - Mean Last 3) / Best × 100 ─────────────────────────
    const lastN = Math.min(3, allV.length);
    const lastReps = allV.slice(-lastN);
    const avgLast = lastReps.length > 0 ? lastReps.reduce((s, v) => s + v, 0) / lastReps.length : 0;
    const velocityLoss = baseline > 0 ? ((baseline - avgLast) / baseline) * 100 : 0;

    // Enrich with drop info relative to Best Rep
    const enriched = vels.map(x => {
      const d = baseline > 0 ? ((baseline - x.v) / baseline) * 100 : 0;
      const isEff = x.v > MIN_V && d < 20; // Within 20% of best rep
      const isBestRep = Math.abs(x.v - baseline) < 0.001;
      return { ...x, dropPct: Math.round(Math.max(0, d) * 10) / 10, isEff, isBestRep };
    });

    return {
      vels: enriched,
      baseline: Math.round(baseline * 100) / 100,
      threshold: Math.round(thresholdVel * 100) / 100,
      cv: Math.round(cvVal * 10) / 10,
      max,
      effective: enriched.filter(x => x.isEff).length,
      total: vels.length,
      velocityLoss: Math.max(0, Math.round(velocityLoss * 10) / 10),
      // VL Level thresholds based on González-Badillo research
      vlLevel: velocityLoss < 10 ? 'Minimal' : velocityLoss < 20 ? 'Low' : velocityLoss < 30 ? 'Moderate' : velocityLoss < 40 ? 'High' : 'Near Failure',
    };
  }, [setsData, velocitySetFilter]);

  // ====================================================================
  // SMOOTHNESS METRICS — Mean Jerk scores (0-100, higher = smoother)
  // ====================================================================
  const smoothness = useMemo(() => {
    if (!smoothnessData || smoothnessData.length === 0) {
      return { scores: [], avg: 0, trend: 0, trendLevel: 'No Data', min: 0, max: 100 };
    }

    const activeFilter = smoothnessSetFilter;
    const filtered = activeFilter === 'all'
      ? smoothnessData
      : smoothnessData.filter(s => s.setNumber === parseInt(activeFilter));

    if (filtered.length === 0) {
      return { scores: [], avg: 0, trend: 0, trendLevel: 'No Data', min: 0, max: 100 };
    }

    const scores = filtered.map((d, i) => ({
      rep: d.repNumber || i + 1,
      set: d.setNumber || 1,
      score: Math.round((d.smoothnessScore || 50) * 10) / 10,
    }));

    const allScores = scores.map(s => s.score);
    const avg = allScores.reduce((s, v) => s + v, 0) / allScores.length;
    const minScore = Math.min(...allScores);
    const maxScore = Math.max(...allScores);

    // Compute trend (slope) using linear regression
    let trend = 0;
    if (scores.length >= 2) {
      const n = scores.length;
      const xMean = (n - 1) / 2;
      const yMean = avg;
      let num = 0, den = 0;
      scores.forEach((s, i) => {
        num += (i - xMean) * (s.score - yMean);
        den += (i - xMean) * (i - xMean);
      });
      trend = den !== 0 ? num / den : 0;
    }

    // Trend level interpretation
    let trendLevel;
    if (Math.abs(trend) < 0.5) {
      trendLevel = 'Stable';
    } else if (trend > 0) {
      trendLevel = trend > 2 ? 'Improving Fast' : 'Improving';
    } else {
      trendLevel = trend < -2 ? 'Declining Fast' : 'Declining';
    }

    return {
      scores,
      avg: Math.round(avg * 10) / 10,
      trend: Math.round(trend * 100) / 100,
      trendLevel,
      min: Math.max(0, minScore - 10),
      max: Math.min(100, maxScore + 10),
    };
  }, [smoothnessData, smoothnessSetFilter]);

  // ====================================================================
  // COLORS / DERIVED
  // ====================================================================
  const vlColor = (() => {
    const vl = velocity.velocityLoss;
    if (vl < 10)      return { text: 'text-green-400', bg: 'bg-green-500/20' };
    if (vl < 20)      return { text: 'text-emerald-400', bg: 'bg-emerald-500/20' };
    if (vl < 30)      return { text: 'text-yellow-400', bg: 'bg-yellow-500/20' };
    if (vl < 40)      return { text: 'text-orange-400', bg: 'bg-orange-500/20' };
    return { text: 'text-red-400', bg: 'bg-red-500/20' };
  })();

  // Smoothness color based on average
  const smoothnessColor = (() => {
    const s = smoothness.avg;
    if (s >= 75)      return { text: 'text-green-400', bg: 'bg-green-500/20' };
    if (s >= 60)      return { text: 'text-emerald-400', bg: 'bg-emerald-500/20' };
    if (s >= 45)      return { text: 'text-yellow-400', bg: 'bg-yellow-500/20' };
    if (s >= 30)      return { text: 'text-orange-400', bg: 'bg-orange-500/20' };
    return { text: 'text-red-400', bg: 'bg-red-500/20' };
  })();

  // Trend color
  const trendColor = (() => {
    const t = smoothness.trend;
    if (t > 1)        return { text: 'text-green-400', bg: 'bg-green-500/20', icon: '↑' };
    if (t > 0.3)      return { text: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: '↗' };
    if (t > -0.3)     return { text: 'text-white/60', bg: 'bg-white/10', icon: '→' };
    if (t > -1)       return { text: 'text-orange-400', bg: 'bg-orange-500/20', icon: '↘' };
    return { text: 'text-red-400', bg: 'bg-red-500/20', icon: '↓' };
  })();

  // Helper: Get color for smoothness value (for gradient line)
  const getSmoothnessColor = (score) => {
    if (score >= 75) return '#4ade80'; // green-400
    if (score >= 60) return '#34d399'; // emerald-400
    if (score >= 45) return '#facc15'; // yellow-400
    if (score >= 30) return '#fb923c'; // orange-400
    return '#f87171'; // red-400
  };

  const BAR_H = 160;
  const BP = { t: 8, b: 24, l: 4, r: 4 };
  const plotH = BAR_H - BP.t - BP.b;

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div 
      className="rounded-2xl bg-[#1a1a1a] overflow-hidden content-fade-up-3"
      onTouchStart={handleSwipeStart}
      onTouchMove={handleSwipeMove}
      onTouchEnd={handleSwipeEnd}
    >
      {/* ══════════════════════════════════════════════════════════════════════
          SLIDE 0: VELOCITY LOSS
          ══════════════════════════════════════════════════════════════════════ */}
      {currentSlide === 0 && (
        <>
      {/* ── Header: Title + Info (left) | Filter/Level pill (right) ── */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold text-white">Velocity Loss</h3>
          <button
            onClick={() => setShowVelocityInfo(true)}
            className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center text-white/30 active:text-white/60 active:bg-white/[0.15] transition-colors"
            aria-label="What is velocity loss?"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
          </button>
        </div>

        {/* Right side: filter pill + level badge */}
        <div className="flex items-center gap-2">
          {setFilterOptions.length > 1 && (
            <button
              onClick={cycleVelocityFilter}
              className="px-3 py-1.5 rounded-full bg-cyan-500/15 active:bg-cyan-500/25 transition-colors flex items-center gap-1.5"
            >
              <span className="text-xs font-bold text-cyan-400">
                {velocitySetFilter === 'all' ? 'All Sets' : `Set ${velocitySetFilter}`}
              </span>
              <svg className="w-3 h-3 text-cyan-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${vlColor.bg} ${vlColor.text}`}>
            {velocity.vlLevel}
          </div>
        </div>
      </div>

      {/* ── Velocity Loss Card Content ── */}
      <div className="px-5 pb-5">
        {velocity.vels.length === 0 ? (
          <div className="flex items-center justify-center rounded-2xl bg-white/[0.03]" style={{ height: `${BAR_H + 60}px` }}>
            <p className="text-sm text-gray-500">No velocity data</p>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[11px] text-gray-500 mb-0.5">Best Rep</p>
                <p className="text-lg font-bold text-cyan-400">{velocity.baseline}<span className="text-[10px] text-gray-500 ml-0.5">m/s</span></p>
              </div>
              <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[11px] text-gray-500 mb-0.5">Velocity Loss</p>
                <p className={`text-lg font-bold ${vlColor.text}`}>
                  {velocity.velocityLoss}<span className="text-[10px] text-gray-500 ml-0.5">%</span>
                </p>
              </div>
              <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[11px] text-gray-500 mb-0.5">Effective</p>
                <p className="text-lg font-bold text-white">{velocity.effective}<span className="text-[10px] text-gray-500 ml-0.5">/{velocity.total}</span></p>
              </div>
            </div>

            {/* Bar Chart - Cyan color scheme */}
            <div 
              className="relative rounded-2xl bg-white/[0.03] overflow-hidden" 
              style={{ height: `${BAR_H}px` }}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="overflow-x-auto scrollbar-hide h-full">
                <svg
                  className="h-full"
                  style={{ width: `${Math.max(320, velocity.vels.length * 32 + 20)}px`, minWidth: '100%' }}
                  viewBox={`0 0 ${Math.max(320, velocity.vels.length * 32 + 20)} ${BAR_H}`}
                  preserveAspectRatio="none"
                >
                  {/* Subtle horizontal grid */}
                  {[0.25, 0.5, 0.75].map(f => {
                    const svgW = Math.max(320, velocity.vels.length * 32 + 20);
                    const y = BP.t + plotH * (1 - f);
                    return <line key={f} x1="0" y1={y} x2={svgW} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
                  })}

                  {/* −20% threshold line */}
                  {velocity.threshold > 0 && velocity.max > 0 && (() => {
                    const svgW = Math.max(320, velocity.vels.length * 32 + 20);
                    const threshFrac = velocity.threshold / velocity.max;
                    const threshY = BP.t + plotH - (threshFrac * plotH);
                    return (
                      <>
                        <line x1={BP.l} y1={threshY} x2={svgW - BP.r} y2={threshY}
                          stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="5,3" opacity="0.7" />
                        <text x={BP.l + 3} y={threshY - 4}
                          fill="#a78bfa" fontSize="8" fontWeight="600" textAnchor="start" opacity="0.8">
                          −20%
                        </text>
                        <text x={svgW - BP.r - 3} y={threshY - 4}
                          fill="#a78bfa" fontSize="7" textAnchor="end" opacity="0.6">
                          {velocity.threshold.toFixed(2)}
                        </text>
                      </>
                    );
                  })()}

                  {/* Bars - Cyan color scheme */}
                  {velocity.vels.map((d, i) => {
                    const count = velocity.vels.length;
                    const svgW = Math.max(320, count * 32 + 20);
                    const gap = Math.max(3, Math.min(6, 80 / count));
                    const totalGaps = gap * (count + 1);
                    const barW = Math.max(14, (svgW - BP.l - BP.r - totalGaps) / count);
                    const x = BP.l + gap + i * (barW + gap);
                    const hFrac = velocity.max > 0 ? d.v / velocity.max : 0;
                    const barH = Math.max(4, hFrac * plotH);
                    const y = BP.t + plotH - barH;
                    // Cyan color scheme - all bars are cyan with varying opacity
                    const color = '#22d3ee'; // cyan-400
                    const op = d.isEff ? 0.9 : 0.5;
                    const textColor = d.isEff ? '#22d3ee' : '#67e8f9';
                    return (
                      <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH} fill={color} opacity={op} rx="4" ry="4" />
                        <text x={x + barW / 2} y={y - 4} fill={textColor} fontSize="8" fontWeight="600" textAnchor="middle">
                          {d.v.toFixed(2)}
                        </text>
                        <text x={x + barW / 2} y={BAR_H - 6} fill="#4b5563" fontSize="8" textAnchor="middle">
                          {d.rep}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          </>
        )}
      </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          SLIDE 1: SMOOTHNESS (Gradient Line Chart)
          ══════════════════════════════════════════════════════════════════════ */}
      {currentSlide === 1 && smoothness.scores.length > 0 && (
        <>
          {/* ── Header: Title + Info (left) | Filter/Trend pill (right) ── */}
          <div className="px-5 pt-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold text-white">Smoothness</h3>
              <button
                onClick={() => setShowSmoothnessInfo(true)}
                className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center text-white/30 active:text-white/60 active:bg-white/[0.15] transition-colors"
                aria-label="What is smoothness?"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                </svg>
              </button>
            </div>

            {/* Right side: filter pill + trend badge */}
            <div className="flex items-center gap-2">
              {setFilterOptions.length > 1 && (
                <button
                  onClick={cycleSmoothnessFilter}
                  className="px-3 py-1.5 rounded-full bg-emerald-500/15 active:bg-emerald-500/25 transition-colors flex items-center gap-1.5"
                >
                  <span className="text-xs font-bold text-emerald-400">
                    {smoothnessSetFilter === 'all' ? 'All Sets' : `Set ${smoothnessSetFilter}`}
                  </span>
                  <svg className="w-3 h-3 text-emerald-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${trendColor.bg} ${trendColor.text} flex items-center gap-1`}>
                <span>{trendColor.icon}</span>
                <span>{smoothness.trendLevel}</span>
              </div>
            </div>
          </div>

          {/* ── Smoothness Card Content ── */}
          <div className="px-5 pb-5">
            {/* Stats row */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[11px] text-gray-500 mb-0.5">Average</p>
                <p className={`text-lg font-bold ${smoothnessColor.text}`}>
                  {smoothness.avg}<span className="text-[10px] text-gray-500 ml-0.5">/100</span>
                </p>
              </div>
              <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[11px] text-gray-500 mb-0.5">Trend</p>
                <p className={`text-lg font-bold ${trendColor.text} flex items-center justify-center gap-1`}>
                  <span className="text-sm">{trendColor.icon}</span>
                  {smoothness.trend > 0 ? '+' : ''}{smoothness.trend}
                </p>
              </div>
              <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                <p className="text-[11px] text-gray-500 mb-0.5">Reps</p>
                <p className="text-lg font-bold text-white">{smoothness.scores.length}</p>
              </div>
            </div>

            {/* Simple Line Chart with values */}
            <div 
              className="relative rounded-2xl bg-white/[0.03] overflow-hidden" 
              style={{ height: `${BAR_H}px` }}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="overflow-x-auto scrollbar-hide h-full">
                {(() => {
                  const count = smoothness.scores.length;
                  const svgW = Math.max(320, count * 50 + 40);
                  const svgH = BAR_H;
                  const padL = 20, padR = 20, padT = 24, padB = 24;
                  const chartW = svgW - padL - padR;
                  const chartH = svgH - padT - padB;
                  
                  // Get score range
                  const scores = smoothness.scores.map(s => s.score);
                  const minScore = Math.max(0, Math.min(...scores) - 10);
                  const maxScore = Math.min(100, Math.max(...scores) + 10);
                  const range = Math.max(maxScore - minScore, 20);
                  
                  // Build points
                  const points = smoothness.scores.map((d, i) => {
                    const x = padL + (count === 1 ? chartW / 2 : (i / (count - 1)) * chartW);
                    const yNorm = (d.score - minScore) / range;
                    const y = padT + chartH - yNorm * chartH;
                    return { x, y, score: d.score, rep: d.rep };
                  });
                  
                  // Create line path
                  const linePath = points.length > 0
                    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
                    : '';

                  return (
                    <svg
                      className="h-full"
                      style={{ width: `${svgW}px`, minWidth: '100%' }}
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* Horizontal grid lines */}
                      {[0.25, 0.5, 0.75].map(f => {
                        const y = padT + chartH * (1 - f);
                        return <line key={f} x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
                      })}
                      
                      {/* Line connecting points */}
                      {linePath && (
                        <path
                          d={linePath}
                          fill="none"
                          stroke="rgba(255,255,255,0.25)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      
                      {/* Data points with values */}
                      {points.map((pt, i) => {
                        const color = getSmoothnessColor(pt.score);
                        return (
                          <g key={i}>
                            {/* Point circle */}
                            <circle cx={pt.x} cy={pt.y} r="5" fill={color} stroke="#1a1a1a" strokeWidth="2" />
                            {/* Value above point */}
                            <text x={pt.x} y={pt.y - 10} fill={color} fontSize="10" fontWeight="600" textAnchor="middle">
                              {pt.score.toFixed(0)}
                            </text>
                            {/* Rep number below */}
                            <text x={pt.x} y={svgH - 6} fill="#6b7280" fontSize="9" textAnchor="middle">
                              {pt.rep}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
            </div>

          </div>
        </>
      )}

      {/* ── Slide Navigation Dots (bottom) ── */}
      {TOTAL_SLIDES > 1 && (
        <div className="flex justify-center gap-1.5 py-3">
          {[...Array(TOTAL_SLIDES)].map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === i ? 'bg-white w-4' : 'bg-white/30'}`}
            />
          ))}
        </div>
      )}

      {/* ══════ Info Overlay: Velocity Loss (draggable) ══════ */}
      {showVelocityInfo && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          onClick={() => closeOverlay(setShowVelocityInfo)}
        >
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${isClosingOverlay ? 'opacity-0' : 'opacity-100'}`} />
          <div
            className={`relative w-full max-w-lg rounded-t-2xl bg-[#1e1e1e] border-t border-white/10 pb-8 ${isClosingOverlay ? 'animate-slideDown' : 'animate-slideUp'}`}
            style={{ transform: isDragging ? `translateY(${dragCurrentY}px)` : undefined }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleOverlayTouchStart}
              onTouchMove={handleOverlayTouchMove}
              onTouchEnd={() => handleOverlayTouchEnd(setShowVelocityInfo)}
            >
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              <h4 className="text-[16px] font-bold text-white mb-3">Velocity Loss</h4>
              <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                Velocity Loss measures how much your movement speed dropped from your best rep to your final reps. It's the most reliable indicator of neuromuscular fatigue during a set.
              </p>
              <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 via-slate-500/10 to-cyan-500/10 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-cyan-400 font-medium">Best Rep (Baseline)</span>
                  <span className="text-[11px] text-cyan-400/50 font-medium">Fatigued</span>
                </div>
                <div className="flex items-end justify-between h-8 gap-1">
                  {[95, 100, 92, 85, 78, 70, 65, 62].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t bg-cyan-400" style={{ height: `${h}%`, opacity: h >= 80 ? 0.9 : 0.5 }} />
                  ))}
                </div>
                <p className="text-[11px] text-white/40 mt-2 text-center">Brighter = Effective (within 20% of best). Dimmer = Fatigued (&gt;20% drop)</p>
              </div>
              <div className="space-y-2 mb-4">
                <p className="text-[13px] font-semibold text-white/70 mb-1">Key Concepts:</p>
                {[
                  { color: 'bg-cyan-400', title: 'Best Rep (Baseline)', desc: 'Your highest velocity rep represents true peak neuromuscular output — your actual capability that set.' },
                  { color: 'bg-purple-400', title: 'Velocity Loss', desc: 'Measures how much your speed dropped from best to final reps. Higher values indicate more fatigue.' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${item.color} mt-1.5 shrink-0`} />
                    <div>
                      <span className="text-[13px] font-semibold text-white/80">{item.title}</span>
                      <p className="text-[12px] text-white/40 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-white/[0.08]">
                <p className="text-[12px] font-semibold text-white/50 mb-2">Velocity Loss Thresholds</p>
                <div className="space-y-1.5">
                  {[
                    { color: 'bg-green-400', label: 'Minimal (<10%)', desc: 'Fresh muscles, possibly could push harder' },
                    { color: 'bg-emerald-400', label: 'Low (10-20%)', desc: 'Light fatigue, good for power/speed work' },
                    { color: 'bg-yellow-400', label: 'Moderate (20-30%)', desc: 'Solid effort, balanced stimulus' },
                    { color: 'bg-orange-400', label: 'High (30-40%)', desc: 'Strong fatigue, great for hypertrophy' },
                    { color: 'bg-red-400', label: 'Near Failure (>40%)', desc: 'Maximum effort, watch your form' },
                  ].map((lv, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${lv.color} shrink-0`} />
                      <span className="text-[12px] text-white/50"><span className="text-white/70 font-medium">{lv.label}</span> — {lv.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══════ Info Overlay: Smoothness (draggable) ══════ */}
      {showSmoothnessInfo && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          onClick={() => closeOverlay(setShowSmoothnessInfo)}
        >
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${isClosingOverlay ? 'opacity-0' : 'opacity-100'}`} />
          <div
            className={`relative w-full max-w-lg rounded-t-2xl bg-[#1e1e1e] border-t border-white/10 pb-8 ${isClosingOverlay ? 'animate-slideDown' : 'animate-slideUp'}`}
            style={{ transform: isDragging ? `translateY(${dragCurrentY}px)` : undefined }}
            onClick={e => e.stopPropagation()}
          >
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleOverlayTouchStart}
              onTouchMove={handleOverlayTouchMove}
              onTouchEnd={() => handleOverlayTouchEnd(setShowSmoothnessInfo)}
            >
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              <h4 className="text-[16px] font-bold text-white mb-3">Smoothness</h4>
              <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                Smoothness measures how fluid and controlled your movement is throughout each rep. Higher scores mean smoother, more controlled motion with less jerky accelerations.
              </p>

              {/* Visual example */}
              <div className="rounded-xl bg-gradient-to-r from-green-500/10 via-yellow-500/10 to-red-500/10 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-green-400 font-medium">Smooth</span>
                  <span className="text-[11px] text-red-400/50 font-medium">Jerky</span>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-green-400 via-yellow-400 to-red-400" />
                <div className="flex items-center justify-between mt-2 text-[10px] text-white/40">
                  <span>100</span>
                  <span>75</span>
                  <span>50</span>
                  <span>25</span>
                  <span>0</span>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-[13px] font-semibold text-white/70 mb-1">What Affects Smoothness:</p>
                {[
                  { color: 'bg-green-400', title: 'Controlled Tempo', desc: 'Maintaining a steady, deliberate pace throughout the lift produces higher smoothness scores.' },
                  { color: 'bg-emerald-400', title: 'Proper Form', desc: 'Good technique allows muscles to work efficiently without sudden corrections or compensations.' },
                  { color: 'bg-yellow-400', title: 'Appropriate Weight', desc: 'Using a weight you can control helps maintain smooth movement patterns.' },
                  { color: 'bg-orange-400', title: 'Fatigue Impact', desc: 'As muscles tire, smoothness typically decreases. Watch for declining trends as a fatigue signal.' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${item.color} mt-1.5 shrink-0`} />
                    <div>
                      <span className="text-[13px] font-semibold text-white/80">{item.title}</span>
                      <p className="text-[12px] text-white/40 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-white/[0.08]">
                <p className="text-[12px] font-semibold text-white/50 mb-2">Smoothness Levels</p>
                <div className="space-y-1.5">
                  {[
                    { color: 'bg-green-400', label: 'Excellent (75-100)', desc: 'Very controlled, fluid movement' },
                    { color: 'bg-emerald-400', label: 'Good (60-75)', desc: 'Solid control with minor variations' },
                    { color: 'bg-yellow-400', label: 'Moderate (45-60)', desc: 'Some jerkiness, check form' },
                    { color: 'bg-orange-400', label: 'Low (30-45)', desc: 'Significant jerkiness, form is breaking down' },
                    { color: 'bg-red-400', label: 'Poor (<30)', desc: 'Very jerky, consider reducing weight' },
                  ].map((lv, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${lv.color} shrink-0`} />
                      <span className="text-[12px] text-white/50"><span className="text-white/70 font-medium">{lv.label}</span> — {lv.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-white/[0.08]">
                <p className="text-[12px] font-semibold text-white/50 mb-2">Trend Analysis</p>
                <p className="text-[12px] text-white/40 leading-relaxed">
                  The trend indicator shows whether your smoothness is improving (↑), stable (→), or declining (↓) across reps. A declining trend often signals fatigue before other symptoms appear.
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideDown {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(100%); }
        }
        .animate-slideUp {
          animation: slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1);
        }
        .animate-slideDown {
          animation: slideDown 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
      `}</style>
    </div>
  );
}
