/**
 * ExecutionQualityCard
 *
 * Modern donut chart showing ML classification distribution.
 * Uses Recharts PieChart like EquipmentDistributionCard.
 *
 * Color mapping based on ML prediction number:
 *   prediction 0 → Green (Clean)
 *   prediction 1 → Yellow (1st non-clean: Uncontrolled Movement / Pulling Too Fast)
 *   prediction 2 → Red (2nd non-clean: Abrupt Initiation / Inclination Asymmetry / Releasing Too Fast)
 *
 * Data sources (priority):
 *   1. rep.classification.prediction (ML model numeric output)
 *   2. rep.classification.label (ML model string label)
 *   3. rep.quality / rep.smoothnessScore (fallback heuristics)
 */

import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts';

/**
 * Map a classification to a severity bucket (0 = clean, 1 = mild, 2 = severe).
 *
 * The ML model outputs prediction 0/1/2. When the numeric prediction is
 * available we use it directly. Otherwise we infer from the label string.
 *
 * Known label strings per prediction:
 *   0: "Clean"
 *   1: "Uncontrolled Movement", "Pulling Too Fast"
 *   2: "Abrupt Initiation", "Inclination Asymmetry", "Releasing Too Fast",
 *      "Poor Form", "Bad Form"
 */
const SEVERITY_COLORS = {
  0: '#22c55e', // Green  – Clean
  1: '#f59e0b', // Yellow – 1 mistake
  2: '#ef4444', // Red    – 2 mistakes
};

const PREDICTION_1_LABELS = ['Uncontrolled Movement', 'Uncontrolled', 'Pulling Too Fast', 'Pull Fast'];
const PREDICTION_2_LABELS = [
  'Abrupt Initiation', 'Abrupt', 'Inclination Asymmetry', 'Inclination',
  'Releasing Too Fast', 'Release Fast', 'Poor Form', 'Bad Form',
  'Quality Issue 1', 'Quality Issue 2', 'Error Type 1', 'Error Type 2',
];

function getSeverity(rep) {
  // 1. If the ML prediction number is stored, use it directly
  const pred = rep.classification?.prediction;
  if (pred === 0 || pred === 1 || pred === 2) return pred;

  // 2. Infer from label string
  const label = rep.classification?.label;
  if (label) {
    if (label === 'Clean') return 0;
    if (PREDICTION_1_LABELS.some((l) => label.includes(l) || l.includes(label))) return 1;
    if (PREDICTION_2_LABELS.some((l) => label.includes(l) || l.includes(label))) return 2;
    // Unknown label → treat as yellow (mild)
    return 1;
  }

  // 3. Fallback heuristics
  if (rep.quality) {
    if (rep.quality === 'clean') return 0;
    if (rep.quality === 'uncontrolled') return 1;
    return 2;
  }
  if (rep.smoothnessScore !== undefined) {
    if (rep.smoothnessScore >= 75) return 0;
    if (rep.smoothnessScore >= 50) return 1;
    return 2;
  }

  // No data at all → clean by default
  return 0;
}

function getLabelForSeverity(rep, severity) {
  // Use the actual label from classification if available
  if (rep.classification?.label) return rep.classification.label;
  if (rep.quality) {
    if (rep.quality === 'clean') return 'Clean';
    if (rep.quality === 'uncontrolled') return 'Uncontrolled Movement';
    return 'Poor Form';
  }
  if (severity === 0) return 'Clean';
  if (severity === 1) return 'Uncontrolled Movement';
  return 'Poor Form';
}

export default function ExecutionQualityCard({ setsData, gcsData, selectedSet = 'all' }) {
  const [activeIndex, setActiveIndex] = useState(null);

  // Build distribution from classification data
  const { chartData, totalReps } = useMemo(() => {
    // Collect all reps from mergedSetsData
    let allReps = [];

    if (setsData && setsData.length > 0) {
      const filteredSets =
        selectedSet === 'all' ? setsData : setsData.filter((s) => s.setNumber === parseInt(selectedSet));
      allReps = filteredSets.flatMap((set) => set.repsData || []);
    }

    // If setsData has reps but none have classification, try extracting from GCS
    const hasAnyClassification = allReps.some(
      (r) => r.classification?.label || r.classification?.prediction !== undefined || r.quality || r.smoothnessScore !== undefined
    );

    if (!hasAnyClassification && gcsData?.sets?.length > 0) {
      // Extract classification from GCS workout_data.json
      const gcsSets = selectedSet === 'all'
        ? gcsData.sets
        : gcsData.sets.filter((s) => s.setNumber === parseInt(selectedSet));
      const gcsReps = gcsSets.flatMap((set) => set.reps || []);
      if (gcsReps.some((r) => r.classification)) {
        allReps = gcsReps;
      }
    }

    const totalReps = allReps.length;
    if (totalReps === 0) {
      return { chartData: [], totalReps: 0 };
    }

    // Count by severity bucket
    const buckets = {}; // { severity -> { label, count, color } }

    allReps.forEach((rep) => {
      const severity = getSeverity(rep);
      const label = getLabelForSeverity(rep, severity);
      const color = SEVERITY_COLORS[severity];

      if (!buckets[severity]) {
        buckets[severity] = { name: label, value: 0, color, severity };
      }
      buckets[severity].value++;
    });

    // Sort: green (0) first, then yellow (1), then red (2)
    const chartData = Object.values(buckets).sort((a, b) => a.severity - b.severity);

    return { chartData, totalReps };
  }, [setsData, gcsData, selectedSet]);

  // Custom active shape for hover effect (like EquipmentDistributionCard)
  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 4}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        cornerRadius={6}
        stroke="none"
        style={{ transition: 'all 0.3s ease' }}
      />
    );
  };

  const onPieEnter = (_, index) => {
    setActiveIndex(index);
  };

  const onPieLeave = () => {
    setActiveIndex(null);
  };

  // Truncate long label for legend
  const truncate = (s, max = 18) => (s.length > max ? s.slice(0, max - 1) + '…' : s);

  return (
    <div className="rounded-2xl bg-[#1a1a1a] p-4 pb-3.5 flex flex-col" style={{ minHeight: 260 }}>
      <h3 className="text-[13px] font-bold text-white mb-2">Execution Quality</h3>

      {/* Donut Chart (Recharts) */}
      <div className="flex-1 flex items-center justify-center relative">
        <div style={{ width: '100%', height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                activeIndex={activeIndex}
                activeShape={renderActiveShape}
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={32}
                outerRadius={48}
                paddingAngle={4}
                dataKey="value"
                onMouseEnter={onPieEnter}
                onMouseLeave={onPieLeave}
                animationBegin={0}
                animationDuration={600}
                animationEasing="ease-out"
                cornerRadius={6}
                stroke="none"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke="none"
                    style={{
                      filter:
                        activeIndex === index
                          ? 'brightness(1.15)'
                          : activeIndex !== null
                          ? 'brightness(0.85)'
                          : 'brightness(1)',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Center check icon */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-1.5 mt-2">
        {chartData.map((item, index) => {
          const percentage = totalReps > 0 ? Math.round((item.value / totalReps) * 100) : 0;
          const isActive = activeIndex === index;

          return (
            <button
              key={index}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              className={`w-full flex items-center justify-between px-2 py-0.5 rounded-lg transition-all duration-300 ${
                isActive ? 'bg-white/10 scale-[1.01]' : 'bg-transparent hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className={`w-[7px] h-[7px] rounded-full shrink-0 transition-transform duration-300 ${
                    isActive ? 'scale-125' : ''
                  }`}
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className={`text-[11px] leading-none truncate transition-all duration-300 ${
                    isActive ? 'text-white' : 'text-gray-300'
                  }`}
                >
                  {truncate(item.name)}
                </span>
              </div>
              <span
                className={`text-[11px] font-bold shrink-0 ml-1 transition-all duration-300 ${
                  isActive ? 'text-white scale-110' : 'text-gray-400'
                }`}
              >
                {percentage}%
              </span>
            </button>
          );
        })}

        {totalReps > 0 && (
          <p className="text-[9px] text-gray-600 text-center mt-1.5">Based on all sessions</p>
        )}
      </div>
    </div>
  );
}
