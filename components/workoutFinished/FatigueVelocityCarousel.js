/**
 * FatigueVelocityCarousel Component
 * 
 * Combined swipeable carousel with two slides:
 *   Slide 1: Fatigue Analysis (2-column: gauge left, indicators right)
 *   Slide 2: Velocity Loss Chart (bar chart with threshold line)
 * 
 * Based on how PUSH Band, Gymaware, and Tendo Unit display VBT metrics:
 * - Peak velocity per rep via accelerometer integration (not gyro)
 * - Velocity loss threshold (industry standard: 10%)
 * - Fatigue composite score from 4 indicators
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
  const scrollRef = useRef(null);

  // ============================================================================
  // FATIGUE METRICS (Slide 1)
  // ============================================================================
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
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // Velocity drop
    const avgVFirst = avg(velocities.slice(0, third));
    const avgVLast = avg(velocities.slice(-third));
    const velocityDrop = avgVFirst > 0 ? ((avgVFirst - avgVLast) / avgVFirst) * 100 : 0;

    // Duration increase
    const avgDFirst = avg(durations.slice(0, third));
    const avgDLast = avg(durations.slice(-third));
    const durationIncrease = avgDFirst > 0 ? ((avgDLast - avgDFirst) / avgDFirst) * 100 : 0;

    // Smoothness drop
    const avgSFirst = avg(smoothnessScores.slice(0, third));
    const avgSLast = avg(smoothnessScores.slice(-third));
    const smoothnessDrop = avgSFirst > 0 ? ((avgSFirst - avgSLast) / avgSFirst) * 100 : 0;

    let fatigueScore = selectedSet === 'all' ? propsFatigueScore : null;
    if (fatigueScore === undefined || fatigueScore === null) {
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
      { label: 'Velocity Drop', value: Math.max(0, velocityDrop).toFixed(1), unit: '%',
        status: velocityDrop < 10 ? 'good' : velocityDrop < 20 ? 'warn' : 'bad',
        desc: 'Peak speed reduction' },
      { label: 'Rep Slowdown', value: Math.max(0, durationIncrease).toFixed(1), unit: '%',
        status: durationIncrease < 15 ? 'good' : durationIncrease < 30 ? 'warn' : 'bad',
        desc: 'Duration increase' },
      { label: 'Control Loss', value: Math.max(0, smoothnessDrop).toFixed(1), unit: '%',
        status: smoothnessDrop < 10 ? 'good' : smoothnessDrop < 25 ? 'warn' : 'bad',
        desc: 'Quality degradation' }
    ];

    return {
      fatigueScore: Math.round(fatigueScore * 10) / 10,
      fatigueLevel,
      totalReps,
      indicators
    };
  }, [setsData, propsFatigueScore, propsFatigueLevel, selectedSet]);

  // ============================================================================
  // VELOCITY METRICS (Slide 2)
  // ============================================================================
  const velocityMetrics = useMemo(() => {
    const filteredSets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));

    const velocities = [];
    filteredSets.forEach(set => {
      if (set.repsData && Array.isArray(set.repsData)) {
        set.repsData.forEach((rep, idx) => {
          let velocity = parseFloat(rep.peakVelocity) || 0;

          // Fallback: estimate from rep duration if no velocity
          if (velocity === 0 && rep.time) {
            const t = parseFloat(rep.time);
            if (t > 0) velocity = Math.max(0.1, Math.min(1.5, 2.5 / t));
          }

          velocities.push({
            repNumber: rep.repNumber || idx + 1,
            setNumber: set.setNumber,
            velocity: Math.round(velocity * 100) / 100,
            duration: parseFloat(rep.time) || 0
          });
        });
      }
    });

    if (velocities.length === 0) {
      return { velocities: [], baselineVelocity: 0, thresholdVelocity: 0, velocityLoss: 0, effectiveReps: 0, totalReps: 0 };
    }

    const baselineSampleSize = Math.min(2, velocities.length);
    const baselineVelocity = velocities.slice(0, baselineSampleSize)
      .reduce((s, v) => s + v.velocity, 0) / baselineSampleSize;
    const thresholdVelocity = baselineVelocity * (1 - thresholdPercent / 100);

    let fatigueOnsetRep = -1;
    const enriched = velocities.map((v, idx) => {
      const isEffective = v.velocity >= thresholdVelocity;
      if (fatigueOnsetRep === -1 && !isEffective && idx > 0) fatigueOnsetRep = idx;
      const lossPercent = baselineVelocity > 0
        ? ((baselineVelocity - v.velocity) / baselineVelocity) * 100 : 0;
      return { ...v, isEffective, velocityLossPercent: Math.round(lossPercent * 10) / 10 };
    });

    const effectiveReps = enriched.filter(v => v.isEffective).length;
    const lastV = velocities[velocities.length - 1]?.velocity || 0;
    const velocityLoss = baselineVelocity > 0
      ? ((baselineVelocity - lastV) / baselineVelocity) * 100 : 0;

    return {
      velocities: enriched,
      baselineVelocity: Math.round(baselineVelocity * 100) / 100,
      thresholdVelocity: Math.round(thresholdVelocity * 100) / 100,
      velocityLoss: Math.round(velocityLoss * 10) / 10,
      effectiveReps,
      totalReps: velocities.length
    };
  }, [setsData, selectedSet, thresholdPercent]);

  // ============================================================================
  // SCROLL HANDLING (like EquipmentDistributionCard)
  // ============================================================================
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const cardWidth = container.clientWidth;
      const newIndex = Math.round(scrollLeft / cardWidth);
      setActiveSlide(newIndex);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSlide = (index) => {
    const container = scrollRef.current;
    if (!container) return;
    const child = container.children?.[index];
    if (child) {
      container.scrollTo({ left: child.offsetLeft, behavior: 'smooth' });
    }
  };

  // ============================================================================
  // HELPERS
  // ============================================================================
  const getLevelColors = (level) => {
    const n = level?.toLowerCase();
    switch (n) {
      case 'minimal': case 'low': return { text: 'text-green-400', bg: 'bg-green-500' };
      case 'moderate': return { text: 'text-yellow-400', bg: 'bg-yellow-500' };
      case 'high': return { text: 'text-orange-400', bg: 'bg-orange-500' };
      case 'severe': return { text: 'text-red-400', bg: 'bg-red-500' };
      default: return { text: 'text-gray-400', bg: 'bg-gray-500' };
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'good': return 'bg-green-500/15';
      case 'warn': return 'bg-yellow-500/15';
      case 'bad': return 'bg-red-500/15';
      default: return 'bg-white/5';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'good': return '✓';
      case 'warn': return '!';
      case 'bad': return '↓';
      default: return '•';
    }
  };

  const getStatusIconColor = (status) => {
    switch (status) {
      case 'good': return 'text-green-400';
      case 'warn': return 'text-yellow-400';
      case 'bad': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const colors = getLevelColors(fatigueMetrics.fatigueLevel);
  const gaugeAngle = Math.min(180, (fatigueMetrics.fatigueScore / 100) * 180);

  // Velocity chart dimensions
  const cW = 300, cH = 160;
  const pad = { top: 20, right: 30, bottom: 28, left: 36 };
  const pW = cW - pad.left - pad.right, pH = cH - pad.top - pad.bottom;

  const vels = velocityMetrics.velocities;
  const maxV = Math.max(1.4, ...vels.map(v => v.velocity), velocityMetrics.baselineVelocity * 1.15);
  const minV = Math.min(0.2, ...vels.map(v => v.velocity * 0.9));
  const yRange = maxV - minV || 1;

  const getY = (v) => pad.top + pH - ((v - minV) / yRange) * pH;

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const ticks = [];
    const step = 0.2;
    for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) {
      ticks.push(Math.round(v * 10) / 10);
    }
    return ticks;
  }, [minV, maxV]);

  const barGap = 3;
  const barW = vels.length > 0 ? Math.max(10, (pW - barGap * (vels.length + 1)) / vels.length) : 20;
  const thresholdY = getY(velocityMetrics.thresholdVelocity);

  return (
    <div className="rounded-2xl bg-white/5 overflow-hidden">
      {/* Swipeable container */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* ================= SLIDE 1: FATIGUE (2-column layout) ================= */}
        <div className="w-full flex-shrink-0 snap-center p-4" style={{ minWidth: '100%' }}>
          {/* Badge - top right */}
          <div className="flex justify-end mb-2">
            <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${colors.bg} text-white`}>
              {fatigueMetrics.fatigueLevel}
            </div>
          </div>

          {/* 2-Column Layout */}
          <div className="flex gap-3">
            {/* LEFT: Gauge + Score */}
            <div className="flex-1 flex flex-col items-center justify-center">
              {/* Semi-circular Gauge */}
              <div className="relative w-full max-w-[140px] h-[80px] mb-1">
                <svg viewBox="0 0 140 85" className="w-full h-full">
                  {/* Background arc */}
                  <path 
                    d="M 15 75 A 55 55 0 0 1 125 75" 
                    fill="none" 
                    stroke="#374151" 
                    strokeWidth="10" 
                    strokeLinecap="round" 
                  />
                  {/* Gradient arc */}
                  <path 
                    d="M 15 75 A 55 55 0 0 1 125 75" 
                    fill="none" 
                    stroke="url(#fatigueGrad)" 
                    strokeWidth="10" 
                    strokeLinecap="round"
                    strokeDasharray={`${(gaugeAngle / 180) * 173} 173`}
                    className="transition-all duration-700"
                  />
                  <defs>
                    <linearGradient id="fatigueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#22c55e" />
                      <stop offset="40%" stopColor="#eab308" />
                      <stop offset="70%" stopColor="#f97316" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                  </defs>
                  {/* Needle indicator */}
                  <circle 
                    cx={70 + 50 * Math.cos((180 - gaugeAngle) * Math.PI / 180)}
                    cy={75 - 50 * Math.sin((180 - gaugeAngle) * Math.PI / 180)}
                    r="5" 
                    fill="white" 
                    className="drop-shadow-lg transition-all duration-700"
                  />
                  {/* Scale labels */}
                  <text x="12" y="82" fill="#6b7280" fontSize="9">0</text>
                  <text x="122" y="82" fill="#6b7280" fontSize="9">100</text>
                </svg>
              </div>
              
              {/* Score */}
              <p className="text-[10px] text-gray-500 mb-0.5">Fatigue Score</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-bold ${colors.text}`}>{fatigueMetrics.fatigueScore}</span>
                <span className="text-sm text-gray-500">/100</span>
              </div>
              <p className="text-[10px] text-gray-600">{fatigueMetrics.totalReps} reps analyzed</p>
            </div>

            {/* RIGHT: 3 Indicator Boxes (stacked vertically) */}
            {fatigueMetrics.indicators.length > 0 && (
              <div className="flex flex-col gap-2 w-[130px]">
                {fatigueMetrics.indicators.map((ind, i) => (
                  <div key={i} className={`rounded-xl p-2.5 ${getStatusBg(ind.status)}`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-gray-400 font-medium">{ind.label}</span>
                      <span className={`text-[10px] font-bold ${getStatusIconColor(ind.status)}`}>
                        {getStatusIcon(ind.status)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-lg font-bold text-white">{ind.value}</span>
                      <span className="text-[10px] text-gray-500">{ind.unit}</span>
                    </div>
                    <p className="text-[8px] text-gray-600">{ind.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fatigue insight */}
          <div className="mt-3 px-3 py-2 bg-white/5 rounded-xl">
            <p className="text-[11px] text-center leading-relaxed">
              {fatigueMetrics.fatigueLevel === 'Severe' || fatigueMetrics.fatigueLevel === 'High' ? (
                <span className="text-orange-300">Notable fatigue detected. Good for hypertrophy, watch form on final reps.</span>
              ) : fatigueMetrics.fatigueLevel === 'Moderate' ? (
                <span className="text-yellow-300">Moderate fatigue — optimal for strength gains while maintaining quality.</span>
              ) : (
                <span className="text-green-400">Excellent fatigue resistance! Stable velocity and control throughout.</span>
              )}
            </p>
          </div>
        </div>

        {/* ================= SLIDE 2: VELOCITY ================= */}
        <div className="w-full flex-shrink-0 snap-center p-4" style={{ minWidth: '100%' }}>
          {/* Badge - top right */}
          <div className="flex justify-end mb-2">
            <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              velocityMetrics.velocityLoss < 10 ? 'bg-green-600' :
              velocityMetrics.velocityLoss < 20 ? 'bg-yellow-500' :
              velocityMetrics.velocityLoss < 30 ? 'bg-orange-500' : 'bg-red-500'
            } text-white`}>
              {velocityMetrics.velocityLoss > 0 ? `-${velocityMetrics.velocityLoss}%` : 'Stable'}
            </div>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            <div className="bg-black/30 rounded-xl p-2 text-center">
              <p className="text-[9px] text-gray-400 mb-0.5">Peak Velocity</p>
              <p className="text-lg font-bold text-cyan-400">{velocityMetrics.baselineVelocity}</p>
              <p className="text-[9px] text-gray-600">m/s</p>
            </div>
            <div className="bg-black/30 rounded-xl p-2 text-center">
              <p className="text-[9px] text-gray-400 mb-0.5">Effective Reps</p>
              <p className="text-lg font-bold text-cyan-400">{velocityMetrics.effectiveReps}</p>
              <p className="text-[9px] text-gray-600">of {velocityMetrics.totalReps}</p>
            </div>
            <div className="bg-black/30 rounded-xl p-2 text-center">
              <p className="text-[9px] text-gray-400 mb-0.5">Threshold</p>
              <p className="text-lg font-bold text-cyan-400">{thresholdPercent}%</p>
              <p className="text-[9px] text-gray-600">velocity loss</p>
            </div>
          </div>

          {/* Bar chart */}
          {vels.length > 0 ? (
            <div className="bg-black/40 rounded-xl" style={{ height: '140px' }}>
              <svg className="w-full h-full" viewBox={`0 0 ${cW} ${cH}`} preserveAspectRatio="xMidYMid meet">
                {/* Y grid + labels */}
                {yTicks.map(tick => {
                  const y = getY(tick);
                  return (
                    <g key={tick}>
                      <line x1={pad.left} y1={y} x2={cW - pad.right} y2={y} stroke="#374151" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.5" />
                      <text x={pad.left - 5} y={y + 3} fill="#6b7280" fontSize="8" textAnchor="end">{tick.toFixed(1)}</text>
                    </g>
                  );
                })}

                {/* Y-axis label */}
                <text x={8} y={cH / 2} fill="#6b7280" fontSize="7" textAnchor="middle" transform={`rotate(-90, 8, ${cH / 2})`}>Velocity (m/s)</text>

                {/* Threshold line */}
                <line x1={pad.left} y1={thresholdY} x2={cW - pad.right} y2={thresholdY} stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="5,3" />
                <text x={cW - pad.right + 2} y={thresholdY + 3} fill="#22d3ee" fontSize="8" fontWeight="bold">-{thresholdPercent}%</text>

                {/* Bars */}
                {vels.map((d, i) => {
                  const bH = Math.max(2, ((d.velocity - minV) / yRange) * pH);
                  const x = pad.left + barGap + i * (barW + barGap);
                  const y = getY(d.velocity);
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={barW} height={bH} fill={d.isEffective ? '#22d3ee' : '#64748b'}
                        opacity={d.isEffective ? 1 : 0.65} rx="2" />
                      <text x={x + barW / 2} y={cH - pad.bottom + 10} fill="#6b7280" fontSize="7" textAnchor="middle">{d.repNumber}</text>
                    </g>
                  );
                })}

                {/* X-axis label */}
                <text x={cW / 2} y={cH - 4} fill="#6b7280" fontSize="7" textAnchor="middle">Reps</text>
              </svg>
            </div>
          ) : (
            <div className="bg-black/30 rounded-xl p-6 flex items-center justify-center" style={{ height: '140px' }}>
              <p className="text-gray-500 text-sm">No velocity data available</p>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-2 text-[9px]">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />
              <span className="text-gray-500">Effective</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-slate-500 opacity-65" />
              <span className="text-gray-500">Fatigued</span>
            </div>
          </div>

          {/* Velocity insight */}
          <div className="mt-2 px-3 py-2 bg-white/5 rounded-xl">
            <p className="text-[11px] text-center leading-relaxed">
              {velocityMetrics.velocityLoss < 10 ? (
                <span className="text-cyan-300">
                  Excellent velocity maintenance! {velocityMetrics.effectiveReps}/{velocityMetrics.totalReps} reps in the effective zone.
                </span>
              ) : velocityMetrics.velocityLoss < 20 ? (
                <span className="text-yellow-300">
                  Good. Velocity dropped {velocityMetrics.velocityLoss}%. {velocityMetrics.effectiveReps} effective reps for strength.
                </span>
              ) : velocityMetrics.velocityLoss < 30 ? (
                <span className="text-orange-300">
                  Moderate fatigue ({velocityMetrics.velocityLoss}% loss). Good for hypertrophy training.
                </span>
              ) : (
                <span className="text-red-300">
                  High fatigue ({velocityMetrics.velocityLoss}% loss). Consider reducing weight for power training.
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Carousel Indicators (white, at bottom, like other carousels) */}
      <div className="flex justify-center gap-1.5 pb-3">
        {[0, 1].map((index) => (
          <button
            key={index}
            onClick={() => scrollToSlide(index)}
            className={`${
              index === activeSlide 
                ? 'bg-white w-4 h-1.5' 
                : 'bg-white/30 w-1.5 h-1.5'
            } rounded-full transition-all duration-300`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
