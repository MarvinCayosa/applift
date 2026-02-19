/**
 * VelocityLossChart Component
 * 
 * Industry-standard velocity-based training (VBT) visualization.
 * Uses REAL peak velocity (m/s) from accelerometer integration — not gyroscope.
 * 
 * Based on methodology from:
 * - PUSH Band, Gymaware, Tendo Unit
 * - González-Badillo velocity loss research
 * 
 * Key metrics:
 * - Peak velocity per rep (bar chart, real m/s)
 * - Velocity loss threshold line (industry standard: 10-20%)
 * - Color coding: effective reps (cyan) vs fatigued reps (gray)
 */

import { useMemo, useState } from 'react';

export default function VelocityLossChart({ 
  setsData, 
  analysisData,
  selectedSet = 'all',
  thresholdPercent = 10,
  showTooltip = true
}) {
  const [hoveredBar, setHoveredBar] = useState(null);

  const chartMetrics = useMemo(() => {
    const filteredSets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));

    const velocities = [];
    
    filteredSets.forEach(set => {
      if (set.repsData && Array.isArray(set.repsData)) {
        set.repsData.forEach((rep, idx) => {
          // Real peak velocity in m/s from accelerometer integration
          // Values are already in correct m/s from workoutAnalysisService.js
          let velocity = parseFloat(rep.peakVelocity) || 0;
          
          velocities.push({
            repNumber: rep.repNumber || idx + 1,
            setNumber: set.setNumber,
            velocity: Math.round(velocity * 1000) / 1000,
            duration: parseFloat(rep.time) || 0,
            smoothness: rep.smoothnessScore || 50
          });
        });
      }
    });

    if (velocities.length === 0) {
      return {
        velocities: [],
        baselineVelocity: 0,
        thresholdVelocity: 0,
        velocityLoss: 0,
        effectiveReps: 0,
        totalReps: 0,
        fatigueOnsetRep: -1
      };
    }

    // Baseline from first rep (or avg of first 2)
    const baselineSampleSize = Math.min(2, velocities.length);
    const baselineVelocity = velocities
      .slice(0, baselineSampleSize)
      .reduce((sum, v) => sum + v.velocity, 0) / baselineSampleSize;

    const thresholdVelocity = baselineVelocity * (1 - thresholdPercent / 100);

    let fatigueOnsetRep = -1;
    const enrichedVelocities = velocities.map((v, idx) => {
      const isEffective = v.velocity >= thresholdVelocity;
      if (fatigueOnsetRep === -1 && !isEffective && idx > 0) {
        fatigueOnsetRep = idx;
      }
      const velocityLossPercent = baselineVelocity > 0
        ? ((baselineVelocity - v.velocity) / baselineVelocity) * 100
        : 0;
      return { ...v, isEffective, velocityLossPercent: Math.round(velocityLossPercent * 10) / 10 };
    });

    const effectiveReps = enrichedVelocities.filter(v => v.isEffective).length;
    const lastVelocity = velocities[velocities.length - 1]?.velocity || 0;
    const velocityLoss = baselineVelocity > 0
      ? ((baselineVelocity - lastVelocity) / baselineVelocity) * 100
      : 0;

    return {
      velocities: enrichedVelocities,
      baselineVelocity: Math.round(baselineVelocity * 100) / 100,
      thresholdVelocity: Math.round(thresholdVelocity * 100) / 100,
      velocityLoss: Math.round(velocityLoss * 10) / 10,
      effectiveReps,
      totalReps: velocities.length,
      fatigueOnsetRep
    };
  }, [setsData, selectedSet, thresholdPercent]);

  // Chart dimensions — bigger chart, minimal padding (no axis labels)
  const chartWidth = 360;
  const chartHeight = 240;
  const padding = { top: 16, right: 16, bottom: 28, left: 10 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Y-axis scale based on actual data
  const maxVelocity = chartMetrics.velocities.length > 0
    ? Math.max(1.4, ...chartMetrics.velocities.map(v => v.velocity * 1.15), chartMetrics.baselineVelocity * 1.15)
    : 1.4;
  const minVelocity = chartMetrics.velocities.length > 0
    ? Math.max(0, Math.min(...chartMetrics.velocities.map(v => v.velocity * 0.7)) - 0.1)
    : 0;
  const yRange = maxVelocity - minVelocity || 1;

  // Bar layout
  const barCount = chartMetrics.velocities.length || 1;
  const barGap = barCount <= 6 ? 8 : barCount <= 12 ? 5 : 3;
  const barWidth = Math.max(14, Math.min(40, (plotWidth - barGap * (barCount + 1)) / barCount));

  const getY = (velocity) => padding.top + plotHeight - ((velocity - minVelocity) / yRange) * plotHeight;
  const thresholdY = getY(chartMetrics.thresholdVelocity);

  if (chartMetrics.velocities.length === 0) {
    return (
      <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5">
        <h3 className="text-base font-semibold text-white mb-4">Velocity Analysis</h3>
        <div className="bg-black/30 rounded-xl p-8 flex items-center justify-center">
          <p className="text-gray-500 text-sm">No velocity data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 content-fade-up-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">Velocity Analysis</h3>
        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
          chartMetrics.velocityLoss < 10 
            ? 'bg-green-600 text-white'
            : chartMetrics.velocityLoss < 20
              ? 'bg-yellow-500 text-white'
              : chartMetrics.velocityLoss < 30
                ? 'bg-orange-500 text-white'
                : 'bg-red-500 text-white'
        }`}>
          {chartMetrics.velocityLoss > 0 ? `-${chartMetrics.velocityLoss}%` : 'Stable'}
        </div>
      </div>

      {/* Key stats row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-black/30 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Peak Velocity</p>
          <p className="text-lg font-bold text-cyan-400">{chartMetrics.baselineVelocity}</p>
          <p className="text-[10px] text-gray-500">m/s</p>
        </div>
        <div className="bg-black/30 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Effective Reps</p>
          <p className="text-lg font-bold text-cyan-400">{chartMetrics.effectiveReps}</p>
          <p className="text-[10px] text-gray-500">of {chartMetrics.totalReps}</p>
        </div>
        <div className="bg-black/30 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">Threshold</p>
          <p className="text-lg font-bold text-cyan-400">{thresholdPercent}%</p>
          <p className="text-[10px] text-gray-500">velocity loss</p>
        </div>
      </div>

      {/* Bar Chart — Large, no axis labels */}
      <div className="relative bg-black/40 rounded-2xl overflow-hidden" style={{ height: `${chartHeight + 16}px` }}>
        <svg 
          className="w-full h-full" 
          viewBox={`0 0 ${chartWidth} ${chartHeight + 8}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Subtle horizontal grid lines — no labels */}
          {[0.25, 0.5, 0.75].map(frac => {
            const y = padding.top + plotHeight * (1 - frac);
            return (
              <line key={frac} x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y}
                stroke="#374151" strokeWidth="1" strokeDasharray="4,4" opacity="0.3" />
            );
          })}

          {/* Threshold line */}
          <line
            x1={padding.left} y1={thresholdY}
            x2={chartWidth - padding.right} y2={thresholdY}
            stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.8"
          />
          {/* Threshold label — small, right-aligned */}
          <text
            x={chartWidth - padding.right - 4} y={thresholdY - 6}
            fill="#22d3ee" fontSize="9" textAnchor="end" opacity="0.8"
          >
            {chartMetrics.thresholdVelocity.toFixed(2)}
          </text>

          {/* Bars */}
          {chartMetrics.velocities.map((data, idx) => {
            const barHeight = Math.max(3, ((data.velocity - minVelocity) / yRange) * plotHeight);
            const totalBarsWidth = barCount * barWidth + (barCount - 1) * barGap;
            const startX = padding.left + (plotWidth - totalBarsWidth) / 2;
            const x = startX + idx * (barWidth + barGap);
            const y = getY(data.velocity);
            
            const barColor = data.isEffective ? '#22d3ee' : '#64748b';
            const barOpacity = data.isEffective ? 1 : 0.6;
            const isHovered = hoveredBar === idx;
            
            return (
              <g key={idx}
                onMouseEnter={() => setHoveredBar(idx)}
                onMouseLeave={() => setHoveredBar(null)}
                onTouchStart={() => setHoveredBar(idx)}
                onTouchEnd={() => setTimeout(() => setHoveredBar(null), 1500)}
                style={{ cursor: 'pointer' }}
              >
                {/* Bar with rounded top */}
                <rect x={x} y={y} width={barWidth} height={barHeight}
                  fill={barColor} opacity={isHovered ? 1 : barOpacity}
                  rx="4" ry="4"
                />
                
                {/* Velocity label on top of bar (always visible) */}
                <text x={x + barWidth / 2} y={y - 5}
                  fill={data.isEffective ? '#22d3ee' : '#94a3b8'} fontSize="9" fontWeight="600" textAnchor="middle"
                >
                  {data.velocity.toFixed(2)}
                </text>
                
                {/* Rep number at bottom */}
                <text x={x + barWidth / 2} y={chartHeight - 2}
                  fill="#6b7280" fontSize="10" textAnchor="middle"
                >
                  {data.repNumber}
                </text>

                {/* Tooltip on hover — shows loss % */}
                {showTooltip && isHovered && (
                  <g>
                    <rect x={x - 15} y={y - 40} width={barWidth + 30} height={22}
                      fill="#1f2937" rx="6" stroke="#374151" strokeWidth="1" />
                    <text x={x + barWidth / 2} y={y - 25}
                      fill={data.isEffective ? '#22d3ee' : '#f97316'} fontSize="10" fontWeight="600" textAnchor="middle"
                    >
                      {data.velocityLossPercent > 0 ? `-${data.velocityLossPercent}%` : 'Baseline'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Legend — overlaid bottom-right */}
        <div className="absolute bottom-2 right-3 flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400"></div>
            <span className="text-gray-400">Effective</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm bg-slate-500 opacity-60"></div>
            <span className="text-gray-400">Fatigued</span>
          </div>
        </div>
      </div>

      {/* Insight text */}
      <div className="mt-4 px-3 py-2.5 bg-white/5 rounded-xl">
        <p className="text-xs sm:text-sm text-center leading-relaxed">
          {chartMetrics.velocityLoss < 10 ? (
            <span className="text-cyan-300">
              Excellent velocity maintenance! You stayed above the {thresholdPercent}% threshold for {chartMetrics.effectiveReps} of {chartMetrics.totalReps} reps — optimal for power & strength gains.
            </span>
          ) : chartMetrics.velocityLoss < 20 ? (
            <span className="text-yellow-300">
              Good performance. Velocity dropped {chartMetrics.velocityLoss}% by the end. {chartMetrics.effectiveReps} reps were in the effective zone for strength development.
            </span>
          ) : chartMetrics.velocityLoss < 30 ? (
            <span className="text-orange-300">
              Moderate fatigue detected. Velocity loss of {chartMetrics.velocityLoss}% indicates muscle fatigue. This range is good for hypertrophy training.
            </span>
          ) : (
            <span className="text-red-300">
              High fatigue ({chartMetrics.velocityLoss}% velocity loss). Consider reducing weight or adding rest time for power-focused training.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
