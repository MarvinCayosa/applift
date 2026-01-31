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
          bgColor: 'bg-green-500/20',
          barColor: 'bg-green-400',
          label: 'Increased',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          )
        }
      case 'down':
        return {
          color: 'text-red-400',
          bgColor: 'bg-red-500/20',
          barColor: 'bg-red-400',
          label: 'Decreased',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          )
        }
      default:
        return {
          color: 'text-white/50',
          bgColor: 'bg-white/10',
          barColor: 'bg-white/30',
          label: 'No change',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
            </svg>
          )
        }
    }
  }

  const style = getTrendStyle()

  // Calculate bar widths for visual comparison
  const maxValue = Math.max(currentTotal, previousTotal) || 1
  const currentWidth = (currentTotal / maxValue) * 100
  const previousWidth = (previousTotal / maxValue) * 100

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
    if (trend === 'up') return `+${absPercent.toFixed(0)}%`
    if (trend === 'down') return `-${absPercent.toFixed(0)}%`
    return `0%`
  }

  return (
    <div className="bg-white/10 rounded-2xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${style.bgColor}`}>
            <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Weekly Load Comparison</h3>
            <p className="text-[10px] text-white/40">vs {period}</p>
          </div>
        </div>
        
        {/* Trend badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${style.bgColor}`}>
          <span className={style.color}>{style.icon}</span>
          <span className={`text-sm font-bold ${style.color}`}>
            {formatPercentage()}
          </span>
        </div>
      </div>

      {/* Visual bar comparison */}
      <div className="space-y-3">
        {/* This week bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/70 font-medium">This Week</span>
            <span className="text-sm font-bold text-white">{currentTotal.toFixed(1)} kg</span>
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${trend === 'up' ? 'bg-green-400' : trend === 'down' ? 'bg-amber-400' : 'bg-white/40'}`}
              style={{ width: `${currentWidth}%` }}
            />
          </div>
        </div>

        {/* Last week bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/50">Last Week</span>
            <span className="text-sm font-medium text-white/60">{previousTotal.toFixed(1)} kg</span>
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white/20 rounded-full transition-all duration-500"
              style={{ width: `${previousWidth}%` }}
            />
          </div>
        </div>
      </div>

      {/* Difference summary */}
      <div className={`mt-4 pt-3 border-t border-white/10 flex items-center justify-center gap-2`}>
        <span className={`text-sm font-semibold ${style.color}`}>
          {formatDifference()} kg
        </span>
        <span className="text-xs text-white/40">
          {trend === 'up' ? 'more than last week' : trend === 'down' ? 'less than last week' : 'same as last week'}
        </span>
      </div>
    </div>
  )
}
