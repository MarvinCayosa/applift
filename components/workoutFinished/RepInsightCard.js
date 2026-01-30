export default function RepInsightCard({ repData, repNumber }) {
  const { time, rom, peakVelocity, isClean, chartData } = repData;

  return (
    <div className="bg-[#252525] rounded-2xl p-3 min-w-full shadow-lg">
      {/* Rep number header */}
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-sm font-semibold text-white">Rep {repNumber}</h4>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
          isClean 
            ? 'bg-green-500/20 text-green-400' 
            : 'bg-yellow-500/20 text-yellow-400'
        }`}>
          {isClean ? '✓ Clean' : '⚠ Check Form'}
        </span>
      </div>

      {/* Chart on left, metrics on right */}
      <div className="flex gap-3">
        {/* Square chart on the left - smaller */}
        <div className="w-24 h-24 flex-shrink-0 bg-[#1f1f1f] rounded-xl overflow-hidden">
          {chartData && chartData.length > 0 ? (
            <svg className="w-full h-full" viewBox="0 0 112 112" preserveAspectRatio="none">
              <defs>
                {/* Gradient fill like heart rate chart */}
                <linearGradient id={`repGradient${repNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: isClean ? '#10b981' : '#f59e0b', stopOpacity: 0.6 }} />
                  <stop offset="100%" style={{ stopColor: isClean ? '#10b981' : '#f59e0b', stopOpacity: 0.05 }} />
                </linearGradient>
              </defs>
              
              {/* Fill area with smooth gradient */}
              <polygon
                points={`
                  ${chartData.map((value, index) => {
                    const x = (index / (chartData.length - 1)) * 112;
                    const normalizedValue = Math.max(0, Math.min(1, value / 20));
                    const y = 112 - (normalizedValue * 92 + 10);
                    return `${x},${y}`;
                  }).join(' ')}
                  112,112 0,112
                `}
                fill={`url(#repGradient${repNumber})`}
              />
              
              {/* Rep curve - smooth line on top */}
              <polyline
                points={chartData.map((value, index) => {
                  const x = (index / (chartData.length - 1)) * 112;
                  const normalizedValue = Math.max(0, Math.min(1, value / 20));
                  const y = 112 - (normalizedValue * 92 + 10);
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke={isClean ? '#10b981' : '#f59e0b'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* White dot indicator at peak */}
              {(() => {
                const maxIndex = chartData.reduce((maxI, val, i, arr) => val > arr[maxI] ? i : maxI, 0);
                const maxValue = chartData[maxIndex];
                const x = (maxIndex / (chartData.length - 1)) * 112;
                const normalizedValue = Math.max(0, Math.min(1, maxValue / 20));
                const y = 112 - (normalizedValue * 92 + 10);
                return (
                  <circle
                    cx={x}
                    cy={y}
                    r="4"
                    fill="white"
                    stroke={isClean ? '#10b981' : '#f59e0b'}
                    strokeWidth="2"
                  />
                );
              })()}
            </svg>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-xs">
              No data
            </div>
          )}
        </div>

        {/* Metrics on the right - values beside labels */}
        <div className="flex-1 flex flex-col justify-center space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-gray-400">Time:</span>
            <span className="text-sm font-bold text-white">{time ? `${time.toFixed(1)}s` : '-'}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-gray-400">ROM:</span>
            <span className="text-sm font-bold text-white">{rom ? `${rom.toFixed(0)}°` : '-'}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-gray-400">Peak Velocity:</span>
            <span className="text-sm font-bold text-white">{peakVelocity ? `${peakVelocity.toFixed(1)}m/s` : '-'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
