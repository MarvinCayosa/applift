/**
 * FatigueVelocityCarousel Component
 * 
 * Swipeable 2-slide carousel combining Fatigue Analysis and Velocity Loss.
 * Uses native CSS scroll-snap (same pattern as ExerciseInfoPanel carousel).
 * 
 * Slide 1: Fatigue — circular ring gauge + 3 indicator cards (2-column)
 * Slide 2: Velocity — bar chart showing peak velocity per rep with drop %
 * 
 * White dot indicators at bottom for navigation feedback.
 */

import { useMemo, useState, useRef, useEffect } from 'react';

export default function FatigueVelocityCarousel({
  setsData,
  chartData,
  fatigueScore: propsFatigueScore,
  fatigueLevel: propsFatigueLevel,
  analysisData,
  selectedSet = 'all',
  thresholdPercent = 10
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef(null);
  const totalSlides = 2;

  // ── Scroll tracking (same pattern as ExerciseInfoPanel) ─────────────
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const slideWidth = container.offsetWidth;
      const newIndex = Math.round(scrollLeft / slideWidth);
      setActiveSlide(Math.min(newIndex, totalSlides - 1));
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // ── Fatigue Metrics ─────────────────────────────────────────────────
  const fatigueMetrics = useMemo(() => {
    const filteredSets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));

    const velocities = [];
    const durations = [];
    const smoothnessScores = [];

    filteredSets.forEach(set => {
      if (set.repsData && Array.isArray(set.repsData)) {
        set.repsData.forEach(rep => {
          velocities.push(parseFloat(rep.peakVelocity) || 0);
          durations.push(parseFloat(rep.time) || 0);
          smoothnessScores.push(rep.smoothnessScore || 70);
        });
      }
    });

    const totalReps = durations.length;
    if (totalReps < 3) {
      return {
        fatigueScore: propsFatigueScore || 0,
        fatigueLevel: propsFatigueLevel || 'Low',
        totalReps,
        indicators: []
      };
    }

    const third = Math.max(1, Math.floor(totalReps / 3));
    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const avgVelFirst = mean(velocities.slice(0, third));
    const avgVelLast = mean(velocities.slice(-third));
    const velocityDrop = avgVelFirst > 0 ? ((avgVelFirst - avgVelLast) / avgVelFirst) * 100 : 0;

    const avgDurFirst = mean(durations.slice(0, third));
    const avgDurLast = mean(durations.slice(-third));
    const durationIncrease = avgDurFirst > 0 ? ((avgDurLast - avgDurFirst) / avgDurFirst) * 100 : 0;

    const avgSmoothFirst = mean(smoothnessScores.slice(0, third));
    const avgSmoothLast = mean(smoothnessScores.slice(-third));
    const smoothnessDrop = avgSmoothFirst > 0 ? ((avgSmoothFirst - avgSmoothLast) / avgSmoothFirst) * 100 : 0;

    let fatigueScore = selectedSet === 'all' ? propsFatigueScore : null;
    if (fatigueScore == null) {
      const D = Math.max(0, velocityDrop) / 100;
      const T = Math.max(0, durationIncrease) / 100;
      const J = Math.max(0, smoothnessDrop) / 100;
      fatigueScore = Math.min(100, (0.35 * D + 0.25 * T + 0.20 * J + 0.20 * J) * 100);
    }

    let fatigueLevel = selectedSet === 'all' ? propsFatigueLevel : null;
    if (!fatigueLevel) {
      if (fatigueScore < 10) fatigueLevel = 'Minimal';
      else if (fatigueScore < 20) fatigueLevel = 'Low';
      else if (fatigueScore < 35) fatigueLevel = 'Moderate';
      else if (fatigueScore < 55) fatigueLevel = 'High';
      else fatigueLevel = 'Severe';
    }

    const indicators = [
      { label: 'Velocity', value: Math.max(0, velocityDrop).toFixed(1), unit: '%', status: velocityDrop < 10 ? 'good' : velocityDrop < 20 ? 'warn' : 'bad' },
      { label: 'Slowdown', value: Math.max(0, durationIncrease).toFixed(1), unit: '%', status: durationIncrease < 15 ? 'good' : durationIncrease < 30 ? 'warn' : 'bad' },
      { label: 'Control', value: Math.max(0, smoothnessDrop).toFixed(1), unit: '%', status: smoothnessDrop < 10 ? 'good' : smoothnessDrop < 25 ? 'warn' : 'bad' }
    ];

    return {
      fatigueScore: Math.round(fatigueScore * 10) / 10,
      fatigueLevel,
      totalReps,
      indicators
    };
  }, [setsData, propsFatigueScore, propsFatigueLevel, selectedSet]);

  // ── Velocity Metrics ────────────────────────────────────────────────
  const velocityMetrics = useMemo(() => {
    const filteredSets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));

    const velocities = [];
    filteredSets.forEach(set => {
      if (set.repsData && Array.isArray(set.repsData)) {
        set.repsData.forEach((rep, idx) => {
          const velocity = parseFloat(rep.peakVelocity) || 0;
          velocities.push({
            repNumber: rep.repNumber || idx + 1,
            setNumber: set.setNumber,
            velocity: Math.round(velocity * 100) / 100
          });
        });
      }
    });

    if (velocities.length === 0) {
      return { velocities: [], baselineVelocity: 0, velocityDrop: 0, maxVelocity: 0, effectiveReps: 0, totalReps: 0 };
    }

    const baselineSampleSize = Math.min(2, velocities.length);
    const baselineVelocity = velocities.slice(0, baselineSampleSize).reduce((s, v) => s + v.velocity, 0) / baselineSampleSize;
    const lastVelocity = velocities[velocities.length - 1]?.velocity || 0;
    const velocityDrop = baselineVelocity > 0 ? ((baselineVelocity - lastVelocity) / baselineVelocity) * 100 : 0;
    const maxVelocity = Math.max(...velocities.map(v => v.velocity), 0.5);

    // Enrich with drop info
    const enriched = velocities.map(v => {
      const dropFromBaseline = baselineVelocity > 0 ? ((baselineVelocity - v.velocity) / baselineVelocity) * 100 : 0;
      return { ...v, dropPercent: Math.round(dropFromBaseline * 10) / 10, isEffective: dropFromBaseline < thresholdPercent };
    });

    return {
      velocities: enriched,
      baselineVelocity: Math.round(baselineVelocity * 100) / 100,
      velocityDrop: Math.round(velocityDrop * 10) / 10,
      maxVelocity,
      effectiveReps: enriched.filter(v => v.isEffective).length,
      totalReps: velocities.length
    };
  }, [setsData, selectedSet, thresholdPercent]);

  // ── Fatigue Colors ──────────────────────────────────────────────────
  const getFatigueColor = (level) => {
    const l = level?.toLowerCase();
    if (l === 'minimal' || l === 'low') return { ring: '#22c55e', text: 'text-green-400', bg: 'bg-green-500/15' };
    if (l === 'moderate') return { ring: '#eab308', text: 'text-yellow-400', bg: 'bg-yellow-500/15' };
    if (l === 'high') return { ring: '#f97316', text: 'text-orange-400', bg: 'bg-orange-500/15' };
    return { ring: '#ef4444', text: 'text-red-400', bg: 'bg-red-500/15' };
  };

  const fatigueColor = getFatigueColor(fatigueMetrics.fatigueLevel);

  const getStatusColor = (status) => {
    if (status === 'good') return { dot: 'bg-green-400', text: 'text-green-400', bg: 'bg-green-500/10' };
    if (status === 'warn') return { dot: 'bg-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    return { dot: 'bg-red-400', text: 'text-red-400', bg: 'bg-red-500/10' };
  };

  // ── Ring gauge math ─────────────────────────────────────────────────
  const ringRadius = 40;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = Math.min(1, fatigueMetrics.fatigueScore / 100);

  // ── Velocity bar chart constants ────────────────────────────────────
  const barChartHeight = 160;
  const barPadding = { top: 8, bottom: 24, left: 4, right: 4 };
  const plotH = barChartHeight - barPadding.top - barPadding.bottom;

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm overflow-hidden content-fade-up-2">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-white">
          {activeSlide === 0 ? 'Fatigue Analysis' : 'Velocity Loss'}
        </h3>
      </div>

      {/* Carousel */}
      <div
        ref={carouselRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* ═══════ Slide 1: Fatigue Analysis ═══════ */}
        <div className="w-full shrink-0 snap-center snap-always px-5 pb-2" style={{ minWidth: '100%', scrollSnapAlign: 'center' }}>
          {/* 2-column: Ring gauge | Indicators */}
          <div className="flex gap-3">
            {/* Left: Circular ring gauge */}
            <div className={`flex-shrink-0 rounded-2xl ${fatigueColor.bg} flex flex-col items-center justify-center`} style={{ width: '130px', height: '148px' }}>
              <div className="relative" style={{ width: '96px', height: '96px' }}>
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  {/* Track */}
                  <circle cx="50" cy="50" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
                  {/* Progress */}
                  <circle
                    cx="50" cy="50" r={ringRadius}
                    fill="none"
                    stroke={fatigueColor.ring}
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringCircumference * (1 - ringProgress)}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-bold ${fatigueColor.text}`}>{Math.round(fatigueMetrics.fatigueScore)}</span>
                  <span className="text-[9px] text-gray-500 -mt-0.5">/100</span>
                </div>
              </div>
              <span className={`text-[10px] font-semibold mt-1 ${fatigueColor.text}`}>{fatigueMetrics.fatigueLevel}</span>
            </div>

            {/* Right: 3 indicator boxes stacked */}
            <div className="flex-1 flex flex-col gap-2">
              {fatigueMetrics.indicators.map((ind, idx) => {
                const sc = getStatusColor(ind.status);
                return (
                  <div key={idx} className={`flex-1 rounded-xl ${sc.bg} px-3 py-2 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      <span className="text-[11px] text-gray-300 font-medium">{ind.label}</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className={`text-sm font-bold ${sc.text}`}>{ind.value}</span>
                      <span className="text-[9px] text-gray-500">{ind.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Insight */}
          <div className="mt-3 px-3 py-2 bg-white/[0.03] rounded-xl">
            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              {fatigueMetrics.fatigueLevel === 'Severe' || fatigueMetrics.fatigueLevel === 'High'
                ? 'High fatigue — great for hypertrophy, watch form on final reps.'
                : fatigueMetrics.fatigueLevel === 'Moderate'
                ? 'Moderate fatigue — balanced load for strength gains.'
                : 'Low fatigue — stable output, optimal for power training.'}
            </p>
          </div>
        </div>

        {/* ═══════ Slide 2: Velocity Loss ═══════ */}
        <div className="w-full shrink-0 snap-center snap-always px-5 pb-2" style={{ minWidth: '100%', scrollSnapAlign: 'center' }}>
          {velocityMetrics.velocities.length === 0 ? (
            <div className="flex items-center justify-center rounded-2xl bg-white/[0.03]" style={{ height: `${barChartHeight + 60}px` }}>
              <p className="text-sm text-gray-500">No velocity data</p>
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-500 mb-0.5">Peak</p>
                  <p className="text-lg font-bold text-cyan-400">{velocityMetrics.baselineVelocity}<span className="text-[10px] text-gray-500 ml-0.5">m/s</span></p>
                </div>
                <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-500 mb-0.5">Drop</p>
                  <p className={`text-lg font-bold ${velocityMetrics.velocityDrop < 10 ? 'text-green-400' : velocityMetrics.velocityDrop < 25 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {velocityMetrics.velocityDrop > 0 ? `-${velocityMetrics.velocityDrop}` : '0'}<span className="text-[10px] text-gray-500 ml-0.5">%</span>
                  </p>
                </div>
                <div className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-500 mb-0.5">Effective</p>
                  <p className="text-lg font-bold text-white">{velocityMetrics.effectiveReps}<span className="text-[10px] text-gray-500 ml-0.5">/{velocityMetrics.totalReps}</span></p>
                </div>
              </div>

              {/* Bar Chart — no axis labels, clean */}
              <div className="relative rounded-2xl bg-white/[0.03] overflow-hidden" style={{ height: `${barChartHeight}px` }}>
                <svg className="w-full h-full" viewBox={`0 0 320 ${barChartHeight}`} preserveAspectRatio="xMidYMid meet">
                  {/* Subtle horizontal grid */}
                  {[0.25, 0.5, 0.75].map(frac => {
                    const y = barPadding.top + plotH * (1 - frac);
                    return <line key={frac} x1="0" y1={y} x2="320" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
                  })}

                  {/* Bars */}
                  {velocityMetrics.velocities.map((data, idx) => {
                    const count = velocityMetrics.velocities.length;
                    const gap = Math.max(3, Math.min(6, 80 / count));
                    const totalGaps = gap * (count + 1);
                    const barW = Math.max(14, (320 - barPadding.left - barPadding.right - totalGaps) / count);
                    const x = barPadding.left + gap + idx * (barW + gap);
                    const heightFrac = velocityMetrics.maxVelocity > 0 ? data.velocity / velocityMetrics.maxVelocity : 0;
                    const barH = Math.max(4, heightFrac * plotH);
                    const y = barPadding.top + plotH - barH;

                    const isEffective = data.isEffective;
                    const barColor = isEffective ? '#22d3ee' : '#475569';
                    const barOpacity = isEffective ? 0.9 : 0.5;

                    return (
                      <g key={idx}>
                        {/* Bar with rounded top */}
                        <rect x={x} y={y} width={barW} height={barH} fill={barColor} opacity={barOpacity} rx="4" ry="4" />
                        {/* Velocity value on top of bar */}
                        <text x={x + barW / 2} y={y - 4} fill={isEffective ? '#22d3ee' : '#64748b'} fontSize="8" fontWeight="600" textAnchor="middle">
                          {data.velocity.toFixed(2)}
                        </text>
                        {/* Rep number at bottom */}
                        <text x={x + barW / 2} y={barChartHeight - 6} fill="#4b5563" fontSize="8" textAnchor="middle">
                          {data.repNumber}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Legend overlay bottom-right */}
                <div className="absolute bottom-1.5 right-2.5 flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm bg-cyan-400 opacity-90" />
                    <span className="text-[8px] text-gray-500">Effective</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm bg-slate-600 opacity-50" />
                    <span className="text-[8px] text-gray-500">Fatigued</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 pb-4 pt-2">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              activeSlide === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/25'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
