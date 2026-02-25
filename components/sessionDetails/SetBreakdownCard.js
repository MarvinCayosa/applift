/**
 * SetBreakdownCard
 *
 * Displays a per-set breakdown with visual rep dots.
 * Filled dots for performed reps, hollow/dashed dots for skipped reps.
 * If the workout was cut short, shows placeholder cards for skipped sets.
 *
 * Props:
 *   setsData       – array of set objects (from mergedSetsData)
 *   plannedSets    – total planned sets
 *   plannedRepsPerSet – planned reps per set
 *   primaryColor   – equipment accent color
 */

import { useMemo } from 'react';

const SET_COLORS = {
  1: '#a855f7',
  2: '#3b82f6',
  3: '#22c55e',
  4: '#eab308',
  5: '#ef4444',
  6: '#f97316',
};

export default function SetBreakdownCard({
  setsData = [],
  plannedSets = 0,
  plannedRepsPerSet = 0,
  primaryColor = '#a855f7',
}) {
  const sets = useMemo(() => {
    const numPlanned = plannedSets || setsData.length;
    const repsPerSet = plannedRepsPerSet || 10;
    const result = [];

    for (let i = 0; i < numPlanned; i++) {
      const setNum = i + 1;
      const setData = setsData.find((s) => (s.setNumber || 0) === setNum) || setsData[i] || null;

      if (setData) {
        const completedReps = setData.completedReps ?? setData.reps ?? setData.repsData?.length ?? 0;
        const planned = setData.plannedReps ?? repsPerSet;
        const isIncomplete = setData.incomplete === true || completedReps < planned;
        result.push({
          setNumber: setNum,
          completedReps,
          plannedReps: planned,
          isIncomplete,
          isSkipped: false,
          data: setData,
        });
      } else {
        // Entirely skipped set (never started)
        result.push({
          setNumber: setNum,
          completedReps: 0,
          plannedReps: repsPerSet,
          isIncomplete: true,
          isSkipped: true,
          data: null,
        });
      }
    }
    return result;
  }, [setsData, plannedSets, plannedRepsPerSet]);

  if (sets.length === 0) return null;

  return (
    <div className="rounded-2xl bg-[#1a1a1a] p-4">
      <h3 className="text-[13px] font-bold text-white mb-3">Set Breakdown</h3>
      <div className="space-y-2.5">
        {sets.map((set) => {
          const color = SET_COLORS[set.setNumber] || primaryColor;

          return (
            <div
              key={set.setNumber}
              className={`rounded-xl p-3.5 flex items-center gap-3 ${
                set.isSkipped ? 'border border-dashed border-white/10 bg-white/[0.02]' : 'bg-white/[0.05]'
              }`}
            >
              {/* Set number circle */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{
                  backgroundColor: set.isSkipped ? 'transparent' : color,
                  border: set.isSkipped ? `1.5px dashed ${color}50` : 'none',
                  color: set.isSkipped ? `${color}80` : 'white',
                }}
              >
                {set.setNumber}
              </div>

              {/* Middle: rep dots + label */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[12px] font-semibold text-white">
                    Set {set.setNumber}
                  </span>
                  {set.isSkipped && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/30">
                      Skipped
                    </span>
                  )}
                  {set.isIncomplete && !set.isSkipped && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400/80">
                      Incomplete
                    </span>
                  )}
                </div>

                {/* Rep dots grid */}
                <div className="flex flex-wrap gap-[5px]">
                  {Array.from({ length: set.plannedReps }).map((_, repIdx) => {
                    const isPerformed = repIdx < set.completedReps;
                    return (
                      <div
                        key={repIdx}
                        className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-semibold"
                        style={
                          isPerformed
                            ? {
                                backgroundColor: color,
                                color: 'white',
                              }
                            : {
                                border: `1.5px dashed ${color}30`,
                                color: `${color}40`,
                                backgroundColor: 'transparent',
                              }
                        }
                      >
                        {repIdx + 1}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: rep fraction */}
              <div className="text-right shrink-0">
                <span
                  className="text-sm font-bold"
                  style={{ color: set.isSkipped ? 'rgba(255,255,255,0.2)' : 'white' }}
                >
                  {set.completedReps}
                  <span className="text-white/30 font-normal">/{set.plannedReps}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
