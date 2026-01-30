import { useState } from 'react';

export default function OverallChartCard({ chartData, timeData, setsData }) {
  const [hoveredSet, setHoveredSet] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Define colors for different sets - distinct colors
  const setColors = [
    { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.6)' },    // Purple - Set 1
    { stroke: '#eab308', fill: 'rgba(234, 179, 8, 0.6)' },     // Yellow - Set 2
    { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.6)' },     // Red - Set 3
    { stroke: '#22c55e', fill: 'rgba(34, 197, 94, 0.6)' },     // Green - Set 4
    { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.6)' },    // Blue - Set 5
    { stroke: '#f97316', fill: 'rgba(249, 115, 22, 0.6)' },    // Orange - Set 6
  ];

  // Calculate set boundaries based on actual set data
  const getSetSegments = () => {
    if (!setsData || setsData.length === 0 || !chartData) {
      return [{ startIndex: 0, endIndex: chartData?.length - 1 || 0, setNumber: 1, color: setColors[0], data: chartData }];
    }

    const segments = [];
    let currentIndex = 0;

    setsData.forEach((set, idx) => {
      // Use the actual chartData from each set if available
      const setChartData = set.chartData || [];
      const dataLength = setChartData.length || Math.floor(chartData.length / setsData.length);
      const endIndex = idx === setsData.length - 1 ? chartData.length - 1 : currentIndex + dataLength - 1;
      
      segments.push({
        startIndex: currentIndex,
        endIndex: endIndex,
        setNumber: set.setNumber || idx + 1,
        color: setColors[idx % setColors.length],
        data: setChartData.length > 0 ? setChartData : chartData.slice(currentIndex, endIndex + 1)
      });
      
      currentIndex = endIndex + 1;
    });

    return segments;
  };

  const segments = getSetSegments();

  const handleMouseMove = (e, setNumber) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ 
      x: e.clientX - rect.left, 
      y: e.clientY - rect.top 
    });
    setHoveredSet(setNumber);
  };

  return (
    <div className="bg-[#1a1a1a] rounded-2xl p-3 shadow-xl">
      <h3 className="text-sm font-medium text-gray-400 mb-1.5">Workout Session</h3>
      
      {/* Chart visualization */}
      <div 
        className="relative h-24 rounded-xl overflow-hidden"
        onMouseLeave={() => setHoveredSet(null)}
      >
        {chartData && chartData.length > 0 ? (
          <>
            <svg className="w-full h-full" viewBox="0 0 400 96" preserveAspectRatio="none">
              {/* Subtle grid lines */}
              <line x1="0" y1="24" x2="400" y2="24" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="48" x2="400" y2="48" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              <line x1="0" y1="72" x2="400" y2="72" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
              
              {/* Render each set segment with different colors */}
              {segments.map((segment, idx) => {
                const segmentData = chartData.slice(segment.startIndex, segment.endIndex + 1);
                
                // Calculate points for this segment
                const points = segmentData.map((value, index) => {
                  const actualIndex = segment.startIndex + index;
                  const x = (actualIndex / (chartData.length - 1)) * 400;
                  const normalizedValue = Math.max(0, Math.min(1, value / 20));
                  const y = 96 - (normalizedValue * 76 + 10);
                  return `${x},${y}`;
                }).join(' ');

                const startX = (segment.startIndex / (chartData.length - 1)) * 400;
                const endX = (segment.endIndex / (chartData.length - 1)) * 400;

                return (
                  <g key={idx}>
                    {/* Fill area */}
                    <polygon
                      points={`${points} ${endX},96 ${startX},96`}
                      fill={segment.color.fill}
                      opacity={hoveredSet === segment.setNumber ? 0.8 : 0.5}
                      style={{ transition: 'opacity 0.2s' }}
                    />
                    
                    {/* Line */}
                    <polyline
                      points={points}
                      fill="none"
                      stroke={segment.color.stroke}
                      strokeWidth={hoveredSet === segment.setNumber ? 4 : 3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ 
                        filter: `drop-shadow(0 0 ${hoveredSet === segment.setNumber ? 12 : 8}px ${segment.color.stroke}80)`,
                        transition: 'all 0.2s'
                      }}
                    />

                    {/* Invisible hover area */}
                    <rect
                      x={startX}
                      y="0"
                      width={endX - startX}
                      height="96"
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseMove={(e) => handleMouseMove(e, segment.setNumber)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {hoveredSet !== null && (
              <div 
                className="absolute bg-black/90 text-white px-3 py-1.5 rounded-lg text-xs font-medium pointer-events-none border border-white/20"
                style={{ 
                  left: `${tooltipPos.x}px`, 
                  top: `${tooltipPos.y - 40}px`,
                  transform: 'translateX(-50%)'
                }}
              >
                Set {hoveredSet}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No data recorded
          </div>
        )}
      </div>
      
      {/* Time axis labels */}
      <div className="flex justify-between text-xs text-gray-500">
        <span>0s</span>
        {timeData && timeData.length > 0 && (
          <span>{Math.round(timeData[timeData.length - 1])}s</span>
        )}
      </div>
    </div>
  );
}
