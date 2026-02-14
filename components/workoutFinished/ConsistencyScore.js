/**
 * ConsistencyScore Component
 * Displays session consistency with overlapping rep line graphs
 * and a consistency score out of 100
 */
import { useMemo } from 'react';

export default function ConsistencyScore({ setsData }) {
  // Extract per-rep chart data from all sets
  const { repCharts, consistencyScore, inconsistentRepIndex } = useMemo(() => {
    const charts = [];
    
    if (setsData && setsData.length > 0) {
      setsData.forEach((set, setIdx) => {
        if (set.repsData && Array.isArray(set.repsData)) {
          set.repsData.forEach((rep, repIdx) => {
            if (rep.chartData && rep.chartData.length > 0) {
              charts.push({
                setNumber: set.setNumber || setIdx + 1,
                repNumber: repIdx + 1,
                globalRepNumber: charts.length + 1,
                data: rep.chartData.map(v => Math.abs(v)),
              });
            }
          });
        }
      });
    }

    // Fallback sample data if no real data
    if (charts.length === 0) {
      const basePattern = [2, 4, 7, 10, 12, 11, 9, 7, 5, 3, 2, 1.5, 2, 3, 5, 8, 10, 9, 6, 3];
      for (let i = 0; i < 6; i++) {
        const variance = i === 3 ? 0.6 : 0.15; // Rep 4 is the outlier
        charts.push({
          setNumber: Math.floor(i / 3) + 1,
          repNumber: (i % 3) + 1,
          globalRepNumber: i + 1,
          data: basePattern.map(v => v + (Math.random() - 0.5) * v * variance),
        });
      }
    }

    // Normalize all rep data to the same length for comparison
    const maxLen = Math.max(...charts.map(c => c.data.length));
    const normalizedCharts = charts.map(c => {
      if (c.data.length === maxLen) return c;
      // Resample to maxLen
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

    // Calculate consistency score using cross-correlation
    if (normalizedCharts.length < 2) {
      return { repCharts: normalizedCharts, consistencyScore: 100, inconsistentRepIndex: -1 };
    }

    // Calculate mean curve
    const meanCurve = [];
    for (let i = 0; i < maxLen; i++) {
      const sum = normalizedCharts.reduce((acc, c) => acc + c.data[i], 0);
      meanCurve.push(sum / normalizedCharts.length);
    }

    // Calculate deviation of each rep from mean
    const deviations = normalizedCharts.map(chart => {
      let totalDev = 0;
      for (let i = 0; i < maxLen; i++) {
        const diff = chart.data[i] - meanCurve[i];
        totalDev += diff * diff;
      }
      return Math.sqrt(totalDev / maxLen);
    });

    // Find most inconsistent rep
    const maxDeviation = Math.max(...deviations);
    const worstRepIdx = deviations.indexOf(maxDeviation);

    // Calculate overall consistency (inverse of average deviation, scaled to 0-100)
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const meanValue = meanCurve.reduce((a, b) => a + b, 0) / meanCurve.length;
    const normalizedDev = meanValue > 0 ? avgDeviation / meanValue : 0;
    const score = Math.max(0, Math.min(100, Math.round(100 * (1 - normalizedDev * 2))));

    return { 
      repCharts: normalizedCharts, 
      consistencyScore: score, 
      inconsistentRepIndex: worstRepIdx 
    };
  }, [setsData]);

  // Colors for each rep line (cycle through palette)
  const repColors = [
    '#a855f7', // Purple
    '#3b82f6', // Blue
    '#22c55e', // Green
    '#eab308', // Yellow
    '#ef4444', // Red
    '#f97316', // Orange
    '#06b6d4', // Cyan
    '#ec4899', // Pink
  ];

  // Chart dimensions
  const chartWidth = 400;
  const chartHeight = 120;
  const padding = 10;

  // Calculate min/max across all reps for scaling
  const allValues = repCharts.flatMap(c => c.data);
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue || 1;

  // Generate SVG path for a rep's data
  const getPath = (data) => {
    return data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * (chartWidth - 2 * padding);
      const y = chartHeight - padding - ((value - minValue) / range) * (chartHeight - 2 * padding);
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
  };

  // Get score color
  const getScoreColor = (score) => {
    if (score >= 80) return { text: 'text-emerald-400', stroke: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
    if (score >= 60) return { text: 'text-yellow-400', stroke: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' };
    return { text: 'text-red-400', stroke: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
  };

  const scoreStyle = getScoreColor(consistencyScore);

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 content-fade-up-3">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">
          Consistency
        </h3>
      </div>

      {/* Overlapping Rep Line Graph */}
      <div className="relative bg-black/30 rounded-xl p-3 mb-3" style={{ height: '140px' }}>
        <svg 
          className="w-full h-full" 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="consistencyGridGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: 'rgba(255,255,255,0.08)' }} />
              <stop offset="100%" style={{ stopColor: 'rgba(255,255,255,0.02)' }} />
            </linearGradient>
          </defs>

          {/* Rep lines - draw each rep's curve */}
          {repCharts.map((rep, idx) => {
            const color = repColors[idx % repColors.length];
            const isInconsistent = idx === inconsistentRepIndex;
            
            return (
              <path
                key={idx}
                d={getPath(rep.data)}
                fill="none"
                stroke={color}
                strokeWidth={isInconsistent ? "2.5" : "1.8"}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isInconsistent ? 1 : 0.7}
                strokeDasharray={isInconsistent ? "6,3" : "none"}
              />
            );
          })}
        </svg>
      </div>

      {/* Consistency Score Label */}
      <div className="mb-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-gray-400">Consistency Score:</span>
          <div className="flex items-baseline gap-0.5">
            <span className={`text-2xl font-bold ${scoreStyle.text}`}>{consistencyScore}</span>
            <span className={`text-lg font-semibold ${scoreStyle.text} opacity-70`}>/100</span>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="mt-3.5 px-3 py-2.5 bg-white/5 rounded-xl">
        <p className="text-xs sm:text-sm text-white text-center leading-relaxed">
          {consistencyScore >= 85 ? (
            <span className="text-white">
              Excellent consistency! Your reps follow a very similar pattern, showing great muscle control.
            </span>
          ) : consistencyScore >= 65 ? (
            <span className="text-white">
              Good consistency overall. Rep {inconsistentRepIndex >= 0 ? repCharts[inconsistentRepIndex]?.globalRepNumber : '?'} shows the most variation — focus on maintaining form through fatigue.
            </span>
          ) : (
            <span className="text-white">
              Your rep patterns vary significantly. Try to maintain the same tempo and range of motion for each rep.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
