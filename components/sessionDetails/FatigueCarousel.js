/**
 * FatigueCarousel
 *
 * Two-slide carousel:
 *   Slide 1 - Fatigue Analysis  (donut ring + 4 diagnostic metric cards + info tooltip)
 *   Slide 2 - Velocity Loss     (stats row + bar chart)
 *
 * === Fatigue Score ===
 *   The primary fatigue score and its sub-components come from the API's
 *   kinematic analysis (computeFatigueIndicators in workoutAnalysisService).
 *
 *   Four diagnostic sub-metrics are displayed in the indicator cards:
 *     1. Velocity (D_ω)  — peak angular velocity drop, first-third vs last-third
 *     2. Slowdown (I_T)  — rep duration increase, first-third vs last-third
 *     3. Jerk (I_J)      — jerk (choppiness) increase, first-third vs last-third
 *     4. Shakiness (I_S) — tremor/instability increase, first-third vs last-third
 *
 *   When ML classification is available, the fatigue score also includes
 *   Q_exec (execution quality penalty), but this is reflected in the
 *   composite donut score rather than a separate card.
 *
 *   If API sub-metrics are not available, falls back to local estimation.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

export default function FatigueCarousel({ setsData, fatigueScore: propScore, fatigueLevel: propLevel, fatigueComponents: propComponents, selectedSet = 'all' }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [showFatigueInfo, setShowFatigueInfo] = useState(false);
  const [showVelocityInfo, setShowVelocityInfo] = useState(false);
  const [infoSlide, setInfoSlide] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosingOverlay, setIsClosingOverlay] = useState(false);
  const [infoSwipeStartX, setInfoSwipeStartX] = useState(null);
  const [infoSwipeX, setInfoSwipeX] = useState(0);
  const carouselRef = useRef(null);
  const SLIDES = 2;

  // Drag-to-dismiss handlers for info overlays
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
      setInfoSlide(0);
      setInfoSwipeX(0);
      setInfoSwipeStartX(null);
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

  // Horizontal swipe handlers for info overlay slides
  const handleInfoSwipeStart = (e) => {
    setInfoSwipeStartX(e.touches[0].clientX);
  };
  const handleInfoSwipeMove = (e) => {
    if (infoSwipeStartX === null) return;
    const dx = e.touches[0].clientX - infoSwipeStartX;
    const INFO_SLIDES = 2;
    if ((infoSlide === 0 && dx > 0) || (infoSlide === INFO_SLIDES - 1 && dx < 0)) {
      setInfoSwipeX(dx * 0.25);
    } else {
      setInfoSwipeX(dx);
    }
  };
  const handleInfoSwipeEnd = () => {
    const INFO_SLIDES = 2;
    if (Math.abs(infoSwipeX) > 50) {
      if (infoSwipeX < 0 && infoSlide < INFO_SLIDES - 1) setInfoSlide(infoSlide + 1);
      else if (infoSwipeX > 0 && infoSlide > 0) setInfoSlide(infoSlide - 1);
    }
    setInfoSwipeX(0);
    setInfoSwipeStartX(null);
  };

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

  // ======================================================================
  // FATIGUE METRICS — Use API sub-components (D_ω, I_T, I_J, I_S) directly
  // Falls back to local estimation only when API data is unavailable
  // ======================================================================
  const fatigue = useMemo(() => {
    // ---- PRIMARY: Use API sub-metrics when available ----
    const hasApiComponents = propComponents &&
      (propComponents.D_omega !== null || propComponents.I_T !== null ||
       propComponents.I_J !== null || propComponents.I_S !== null);
    const hasApiScore = typeof propScore === 'number' && propScore >= 0;

    if (hasApiComponents) {
      const D = propComponents.D_omega ?? 0;
      const T = propComponents.I_T ?? 0;
      const J = propComponents.I_J ?? 0;
      const S = propComponents.I_S ?? 0;
      const Q = propComponents.Q_exec ?? 0;
      const hasML = propComponents.hasMLClassification ?? false;

      const score = hasApiScore ? propScore : 0;

      // Convert 0-1 fractional values to percentages for display
      // Note: These are INCREASE ratios, so they can exceed 100% if the baseline was very low.
      // Cap display at 100% to avoid confusing values like "2248%", but keep raw values for status.
      const velDropRaw = Math.max(0, D * 100);
      const durIncreaseRaw = Math.max(0, T * 100);
      const jerkIncreaseRaw = Math.max(0, J * 100);
      const shakinessIncreaseRaw = Math.max(0, S * 100);
      
      // Capped values for display (max 100%)
      const velDrop = Math.min(velDropRaw, 100);
      const durIncrease = Math.min(durIncreaseRaw, 100);
      const jerkIncrease = Math.min(jerkIncreaseRaw, 100);
      const shakinessIncrease = Math.min(shakinessIncreaseRaw, 100);

      // Determine fatigue level
      let level;
      if (score < 15)      level = 'Minimal';
      else if (score < 30) level = 'Low';
      else if (score < 50) level = 'Moderate';
      else if (score < 70) level = 'High';
      else                 level = 'Severe';

      // Status thresholds for indicator cards (use RAW values for accurate status)
      const velStatus = velDropRaw < 10 ? 'good' : velDropRaw < 20 ? 'warn' : 'bad';
      const durStatus = durIncreaseRaw < 15 ? 'good' : durIncreaseRaw < 30 ? 'warn' : 'bad';
      const jerkStatus = jerkIncreaseRaw < 15 ? 'good' : jerkIncreaseRaw < 30 ? 'warn' : 'bad';
      const shakStatus = shakinessIncreaseRaw < 15 ? 'good' : shakinessIncreaseRaw < 25 ? 'warn' : 'bad';

      const indicators = [
        {
          label: 'Velocity',
          value: velDrop.toFixed(1),
          unit: '%',
          status: velStatus,
        },
        {
          label: 'Slowdown',
          value: durIncrease.toFixed(1),
          unit: '%',
          status: durStatus,
        },
        {
          label: 'Jerk',
          value: jerkIncrease.toFixed(1),
          unit: '%',
          status: jerkStatus,
        },
        {
          label: 'Shakiness',
          value: shakinessIncrease.toFixed(1),
          unit: '%',
          status: shakStatus,
        },
      ];

      return {
        score: Math.round(score * 10) / 10,
        level,
        indicators,
        hasInsufficientData: false,
        hasML,
        qExec: hasML ? Math.round(Q * 100) : null,
      };
    }

    // ---- FALLBACK: Local estimation from repsData when API unavailable ----
    const sets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));

    const velocities = [];
    const durations = [];

    sets.forEach(set =>
      (set.repsData || []).forEach(rep => {
        const mcv = parseFloat(rep.meanVelocity) || 0;
        const pv = parseFloat(rep.peakVelocity) || 0;
        const v = mcv > 0 ? mcv : pv;
        const d = parseFloat(rep.time) || parseFloat(rep.duration) || (rep.durationMs ? rep.durationMs / 1000 : 0);
        velocities.push(v);
        durations.push(d);
      })
    );

    const n = velocities.length;
    if (n < 2) {
      return { score: 0, level: 'Low', indicators: [], hasInsufficientData: true, hasML: false, qExec: null };
    }

    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // Velocity Drop (first-third vs last-third)
    const nonZeroVels = velocities.filter(v => v > 0);
    const hasVelData = nonZeroVels.length >= 2;
    const third = Math.max(1, Math.floor(nonZeroVels.length / 3));
    const avgVelFirst = hasVelData ? mean(nonZeroVels.slice(0, third)) : 0;
    const avgVelLast = hasVelData ? mean(nonZeroVels.slice(-third)) : 0;
    const velocityDrop = avgVelFirst > 0 ? Math.max(0, ((avgVelFirst - avgVelLast) / avgVelFirst) * 100) : 0;

    // Duration Increase (first-third vs last-third)
    const nonZeroDurs = durations.filter(d => d > 0);
    const hasDurData = nonZeroDurs.length >= 2;
    const dThird = Math.max(1, Math.floor(nonZeroDurs.length / 3));
    const avgDurFirst = hasDurData ? mean(nonZeroDurs.slice(0, dThird)) : 0;
    const avgDurLast = hasDurData ? mean(nonZeroDurs.slice(-dThird)) : 0;
    const durationIncrease = avgDurFirst > 0 ? Math.max(0, ((avgDurLast - avgDurFirst) / avgDurFirst) * 100) : 0;

    // Local fallback score (only velocity + duration available locally)
    let score;
    if (hasApiScore) {
      score = propScore;
    } else {
      const D = Math.max(0, velocityDrop) / 100;
      const T = Math.max(0, durationIncrease) / 100;
      score = Math.min(100, (0.50 * D + 0.50 * T) * 100);
    }

    let level;
    if (score < 15)      level = 'Minimal';
    else if (score < 30) level = 'Low';
    else if (score < 50) level = 'Moderate';
    else if (score < 70) level = 'High';
    else                 level = 'Severe';

    const velStatus = !hasVelData ? 'neutral' : velocityDrop < 10 ? 'good' : velocityDrop < 20 ? 'warn' : 'bad';
    const durStatus = !hasDurData ? 'neutral' : durationIncrease < 15 ? 'good' : durationIncrease < 30 ? 'warn' : 'bad';

    const indicators = [
      {
        label: 'Velocity',
        value: hasVelData ? velocityDrop.toFixed(1) : '--',
        unit: '%',
        status: velStatus,
      },
      {
        label: 'Slowdown',
        value: hasDurData ? durationIncrease.toFixed(1) : '--',
        unit: '%',
        status: durStatus,
      },
      {
        label: 'Jerk',
        value: '--',
        unit: '%',
        status: 'neutral',
      },
      {
        label: 'Shakiness',
        value: '--',
        unit: '%',
        status: 'neutral',
      },
    ];

    return {
      score: Math.round(score * 10) / 10,
      level,
      indicators,
      hasInsufficientData: false,
      hasML: false,
      qExec: null,
    };
  }, [setsData, selectedSet, propScore, propComponents]);

  // ======================================================================
  // VELOCITY METRICS
  // Primary metric: Mean Propulsive Velocity (MPV) when available,
  // falls back to MCV/peak velocity. Baseline: fastest of first 3 valid reps.
  // Data quality: reps with velocity ≤ 0.02 m/s are excluded as noise.
  // ======================================================================
  const velocity = useMemo(() => {
    const sets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));
    const vels = [];
    sets.forEach(set =>
      (set.repsData || []).forEach((rep, i) => {
        // Prefer MPV (meanVelocity) as primary; fall back to peakVelocity
        const mcv = parseFloat(rep.meanVelocity) || 0;
        const pv = parseFloat(rep.peakVelocity) || 0;
        const v = mcv > 0 ? mcv : pv;
        vels.push({
          rep: rep.repNumber || i + 1,
          set: set.setNumber,
          v: Math.round(v * 100) / 100,
        });
      })
    );
    if (vels.length === 0) return { vels: [], baseline: 0, cv: 0, max: 0, effective: 0, total: 0 };

    // Data quality: filter valid reps (velocity > 0.02 m/s noise floor)
    const MIN_VELOCITY = 0.02;
    const validVels = vels.filter(x => x.v > MIN_VELOCITY);

    // Baseline: fastest (max) of first 3 valid reps — more robust than avg-of-2
    const baseSize = Math.min(3, validVels.length);
    const baseReps = validVels.slice(0, baseSize);
    const baseline = baseReps.length > 0 ? Math.max(...baseReps.map(x => x.v)) : 0;
    const max = Math.max(...vels.map(x => x.v), 0.5);

    const allV = validVels.map(x => x.v);
    const meanV = allV.length > 0 ? allV.reduce((s, v) => s + v, 0) / allV.length : 0;
    const stdV = allV.length > 1 ? Math.sqrt(allV.reduce((sum, v) => sum + (v - meanV) ** 2, 0) / (allV.length - 1)) : 0;
    const cvVal = meanV > 0 ? (stdV / meanV) * 100 : 0;

    // Velocity loss per rep — 10% threshold (González-Badillo et al.)
    // Also detect surges (>20% above baseline) as compensatory momentum
    const SURGE_THRESHOLD = 20; // 20% above baseline indicates compensation
    const enriched = vels.map(x => {
      const d = baseline > 0 ? ((baseline - x.v) / baseline) * 100 : 0;
      const surgePct = baseline > 0 ? ((x.v - baseline) / baseline) * 100 : 0;
      const isSurge = surgePct > SURGE_THRESHOLD;
      return { ...x, dropPct: Math.round(d * 10) / 10, surgePct: Math.round(surgePct * 10) / 10, isEff: d < 10 && !isSurge, isSurge };
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
            <button
              onClick={() => setShowFatigueInfo(true)}
              className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-white/40 active:text-white/70 active:bg-white/[0.15] transition-colors"
              aria-label="What is fatigue analysis?"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
            </button>
          </div>

          <div className="flex gap-3 items-stretch">
            {/* Donut - sized to match indicator cards height */}
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center"
            >
              <div className="relative" style={{ width: 160, height: 160 }}>
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

            {/* 4 indicator cards */}
            <div className="flex-1 flex flex-col gap-1.5">
              {fatigue.indicators.map((ind, i) => {
                const sc = statusColor(ind.status);
                return (
                  <div key={i} className={`flex-1 rounded-xl ${sc.bg} px-3 py-1.5 flex items-center justify-between min-h-[34px]`}>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      <span className="text-[11px] text-gray-300 font-medium leading-tight">{ind.label}</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className={`text-[14px] font-bold tabular-nums ${sc.text}`}>{ind.value}</span>
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-white">Velocity Analysis</h3>
            <button
              onClick={() => setShowVelocityInfo(true)}
              className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-white/40 active:text-white/70 active:bg-white/[0.15] transition-colors"
              aria-label="What is velocity analysis?"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
              </svg>
            </button>
          </div>

          {velocity.vels.length === 0 ? (
            <div className="flex items-center justify-center rounded-2xl bg-white/[0.03]" style={{ height: `${BAR_H}px` }}>
              <p className="text-sm text-gray-500">No velocity data</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {[
                  { label: 'Baseline', value: `${velocity.baseline}`, unit: 'm/s', color: 'text-cyan-400' },
                  { label: 'Variability', value: `${velocity.cv}`, unit: '%', color: velocity.cv < 8 ? 'text-green-400' : velocity.cv < 15 ? 'text-yellow-400' : 'text-red-400' },
                  { label: 'Effective', value: `${velocity.effective}`, unit: `/${velocity.total}`, color: 'text-white' },
                ].map((m, i) => (
                  <div key={i} className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                    <p className="text-[11px] text-gray-500 mb-0.5">{m.label}</p>
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
                      // Color: cyan for effective, orange for surge (compensatory momentum), gray for fatigued
                      const color = d.isSurge ? '#f97316' : d.isEff ? '#22d3ee' : '#475569';
                      const op = d.isSurge ? 0.9 : d.isEff ? 0.9 : 0.5;
                      const textColor = d.isSurge ? '#f97316' : d.isEff ? '#22d3ee' : '#64748b';
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

      {/* ── Info Overlay: Fatigue (draggable, 2-slide) ── */}
      {showFatigueInfo && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          onClick={() => closeOverlay(setShowFatigueInfo)}
        >
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${isClosingOverlay ? 'opacity-0' : 'opacity-100'}`} />
          <div
            className={`relative w-full max-w-lg rounded-t-2xl bg-[#1e1e1e] border-t border-white/10 pb-8 ${isClosingOverlay ? 'animate-slideDown' : 'animate-slideUp'}`}
            style={{ transform: isDragging ? `translateY(${dragCurrentY}px)` : undefined }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleOverlayTouchStart}
              onTouchMove={handleOverlayTouchMove}
              onTouchEnd={() => handleOverlayTouchEnd(setShowFatigueInfo)}
            >
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Slide content — swipe left/right */}
            <div
              className="overflow-hidden"
              onTouchStart={handleInfoSwipeStart}
              onTouchMove={handleInfoSwipeMove}
              onTouchEnd={handleInfoSwipeEnd}
            >
              <div
                className={`flex ${infoSwipeStartX === null ? 'transition-transform duration-300 ease-out' : ''}`}
                style={{ transform: `translateX(calc(-${infoSlide * 100}% + ${infoSwipeX}px))` }}
              >
                {/* Slide 1: What This Means */}
                <div className="w-full shrink-0 px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                  <h4 className="text-[16px] font-bold text-white mb-3">What This Means</h4>
                  <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                    This score shows how much your muscles fatigued during the set. It compares your first few reps (when fresh) to your last few reps to measure performance drop-off.
                  </p>
                  <div className="space-y-2 mb-4">
                    <p className="text-[13px] font-semibold text-white/70 mb-1">The 4 indicators:</p>
                    {[
                      { color: 'bg-cyan-400', title: 'Speed Change', desc: 'Speed drops indicate fatigue. Speed surges may indicate compensatory momentum (swinging).' },
                      { color: 'bg-purple-400', title: 'Rep Slowdown', desc: 'How much longer each rep took toward the end.' },
                      { color: 'bg-orange-400', title: 'Jerkiness', desc: 'Whether your movement became choppy or uneven.' },
                      { color: 'bg-rose-400', title: 'Shakiness', desc: 'Whether tremor or instability increased.' },
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
                    <p className="text-[12px] font-semibold text-white/50 mb-2">Fatigue Levels</p>
                    <div className="space-y-1.5">
                      {[
                        { color: 'bg-green-400', label: 'Minimal (0–15)', desc: 'Muscles stayed fresh' },
                        { color: 'bg-green-400', label: 'Low (15–30)', desc: 'Slight fatigue toward the end' },
                        { color: 'bg-yellow-400', label: 'Moderate (30–50)', desc: 'Normal fatigue, good effort' },
                        { color: 'bg-orange-400', label: 'High (50–70)', desc: 'Great for muscle growth' },
                        { color: 'bg-red-400', label: 'Severe (70+)', desc: 'Very fatigued — watch your form' },
                      ].map((lv, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${lv.color} shrink-0`} />
                          <span className="text-[12px] text-white/50"><span className="text-white/70 font-medium">{lv.label}</span> — {lv.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Slide 2: How It Works */}
                <div className="w-full shrink-0 px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                  <h4 className="text-[16px] font-bold text-white mb-3">How It Works</h4>
                  <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                    Your reps are split into thirds. The first third (freshest) is compared to the last third (most tired) to see how much each metric changed.
                  </p>
                  <p className="text-[12px] font-semibold text-white/50 mb-2">Each indicator{'\u2019'}s weight in the final score:</p>
                  <div className="space-y-3 mb-4">
                    {[
                      { label: 'Speed Drop', weight: 35, color: 'bg-cyan-400', textColor: 'text-cyan-400' },
                      { label: 'Rep Slowdown', weight: 25, color: 'bg-purple-400', textColor: 'text-purple-400' },
                      { label: 'Jerkiness', weight: 20, color: 'bg-orange-400', textColor: 'text-orange-400' },
                      { label: 'Shakiness', weight: 20, color: 'bg-rose-400', textColor: 'text-rose-400' },
                    ].map((item, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[13px] font-medium ${item.textColor}`}>{item.label}</span>
                          <span className="text-[12px] text-white/50 font-semibold">{item.weight}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className={`h-full rounded-full ${item.color} opacity-60`} style={{ width: `${item.weight}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-white/[0.04] p-3">
                    <p className="text-[12px] text-white/50 leading-relaxed">
                      The bigger the change between your first and last reps, the higher the score. A higher score isn{'\u2019'}t always bad {'\u2014'} it can mean you pushed hard.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Slide dots */}
            <div className="flex items-center justify-center gap-1.5 pt-3">
              {[0, 1].map(i => (
                <button
                  key={i}
                  onClick={() => setInfoSlide(i)}
                  className={`rounded-full transition-all duration-300 ${infoSlide === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/25'}`}
                />
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Info Overlay: Velocity (draggable) ── */}
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
            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleOverlayTouchStart}
              onTouchMove={handleOverlayTouchMove}
              onTouchEnd={() => handleOverlayTouchEnd(setShowVelocityInfo)}
            >
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              <h4 className="text-[16px] font-bold text-white mb-3">Understanding Velocity</h4>
              <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                Velocity tracking measures how fast you push or pull the weight. Think of it like a speedometer for your muscles — the faster you can move a given weight, the more power you’re generating.
              </p>
              
              {/* Visual: Speed vs Fatigue illustration */}
              <div className="rounded-xl bg-gradient-to-r from-cyan-500/10 via-slate-500/10 to-orange-500/10 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-cyan-400 font-medium">Fresh</span>
                  <span className="text-[11px] text-slate-400 font-medium">Fatigued</span>
                  <span className="text-[11px] text-orange-400 font-medium">Surge</span>
                </div>
                <div className="flex items-end justify-between h-8 gap-1">
                  {[
                    { h: 100, type: 'eff' },
                    { h: 95, type: 'eff' },
                    { h: 92, type: 'eff' },
                    { h: 85, type: 'fat' },
                    { h: 78, type: 'fat' },
                    { h: 70, type: 'fat' },
                    { h: 130, type: 'surge' }, // Compensatory momentum spike
                  ].map((bar, i) => (
                    <div 
                      key={i} 
                      className={`flex-1 rounded-t ${bar.type === 'surge' ? 'bg-orange-500' : bar.type === 'eff' ? 'bg-cyan-400' : 'bg-slate-500'}`} 
                      style={{ height: `${Math.min(bar.h, 100)}%`, opacity: bar.type === 'fat' ? 0.5 : 0.9 }} 
                    />
                  ))}
                </div>
                <p className="text-[11px] text-white/40 mt-2 text-center">Speed drops as muscles tire. A late surge may indicate swinging/momentum compensation.</p>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-[13px] font-semibold text-white/70 mb-1">Reading the Stats:</p>
                {[
                  { color: 'bg-cyan-400', title: 'Baseline', desc: 'Your starting speed from the first few reps when you\'re freshest. This becomes your reference point.' },
                  { color: 'bg-emerald-400', title: 'Variability', desc: 'How consistent your speed is. Low (< 8%) = steady technique. High (> 15%) = inconsistent effort or form.' },
                  { color: 'bg-white/60', title: 'Effective Reps', desc: 'Reps where speed stayed within 10% of baseline. These deliver the best training stimulus for strength gains.' },
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
              
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
                <p className="text-[12px] text-white/60 leading-relaxed">
                  <span className="font-semibold text-amber-400">Pro Tip:</span> When velocity drops below 20% of baseline, it’s a sign your muscles are approaching failure. This is the ideal stopping point for strength gains without excessive fatigue.
                </p>
              </div>
              <div className="rounded-xl bg-orange-500/10 border border-orange-500/20 p-3 mb-4">
                <p className="text-[12px] text-white/60 leading-relaxed">
                  <span className="font-semibold text-orange-400">Velocity Surge:</span> If you see a bar spike above baseline (orange), it may indicate compensatory momentum — using body swing to complete the rep when muscles are too fatigued. This is a sign of fatigue even though velocity increased.
                </p>
              </div>
              <div className="pt-3 border-t border-white/[0.08]">
                <p className="text-[12px] font-semibold text-white/50 mb-2">Bar Colors</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-2 rounded-sm bg-cyan-400 opacity-90" />
                    <span className="text-[12px] text-white/50">Effective — strong output</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-2 rounded-sm bg-orange-500 opacity-90" />
                    <span className="text-[12px] text-white/50">Surge — compensatory momentum</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-2 rounded-sm bg-slate-600 opacity-50" />
                    <span className="text-[12px] text-white/50">Fatigued — speed dropped</span>
                  </div>
                </div>
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