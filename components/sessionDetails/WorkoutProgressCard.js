/**
 * WorkoutProgressCard Component for Session Details
 * 
 * Shows total completed reps vs planned reps for the session.
 * Displays completion percentage with visual ring indicator.
 */
import { useMemo } from 'react';

export default function WorkoutProgressCard({ 
  setsData, 
  plannedSets, 
  plannedRepsPerSet,
  totalReps: propsTotalReps,
  totalSets: propsTotalSets
}) {
  const stats = useMemo(() => {
    // Try to use props first, then calculate from setsData
    let totalCompletedReps = parseInt(propsTotalReps || 0);
    let completedSets = parseInt(propsTotalSets || 0);
    let incompleteSets = 0;

    if (setsData && setsData.length > 0) {
      // Calculate from setsData if not provided via props
      if (!totalCompletedReps) {
        totalCompletedReps = setsData.reduce((sum, set) => {
          return sum + (set.reps || set.completedReps || set.repsData?.length || 0);
        }, 0);
      }
      if (!completedSets) {
        completedSets = setsData.length;
      }
      
      // Count incomplete sets
      incompleteSets = setsData.filter(s => s.incomplete).length;
    }

    // Calculate total planned reps: plannedSets * reps per set
    const totalPlannedReps = parseInt(plannedSets || completedSets) * parseInt(plannedRepsPerSet || 10);

    const completionPercent = totalPlannedReps > 0 
      ? Math.round((totalCompletedReps / totalPlannedReps) * 100)
      : 100;

    return {
      totalCompletedReps,
      totalPlannedReps,
      completedSets,
      plannedSets: parseInt(plannedSets || completedSets),
      completionPercent: Math.min(100, completionPercent),
      incompleteSets
    };
  }, [setsData, plannedSets, plannedRepsPerSet, propsTotalReps, propsTotalSets]);

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
  const ringRadius = 28;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringProgress = Math.min(1, stats.completionPercent / 100);

  return (
    <div className="rounded-2xl bg-white/[0.05] overflow-hidden">
      {/* Content */}
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* Ring gauge */}
          <div className={`flex-shrink-0 rounded-xl ${color.bg} flex flex-col items-center justify-center p-3`}>
            <div className="relative" style={{ width: '64px', height: '64px' }}>
              <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                {/* Track */}
                <circle cx="32" cy="32" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                {/* Progress */}
                <circle
                  cx="32" cy="32" r={ringRadius}
                  fill="none"
                  stroke={color.ring}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference * (1 - ringProgress)}
                  style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-sm font-bold ${color.text}`}>{stats.completionPercent}%</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-2">
            <h4 className="text-sm font-medium text-white/80">Workout Progress</h4>
            
            {/* Total Reps */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/50">Total Reps</span>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-white">{stats.totalCompletedReps}</span>
                {stats.totalPlannedReps > 0 && (
                  <>
                    <span className="text-xs text-white/30">/</span>
                    <span className="text-xs text-white/40">{stats.totalPlannedReps}</span>
                  </>
                )}
              </div>
            </div>

            {/* Sets Completed */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/50">Sets</span>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-white">{stats.completedSets}</span>
                {stats.plannedSets > 0 && (
                  <>
                    <span className="text-xs text-white/30">/</span>
                    <span className="text-xs text-white/40">{stats.plannedSets}</span>
                  </>
                )}
              </div>
            </div>

            {/* Incomplete indicator */}
            {stats.incompleteSets > 0 && (
              <div className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-[10px] text-yellow-400">
                  {stats.incompleteSets} incomplete
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
