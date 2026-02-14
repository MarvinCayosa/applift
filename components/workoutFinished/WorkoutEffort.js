/**
 * WorkoutEffort Component
 * Displays overall session effort with a line graph showing fatigue progression
 * Highlights the most fatigued rep with an orange indicator
 */

export default function WorkoutEffort({ setsData, chartData }) {
  // Extract rep-by-rep effort data from setsData
  let repEffortData = [];
  let fatigueLevel = 'Moderate'; // Default
  
  if (setsData && setsData.length > 0) {
    // Collect all reps across all sets
    setsData.forEach(set => {
      if (set.repsData && Array.isArray(set.repsData)) {
        set.repsData.forEach(rep => {
          // Use peak velocity or time as effort indicator (higher = more effort/fatigue)
          // We'll simulate effort as increasing over time with some variance
          const effortValue = rep.peakVelocity ? parseFloat(rep.peakVelocity) * 10 : 
                             rep.time ? parseFloat(rep.time) * 15 : 
                             20 + Math.random() * 40;
          repEffortData.push(effortValue);
        });
      }
    });
    
    // Calculate fatigue level based on progression
    if (repEffortData.length > 0) {
      const firstThird = repEffortData.slice(0, Math.floor(repEffortData.length / 3));
      const lastThird = repEffortData.slice(-Math.floor(repEffortData.length / 3));
      const avgFirst = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
      const avgLast = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
      const increase = ((avgLast - avgFirst) / avgFirst) * 100;
      
      if (increase > 50) fatigueLevel = 'High';
      else if (increase > 25) fatigueLevel = 'Moderate';
      else fatigueLevel = 'Low';
    }
  }
  
  // Fallback to sample data if no real data available
  if (repEffortData.length === 0) {
    repEffortData = [28, 30, 27, 31, 29, 33, 35, 42, 45, 50, 48, 55, 52, 58, 62];
  }
  
  // Find the index of the most fatigued rep (highest value)
  const maxEffortIndex = repEffortData.reduce((maxIdx, val, idx, arr) => 
    val > arr[maxIdx] ? idx : maxIdx, 0
  );
  
  // Color schemes based on fatigue level
  const levelColors = {
    Low: { text: 'text-emerald-400', bg: 'bg-emerald-500/20' },
    Moderate: { text: 'text-orange-400', bg: 'bg-orange-500/20' },
    High: { text: 'text-red-400', bg: 'bg-red-500/20' }
  };

  const currentColor = levelColors[fatigueLevel] || levelColors.Moderate;

  // Chart dimensions
  const chartWidth = 400;
  const chartHeight = 100;
  const padding = 10;
  
  // Calculate chart points from rep effort data
  const minValue = Math.min(...repEffortData);
  const maxValue = Math.max(...repEffortData);
  const range = maxValue - minValue || 20;

  // Generate SVG path points
  const getChartPoint = (value, index) => {
    const x = padding + (index / (repEffortData.length - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - ((value - minValue) / range) * (chartHeight - 2 * padding);
    return { x, y };
  };

  // Create the main line path
  const linePath = repEffortData.map((value, index) => {
    const { x, y } = getChartPoint(value, index);
    return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');

  // Create the fill path (closed polygon under the line)
  const fillPath = repEffortData.map((value, index) => {
    const { x, y } = getChartPoint(value, index);
    return `${x},${y}`;
  }).join(' ');

  // Get position of the most fatigued rep for highlighting
  const maxPoint = getChartPoint(repEffortData[maxEffortIndex], maxEffortIndex);

  return (
    <div className="rounded-3xl bg-white/5 backdrop-blur-sm p-5 content-fade-up-2">
      {/* Header - matches Movement Phases title style with single Fatigue Level badge */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">
          Workout Effort
        </h3>
        
        {/* Single Fatigue Level Badge - filled style like set tabs */}
        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
          fatigueLevel === 'Low'
            ? 'bg-green-600 text-white'
            : fatigueLevel === 'Moderate'
              ? 'bg-orange-500 text-white'
              : 'bg-red-500 text-white'
        }`}>
          {fatigueLevel}
        </div>
      </div>

      {/* Main content: Line Graph */}
      <div className="mb-3">

        {/* Line Graph - All reps on x-axis */}
        <div className="relative bg-black/30 rounded-xl p-3" style={{ height: '120px' }}>
          <svg 
            className="w-full h-full" 
            viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
            preserveAspectRatio="none"
          >
            <defs>
              {/* Purple gradient for line fill */}
              <linearGradient id="effortGradientPurple" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#a855f7', stopOpacity: 0.4 }} />
                <stop offset="100%" style={{ stopColor: '#a855f7', stopOpacity: 0.05 }} />
              </linearGradient>
            </defs>

            {/* Gradient fill area under the line */}
            <polygon
              points={`
                ${fillPath}
                ${chartWidth - padding},${chartHeight - padding} 
                ${padding},${chartHeight - padding}
              `}
              fill="url(#effortGradientPurple)"
            />

            {/* Purple line */}
            <path
              d={linePath}
              fill="none"
              stroke="#a855f7"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points on the line */}
            {repEffortData.map((value, index) => {
              const { x, y } = getChartPoint(value, index);
              const isMostFatigued = index === maxEffortIndex;
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r={isMostFatigued ? "5" : "3"}
                  fill={isMostFatigued ? '#f97316' : 'white'}
                  stroke={isMostFatigued ? '#f97316' : '#a855f7'}
                  strokeWidth={isMostFatigued ? "3" : "2"}
                  style={isMostFatigued ? { filter: 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.8))' } : {}}
                />
              );
            })}
            
            {/* Orange highlight indicator for most fatigued rep */}
            {maxPoint && (
              <>
                {/* Vertical line from point to top */}
                <line
                  x1={maxPoint.x}
                  y1={maxPoint.y}
                  x2={maxPoint.x}
                  y2={padding}
                  stroke="#f97316"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                  opacity="0.6"
                />
                {/* Arrow/marker at top */}
                <polygon
                  points={`${maxPoint.x},${padding - 5} ${maxPoint.x - 4},${padding + 3} ${maxPoint.x + 4},${padding + 3}`}
                  fill="#f97316"
                />
              </>
            )}
          </svg>

          {/* Rep number labels */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-3 pb-1">
            {repEffortData.map((_, idx) => (
              <span key={idx} className={`text-[9px] font-medium ${
                idx === maxEffortIndex ? 'text-orange-500' : 'text-gray-500'
              }`}>
                {idx + 1}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Fatigue Insight - centered */}
      <div className="px-3 py-2.5 bg-white/5 rounded-xl">
        <p className="text-xs sm:text-sm text-center leading-relaxed">
          {fatigueLevel === 'High' ? (
            <span className="text-red-300">
              High fatigue detected. Your effort increased significantly throughout the workout. Consider more rest between sets.
            </span>
          ) : fatigueLevel === 'Moderate' ? (
            <span className="text-orange-300">
              Moderate fatigue progression. You maintained good consistency with a natural increase in effort.
            </span>
          ) : (
            <span className="text-green-400">
              Excellent endurance! Your effort remained stable throughout the workout with minimal fatigue.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
