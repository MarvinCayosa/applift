export default function OverallChartCard({ chartData, timeData }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Workout Session</h3>
      
      {/* Chart visualization */}
      <div className="relative h-48 bg-gray-50 rounded-xl overflow-hidden">
        {chartData && chartData.length > 0 ? (
          <svg className="w-full h-full" viewBox="0 0 400 180" preserveAspectRatio="none">
            {/* Grid lines */}
            <line x1="0" y1="45" x2="400" y2="45" stroke="#e5e7eb" strokeWidth="1" />
            <line x1="0" y1="90" x2="400" y2="90" stroke="#e5e7eb" strokeWidth="1" />
            <line x1="0" y1="135" x2="400" y2="135" stroke="#e5e7eb" strokeWidth="1" />
            
            {/* Acceleration curve */}
            <polyline
              points={chartData.map((value, index) => {
                const x = (index / (chartData.length - 1)) * 400;
                const normalizedValue = Math.max(0, Math.min(1, value / 20)); // Normalize 0-20m/s²
                const y = 180 - (normalizedValue * 160 + 10);
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Fill area under curve */}
            <polygon
              points={`
                ${chartData.map((value, index) => {
                  const x = (index / (chartData.length - 1)) * 400;
                  const normalizedValue = Math.max(0, Math.min(1, value / 20));
                  const y = 180 - (normalizedValue * 160 + 10);
                  return `${x},${y}`;
                }).join(' ')}
                400,180 0,180
              `}
              fill="url(#gradient)"
              opacity="0.2"
            />
            
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.1" />
              </linearGradient>
            </defs>
          </svg>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No data recorded
          </div>
        )}
      </div>
      
      {/* Time axis labels */}
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>0s</span>
        {timeData && timeData.length > 0 && (
          <span>{Math.round(timeData[timeData.length - 1])}s</span>
        )}
      </div>
    </div>
  );
}
