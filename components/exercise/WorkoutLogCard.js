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
  const equipmentType = log.exercise?.equipment || log.planned?.equipment || 'dumbbell'

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
      className="log-card-enter rounded-3xl cursor-pointer active:scale-[0.98] transition-transform duration-200"
      style={{
        animationDelay: `${delay}ms`,
        backgroundColor: 'rgb(29 29 29)',
        padding: '16px',
      }}
    >
      {/* ═══ Top Row: Weight, Sets, Reps, Quality Distribution, Chevron ═══ */}
      <div className="flex items-stretch gap-2">
        {/* Weight Box (accent color) */}
        <div
          className="flex flex-col items-center justify-center shrink-0"
          style={{
            backgroundColor: accentColor,
            borderRadius: '12px',
            padding: '10px',
            minWidth: '100px',
          }}
        >
          <span className="text-[11px] font-semibold text-white/80">Weight</span>
          <span className="text-5xl font-bold text-white leading-none mt-1" style={{ letterSpacing: '-1px' }}>
            {weight}
          </span>
          <span className="text-[11px] font-semibold text-white/80 mt-0.5">kg</span>
        </div>

        {/* Sets Box (gray) */}
        <div
          className="flex flex-col items-center justify-center shrink-0"
          style={{
            backgroundColor: 'rgb(55 55 55)',
            borderRadius: '12px',
            padding: '10px',
            minWidth: '80px',
          }}
        >
          <span className="text-4xl font-bold text-white leading-none">{sets}</span>
          <span className="text-[10px] font-medium text-white/60 mt-1">Sets</span>
        </div>

        {/* Reps Box (gray) */}
        <div
          className="flex flex-col items-center justify-center shrink-0"
          style={{
            backgroundColor: 'rgb(55 55 55)',
            borderRadius: '12px',
            padding: '12px',
            minWidth: '80px',
          }}
        >
          <span className="text-4xl font-bold text-white leading-none">{reps}</span>
          <span className="text-[10px] font-medium text-white/60 mt-1">Reps</span>
        </div>

        {/* Quality Distribution (continuous rectangle) */}
        {qualityDistribution && (
          <div
            className="flex flex-col shrink-0 overflow-hidden"
            style={{
              borderRadius: '12px',
              minWidth: '40px',
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
        <div className="flex-1 flex flex-col items-end justify-between">
          {/* Chevron */}
          <svg
            className="text-white/40 flex-shrink-0"
            style={{ width: '20px', height: '20px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>

          {/* Completion indicator */}
          <div className="flex items-center gap-1 mt-auto">
            <svg
              className="text-white/60"
              style={{ width: '14px', height: '14px' }}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[12px] font-semibold text-white/60">{reps}/{plannedReps}</span>
          </div>
        </div>
      </div>

      {/* ═══ Bottom Row: Duration, Calories, Date, Time ═══ */}
      <div className="flex items-center justify-between mt-3">
        {/* Duration + Calories pill */}
        <div className="inline-flex items-center" style={{ backgroundColor: 'rgb(15 15 15)', padding: '5px 10px', gap: '6px', borderRadius: '8px' }}>
          {/* Timer icon */}
          <svg className="flex-shrink-0" style={{ width: '16px', height: '16px' }} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="13" r="8" stroke="#3b82f6" strokeWidth="2"/>
            <path d="M12 9v4l2.5 2.5" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
            <path d="M12 5V3" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
            <path d="M9 3h6" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="text-[12px] font-bold text-white whitespace-nowrap">{duration}</span>

          {/* Flame icon */}
          <svg className="flex-shrink-0 ml-1" style={{ width: '14px', height: '14px' }} viewBox="0 0 24 24" fill="#3b82f6">
            <path d="M12 23c-3.5 0-7-2.5-7-7 0-3 1.5-5 3-6.5.5-.5 1-.5 1.5-.5.5 0 .5.5.5 1v2c0 .5.5 1 1 .5.5-.5 2-3 2-5.5 0-1 0-2.5-.5-4-.5-.5 0-1.5.5-1.5h.5c3 1 6.5 4.5 6.5 9.5 0 6-4 12-8 12z"/>
          </svg>
          <span className="text-[12px] font-bold text-white whitespace-nowrap">{calories} Kcal</span>
        </div>

        {/* Date + Time */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-white/40 font-medium">{dateStr}</span>
          <span
            className="text-[12px] font-medium text-white/50"
            style={{ backgroundColor: 'rgb(45 45 45)', padding: '2px 6px', borderRadius: '4px' }}
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
