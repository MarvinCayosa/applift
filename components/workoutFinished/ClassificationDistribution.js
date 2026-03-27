/**
 * ClassificationDistribution Component (Execution Quality)
 * 
 * Shows ML classification distribution for the workout session.
 * Uses a donut chart for clean distribution visualization.
 * Accepts external selectedSet filter from parent.
 */

import { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

// Color mapping for labels — prediction 0=green, 1=yellow, 2=red
// Defined outside component to avoid temporal dead zone issues
const PREDICTION_1_LABELS_WF = ['Uncontrolled Movement', 'Uncontrolled', 'Pulling Too Fast', 'Pull Fast'];
const PREDICTION_2_LABELS_WF = [
  'Abrupt Initiation', 'Abrupt', 'Inclination Asymmetry', 'Inclination',
  'Releasing Too Fast', 'Release Fast', 'Poor Form', 'Bad Form',
];

export default function ClassificationDistribution({ setsData, analysisData, selectedSet = 'all' }) {
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [isClosingInfo, setIsClosingInfo] = useState(false);

  const closeInfo = () => {
    setIsClosingInfo(true);
    setTimeout(() => { setSelectedLabel(null); setIsClosingInfo(false); }, 250);
  };

  // Classification descriptions in plain language
  const classificationInfo = {
    'Clean': {
      title: 'Clean Rep',
      color: '#22c55e',
      description: 'Your movement was smooth and controlled throughout the rep. The sensor detected no sudden jerks or uneven motion.',
      tip: 'Keep it up! Clean reps mean you\'re building strength safely and effectively.',
    },
    'Uncontrolled Movement': {
      title: 'Uncontrolled Movement',
      color: '#f59e0b',
      description: 'The weight moved too fast or unevenly during this rep. This usually happens when you let gravity take over instead of controlling the movement.',
      tip: 'Try slowing down the lowering phase. Count 2-3 seconds as you lower the weight.',
    },
    'Uncontrolled': {
      title: 'Uncontrolled Movement',
      color: '#f59e0b',
      description: 'The weight moved too fast or unevenly during this rep. This usually happens when you let gravity take over instead of controlling the movement.',
      tip: 'Try slowing down the lowering phase. Count 2-3 seconds as you lower the weight.',
    },
    'Pulling Too Fast': {
      title: 'Pulling Too Fast',
      color: '#f59e0b',
      description: 'You pulled or lifted the weight too quickly. Fast reps reduce muscle engagement and can increase injury risk.',
      tip: 'Focus on a controlled, steady pull. Speed should come from strength, not momentum.',
    },
    'Abrupt Initiation': {
      title: 'Abrupt Start',
      color: '#ef4444',
      description: 'The rep started with a sudden jerk or snap instead of a smooth, controlled movement. This puts extra stress on your joints.',
      tip: 'Pause briefly at the bottom of each rep and start the movement slowly before accelerating.',
    },
    'Inclination Asymmetry': {
      title: 'Uneven Movement',
      color: '#ef4444',
      description: 'The sensor detected that the weight was tilting or moving unevenly — one side more than the other.',
      tip: 'Check that both sides are doing equal work. Focus on keeping the movement straight and balanced.',
    },
    'Releasing Too Fast': {
      title: 'Releasing Too Fast',
      color: '#ef4444',
      description: 'You lowered the weight too quickly. The lowering phase is just as important as lifting — it\'s where a lot of muscle growth happens.',
      tip: 'Slow down the lowering phase. Aim for 2-3 seconds going down.',
    },
    'Poor Form': {
      title: 'Form Issue',
      color: '#ef4444',
      description: 'The sensor detected irregular movement patterns that suggest your form broke down during this rep.',
      tip: 'Consider reducing the weight to maintain better control throughout the full rep.',
    },
  };

  const getClassInfo = (label) => {
    return classificationInfo[label] || {
      title: label,
      color: '#6b7280',
      description: 'Movement pattern detected by the sensor during this rep.',
      tip: 'Focus on controlled, consistent movement throughout each rep.',
    };
  };
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
              <button
                key={label}
                onClick={() => setSelectedLabel(label)}
                className="w-full flex items-center justify-between active:bg-white/5 rounded-lg px-1 py-0.5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                  <span className="text-xs text-gray-300">{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-semibold ${colors.text}`}>{count} ({pct}%)</span>
                  <svg className="w-3 h-3 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
                  </svg>
                </div>
              </button>
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

      {/* Classification Info Modal */}
      {selectedLabel && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-center"
          onClick={closeInfo}
        >
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${isClosingInfo ? 'opacity-0' : 'opacity-100'}`} />
          <div
            className={`relative w-full max-w-lg rounded-t-2xl bg-[#1e1e1e] border-t border-white/10 pb-8 ${isClosingInfo ? 'animate-slideDown' : 'animate-slideUp'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2 cursor-grab" onClick={closeInfo}>
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-5 overflow-y-auto" style={{ maxHeight: '65vh' }}>
              {(() => {
                const info = getClassInfo(selectedLabel);
                return (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: info.color }} />
                      <h4 className="text-[16px] font-bold text-white">{info.title}</h4>
                    </div>
                    <p className="text-[13px] text-white/60 leading-relaxed mb-4">{info.description}</p>
                    <div className="rounded-xl bg-white/[0.04] p-3 mb-2">
                      <p className="text-[12px] text-white/50 leading-relaxed">
                        <span className="text-white/70 font-medium">Tip: </span>{info.tip}
                      </p>
                    </div>
                    {/* Show percentage for this label */}
                    <div className="mt-4 flex items-center justify-between px-1">
                      <span className="text-[12px] text-white/40">This session</span>
                      <span className="text-[14px] font-bold" style={{ color: info.color }}>
                        {distribution.distribution[selectedLabel] || 0} reps ({distribution.distributionPercent[selectedLabel] || 0}%)
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
          <style jsx global>{`
            @keyframes slideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
            @keyframes slideDown { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(100%); } }
            .animate-slideUp { animation: slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
            .animate-slideDown { animation: slideDown 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
}
