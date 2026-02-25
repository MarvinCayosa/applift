/**
 * WorkoutProgressCard Component for Session Details
 *
 * Displays "Workout Breakdown" — reps & sets rings + weight split.
 * Wraps the shared WorkoutBreakdownCard with session-details data.
 */
import { useMemo } from 'react';
import WorkoutBreakdownCard from '../WorkoutBreakdownCard';

export default function WorkoutProgressCard({
  setsData,
  plannedSets,
  plannedRepsPerSet,
  totalReps: propsTotalReps,
  totalSets: propsTotalSets,
  weight = 0,
  weightUnit = 'kg',
  equipment = '',
}) {
  const stats = useMemo(() => {
    let totalCompletedReps = parseInt(propsTotalReps || 0);
    let completedSets = parseInt(propsTotalSets || 0);

    if (setsData && setsData.length > 0) {
      if (!totalCompletedReps) {
        totalCompletedReps = setsData.reduce((sum, set) => {
          return sum + (set.reps || set.completedReps || set.repsData?.length || 0);
        }, 0);
      }
      if (!completedSets) {
        completedSets = setsData.length;
      }
    }

    const pSets = parseInt(plannedSets || completedSets);
    const totalPlannedReps = pSets * parseInt(plannedRepsPerSet || 10);

    return {
      totalCompletedReps,
      totalPlannedReps,
      completedSets,
      plannedSets: pSets,
    };
  }, [setsData, plannedSets, plannedRepsPerSet, propsTotalReps, propsTotalSets]);

  return (
    <WorkoutBreakdownCard
      totalReps={stats.totalCompletedReps}
      plannedReps={stats.totalPlannedReps}
      completedSets={stats.completedSets}
      plannedSets={stats.plannedSets}
      weight={weight}
      weightUnit={weightUnit}
      equipment={equipment}
    />
  );
}
