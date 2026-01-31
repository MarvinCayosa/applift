import React, { useState, useEffect } from 'react';

/**
 * MovementQuality - Shows aggregated weekly movement quality score
 * Based on IMU metrics: angular velocity variability, jerk (smoothness), ROM consistency
 * 
 * @param {Object} props
 * @param {Object} props.data - Movement quality data object
 * @param {number} props.data.score - Overall movement quality score (0-100)
 * @param {number} props.data.angularVelocity - Angular velocity variability score (0-100)
 * @param {number} props.data.smoothness - Jerk/smoothness score (0-100)
 * @param {number} props.data.romConsistency - ROM consistency score (0-100)
 * @param {Object} props.equipmentData - Data filtered by equipment type
 * @param {boolean} props.loading - Loading state
 * @param {boolean} props.animate - Whether to trigger score animation (default: false)
 */
export default function MovementQuality({
  data = null,
  equipmentData = null,
  loading = false,
  animate = false,
  onFilterChange = () => {}
}) {
  const [activeFilter, setActiveFilter] = useState('dumbbell');
  const [displayScore, setDisplayScore] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Default data structure for backend integration
  const defaultData = {
    all: {
      score: 86,
      angularVelocity: 82,
      smoothness: 89,
      romConsistency: 87
    },
    dumbbell: {
      score: 88,
      angularVelocity: 85,
      smoothness: 90,
      romConsistency: 89
    },
    barbell: {
      score: 84,
      angularVelocity: 80,
      smoothness: 87,
      romConsistency: 85
    },
    weightStack: {
      score: 82,
      angularVelocity: 78,
      smoothness: 86,
      romConsistency: 82
    }
  };

  // Use provided data or default
  const qualityData = equipmentData || defaultData;
  const currentData = qualityData[activeFilter] || qualityData.dumbbell;

  // Animate score when component becomes visible or filter changes
  useEffect(() => {
    if (!animate) {
      setDisplayScore(currentData.score);
      return;
    }

    setIsAnimating(true);
    const targetScore = currentData.score;
    const duration = 800;
    const steps = 30;
    const stepValue = targetScore / steps;
    const stepTime = duration / steps;

    let currentStep = 0;
    setDisplayScore(0);

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep <= steps) {
        setDisplayScore(Math.floor(stepValue * currentStep));
      } else {
        setDisplayScore(targetScore);
        clearInterval(timer);
        setIsAnimating(false);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [activeFilter, currentData.score, animate]); // Add animate to dependencies

  // Handle filter change
  const handleFilterChange = (filter) => {
    if (filter !== activeFilter) {
      setActiveFilter(filter);
      onFilterChange(filter);
    }
  };

  // Get interpretation text based on score
  const getInterpretation = (score) => {
    if (score >= 90) return 'Excellent Control';
    if (score >= 80) return 'Stable & Controlled';
    if (score >= 70) return 'Good Form';
    if (score >= 60) return 'Moderate Control';
    if (score >= 50) return 'Needs Improvement';
    return 'Focus on Form';
  };

  // Get score color based on value (red, orange, yellow, green spectrum)
  const getScoreColor = (score) => {
    if (score >= 80) return '#61d929'; // green (new)
    if (score >= 60) return '#eab308'; // yellow
    if (score >= 40) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const scoreColor = getScoreColor(currentData.score);

  // Filter options with icons and unique colors
  const filters = [
    {
      id: 'dumbbell',
      label: 'Dumbbell',
      color: '#3b82f6', // blue
      icon: (
        <img 
          src="/svg/dumbbell.svg" 
          alt="Dumbbell" 
          className="w-5 h-5"
          style={{ filter: 'brightness(0) saturate(100%) invert(1)' }}
        />
      )
    },
    {
      id: 'barbell',
      label: 'Barbell',
      color: '#ef4444', // red
      icon: (
        <img 
          src="/svg/barbell.svg" 
          alt="Barbell" 
          className="w-5 h-5"
          style={{ filter: 'brightness(0) saturate(100%) invert(1)' }}
        />
      )
    },
    {
      id: 'weightStack',
      label: 'Cable',
      color: '#eab308', // yellow
      icon: (
        <img 
          src="/svg/weight-stack.svg" 
          alt="Weight Stack" 
          className="w-5 h-5"
          style={{ filter: 'brightness(0) saturate(100%) invert(1)' }}
        />
      )
    }
  ];

  // Metric items for the breakdown - each with unique color matching equipment scheme
  const metrics = [
    {
      label: 'Angular Velocity',
      value: currentData.angularVelocity,
      color: '#3b82f6' // blue (matches dumbbell)
    },
    {
      label: 'Smoothness',
      value: currentData.smoothness,
      color: '#ef4444' // red (matches barbell)
    },
    {
      label: 'ROM Consistency',
      value: currentData.romConsistency,
      color: '#eab308' // yellow (matches weight stack/cable)
    }
  ];

  // Calculate stroke dasharray for circular progress
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;

  if (loading) {
    return (
      <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 animate-pulse">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-40 bg-white/10 rounded"></div>
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-16 bg-white/10 rounded-full"></div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="w-32 h-32 bg-white/10 rounded-full"></div>
          <div className="flex-1 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-white/10 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Card Container */}
      <div className="relative overflow-hidden bg-white/5 border border-white/10 rounded-2xl p-4 transition-all duration-300">
        
        {/* Subtle animated background glow */}
        <div 
          className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-15 blur-3xl transition-all duration-700"
          style={{ 
            background: `radial-gradient(circle, ${scoreColor}40, transparent 70%)`,
          }}
        />

        {/* Header with Title and Equipment Filter Icons */}
        <div className="flex items-center justify-between gap-3 mb-4 relative z-10">
          {/* Title - No icon */}
          <div>
            <h3 className="text-sm font-semibold text-white">Movement Quality</h3>
            <p className="text-[10px] text-white/40">Weekly aggregated result</p>
          </div>

          {/* Equipment Filter Icons - Upper Right */}
          <div className="flex gap-1.5">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => handleFilterChange(filter.id)}
                className={`
                  p-2.5 rounded-lg transition-all duration-300 ease-out
                  ${activeFilter === filter.id 
                    ? 'scale-105' 
                    : 'bg-white/10 hover:bg-white/15 opacity-50 hover:opacity-80'
                  }
                `}
                style={{ 
                  backgroundColor: activeFilter === filter.id ? filter.color : 'rgba(255,255,255,0.1)'
                }}
                title={filter.label}
              >
                <img 
                  src={filter.icon.props.src} 
                  alt={filter.icon.props.alt}
                  className="w-5 h-5"
                  style={{ 
                    filter: 'brightness(0) saturate(100%) invert(1)'
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex items-center gap-5 relative z-10">
          
          {/* Circular Score Gauge */}
          <div className="relative flex-shrink-0">
            <div className="relative w-28 h-28">
              {/* Background circle */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="8"
                />
                {/* Animated progress circle */}
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-700 ease-out"
                  style={{
                    filter: `drop-shadow(0 0 6px ${scoreColor}60)`
                  }}
                />
              </svg>
              
              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span 
                  className={`text-3xl font-bold transition-all duration-300 ${isAnimating ? 'scale-105' : 'scale-100'}`}
                  style={{ color: scoreColor }}
                >
                  {displayScore}
                </span>
                <span className="text-[10px] text-white/40 font-medium">/ 100</span>
              </div>
            </div>

            {/* Interpretation text below circle - one line */}
            <p 
              className="text-center text-[10px] font-medium mt-2 transition-all duration-500 whitespace-nowrap"
              style={{ color: scoreColor }}
            >
              {getInterpretation(currentData.score)}
            </p>
          </div>

          {/* Metrics Breakdown */}
          <div className="flex-1 space-y-2.5">
            {metrics.map((metric, index) => (
              <div 
                key={metric.label}
                className="group"
                style={{ 
                  animationDelay: `${index * 100}ms`,
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/60 font-medium">{metric.label}</span>
                  <span 
                    className="text-xs font-bold transition-colors duration-300"
                    style={{ color: metric.color }}
                  >
                    {metric.value}
                  </span>
                </div>
                
                {/* Progress bar with unique color */}
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ 
                      width: `${metric.value}%`,
                      background: `linear-gradient(90deg, ${metric.color}80, ${metric.color})`,
                      boxShadow: `0 0 8px ${metric.color}40`
                    }}
                  />
                </div>
              </div>
            ))}

            {/* IMU Signal Indicator */}
            <div className="flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-white/5">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#61d929' }}></span>
                <span className="text-[9px] text-white/30 font-medium">IMU Metrics</span>
              </div>
              <span className="text-[9px] text-white/20">•</span>
              <span className="text-[9px] text-white/30">Updated weekly</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
