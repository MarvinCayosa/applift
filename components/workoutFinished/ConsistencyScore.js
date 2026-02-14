/**
 * ConsistencyScore Component
 * Displays session consistency with overlapping rep line graphs
 * and a consistency score out of 100.
 * Accepts external selectedSet filter from parent.
 * Computes per-set scores when a specific set is selected.
 */
import { useMemo } from 'react';

export default function ConsistencyScore({ setsData, analysisScore, inconsistentRepIndex: propsInconsistentRepIndex, selectedSet = 'all' }) {

  // Compute all rep charts grouped by set
  const { allRepCharts, setNumbers } = useMemo(() => {
    const charts = [];
    const sets = new Set();
    
    if (setsData && setsData.length > 0) {
      setsData.forEach((set, setIdx) => {
        const setNum = set.setNumber || setIdx + 1;
        sets.add(setNum);
        
        if (set.repsData && Array.isArray(set.repsData)) {
          set.repsData.forEach((rep, repIdx) => {
            if (rep.chartData && rep.chartData.length > 0) {
              charts.push({
                setNumber: setNum,
                repNumber: repIdx + 1,
                globalRepNumber: charts.length + 1,
                data: rep.chartData.map(v => Math.abs(v)),
              });
            }
          });
        }
      });
    }

    return { 
      allRepCharts: charts, 
      setNumbers: Array.from(sets).sort((a, b) => a - b)
    };
  }, [setsData]);

  // Helper: compute consistency score for a set of rep charts
  const computeConsistency = (charts) => {
    if (charts.length === 0) return { score: 0, normalizedCharts: [], inconsistentIdx: -1 };
    if (charts.length < 2) return { score: 100, normalizedCharts: charts, inconsistentIdx: -1 };

    const maxLen = Math.max(...charts.map(c => c.data.length), 1);
    const normalizedCharts = charts.map(c => {
      if (c.data.length === maxLen) return c;
      const resampled = [];
      for (let i = 0; i < maxLen; i++) {
        const srcIdx = (i / (maxLen - 1)) * (c.data.length - 1);
        const low = Math.floor(srcIdx);
        const high = Math.ceil(srcIdx);
        const frac = srcIdx - low;
        resampled.push(c.data[low] * (1 - frac) + (c.data[high] || c.data[low]) * frac);
      }
      return { ...c, data: resampled };
    });

    const meanCurve = [];
    for (let i = 0; i < maxLen; i++) {
      const sum = normalizedCharts.reduce((acc, c) => acc + c.data[i], 0);
      meanCurve.push(sum / normalizedCharts.length);
    }

    const deviations = normalizedCharts.map(chart => {
      let totalDev = 0;
      for (let i = 0; i < maxLen; i++) {
        totalDev += Math.pow(chart.data[i] - meanCurve[i], 2);
      }
      return Math.sqrt(totalDev / maxLen);
    });

    const maxDeviation = Math.max(...deviations);
    const worstRepIdx = deviations.indexOf(maxDeviation);
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const meanValue = meanCurve.reduce((a, b) => a + b, 0) / meanCurve.length;
    const normalizedDev = meanValue > 0 ? avgDeviation / meanValue : 0;
    const score = Math.max(0, Math.min(100, Math.round(100 * (1 - normalizedDev * 2))));

    return { score, normalizedCharts, inconsistentIdx: worstRepIdx };
  };

  // Compute filtered data and score based on selectedSet
  const { filteredRepCharts, consistencyScore, inconsistentRepIndex } = useMemo(() => {
    if (selectedSet === 'all') {
      const result = computeConsistency(allRepCharts);
      return {
        filteredRepCharts: result.normalizedCharts.length > 0 ? result.normalizedCharts : allRepCharts,
        consistencyScore: analysisScore ?? result.score,
        inconsistentRepIndex: propsInconsistentRepIndex ?? result.inconsistentIdx
      };
    }

    const setNum = parseInt(selectedSet);
    const setCharts = allRepCharts.filter(rep => rep.setNumber === setNum);
    const result = computeConsistency(setCharts);

    return {
      filteredRepCharts: result.normalizedCharts.length > 0 ? result.normalizedCharts : setCharts,
      consistencyScore: result.score,
      inconsistentRepIndex: result.inconsistentIdx
    };
  }, [allRepCharts, selectedSet, analysisScore, propsInconsistentRepIndex]);

  // Colors for rep lines by set
  const setColors = {
    1: ['#a855f7', '#c084fc', '#d8b4fe'],
    2: ['#3b82f6', '#60a5fa', '#93c5fd'],
    3: ['#22c55e', '#4ade80', '#86efac'],
    4: ['#eab308', '#facc15', '#fde047'],
    5: ['#ef4444', '#f87171', '#fca5a5'],
    6: ['#f97316', '#fb923c', '#fdba74'],
  };

  const getRepColor = (setNumber, repIndex) => {
    const palette = setColors[setNumber] || ['#06b6d4', '#22d3ee', '#67e8f9'];
    return palette[repIndex % palette.length];
  };

  // Chart dimensions
  const chartWidth = 400;
  const chartHeight = 120;
  const padding = 10;

  const allValues = filteredRepCharts.flatMap(c => c.data);
  const minValue = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;
  const range = maxValue - minValue || 1;

  const getPath = (data) => {
    if (!data || data.length === 0) return '';
    return data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
      const y = chartHeight - padding - ((value - minValue) / range) * (chartHeight - 2 * padding);
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
  };

  const getScoreColor = (score) => {
    if (score >= 80) return { text: 'text-emerald-400', stroke: '#10b981' };
    if (score >= 60) return { text: 'text-yellow-400', stroke: '#eab308' };
    return { text: 'text-red-400', stroke: '#ef4444' };
  };

  const scoreStyle = getScoreColor(consistencyScore);

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 content-fade-up-3">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">Consistency</h3>
      </div>

      {/* Overlapping Rep Line Graph */}
      <div className="relative bg-black/30 rounded-xl p-3 mb-3" style={{ height: '140px' }}>
        <svg 
          className="w-full h-full" 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          preserveAspectRatio="none"
        >
          {filteredRepCharts.map((rep, idx) => {
            const color = getRepColor(rep.setNumber, rep.repNumber - 1);
            const isInconsistent = idx === inconsistentRepIndex && inconsistentRepIndex >= 0;
            
            return (
              <path
                key={`${rep.setNumber}-${rep.repNumber}`}
                d={getPath(rep.data)}
                fill="none"
                stroke={color}
                strokeWidth={isInconsistent ? "3.5" : "2.5"}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isInconsistent ? 1 : 0.7}
                strokeDasharray={isInconsistent ? "6,3" : "none"}
              />
            );
          })}
        </svg>
      </div>

      {/* Consistency Score */}
      <div className="mb-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-gray-400">
            Consistency Score{selectedSet !== 'all' ? ` (Set ${selectedSet})` : ''}:
          </span>
          <div className="flex items-baseline gap-0.5">
            <span className={`text-2xl font-bold ${scoreStyle.text}`}>{consistencyScore}</span>
            <span className={`text-lg font-semibold ${scoreStyle.text} opacity-70`}>/100</span>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="px-3 py-2.5 bg-white/5 rounded-xl">
        <p className="text-xs sm:text-sm text-white text-center leading-relaxed">
          {consistencyScore >= 85 ? (
            'Excellent consistency! Your reps follow a very similar pattern.'
          ) : consistencyScore >= 65 ? (
            `Good consistency overall. ${inconsistentRepIndex >= 0 && filteredRepCharts[inconsistentRepIndex] ? `Rep ${filteredRepCharts[inconsistentRepIndex]?.globalRepNumber || filteredRepCharts[inconsistentRepIndex]?.repNumber} shows the most variation.` : 'Some variation detected.'}`
          ) : (
            'Your rep patterns vary. Try maintaining the same tempo and range for each rep.'
          )}
        </p>
      </div>
    </div>
  );
}
