/**
 * WFHeaderSection – Workout Finished Hero Header
 *
 * Mirrors the session-details HeaderSection design:
 * Exercise image background with gradient overlay, back chevron,
 * "Workout Completed!" title, exercise name, weight badge,
 * sets/reps stats, recommendation badge, timing & calories card.
 */

import { useRouter } from 'next/router';
import Image from 'next/image';
import { equipmentConfig } from '../equipment';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0sec';
  if (seconds < 60) return `${seconds}sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function WFHeaderSection({
  workoutName,
  equipment,
  weight = 0,
  weightUnit = 'kg',
  recommendedSets = 0,
  recommendedReps = 0,
  totalTime = 0,
  calories = 0,
  totalSets = 0,
  totalReps = 0,
  onBack,
}) {
  const router = useRouter();

  // Resolve exercise image + color from equipmentConfig
  const slug = (equipment || '').toLowerCase();
  const cfg = equipmentConfig[slug];
  const primaryColor = cfg?.primary || '#a855f7';
  const exCfg = cfg?.exercises?.find(
    (e) => e.key === workoutName || e.firestoreNames?.includes(workoutName)
  );
  const exerciseImage = exCfg?.image || cfg?.heroImage || null;

  // Derive display name
  const displayName = exCfg?.name || workoutName || 'Workout';

  // Completion status
  const setsIncomplete = totalSets > 0 && recommendedSets > 0 && totalSets < recommendedSets;
  const setsLabel = setsIncomplete ? `${totalSets}/${recommendedSets}` : (recommendedSets || totalSets || '—');

  return (
    <div className="relative w-full overflow-hidden">
      {/* ── Background exercise image + gradient overlay ── */}
      {exerciseImage ? (
        <>
          <img
            src={exerciseImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.20) 40%, rgba(0,0,0,0.65) 70%, rgb(0,0,0) 100%)',
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black" />
      )}

      {/* ── Content ── */}
      <div className="relative z-10 px-5 pt-4 pt-pwa-dynamic pb-5">
        {/* ── Back chevron + Title block ── */}
        <div className="flex items-start mb-1">
          <button
            onClick={onBack || (() => router.back())}
            className="-ml-1.5 p-1.5 shrink-0"
            aria-label="Go back"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex-1 text-center pr-7">
            <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight">
              Workout Completed!
            </h1>
            <p className="text-[13px] mt-0.5 mb-2" style={{ color: 'rgb(205, 205, 205)' }}>
              {displayName}
            </p>
          </div>
        </div>

        {/* ── Weight badge + Stats card row ── */}
        <div className="flex items-stretch gap-2.5 mb-3 content-fade-up-1">
          {/* Weight badge */}
          <div
            className="flex flex-col items-center justify-center rounded-2xl p-4 shrink-0"
            style={{ backgroundColor: primaryColor, width: 120, minHeight: 88 }}
          >
            <div className="flex items-baseline gap-[2px]">
              <span className="text-5xl font-bold text-white leading-none">{weight || '—'}</span>
              <span className="text-[13px] text-white/90 font-semibold">{weightUnit}</span>
            </div>
            <span className="text-[11px] text-white/60 mt-0.5 font-medium">Weight</span>
          </div>

          {/* Stats card */}
          <div
            className="flex-1 rounded-2xl backdrop-blur-md flex items-center justify-evenly"
            style={{ backgroundColor: 'rgb(0 0 0 / 65%)' }}
          >
            <StatItem value={setsLabel} label="Sets" warn={setsIncomplete} />
            <div className="w-px self-stretch my-5 bg-white/[0.08]" />
            <StatItem value={recommendedReps || '—'} label="Reps" />
            <div className="w-px self-stretch my-5 bg-white/[0.08]" />
            <StatItem value={totalReps || '—'} label="Total" />
          </div>
        </div>

        {/* ── Generated Recommendation badge ── */}
        <div className="flex items-center justify-center gap-1.5 mb-3 content-fade-up-1">
          <Image src="/images/gemini.png" alt="Gemini" width={14} height={14} className="opacity-90" />
          <span className="text-[13px] text-gray-300 font-medium">Generated Recommendation</span>
        </div>

        {/* ── Timing & Calories card ── */}
        <div className="flex justify-center content-fade-up-2">
          <div
            className="inline-flex items-center gap-4 rounded-2xl py-3 px-5"
            style={{ backgroundColor: 'rgb(1 1 1 / 72%)' }}
          >
            {/* Time */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center">
                <img
                  src="/images/icons/time.png"
                  alt=""
                  className="w-[18px] h-[18px] object-contain opacity-80"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
              <div>
                <p className="text-[11px] text-gray-500 leading-none">Time</p>
                <p className="text-2xl font-bold text-white mt-0.5">
                  {formatDuration(totalTime).endsWith('sec') ? (
                    <>
                      {formatDuration(totalTime).slice(0, -3)}<sub className="text-[10px]">sec</sub>
                    </>
                  ) : (
                    formatDuration(totalTime)
                  )}
                </p>
              </div>
            </div>

            <div className="w-px h-9 bg-white/[0.08]" />

            {/* Burn */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center">
                <img
                  src="/images/icons/burn.png"
                  alt=""
                  className="w-[18px] h-[18px] object-contain opacity-80"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
              <div>
                <p className="text-[11px] text-gray-500 leading-none">Burn</p>
                <p className="text-2xl font-bold text-white mt-0.5">
                  {calories || 0}{' '}
                  <span className="text-[11px] text-gray-500 font-normal">kcal</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stat column ── */
function StatItem({ value, label, warn }) {
  return (
    <div className="flex flex-col items-center py-2">
      <span
        className="text-[28px] font-bold leading-none"
        style={{ color: warn ? '#fbbf24' : 'white' }}
      >
        {value ?? '—'}
      </span>
      <span className="text-[11px] text-gray-400 mt-1 font-medium">{label}</span>
    </div>
  );
}
