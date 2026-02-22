/**
 * MovementPhasesSection
 *
 * Horizontal stacked progress bar (concentric vs eccentric),
 * percentage labels, and average times.
 *
 * Design reference: pasted image 1 (bottom section)
 */

import { useMemo } from 'react';

export default function MovementPhasesSection({
  avgConcentric: propConc,
  avgEccentric: propEcc,
  concentricPercent: propConcPct,
  eccentricPercent: propEccPct,
  setsData,
}) {
  // Compute from setsData if props unavailable
  const computed = useMemo(() => {
    if (!setsData || setsData.length === 0) return null;
    let totalLift = 0;
    let totalLow = 0;
    let count = 0;
    setsData.forEach((set) =>
      (set.repsData || []).forEach((rep) => {
        // Note: liftingTime and loweringTime are swapped in analysis
        const lt = rep.loweringTime || 0;
        const lo = rep.liftingTime || 0;
        if (lt + lo > 0) {
          totalLift += lt;
          totalLow += lo;
          count++;
        }
      })
    );
    if (count === 0) return null;
    const avgL = totalLift / count;
    const avgLo = totalLow / count;
    const total = avgL + avgLo;
    return {
      concentric: avgL,
      eccentric: avgLo,
      concPct: total > 0 ? (avgL / total) * 100 : 50,
      eccPct: total > 0 ? (avgLo / total) * 100 : 50,
    };
  }, [setsData]);

  const conc = propConc ?? computed?.concentric ?? 0;
  const ecc = propEcc ?? computed?.eccentric ?? 0;
  const total = conc + ecc || 1;
  const concPct = parseFloat(propConcPct ?? computed?.concPct ?? (conc / total) * 100).toFixed(1);
  const eccPct = parseFloat(propEccPct ?? computed?.eccPct ?? (ecc / total) * 100).toFixed(1);

  if (conc === 0 && ecc === 0) return null;

  return (
    <div className="rounded-2xl bg-[#1a1a1a] p-5 content-fade-up-3">
      <h3 className="text-base font-bold text-white mb-4">Movement Phases</h3>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${concPct}%` }}
          />
          <div
            className="absolute inset-y-0 bg-gradient-to-r from-yellow-500 to-orange-400 transition-all duration-500"
            style={{ left: `${concPct}%`, right: 0 }}
          />
        </div>
      </div>

      {/* Percentages */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-1 h-12 bg-gradient-to-b from-teal-500 to-cyan-400 rounded-full" />
          <div>
            <span className="text-2xl font-bold text-white">{concPct}%</span>
            <p className="text-xs text-gray-400">Lifting Power</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-2xl font-bold text-white">{eccPct}%</span>
            <p className="text-xs text-gray-400">Lowering Control</p>
          </div>
          <div className="w-1 h-12 bg-gradient-to-b from-yellow-500 to-orange-400 rounded-full" />
        </div>
      </div>

      {/* Average times */}
      <div className="pt-4 border-t border-white/5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Avg Time:</span>
          <span className="text-teal-400 font-semibold">{conc.toFixed(1)}s</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Avg Time:</span>
          <span className="text-orange-400 font-semibold">{ecc.toFixed(1)}s</span>
        </div>
      </div>
    </div>
  );
}
