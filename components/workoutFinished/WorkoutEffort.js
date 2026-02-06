/**
 * WorkoutEffort Component
 * Displays overall session effort with a line graph showing fatigue progression
 * Uses hardcoded sample data for UI preview
 */

// Hardcoded sample data representing effort/fatigue across all reps in a session
// Realistic data with fluctuations - fatigue becomes noticeable around rep 7-8
const SAMPLE_REP_DATA = [
  28, 30, 27, 31, 29, 33, 35, 42, 45, 50, 48, 55, 52, 58, 62
];

// Sample fatigue level: 'Low' | 'Moderate' | 'High'
const SAMPLE_FATIGUE_LEVEL = 'Moderate';

// Fatigue starts at this rep index (0-based) - noticeable fatigue begins around rep 7
const FATIGUE_START_INDEX = 6;

/**
 * WorkoutEffort Component
 * Displays overall session effort with a line graph showing fatigue progression
 */
export default function WorkoutEffort({ setsData, chartData }) {
  // Use sample fatigue level for color determination
  const fatigueLevel = SAMPLE_FATIGUE_LEVEL;
  
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
  
  // Calculate chart points from sample data
  const minValue = Math.min(...SAMPLE_REP_DATA);
  const maxValue = Math.max(...SAMPLE_REP_DATA);
  const range = maxValue - minValue || 20;

  // Generate SVG path points
  const getChartPoint = (value, index) => {
    const x = padding + (index / (SAMPLE_REP_DATA.length - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - ((value - minValue) / range) * (chartHeight - 2 * padding);
    return { x, y };
  };

  // Create the main line path
  const linePath = SAMPLE_REP_DATA.map((value, index) => {
    const { x, y } = getChartPoint(value, index);
    return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');

  // Create the fill path (closed polygon under the line)
  const fillPath = SAMPLE_REP_DATA.map((value, index) => {
    const { x, y } = getChartPoint(value, index);
    return `${x},${y}`;
  }).join(' ');

  // Calculate fatigue highlight region (from FATIGUE_START_INDEX to end)
  const fatigueStartX = getChartPoint(SAMPLE_REP_DATA[FATIGUE_START_INDEX], FATIGUE_START_INDEX).x;
  const fatigueEndX = chartWidth - padding;

  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-5">
      {/* Header - matches Movement Phases title style with Fatigue Level Tabs */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-white">
          Workout Effort (Fatigueness)
        </h3>
        
        {/* Fatigue Level Tabs - upper right */}
        <div className="flex gap-1 bg-black/30 rounded-full p-1">
          <button
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              fatigueLevel === 'Low'
                ? 'bg-emerald-500 text-white'
                : 'text-gray-400'
            }`}
            disabled
          >
            Low
          </button>
          <button
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              fatigueLevel === 'Moderate'
                ? 'bg-orange-500 text-white'
                : 'text-gray-400'
            }`}
            disabled
          >
            Moderate
          </button>
          <button
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              fatigueLevel === 'High'
                ? 'bg-red-500 text-white'
                : 'text-gray-400'
            }`}
            disabled
          >
            High
          </button>
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

            {/* Yellow fatigue highlight region */}
            <rect
              x={fatigueStartX}
              y={0}
              width={fatigueEndX - fatigueStartX}
              height={chartHeight}
              fill="rgba(250, 204, 21, 0.2)"
            />

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
            {SAMPLE_REP_DATA.map((value, index) => {
              const { x, y } = getChartPoint(value, index);
              const isInFatigueZone = index >= FATIGUE_START_INDEX;
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={isInFatigueZone ? '#facc15' : 'white'}
                  stroke={isInFatigueZone ? '#facc15' : '#a855f7'}
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* Rep number labels */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-3 pb-1">
            {SAMPLE_REP_DATA.map((_, idx) => (
              <span key={idx} className="text-[9px] text-gray-500 font-medium">
                {idx + 1}
              </span>
            ))}
          </div>
        </div>

        {/* X-axis label */}
        <div className="text-center mt-2">
          <span className="text-xs text-gray-400">Rep Number</span>
        </div>
      </div>

      {/* Fatigue zone legend - centered */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-white/60">Effort</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-400/40" />
          <span className="text-white/60">Fatigue Zone</span>
        </div>
      </div>
    </div>
  );
}
