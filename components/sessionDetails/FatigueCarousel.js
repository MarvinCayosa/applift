/**
 * FatigueCarousel
 *
 * Two-slide carousel:
 *   Slide 1 - Fatigue Analysis  (donut ring + 3 diagnostic metric cards + info tooltip)
 *   Slide 2 - Velocity Loss     (stats row + bar chart)
 *
 * === Fatigue Score ===
 *   The primary fatigue score comes from the API's kinematic analysis
 *   (first-third vs last-third degradation in velocity, tempo, jerk, shakiness,
 *    plus ML classification quality). This is the fatigueScore/fatigueLevel prop.
 *
 *   Three diagnostic sub-metrics are computed locally for the indicator cards:
 *     1. Velocity CV% — power-output consistency
 *     2. Tempo CV%    — rep duration consistency
 *     3. Smoothness Decay — movement quality degradation
 *
 *   If the API score is not available, falls back to a local composite.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

export default function FatigueCarousel({ setsData, fatigueScore: propScore, fatigueLevel: propLevel, selectedSet = 'all' }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, right: 0 });
  const infoButtonRef = useRef(null);
  const carouselRef = useRef(null);
  const SLIDES = 2;

  // Scroll tracking
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.offsetWidth);
      setActiveSlide(Math.min(idx, SLIDES - 1));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Close info tooltip on outside tap
  useEffect(() => {
    if (!showInfo) return;
    const close = () => setShowInfo(false);
    const timer = setTimeout(() => document.addEventListener('click', close, { once: true }), 10);
    return () => { clearTimeout(timer); document.removeEventListener('click', close); };
  }, [showInfo]);

  // ======================================================================
  // FATIGUE METRICS — API score is primary; local sub-metrics for diagnostics
  // ======================================================================
  const fatigue = useMemo(() => {
    const sets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));

    const velocities = [];
    const durations = [];
    const smoothnessScores = [];

    sets.forEach(set =>
      (set.repsData || []).forEach(rep => {
        const v = parseFloat(rep.peakVelocity) || 0;
        const d = parseFloat(rep.time) || parseFloat(rep.duration) || (rep.durationMs ? rep.durationMs / 1000 : 0);
        const s = rep.smoothnessScore ?? rep.smoothness ?? null;
        velocities.push(v);
        durations.push(d);
        if (s !== null && s !== undefined) smoothnessScores.push(s);
      })
    );

    const n = velocities.length;
    if (n < 2) {
      return { score: 0, level: 'Low', indicators: [], hasInsufficientData: true };
    }

    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const stdDev = arr => {
      if (arr.length < 2) return 0;
      const m = mean(arr);
      return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
    };
    const cv = arr => {
      const m = mean(arr);
      return m > 0 ? (stdDev(arr) / m) * 100 : 0;
    };

    // -- Diagnostic sub-metric 1: Velocity CV% --
    const nonZeroVels = velocities.filter(v => v > 0);
    const hasVelData = nonZeroVels.length >= 2;
    const velCV = hasVelData ? cv(nonZeroVels) : 0;

    // -- Diagnostic sub-metric 2: Tempo CV% --
    const nonZeroDurs = durations.filter(d => d > 0);
    const hasDurData = nonZeroDurs.length >= 2;
    const durCV = hasDurData ? cv(nonZeroDurs) : 0;

    // -- Diagnostic sub-metric 3: Smoothness Decay --
    const hasSmoothData = smoothnessScores.length >= 3;
    let smoothDecay = 0;
    if (hasSmoothData) {
      const third = Math.max(1, Math.floor(smoothnessScores.length / 3));
      const avgFirst = mean(smoothnessScores.slice(0, third));
      const avgLast = mean(smoothnessScores.slice(-third));
      smoothDecay = avgFirst > 0 ? Math.max(0, ((avgFirst - avgLast) / avgFirst) * 100) : 0;
    }

    // ---- PRIMARY SCORE: use API prop when available ----
    let score;
    const hasApiScore = typeof propScore === 'number' && propScore >= 0;

    if (hasApiScore) {
      score = propScore;
    } else {
      // Fallback: local composite (normalise each sub-metric then weight)
      const velFatigue  = hasVelData    ? Math.min(100, (velCV / 25) * 100)        : 0;
      const durFatigue  = hasDurData    ? Math.min(100, (durCV / 30) * 100)        : 0;
      const smoothFatigue = hasSmoothData ? Math.min(100, (smoothDecay / 40) * 100) : 0;

      let totalWeight = 0, weightedSum = 0;
      if (hasVelData)    { weightedSum += 0.40 * velFatigue;    totalWeight += 0.40; }
      if (hasDurData)    { weightedSum += 0.30 * durFatigue;    totalWeight += 0.30; }
      if (hasSmoothData) { weightedSum += 0.30 * smoothFatigue; totalWeight += 0.30; }
      score = totalWeight > 0 ? Math.min(100, weightedSum / totalWeight) : 0;
    }

    // Forgiving thresholds
    let level;
    if (score < 15)      level = 'Minimal';
    else if (score < 30) level = 'Low';
    else if (score < 50) level = 'Moderate';
    else if (score < 70) level = 'High';
    else                 level = 'Severe';

    // Status thresholds for diagnostic cards (just visual indicators)
    const velStatus = !hasVelData ? 'neutral' : velCV < 10 ? 'good' : velCV < 20 ? 'warn' : 'bad';
    const durStatus = !hasDurData ? 'neutral' : durCV < 12 ? 'good' : durCV < 25 ? 'warn' : 'bad';
    const smStatus  = !hasSmoothData ? 'neutral' : smoothDecay < 12 ? 'good' : smoothDecay < 30 ? 'warn' : 'bad';

    const indicators = [
      {
        label: 'Velocity CV',
        value: hasVelData ? velCV.toFixed(1) : '--',
        unit: '%',
        status: velStatus,
        tooltip: 'Coefficient of Variation of peak velocity across reps. Lower = more consistent power output.',
      },
      {
        label: 'Tempo CV',
        value: hasDurData ? durCV.toFixed(1) : '--',
        unit: '%',
        status: durStatus,
        tooltip: 'Coefficient of Variation of rep duration. Lower = steadier rep tempo.',
      },
      {
        label: 'Smoothness',
        value: hasSmoothData ? `-${smoothDecay.toFixed(1)}` : '--',
        unit: '%',
        status: smStatus,
        tooltip: 'Smoothness decay from first to last third (LDLJ-based). Lower = better control retention.',
      },
    ];

    return {
      score: Math.round(score * 10) / 10,
      level,
      indicators,
      hasInsufficientData: false,
    };
  }, [setsData, selectedSet, propScore]);

  // ======================================================================
  // VELOCITY METRICS
  // ======================================================================
  const velocity = useMemo(() => {
    const sets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));
    const vels = [];
    sets.forEach(set =>
      (set.repsData || []).forEach((rep, i) => {
        vels.push({
          rep: rep.repNumber || i + 1,
          set: set.setNumber,
          v: Math.round((parseFloat(rep.peakVelocity) || 0) * 100) / 100,
        });
      })
    );
    if (vels.length === 0) return { vels: [], baseline: 0, cv: 0, max: 0, effective: 0, total: 0 };

    const baseSize = Math.min(2, vels.length);
    const baseline = vels.slice(0, baseSize).reduce((s, x) => s + x.v, 0) / baseSize;
    const max = Math.max(...vels.map(x => x.v), 0.5);

    const allV = vels.map(x => x.v).filter(v => v > 0);
    const meanV = allV.length > 0 ? allV.reduce((s, v) => s + v, 0) / allV.length : 0;
    const stdV = allV.length > 1 ? Math.sqrt(allV.reduce((sum, v) => sum + (v - meanV) ** 2, 0) / (allV.length - 1)) : 0;
    const cvVal = meanV > 0 ? (stdV / meanV) * 100 : 0;

    const enriched = vels.map(x => {
      const d = baseline > 0 ? ((baseline - x.v) / baseline) * 100 : 0;
      return { ...x, dropPct: Math.round(d * 10) / 10, isEff: d < 10 };
    });

    return {
      vels: enriched,
      baseline: Math.round(baseline * 100) / 100,
      cv: Math.round(cvVal * 10) / 10,
      max,
      effective: enriched.filter(x => x.isEff).length,
      total: vels.length,
    };
  }, [setsData, selectedSet]);

  // ======================================================================
  // COLORS / DERIVED
  // ======================================================================
  const fatigueColor = (() => {
    const l = fatigue.level?.toLowerCase();
    if (l === 'minimal' || l === 'low')  return { ring: '#22c55e', text: 'text-green-400', bg: 'bg-green-500/10' };
    if (l === 'moderate')                return { ring: '#eab308', text: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    if (l === 'high')                    return { ring: '#f97316', text: 'text-orange-400', bg: 'bg-orange-500/10' };
    return { ring: '#ef4444', text: 'text-red-400', bg: 'bg-red-500/10' };
  })();

  const statusColor = s => {
    if (s === 'good') return { text: 'text-green-400', dot: 'bg-green-400', bg: 'bg-green-500/10' };
    if (s === 'warn') return { text: 'text-yellow-400', dot: 'bg-yellow-400', bg: 'bg-yellow-500/10' };
    if (s === 'bad')  return { text: 'text-red-400', dot: 'bg-red-400', bg: 'bg-red-500/10' };
    return { text: 'text-white/40', dot: 'bg-white/30', bg: 'bg-white/5' };
  };

  const R = 50;
  const C = 2 * Math.PI * R;
  const ringProg = Math.min(1, fatigue.score / 100);

  const BAR_H = 160;
  const P = { t: 8, b: 24, l: 4, r: 4 };
  const plotH = BAR_H - P.t - P.b;

  // ======================================================================
  // RENDER
  // ======================================================================
  return (
    <div className="rounded-2xl bg-[#1a1a1a] overflow-hidden content-fade-up-3">
      {/* Carousel */}
      <div
        ref={carouselRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* === Slide 1: Fatigue Analysis === */}
        <div className="w-full shrink-0 snap-center snap-always p-5 pb-3" style={{ minWidth: '100%' }}>
          {/* Header row with info button */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-bold text-white">Fatigue Analysis</h3>
            <div className="relative">
              <button
                ref={infoButtonRef}
                onClick={e => {
                  e.stopPropagation();
                  if (!showInfo && infoButtonRef.current) {
                    const rect = infoButtonRef.current.getBoundingClientRect();
                    setTooltipPos({
                      top: rect.bottom + window.scrollY + 8,
                      right: window.innerWidth - rect.right,
                    });
                  }
                  setShowInfo(!showInfo);
                }}
                className="w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.12] transition-colors"
                aria-label="How fatigue is calculated"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                </svg>
              </button>

              {/* Info Tooltip — rendered via portal so it escapes overflow:hidden */}
              {showInfo && typeof document !== 'undefined' && ReactDOM.createPortal(
                <div
                  style={{ position: 'absolute', top: tooltipPos.top, right: tooltipPos.right }}
                  className="z-[9999] w-72 rounded-xl bg-[#252525] border border-white/10 shadow-2xl p-4 animate-fadeIn"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="text-[11px] font-semibold text-white mb-2.5">How fatigue is calculated</p>
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-[10px] text-white/60 leading-relaxed">
                        The fatigue score measures how your performance degrades from early reps to late reps — velocity loss, tempo changes, jerk increase, shakiness, and movement quality.
                      </p>
                    </div>
                    <div className="pt-1 border-t border-white/[0.06]">
                      <p className="text-[10px] font-semibold text-white/70 mb-1.5">Diagnostic indicators:</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span className="text-[10px] font-semibold text-white/80">Velocity CV</span>
                      </div>
                      <p className="text-[10px] text-white/40 leading-relaxed pl-3">
                        How consistent your peak velocity is across reps. Lower = steadier power output.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                        <span className="text-[10px] font-semibold text-white/80">Tempo CV</span>
                      </div>
                      <p className="text-[10px] text-white/40 leading-relaxed pl-3">
                        How consistent your rep duration is. Erratic tempo may indicate motor control loss.
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                        <span className="text-[10px] font-semibold text-white/80">Smoothness Decay</span>
                      </div>
                      <p className="text-[10px] text-white/40 leading-relaxed pl-3">
                        Movement quality drop from early to late reps (LDLJ-based).
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
                    <p className="text-[10px] text-white/30 leading-relaxed">
                      Minimal &lt; 15 · Low &lt; 30 · Moderate &lt; 50 · High &lt; 70 · Severe ≥ 70
                    </p>
                  </div>
                </div>,
                document.body
              )}
            </div>
          </div>

          <div className="flex gap-3">
            {/* Donut - large, no background */}
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center"
              style={{ width: 160, height: 160 }}
            >
              <div className="relative" style={{ width: 140, height: 140 }}>
                <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
                  <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                  <circle
                    cx="70" cy="70" r={R}
                    fill="none"
                    stroke={fatigueColor.ring}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - ringProg)}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-[40px] font-bold leading-none ${fatigueColor.text}`}>
                    {Math.round(fatigue.score)}
                  </span>
                  <span className={`text-[13px] font-semibold mt-0.5 ${fatigueColor.text} capitalize`}>{fatigue.level}</span>
                </div>
              </div>
            </div>

            {/* 3 indicator cards */}
            <div className="flex-1 flex flex-col gap-2">
              {fatigue.indicators.map((ind, i) => {
                const sc = statusColor(ind.status);
                return (
                  <div key={i} className={`flex-1 rounded-xl ${sc.bg} px-3.5 py-2.5 flex items-center justify-between min-h-[42px]`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      <span className="text-[11px] text-gray-300 font-medium leading-tight">{ind.label}</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className={`text-[15px] font-bold tabular-nums ${sc.text}`}>{ind.value}</span>
                      <span className="text-[9px] text-gray-500">{ind.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* === Slide 2: Velocity Loss === */}
        <div className="w-full shrink-0 snap-center snap-always p-5 pb-3" style={{ minWidth: '100%' }}>
          <h3 className="text-[15px] font-bold text-white mb-3">Velocity Analysis</h3>

          {velocity.vels.length === 0 ? (
            <div className="flex items-center justify-center rounded-2xl bg-white/[0.03]" style={{ height: `${BAR_H}px` }}>
              <p className="text-sm text-gray-500">No velocity data</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {[
                  { label: 'Peak', value: `${velocity.baseline}`, unit: 'm/s', color: 'text-cyan-400' },
                  { label: 'Variability', value: `${velocity.cv}`, unit: '%', color: velocity.cv < 8 ? 'text-green-400' : velocity.cv < 15 ? 'text-yellow-400' : 'text-red-400' },
                  { label: 'Effective', value: `${velocity.effective}`, unit: `/${velocity.total}`, color: 'text-white' },
                ].map((m, i) => (
                  <div key={i} className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                    <p className="text-[10px] text-gray-500 mb-0.5">{m.label}</p>
                    <p className={`text-lg font-bold ${m.color}`}>{m.value}<span className="text-[10px] text-gray-500 ml-0.5">{m.unit}</span></p>
                  </div>
                ))}
              </div>

              <div className="relative rounded-2xl bg-white/[0.03] overflow-hidden" style={{ height: `${BAR_H}px` }}>
                <div className="overflow-x-auto scrollbar-hide h-full">
                  <svg className="h-full" style={{ width: `${Math.max(320, velocity.vels.length * 32 + 20)}px`, minWidth: '100%' }} viewBox={`0 0 ${Math.max(320, velocity.vels.length * 32 + 20)} ${BAR_H}`} preserveAspectRatio="none">
                    {[0.25, 0.5, 0.75].map(f => {
                      const svgW = Math.max(320, velocity.vels.length * 32 + 20);
                      const y = P.t + plotH * (1 - f);
                      return <line key={f} x1="0" y1={y} x2={svgW} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
                    })}
                    {velocity.vels.map((d, i) => {
                      const count = velocity.vels.length;
                      const svgW = Math.max(320, count * 32 + 20);
                      const gap = Math.max(3, Math.min(6, 80 / count));
                      const totalGaps = gap * (count + 1);
                      const barW = Math.max(14, (svgW - P.l - P.r - totalGaps) / count);
                      const x = P.l + gap + i * (barW + gap);
                      const hFrac = velocity.max > 0 ? d.v / velocity.max : 0;
                      const barH = Math.max(4, hFrac * plotH);
                      const y = P.t + plotH - barH;
                      const color = d.isEff ? '#22d3ee' : '#475569';
                      const op = d.isEff ? 0.9 : 0.5;
                      return (
                        <g key={i}>
                          <rect x={x} y={y} width={barW} height={barH} fill={color} opacity={op} rx="4" ry="4" />
                          <text x={x + barW / 2} y={y - 4} fill={d.isEff ? '#22d3ee' : '#64748b'} fontSize="8" fontWeight="600" textAnchor="middle">
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
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 pb-4 pt-1">
        {Array.from({ length: SLIDES }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              activeSlide === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/25'
            }`}
          />
        ))}
      </div>

      {/* Animation keyframe */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.15s ease-out;
        }
      `}</style>
    </div>
  );
}