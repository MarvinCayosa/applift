import { memo, useMemo } from 'react'
import { getLogDate, QUALITY_LABELS } from '../../utils/exerciseStatsHelper'

const fmtDur = (ms, sec) => {
  const t = ms ? Math.round(ms / 1000) : sec || 0
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`
}

const fmtTime = (date) => {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/*───────────────────────────────────────────────────────────────────*
 *  WorkoutLogCard
 *
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │  ┌─[accent]─┐  ┌─[gray]─┐  ┌─[gray]─┐  ┌─[quality]─┐            >  │
 *  │  │   150    │  │   2    │  │   20   │  │ █ █ █     │               │
 *  │  │  Weight  │  │  Sets  │  │  Reps  │  │ G Y R     │               │
 *  │  │   kg     │  │        │  │        │  │           │   ✓ 20/20    │
 *  │  └──────────┘  └────────┘  └────────┘  └───────────┘               │
 *  │  ⏱ 1:30   🔥 5 Kcal     Fri · February 20    5:39 PM               │
 *  └─────────────────────────────────────────────────────────────────────┘
 *───────────────────────────────────────────────────────────────────────*/

const WorkoutLogCard = memo(({ log, analytics, accentColor = '#3B82F6', onClick, delay = 0 }) => {
  const a  = analytics
  const dt = getLogDate(log) || new Date()

  const sets         = a?.summary?.totalSets   || log.results?.totalSets   || log.results?.completedSets || 0
  const reps         = a?.summary?.totalReps   || log.results?.totalReps   || log.results?.completedReps || 0
  const plannedSets  = log.planned?.sets       || log.exercise?.sets       || sets
  const plannedRepsPerSet = log.planned?.reps  || log.exercise?.reps       || 0
  const plannedReps  = plannedSets * plannedRepsPerSet  // Total planned reps (sets × reps per set)
  const weight       = log.planned?.weight     || log.exercise?.weight     || 0
  const durMs        = log.results?.durationMs || 0
  const durSec       = a?.summary?.totalDurationMs
    ? Math.round(a.summary.totalDurationMs / 1000)
    : (log.results?.totalTime || 0)
  const calories     = log.results?.calories   || 0
  const duration     = fmtDur(durMs, durSec)
  const equipmentType = (log.exercise?.equipmentPath || log.exercise?.equipment || log.planned?.equipment || 'dumbbell').toLowerCase().replace(/\s+/g, '-')

  const dateStr = `${dt.toLocaleDateString('en-US', { weekday: 'short' })} \u00B7 ${dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
  const timeStr = fmtTime(dt)

  // ─── Execution Quality Distribution (Clean, Mistake1, Mistake2) ───
  const qualityDistribution = useMemo(() => {
    const qualityLabels = a?.mlClassification?.qualityLabels || QUALITY_LABELS[equipmentType] || ['Clean', 'Mistake 1', 'Mistake 2']
    const dist = a?.mlClassification?.distribution || {}
    const distPct = a?.mlClassification?.distributionPercent || {}

    // Get counts for each quality level (0=Clean, 1=Mistake1, 2=Mistake2)
    let cleanCount = 0
    let mistake1Count = 0
    let mistake2Count = 0

    // Try to extract counts from distribution
    Object.entries(dist).forEach(([label, count]) => {
      if (label === 'Clean' || label === '0' || label === qualityLabels[0]) {
        cleanCount += count
      } else if (label === '1' || label === qualityLabels[1]) {
        mistake1Count += count
      } else if (label === '2' || label === qualityLabels[2]) {
        mistake2Count += count
      }
    })

    const total = cleanCount + mistake1Count + mistake2Count

    if (total === 0) {
      // No ML data available
      return null
    }

    // Calculate percentages ensuring they sum to 100%
    let cleanPct = Math.round((cleanCount / total) * 100)
    let mistake1Pct = Math.round((mistake1Count / total) * 100)
    let mistake2Pct = 100 - cleanPct - mistake1Pct

    // Handle negative rounding edge case
    if (mistake2Pct < 0) {
      mistake2Pct = 0
      mistake1Pct = 100 - cleanPct
    }

    return {
      clean: { label: qualityLabels[0] || 'Clean', pct: cleanPct, count: cleanCount },
      mistake1: { label: qualityLabels[1] || 'Mistake 1', pct: mistake1Pct, count: mistake1Count },
      mistake2: { label: qualityLabels[2] || 'Mistake 2', pct: mistake2Pct, count: mistake2Count },
    }
  }, [a, equipmentType])

  return (
    <div
      onClick={onClick}
      className="log-card-enter rounded-3xl cursor-pointer active:scale-[0.98] transition-transform duration-200 p-4 sm:p-4"
      style={{
        animationDelay: `${delay}ms`,
        backgroundColor: 'rgb(29 29 29)',
      }}
    >
      {/* ═══ Top Row: Weight, Sets, Reps, Quality Distribution, Chevron ═══ */}
      <div className="flex items-stretch gap-2 sm:gap-3">
        {/* Weight Box (accent color) */}
        <div
          className="flex flex-col items-center justify-center shrink-0 p-2 sm:p-3 min-w-[100px] sm:min-w-[140px]"
          style={{
            backgroundColor: accentColor,
            borderRadius: '12px',
          }}
        >
          <span className="text-[10px] sm:text-[11px] font-semibold text-white/80">Weight</span>
          <span className="text-4xl sm:text-6xl font-bold text-white leading-none mt-0.5 sm:mt-1" style={{ letterSpacing: '-1px' }}>
            {weight}
          </span>
          <span className="text-[10px] sm:text-[11px] font-semibold text-white/80 mt-0.5">kg</span>
        </div>

        {/* Sets Box (gray) */}
        <div
          className="flex flex-col items-center justify-center flex-1 p-2 sm:p-3"
          style={{
            backgroundColor: 'rgb(55 55 55)',
            borderRadius: '12px',
          }}
        >
          <span className="text-3xl sm:text-4xl font-bold text-white leading-none">{sets}</span>
          <span className="text-[9px] sm:text-[10px] font-medium text-white/60 mt-0.5 sm:mt-1">Sets</span>
        </div>

        {/* Reps Box (gray) */}
        <div
          className="flex flex-col items-center justify-center flex-1 p-2 sm:p-3"
          style={{
            backgroundColor: 'rgb(55 55 55)',
            borderRadius: '12px',
          }}
        >
          <span className="text-3xl sm:text-4xl font-bold text-white leading-none">{plannedRepsPerSet}</span>
          <span className="text-[9px] sm:text-[10px] font-medium text-white/60 mt-0.5 sm:mt-1">Reps</span>
        </div>

        {/* Quality Distribution (continuous rectangle) */}
        {qualityDistribution && (
          <div
            className="flex flex-col shrink-0 overflow-hidden min-w-[32px] sm:min-w-[48px]"
            style={{
              borderRadius: '12px',
            }}
            title={`Clean: ${qualityDistribution.clean.pct}%, ${qualityDistribution.mistake1.label}: ${qualityDistribution.mistake1.pct}%, ${qualityDistribution.mistake2.label}: ${qualityDistribution.mistake2.pct}%`}
          >
            {/* Green - Clean */}
            <div
              style={{
                width: '100%',
                height: `${qualityDistribution.clean.pct}%`,
                backgroundColor: '#22c55e',
              }}
            />
            {/* Orange - Mistake 1 */}
            <div
              style={{
                width: '100%',
                height: `${qualityDistribution.mistake1.pct}%`,
                backgroundColor: '#f59e0b',
              }}
            />
            {/* Red - Mistake 2 */}
            <div
              style={{
                width: '100%',
                height: `${qualityDistribution.mistake2.pct}%`,
                backgroundColor: '#ef4444',
              }}
            />
          </div>
        )}

        {/* Spacer + Chevron + Completion */}
        <div className="flex flex-col items-end justify-between min-w-0 pl-2">
          {/* Chevron */}
          <svg
            className="text-white/40 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>

          {/* Completion indicator */}
          <div className="flex items-center gap-1 mt-auto">
            <svg
              className="text-white/60 flex-shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] sm:text-[12px] font-semibold text-white/60 whitespace-nowrap">{reps}/{plannedReps}</span>
          </div>
        </div>
      </div>

      {/* ═══ Bottom Row: Duration, Calories, Date, Time ═══ */}
      <div className="flex items-center justify-between mt-3 sm:mt-4 gap-2">
        {/* Duration + Calories pill */}
        <div className="inline-flex items-center flex-shrink-0 px-2.5 py-1.5 sm:px-3 sm:py-2 gap-1.5 sm:gap-2" style={{ backgroundColor: 'rgb(15 15 15)', borderRadius: '10px' }}>
          {/* Timer icon */}
          <svg className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="13" r="8" stroke={accentColor} strokeWidth="2"/>
            <path d="M12 9v4l2.5 2.5" stroke={accentColor} strokeWidth="2" strokeLinecap="round"/>
            <path d="M12 5V3" stroke={accentColor} strokeWidth="2" strokeLinecap="round"/>
            <path d="M9 3h6" stroke={accentColor} strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">{duration}</span>

          {/* Divider */}
          <div className="w-px h-3.5 bg-white/15 mx-0.5" />

          {/* Flame icon - Better fire icon */}
          <svg className="flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5" fill={accentColor} viewBox="0 0 24 24">
            <path d="M12 23c-3.6 0-7-2.4-7-7 0-3.1 2.1-5.7 3.2-6.8.4-.4 1-.5 1.5-.2.5.2.8.7.8 1.2v.4c0 .6.2 1.2.6 1.7.1-.6.4-1.2.8-1.7l2.5-3.4c.3-.4.8-.6 1.3-.5s.9.5 1 1c.4 1.7 1.3 3.8 2.3 5.3.7 1 1 2.3 1 3.5 0 3.8-2.6 6.5-8 6.5z"/>
          </svg>
          <span className="text-xs sm:text-sm font-bold text-white whitespace-nowrap">{calories} Kcal</span>
        </div>

        {/* Date + Time */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink">
          <span className="text-[11px] sm:text-xs text-white/40 font-medium truncate">{dateStr}</span>
          <span
            className="text-[11px] sm:text-xs font-medium text-white/50 flex-shrink-0 px-1.5 py-0.5 sm:px-2 sm:py-1"
            style={{ backgroundColor: 'rgb(45 45 45)', borderRadius: '6px' }}
          >
            {timeStr}
          </span>
        </div>
      </div>
    </div>
  )
})

WorkoutLogCard.displayName = 'WorkoutLogCard'
export default WorkoutLogCard
