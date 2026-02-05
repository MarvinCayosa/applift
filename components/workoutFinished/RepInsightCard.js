export default function RepInsightCard({ repData, repNumber }) {
  const { time, rom, peakVelocity, isClean, chartData, liftingTime, loweringTime } = repData;

  // Calculate lifting/lowering percentages from actual data or use placeholders
  const totalPhaseTime = (liftingTime || 0) + (loweringTime || 0);
  const liftingPercent = totalPhaseTime > 0 
    ? ((liftingTime || 0) / totalPhaseTime * 100).toFixed(1)
    : (35 + Math.random() * 10).toFixed(1); // Placeholder: 35-45%
  const loweringPercent = totalPhaseTime > 0 
    ? ((loweringTime || 0) / totalPhaseTime * 100).toFixed(1)
    : (100 - parseFloat(liftingPercent)).toFixed(1);

  // Placeholder ML confidence (will be replaced by ML model output)
  // Structure: { confidence: number, formQuality: 'clean' | 'uncontrolled', rawScore: number }
  const mlPrediction = {
    confidence: Math.floor(Math.random() * 20) + 75, // Placeholder: 75-95%
    formQuality: isClean ? 'clean' : 'uncontrolled',
    rawScore: isClean ? 0.85 : 0.35 // Placeholder normalized score
  };
  
  // Determine form quality display
  const formQuality = mlPrediction.formQuality === 'clean' ? 'Clean' : 'Uncontrolled';
  const formColor = mlPrediction.formQuality === 'clean'
    ? { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', tint: 'bg-emerald-950/40' }
    : { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', tint: 'bg-amber-950/40' };

  // Placeholder metrics (will be populated from actual rep data or ML)
  const metrics = {
    time: time || (1.5 + Math.random() * 2).toFixed(1), // Placeholder: 1.5-3.5s
    rom: rom || Math.floor(80 + Math.random() * 40), // Placeholder: 80-120°
    peakVelocity: peakVelocity || (3 + Math.random() * 4).toFixed(1) // Placeholder: 3-7 m/s
  };

  return (
    <div className="bg-[#252525] rounded-2xl min-w-full shadow-lg overflow-hidden">
      {/* Top Section - Dark */}
      <div className="p-4">
        {/* Rep number header */}
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-semibold text-white">Rep {repNumber}</h4>
        </div>

        {/* Main content: Chart on left, Progress bar + Metrics on right */}
        <div className="flex gap-4">
          {/* Square chart on the left - shows only this rep's data */}
          <div className="w-20 h-20 flex-shrink-0 bg-[#1a1a1a] rounded-xl overflow-hidden">
            {chartData && chartData.length > 0 ? (
              <svg className="w-full h-full" viewBox="0 0 112 112" preserveAspectRatio="none">
                <defs>
                  <linearGradient id={`repGradient${repNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: mlPrediction.formQuality === 'clean' ? '#10b981' : '#f59e0b', stopOpacity: 0.6 }} />
                    <stop offset="100%" style={{ stopColor: mlPrediction.formQuality === 'clean' ? '#10b981' : '#f59e0b', stopOpacity: 0.05 }} />
                  </linearGradient>
                </defs>
                
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
                
                <polyline
                  points={chartData.map((value, index) => {
                    const x = (index / (chartData.length - 1)) * 112;
                    const normalizedValue = Math.max(0, Math.min(1, value / 20));
                    const y = 112 - (normalizedValue * 92 + 10);
                    return `${x},${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke={mlPrediction.formQuality === 'clean' ? '#10b981' : '#f59e0b'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                
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
                      stroke={mlPrediction.formQuality === 'clean' ? '#10b981' : '#f59e0b'}
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

          {/* Right side: Progress bar pill + Metrics */}
          <div className="flex-1 flex flex-col justify-between">
            {/* Lift/Lower distribution pill - no label */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-cyan-400 min-w-[40px]">{liftingPercent}%</span>
              <div className="flex-1 h-3 rounded-full overflow-hidden flex">
                {/* Lifting (cyan/teal) portion */}
                <div 
                  className="h-full bg-gradient-to-r from-cyan-400 to-teal-400"
                  style={{ width: `${liftingPercent}%` }}
                />
                {/* Lowering (orange) portion */}
                <div 
                  className="h-full bg-gradient-to-r from-yellow-500 to-orange-400"
                  style={{ width: `${loweringPercent}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-orange-400 min-w-[40px] text-right">{loweringPercent}%</span>
            </div>

            {/* Metrics row - Time, ROM, Peak Velocity */}
            <div className="flex justify-between mt-4">
              <div className="text-center">
                <span className="text-xs text-gray-400 block mb-0.5">Time</span>
                <span className="text-base font-bold text-white">{typeof metrics.time === 'number' ? `${metrics.time.toFixed(1)}s` : `${metrics.time}s`}</span>
              </div>
              <div className="text-center">
                <span className="text-xs text-gray-400 block mb-0.5">ROM</span>
                <span className="text-base font-bold text-white">{typeof metrics.rom === 'number' ? `${metrics.rom.toFixed(0)}°` : `${metrics.rom}°`}</span>
              </div>
              <div className="text-center">
                <span className="text-xs text-gray-400 block mb-0.5">Peak Vel.</span>
                <span className="text-base font-bold text-white">{typeof metrics.peakVelocity === 'number' ? `${metrics.peakVelocity.toFixed(1)}m/s` : `${metrics.peakVelocity}m/s`}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section - Different color background based on form quality */}
      <div className={`px-4 py-3 ${formColor.tint}`}>
        {/* Form Quality Badge with ML Confidence */}
        <div className="flex items-center justify-between">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${formColor.bg} ${formColor.border}`}>
            <div className={`w-2 h-2 rounded-full ${mlPrediction.formQuality === 'clean' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className={`text-sm font-medium ${formColor.text}`}>
              {formQuality}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Confidence</span>
            <span className="text-sm font-semibold text-white/80">{mlPrediction.confidence}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
