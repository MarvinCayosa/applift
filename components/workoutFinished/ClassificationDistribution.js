/**
 * ClassificationDistribution Component (Execution Quality)
 * 
 * Shows ML classification distribution for the workout session.
 * Uses a donut chart for clean distribution visualization.
 * Accepts external selectedSet filter from parent.
 */

import { useMemo } from 'react';

// Color mapping for labels — prediction 0=green, 1=yellow, 2=red
// Defined outside component to avoid temporal dead zone issues
const PREDICTION_1_LABELS_WF = ['Uncontrolled Movement', 'Uncontrolled', 'Pulling Too Fast', 'Pull Fast'];
const PREDICTION_2_LABELS_WF = [
  'Abrupt Initiation', 'Abrupt', 'Inclination Asymmetry', 'Inclination',
  'Releasing Too Fast', 'Release Fast', 'Poor Form', 'Bad Form',
];

export default function ClassificationDistribution({ setsData, analysisData, selectedSet = 'all' }) {
  // Calculate distribution from setsData filtered by selectedSet
  const distribution = useMemo(() => {
    if (!setsData || setsData.length === 0) {
      return { totalReps: 0, cleanReps: 0, cleanPercentage: 0, labels: [], distribution: {}, distributionPercent: {} };
    }

    const filteredSets = selectedSet === 'all' 
      ? setsData 
      : setsData.filter(s => s.setNumber === parseInt(selectedSet));

    const allReps = filteredSets.flatMap(set => set.repsData || []);
    const totalReps = allReps.length;

    if (totalReps === 0) {
      return { totalReps: 0, cleanReps: 0, cleanPercentage: 0, labels: [], distribution: {}, distributionPercent: {} };
    }

    const classificationCounts = {};
    let cleanReps = 0;

    allReps.forEach(rep => {
      let label = 'Clean';
      if (rep.classification?.label) {
        label = rep.classification.label;
      } else if (rep.quality) {
        label = rep.quality === 'clean' ? 'Clean' : 
                rep.quality === 'uncontrolled' ? 'Uncontrolled Movement' : 'Poor Form';
      } else if (rep.smoothnessScore !== undefined) {
        label = rep.smoothnessScore >= 75 ? 'Clean' : 
                rep.smoothnessScore >= 50 ? 'Uncontrolled Movement' : 'Poor Form';
      }

      classificationCounts[label] = (classificationCounts[label] || 0) + 1;
      if (label === 'Clean') cleanReps++;
    });

    // Fixed order: Clean, Mistake 1, Mistake 2
    const allLabels = Object.keys(classificationCounts)
    const orderedLabels = []
    
    // Always add Clean first if it exists
    if (allLabels.includes('Clean')) orderedLabels.push('Clean')
    
    // Add first mistake type (prediction 1)
    const mistake1Label = allLabels.find(label => 
      label !== 'Clean' && (PREDICTION_1_LABELS_WF.some(l => label.includes(l) || l.includes(label)) || label === '1')
    )
    if (mistake1Label) orderedLabels.push(mistake1Label)
    
    // Add second mistake type (prediction 2) 
    const mistake2Label = allLabels.find(label => 
      label !== 'Clean' && label !== mistake1Label && 
      (PREDICTION_2_LABELS_WF.some(l => label.includes(l) || l.includes(label)) || label === '2')
    )
    if (mistake2Label) orderedLabels.push(mistake2Label)
    
    // Add any remaining labels
    const remainingLabels = allLabels.filter(label => !orderedLabels.includes(label))
    orderedLabels.push(...remainingLabels)
    
    const labels = orderedLabels

    const distributionPercent = {};
    labels.forEach(label => {
      distributionPercent[label] = Math.round((classificationCounts[label] / totalReps) * 100);
    });

    return { totalReps, cleanReps, cleanPercentage: Math.round((cleanReps / totalReps) * 100), labels, distribution: classificationCounts, distributionPercent };
  }, [setsData, selectedSet]);

  // Color mapping function — prediction 0=green, 1=yellow, 2=red
  const getLabelColor = (label, index) => {
    if (label === 'Clean' || index === 0) return { hex: '#22c55e', text: 'text-green-400', dot: 'bg-green-400' };
    if (PREDICTION_1_LABELS_WF.some((l) => label.includes(l) || l.includes(label)) || index === 1) {
      return { hex: '#f59e0b', text: 'text-orange-400', dot: 'bg-orange-400' };
    }
    return { hex: '#ef4444', text: 'text-red-400', dot: 'bg-red-400' };
  };

  // Build donut chart segments
  const donutSegments = useMemo(() => {
    if (distribution.labels.length === 0) return [];
    const segments = [];
    let cumulative = 0;
    const circumference = 2 * Math.PI * 40; // r=40

    distribution.labels.forEach((label, index) => {
      const pct = (distribution.distribution[label] || 0) / distribution.totalReps;
      const dashLength = pct * circumference;
      const dashOffset = -cumulative * circumference;
      segments.push({ label, pct, dashLength, dashOffset, circumference, color: getLabelColor(label, index).hex });
      cumulative += pct;
    });
    return segments;
  }, [distribution]);

  // Rating
  const getRating = (cleanPct) => {
    if (cleanPct >= 80) return { text: 'Excellent', color: 'text-green-400' };
    if (cleanPct >= 60) return { text: 'Good', color: 'text-green-500' };
    if (cleanPct >= 40) return { text: 'Fair', color: 'text-yellow-500' };
    return { text: 'Needs Work', color: 'text-orange-500' };
  };
  const rating = getRating(distribution.cleanPercentage);

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 content-fade-up-2">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">Execution Quality</h3>
      </div>

      {/* Donut + Stats side by side */}
      <div className="flex items-center gap-5 mb-4">
        {/* Donut Chart */}
        <div className="relative flex-shrink-0" style={{ width: 100, height: 100 }}>
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            {donutSegments.map((seg, i) => (
              <circle
                key={i}
                cx="50" cy="50" r="40"
                fill="none"
                stroke={seg.color}
                strokeWidth="8"
                strokeDasharray={`${seg.dashLength} ${seg.circumference - seg.dashLength}`}
                strokeDashoffset={seg.dashOffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            ))}
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xl font-bold ${rating.color}`}>{distribution.cleanPercentage}%</span>
            <span className="text-[9px] text-gray-400">Clean</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          {distribution.labels.map((label, index) => {
            const count = distribution.distribution[label] || 0;
            const pct = distribution.distributionPercent[label] || 0;
            const colors = getLabelColor(label, index);
            return (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                  <span className="text-xs text-gray-300">{label}</span>
                </div>
                <span className={`text-xs font-semibold ${colors.text}`}>{count} ({pct}%)</span>
              </div>
            );
          })}
          {distribution.totalReps > 0 && (
            <div className="pt-1 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">Total</span>
                <span className="text-[10px] text-gray-500">{distribution.totalReps} reps</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rating badge */}
      {distribution.totalReps > 0 && (
        <div className="px-3 py-2 bg-white/5 rounded-xl">
          <p className="text-xs text-gray-400 text-center">
            {distribution.cleanPercentage >= 80 
              ? 'Excellent execution! Great muscle control throughout.'
              : distribution.cleanPercentage >= 60
                ? 'Good execution overall. Minor adjustments can help.'
                : distribution.cleanPercentage >= 40
                  ? 'Focus on controlled movements to improve quality.'
                  : 'Consider reducing weight to improve execution quality.'}
          </p>
        </div>
      )}
    </div>
  );
}
