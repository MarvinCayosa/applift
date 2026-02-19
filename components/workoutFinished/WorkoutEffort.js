/**
 * WorkoutEffort Component
 * 
 * Industry-standard fatigue analysis display showing:
 * - Composite fatigue score (0-100)
 * - Four fatigue indicators breakdown (like PUSH/Gymaware)
 * - Visual gauge/meter display
 * 
 * Fatigue Formula: F = 0.35·D_ω + 0.25·I_T + 0.20·I_J + 0.20·I_S
 * - D_ω: Velocity drop (35%)
 * - I_T: Duration increase (25%)
 * - I_J: Jerk increase (20%)
 * - I_S: Shakiness increase (20%)
 */

import { useMemo } from 'react';

export default function WorkoutEffort({ 
  setsData, 
  chartData, 
  fatigueScore: propsFatigueScore, 
  fatigueLevel: propsFatigueLevel,
  analysisData,
  selectedSet = 'all'
}) {
  const metrics = useMemo(() => {
    // Get reps based on selected set filter
    const filteredSets = selectedSet === 'all'
      ? (setsData || [])
      : (setsData || []).filter(s => s.setNumber === parseInt(selectedSet));

    // Extract metrics from reps
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
        velocityDrop: 0,
        durationIncrease: 0,
        smoothnessDrop: 0,
        indicators: []
      };
    }

    // Calculate fatigue indicators (first third vs last third)
    const third = Math.max(1, Math.floor(totalReps / 3));
    
    const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    // D_ω: Velocity drop
    const avgVelocityFirst = mean(velocities.slice(0, third));
    const avgVelocityLast = mean(velocities.slice(-third));
    const velocityDrop = avgVelocityFirst > 0 
      ? ((avgVelocityFirst - avgVelocityLast) / avgVelocityFirst) * 100 
      : 0;
    
    // I_T: Duration increase (slower = more fatigued)
    const avgDurFirst = mean(durations.slice(0, third));
    const avgDurLast = mean(durations.slice(-third));
    const durationIncrease = avgDurFirst > 0 
      ? ((avgDurLast - avgDurFirst) / avgDurFirst) * 100 
      : 0;
    
    // Smoothness drop (jerk proxy)
    const avgSmoothFirst = mean(smoothnessScores.slice(0, third));
    const avgSmoothLast = mean(smoothnessScores.slice(-third));
    const smoothnessDrop = avgSmoothFirst > 0 
      ? ((avgSmoothFirst - avgSmoothLast) / avgSmoothFirst) * 100 
      : 0;

    // Calculate composite score if not provided
    let fatigueScore = selectedSet === 'all' ? propsFatigueScore : null;
    if (fatigueScore === undefined || fatigueScore === null) {
      const D_omega = Math.max(0, velocityDrop) / 100;
      const I_T = Math.max(0, durationIncrease) / 100;
      const I_J = Math.max(0, smoothnessDrop) / 100;
      fatigueScore = Math.min(100, (0.35 * D_omega + 0.25 * I_T + 0.20 * I_J + 0.20 * I_J) * 100);
    }

    let fatigueLevel = selectedSet === 'all' ? propsFatigueLevel : null;
    if (!fatigueLevel) {
      if (fatigueScore < 10) fatigueLevel = 'Minimal';
      else if (fatigueScore < 20) fatigueLevel = 'Low';
      else if (fatigueScore < 35) fatigueLevel = 'Moderate';
      else if (fatigueScore < 55) fatigueLevel = 'High';
      else fatigueLevel = 'Severe';
    }

    // Build indicators array for display
    const indicators = [
      { 
        label: 'Velocity Drop',
        value: Math.max(0, velocityDrop).toFixed(1),
        unit: '%',
        weight: '35%',
        status: velocityDrop < 10 ? 'good' : velocityDrop < 20 ? 'warn' : 'bad',
        description: 'Peak speed reduction'
      },
      { 
        label: 'Rep Slowdown',
        value: Math.max(0, durationIncrease).toFixed(1),
        unit: '%',
        weight: '25%',
        status: durationIncrease < 15 ? 'good' : durationIncrease < 30 ? 'warn' : 'bad',
        description: 'Duration increase'
      },
      { 
        label: 'Control Loss',
        value: Math.max(0, smoothnessDrop).toFixed(1),
        unit: '%',
        weight: '40%',
        status: smoothnessDrop < 10 ? 'good' : smoothnessDrop < 25 ? 'warn' : 'bad',
        description: 'Movement quality drop'
      }
    ];

    return {
      fatigueScore: Math.round(fatigueScore * 10) / 10,
      fatigueLevel,
      totalReps,
      velocityDrop,
      durationIncrease,
      smoothnessDrop,
      indicators
    };
  }, [setsData, propsFatigueScore, propsFatigueLevel, selectedSet]);

  // Colors based on level
  const getLevelColors = (level) => {
    const normalized = level?.toLowerCase();
    switch (normalized) {
      case 'minimal': return { text: 'text-green-400', bg: 'bg-green-500', ring: 'ring-green-500' };
      case 'low': return { text: 'text-green-400', bg: 'bg-green-500', ring: 'ring-green-500' };
      case 'moderate': return { text: 'text-yellow-400', bg: 'bg-yellow-500', ring: 'ring-yellow-500' };
      case 'high': return { text: 'text-orange-400', bg: 'bg-orange-500', ring: 'ring-orange-500' };
      case 'severe': return { text: 'text-red-400', bg: 'bg-red-500', ring: 'ring-red-500' };
      default: return { text: 'text-gray-400', bg: 'bg-gray-500', ring: 'ring-gray-500' };
    }
  };

  const colors = getLevelColors(metrics.fatigueLevel);
  
  // Gauge angle calculation (0-180 degrees for half-circle)
  const gaugeAngle = Math.min(180, (metrics.fatigueScore / 100) * 180);

  // Status icon based on value
  const getStatusIcon = (status) => {
    switch (status) {
      case 'good': return '✓';
      case 'warn': return '!';
      case 'bad': return '↓';
      default: return '•';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'good': return 'text-green-400 bg-green-500/20';
      case 'warn': return 'text-yellow-400 bg-yellow-500/20';
      case 'bad': return 'text-red-400 bg-red-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 content-fade-up-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">Fatigue Analysis</h3>
        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${colors.bg} text-white`}>
          {metrics.fatigueLevel}
        </div>
      </div>

      {/* Main content: Gauge + Score */}
      <div className="flex items-center gap-4 mb-4">
        {/* Semi-circular Gauge */}
        <div className="relative w-28 h-16 flex-shrink-0">
          <svg viewBox="0 0 120 70" className="w-full h-full">
            {/* Background arc */}
            <path
              d="M 10 60 A 50 50 0 0 1 110 60"
              fill="none"
              stroke="#374151"
              strokeWidth="8"
              strokeLinecap="round"
            />
            {/* Colored progress arc */}
            <path
              d="M 10 60 A 50 50 0 0 1 110 60"
              fill="none"
              stroke="url(#fatigueGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(gaugeAngle / 180) * 157} 157`}
              className="transition-all duration-700"
            />
            {/* Gradient definition */}
            <defs>
              <linearGradient id="fatigueGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="40%" stopColor="#eab308" />
                <stop offset="70%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
            </defs>
            {/* Gauge pointer */}
            <circle
              cx={60 + 45 * Math.cos((180 - gaugeAngle) * Math.PI / 180)}
              cy={60 - 45 * Math.sin((180 - gaugeAngle) * Math.PI / 180)}
              r="5"
              fill="white"
              className="drop-shadow-lg transition-all duration-700"
            />
            {/* Scale markers */}
            <text x="8" y="68" fill="#6b7280" fontSize="8">0</text>
            <text x="54" y="12" fill="#6b7280" fontSize="8">50</text>
            <text x="103" y="68" fill="#6b7280" fontSize="8">100</text>
          </svg>
        </div>

        {/* Score Display */}
        <div className="flex-1">
          <p className="text-xs text-gray-400 mb-1">Fatigue Score{selectedSet !== 'all' ? ` (Set ${selectedSet})` : ''}</p>
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-bold ${colors.text}`}>{metrics.fatigueScore}</span>
            <span className="text-sm text-gray-500">/100</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {metrics.totalReps} reps analyzed
          </p>
        </div>
      </div>

      {/* Fatigue Indicators Grid */}
      {metrics.indicators.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {metrics.indicators.map((indicator, idx) => (
            <div 
              key={idx}
              className={`rounded-xl p-3 ${getStatusColor(indicator.status)}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400 font-medium">{indicator.label}</span>
                <span className={`text-[10px] font-bold ${
                  indicator.status === 'good' ? 'text-green-400' : 
                  indicator.status === 'warn' ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {getStatusIcon(indicator.status)}
                </span>
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-lg font-bold text-white">{indicator.value}</span>
                <span className="text-xs text-gray-500">{indicator.unit}</span>
              </div>
              <p className="text-[9px] text-gray-500 mt-0.5">{indicator.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Insight text */}
      <div className="px-3 py-2.5 bg-white/5 rounded-xl">
        <p className="text-xs sm:text-sm text-center leading-relaxed">
          {metrics.fatigueLevel === 'Severe' ? (
            <span className="text-red-300">
              High fatigue detected. Your muscles showed significant performance decline. Consider reducing weight or adding rest time.
            </span>
          ) : metrics.fatigueLevel === 'High' ? (
            <span className="text-orange-300">
              Notable fatigue. Good for hypertrophy training, but watch form degradation on final reps.
            </span>
          ) : metrics.fatigueLevel === 'Moderate' ? (
            <span className="text-yellow-300">
              Moderate fatigue — optimal balance for strength gains while maintaining movement quality.
            </span>
          ) : (
            <span className="text-green-400">
              Excellent fatigue resistance! Stable velocity and control throughout — great for power training.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
