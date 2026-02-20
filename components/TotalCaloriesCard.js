import React, { useState, useMemo } from 'react'
import { calculateWorkoutCalories, calculateSimpleCalories } from '../utils/calorieCalculator'

/**
 * TotalCaloriesCard - Shows total calories burned with day/week tap-cycle filter
 * Compact half-width card (300px height) with single tap to cycle
 * Uses MET-based calorie calculation for scientific accuracy
 * 
 * @param {Object} props
 * @param {Array} props.logs - Array of workout log objects
 * @param {boolean} props.hasData - Whether there is workout data
 */
export default function TotalCaloriesCard({ logs = [], hasData = false }) {
  const filters = ['day', 'week']
  const [filterIndex, setFilterIndex] = useState(0)
  const filter = filters[filterIndex]

  // Cycle to next filter on tap
  const cycleFilter = () => {
    setFilterIndex((prev) => (prev + 1) % filters.length)
  }

  // Calculate total calories based on selected filter
  const { totalCalories, sessionCount } = useMemo(() => {
    if (!logs || logs.length === 0) return { totalCalories: 0, sessionCount: 0 }

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    // Start of this week (Monday)
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
      
      // If no stored calories, calculate using MET formula
      if (!calories || calories === 0) {
        const totalReps = log.results?.totalReps || log.results?.completedReps || log.totalReps || 0
        const durationMs = log.results?.durationMs || 0
        const equipment = log.exercise?.equipmentPath || log.exercise?.equipment || 'dumbbell'
        const exercise = log.exercise?.namePath || log.exercise?.name || ''
        
        if (durationMs > 0) {
          // Use MET formula if we have duration
          const result = calculateWorkoutCalories({
            exercise,
            equipment,
            durationMs,
            totalReps,
          })
          calories = result.calories
        } else if (totalReps > 0) {
          // Fallback to simple calculation
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

  // Format number with commas
  const formatCalories = (val) => {
    if (val >= 1000) {
      return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
    }
    return val.toFixed(1)
  }

  // Fire icon component
  const FireIcon = () => (
    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(255, 206, 171, 0.3)' }}>
      <svg className="w-4 h-4" style={{ color: 'rgb(255 206 171 / 91%)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    </div>
  )

  // Empty state
  if (!hasData) {
    return (
      <div className="rounded-2xl p-3 h-[300px] flex flex-col" style={{ backgroundColor: 'rgb(255 104 26 / 75%)' }}>
        {/* Header row with title and fire icon */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xs font-semibold tracking-wide" style={{ color: 'rgb(255 206 171 / 91%)' }}>
              Calories Burned
            </h3>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgb(255 206 171 / 91%)' }}>{filterLabels[filter]}</p>
          </div>
          <FireIcon />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <p className="text-[11px]" style={{ color: 'rgb(255 206 171 / 91%)' }}>No calorie data yet</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-3 h-[300px] flex flex-col" style={{ backgroundColor: 'rgb(255 104 26 / 75%)' }}>
      {/* Header row with title and fire icon */}
      <div className="flex items-start justify-between">
        <h3 className="text-xs font-semibold tracking-wide" style={{ color: 'rgb(255 206 171 / 91%)' }}>
          Calories Burned
        </h3>
        <FireIcon />
      </div>

      {/* Single cycle filter button */}
      <div>
        <button
          onClick={cycleFilter}
          className="px-3 py-1 rounded-full text-[10px] font-medium transition-all duration-200"
          style={{
            backgroundColor: 'rgba(255, 206, 171, 0.3)',
            color: 'rgb(255 206 171 / 91%)',
            border: '1px solid rgba(255, 206, 171, 0.5)',
          }}
        >
          {filterLabels[filter]}
        </button>
      </div>

      {/* Main calorie display */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center">
          <span className="font-bold leading-none" style={{ color: 'rgb(255 206 171 / 91%)', fontSize: '4.5rem' }}>
            {totalCalories > 0 ? formatCalories(totalCalories) : '0'}
          </span>
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className="text-sm font-medium" style={{ color: 'rgb(255 206 171 / 91%)' }}>Kcal</span>
          </div>
        </div>
      </div>

      {/* Footer: session count */}
      <div className="mt-auto pt-2 border-t" style={{ borderColor: 'rgba(255, 206, 171, 0.4)' }}>
        <div className="flex items-center justify-center gap-1">
          <span className="text-[10px]" style={{ color: 'rgb(255 206 171 / 91%)' }}>
            {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} {filterLabels[filter].toLowerCase()}
          </span>
        </div>
      </div>
    </div>
  )
}
