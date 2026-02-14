/**
 * WorkoutEffort Component (Simplified)
 * 
 * Displays fatigue analysis with:
 * - Fatigue score + level badge
 * - Sparkline showing effort progression across reps
 * - Fatigue onset marker on the graph
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

    const durations = [];
    const smoothnessScores = [];

    filteredSets.forEach(set => {
      if (set.repsData && Array.isArray(set.repsData)) {
        set.repsData.forEach(rep => {
          durations.push(parseFloat(rep.time) || 0);
          smoothnessScores.push(rep.smoothnessScore || 70);
        });
      }
    });

    const totalReps = durations.length;
    if (totalReps === 0) {
      return {
        fatigueScore: propsFatigueScore || 0,
        fatigueLevel: propsFatigueLevel || 'Low',
        totalReps: 0,
        durations: [],
        fatigueOnsetIdx: -1
      };
    }

    // Calculate trends (% change from first third to last third)
    const calculateTrend = (arr) => {
      if (arr.length < 3) return 0;
      const thirdLen = Math.max(1, Math.floor(arr.length / 3));
      const firstAvg = arr.slice(0, thirdLen).reduce((a, b) => a + b, 0) / thirdLen;
      const lastAvg = arr.slice(-thirdLen).reduce((a, b) => a + b, 0) / thirdLen;
      if (firstAvg === 0) return 0;
      return ((lastAvg - firstAvg) / firstAvg) * 100;
    };

    const durationTrend = calculateTrend(durations);
    const smoothnessTrend = calculateTrend(smoothnessScores);

    // Calculate fatigue score if not provided (or if filtering per-set)
    let fatigueScore = selectedSet === 'all' ? propsFatigueScore : null;
    if (fatigueScore === undefined || fatigueScore === null) {
      const durationContrib = Math.max(0, durationTrend) * 0.5;
      const smoothnessContrib = Math.max(0, -smoothnessTrend) * 0.5;
      fatigueScore = Math.min(100, durationContrib + smoothnessContrib);
    }

    let fatigueLevel = selectedSet === 'all' ? propsFatigueLevel : null;
    if (!fatigueLevel) {
      if (fatigueScore < 15) fatigueLevel = 'Low';
      else if (fatigueScore < 35) fatigueLevel = 'Moderate';
      else if (fatigueScore < 55) fatigueLevel = 'High';
      else fatigueLevel = 'Severe';
    }

    // Find fatigue onset: first rep where duration exceeds baseline avg by >15%
    let fatigueOnsetIdx = -1;
    if (durations.length >= 4) {
      const baselineLen = Math.max(2, Math.floor(durations.length / 3));
      const baselineAvg = durations.slice(0, baselineLen).reduce((a, b) => a + b, 0) / baselineLen;
      if (baselineAvg > 0) {
        for (let i = baselineLen; i < durations.length; i++) {
          if (durations[i] > baselineAvg * 1.15) {
            fatigueOnsetIdx = i;
            break;
          }
        }
      }
    }

    return {
      fatigueScore: Math.round(fatigueScore * 10) / 10,
      fatigueLevel,
      totalReps,
      durations,
      fatigueOnsetIdx
    };
  }, [setsData, propsFatigueScore, propsFatigueLevel, selectedSet]);

  // Level colors
  const getLevelColors = (level) => {
    switch (level?.toLowerCase()) {
      case 'low': return { text: 'text-green-400', bg: 'bg-green-500', bgLight: 'bg-green-500/20' };
      case 'moderate': return { text: 'text-yellow-400', bg: 'bg-yellow-500', bgLight: 'bg-yellow-500/20' };
      case 'high': return { text: 'text-orange-400', bg: 'bg-orange-500', bgLight: 'bg-orange-500/20' };
      case 'severe': return { text: 'text-red-400', bg: 'bg-red-500', bgLight: 'bg-red-500/20' };
      default: return { text: 'text-gray-400', bg: 'bg-gray-500', bgLight: 'bg-gray-500/20' };
    }
  };

  const colors = getLevelColors(metrics.fatigueLevel);
  const sparklineData = metrics.durations.length > 0 ? metrics.durations : [];

  // Insight text
  const getInsight = () => {
    if (metrics.fatigueLevel === 'Severe') return 'Significant fatigue detected. Consider reducing weight or longer rest between sets.';
    if (metrics.fatigueLevel === 'High') return 'Notable fatigue progression. Additional recovery time may help.';
    if (metrics.fatigueLevel === 'Moderate') return 'Normal fatigue pattern. Good consistency throughout.';
    return 'Great endurance! Minimal fatigue detected.';
  };

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 content-fade-up-2">
      {/* Header + Badge */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">Workout Effort</h3>
        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${colors.bg} text-white`}>
          {metrics.fatigueLevel}
        </div>
      </div>

      {/* Fatigue Score */}
      <div className={`rounded-xl p-4 ${colors.bgLight} mb-4`}>
        <p className="text-xs text-gray-400 mb-1">Fatigue Score{selectedSet !== 'all' ? ` (Set ${selectedSet})` : ''}</p>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${colors.text}`}>{metrics.fatigueScore}</span>
          <span className="text-sm text-gray-500">/100</span>
        </div>
      </div>

      {/* Sparkline — rep durations over time with fatigue onset marker */}
      {sparklineData.length > 1 && (
        <div className="bg-black/30 rounded-xl p-3 mb-4" style={{ height: '80px' }}>
          <svg className="w-full h-full" viewBox="0 0 200 50" preserveAspectRatio="none">
            <defs>
              <linearGradient id="effortGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#a855f7', stopOpacity: 0.4 }} />
                <stop offset="100%" style={{ stopColor: '#a855f7', stopOpacity: 0.05 }} />
              </linearGradient>
            </defs>

            {/* Midline */}
            <line x1="0" y1="25" x2="200" y2="25" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

            {(() => {
              const data = sparklineData;
              const min = Math.min(...data);
              const max = Math.max(...data);
              const range = max - min || 1;

              const pts = data.map((val, i) => {
                const x = (i / (data.length - 1)) * 200;
                const y = 45 - ((val - min) / range) * 40;
                return { x, y };
              });

              const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
              const fatigueX = metrics.fatigueOnsetIdx >= 0 
                ? (metrics.fatigueOnsetIdx / (data.length - 1)) * 200 
                : -1;

              return (
                <>
                  <polygon
                    points={`0,50 ${polyPoints} 200,50`}
                    fill="url(#effortGrad)"
                  />
                  <polyline
                    points={polyPoints}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* Fatigue onset marker */}
                  {fatigueX >= 0 && (
                    <>
                      <line x1={fatigueX} y1="2" x2={fatigueX} y2="48" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,2" opacity="0.7" />
                      <circle cx={fatigueX} cy={pts[metrics.fatigueOnsetIdx].y} r="3" fill="#ef4444" />
                    </>
                  )}
                </>
              );
            })()}
          </svg>
          <div className="flex justify-between text-[9px] text-gray-500 mt-1">
            <span>Rep 1</span>
            {metrics.fatigueOnsetIdx >= 0 && (
              <span className="text-red-400">Fatigue onset (Rep {metrics.fatigueOnsetIdx + 1})</span>
            )}
            <span>Rep {sparklineData.length}</span>
          </div>
        </div>
      )}

      {/* Insight */}
      <div className="px-3 py-2.5 bg-white/5 rounded-xl">
        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{getInsight()}</p>
      </div>
    </div>
  );
}
