/**
 * MovementGraphCard
 *
 * Overall movement graph across all sets (SVG-based).
 * Each set gets a distinct color with filled area and colored line.
 * X-axis shows set labels (S1, S2, …), no grid lines.
 * "See More >" navigates to PerformanceDetails.
 *
 * Design reference: pasted image 3
 */

import { useMemo, useState } from 'react';
import { buildChartSegments, buildChartSegmentsFromAnalysis } from '../../utils/sessionDetails/chartMappers';

const SVG_W = 400;
const SVG_H = 120;
const PAD_T = 8;
const PAD_B = 4;
const PLOT_H = SVG_H - PAD_T - PAD_B;

export default function MovementGraphCard({ gcsData, chartData, setsData, onSeeMore }) {
  const [hoveredSet, setHoveredSet] = useState(null);

  // Build chart segments from GCS data first, fallback to analysis
  const { segments, allData } = useMemo(() => {
    if (gcsData?.sets?.length > 0) {
      return buildChartSegments(gcsData);
    }
    if (chartData?.length > 0) {
      return buildChartSegmentsFromAnalysis(chartData, setsData);
    }
    return { segments: [], allData: [] };
  }, [gcsData, chartData, setsData]);

  const maxVal = useMemo(() => {
    if (allData.length === 0) return 1;
    return Math.max(...allData, 1);
  }, [allData]);

  // Build continuous index for x-positioning
  const totalPoints = allData.length;

  // Per-segment SVG paths & fills
  const svgSegments = useMemo(() => {
    if (segments.length === 0) return [];

    let globalIdx = 0;
    return segments.map((seg) => {
      const startIdx = globalIdx;
      const endIdx = globalIdx + seg.data.length - 1;

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

      return {
        setNumber: seg.setNumber,
        color: seg.color,
        lineD,
        areaD,
        startX,
        endX,
        labelX,
      };
    });
  }, [segments, totalPoints, maxVal]);

  if (segments.length === 0) {
    return (
      <div className="rounded-2xl bg-[#1a1a1a] p-5 content-fade-up-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white">Movement Graph</h3>
        </div>
        <div className="flex items-center justify-center h-28 text-gray-500 text-sm">
          No sensor data available
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#1a1a1a] p-5 content-fade-up-2">
      {/* Title + See More */}
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

      {/* SVG chart */}
      <div
        className="relative rounded-xl overflow-hidden bg-black/30"
        style={{ height: '140px' }}
        onMouseLeave={() => setHoveredSet(null)}
      >
        <svg className="w-full h-full" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="none">
          {svgSegments.map((seg, idx) => (
            <g key={idx}>
              {/* Filled area */}
              <path
                d={seg.areaD}
                fill={seg.color.fill}
                opacity={hoveredSet === seg.setNumber ? 0.85 : 0.55}
                style={{ transition: 'opacity 0.2s' }}
              />
              {/* Line */}
              <path
                d={seg.lineD}
                fill="none"
                stroke={seg.color.stroke}
                strokeWidth={hoveredSet === seg.setNumber ? 3.5 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: `drop-shadow(0 0 ${hoveredSet === seg.setNumber ? 10 : 6}px ${seg.color.stroke}80)`,
                  transition: 'all 0.2s',
                }}
              />
              {/* Invisible hover zone */}
              <rect
                x={seg.startX}
                y={0}
                width={seg.endX - seg.startX}
                height={SVG_H}
                fill="transparent"
                onMouseEnter={() => setHoveredSet(seg.setNumber)}
                style={{ cursor: 'pointer' }}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Set labels */}
      <div className="flex justify-around mt-2">
        {svgSegments.map((seg) => (
          <span
            key={seg.setNumber}
            className={`text-xs font-medium transition-colors ${
              hoveredSet === seg.setNumber ? 'text-white' : 'text-gray-500'
            }`}
          >
            S{seg.setNumber}
          </span>
        ))}
      </div>
    </div>
  );
}
