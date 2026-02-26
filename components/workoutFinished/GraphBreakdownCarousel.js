/**
 * GraphBreakdownCarousel
 *
 * Three-slide swipable carousel for workout-finished page:
 *   Slide 1 – Movement Graph (SVG per-set chart with "See More" link)
 *   Slide 2 – Workout Breakdown (reps & sets rings + weight split)
 *   Slide 3 – ROM Analysis (baseline vs achieved, fulfillment %)
 *
 * Uses native scroll-snap for touch swiping with dot indicators.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { buildChartSegmentsFromAnalysis } from '../../utils/sessionDetails/chartMappers';

/* ── Chart dimensions ── */
const SVG_W = 400;
const SVG_H = 120;
const PAD_T = 8;
const PAD_B = 4;
const PLOT_H = SVG_H - PAD_T - PAD_B;

/* ── Equipment base-weight lookup ── */
function getEquipmentBase(equipment) {
  const eq = (equipment || '').toLowerCase();
  if (eq.includes('barbell'))  return { label: 'Olympic Barbell', base: 20 };
  if (eq.includes('dumbbell')) return { label: 'Dumbbell Handle', base: 2 };
  if (eq.includes('weight stack') || eq.includes('machine') || eq.includes('cable'))
    return { label: 'Weight Stack', base: 0 };
  return { label: 'Equipment', base: 0 };
}

export default function GraphBreakdownCarousel({
  setsData = [],
  chartData = [],
  analysisChartData,
  totalReps = 0,
  plannedReps = 0,
  completedSets = 0,
  plannedSets = 0,
  weight = 0,
  weightUnit = 'kg',
  equipment = '',
  onSeeMore,
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef(null);

  // Determine whether ROM slide is relevant
  const romData = useMemo(() => {
    const firstCalibratedSet = setsData?.find(s => s.romCalibrated && s.targetROM);
    if (!firstCalibratedSet) return null;

    const baselineROM = firstCalibratedSet.targetROM;
    const romUnit = firstCalibratedSet.romUnit || '°';
    const allReps = setsData.flatMap(s => s.repsData || []);
    const repsWithROM = allReps.filter(r => r.romFulfillment != null);
    const avgFulfillment = repsWithROM.length > 0
      ? Math.round(repsWithROM.reduce((sum, r) => sum + r.romFulfillment, 0) / repsWithROM.length)
      : null;
    const avgROM = repsWithROM.length > 0
      ? repsWithROM.reduce((sum, r) => sum + (parseFloat(r.rom) || 0), 0) / repsWithROM.length
      : null;

    return { baselineROM, romUnit, avgFulfillment, avgROM };
  }, [setsData]);

  const SLIDES = romData ? 3 : 2;

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
  }, [SLIDES]);

  // ── Build chart segments ──
  const effectiveChartData = analysisChartData?.length > 0
    ? analysisChartData.map(d => Math.abs(d))
    : chartData.map(d => Math.abs(typeof d === 'object' ? (d.filtered || d.value || 0) : d));

  const { segments, allData } = useMemo(() => {
    if (effectiveChartData.length === 0) return { segments: [], allData: [] };
    return buildChartSegmentsFromAnalysis(effectiveChartData, setsData);
  }, [effectiveChartData, setsData]);

  const maxVal = useMemo(() => {
    if (allData.length === 0) return 1;
    return Math.max(...allData, 1);
  }, [allData]);

  const totalPoints = allData.length;

  const svgSegments = useMemo(() => {
    if (segments.length === 0) return [];
    let globalIdx = 0;
    return segments.map((seg) => {
      const points = seg.data.map((v, i) => {
        const xi = globalIdx + i;
        const x = totalPoints > 1 ? (xi / (totalPoints - 1)) * SVG_W : SVG_W / 2;
        const normalized = Math.max(0, Math.min(1, v / maxVal));
        const y = PAD_T + PLOT_H - normalized * PLOT_H;
        return { x, y };
      });
      const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const areaD = `${lineD} L ${points[points.length - 1].x} ${SVG_H} L ${points[0].x} ${SVG_H} Z`;
      const startX = points[0]?.x ?? 0;
      const endX = points[points.length - 1]?.x ?? SVG_W;
      const labelX = (startX + endX) / 2;
      globalIdx += seg.data.length;
      return { setNumber: seg.setNumber, color: seg.color, lineD, areaD, startX, endX, labelX };
    });
  }, [segments, totalPoints, maxVal]);

  // ── Breakdown data ──
  const eqInfo = useMemo(() => getEquipmentBase(equipment), [equipment]);
  const baseWeight = Math.min(eqInfo.base, weight);
  const addedWeight = Math.max(0, weight - baseWeight);
  const repsPercent = plannedReps > 0 ? Math.min(1, totalReps / plannedReps) : (totalReps > 0 ? 1 : 0);
  const setsPercent = plannedSets > 0 ? Math.min(1, completedSets / plannedSets) : (completedSets > 0 ? 1 : 0);

  return (
    <div className="rounded-2xl bg-[#1a1a1a] overflow-hidden content-fade-up-2">
      {/* Swipable carousel */}
      <div
        ref={carouselRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* ═══ Slide 1: Movement Graph ═══ */}
        <div className="w-full shrink-0 snap-center snap-always p-5 pb-3" style={{ minWidth: '100%' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white">Movement Graph</h3>
            {onSeeMore && (
              <button
                onClick={onSeeMore}
                className="text-sm text-amber-400 hover:text-amber-300 transition-colors font-semibold flex items-center gap-1"
              >
                See More
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {svgSegments.length > 0 ? (
            <>
              <div className="relative rounded-xl overflow-hidden bg-black/30" style={{ height: '140px' }}>
                <svg className="w-full h-full" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="none">
                  {svgSegments.map((seg, idx) => (
                    <g key={idx}>
                      <path d={seg.areaD} fill={seg.color.fill} opacity={0.55} />
                      <path
                        d={seg.lineD}
                        fill="none"
                        stroke={seg.color.stroke}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: `drop-shadow(0 0 6px ${seg.color.stroke}80)` }}
                      />
                    </g>
                  ))}
                </svg>
              </div>
              <div className="flex justify-around mt-2">
                {svgSegments.map((seg) => (
                  <span key={seg.setNumber} className="text-xs font-medium text-gray-500">S{seg.setNumber}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-28 text-gray-500 text-sm rounded-xl bg-black/30">
              No sensor data available
            </div>
          )}
        </div>

        {/* ═══ Slide 2: Workout Breakdown ═══ */}
        <div className="w-full shrink-0 snap-center snap-always p-5 pb-3" style={{ minWidth: '100%' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-white">Workout Breakdown</h3>
            {onSeeMore && (
              <button
                onClick={onSeeMore}
                className="text-sm text-amber-400 hover:text-amber-300 transition-colors font-semibold flex items-center gap-1"
              >
                See More
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>

          {/* Rings row */}
          <div className="flex justify-center gap-10 mb-3">
            <Ring value={totalReps} label={`${totalReps} Reps`} progress={repsPercent} />
            <Ring value={completedSets} label={`${completedSets} Sets`} progress={setsPercent} />
          </div>

          {/* Weight breakdown */}
          <div className="rounded-xl bg-white/[0.06] px-3 py-2.5">
            <p className="text-xs font-semibold text-white/70 mb-1.5">Weight</p>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center flex-1">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-2xl font-bold text-white">{baseWeight}</span>
                  <span className="text-sm text-white/50">{weightUnit}</span>
                </div>
                <p className="text-[11px] text-white/40 mt-0.5">{eqInfo.label}</p>
              </div>
              <span className="text-xl font-bold text-white/30">+</span>
              <div className="text-center flex-1">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-2xl font-bold text-white">{addedWeight}</span>
                  <span className="text-sm text-white/50">{weightUnit}</span>
                </div>
                <p className="text-[11px] text-white/40 mt-0.5">Weights</p>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Slide 3 (optional): ROM Analysis ═══ */}
        {romData && (
          <div className="w-full shrink-0 snap-center snap-always p-5 pb-3" style={{ minWidth: '100%' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white">ROM Analysis</h3>
              {onSeeMore && (
                <button
                  onClick={onSeeMore}
                  className="text-sm text-amber-400 hover:text-amber-300 transition-colors font-semibold flex items-center gap-1"
                >
                  See More
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>

            {/* Big fulfillment ring */}
            <div className="flex justify-center mb-3">
              <FulfillmentRing value={romData.avgFulfillment} />
            </div>

            {/* Stats row — Baseline + Avg Achieved only */}
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-[10px] text-gray-500 font-medium mb-0.5">Baseline</p>
                <p className="text-2xl font-bold text-white">
                  {romData.baselineROM.toFixed(1)}
                  <span className="text-xs text-gray-400">{romData.romUnit}</span>
                </p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <p className="text-[10px] text-gray-500 font-medium mb-0.5">Avg Achieved</p>
                <p className="text-2xl font-bold text-white">
                  {romData.avgROM != null ? romData.avgROM.toFixed(1) : '—'}
                  <span className="text-xs text-gray-400">{romData.romUnit}</span>
                </p>
              </div>
            </div>
          </div>
        )}
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

/* ── Circular ring gauge (reused from WorkoutBreakdownCard) ── */
function Ring({ value, label, progress }) {
  const size = 90;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#84cc16"
            strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white leading-none">{value}</span>
          <div className="w-6 h-px bg-white/20 my-1" />
          <span className="text-[10px] text-white/50 leading-none">{label}</span>
        </div>
      </div>
    </div>
  );
}

/* ── ROM Fulfillment Ring ── */
function FulfillmentRing({ value }) {
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value != null ? Math.min(100, Math.max(0, value)) : 0;
  const offset = circumference * (1 - pct / 100);

  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444';
  const textColor = pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold leading-none ${textColor}`}>
          {value != null ? `${value}%` : '—'}
        </span>
        <span className="text-[11px] text-gray-500 mt-1">ROM Match</span>
      </div>
    </div>
  );
}
