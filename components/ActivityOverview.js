import React from 'react'

/**
 * Activity overview component showing current week and last 3 months.
 * Accepts precomputed date data so backend integration can supply real values.
 */
export default function ActivityOverview({
  currentWeek = [],
  calendar3Months = [],
  onDaySelect = () => {},
  onMonthSelect = () => {},
  variant = 'mobile', // 'mobile' | 'desktop'
}) {
  const isDesktop = variant === 'desktop'

  const weekWrapperClasses = isDesktop
    ? 'backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 flex-shrink-0'
    : 'bg-white/5 border border-white/10 rounded-2xl p-4 mb-3'

  const dayCircleClasses = (day) => {
    const base = isDesktop ? 'w-9 h-9' : 'w-7 h-7'
    if (day.isToday) return `${base} bg-white/80 text-black border-2 border-white/80`
    if (day.isWorkout && !day.isFuture) return `${base} border-2 border-purple-400 text-purple-400`
    if (day.isFuture) return `${base} text-white/20`
    return `${base} text-white/40`
  }

  const dayLabelClass = (day) =>
    `${isDesktop ? 'text-xs font-medium mb-1.5' : 'text-xs font-medium mb-1'} ${day.isFuture ? 'text-white/40' : 'text-white/70'}`

  const monthDotClass = (dayData) => {
    if (dayData.day === null) return ''
    if (dayData.isToday) return 'bg-white/80'
    if (dayData.isFuture) return 'bg-white/10'
    if (dayData.isWorkout) return 'bg-gradient-to-r from-purple-400 to-purple-500 shadow-lg shadow-purple-500/50'
    return 'bg-white/30'
  }

  const monthGridDotSize = isDesktop ? 'w-2 h-2' : 'w-1.5 h-1.5'
  const monthGridGap = isDesktop ? 'gap-1.5' : 'gap-1'
  const monthGridCols = isDesktop ? 'grid grid-cols-7' : 'grid grid-cols-7'

  return (
    <div className="flex flex-col h-full">
      <h3
        className={
          isDesktop
            ? 'text-sm font-semibold text-white/90 mb-5 uppercase tracking-wide'
            : 'text-sm font-semibold text-white/90 mb-4'
        }
      >
        Activity Overview
      </h3>

      {/* Current Week */}
      <div className={weekWrapperClasses}>
        <p className="text-xs text-white/50 mb-3 uppercase tracking-wide font-semibold">This Week</p>
        <div className="flex justify-between items-center gap-2">
          {currentWeek.map((day, idx) => (
            <button
              key={idx}
              onClick={() => !day.isFuture && onDaySelect(day)}
              disabled={day.isFuture}
              className={`flex flex-col items-center transition-all duration-300 flex-1 ${
                day.isFuture ? 'opacity-40 cursor-not-allowed' : isDesktop ? 'hover:opacity-80 active:opacity-60' : 'active:opacity-70'
              }`}
            >
              <div className={dayLabelClass(day)}>{day.dayName}</div>
              <div className={`${dayCircleClasses(day)} rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300`}>
                {day.day}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Last 3 Months */}
      <div className="flex-1 overflow-hidden mt-1 md:mt-2">
        <p className="text-xs text-white/50 mb-3 md:mb-4 uppercase tracking-wide font-semibold">Last 3 Months</p>
        <div className={isDesktop ? 'grid grid-cols-3 gap-4' : 'grid grid-cols-3 gap-2'}>
          {calendar3Months.map((monthData) => (
            <button
              key={`${monthData.month}-${monthData.year}`}
              onClick={() => onMonthSelect(monthData.month, monthData.year)}
              className="flex flex-col items-center hover:bg-white/10 active:opacity-70 rounded-lg p-2 transition-all duration-200"
            >
              <div className={isDesktop ? 'text-xs font-semibold text-white/80 mb-3 uppercase' : 'text-xs font-semibold text-white/80 mb-2 uppercase'}>
                {monthData.monthName}
              </div>
              <div className={`${monthGridCols} ${monthGridGap}`}>
                {monthData.days.map((dayData, idx) => {
                  if (dayData.day === null) return <div key={idx} className={monthGridDotSize} />
                  const dotColor = monthDotClass(dayData)
                  return (
                    <div
                      key={idx}
                      className={`${monthGridDotSize} rounded-full ${dotColor} transition-all duration-300`}
                      title={dayData.day ? (dayData.isToday ? 'Today' : dayData.isWorkout ? 'Workout day' : 'Rest day') : ''}
                    />
                  )
                })}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
