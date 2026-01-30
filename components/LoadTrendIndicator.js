import React from 'react'

/**
 * LoadTrendIndicator - Shows the trend comparison with last week
 * Standalone gray card that matches Activity Overview width
 * Backend-ready component that accepts trend data as props
 * 
 * @param {Object} props
 * @param {number} props.difference - The kg difference from last week (can be positive or negative)
 * @param {number} props.percentChange - The percentage change from last week
 * @param {string} props.period - The comparison period (default: 'last week')
 * @param {number} props.currentTotal - Current period total load in kg
 * @param {number} props.previousTotal - Previous period total load in kg
 */
export default function LoadTrendIndicator({ 
  difference = 0, 
  percentChange = 0,
  period = 'last week',
  currentTotal = 540,
  previousTotal = 527.5
}) {
  // Determine trend direction
  const getTrend = () => {
    if (difference > 0) return 'up'
    if (difference < 0) return 'down'
    return 'neutral'
  }

  const trend = getTrend()

  // Get appropriate colors and icons based on trend
  const getTrendStyle = () => {
    switch(trend) {
      case 'up':
        return {
          color: 'text-green-400',
          bgColor: 'bg-green-400/10',
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          )
        }
      case 'down':
        return {
          color: 'text-red-400',
          bgColor: 'bg-red-400/10',
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          )
        }
      default:
        return {
          color: 'text-white/50',
          bgColor: 'bg-white/5',
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
            </svg>
          )
        }
    }
  }

  const style = getTrendStyle()

  // Format the difference display
  const formatDifference = () => {
    const absDiff = Math.abs(difference)
    if (trend === 'up') return `+${absDiff.toFixed(1)}`
    if (trend === 'down') return `-${absDiff.toFixed(1)}`
    return `${absDiff.toFixed(1)}`
  }

  // Format percentage display
  const formatPercentage = () => {
    const absPercent = Math.abs(percentChange)
    if (trend === 'up') return `+${absPercent.toFixed(1)}%`
    if (trend === 'down') return `-${absPercent.toFixed(1)}%`
    return `${absPercent.toFixed(1)}%`
  }

  return (
    <div className="bg-white/10 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wide">
            Weekly Comparison
          </h3>
          <p className="text-[10px] text-white/40">vs {period}</p>
        </div>
        
        {/* Trend badge */}
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${style.bgColor}`}>
          <span className={style.color}>{style.icon}</span>
          <span className={`text-xs font-semibold ${style.color}`}>
            {formatPercentage()}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between">
        {/* This week */}
        <div className="flex-1">
          <div className="text-[10px] text-white/40 mb-0.5">This Week</div>
          <div className="text-lg font-bold text-white">{currentTotal.toFixed(1)} <span className="text-xs text-white/50 font-normal">kg</span></div>
        </div>

        {/* Divider with arrow */}
        <div className="px-4 flex flex-col items-center">
          <div className={`text-sm font-semibold ${style.color}`}>
            {formatDifference()} kg
          </div>
          <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        </div>

        {/* Last week */}
        <div className="flex-1 text-right">
          <div className="text-[10px] text-white/40 mb-0.5">Last Week</div>
          <div className="text-lg font-bold text-white/60">{previousTotal.toFixed(1)} <span className="text-xs text-white/40 font-normal">kg</span></div>
        </div>
      </div>
    </div>
  )
}
