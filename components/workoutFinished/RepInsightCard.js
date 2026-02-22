import { useState } from 'react';

export default function RepInsightCard({ repData, repNumber }) {
  const { time, rom, peakVelocity, chartData, liftingTime, loweringTime, classification, smoothnessScore } = repData;
  const [showConfidenceOverlay, setShowConfidenceOverlay] = useState(false);

  // Calculate lifting/lowering percentages from actual data
  const totalPhaseTime = (liftingTime || 0) + (loweringTime || 0);
  const hasPhaseData = totalPhaseTime > 0;
  const liftingPercent = hasPhaseData
    ? ((liftingTime || 0) / totalPhaseTime * 100).toFixed(1)
    : null;
  const loweringPercent = hasPhaseData
    ? ((loweringTime || 0) / totalPhaseTime * 100).toFixed(1)
    : null;

  // Use real ML classification if available
  const hasClassification = !!classification;
  const mlPrediction = classification ? {
    confidence: Math.round((classification.confidence || 0.8) * 100),
    formQuality: classification.prediction === 0 ? 'clean' : 
                 classification.prediction === 1 ? 'uncontrolled' : 'abrupt',
    label: classification.label || 'Clean',
    method: classification.method || 'unknown',
    probabilities: classification.probabilities || null,
    prediction: classification.prediction
  } : null;
  
  // Determine form quality display and color based on classification
  // prediction 0 = green (clean), 1 = yellow (mild), 2 = red (severe)
  const PRED_2_LABELS_RI = [
    'Abrupt Initiation', 'Abrupt', 'Inclination Asymmetry', 'Inclination',
    'Releasing Too Fast', 'Release Fast', 'Poor Form', 'Bad Form',
  ];
  const getFormDisplay = (prediction) => {
    if (!prediction) {
      return { label: 'Pending', color: { primary: '#6b7280', secondary: '#9ca3af' } };
    }
    // Use numeric prediction if available
    if (prediction.prediction === 0 || prediction.formQuality === 'clean' || prediction.label === 'Clean') {
      return { label: prediction.label || 'Clean', color: { primary: '#22c55e', secondary: '#22c55e' } };
    }
    if (prediction.prediction === 2 || prediction.formQuality === 'abrupt' || PRED_2_LABELS_RI.some((l) => prediction.label?.includes(l) || l.includes(prediction.label || ''))) {
      return { label: prediction.label || 'Abrupt', color: { primary: '#ef4444', secondary: '#f87171' } };
    }
    return { label: prediction.label || 'Uncontrolled', color: { primary: '#f59e0b', secondary: '#fbbf24' } };
  };
  
  const formDisplay = getFormDisplay(mlPrediction);
  const formQuality = formDisplay.label;
  const formColor = formDisplay.color;

  // Actual metrics - no random fallbacks
  const repTime = time ? parseFloat(time) : null;
  const repRom = rom ? parseFloat(rom) : null;
  const repPeakVelocity = peakVelocity != null ? parseFloat(peakVelocity) : null;
  const hasChartData = chartData && chartData.length > 0;

  // ROM target reference (120° full curl ROM)
  const expectedRom = 120;
  const romProgress = repRom != null ? Math.min(100, (repRom / expectedRom) * 100) : null;

  // Peak velocity normalized to m/s scale (typical range: 0.1 - 1.5 m/s for strength exercises)
  // Industry standard ranges:
  //   > 1.3 m/s = Speed/Power | 0.75-1.3 = Strength-speed | 0.5-0.75 = Strength | < 0.5 = Max strength
  const maxExpectedVelocity = 1.5; // m/s
  const velocityProgress = repPeakVelocity != null ? Math.min(100, (repPeakVelocity / maxExpectedVelocity) * 100) : null;

  // Velocity zone classification
  const getVelocityZone = (v) => {
    if (v == null) return null;
    if (v >= 1.3) return { label: 'Power', color: '#22d3ee' };
    if (v >= 0.75) return { label: 'Speed-Strength', color: '#22c55e' };
    if (v >= 0.5) return { label: 'Strength', color: '#eab308' };
    if (v >= 0.3) return { label: 'Max Strength', color: '#f97316' };
    return { label: 'Slow', color: '#ef4444' };
  };
  const velocityZone = getVelocityZone(repPeakVelocity);

  // Calculate Rep Quality Score from ACTUAL data only
  const calculateRepQuality = () => {
    let qualityScore = 0;
    let totalWeight = 0;

    // Factor 1: ROM (30% weight)
    if (romProgress != null) {
      qualityScore += (romProgress / 100) * 30;
      totalWeight += 30;
    }

    // Factor 2: Velocity (25% weight) - optimal is 30-70% of max
    if (velocityProgress != null) {
      const velocityOptimal = velocityProgress >= 30 && velocityProgress <= 70 ? 100 : 
                              velocityProgress < 30 ? (velocityProgress / 30) * 100 :
                              100 - ((velocityProgress - 70) / 30) * 40;
      qualityScore += (velocityOptimal / 100) * 25;
      totalWeight += 25;
    }

    // Factor 3: ML Classification confidence (35% weight)
    if (mlPrediction) {
      const classificationBonus = mlPrediction.formQuality === 'clean' ? mlPrediction.confidence : 
                                  mlPrediction.formQuality === 'uncontrolled' ? mlPrediction.confidence * 0.6 :
                                  mlPrediction.confidence * 0.4;
      qualityScore += (classificationBonus / 100) * 35;
      totalWeight += 35;
    }

    // Factor 4: Tempo balance (10% weight) - Lifting should be 35-45%
    if (hasPhaseData) {
      const liftingPct = parseFloat(loweringPercent); // Fixed: use loweringPercent since we swapped the labels
      const tempoScore = Math.max(0, 100 - Math.abs(liftingPct - 40) * 3);
      qualityScore += (tempoScore / 100) * 10;
      totalWeight += 10;
    }

    if (totalWeight === 0) return null;
    return Math.round((qualityScore / totalWeight) * 100);
  };

  const repQuality = calculateRepQuality();

  // Determine effort/quality level and color based on quality score
  const getRepEffortLevel = (quality) => {
    if (quality == null) return { level: '—', color: '#6b7280', textColor: 'text-gray-400' };
    if (quality >= 85) return { level: 'Excellent', color: '#22c55e', textColor: 'text-green-500' };
    if (quality >= 70) return { level: 'Good', color: '#22c55e', textColor: 'text-green-500' };
    if (quality >= 55) return { level: 'Moderate', color: '#eab308', textColor: 'text-yellow-500' };
    return { level: 'Needs Work', color: '#ef4444', textColor: 'text-red-500' };
  };

  const repEffort = getRepEffortLevel(repQuality);

  // Classification labels and colors for overlay
  const classLabels = [
    { label: 'Clean', color: '#22c55e' },
    { label: 'Uncontrolled', color: '#f59e0b' },
    { label: 'Too Fast', color: '#ef4444' }
  ];

  return (
    <div className="h-full rounded-3xl bg-white/5 backdrop-blur-sm shadow-xl overflow-hidden flex flex-col relative">
      {/* Header with Rep number (left) and Classification badge (right) */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between flex-shrink-0">
        <h4 className="text-sm sm:text-base lg:text-lg font-semibold text-white">Rep {repNumber}</h4>
        
        {/* Classification Badge with Confidence - Top Right - HOVERABLE TOOLTIP */}
        <div 
          className="relative inline-flex items-center gap-2 sm:gap-2.5 px-3 sm:px-3.5 lg:px-4 py-1.5 sm:py-2 rounded-full bg-black/60 backdrop-blur-sm group cursor-help"
          onMouseEnter={() => mlPrediction && setShowConfidenceOverlay(true)}
          onMouseLeave={() => setShowConfidenceOverlay(false)}
        >
          <div 
            className="w-2.5 sm:w-3 h-2.5 sm:h-3 rounded-full" 
            style={{ backgroundColor: formColor.primary }}
          />
          <span className="text-xs sm:text-sm lg:text-base font-semibold text-white">
            {formQuality}
          </span>
          {mlPrediction && (
            <span className="text-xs sm:text-sm lg:text-base font-semibold" style={{ color: formColor.secondary }}>
              {mlPrediction.confidence}%
            </span>
          )}
          
          {/* Tooltip - appears on hover */}
          {showConfidenceOverlay && mlPrediction && (
            <div 
              className="absolute top-full right-0 mt-2 z-50 pointer-events-none"
              style={{ minWidth: '220px' }}
            >
              <div className="bg-black rounded-xl p-4 shadow-2xl border border-gray-700">
                <h4 className="text-xs font-semibold text-white mb-3">Confidence Levels</h4>
                <div className="space-y-2.5">
                  {classLabels.map((cls, idx) => {
                    // Get probability from array if available
                    let prob = 0;
                    if (mlPrediction.probabilities && Array.isArray(mlPrediction.probabilities)) {
                      prob = Math.round(mlPrediction.probabilities[idx] * 100);
                    } else if (mlPrediction.prediction === idx) {
                      prob = mlPrediction.confidence;
                    }
                    
                    const isSelected = mlPrediction.prediction === idx;
                    
                    return (
                      <div key={cls.label} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cls.color }} />
                            <span className={`text-xs font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                              {cls.label}
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-500'}`}>
                            {prob}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-300"
                            style={{ 
                              width: `${prob}%`, 
                              backgroundColor: cls.color
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-500 text-center mt-3 pt-2 border-t border-gray-800">
                  {mlPrediction.method === 'ml_model' ? 'ML Model' : 'Rule-based'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Graph Section */}
      <div className="relative px-5 pb-5 flex-shrink-0">
        {/* Graph Container - responsive height */}
        <div className="w-full bg-black/40 rounded-xl overflow-hidden" style={{ height: 'clamp(140px, 35vw, 240px)' }}>
          {chartData && chartData.length > 0 ? (
            (() => {
              // Use proper min-max normalization like relabeler.py
              const minVal = Math.min(...chartData);
              const maxVal = Math.max(...chartData);
              const range = maxVal - minVal || 1;
              const padding = 10;
              
              return (
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
                        const normalizedValue = (value - minVal) / range;
                        const y = 140 - padding - (normalizedValue * (140 - 2 * padding));
                        return `${x},${y}`;
                      }).join(' ')}
                      400,${140 - padding} 0,${140 - padding}
                    `}
                    fill={`url(#repGradient${repNumber})`}
                  />
                  
                  <polyline
                    points={chartData.map((value, index) => {
                      const x = (index / (chartData.length - 1)) * 400;
                      const normalizedValue = (value - minVal) / range;
                      const y = 140 - padding - (normalizedValue * (140 - 2 * padding));
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke={formColor.primary}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  
                  {(() => {
                    const maxIndex = chartData.reduce((maxI, val, i, arr) => val > arr[maxI] ? i : maxI, 0);
                    const maxValue = chartData[maxIndex];
                    const x = (maxIndex / (chartData.length - 1)) * 400;
                    const normalizedValue = (maxValue - minVal) / range;
                    const y = 140 - padding - (normalizedValue * (140 - 2 * padding));
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
              );
            })()
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Stats Bar - Rep Quality and Rep Duration */}
      <div className="px-5 pt-2 pb-5 flex items-center justify-center gap-8 sm:gap-12 lg:gap-16 flex-shrink-0">
        {/* Rep Quality */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-9 lg:h-9 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-300">Rep Quality</span>
            <span className={`text-lg sm:text-2xl lg:text-3xl font-bold ${repEffort.textColor}`}>{repQuality != null ? `${repQuality}%` : '—'}</span>
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
            <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-white">{repTime != null ? `${repTime}s` : '—'}</span>
          </div>
        </div>
      </div>

      {/* Metrics Section - Stacked vertically */}
      <div className="px-5 pb-5 space-y-5 sm:space-y-6 lg:space-y-7 flex-shrink-0">
        {/* Movement Phases */}
        <div className="space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs sm:text-sm lg:text-base font-medium text-gray-300">Movement Phases</span>
          </div>
          
          {hasPhaseData ? (
            <>
              {/* Stacked Horizontal Progress Bar */}
              <div className="relative h-3 sm:h-4 lg:h-5 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-500"
                  style={{ width: `${loweringPercent}%` }}
                />
                <div 
                  className="absolute inset-y-0 bg-gradient-to-r from-yellow-500 to-orange-400 transition-all duration-500"
                  style={{ left: `${loweringPercent}%`, right: 0 }}
                />
              </div>

              {/* Labels below progress bar */}
              <div className="flex items-center justify-between pt-1.5 sm:pt-2.5">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="w-1 h-10 sm:h-12 lg:h-14 bg-gradient-to-b from-teal-500 to-cyan-400 rounded-full" />
                  <div className="flex flex-col">
                    <span className="text-base sm:text-lg lg:text-xl font-bold text-white">{loweringPercent}%</span>
                    <span className="text-[10px] sm:text-xs lg:text-sm text-gray-400">Lifting</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 sm:gap-2.5">
                  <div className="flex flex-col items-end">
                    <span className="text-base sm:text-lg lg:text-xl font-bold text-white">{liftingPercent}%</span>
                    <span className="text-[10px] sm:text-xs lg:text-sm text-gray-400">Lowering</span>
                  </div>
                  <div className="w-1 h-10 sm:h-12 lg:h-14 bg-gradient-to-b from-yellow-500 to-orange-400 rounded-full" />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center py-4 bg-white/5 rounded-xl">
              <span className="text-xs text-gray-500">Phase data available after analysis</span>
            </div>
          )}
        </div>

        {/* Bottom Cards - Two rounded squares side by side */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-5">
          {/* Left Card - Range of Motion with circular progress */}
          <div className="relative bg-black/30 rounded-xl sm:rounded-2xl overflow-hidden p-3 sm:p-5 lg:p-6 flex flex-col justify-between" style={{ minHeight: 'clamp(140px, 40vw, 280px)' }}>
            <div className="relative z-10">
              <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-300">Range of Motion</span>
            </div>
            <div className="relative z-10 flex items-center justify-center flex-1 min-h-0 py-2 sm:py-3">
              {romProgress != null ? (
                <div className="relative" style={{ width: 'clamp(70px, 22vw, 140px)', height: 'clamp(70px, 22vw, 140px)' }}>
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke="#f97316" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      strokeDashoffset={`${2 * Math.PI * 42 * (1 - romProgress / 100)}`}
                      style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-white">
                      {Math.round(romProgress)}%
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1">
                  <span className="text-2xl font-bold text-gray-500">—</span>
                  <span className="text-[10px] text-gray-600">No data</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Card - Peak Velocity with chart background */}
          <div className="relative bg-black/30 rounded-xl sm:rounded-2xl overflow-hidden p-3 sm:p-5 lg:p-6 flex flex-col justify-between" style={{ minHeight: 'clamp(140px, 40vw, 280px)' }}>
            {/* Mini chart background - only render with actual data */}
            {hasChartData && (
              <div className="absolute inset-0 opacity-80">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`velocityFillGrad${repNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#22c55e', stopOpacity: 0.4 }} />
                      <stop offset="100%" style={{ stopColor: '#ef4444', stopOpacity: 0.05 }} />
                    </linearGradient>
                  </defs>
                  
                  <polygon
                    points={`
                      ${chartData.map((value, index) => {
                        const x = (index / (chartData.length - 1)) * 100;
                        // Normalize using actual min-max of the data for best visual spread
                        const minVal = Math.min(...chartData);
                        const maxVal = Math.max(...chartData);
                        const range = maxVal - minVal || 1;
                        const normalizedValue = (Math.abs(value) - Math.abs(minVal)) / range;
                        const y = 100 - (Math.max(0, Math.min(1, normalizedValue)) * 80 + 10);
                        return `${x},${y}`;
                      }).join(' ')}
                      100,100 0,100
                    `}
                    fill={`url(#velocityFillGrad${repNumber})`}
                  />
                  
                  {chartData.map((value, index) => {
                    if (index === 0) return null;
                    const minVal = Math.min(...chartData);
                    const maxVal = Math.max(...chartData);
                    const range = maxVal - minVal || 1;
                    const prevValue = chartData[index - 1];
                    const prevNorm = Math.max(0, Math.min(1, (Math.abs(prevValue) - Math.abs(minVal)) / range));
                    const currNorm = Math.max(0, Math.min(1, (Math.abs(value) - Math.abs(minVal)) / range));
                    const avgNorm = (prevNorm + currNorm) / 2;
                    
                    let color;
                    if (avgNorm < 0.2) color = '#ef4444';
                    else if (avgNorm < 0.4) color = '#f97316';
                    else if (avgNorm < 0.55) color = '#eab308';
                    else if (avgNorm < 0.75) color = '#84cc16';
                    else color = '#22c55e';
                    
                    const x1 = ((index - 1) / (chartData.length - 1)) * 100;
                    const y1 = 100 - (prevNorm * 80 + 10);
                    const x2 = (index / (chartData.length - 1)) * 100;
                    const y2 = 100 - (currNorm * 80 + 10);
                    
                    return (
                      <line key={index} x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={color} strokeWidth="3" strokeLinecap="round" />
                    );
                  })}
                  
                  {(() => {
                    const minVal = Math.min(...chartData);
                    const maxVal = Math.max(...chartData);
                    const range = maxVal - minVal || 1;
                    const maxIndex = chartData.reduce((maxI, val, i, arr) => Math.abs(val) > Math.abs(arr[maxI]) ? i : maxI, 0);
                    const maxValue = chartData[maxIndex];
                    const cx = (maxIndex / (chartData.length - 1)) * 100;
                    const normalizedValue = Math.max(0, Math.min(1, (Math.abs(maxValue) - Math.abs(minVal)) / range));
                    const cy = 100 - (normalizedValue * 80 + 10);
                    return <circle cx={cx} cy={cy} r="4" fill="#22c55e" stroke="white" strokeWidth="1.5" />;
                  })()}
                </svg>
              </div>
            )}
            
            <div className="relative z-10">
              <span className="text-[10px] sm:text-xs lg:text-sm font-medium text-gray-300">Peak Velocity</span>
            </div>
            <div className="relative z-10">
              {repPeakVelocity != null ? (
                <>
                  <span className="text-xl sm:text-3xl lg:text-4xl font-bold text-green-400">{repPeakVelocity.toFixed(2)}</span>
                  <span className="text-[10px] sm:text-xs lg:text-sm text-gray-400 ml-1">m/s</span>
                  {velocityZone && (
                    <div className="flex items-center gap-1.5 mt-1.5 sm:mt-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: velocityZone.color }} />
                      <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium" style={{ color: velocityZone.color }}>{velocityZone.label}</span>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-2xl font-bold text-gray-500">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Insights below cards - based on ML classification */}
        <div className="pt-2 sm:pt-3 lg:pt-4 pb-8 sm:pb-10 lg:pb-12">
          <p className="text-xs sm:text-sm lg:text-base text-purple-300 leading-relaxed text-center">
            {!mlPrediction
              ? 'Analyzing rep performance...'
              : mlPrediction.formQuality === 'clean'
              ? '✓ Clean rep! Controlled tempo with smooth movement throughout the range.'
              : mlPrediction.formQuality === 'uncontrolled'
              ? '⚠ Uncontrolled movement detected. Focus on maintaining steady tempo and control.'
              : '⚠ Too fast! Slow down the movement to maintain proper form and muscle tension.'}
          </p>
        </div>
      </div>
    </div>
  );
}
