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
          color: '#61d929', // new green
          bgColor: 'rgba(97, 217, 41, 0.2)',
          barColor: '#61d929',
          label: 'Increased',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
            </svg>
          )
        }
      case 'down':
        return {
          color: '#ef4444', // red
          bgColor: 'rgba(239, 68, 68, 0.2)',
          barColor: '#ef4444',
          label: 'Decreased',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          )
        }
      default:
        return {
          color: 'rgba(255,255,255,0.5)',
          bgColor: 'rgba(255,255,255,0.1)',
          barColor: 'rgba(255,255,255,0.3)',
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
          <div>
            <h3 className="text-sm font-semibold text-white">Weekly Load Comparison</h3>
            <p className="text-[10px] text-white/40">vs {period}</p>
          </div>
        </div>
        
        {/* Trend badge */}
        <div 
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: style.bgColor }}
        >
          <span style={{ color: style.color }}>{style.icon}</span>
          <span className="text-sm font-bold" style={{ color: style.color }}>
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
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${currentWidth}%`,
                backgroundColor: trend === 'up' ? '#61d929' : trend === 'down' ? '#f59e0b' : 'rgba(255,255,255,0.4)'
              }}
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
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-center gap-2">
        <span className="text-sm font-semibold" style={{ color: style.color }}>
          {formatDifference()} kg
        </span>
        <span className="text-xs text-white/40">
          {trend === 'up' ? 'more than last week' : trend === 'down' ? 'less than last week' : 'same as last week'}
        </span>
      </div>
    </div>
  )
}
