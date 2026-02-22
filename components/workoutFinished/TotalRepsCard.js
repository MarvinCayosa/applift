/**
 * TotalRepsCard Component
 * 
 * Shows total completed reps vs planned reps for the entire workout.
 * Displays completion percentage with visual ring indicator.
 */
import { useMemo } from 'react';

export default function TotalRepsCard({ 
  setsData, 
  recommendedSets, 
  recommendedReps 
}) {
  const stats = useMemo(() => {
    if (!setsData || setsData.length === 0) {
      return {
        totalCompletedReps: 0,
        totalPlannedReps: parseInt(recommendedSets || 0) * parseInt(recommendedReps || 0),
        completedSets: 0,
        plannedSets: parseInt(recommendedSets || 0),
        completionPercent: 0,
        incompleteSets: 0
      };
    }

    // Calculate actual completed reps from setsData
    let totalCompletedReps = 0;
    let incompleteSets = 0;

    setsData.forEach(set => {
      const setReps = set.reps || set.completedReps || set.repsData?.length || 0;
      totalCompletedReps += setReps;
      if (set.incomplete) {
        incompleteSets++;
      }
    });

    const plannedSets = parseInt(recommendedSets || setsData.length);
    const plannedRepsPerSet = parseInt(recommendedReps || 0);
    const totalPlannedReps = plannedSets * plannedRepsPerSet;

    const completionPercent = totalPlannedReps > 0 
      ? Math.round((totalCompletedReps / totalPlannedReps) * 100)
      : 100;

    return {
      totalCompletedReps,
      totalPlannedReps,
      completedSets: setsData.length,
      plannedSets,
      completionPercent: Math.min(100, completionPercent),
      incompleteSets
    };
  }, [setsData, recommendedSets, recommendedReps]);

  // Determine color based on completion
  const getCompletionColor = (percent) => {
    if (percent >= 100) return { ring: '#22c55e', text: 'text-green-400', bg: 'bg-green-500/15', label: 'Complete!' };
    if (percent >= 75) return { ring: '#22c55e', text: 'text-green-400', bg: 'bg-green-500/15', label: 'Great' };
    if (percent >= 50) return { ring: '#eab308', text: 'text-yellow-400', bg: 'bg-yellow-500/15', label: 'Good' };
    if (percent >= 25) return { ring: '#f97316', text: 'text-orange-400', bg: 'bg-orange-500/15', label: 'Partial' };
    return { ring: '#ef4444', text: 'text-red-400', bg: 'bg-red-500/15', label: 'Low' };
  };

  const color = getCompletionColor(stats.completionPercent);

  // Ring gauge math
  const ringRadius = 32;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = Math.min(1, stats.completionPercent / 100);

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm overflow-hidden content-fade-up-3">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-base font-semibold text-white">Workout Progress</h3>
      </div>

      {/* Content */}
      <div className="px-5 pb-5">
        <div className="flex items-center gap-5">
          {/* Ring gauge */}
          <div className={`flex-shrink-0 rounded-2xl ${color.bg} flex flex-col items-center justify-center p-4`}>
            <div className="relative" style={{ width: '80px', height: '80px' }}>
              <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                {/* Track */}
                <circle cx="40" cy="40" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
                {/* Progress */}
                <circle
                  cx="40" cy="40" r={ringRadius}
                  fill="none"
                  stroke={color.ring}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference * (1 - ringProgress)}
                  style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-xl font-bold ${color.text}`}>{stats.completionPercent}%</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-3">
            {/* Total Reps */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Total Reps</span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold text-white">{stats.totalCompletedReps}</span>
                <span className="text-sm text-white/40">/</span>
                <span className="text-sm text-white/50">{stats.totalPlannedReps}</span>
              </div>
            </div>

            {/* Sets Completed */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Sets</span>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-white">{stats.completedSets}</span>
                <span className="text-sm text-white/40">/</span>
                <span className="text-sm text-white/50">{stats.plannedSets}</span>
              </div>
            </div>

            {/* Incomplete indicator */}
            {stats.incompleteSets > 0 && (
              <div className="flex items-center gap-1.5 pt-1">
                <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-xs text-yellow-400">
                  {stats.incompleteSets} incomplete set{stats.incompleteSets > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
