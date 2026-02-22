/**
 * ExecutionConsistencyCard
 *
 * Overlapping rep line graph — zoomed in with center focus,
 * clipped at edges with fade masks. Shows consistency score + remark.
 * Tappable to cycle: All → Set 1 → Set 2 → …
 *
 * Design-matched: tall card, large zoomed-in graph, big score text.
 */

import { useMemo, useState, useCallback } from 'react';

const SET_COLORS = {
  1: ['#a855f7', '#c084fc', '#d8b4fe'],
  2: ['#3b82f6', '#60a5fa', '#93c5fd'],
  3: ['#22c55e', '#4ade80', '#86efac'],
  4: ['#eab308', '#facc15', '#fde047'],
  5: ['#ef4444', '#f87171', '#fca5a5'],
  6: ['#f97316', '#fb923c', '#fdba74'],
};

const getRepColor = (setNum, repIdx) => {
  const palette = SET_COLORS[setNum] || ['#06b6d4', '#22d3ee', '#67e8f9'];
  return palette[repIdx % palette.length];
};

// Wider virtual canvas, but we'll only show the centre slice
const VIRTUAL_W = 320;
const VIRTUAL_H = 120;
const PAD = 6;

// Visible window (centered crop)
const CROP_X = 60;
const CROP_W = VIRTUAL_W - CROP_X * 2;

export default function ExecutionConsistencyCard({
  setsData,
  analysisScore,
  inconsistentRepIndex: propsIdx,
}) {
  // Cycle through sets
  const setNumbers = useMemo(() => {
    const nums = new Set();
    (setsData || []).forEach((s, i) => nums.add(s.setNumber || i + 1));
    return ['all', ...Array.from(nums).sort((a, b) => a - b)];
  }, [setsData]);

  const [filterIdx, setFilterIdx] = useState(0);
  const selectedSet = setNumbers[filterIdx];

  const cycleFilter = useCallback(() => {
    setFilterIdx((prev) => (prev + 1) % setNumbers.length);
  }, [setNumbers]);

  // Build rep charts
  const allRepCharts = useMemo(() => {
    const charts = [];
    (setsData || []).forEach((set, si) => {
      const setNum = set.setNumber || si + 1;
      (set.repsData || []).forEach((rep, ri) => {
        if (rep.chartData?.length > 0) {
          charts.push({
            setNumber: setNum,
            repNumber: ri + 1,
            data: rep.chartData.map((v) => Math.abs(v)),
          });
        }
      });
    });
    return charts;
  }, [setsData]);

  // Filter
  const filtered = useMemo(() => {
    if (selectedSet === 'all') return allRepCharts;
    return allRepCharts.filter((c) => c.setNumber === selectedSet);
  }, [allRepCharts, selectedSet]);

  // Compute consistency
  const { score, inconsistentIdx } = useMemo(() => {
    if (filtered.length < 2) return { score: selectedSet === 'all' ? (analysisScore ?? 100) : 100, inconsistentIdx: -1 };

    const maxLen = Math.max(...filtered.map((c) => c.data.length), 1);
    const normalized = filtered.map((c) => {
      if (c.data.length === maxLen) return c.data;
      const resampled = [];
      for (let i = 0; i < maxLen; i++) {
        const src = (i / (maxLen - 1)) * (c.data.length - 1);
        const lo = Math.floor(src);
        const hi = Math.ceil(src);
        const frac = src - lo;
        resampled.push(c.data[lo] * (1 - frac) + (c.data[hi] || c.data[lo]) * frac);
      }
      return resampled;
    });

    const meanCurve = [];
    for (let i = 0; i < maxLen; i++) {
      meanCurve.push(normalized.reduce((a, c) => a + c[i], 0) / normalized.length);
    }

    const devs = normalized.map((c) => {
      let total = 0;
      for (let i = 0; i < maxLen; i++) total += (c[i] - meanCurve[i]) ** 2;
      return Math.sqrt(total / maxLen);
    });

    const worstIdx = devs.indexOf(Math.max(...devs));
    const avgDev = devs.reduce((a, b) => a + b, 0) / devs.length;
    const meanVal = meanCurve.reduce((a, b) => a + b, 0) / meanCurve.length;
    const normDev = meanVal > 0 ? avgDev / meanVal : 0;
    const s = Math.max(0, Math.min(100, Math.round(100 * (1 - normDev * 2))));

    return {
      score: selectedSet === 'all' ? (analysisScore ?? s) : s,
      inconsistentIdx: selectedSet === 'all' ? (propsIdx ?? worstIdx) : worstIdx,
    };
  }, [filtered, selectedSet, analysisScore, propsIdx]);

  // Score color & remark
  const getStyle = (s) => {
    if (s >= 80) return { color: 'text-emerald-400', remark: 'Good' };
    if (s >= 60) return { color: 'text-yellow-400', remark: 'Fair' };
    return { color: 'text-red-400', remark: 'Needs Work' };
  };
  const style = getStyle(score);

  // SVG paths — draw on full virtual canvas, then viewBox crops to center
  const allVals = filtered.flatMap((c) => c.data);
  const minV = allVals.length ? Math.min(...allVals) : 0;
  const maxV = allVals.length ? Math.max(...allVals) : 1;
  const range = maxV - minV || 1;

  const getPath = (data) =>
    data
      .map((v, i) => {
        const x = PAD + (i / (data.length - 1)) * (VIRTUAL_W - 2 * PAD);
        const y = VIRTUAL_H - PAD - ((v - minV) / range) * (VIRTUAL_H - 2 * PAD);
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ');

  return (
    <div className="rounded-2xl bg-[#1a1a1a] p-4 pb-3.5 flex flex-col cursor-pointer" style={{ minHeight: 260 }} onClick={cycleFilter}>
      <h3 className="text-[13px] font-bold text-white mb-1">
        Execution Consistency
        {selectedSet !== 'all' && <span className="text-[9px] text-gray-500 ml-1">Set {selectedSet}</span>}
      </h3>

      {/* Overlapping rep lines — zoomed in, centered, edges clipped with fades */}
      <div className="relative flex-1 rounded-xl overflow-hidden my-1" style={{ minHeight: 120 }}>
        {/* Fade masks — wider for nice vignette */}
        <div className="absolute inset-y-0 left-0 w-10 z-10 pointer-events-none"
             style={{ background: 'linear-gradient(to right, #1a1a1a, transparent)' }} />
        <div className="absolute inset-y-0 right-0 w-10 z-10 pointer-events-none"
             style={{ background: 'linear-gradient(to left, #1a1a1a, transparent)' }} />

        <svg className="w-full h-full" viewBox={`${CROP_X} 0 ${CROP_W} ${VIRTUAL_H}`} preserveAspectRatio="none">
          {filtered.map((rep, idx) => {
            const color = getRepColor(rep.setNumber, rep.repNumber - 1);
            const isWorst = idx === inconsistentIdx && inconsistentIdx >= 0;
            return (
              <path
                key={`${rep.setNumber}-${rep.repNumber}`}
                d={getPath(rep.data)}
                fill="none"
                stroke={color}
                strokeWidth={isWorst ? 3 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={isWorst ? 1 : 0.6}
                strokeDasharray={isWorst ? '6,4' : 'none'}
              />
            );
          })}
        </svg>
      </div>

      {/* Score & remark */}
      <div className="flex items-baseline justify-between mt-1">
        <span className={`text-[22px] font-bold leading-none ${style.color}`}>{score}%</span>
        <span className={`text-[13px] font-semibold ${style.color}`}>{style.remark}</span>
      </div>
    </div>
  );
}
