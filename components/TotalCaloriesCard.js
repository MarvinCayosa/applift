import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { calculateWorkoutCalories, calculateSimpleCalories } from '../utils/calorieCalculator'

/**
 * TotalCaloriesCard - Shows total calories burned
 * Compact card with orange gradient background matching mockup design
 * Uses MET-based calorie calculation for scientific accuracy
 */
export default function TotalCaloriesCard({ logs = [], hasData = false }) {
  const filters = ['day', 'week']
  const [filterIndex, setFilterIndex] = useState(0)
  const filter = filters[filterIndex]
  
  // Slide transition state: 'idle' | 'slide-out' | 'slide-in'
  const [slidePhase, setSlidePhase] = useState('idle')
  const [displayValue, setDisplayValue] = useState(null)
  const slideTimerRef = useRef(null)

  // Cycle to next filter on tap
  const cycleFilter = useCallback(() => {
    if (slidePhase !== 'idle') return
    // Phase 1: slide the current value out to the left
    setSlidePhase('slide-out')
    // After the slide-out completes, swap value and slide in
    slideTimerRef.current = setTimeout(() => {
      setFilterIndex((prev) => (prev + 1) % filters.length)
      setSlidePhase('slide-in')
      // After slide-in completes, return to idle
      slideTimerRef.current = setTimeout(() => {
        setSlidePhase('idle')
      }, 250)
    }, 250)
  }, [slidePhase])

  // Clean up timers
  useEffect(() => {
    return () => { if (slideTimerRef.current) clearTimeout(slideTimerRef.current) }
  }, [])

  // Keep displayValue in sync when not animating
  useEffect(() => {
    if (slidePhase === 'idle' || slidePhase === 'slide-in') {
      setDisplayValue(null) // null means "use live totalCalories"
    }
  }, [slidePhase])

  // Calculate total calories based on selected filter
  const { totalCalories, sessionCount } = useMemo(() => {
    if (!logs || logs.length === 0) return { totalCalories: 0, sessionCount: 0 }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    const dayOfWeek = now.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - daysFromMonday)
    weekStart.setHours(0, 0, 0, 0)

    const filterStart = filter === 'day' ? today : weekStart

    let cals = 0
    let count = 0

    logs.forEach((log) => {
      const createdAt = log.timestamps?.started?.toDate?.() ||
                        log.timestamps?.created?.toDate?.() ||
                        (log.startTime ? new Date(log.startTime) : null)
      if (!createdAt || createdAt < filterStart) return

      let calories = log.results?.calories || 0
      
      if (!calories || calories === 0) {
        const totalReps = log.results?.totalReps || log.results?.completedReps || log.totalReps || 0
        const durationMs = log.results?.durationMs || 0
        const equipment = log.exercise?.equipmentPath || log.exercise?.equipment || 'dumbbell'
        const exercise = log.exercise?.namePath || log.exercise?.name || ''
        
        if (durationMs > 0) {
          const result = calculateWorkoutCalories({
            exercise,
            equipment,
            durationMs,
            totalReps,
          })
          calories = result.calories
        } else if (totalReps > 0) {
          calories = calculateSimpleCalories(totalReps, 0, equipment)
        }
      }
      
      if (calories > 0) {
        cals += calories
        count++
      }
    })

    return { totalCalories: Math.round(cals * 100) / 100, sessionCount: count }
  }, [logs, filter])

  const filterLabels = {
    day: 'Today',
    week: 'This Week',
  }

  const formatCalories = (val) => {
    if (val >= 1000) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    }
    return Math.round(val).toString()
  }

  // Resolve what text to display
  const shownCalories = displayValue !== null ? displayValue : totalCalories

  // Snapshot the outgoing value when slide-out starts
  useEffect(() => {
    if (slidePhase === 'slide-out') {
      setDisplayValue(totalCalories) // freeze current value during exit
    }
  }, [slidePhase])

  // Slide style helper
  const getSlideStyle = () => {
    if (slidePhase === 'slide-out') {
      return { transform: 'translateX(-110%)', opacity: 0 }
    }
    if (slidePhase === 'slide-in') {
      // On first render of slide-in the element starts off-screen right,
      // then the CSS transition brings it to center.
      return { transform: 'translateX(0)', opacity: 1 }
    }
    return { transform: 'translateX(0)', opacity: 1 }
  }

  // For slide-in we need the element to start at translateX(110%) then transition to 0.
  // We accomplish this with a two-frame trick using a ref.
  const slideInRef = useRef(null)
  useEffect(() => {
    if (slidePhase === 'slide-in' && slideInRef.current) {
      // Force starting position before transition
      const el = slideInRef.current
      el.style.transition = 'none'
      el.style.transform = 'translateX(110%)'
      el.style.opacity = '0'
      // Force layout reflow
      void el.offsetWidth
      // Now enable transition and animate to final position
      el.style.transition = 'transform 250ms cubic-bezier(0.16,1,0.3,1), opacity 250ms ease-out'
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
    }
  }, [slidePhase])

  // Empty state
  if (!hasData) {
    return (
      <div
        className="rounded-2xl p-4 flex flex-col"
        style={{
          background: 'linear-gradient(135deg, #FF9012 0%, #AD380A 100%)',
          minHeight: '80px',
        }}
      >
        <h3 className="text-sm font-extrabold text-white/90">Calories Burned</h3>
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
      className="rounded-2xl p-3 flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #FF9012 0%, #AD380A 100%)',
        minHeight: '80px',
      }}
    >
      {/* Title */}
      <h3 className="text-xs font-semibold text-white/90">Calories Burned</h3>
      {/* Filter pill below title */}
      <button
        onClick={cycleFilter}
        className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/20 text-white/80 flex items-center gap-1 w-fit mt-1"
      >
        {filterLabels[filter]}
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Main content – all right-aligned */}
      <div className="flex-1 px-2 flex flex-col items-end justify-center">
        {/* Large calorie number with smooth slide transition */}
        <div className="relative overflow-hidden h-16 flex items-center justify-end w-full">
          <span
            ref={slideInRef}
            className="font-extrabold text-white leading-none"
            style={{
              fontSize: '4.5rem',
              transition: slidePhase === 'slide-out'
                ? 'transform 250ms cubic-bezier(0.5,0,0.75,0), opacity 200ms ease-in'
                : 'none',
              ...getSlideStyle()
            }}
          >
            {formatCalories(shownCalories)}
          </span>
        </div>
        {/* Kcal + fire icon */}
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-sm font-semibold text-white/70">Kcal</span>
          <svg className="w-4 h-4" style={{ color: '#5C1A00' }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 23c-3.6 0-7-2.4-7-7 0-3.1 2.1-5.7 3.2-6.8.4-.4 1-.5 1.5-.2.5.2.8.7.8 1.2v.4c0 .6.2 1.2.6 1.7.1-.6.4-1.2.8-1.7l2.5-3.4c.3-.4.8-.6 1.3-.5s.9.5 1 1c.4 1.7 1.3 3.8 2.3 5.3.7 1 1 2.3 1 3.5 0 3.8-2.6 6.5-8 6.5z"/>
          </svg>
        </div>
      </div>

      {/* Footer: session count – right-aligned */}
      <div className="mt-auto text-right">
        <span className="text-[11px] text-white/50 font-medium">
          From {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} {filter === 'day' ? 'today' : 'this week'}
        </span>
      </div>
    </div>
  )
}
