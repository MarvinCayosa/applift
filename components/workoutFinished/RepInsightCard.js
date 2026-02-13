export default function RepInsightCard({ repData, repNumber }) {
  const { time, rom, peakVelocity, chartData, liftingTime, loweringTime } = repData;

  // Calculate lifting/lowering percentages from actual data or use placeholders
  const totalPhaseTime = (liftingTime || 0) + (loweringTime || 0);
  const liftingPercent = totalPhaseTime > 0 
    ? ((liftingTime || 0) / totalPhaseTime * 100).toFixed(1)
    : (35 + Math.random() * 10).toFixed(1); // Placeholder: 35-45%
  const loweringPercent = totalPhaseTime > 0 
    ? ((loweringTime || 0) / totalPhaseTime * 100).toFixed(1)
    : (100 - parseFloat(liftingPercent)).toFixed(1);

  // Mock data for UI preview: Rep 1 is "Clean", all others are "Uncontrolled"
  const isFirstRep = repNumber === 1;
  const mlPrediction = {
    confidence: isFirstRep ? 92 : 82,
    formQuality: isFirstRep ? 'clean' : 'uncontrolled'
  };
  
  // Determine form quality display
  const formQuality = mlPrediction.formQuality === 'clean' ? 'Clean' : 'Uncontrolled';
  const formColor = mlPrediction.formQuality === 'clean'
    ? { primary: '#10b981', secondary: '#34d399' }
    : { primary: '#f59e0b', secondary: '#fbbf24' };

  // Placeholder metrics
  const metrics = {
    time: time || (1.5 + Math.random() * 2).toFixed(1),
    rom: rom || Math.floor(80 + Math.random() * 40), // Actual ROM achieved
    expectedRom: 120, // Expected/target ROM
    peakVelocity: peakVelocity != null ? parseFloat(peakVelocity).toFixed(2) : (3 + Math.random() * 4).toFixed(2)
  };

  // Calculate ROM progress percentage
  const romProgress = Math.min(100, (metrics.rom / metrics.expectedRom) * 100);

  // Peak velocity normalized (0-10 m/s scale)
  const velocityProgress = Math.min(100, (parseFloat(metrics.peakVelocity) / 10) * 100);

  return (
    <div className="h-full bg-[#1a1a1a] rounded-2xl shadow-xl overflow-hidden border border-white/10 flex flex-col">
      {/* Header with Rep number (left) and Classification badge (right) */}
      <div className="px-4 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-3 flex items-center justify-between flex-shrink-0">
        <h4 className="text-sm sm:text-base font-semibold text-white">Rep {repNumber}</h4>
        
        {/* Classification Badge - Top Right */}
        <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/20">
          <div 
            className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full" 
            style={{ backgroundColor: formColor.primary }}
          />
          <span className="text-xs sm:text-sm font-semibold text-white">
            {formQuality}
          </span>
        </div>
      </div>

      {/* Graph Section */}
      <div className="relative px-4 sm:px-5 pb-2 flex-shrink-0">
        {/* Graph Container - responsive height */}
        <div className="w-full bg-black/40 rounded-xl overflow-hidden border border-white/10" style={{ height: 'clamp(150px, 45vw, 200px)' }}>
          {chartData && chartData.length > 0 ? (
            <svg className="w-full h-full" viewBox="0 0 400 140" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`repGradient${repNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: formColor.primary, stopOpacity: 0.5 }} />
                  <stop offset="100%" style={{ stopColor: formColor.primary, stopOpacity: 0.05 }} />
                </linearGradient>
              </defs>
              
              {/* Grid lines */}
              <line x1="0" y1="35" x2="400" y2="35" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <line x1="0" y1="70" x2="400" y2="70" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <line x1="0" y1="105" x2="400" y2="105" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              
              <polygon
                points={`
                  ${chartData.map((value, index) => {
                    const x = (index / (chartData.length - 1)) * 400;
                    const normalizedValue = Math.max(0, Math.min(1, Math.abs(value) / 15));
                    const y = 140 - (normalizedValue * 120 + 10);
                    return `${x},${y}`;
                  }).join(' ')}
                  400,140 0,140
                `}
                fill={`url(#repGradient${repNumber})`}
              />
              
              <polyline
                points={chartData.map((value, index) => {
                  const x = (index / (chartData.length - 1)) * 400;
                  const normalizedValue = Math.max(0, Math.min(1, Math.abs(value) / 15));
                  const y = 140 - (normalizedValue * 120 + 10);
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke={formColor.primary}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ filter: `drop-shadow(0 0 8px ${formColor.primary})` }}
              />
              
              {(() => {
                const maxIndex = chartData.reduce((maxI, val, i, arr) => Math.abs(val) > Math.abs(arr[maxI]) ? i : maxI, 0);
                const maxValue = chartData[maxIndex];
                const x = (maxIndex / (chartData.length - 1)) * 400;
                const normalizedValue = Math.max(0, Math.min(1, Math.abs(maxValue) / 15));
                const y = 140 - (normalizedValue * 120 + 10);
                return (
                  <circle
                    cx={x}
                    cy={y}
                    r="5"
                    fill="white"
                    stroke={formColor.primary}
                    strokeWidth="2.5"
                  />
                );
              })()}
            </svg>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Stats Bar - Confidence and Rep Duration */}
      <div className="px-4 sm:px-5 pt-4 pb-4 flex items-center justify-around flex-shrink-0">
        {/* Confidence */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm font-medium text-gray-300">Confidence</span>
            <span className="text-xl sm:text-2xl font-bold text-white">{mlPrediction.confidence}%</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-12 bg-white/10"></div>

        {/* Rep Duration */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-xs sm:text-sm font-medium text-gray-300">Rep Duration</span>
            <span className="text-xl sm:text-2xl font-bold text-white">{metrics.time}s</span>
          </div>
        </div>
      </div>

      {/* Metrics Section - Stacked vertically */}
      <div className="px-4 sm:px-5 pb-6 sm:pb-8 space-y-3 sm:space-y-4 flex-1">
        {/* Movement Phases - Using same visualization as LiftPhases */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm font-medium text-gray-300">Movement Phases</span>
          </div>
          
          {/* Stacked Horizontal Progress Bar */}
          <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
            {/* Concentric (Lifting) portion */}
            <div 
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-500"
              style={{ width: `${liftingPercent}%` }}
            />
            {/* Eccentric (Lowering) portion */}
            <div 
              className="absolute inset-y-0 bg-gradient-to-r from-yellow-500 to-orange-400 transition-all duration-500"
              style={{ left: `${liftingPercent}%`, right: 0 }}
            />
          </div>

          {/* Labels below progress bar */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-teal-500 to-cyan-400 rounded-full" />
              <div className="flex flex-col">
                <span className="text-base sm:text-lg font-bold text-white">{liftingPercent}%</span>
                <span className="text-[10px] sm:text-xs text-gray-400">Lifting</span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex flex-col items-end">
                <span className="text-base sm:text-lg font-bold text-white">{loweringPercent}%</span>
                <span className="text-[10px] sm:text-xs text-gray-400">Lowering</span>
              </div>
              <div className="w-1 h-8 sm:h-10 bg-gradient-to-b from-yellow-500 to-orange-400 rounded-full" />
            </div>
          </div>
        </div>

        {/* Bottom Cards - Two rounded squares side by side */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1">
          {/* Left Card - Range of Motion with circular progress */}
          <div className="relative bg-[#1f1f1f] rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 p-3 sm:p-4 aspect-square flex flex-col justify-between">
            {/* Content */}
            <div className="relative z-10">
              <span className="text-xs sm:text-sm font-medium text-gray-300">Range of Motion</span>
            </div>
            <div className="relative z-10 flex items-center justify-center flex-1">
              {/* Mini Circular Progress */}
              <div className="relative w-20 h-20 sm:w-24 sm:h-24">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="7"
                  />
                  
                  {/* Progress circle - solid color like dashboard */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 38}`}
                    strokeDashoffset={`${2 * Math.PI * 38 * (1 - romProgress / 100)}`}
                    style={{ 
                      transition: 'stroke-dashoffset 1s ease-out'
                    }}
                  />
                </svg>
                
                {/* Percentage text in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl font-bold text-white">
                    {Math.round(romProgress)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Card - Peak Velocity with chart background */}
          <div className="relative bg-[#1f1f1f] rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 p-3 sm:p-4 aspect-square flex flex-col justify-between">
            {/* Mini chart background */}
            <div className="absolute inset-0 opacity-30">
              {chartData && chartData.length > 0 && (
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`velocityGrad${repNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#a855f7', stopOpacity: 0.6 }} />
                      <stop offset="100%" style={{ stopColor: '#a855f7', stopOpacity: 0 }} />
                    </linearGradient>
                  </defs>
                  <polygon
                    points={`
                      ${chartData.map((value, index) => {
                        const x = (index / (chartData.length - 1)) * 100;
                        const normalizedValue = Math.max(0, Math.min(1, Math.abs(value) / 15));
                        const y = 100 - (normalizedValue * 80 + 10);
                        return `${x},${y}`;
                      }).join(' ')}
                      100,100 0,100
                    `}
                    fill={`url(#velocityGrad${repNumber})`}
                  />
                  <polyline
                    points={chartData.map((value, index) => {
                      const x = (index / (chartData.length - 1)) * 100;
                      const normalizedValue = Math.max(0, Math.min(1, Math.abs(value) / 15));
                      const y = 100 - (normalizedValue * 80 + 10);
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#a855f7"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Peak velocity circle marker */}
                  {(() => {
                    const maxIndex = chartData.reduce((maxI, val, i, arr) => Math.abs(val) > Math.abs(arr[maxI]) ? i : maxI, 0);
                    const maxValue = chartData[maxIndex];
                    const cx = (maxIndex / (chartData.length - 1)) * 100;
                    const normalizedValue = Math.max(0, Math.min(1, Math.abs(maxValue) / 15));
                    const cy = 100 - (normalizedValue * 80 + 10);
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r="4"
                        fill="#a855f7"
                        stroke="white"
                        strokeWidth="1.5"
                        style={{ filter: 'drop-shadow(0 0 4px #a855f7)' }}
                      />
                    );
                  })()}
                </svg>
              )}
            </div>
            
            {/* Content overlay */}
            <div className="relative z-10">
              <span className="text-xs sm:text-sm font-medium text-gray-300">Peak Velocity</span>
            </div>
            <div className="relative z-10">
              <span className="text-2xl sm:text-3xl font-bold text-purple-400">{metrics.peakVelocity}</span>
              <span className="text-xs sm:text-sm text-gray-400 ml-1">m/s</span>
              <div className="flex items-center gap-1 mt-0.5 sm:mt-1">
                <svg className="w-2.5 sm:w-3 h-2.5 sm:h-3 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-[9px] sm:text-[10px] text-gray-500">{velocityProgress.toFixed(0)}% of max</span>
              </div>
            </div>
          </div>
        </div>

        {/* Insights below cards */}
        <div className="mt-3 sm:mt-4 mb-6 sm:mb-8 px-2 py-3 bg-white/5 rounded-xl border border-white/10">
          <p className="text-xs sm:text-sm text-purple-300 leading-relaxed text-center">
            {romProgress >= 90 && velocityProgress >= 70
              ? '🎯 Excellent form! Great depth and explosive power combination.'
              : romProgress >= 90
              ? '💪 Perfect depth achieved! Try increasing velocity for more power.'
              : velocityProgress >= 70
              ? '⚡ Great power output! Focus on achieving deeper range of motion.'
              : romProgress >= 70
              ? 'Good movement. Work on both depth and speed for optimal results.'
              : 'Focus on controlled, deeper movements with consistent velocity.'}
          </p>
        </div>
      </div>
    </div>
  );
}
