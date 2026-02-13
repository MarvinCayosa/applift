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

  // Sample chart data for velocity color demo - shows speeding up / slowing down phases
  const sampleChartData = [
    0.5, 1.2, 2.5, 4.5, 7, 9.5, 11.5, 13, 14, 13.5, 12, 9.5, 7, 4.5, 2.5, 1,
    0.5, 1.5, 3.5, 6, 8.5, 11, 13, 14.5, 13, 11, 8.5, 6, 3.5, 1.5, 0.5
  ];
  const displayChartData = (chartData && chartData.length > 0) ? chartData : sampleChartData;

  return (
    <div className="h-full rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10 shadow-xl overflow-hidden flex flex-col">
      {/* Header with Rep number (left) and Classification badge (right) */}
      <div className="px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 lg:pt-6 pb-3 sm:pb-4 flex items-center justify-between flex-shrink-0">
        <h4 className="text-sm sm:text-base lg:text-lg font-semibold text-white">Rep {repNumber}</h4>
        
        {/* Classification Badge with Confidence - Top Right */}
        <div className="inline-flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 lg:px-4 py-1.5 sm:py-2 rounded-full bg-black/60 backdrop-blur-sm border border-white/20">
          <div 
            className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full" 
            style={{ backgroundColor: formColor.primary }}
          />
          <span className="text-xs sm:text-sm lg:text-base font-semibold text-white">
            {formQuality}
          </span>
          <span className="text-xs sm:text-sm lg:text-base font-semibold" style={{ color: formColor.secondary }}>
            {mlPrediction.confidence}%
          </span>
        </div>
      </div>

      {/* Graph Section */}
      <div className="relative px-4 sm:px-5 lg:px-6 pb-4 sm:pb-5 lg:pb-6 flex-shrink-0">
        {/* Graph Container - responsive height */}
        <div className="w-full bg-black/40 rounded-xl overflow-hidden border border-white/10" style={{ height: 'clamp(140px, 35vw, 240px)' }}>
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
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
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
      <div className="px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 lg:pt-6 pb-4 sm:pb-5 lg:pb-6 flex items-center justify-center gap-8 sm:gap-12 lg:gap-16 flex-shrink-0">
        {/* Confidence */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-9 lg:h-9 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-300">Confidence</span>
            <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-white">{mlPrediction.confidence}%</span>
          </div>
        </div>

        {/* Rep Duration */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-9 lg:h-9 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-300">Rep Duration</span>
            <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-white">{metrics.time}s</span>
          </div>
        </div>
      </div>

      {/* Metrics Section - Stacked vertically */}
      <div className="px-4 sm:px-5 lg:px-6 pb-4 sm:pb-5 lg:pb-6 space-y-4 sm:space-y-5 lg:space-y-6 flex-shrink-0">
        {/* Movement Phases - Using same visualization as LiftPhases */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm lg:text-base font-medium text-gray-300">Movement Phases</span>
          </div>
          
          {/* Stacked Horizontal Progress Bar */}
          <div className="relative h-3 sm:h-4 lg:h-5 bg-white/10 rounded-full overflow-hidden">
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
          <div className="flex items-center justify-between pt-1 sm:pt-2">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-1 h-10 sm:h-12 lg:h-14 bg-gradient-to-b from-teal-500 to-cyan-400 rounded-full" />
              <div className="flex flex-col">
                <span className="text-base sm:text-lg lg:text-xl font-bold text-white">{liftingPercent}%</span>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-400">Lifting</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="flex flex-col items-end">
                <span className="text-base sm:text-lg lg:text-xl font-bold text-white">{loweringPercent}%</span>
                <span className="text-[10px] sm:text-xs lg:text-sm text-gray-400">Lowering</span>
              </div>
              <div className="w-1 h-10 sm:h-12 lg:h-14 bg-gradient-to-b from-yellow-500 to-orange-400 rounded-full" />
            </div>
          </div>
        </div>

        {/* Bottom Cards - Two rounded squares side by side */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
          {/* Left Card - Range of Motion with circular progress */}
          <div className="relative bg-black/30 rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 p-3 sm:p-5 lg:p-6 flex flex-col justify-between" style={{ minHeight: 'clamp(140px, 40vw, 280px)' }}>
            {/* Content */}
            <div className="relative z-10">
              <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-300">Range of Motion</span>
            </div>
            <div className="relative z-10 flex items-center justify-center flex-1 min-h-0 py-2 sm:py-3">
              {/* Mini Circular Progress - Larger size */}
              <div className="relative" style={{ width: 'clamp(70px, 22vw, 140px)', height: 'clamp(70px, 22vw, 140px)' }}>
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="6"
                  />
                  
                  {/* Progress circle - solid color */}
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - romProgress / 100)}`}
                    style={{ 
                      transition: 'stroke-dashoffset 1s ease-out'
                    }}
                  />
                </svg>
                
                {/* Percentage text in center */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-white">
                    {Math.round(romProgress)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Card - Peak Velocity with chart background */}
          <div className="relative bg-black/30 rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 p-3 sm:p-5 lg:p-6 flex flex-col justify-between" style={{ minHeight: 'clamp(140px, 40vw, 280px)' }}>
            {/* Mini chart background */}
            <div className="absolute inset-0 opacity-80">
              {displayChartData && displayChartData.length > 0 && (
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`velocityFillGrad${repNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#22c55e', stopOpacity: 0.4 }} />
                      <stop offset="100%" style={{ stopColor: '#ef4444', stopOpacity: 0.05 }} />
                    </linearGradient>
                  </defs>
                  
                  {/* Fill area */}
                  <polygon
                    points={`
                      ${displayChartData.map((value, index) => {
                        const x = (index / (displayChartData.length - 1)) * 100;
                        const normalizedValue = Math.max(0, Math.min(1, Math.abs(value) / 15));
                        const y = 100 - (normalizedValue * 80 + 10);
                        return `${x},${y}`;
                      }).join(' ')}
                      100,100 0,100
                    `}
                    fill={`url(#velocityFillGrad${repNumber})`}
                  />
                  
                  {/* Line segments colored by velocity magnitude: red (slow) → yellow (medium) → green (fast) */}
                  {displayChartData.map((value, index) => {
                    if (index === 0) return null;
                    const prevValue = displayChartData[index - 1];
                    
                    const prevNorm = Math.max(0, Math.min(1, Math.abs(prevValue) / 15));
                    const currNorm = Math.max(0, Math.min(1, Math.abs(value) / 15));
                    const avgNorm = (prevNorm + currNorm) / 2;
                    
                    // 5-level color gradient: red → orange → yellow → lime → green
                    let color;
                    if (avgNorm < 0.2) {
                      color = '#ef4444'; // Red - very slow
                    } else if (avgNorm < 0.4) {
                      color = '#f97316'; // Orange - slow
                    } else if (avgNorm < 0.55) {
                      color = '#eab308'; // Yellow - medium
                    } else if (avgNorm < 0.75) {
                      color = '#84cc16'; // Lime - fast
                    } else {
                      color = '#22c55e'; // Green - very fast
                    }
                    
                    const x1 = ((index - 1) / (displayChartData.length - 1)) * 100;
                    const y1 = 100 - (prevNorm * 80 + 10);
                    const x2 = (index / (displayChartData.length - 1)) * 100;
                    const y2 = 100 - (currNorm * 80 + 10);
                    
                    return (
                      <line
                        key={index}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={color}
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    );
                  })}
                  
                  {/* Peak velocity circle marker */}
                  {(() => {
                    const maxIndex = displayChartData.reduce((maxI, val, i, arr) => Math.abs(val) > Math.abs(arr[maxI]) ? i : maxI, 0);
                    const maxValue = displayChartData[maxIndex];
                    const cx = (maxIndex / (displayChartData.length - 1)) * 100;
                    const normalizedValue = Math.max(0, Math.min(1, Math.abs(maxValue) / 15));
                    const cy = 100 - (normalizedValue * 80 + 10);
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r="4"
                        fill="#22c55e"
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    );
                  })()}
                </svg>
              )}
            </div>
            
            {/* Content overlay */}
            <div className="relative z-10">
              <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-300">Peak Velocity</span>
            </div>
            <div className="relative z-10">
              <span className="text-xl sm:text-3xl lg:text-4xl font-bold text-emerald-400">{metrics.peakVelocity}</span>
              <span className="text-[10px] sm:text-xs lg:text-sm text-gray-400 ml-1">m/s</span>
              <div className="flex items-center gap-1 mt-1 sm:mt-1.5">
                <svg className="w-2.5 sm:w-3.5 lg:w-4 h-2.5 sm:h-3.5 lg:h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                <span className="text-[9px] sm:text-[10px] lg:text-xs text-gray-500">{velocityProgress.toFixed(0)}% of max</span>
              </div>
            </div>
          </div>
        </div>

        {/* Insights below cards */}
        <div className="pt-4 sm:pt-5 lg:pt-6 pb-8 sm:pb-10 lg:pb-12">
          <p className="text-xs sm:text-sm lg:text-base text-purple-300 leading-relaxed text-center">
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
