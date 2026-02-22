import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/router'

/**
 * Horizontally‑scrollable row of recent‑exercise cards.
 * Each card shows: exercise name, sets×reps · time, date, weight.
 * The first exercise variant gets the primary colour; the second gets a darker shade.
 */
export default function RecentExerciseCards({ exercises, exerciseLogs, primaryColor, primaryDark, loading, equipmentSlug }) {
  const scrollRef = useRef(null)
  const router = useRouter()

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
      const logId = log.id || log.logId || log.sessionId || ''
      const eqPath = log._equipment || log.exercise?.equipmentPath || log.exercise?.equipment || ''
      const exPath = log._exercise || log.exercise?.namePath || log.exercise?.name || ''

      recent.push({
        exerciseKey: ex.key,
        name: ex.shortName || ex.name,
        variant: ex.variant,
        sets: totalSets,
        reps: totalReps,
        durSec,
        weight,
        date,
        logId,
        eqPath,
        exPath,
      })
    })
  })
  recent.sort((a, b) => b.date - a.date)
  const items = recent.slice(0, 5)

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatDate = (d) =>
    d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })

  const handleOpen = (item) => {
    if (!item.logId || !equipmentSlug) return
    router.push({
      pathname: '/session-details',
      query: { logId: item.logId, eq: item.eqPath || '', ex: item.exPath || '', type: equipmentSlug },
    })
  }

  // Skeleton loading state
  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden pb-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 rounded-2xl py-6 px-6 flex flex-col"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', width: '180px', minHeight: '160px' }}
          >
            <div className="flex items-start justify-between">
              <div className="h-5 w-24 bg-white/10 rounded animate-pulse" />
              <div className="h-4 w-4 bg-white/10 rounded animate-pulse" />
            </div>
            <div className="h-px w-full bg-white/10 mt-3" />
            <div className="h-4 w-20 bg-white/10 rounded animate-pulse mt-3" />
            <div className="flex items-end justify-between mt-auto pt-2">
              <div className="h-4 w-14 bg-white/10 rounded animate-pulse" />
              <div className="h-8 w-12 bg-white/10 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    )
  }

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
          <button
            key={i}
            type="button"
            onClick={() => handleOpen(item)}
            className="flex-shrink-0 rounded-2xl py-6 px-4 flex flex-col text-left cursor-pointer active:scale-[0.98] transition-transform"
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
          </button>
        )
      })}
    </div>
  )
}
