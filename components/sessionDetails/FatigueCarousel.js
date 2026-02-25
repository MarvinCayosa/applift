/**
 * FatigueCarousel
 *
 * Two-slide carousel:
 *   Slide 1 – Fatigue Analysis (large donut + 3 indicator cards)
 *   Slide 2 – Velocity Loss (stats row + bar chart)
 *
 * Uses native scroll-snap for swipe, dot indicators at bottom.
 *
 * Design-matched: large donut filling the tile, big score number,
 * big indicator fonts, maximized space usage.
 */

import { useMemo, useState, useRef, useEffect } from 'react';

export default function FatigueCarousel({ setsData, fatigueScore: propScore, fatigueLevel: propLevel, selectedSet = 'all' }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef(null);
  const SLIDES = 2;

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

  // ── Fatigue Metrics ──
  const fatigue = useMemo(() => {
    const sets = selectedSet === 'all' ? (setsData || []) : (setsData || []).filter((s) => s.setNumber === parseInt(selectedSet));
    const velocities = [];
    const durations = [];
    const smoothness = [];

    sets.forEach((set) =>
      (set.repsData || []).forEach((rep) => {
        velocities.push(parseFloat(rep.peakVelocity) || 0);
        durations.push(parseFloat(rep.time) || 0);
        smoothness.push(rep.smoothnessScore || 70);
      })
    );

    const n = durations.length;
    if (n < 3) {
      return { score: propScore || 0, level: propLevel || 'Low', indicators: [] };
    }

    const third = Math.max(1, Math.floor(n / 3));
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    const vFirst = avg(velocities.slice(0, third));
    const vLast = avg(velocities.slice(-third));
    const velDrop = vFirst > 0 ? ((vFirst - vLast) / vFirst) * 100 : 0;

    const dFirst = avg(durations.slice(0, third));
    const dLast = avg(durations.slice(-third));
    const durInc = dFirst > 0 ? ((dLast - dFirst) / dFirst) * 100 : 0;

    const sFirst = avg(smoothness.slice(0, third));
    const sLast = avg(smoothness.slice(-third));
    const smDrop = sFirst > 0 ? ((sFirst - sLast) / sFirst) * 100 : 0;

    let score = selectedSet === 'all' ? propScore : null;
    if (score == null) {
      const D = Math.max(0, velDrop) / 100;
      const T = Math.max(0, durInc) / 100;
      const J = Math.max(0, smDrop) / 100;
      score = Math.min(100, (0.35 * D + 0.25 * T + 0.20 * J + 0.20 * J) * 100);
    }

    let level = selectedSet === 'all' ? propLevel : null;
    if (!level) {
      if (score < 10) level = 'Minimal';
      else if (score < 20) level = 'Low';
      else if (score < 35) level = 'Moderate';
      else if (score < 55) level = 'High';
      else level = 'Severe';
    }

    return {
      score: Math.round(score * 10) / 10,
      level,
      indicators: [
        { label: 'Velocity', value: `-${Math.max(0, velDrop).toFixed(0)}%`, status: velDrop < 10 ? 'good' : velDrop < 20 ? 'warn' : 'bad' },
        { label: 'Slowdown', value: `+${Math.max(0, durInc).toFixed(0)}%`, status: durInc < 15 ? 'good' : durInc < 30 ? 'warn' : 'bad' },
        { label: 'Stability', value: `${Math.max(0, smDrop).toFixed(0)}%`, status: smDrop < 10 ? 'good' : smDrop < 25 ? 'warn' : 'bad' },
      ],
    };
  }, [setsData, propScore, propLevel, selectedSet]);

  // ── Velocity Metrics ──
  const velocity = useMemo(() => {
    const sets = selectedSet === 'all' ? (setsData || []) : (setsData || []).filter((s) => s.setNumber === parseInt(selectedSet));
    const vels = [];
    sets.forEach((set) =>
      (set.repsData || []).forEach((rep, i) => {
        vels.push({ rep: rep.repNumber || i + 1, set: set.setNumber, v: Math.round((parseFloat(rep.peakVelocity) || 0) * 100) / 100 });
      })
    );
    if (vels.length === 0) return { vels: [], baseline: 0, cv: 0, max: 0, effective: 0, total: 0 };

    const baseSize = Math.min(2, vels.length);
    const baseline = vels.slice(0, baseSize).reduce((s, x) => s + x.v, 0) / baseSize;
    const max = Math.max(...vels.map((x) => x.v), 0.5);
    
    // Coefficient of Variation — captures variability regardless of rep order
    const allV = vels.map((x) => x.v).filter((v) => v > 0);
    const meanV = allV.length > 0 ? allV.reduce((s, v) => s + v, 0) / allV.length : 0;
    const stdV = allV.length > 1 ? Math.sqrt(allV.reduce((sum, v) => sum + Math.pow(v - meanV, 2), 0) / (allV.length - 1)) : 0;
    const cv = meanV > 0 ? (stdV / meanV) * 100 : 0;
    
    const enriched = vels.map((x) => {
      const d = baseline > 0 ? ((baseline - x.v) / baseline) * 100 : 0;
      return { ...x, dropPct: Math.round(d * 10) / 10, isEff: d < 10 };
    });

    return { vels: enriched, baseline: Math.round(baseline * 100) / 100, cv: Math.round(cv * 10) / 10, max, effective: enriched.filter((x) => x.isEff).length, total: vels.length };
  }, [setsData, selectedSet]);

  // Colors
  const fatigueColor = (() => {
    const l = fatigue.level?.toLowerCase();
    if (l === 'minimal' || l === 'low') return { ring: '#22c55e', text: 'text-green-400', bg: 'bg-green-500/10' };
    if (l === 'moderate') return { ring: '#eab308', text: 'text-yellow-400', bg: 'bg-yellow-500/10' };
    if (l === 'high') return { ring: '#f97316', text: 'text-orange-400', bg: 'bg-orange-500/10' };
    return { ring: '#ef4444', text: 'text-red-400', bg: 'bg-red-500/10' };
  })();

  const statusColor = (s) => {
    if (s === 'good') return { text: 'text-green-400' };
    if (s === 'warn') return { text: 'text-yellow-400' };
    return { text: 'text-red-400' };
  };

  // Ring — bigger radius
  const R = 50;
  const C = 2 * Math.PI * R;
  const ringProg = Math.min(1, fatigue.score / 100);

  // Velocity bar chart
  const BAR_H = 160;
  const P = { t: 8, b: 24, l: 4, r: 4 };
  const plotH = BAR_H - P.t - P.b;

  return (
    <div className="rounded-2xl bg-[#1a1a1a] overflow-hidden content-fade-up-3">
      {/* Carousel */}
      <div
        ref={carouselRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* ═══ Slide 1: Fatigue Analysis ═══ */}
        <div className="w-full shrink-0 snap-center snap-always p-5 pb-3" style={{ minWidth: '100%' }}>
          <h3 className="text-[15px] font-bold text-white mb-4">Fatigue Analysis</h3>

          <div className="flex gap-3">
            {/* Donut tile — large, no background */}
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center"
              style={{ width: 180, height: 180 }}
            >
              <div className="relative" style={{ width: 160, height: 160 }}>
                <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                  <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
                  <circle
                    cx="80" cy="80" r="70"
                    fill="none"
                    stroke={fatigueColor.ring}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 70}
                    strokeDashoffset={2 * Math.PI * 70 * (1 - ringProg)}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-[48px] font-bold leading-none ${fatigueColor.text}`}>
                    {Math.round(fatigue.score)}
                  </span>
                  <span className={`text-[16px] font-semibold mt-1 ${fatigueColor.text} capitalize`}>{fatigue.level}</span>
                </div>
              </div>
            </div>

            {/* 3 indicator cards */}
            <div className="flex-1 flex flex-col gap-2.5">
              {fatigue.indicators.map((ind, i) => {
                const sc = statusColor(ind.status);
                return (
                  <div key={i} className="flex-1 rounded-xl bg-white/[0.06] px-4 py-3 flex items-center justify-between">
                    <span className="text-[13px] text-gray-400 font-medium">{ind.label}</span>
                    <span className={`text-[15px] font-bold ${sc.text}`}>{ind.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══ Slide 2: Velocity Loss ═══ */}
        <div className="w-full shrink-0 snap-center snap-always p-5 pb-3" style={{ minWidth: '100%' }}>
          <h3 className="text-[15px] font-bold text-white mb-3">Velocity Analysis</h3>

          {velocity.vels.length === 0 ? (
            <div className="flex items-center justify-center rounded-2xl bg-white/[0.03]" style={{ height: `${BAR_H}px` }}>
              <p className="text-sm text-gray-500">No velocity data</p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-3">
                {[
                  { label: 'Peak', value: `${velocity.baseline}`, unit: 'm/s', color: 'text-cyan-400' },
                  { label: 'Variability', value: `${velocity.cv}`, unit: '%', color: velocity.cv < 8 ? 'text-green-400' : velocity.cv < 15 ? 'text-yellow-400' : 'text-red-400' },
                  { label: 'Effective', value: `${velocity.effective}`, unit: `/${velocity.total}`, color: 'text-white' },
                ].map((m, i) => (
                  <div key={i} className="flex-1 rounded-xl bg-white/[0.04] px-3 py-2.5 text-center">
                    <p className="text-[10px] text-gray-500 mb-0.5">{m.label}</p>
                    <p className={`text-lg font-bold ${m.color}`}>{m.value}<span className="text-[10px] text-gray-500 ml-0.5">{m.unit}</span></p>
                  </div>
                ))}
              </div>

              <div className="relative rounded-2xl bg-white/[0.03] overflow-hidden" style={{ height: `${BAR_H}px` }}>
                <div className="overflow-x-auto scrollbar-hide h-full">
                <svg className="h-full" style={{ width: `${Math.max(320, velocity.vels.length * 32 + 20)}px`, minWidth: '100%' }} viewBox={`0 0 ${Math.max(320, velocity.vels.length * 32 + 20)} ${BAR_H}`} preserveAspectRatio="none">
                  {[0.25, 0.5, 0.75].map((f) => {
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
                    const color = d.isEff ? '#22d3ee' : '#475569';
                    const op = d.isEff ? 0.9 : 0.5;
                    return (
                      <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH} fill={color} opacity={op} rx="4" ry="4" />
                        <text x={x + barW / 2} y={y - 4} fill={d.isEff ? '#22d3ee' : '#64748b'} fontSize="8" fontWeight="600" textAnchor="middle">
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
    </div>
  );
}
