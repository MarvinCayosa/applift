/**
 * HeaderSection
 *
 * Hero header for Session Details page.
 * Shows exercise image background, back chevron, exercise name, date/time,
 * weight badge (blue), sets/reps/rest stats card, recommendation badge,
 * and timing & calories bottom card.
 *
 * Design-matched: exact colors, spacing, text sizes, card styling.
 */

import { useRouter } from 'next/router';
import Image from 'next/image';
import { formatSessionDate, formatDuration, getRepsPerSet } from '../../utils/sessionDetails/analyticsMappers';

export default function HeaderSection({
  exerciseName,
  date,
  weight,
  weightUnit = 'kg',
  sets,
  reps,
  restTimeSec,
  totalTime,
  calories,
  isRecommendation,
  isCustomSet,
  exerciseImage,
  primaryColor = '#a855f7',
  totalSets,
  totalReps,
  onShare,
  hideBack = false,
  sharedBranding = false,
}) {
  const router = useRouter();
  const dateStr = formatSessionDate(date);
  // `reps` is already per-set (plannedRepsPerSet from viewModel)
  const repsPerSet = reps;

  // Determine if the workout was completed in full
  const actualSets = totalSets ?? sets;
  const setsIncomplete = actualSets != null && sets != null && actualSets < sets;
  const setsLabel = setsIncomplete ? `${actualSets}/${sets}` : (sets ?? '—');

  const totalPlannedReps = (sets || 0) * (reps || 0);
  const actualTotalReps = totalReps ?? totalPlannedReps;
  const repsIncomplete = totalPlannedReps > 0 && actualTotalReps < totalPlannedReps;

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
        {/* ── Back chevron + Title + Date ── */}
        <div className="flex items-start mb-5">
          {!hideBack ? (
            <button
              onClick={() => router.back()}
              className="-ml-1.5 p-1.5 shrink-0"
              aria-label="Go back"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <div className="w-9 shrink-0" /> 
          )}

          <div className="flex-1 text-center">
            {sharedBranding && (
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <img
                  src="/icons/applift-icon-192.png"
                  alt="AppLift"
                  className="w-5 h-5 rounded-md object-cover"
                />
                <span className="text-xs text-white/50 font-medium">Shared from AppLift</span>
              </div>
            )}
            <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight">
              {exerciseName || 'Session Details'}
            </h1>
            {dateStr && (
              <p className="text-[13px] mt-1" style={{ color: 'rgb(205, 205, 205)' }}>{dateStr}</p>
            )}
          </div>

          {/* Share button */}
          {onShare && (
            <button
              onClick={onShare}
              className="p-1.5 shrink-0"
              aria-label="Share workout"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Weight badge + Stats card row ── */}
        <div className="flex items-stretch gap-2.5 mb-3 content-fade-up-1">
          {/* Weight badge — equipment primary color tile */}
          <div
            className="flex flex-col items-center justify-center rounded-2xl p-4 shrink-0"
            style={{
              backgroundColor: primaryColor,
              width: 120,
              minHeight: 88,
            }}
          >
            <div className="flex items-baseline gap-[2px]">
              <span className="text-5xl font-bold text-white leading-none">{weight || '—'}</span>
              <span className="text-[13px] text-white/90 font-semibold">{weightUnit}</span>
            </div>
            <span className="text-[11px] text-white/60 mt-0.5 font-medium">Weight</span>
          </div>

          {/* Stats card — semi-transparent dark */}
          <div
            className="flex-1 rounded-2xl backdrop-blur-md flex items-center justify-evenly"
            style={{ backgroundColor: 'rgb(0 0 0 / 65%)' }}
          >
            <StatItem value={setsLabel} label="Sets" warn={setsIncomplete} />
            <div className="w-px self-stretch my-5 bg-white/[0.08]" />
            <StatItem value={repsPerSet} label="Reps" />
            <div className="w-px self-stretch my-5 bg-white/[0.08]" />
            <StatItem value={restTimeSec} label="Rest" suffix="sec" />
          </div>
        </div>

        {/* ── Recommendation / Custom Set badge ── */}
        {(isRecommendation || isCustomSet) && (
          <div className="flex items-center justify-center gap-1.5 mb-3 content-fade-up-1">
            {isRecommendation ? (
              <>
                <Image src="/images/gemini.png" alt="Gemini" width={14} height={14} className="opacity-90" />
                <span className="text-[13px] text-gray-300 font-medium">Generated Recommendation</span>
              </>
            ) : (
              <span className="text-[13px] text-gray-400 font-medium">Custom Set</span>
            )}
          </div>
        )}

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
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
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
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
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

/* ── Stat column (Sets / Reps / Rest) ── */
function StatItem({ value, label, suffix, warn }) {
  return (
    <div className="flex flex-col items-center py-2">
      <div className="flex items-baseline gap-[2px]">
        <span
          className="text-[28px] font-bold leading-none"
          style={{ color: warn ? '#fbbf24' : 'white' }}
        >
          {value ?? '—'}
        </span>
        {suffix && <span className="text-[12px] text-gray-400 font-medium">{suffix}</span>}
      </div>
      <span className="text-[11px] text-gray-400 mt-1 font-medium">{label}</span>
    </div>
  );
}
