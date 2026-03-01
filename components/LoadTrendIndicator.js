import React, { useMemo } from 'react'

const encouragingMessages = [
  "You've got last week's load to work with.",
  "New week — good time to get a session in.",
  "Still time to match or pass last week.",
  "One session can shift these numbers.",
  "Last week's total isn't going anywhere yet.",
  "Week's open. Load's at zero.",
  "Nothing logged yet — the week just started.",
  "Your baseline from last week is right there.",
]

const firstTimeMessages = [
  "Log a workout to start tracking load.",
  "First session sets the baseline.",
  "No data yet — start when you're ready.",
  "One workout and you'll have something to compare.",
]

/**
 * LoadTrendIndicator - Shows the trend comparison with last week
 * Cloned from mockup design: dark card, inner lighter section for bars,
 * bottom row with difference + percentage badge
 */
export default function LoadTrendIndicator({ 
  difference = 0, 
  percentChange = 0,
  period = 'last week',
  currentTotal = 0,
  previousTotal = 0,
  hasData = false
}) {
  // Show empty state when no data
  if (!hasData) {
    return (
      <div className="bg-white/[0.07] rounded-2xl sm:rounded-3xl p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 sm:mb-5 pr-8">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-white">Weekly Load Comparison</h3>
            <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">vs {period}</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-6 sm:py-8">
          <div className="text-white/30 mb-2">
            <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="text-xs text-white/40">No workout data yet</p>
          <p className="text-[10px] text-white/30 mt-1">Complete workouts to track your load</p>
        </div>
      </div>
    )
  }

  // Determine trend direction
  const getTrend = () => {
    if (difference > 0) return 'up'
    if (difference < 0) return 'down'
    return 'neutral'
  }

  const trend = getTrend()

  const getTrendStyle = () => {
    switch(trend) {
      case 'up':
        return {
          color: '#61d929',
          bgColor: 'rgba(97, 217, 41, 0.15)',
          barColor: '#61d929',
        }
      case 'down':
        return {
          color: '#ef4444',
          bgColor: 'rgba(239, 68, 68, 0.15)',
          barColor: '#ef4444',
        }
      default:
        return {
          color: 'rgba(255,255,255,0.5)',
          bgColor: 'rgba(255,255,255,0.1)',
          barColor: 'rgba(255,255,255,0.3)',
        }
    }
  }

  const style = getTrendStyle()

  // Calculate bar widths
  const maxValue = Math.max(currentTotal, previousTotal) || 1
  const currentWidth = (currentTotal / maxValue) * 100
  const previousWidth = (previousTotal / maxValue) * 100

  // Format difference
  const formatDifference = () => {
    const absDiff = Math.abs(difference)
    if (trend === 'up') return `+ ${absDiff.toFixed(0)}kg`
    if (trend === 'down') return `- ${absDiff.toFixed(0)}kg`
    return `${absDiff.toFixed(0)}kg`
  }

  // Format percentage
  const formatPercentage = () => {
    const absPercent = Math.abs(percentChange)
    return `${absPercent.toFixed(0)}%`
  }

  // Check if user hasn't worked out this week
  const noWorkoutThisWeek = currentTotal === 0

  // Pick a random encouraging message (stable per render cycle)
  const encourageMsg = useMemo(() => {
    if (!noWorkoutThisWeek) return ''
    const pool = previousTotal > 0 ? encouragingMessages : firstTimeMessages
    return pool[Math.floor(Math.random() * pool.length)]
  }, [noWorkoutThisWeek, previousTotal])

  return (
    <div className="bg-white/[0.07] rounded-2xl sm:rounded-3xl p-4 sm:p-5">
      {/* Header row: title + arrow (arrow space reserved via pr-8) */}
      <div className="flex items-start justify-between mb-4 sm:mb-5 pr-8">
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white">Weekly Load Comparison</h3>
          <p className="text-[10px] sm:text-xs text-white/40 mt-0.5">
            {noWorkoutThisWeek ? "Start a workout to build this week's progress!" : `vs ${period}`}
          </p>
        </div>
      </div>

      {/* Bars section */}
      <div className="space-y-3 sm:space-y-4">
        {/* This Week */}
        <div>
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm font-medium text-white">This Week</span>
            <span className="text-xs sm:text-sm font-bold text-white">{currentTotal.toFixed(1)} kg</span>
          </div>
          <div className="h-2.5 sm:h-3 bg-white/[0.06] rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-700"
              style={{ 
                width: `${currentWidth}%`,
                backgroundColor: style.barColor
              }}
            />
          </div>
        </div>

        {/* Last Week */}
        <div>
          <div className="flex items-center justify-between mb-1.5 sm:mb-2">
            <span className="text-xs sm:text-sm text-white/50">Last Week</span>
            <span className="text-xs sm:text-sm font-medium text-white/60">{previousTotal.toFixed(1)} kg</span>
          </div>
          <div className="h-2.5 sm:h-3 bg-white/[0.06] rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/25 rounded-full transition-all duration-700"
              style={{ width: `${previousWidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-3 sm:mt-4">
        {noWorkoutThisWeek ? (
          /* Encouraging message when no workout this week */
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">
              {encourageMsg}
            </span>
          </div>
        ) : (
          /* Normal comparison row */
          <>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="text-xs sm:text-sm font-semibold" style={{ color: style.color }}>
                {formatDifference()}
              </span>
              <span className="text-[10px] sm:text-sm text-white/40">
                {trend === 'up' ? 'more than last week' : trend === 'down' ? 'less than last week' : 'same as last week'}
              </span>
            </div>

            {/* Percentage badge with chart icon */}
            <div 
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl"
              style={{ backgroundColor: style.bgColor }}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: style.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {trend === 'up' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                ) : trend === 'down' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 12h8M9 12h4" />
                )}
              </svg>
              <span className="text-xs sm:text-sm font-bold" style={{ color: style.color }}>
                {formatPercentage()}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
