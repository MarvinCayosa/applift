import React, { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from 'recharts'

/**
 * EquipmentDistributionCard - Shows distribution of exercises per equipment type
 * Modern donut chart with smooth animations and hover effects
 * Backend-ready component that accepts equipment data as props
 * Compact half-width card design (300px height)
 * 
 * @param {Object} props
 * @param {Array} props.data - Array of equipment data: [{ name: 'Dumbbell', value: 45, icon: '🏋️' }, ...]
 * @param {string} props.period - The time period (default: 'This Month')
 */
export default function EquipmentDistributionCard({ 
  data = [],
  period = 'This Month',
}) {
  const [activeIndex, setActiveIndex] = useState(null)

  // Default mock data with distinct contrasting colors on pastel violet
  const defaultData = [
    { name: 'Dumbbell', value: 45, color: '#FF4D4D' },     // Red
    { name: 'Barbell', value: 30, color: '#3B82F6' },      // Blue  
    { name: 'Weight Stack', value: 25, color: '#FBBF24' }, // Yellow
  ]

  const equipmentData = data.length > 0 ? data : defaultData
  const totalExercises = equipmentData.reduce((sum, item) => sum + item.value, 0)
  const hasData = totalExercises > 0

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
    <div className="rounded-2xl p-2 h-[300px] flex flex-col bg-white/10">
      {/* Header */}
      <div className="mb-1">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wide">
          Equipment Distribution
        </h3>
        <p className="text-[10px] text-white/60">{period}</p>
      </div>

      {hasData ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Donut Chart - No center text, with scale animation on hover */}
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
                  animationBegin={0}
                  animationDuration={600}
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
          </div>

          {/* Legend - compact */}
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
                  {/* Left: Color dot and name */}
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

                  {/* Right: Percentage */}
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
