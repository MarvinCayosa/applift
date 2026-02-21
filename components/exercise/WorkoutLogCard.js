import { memo } from 'react'
import { getLogDate } from '../../utils/exerciseStatsHelper'

const fmtDur = (ms, sec) => {
  const t = ms ? Math.round(ms / 1000) : sec || 0
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`
}

/*───────────────────────────────────────────────────────────────────*
 *  WorkoutLogCard
 *
 *  ┌──────────────────────────────────────────────────┐
 *  │                                              >   │  row 1: chevron
 *  │  ┌─[accent]──────────┐  ⏱ 0:35  🔥 4 Kcal      │  row 2: info
 *  │  │ 20kg │ 1  │  3    │     Sat · February 21     │  row 3: date
 *  │  │      │Sets│ Reps  │                            │
 *  │  └──────────────────-─┘                           │
 *  └──────────────────────────────────────────────────┘
 *───────────────────────────────────────────────────────────────────*/

const WorkoutLogCard = memo(({ log, analytics, accentColor = '#3B82F6', onClick, delay = 0 }) => {
  const a  = analytics
  const dt = getLogDate(log) || new Date()

  const sets     = a?.summary?.totalSets   || log.results?.totalSets   || log.results?.completedSets || 0
  const reps     = a?.summary?.totalReps   || log.results?.totalReps   || log.results?.completedReps || 0
  const weight   = log.planned?.weight     || log.exercise?.weight     || 0
  const durMs    = log.results?.durationMs || 0
  const durSec   = a?.summary?.totalDurationMs
    ? Math.round(a.summary.totalDurationMs / 1000)
    : (log.results?.totalTime || 0)
  const calories = log.results?.calories   || 0
  const duration = fmtDur(durMs, durSec)

  const dateStr = `${dt.toLocaleDateString('en-US', { weekday: 'short' })} \u00B7 ${dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`

  return (
    <div
      onClick={onClick}
      className="log-card-enter rounded-2xl flex items-center cursor-pointer active:scale-[0.98] transition-transform duration-200"
      style={{
        animationDelay: `${delay}ms`,
        backgroundColor: 'rgb(29 29 29)',
        padding: '14px',
      }}
    >
      {/* ═══ Left: accent stat badge ═══ */}
      <div
        className="flex items-center shrink-0"
        style={{
          backgroundColor: accentColor,
          borderRadius: '14px',
          padding: '14px',
        }}
      >
        {/* Weight */}
        <div className="flex items-baseline">
          <span className="text-5xl font-bold text-white leading-none" style={{ letterSpacing: '-1px' }}>
            {weight}
          </span>
          <span className="text-[13px] font-bold text-white/80 ml-0.5 self-end">
            kg
          </span>
        </div>

        <div className="self-stretch bg-white/30 mx-4" style={{ width: '1.5px' }} />

        {/* Sets */}
        <div className="text-center" style={{ minWidth: '26px' }}>
          <p className="text-4xl font-bold text-white leading-none">{sets}</p>
          <p className="text-[10px] text-white/70 mt-0.5 font-semibold">Sets</p>
        </div>

        <div className="self-stretch bg-white/30 mx-4" style={{ width: '1.5px' }} />

        {/* Reps */}
        <div className="text-center" style={{ minWidth: '26px' }}>
          <p className="text-4xl font-bold text-white leading-none">{reps}</p>
          <p className="text-[10px] text-white/70 mt-0.5 font-semibold">Reps</p>
        </div>
      </div>

      {/* ═══ Right: 3 stacked rows, all far-right aligned ═══ */}
      <div className="flex-1 flex flex-col items-end justify-between self-stretch" style={{ marginLeft: '12px' }}>

        {/* Row 1: Chevron at top-right */}
        <svg
          className="text-white/30 flex-shrink-0"
          style={{ width: '18px', height: '18px' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>

        {/* Row 2: Duration + Calories pill */}
        <div className="inline-flex items-center" style={{ backgroundColor: 'rgb(15 15 15)', padding: '5px 10px', gap: '6px', borderRadius: '8px' }}>
          <svg className="flex-shrink-0" style={{ width: '14px', height: '14px' }} viewBox="0 0 20 20" fill="white">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.828a1 1 0 101.415-1.414L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-[12px] font-bold text-white whitespace-nowrap">{duration}</span>

          <div style={{ width: '1px', height: '12px', backgroundColor: 'rgba(255,255,255,0.15)' }} />

          <svg className="flex-shrink-0" style={{ width: '14px', height: '14px' }} viewBox="0 0 20 20" fill="white">
            <path
              fillRule="evenodd"
              d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-[12px] font-bold text-white whitespace-nowrap">{calories} Kcal</span>
        </div>

        {/* Row 3: Date at bottom-right */}
        <p className="text-[11px] text-white/40 font-medium">{dateStr}</p>
      </div>
    </div>
  )
})

WorkoutLogCard.displayName = 'WorkoutLogCard'
export default WorkoutLogCard
