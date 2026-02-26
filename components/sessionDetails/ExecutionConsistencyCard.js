/**
 * ExecutionConsistencyCard
 *
 * Swipable carousel showing:
 *   Slide 1: Overlapping rep line graph with consistency score
 *   Slide 2: Duration Variability
 *   Slide 3: Amplitude Variability
 *
 * Includes pill selector for All / Set 1 / Set 2 etc.
 */

import { useMemo, useState, useRef, useEffect } from 'react';

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

export default function ExecutionConsistencyCard({
  setsData,
  analysisScore,
  inconsistentRepIndex: propsIdx,
}) {
  // Carousel state
  const [slideIndex, setSlideIndex] = useState(0);
  const scrollRef = useRef(null);
  const SLIDE_COUNT = 3;

  // Pill selector for sets
  const setNumbers = useMemo(() => {
    const nums = new Set();
    (setsData || []).forEach((s, i) => nums.add(s.setNumber || i + 1));
    return ['all', ...Array.from(nums).sort((a, b) => a - b)];
  }, [setsData]);

  const [selectedSet, setSelectedSet] = useState('all');

  // Sync scroll position to slideIndex
  useEffect(() => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const slideWidth = container.offsetWidth;
      container.scrollTo({ left: slideIndex * slideWidth, behavior: 'smooth' });
    }
  }, [slideIndex]);

  // Handle scroll end to update slideIndex
  const handleScroll = () => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const slideWidth = container.offsetWidth;
      const newIdx = Math.round(container.scrollLeft / slideWidth);
      if (newIdx !== slideIndex) {
        setSlideIndex(newIdx);
      }
    }
  };

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
            duration: rep.duration || (rep.liftingTime || 0) + (rep.loweringTime || 0) || (rep.concentric || 0) + (rep.eccentric || 0) || 0,
            amplitude: rep.amplitude || Math.max(...rep.chartData.map(Math.abs)) - Math.min(...rep.chartData.map(Math.abs)) || 0,
          });
        }
      });
    });
    return charts;
  }, [setsData]);

  // Filter by selected set
  const filtered = useMemo(() => {
    if (selectedSet === 'all') return allRepCharts;
    return allRepCharts.filter((c) => c.setNumber === parseInt(selectedSet));
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

  // Compute duration variability
  const { durationVariability, avgDuration } = useMemo(() => {
    const durations = filtered.map((r) => r.duration).filter((d) => d > 0);
    if (durations.length < 2) return { durationVariability: 0, avgDuration: 0 };
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((a, d) => a + (d - avg) ** 2, 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? (stdDev / avg) * 100 : 0;
    return { durationVariability: Math.round(cv), avgDuration: avg.toFixed(2) };
  }, [filtered]);

  // Compute amplitude variability
  const { amplitudeVariability, avgAmplitude } = useMemo(() => {
    const amplitudes = filtered.map((r) => r.amplitude).filter((a) => a > 0);
    if (amplitudes.length < 2) return { amplitudeVariability: 0, avgAmplitude: 0 };
    const avg = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
    const variance = amplitudes.reduce((a, amp) => a + (amp - avg) ** 2, 0) / amplitudes.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? (stdDev / avg) * 100 : 0;
    return { amplitudeVariability: Math.round(cv), avgAmplitude: avg.toFixed(1) };
  }, [filtered]);

  // Score color & remark
  const getStyle = (s) => {
    if (s >= 80) return { color: 'text-emerald-400', remark: 'Good' };
    if (s >= 60) return { color: 'text-yellow-400', remark: 'Fair' };
    return { color: 'text-red-400', remark: 'Needs Work' };
  };
  const style = getStyle(score);

  // Variability rating
  const getVariabilityStyle = (cv) => {
    if (cv <= 10) return { color: 'text-emerald-400', remark: 'Excellent' };
    if (cv <= 20) return { color: 'text-yellow-400', remark: 'Moderate' };
    return { color: 'text-red-400', remark: 'High' };
  };
  const durationStyle = getVariabilityStyle(durationVariability);
  const amplitudeStyle = getVariabilityStyle(amplitudeVariability);

  // SVG paths
  const allVals = filtered.flatMap((c) => c.data);
  const minV = allVals.length ? Math.min(...allVals) : 0;
  const maxV = allVals.length ? Math.max(...allVals) : 1;
  const range = maxV - minV || 1;

  const getPath = (data) =>
    data
      .map((v, i) => {
        const x = 6 + (i / (data.length - 1)) * (320 - 12);
        const y = 140 - 6 - ((v - minV) / range) * (140 - 12);
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
      })
      .join(' ');

  // Handle card tap to cycle through sets
  const handleCardClick = () => {
    const currentIdx = setNumbers.indexOf(selectedSet);
    const nextIdx = (currentIdx + 1) % setNumbers.length;
    setSelectedSet(setNumbers[nextIdx]);
  };

  return (
    <div 
      className="rounded-2xl bg-[#1a1a1a] p-4 pb-3 flex flex-col cursor-pointer" 
      style={{ minHeight: 260 }}
      onClick={handleCardClick}
    >
      {/* Header with title only */}
      <h3 className="text-[13px] font-bold text-white mb-2">Execution Consistency</h3>

      {/* Single pill selector under title */}
      {setNumbers.length > 1 && (
        <div className="flex justify-start mb-3">
          <div className="px-2.5 py-1 text-[10px] font-semibold rounded-full bg-purple-500 text-white">
            {selectedSet === 'all' ? 'All' : `Set ${selectedSet}`}
          </div>
        </div>
      )}

      {/* Swipable carousel */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* Slide 1: Consistency Graph */}
        <div className="w-full flex-shrink-0 snap-center flex flex-col" style={{ minWidth: '100%' }}>
          <div className="relative flex-1 rounded-xl overflow-hidden" style={{ minHeight: 100 }}>
            {/* Fade masks */}
            <div className="absolute inset-y-0 left-0 w-6 z-10 pointer-events-none"
                 style={{ background: 'linear-gradient(to right, #1a1a1a, transparent)' }} />
            <div className="absolute inset-y-0 right-0 w-6 z-10 pointer-events-none"
                 style={{ background: 'linear-gradient(to left, #1a1a1a, transparent)' }} />

            <svg className="w-full h-full" viewBox="50 0 250 140">
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

          {/* Score */}
          <div className="flex items-baseline justify-between mt-2">
            <span className={`text-[20px] font-bold leading-none ${style.color}`}>{score}%</span>
            <span className={`text-[12px] font-semibold ${style.color}`}>{style.remark}</span>
          </div>
        </div>

        {/* Slide 2: Duration Variability */}
        <div className="w-full flex-shrink-0 snap-center flex flex-col justify-center items-center px-2" style={{ minWidth: '100%' }}>
          <div className="text-center">
            <p className="text-[11px] text-gray-400 mb-1">Duration Variability</p>
            <p className={`text-[28px] font-bold leading-none ${durationStyle.color}`}>{durationVariability}%</p>
            <p className={`text-[11px] font-semibold mt-1 ${durationStyle.color}`}>{durationStyle.remark}</p>
          </div>
          <div className="mt-3 text-center">
            <p className="text-[10px] text-gray-500">Avg Duration</p>
            <p className="text-[16px] font-bold text-white">{avgDuration}s</p>
          </div>
        </div>

        {/* Slide 3: Amplitude Variability */}
        <div className="w-full flex-shrink-0 snap-center flex flex-col justify-center items-center px-2" style={{ minWidth: '100%' }}>
          <div className="text-center">
            <p className="text-[11px] text-gray-400 mb-1">Amplitude Variability</p>
            <p className={`text-[28px] font-bold leading-none ${amplitudeStyle.color}`}>{amplitudeVariability}%</p>
            <p className={`text-[11px] font-semibold mt-1 ${amplitudeStyle.color}`}>{amplitudeStyle.remark}</p>
          </div>
          <div className="mt-3 text-center">
            <p className="text-[10px] text-gray-500">Avg Amplitude</p>
            <p className="text-[16px] font-bold text-white">{avgAmplitude}</p>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 mt-2">
        {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
          <button
            key={i}
            onClick={() => setSlideIndex(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              i === slideIndex ? 'bg-purple-400 w-3' : 'bg-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
