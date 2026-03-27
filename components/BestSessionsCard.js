import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'

/**
 * BestSessionsCard — Auto-scrolling carousel showing this week's bests:
 *  Slide 1 (blue):   Heaviest Lift This Week
 *  Slide 2 (green):  Best Clean Session This Week (highest cleanRepPct)
 *  Slide 3 (purple): Longest Session This Week (highest duration)
 *
 * Tapping a slide navigates to that session's detail page.
 */

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
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  /* ── derive best sessions for this week ───────────────────── */
  const { heaviest, bestClean, longest } = useMemo(() => {
    if (!logs || logs.length === 0) return { heaviest: null, bestClean: null, longest: null }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOfWeek = now.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - daysFromMonday)
    weekStart.setHours(0, 0, 0, 0)

    let heaviest = null
    let bestClean = null
    let longest = null
    let maxWeight = 0
    let maxCleanPct = 0
    let maxDurationMs = 0

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
      const durationMs = log.results?.durationMs || 0

      const eqPath = log._equipment || equipment.toLowerCase().replace(/\s+/g, '-')
      const exPath = log._exercise || exercise.toLowerCase().replace(/\s+/g, '-')

      // Clean rep percentage from analytics or ML classification
      const cleanPct = log.analytics?.cleanRepPercentage
        ?? log.results?.cleanRepPercentage
        ?? log.mlClassification?.cleanPercentage
        ?? null

      const entry = {
        logId: log.id,
        exercise,
        equipment,
        weight,
        weightUnit: log.planned?.weightUnit || log.weightUnit || 'kg',
        totalReps,
        totalSets,
        durationMs,
        cleanPct,
        startedAt,
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

      // Best Clean = highest clean rep percentage
      if (cleanPct != null && cleanPct > maxCleanPct) {
        maxCleanPct = cleanPct
        bestClean = entry
      }

      // Longest = highest duration
      if (durationMs > maxDurationMs) {
        maxDurationMs = durationMs
        longest = entry
      }
    })

    return { heaviest, bestClean, longest }
  }, [logs])

  /* ── build slides array ───────────────────────────────────── */
  const slides = useMemo(() => {
    const list = []

    list.push({
      key: 'heaviest',
      title: 'Heaviest Lift This Week',
      icon: (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
        </svg>
      ),
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)',
      session: heaviest,
      value: heaviest ? `${heaviest.equipment?.toLowerCase().includes('dumb') ? Math.max(0, heaviest.weight - 2) : heaviest.weight}` : null,
      unit: heaviest?.weightUnit || 'kg',
    })

    list.push({
      key: 'longest',
      title: 'Longest Session This Week',
      icon: (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
        </svg>
      ),
      gradient: 'linear-gradient(135deg, #8B5CF6 0%, #3B0764 100%)',
      session: longest,
      value: longest?.durationMs ? formatDuration(longest.durationMs) : null,
      unit: '',
    })

    return list
  }, [heaviest, longest])

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

  /* ── mouse drag handlers ──────────────────────────────────── */
  const handleMouseDown = useCallback((e) => {
    if (!containerRef.current) return
    setIsDragging(true)
    setStartX(e.pageX - containerRef.current.offsetLeft)
    setScrollLeft(containerRef.current.scrollLeft)
    containerRef.current.style.cursor = 'grabbing'
    isUserScrolling.current = true
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !containerRef.current) return
    e.preventDefault()
    const x = e.pageX - containerRef.current.offsetLeft
    const walk = (x - startX) * 2
    containerRef.current.scrollLeft = scrollLeft - walk
  }, [isDragging, startX, scrollLeft])

  const handleMouseUp = useCallback(() => {
    if (!containerRef.current) return
    setIsDragging(false)
    containerRef.current.style.cursor = 'grab'
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (isDragging && containerRef.current) {
      setIsDragging(false)
      containerRef.current.style.cursor = 'grab'
    }
  }, [isDragging])

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
        style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1E3A8A 100%)' }}
      >
        <h3 className="text-[10px] font-semibold text-white/80">Heaviest Lift This Week</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-white/50">No sessions yet</p>
        </div>
      </div>
    )
  }

  /* ── render ───────────────────────────────────────────────── */
  return (
    <div className="rounded-2xl flex-1 overflow-hidden relative">
      {/* Slide container */}
      <div
        ref={containerRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide h-full cursor-grab"
        style={{ scrollSnapType: 'x mandatory' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
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
                {/* Title */}
                <div className="flex items-center gap-1.5">
                  <span className="text-white/60">{slide.icon}</span>
                  <h3 className="text-[10px] font-semibold text-white/80 leading-tight">{slide.title}</h3>
                </div>

                {s && slide.value ? (
                  <>
                    {/* Main value - right aligned with unit on same line */}
                    <div className="flex-1 flex flex-col items-end justify-center">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-black text-white leading-none" style={{ fontSize: '2.75rem' }}>
                          {slide.value}
                        </span>
                        {slide.unit && (
                          <span className="text-sm font-bold text-white/80">
                            {slide.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Footer: exercise name + time stacked - right aligned */}
                    <div className="mt-auto flex flex-col items-end">
                      <span className="text-[11px] text-white/70 font-semibold truncate max-w-full leading-tight text-right">
                        {s.exercise}
                      </span>
                      <span className="text-[10px] text-white/50 font-medium text-right">
                        {s.time}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-xs text-white/40">No sessions yet</p>
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
