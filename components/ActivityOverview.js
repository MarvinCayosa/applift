import React, { useState, useEffect } from 'react'

// Reusable WorkoutCard component for backend integration
const WorkoutCard = ({ workout, onWorkoutClick, selectedDay }) => {
  // Equipment color mapping (matching EquipmentDistributionCard)
  const getEquipmentColor = (equipment) => {
    const colorMap = {
      'Dumbbell': '#FF4D4D',     // Red
      'Barbell': '#3B82F6',      // Blue  
      'Weight Stack': '#FBBF24', // Yellow
    };
    return colorMap[equipment] || '#7c3aed';
  };

  // Get equipment icon
  const getEquipmentIcon = (equipment) => {
    switch (equipment) {
      case 'Dumbbell':
        return '/svg/dumbbell.svg';
      case 'Barbell':
        return '/svg/barbell.svg';
      case 'Weight Stack':
        return '/svg/weight-stack.svg';
      default:
        return '/svg/dumbbell.svg';
    }
  };

  return (
    <button
      onClick={() => onWorkoutClick(workout, selectedDay)}
      className="w-full bg-white/10 rounded-xl p-3 hover:bg-white/15 transition-all duration-200 text-left relative overflow-hidden"
    >
      {/* Colored bar on the left side */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: getEquipmentColor(workout.equipment) }}
      />
      
      <div className="flex items-center justify-between mb-2 ml-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/90">{workout.exercise}</span>
          <img 
            src={getEquipmentIcon(workout.equipment)} 
            alt={workout.equipment}
            className="w-3 h-3"
            style={{ filter: 'brightness(0) saturate(100%) invert(1)' }}
          />
        </div>
        <span className="text-xs text-white/50">{workout.startTime}</span>
      </div>
      <div className="flex items-center gap-3 ml-3">
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-white/70">{workout.duration} min</span>
        </div>
        <div className="flex items-center gap-1">
          <img 
            src="/svg/weight-response.svg" 
            alt="Weight" 
            className="w-3 h-3"
            style={{ filter: 'brightness(0) saturate(100%) invert(64%) sepia(36%) saturate(678%) hue-rotate(249deg) brightness(91%) contrast(91%)' }}
          />
          <span className="text-xs text-white/70">{workout.exerciseCount} exercises</span>
        </div>
      </div>
    </button>
  )
}

// Reusable WorkoutLogsList component for backend integration
const WorkoutLogsList = ({ workouts, selectedDay, onWorkoutClick }) => {
  if (!selectedDay) {
    return (
      <div className="text-center text-white/50 text-xs py-8">
        <div className="mb-2">Select a date</div>
        <div className="text-white/30">to view workout logs</div>
      </div>
    )
  }

  if (!workouts || workouts.length === 0) {
    return (
      <div className="text-center text-white/50 text-xs py-8">
        <div className="mb-2">No workouts logged</div>
        <div className="text-white/30">for {selectedDay.dayName}, {selectedDay.day}</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {workouts.map((workout) => (
        <WorkoutCard
          key={workout.id}
          workout={workout}
          onWorkoutClick={onWorkoutClick}
          selectedDay={selectedDay.day}
        />
      ))}
    </div>
  )
}

// Reusable WeeklyDatePicker component for backend integration
const WeeklyDatePicker = ({ 
  currentWeek, 
  selectedDay, 
  onDaySelect, 
  dayCircleClasses, 
  dayLabelClass, 
  getSelectedDayClasses,
  isDesktop 
}) => {
  return (
    <div className="flex justify-between items-center mb-4">
      {currentWeek.map((day, idx) => (
        <button
          key={idx}
          onClick={() => onDaySelect(day)}
          disabled={day.isFuture}
          className={`flex flex-col items-center transition-all duration-300 flex-1 ${
            day.isFuture 
              ? 'opacity-40 cursor-not-allowed' 
              : isDesktop ? 'hover:opacity-80 active:opacity-60' : 'active:opacity-70'
          } ${getSelectedDayClasses(day)}`}
        >
          <div className={dayLabelClass(day)}>{day.dayName}</div>
          <div className={`${dayCircleClasses(day)} rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300`}>
            {day.day}
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * Activity overview component showing current week and last 2 months.
 * Accepts precomputed date data so backend integration can supply real values.
 */
export default function ActivityOverview({
  currentWeek = [],
  calendar3Months = [],
  workoutLogs = {}, // Backend will provide this data
  onMonthSelect = () => {},
  onWorkoutClick = () => {}, // Backend integration callback
  variant = 'mobile', // 'mobile' | 'desktop'
}) {
  const [viewMode, setViewMode] = useState('week') // 'week' | 'months'
  const [selectedDay, setSelectedDay] = useState(null) // For showing workout details
  const isDesktop = variant === 'desktop'

  // Auto-select today when component mounts
  useEffect(() => {
    if (currentWeek.length > 0 && !selectedDay) {
      const today = currentWeek.find(day => day.isToday && !day.isFuture);
      if (today) {
        setSelectedDay(today);
      }
    }
  }, [currentWeek, selectedDay]);

  // Use workoutLogs from props, fallback to mock data for development
  const currentWorkoutLogs = Object.keys(workoutLogs).length > 0 ? workoutLogs : {
    30: [
      {
        id: 'workout_001',
        exercise: 'Flat Bench Press',
        equipment: 'Barbell',
        duration: 45,
        startTime: '07:30',
        exerciseCount: 3,
        status: 'completed'
      },
      {
        id: 'workout_002', 
        exercise: 'Concentration Curls',
        equipment: 'Dumbbell',
        duration: 20,
        startTime: '18:00',
        exerciseCount: 1,
        status: 'completed'
      }
    ],
    29: [
      {
        id: 'workout_003',
        exercise: 'Lateral Pulldown',
        equipment: 'Weight Stack', 
        duration: 50,
        startTime: '08:00',
        exerciseCount: 4,
        status: 'completed'
      }
    ],
    28: [
      {
        id: 'workout_004',
        exercise: 'Front Squats',
        equipment: 'Barbell',
        duration: 60,
        startTime: '09:15',
        exerciseCount: 5,
        status: 'completed'
      }
    ]
  }

  // Get current month name
  const getCurrentMonthName = () => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December']
    return months[new Date().getMonth()]
  }

  const handleDaySelect = (day) => {
    if (day.isFuture) return
    // Toggle selection - clicking same day deselects it
    if (selectedDay?.day === day.day) {
      setSelectedDay(null)
    } else {
      setSelectedDay(day)
    }
  }

  const handleWorkoutClick = (workout, day) => {
    // Use parent callback for navigation/routing
    onWorkoutClick(workout, day)
  }

  const weekWrapperClasses = isDesktop
    ? 'backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-4 flex-shrink-0'
    : 'bg-white/5 border border-white/10 rounded-2xl p-4'

  const dayCircleClasses = (day) => {
    const base = isDesktop ? 'w-9 h-9' : 'w-7 h-7'
    // Selected day gets violet circle
    if (selectedDay?.day === day.day && !day.isFuture) {
      return `${base} bg-purple-500 text-white border-2 border-purple-500`
    }
    if (day.isToday) return `${base} bg-white/80 text-black border-2 border-white/80`
    if (day.isWorkout && !day.isFuture) return `${base} border-2 border-purple-400 text-purple-400`
    if (day.isFuture) return `${base} text-white/20`
    return `${base} text-white/40`
  }

  const getSelectedDayClasses = (day) => {
    // No background needed anymore, selection is shown on the circle
    return ''
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

  const monthGridDotSize = isDesktop ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'
  const monthGridGap = isDesktop ? 'gap-1.5' : 'gap-1'
  const monthGridCols = isDesktop ? 'grid grid-cols-7' : 'grid grid-cols-7'

  return (
    <div className="flex flex-col h-full">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <h3 className={isDesktop 
          ? "text-sm font-semibold text-white/90 uppercase tracking-wide" 
          : "text-sm font-semibold text-white/90"
        }>
          Activity Overview
        </h3>
        
        {/* Toggle Switch */}
        <div className="relative flex items-center bg-black/40 rounded-full p-1 border-none">
          <button
            onClick={() => setViewMode('week')}
            className={`relative z-10 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-300 ${
              viewMode === 'week' 
                ? 'text-white' 
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            Weekly
          </button>
          <button
            onClick={() => setViewMode('months')}
            className={`relative z-10 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-300 ${
              viewMode === 'months' 
                ? 'text-white' 
                : 'text-white/60 hover:text-white/80'
            }`}
          >
            Monthly
          </button>
          
          {/* Sliding background */}
          <div 
            className="absolute top-1 bottom-1 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full transition-all duration-300 ease-out shadow-lg"
            style={{
              width: '50%',
              left: viewMode === 'week' ? '4px' : '50%',
              transform: viewMode === 'week' ? 'translateX(0)' : 'translateX(-4px)'
            }}
          />
        </div>
      </div>

      {/* Content with smooth transitions */}
      <div className="flex-1 relative overflow-hidden">
        {/* Weekly View */}
        <div className={`absolute inset-0 transition-all duration-500 ease-out ${
          viewMode === 'week' 
            ? 'opacity-100 translate-x-0' 
            : 'opacity-0 -translate-x-full pointer-events-none'
        }`}>
          <div className="h-full flex flex-col">
            <div className="h-full flex flex-col">
              <p className="text-xs text-white/50 mb-3 uppercase tracking-wide font-semibold">
                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </p>
              
              <WeeklyDatePicker
                currentWeek={currentWeek}
                selectedDay={selectedDay}
                onDaySelect={handleDaySelect}
                dayCircleClasses={dayCircleClasses}
                dayLabelClass={dayLabelClass}
                getSelectedDayClasses={getSelectedDayClasses}
                isDesktop={isDesktop}
              />

              {/* Workout details in same container */}
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <WorkoutLogsList
                  workouts={selectedDay ? currentWorkoutLogs[selectedDay.day] : null}
                  selectedDay={selectedDay}
                  onWorkoutClick={handleWorkoutClick}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 2 Months View */}
        <div className={`absolute inset-0 transition-all duration-500 ease-out ${
          viewMode === 'months' 
            ? 'opacity-100 translate-x-0' 
            : 'opacity-0 translate-x-full pointer-events-none'
        }`}>
          <div className="h-full overflow-hidden flex flex-col">
            <div className={`flex-1 grid grid-cols-2 gap-6 max-h-full`}>
              {calendar3Months.slice(-2).map((monthData) => (
                <div
                  key={`${monthData.month}-${monthData.year}`}
                  onClick={() => onMonthSelect(monthData.month, monthData.year)}
                  className="flex flex-col items-center hover:opacity-80 active:opacity-70 rounded-xl p-2 transition-all duration-200 cursor-pointer min-h-0 overflow-hidden"
                >
                  <div className={isDesktop ? 'text-sm font-semibold text-white/90 mb-4 uppercase tracking-wide text-center' : 'text-sm font-semibold text-white/90 mb-3 uppercase text-center'}>
                    {monthData.monthName}
                  </div>
                  <div className={`${monthGridCols} ${monthGridGap} w-full justify-center items-center mt-2`} style={{ gridAutoRows: isDesktop ? '25px' : '25px' }}>
                    {monthData.days.map((dayData, idx) => {
                      if (dayData.day === null) return <div key={idx} className={monthGridDotSize} />
                      const dotColor = monthDotClass(dayData)
                      return (
                        <div
                          key={idx}
                          className={`${monthGridDotSize} rounded-full ${dotColor} transition-all duration-300 hover:scale-110 mx-auto`}
                          title={dayData.day ? (dayData.isToday ? 'Today' : dayData.isWorkout ? 'Workout day' : 'Rest day') : ''}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
