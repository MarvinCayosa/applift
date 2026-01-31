import React, { useState, useRef, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Sector, BarChart, Bar, XAxis } from 'recharts'

/**
 * EquipmentDistributionCard - Shows distribution of exercises per equipment type
 * Modern donut chart and bar graph with carousel navigation
 * Backend-ready component that accepts equipment data as props
 * Compact half-width card design (300px height)
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of equipment data: [{ name: 'Dumbbell', value: 45, icon: '🏋️' }, ...]
 * @param {string} props.period - The time period (default: 'This Month')
 * @param {boolean} props.animate - Whether to trigger chart animations (default: false)
 */
export default function EquipmentDistributionCard({ 
  data = [],
  period = 'This Month',
  animate = false,
}) {
  const [activeIndex, setActiveIndex] = useState(null)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const carouselRef = useRef(null)

  // Default mock data with distinct contrasting colors
  const defaultData = [
    { name: 'Dumbbell', value: 45, color: '#3b82f6' },     // Blue
    { name: 'Barbell', value: 30, color: '#ef4444' },      // Red
    { name: 'Stack', value: 25, color: '#eab308' }, // Yellow
  ]

  const equipmentData = data.length > 0 ? data : defaultData
  const totalExercises = equipmentData.reduce((sum, item) => sum + item.value, 0)
  const hasData = totalExercises > 0

  // Carousel navigation
  const scrollToCarouselIndex = (index) => {
    const carousel = carouselRef.current
    if (!carousel) return
    const child = carousel.children?.[index]
    if (!child) return
    const left = child.offsetLeft - (carousel.clientWidth - child.clientWidth) / 2
    try {
      carousel.scrollTo({ left, behavior: 'smooth' })
    } catch (_) {
      carousel.scrollLeft = left
    }
    setCarouselIndex(index)
  }

  // Handle carousel scroll
  useEffect(() => {
    const carousel = carouselRef.current
    if (!carousel) return

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft
      const cardWidth = carousel.clientWidth
      const activeIndex = Math.round(scrollLeft / cardWidth)
      setCarouselIndex(activeIndex)
    }

    carousel.addEventListener('scroll', handleScroll)
    return () => carousel.removeEventListener('scroll', handleScroll)
  }, [])

  // Custom bar component for the bar chart
  const CustomBar = (props) => {
    const { payload, x, y, width, height } = props
    if (!payload) return null

    return (
      <g>
        {/* Bar */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={payload.color}
          rx={4}
          ry={4}
        />
        {/* Value label on top */}
        <text
          x={x + width / 2}
          y={y - 8}
          fill="white"
          textAnchor="middle"
          fontSize="12"
          fontWeight="bold"
        >
          {payload.value}
        </text>
      </g>
    )
  }

  // Custom active shape for hover effect
  const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props

    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 4}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          cornerRadius={6}
          stroke="none"
          style={{
            transition: 'all 0.3s ease'
          }}
        />
      </g>
    )
  }

  const onPieEnter = (_, index) => {
    setActiveIndex(index)
  }

  const onPieLeave = () => {
    setActiveIndex(null)
  }

  return (
    <div className="rounded-2xl p-3 h-[300px] flex flex-col bg-white/10 overflow-hidden">
      {/* Header */}
      <div className="mb-1 flex-shrink-0">
        <h3 className="text-xs font-semibold text-white tracking-wide">
          Equipment Distribution
        </h3>
        <p className="text-[10px] text-white/60">{period}</p>
      </div>

      {hasData ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Carousel Container */}
          <div 
            ref={carouselRef}
            className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* Slide 1: Pie Chart */}
            <div className="w-full flex-shrink-0 snap-center flex flex-col min-h-0 overflow-hidden">
              {/* Donut Chart */}
              <div 
                className="relative flex-shrink-0 transition-transform duration-300 ease-out" 
                style={{ 
                  height: '160px',
                  transform: activeIndex !== null ? 'scale(1.05)' : 'scale(1)'
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      activeIndex={activeIndex}
                      activeShape={renderActiveShape}
                      data={equipmentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={4}
                      dataKey="value"
                      onMouseEnter={onPieEnter}
                      onMouseLeave={onPieLeave}
                      animationBegin={animate ? 0 : 0}
                      animationDuration={animate ? 600 : 0}
                      animationEasing="ease-out"
                      cornerRadius={6}
                      stroke="none"
                    >
                      {equipmentData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.color}
                          stroke="none"
                          style={{
                            filter: activeIndex === index 
                              ? 'brightness(1.15)' 
                              : activeIndex !== null 
                                ? 'brightness(0.85)' 
                                : 'brightness(1)',
                            transition: 'all 0.3s ease',
                            cursor: 'pointer'
                          }}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Icon */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <img 
                    src="/svg/workout-figure.svg" 
                    alt="Workout" 
                    className="w-8 h-8"
                  />
                </div>
              </div>

              {/* Legend */}
              <div className="flex-1 flex flex-col justify-center space-y-0.5 min-h-0 overflow-hidden">
                {equipmentData.map((item, index) => {
                  const percentage = ((item.value / totalExercises) * 100).toFixed(0)
                  const isActive = activeIndex === index

                  return (
                    <button
                      key={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                      className={`w-full flex items-center justify-between px-2 rounded-lg transition-all duration-300 ${
                        isActive 
                          ? 'bg-white/25 scale-[1.02]' 
                          : 'bg-transparent hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-300 ${
                            isActive ? 'scale-125' : ''
                          }`}
                          style={{ backgroundColor: item.color }}
                        />
                        <span className={`text-[11px] transition-all duration-300 ${
                          isActive ? 'text-white' : 'text-white/80'
                        }`}>
                          {item.name}
                        </span>
                      </div>
                      <span 
                        className={`text-[11px] transition-all duration-300 ${
                          isActive ? 'text-white scale-110' : 'text-white/70'
                        }`}
                      >
                        {percentage}%
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Slide 2: Bar Chart */}
            <div className="w-full flex-shrink-0 snap-center flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 flex flex-col justify-center overflow-hidden">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={equipmentData}
                    margin={{ top: 30, right: 0, left: 0, bottom: 5 }}
                    barCategoryGap="40%"
                  >
                    <defs>
                      <pattern id="gridPattern" patternUnits="userSpaceOnUse" width="12" height="12">
                        <path d="M 12,0 l 0,12 M 0,12 l 12,0" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
                      </pattern>
                    </defs>
                    {/* Full chart background with grid */}
                    <rect
                      x={0}
                      y={0}
                      width="100%"
                      height="100%"
                      fill="url(#gridPattern)"
                      opacity={0.3}
                    />
                    <XAxis 
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ 
                        fill: 'rgba(255,255,255,0.7)', 
                        fontSize: 10, 
                        fontWeight: 500 
                      }}
                    />
                    <Bar 
                      dataKey="value" 
                      shape={CustomBar}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                      animationBegin={animate ? 200 : 0}
                      animationDuration={animate ? 800 : 0}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Carousel Indicators */}
          <div className="flex justify-center gap-1.5 mt-2 flex-shrink-0">
            {Array.from({ length: 2 }).map((_, index) => (
              <button
                key={index}
                onClick={() => scrollToCarouselIndex(index)}
                className={`${
                  index === carouselIndex 
                    ? 'bg-white w-4 h-1.5' 
                    : 'bg-white/30 w-1.5 h-1.5'
                } rounded-full transition-all duration-300`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-2xl mb-2">📊</div>
          <div className="text-[10px] text-white/60">No data yet</div>
        </div>
      )}
    </div>
  )
}
