import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'

/**
 * TotalVolumeCard - Shows total volume lifted (weight × reps)
 * Compact card with blue/indigo gradient, matching TotalCaloriesCard design
 */
export default function TotalVolumeCard({ logs = [], hasData = false }) {
  const filters = ['day', 'week']
  const [filterIndex, setFilterIndex] = useState(0)
  const filter = filters[filterIndex]

  // Slide transition state
  const [slidePhase, setSlidePhase] = useState('idle')
  const [displayValue, setDisplayValue] = useState(null)
  const slideTimerRef = useRef(null)

  const cycleFilter = useCallback(() => {
    if (slidePhase !== 'idle') return
    setSlidePhase('slide-out')
    slideTimerRef.current = setTimeout(() => {
      setFilterIndex((prev) => (prev + 1) % filters.length)
      setSlidePhase('slide-in')
      slideTimerRef.current = setTimeout(() => {
        setSlidePhase('idle')
      }, 250)
    }, 250)
  }, [slidePhase])

  useEffect(() => {
    return () => { if (slideTimerRef.current) clearTimeout(slideTimerRef.current) }
  }, [])

  useEffect(() => {
    if (slidePhase === 'idle' || slidePhase === 'slide-in') {
      setDisplayValue(null)
    }
  }, [slidePhase])

  // Calculate total volume based on selected filter
  const { totalVolume, sessionCount } = useMemo(() => {
    if (!logs || logs.length === 0) return { totalVolume: 0, sessionCount: 0 }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const dayOfWeek = now.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - daysFromMonday)
    weekStart.setHours(0, 0, 0, 0)

    const filterStart = filter === 'day' ? today : weekStart

    let vol = 0
    let count = 0

    const parseTimestamp = (ts) => {
      if (!ts) return null
      if (typeof ts.toDate === 'function') return ts.toDate()
      if (ts.seconds !== undefined) return new Date(ts.seconds * 1000)
      if (typeof ts === 'string') return new Date(ts)
      if (ts instanceof Date) return ts
      return null
    }

    logs.forEach((log) => {
      const createdAt = parseTimestamp(log.timestamps?.started) ||
                        parseTimestamp(log.timestamps?.created) ||
                        (log.startTime ? new Date(log.startTime) : null)
      if (!createdAt || createdAt < filterStart) return

      const weight = log.planned?.weight || log.weight || 0
      const reps = log.results?.totalReps || log.totalReps || 0
      const volume = weight * reps

      if (volume > 0) {
        vol += volume
        count++
      }
    })

    return { totalVolume: Math.round(vol), sessionCount: count }
  }, [logs, filter])

  const filterLabels = {
    day: 'Today',
    week: 'This Week',
  }

  const formatVolume = (val) => {
    if (val >= 1000) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    }
    return val.toString()
  }

  const shownVolume = displayValue !== null ? displayValue : totalVolume

  useEffect(() => {
    if (slidePhase === 'slide-out') {
      setDisplayValue(totalVolume)
    }
  }, [slidePhase])

  const getSlideStyle = () => {
    if (slidePhase === 'slide-out') {
      return { transform: 'translateX(-110%)', opacity: 0 }
    }
    if (slidePhase === 'slide-in') {
      return { transform: 'translateX(0)', opacity: 1 }
    }
    return { transform: 'translateX(0)', opacity: 1 }
  }

  const slideInRef = useRef(null)
  useEffect(() => {
    if (slidePhase === 'slide-in' && slideInRef.current) {
      const el = slideInRef.current
      el.style.transition = 'none'
      el.style.transform = 'translateX(110%)'
      el.style.opacity = '0'
      void el.offsetWidth
      el.style.transition = 'transform 250ms cubic-bezier(0.16,1,0.3,1), opacity 250ms ease-out'
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
    }
  }, [slidePhase])

  // Empty state
  if (!hasData) {
    return (
      <div
        className="rounded-2xl p-4 flex flex-col flex-1"
        style={{
          background: 'linear-gradient(135deg, #6366F1 0%, #312E81 100%)',
          minHeight: '100px',
        }}
      >
        <h3 className="text-sm font-extrabold text-white/90">Volume Lifted</h3>
        <button
          onClick={cycleFilter}
          className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white/80 flex items-center gap-1 w-fit mt-1"
        >
          {filterLabels[filter]}
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex-1 px-2 flex flex-col items-end justify-center">
          <p className="text-xs text-white/50">No data yet</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl p-3 flex flex-col flex-1"
      style={{
        background: 'linear-gradient(135deg, #6366F1 0%, #312E81 100%)',
        minHeight: '100px',
      }}
    >
      {/* Title */}
      <h3 className="text-xs font-semibold text-white/90">Volume Lifted</h3>
      {/* Filter pill */}
      <button
        onClick={cycleFilter}
        className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white/80 flex items-center gap-1 w-fit mt-1"
      >
        {filterLabels[filter]}
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Main content */}
      <div className="flex-1 px-2 flex flex-col items-end justify-center">
        <div className="relative overflow-hidden mt-1 h-10 flex items-center justify-end w-full">
          <span
            ref={slideInRef}
            className="font-extrabold text-white leading-none"
            style={{
              fontSize: '2.5rem',
              transition: slidePhase === 'slide-out'
                ? 'transform 250ms cubic-bezier(0.5,0,0.75,0), opacity 200ms ease-in'
                : 'none',
              ...getSlideStyle()
            }}
          >
            {formatVolume(shownVolume)}
          </span>
        </div>
        {/* Unit + dumbbell icon */}
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-xs font-semibold text-white/70">kg</span>
          <svg className="w-3.5 h-3.5" style={{ color: '#1e1b4b' }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
          </svg>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto text-right">
        <span className="text-[10px] text-white/50 font-medium">
          From {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} {filter === 'day' ? 'today' : 'this week'}
        </span>
      </div>
    </div>
  )
}
