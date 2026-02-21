import { useRef, useState, useEffect } from 'react'

/**
 * Horizontally‑scrollable row of recent‑exercise cards.
 * Each card shows: exercise name, sets×reps · time, date, weight.
 * The first exercise variant gets the primary colour; the second gets a darker shade.
 */
export default function RecentExerciseCards({ exercises, exerciseLogs, primaryColor, primaryDark }) {
  const scrollRef = useRef(null)

  // Build a flat, date‑sorted array of recent sessions
  const recent = []
  exercises.forEach((ex) => {
    const logs = exerciseLogs[ex.key] || []
    logs.forEach((log) => {
      const date = log.timestamps?.started?.toDate?.()
        || log.timestamps?.created?.toDate?.()
        || (log.startTime ? new Date(log.startTime) : null)
      if (!date) return

      const totalSets = log.results?.totalSets || log.results?.completedSets || 0
      const totalReps = log.results?.totalReps || log.results?.completedReps || 0
      const durationMs = log.results?.durationMs || 0
      const totalTimeSec = log.results?.totalTime || 0
      const durSec = durationMs ? Math.round(durationMs / 1000) : totalTimeSec
      const weight = log.planned?.weight || log.exercise?.weight || 0

      recent.push({
        exerciseKey: ex.key,
        name: ex.shortName || ex.name,
        variant: ex.variant,
        sets: totalSets,
        reps: totalReps,
        durSec,
        weight,
        date,
      })
    })
  })
  recent.sort((a, b) => b.date - a.date)
  const items = recent.slice(0, 10) // cap to 10

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatDate = (d) =>
    d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })

  if (items.length === 0) {
    return (
      <div className="bg-white/[0.05] rounded-2xl p-6 text-center">
        <p className="text-white/40 text-sm">No recent sessions yet</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {items.map((item, i) => {
        const bg = item.variant === 'primary' ? primaryColor : primaryDark
        return (
          <div
            key={i}
            className="flex-shrink-0 rounded-2xl py-6 px-6 flex flex-col"
            style={{ backgroundColor: bg, width: '180px', minHeight: '160px' }}
          >
            {/* Exercise name + chevron */}
            <div className="flex items-start justify-between">
              <p className="text-base font-bold text-white leading-tight whitespace-pre-line pr-2">
                {item.name}
              </p>
              <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Separator line */}
            <div className="w-full h-px bg-white/20 mt-3" />

            {/* Middle: sets×reps • duration */}
            <p className="text-sm text-white/70 mt-3">
              {item.sets}×{item.reps}<span className="mx-1.5">·</span>{formatDuration(item.durSec)}
            </p>

            {/* Bottom: date + weight */}
            <div className="flex items-end justify-between mt-auto pt-2">
              <p className="text-sm text-white/70">{formatDate(item.date)}</p>
              <p className="font-bold text-white leading-none">
                <span className="text-5xl">{item.weight}</span>
                <span className="text-sm font-medium text-white/60 ml-0.5">kg</span>
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
