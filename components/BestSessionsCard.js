import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'

/**
 * BestSessionsCard — Auto-scrolling card showing this week's best sessions:
 *  Slide 1 (blue):  Heaviest Lifted (max weight × reps in a single session)
 *  Slide 2 (red):   Best Completion (highest set/rep completion rate)
 * 
 * Tapping a slide navigates to that session's detail page.
 */

const SLIDES = [
  {
    key: 'heaviest',
    label: 'Heaviest Lift',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)',
    emptyText: 'No sessions yet',
  },
  {
    key: 'completion',
    label: 'Best Completion',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #EF4444 0%, #7F1D1D 100%)',
    emptyText: 'No sessions yet',
  },
]

/* ── helpers ────────────────────────────────────────────────── */
const parseTimestamp = (ts) => {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000)
  if (typeof ts === 'string') return new Date(ts)
  if (ts instanceof Date) return ts
  return null
}

const normalizeForDisplay = (str) => {
  if (!str || str === 'Unknown' || str === 'Unknown Exercise') return str
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const formatTime = (date) => {
  if (!date) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

const formatDuration = (ms) => {
  if (!ms || ms <= 0) return null
  const mins = Math.round(ms / 60000)
  if (mins < 1) return '<1m'
  return `${mins}m`
}

/* ── component ─────────────────────────────────────────────── */
export default function BestSessionsCard({ logs = [], hasData = false }) {
  const router = useRouter()
  const [activeSlide, setActiveSlide] = useState(0)
  const containerRef = useRef(null)
  const autoTimer = useRef(null)
  const isUserScrolling = useRef(false)
  const userScrollTimeout = useRef(null)

  /* ── derive best sessions for this week ───────────────────── */
  const { heaviest, bestCompletion } = useMemo(() => {
    if (!logs || logs.length === 0) return { heaviest: null, bestCompletion: null }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOfWeek = now.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - daysFromMonday)
    weekStart.setHours(0, 0, 0, 0)

    let heaviest = null
    let bestCompletion = null
    let maxWeight = 0
    let maxCompletionPct = 0

    logs.forEach((log) => {
      const startedAt =
        parseTimestamp(log.timestamps?.started) ||
        parseTimestamp(log.timestamps?.created) ||
        (log.startTime ? new Date(log.startTime) : null)
      if (!startedAt || startedAt < weekStart) return
      if (log.status && log.status !== 'completed') return

      const weight = log.planned?.weight || log.weight || 0
      const exercise = normalizeForDisplay(log._exercise || log.exercise?.name || log.exercise || 'Unknown Exercise')
      const equipment = normalizeForDisplay(log._equipment || log.exercise?.equipment || log.equipment || 'Unknown')
      const totalReps = log.results?.totalReps || log.totalReps || 0
      const totalSets = log.results?.totalSets || (log.sets ? Object.keys(log.sets).length : 0) || 0
      const plannedSets = log.planned?.sets || totalSets
      const plannedRepsPerSet = log.planned?.reps || 0
      const plannedTotalReps = plannedSets * plannedRepsPerSet
      const durationMs = log.results?.durationMs || 0
      const completedAt = parseTimestamp(log.timestamps?.completed)

      const eqPath = log._equipment || equipment.toLowerCase().replace(/\s+/g, '-')
      const exPath = log._exercise || exercise.toLowerCase().replace(/\s+/g, '-')

      const entry = {
        logId: log.id,
        exercise,
        equipment,
        weight,
        weightUnit: log.planned?.weightUnit || log.weightUnit || 'kg',
        totalReps,
        totalSets,
        durationMs,
        startedAt,
        completedAt,
        time: formatTime(startedAt),
        duration: formatDuration(durationMs),
        eqPath,
        exPath,
      }

      // Heaviest = highest single-session weight
      if (weight > maxWeight) {
        maxWeight = weight
        heaviest = entry
      }

      // Best completion = highest reps-completed / reps-planned ratio
      // Fallback: if no planned data, use total volume (weight × reps)
      if (plannedTotalReps > 0) {
        const pct = Math.min(100, Math.round((totalReps / plannedTotalReps) * 100))
        if (pct > maxCompletionPct || (pct === maxCompletionPct && weight > (bestCompletion?.weight || 0))) {
          maxCompletionPct = pct
          entry.completionPct = pct
          bestCompletion = entry
        }
      } else if (totalReps > 0) {
        // No planned info — use volume as tiebreaker
        const vol = weight * totalReps
        const pseudoPct = vol // raw value, we'll just pick max
        if (pseudoPct > maxCompletionPct) {
          maxCompletionPct = pseudoPct
          entry.completionPct = 100 // no plan → "completed"
          bestCompletion = entry
        }
      }
    })

    return { heaviest, bestCompletion }
  }, [logs])

  const slides = useMemo(() => {
    return [
      { ...SLIDES[0], session: heaviest },
      { ...SLIDES[1], session: bestCompletion },
    ]
  }, [heaviest, bestCompletion])

  /* ── auto-scroll ──────────────────────────────────────────── */
  const scrollTo = useCallback(
    (idx) => {
      const el = containerRef.current
      if (!el) return
      el.scrollTo({ left: el.offsetWidth * idx, behavior: 'smooth' })
    },
    [],
  )

  useEffect(() => {
    autoTimer.current = setInterval(() => {
      if (isUserScrolling.current) return
      setActiveSlide((prev) => {
        const next = (prev + 1) % slides.length
        scrollTo(next)
        return next
      })
    }, 5000)
    return () => clearInterval(autoTimer.current)
  }, [slides.length, scrollTo])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.offsetWidth)
      setActiveSlide(idx)
      isUserScrolling.current = true
      clearTimeout(userScrollTimeout.current)
      userScrollTimeout.current = setTimeout(() => {
        isUserScrolling.current = false
      }, 4000)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      clearTimeout(userScrollTimeout.current)
    }
  }, [])

  /* ── navigate to session detail ───────────────────────────── */
  const goToSession = useCallback(
    (session) => {
      if (!session?.logId) return
      router.push(
        `/session-details?logId=${session.logId}&eq=${encodeURIComponent(session.eqPath)}&ex=${encodeURIComponent(session.exPath)}`,
      )
    },
    [router],
  )

  /* ── empty state ──────────────────────────────────────────── */
  if (!hasData) {
    return (
      <div
        className="rounded-2xl p-4 flex flex-col flex-1"
        style={{ background: SLIDES[0].gradient, minHeight: '100px' }}
      >
        <h3 className="text-xs font-semibold text-white/90">Best This Week</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-white/50">No sessions yet</p>
        </div>
      </div>
    )
  }

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div className="rounded-2xl flex-1 overflow-hidden relative" style={{ minHeight: '100px' }}>
      {/* Slide container */}
      <div
        ref={containerRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide h-full"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {slides.map((slide) => {
          const s = slide.session
          return (
            <div
              key={slide.key}
              className="w-full shrink-0 snap-center"
              style={{ minWidth: '100%', scrollSnapAlign: 'center' }}
            >
              <div
                onClick={() => s && goToSession(s)}
                className="h-full p-3 flex flex-col cursor-pointer active:brightness-110 transition-all"
                style={{ background: slide.gradient }}
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white/90">Best This Week</h3>
                </div>

                {/* Category label */}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-white/60">{slide.icon}</span>
                  <span className="text-[10px] font-medium text-white/70">{slide.label}</span>
                </div>

                {s ? (
                  <>
                    {/* Main value */}
                    <div className="flex-1 flex flex-col items-end justify-center">
                      <span className="font-extrabold text-white leading-none" style={{ fontSize: '2.2rem' }}>
                        {slide.key === 'heaviest'
                          ? s.weight
                          : s.completionPct != null
                            ? `${s.completionPct}%`
                            : `${s.totalReps}`}
                      </span>
                      <span className="text-xs font-semibold text-white/70 mt-0.5">
                        {slide.key === 'heaviest' ? s.weightUnit : 'completed'}
                      </span>
                    </div>

                    {/* Footer: exercise name + time */}
                    <div className="mt-auto flex items-center justify-between">
                      <span className="text-[10px] text-white/60 font-medium truncate max-w-[60%]">
                        {s.exercise}
                      </span>
                      <span className="text-[10px] text-white/50 font-medium whitespace-nowrap">
                        {s.time}{s.duration ? ` · ${s.duration}` : ''}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-white/40">{slide.emptyText}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {slides.map((_, i) => (
          <span
            key={i}
            className="block rounded-full transition-all duration-300"
            style={{
              width: i === activeSlide ? 14 : 5,
              height: 5,
              backgroundColor: i === activeSlide ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
