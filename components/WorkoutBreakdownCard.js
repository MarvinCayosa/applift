/**
 * WorkoutBreakdownCard
 *
 * Shows a "Workout Breakdown" section with:
 *  - Two green circular rings for Reps and Sets
 *  - A weight breakdown row (equipment base + added weights)
 *
 * Used in both post-workout summary (workout-finished) and
 * session details pages.
 */

import { useMemo } from 'react';

// ── Equipment base-weight lookup ──
function getEquipmentBase(equipment) {
  const eq = (equipment || '').toLowerCase();
  if (eq.includes('barbell'))      return { label: 'Olympic Barbell', base: 20 };
  if (eq.includes('dumbbell'))     return { label: 'Dumbbell Handle', base: 2  };
  if (eq.includes('weight stack') || eq.includes('machine') || eq.includes('cable'))
                                   return { label: 'Weight Stack',   base: 0  };
  return { label: 'Equipment', base: 0 };
}

export default function WorkoutBreakdownCard({
  totalReps = 0,
  plannedReps = 0,       // total planned reps (sets × reps-per-set)
  completedSets = 0,
  plannedSets = 0,
  weight = 0,
  weightUnit = 'kg',
  equipment = '',
}) {
  const eqInfo = useMemo(() => getEquipmentBase(equipment), [equipment]);

  // Compute added weight (plates / extra)
  const baseWeight = Math.min(eqInfo.base, weight); // never exceed total
  const addedWeight = Math.max(0, weight - baseWeight);

  // Ring progress (clamped 0-1)
  const repsPercent  = plannedReps  > 0 ? Math.min(1, totalReps    / plannedReps)  : (totalReps > 0 ? 1 : 0);
  const setsPercent  = plannedSets  > 0 ? Math.min(1, completedSets / plannedSets) : (completedSets > 0 ? 1 : 0);

  return (
    <div className="rounded-2xl bg-[#1a1a1a] p-5 space-y-2">
      {/* Title */}
      <h3 className="text-lg font-bold text-white">Workout Breakdown</h3>

      {/* Rings row */}
      <div className="flex justify-center gap-10">
        <Ring value={totalReps}  label={`${totalReps} Reps`}  progress={repsPercent}  />
        <Ring value={completedSets} label={`${completedSets} Sets`} progress={setsPercent}  />
      </div>

      {/* Weight breakdown */}
      <div className="rounded-xl bg-white/[0.06] p-4">
        <p className="text-xs font-semibold text-white/70 mb-2">Weight</p>
        <div className="flex items-center justify-center gap-4">
          {/* Base equipment weight */}
          <div className="text-center flex-1">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold text-white">{baseWeight}</span>
              <span className="text-sm text-white/50">{weightUnit}</span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">{eqInfo.label}</p>
          </div>

          {/* Plus sign */}
          <span className="text-xl font-bold text-white/30">+</span>

          {/* Added weights */}
          <div className="text-center flex-1">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold text-white">{addedWeight}</span>
              <span className="text-sm text-white/50">{weightUnit}</span>
            </div>
            <p className="text-[11px] text-white/40 mt-0.5">Weights</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Circular ring gauge ── */
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
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}
          />
          {/* Progress */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke="#84cc16"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
          />
        </svg>
        {/* Center: number + separator + label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white leading-none">{value}</span>
          <div className="w-6 h-px bg-white/20 my-1" />
          <span className="text-[10px] text-white/50 leading-none">{label}</span>
        </div>
      </div>
    </div>
  );
}
