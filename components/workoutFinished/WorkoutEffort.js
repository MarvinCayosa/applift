import { useMemo } from 'react';

/**
 * Analyzes workout data to determine overall session effort with multiple criteria
 */
function analyzeWorkoutEffort(setsData, chartData) {
  // Default values
  let effortLevel = 'Moderate';
  let description = 'You maintained consistent control throughout the session.';
  let color = 'amber';
  
  // Individual criteria scores (0-100)
  let velocityScore = 50;
  let consistencyScore = 50;
  let enduranceScore = 50;

  if (!setsData || setsData.length === 0) {
    return { 
      level: effortLevel, 
      description, 
      color, 
      criteria: {
        velocity: velocityScore,
        consistency: consistencyScore,
        endurance: enduranceScore
      }
    };
  }

  try {
    // Collect all reps across all sets with their effort metrics
    const allReps = [];
    
    setsData.forEach((set, setIdx) => {
      const repsInSet = set.repsData || [];
      repsInSet.forEach((rep, repIdx) => {
        const duration = rep.duration || rep.totalTime || 2.5;
        
        allReps.push({
          duration: duration,
          setNumber: setIdx + 1,
          repInSet: repIdx + 1
        });
      });
    });

    if (allReps.length > 0) {
      // Calculate baseline from first 3 reps
      const baselineReps = allReps.slice(0, Math.min(3, allReps.length));
      const baselineDuration = baselineReps.reduce((sum, r) => sum + r.duration, 0) / baselineReps.length;
      
      // 1. VELOCITY SCORE - How much rep speed slowed over time
      const firstThird = allReps.slice(0, Math.floor(allReps.length / 3));
      const lastThird = allReps.slice(-Math.floor(allReps.length / 3));
      
      const firstAvgDuration = firstThird.reduce((sum, r) => sum + r.duration, 0) / firstThird.length;
      const lastAvgDuration = lastThird.reduce((sum, r) => sum + r.duration, 0) / lastThird.length;
      
      const velocitySlowdown = baselineDuration > 0 
        ? ((lastAvgDuration - firstAvgDuration) / baselineDuration) * 100 
        : 0;
      
      // Higher slowdown = higher effort (inverse relationship for display)
      velocityScore = Math.max(20, Math.min(95, 30 + velocitySlowdown * 2));
      
      // 2. CONSISTENCY SCORE - Variation in rep timing throughout
      const durations = allReps.map(r => r.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = avgDuration > 0 ? (stdDev / avgDuration) * 100 : 0;
      
      // Higher variation = higher effort (less consistent = more fatigue)
      consistencyScore = Math.max(20, Math.min(95, 25 + coefficientOfVariation * 3));
      
      // 3. ENDURANCE SCORE - Rep count decline across sets
      const repCounts = setsData.map(set => set.reps || 0);
      const firstSetReps = repCounts[0] || 0;
      const lastSetReps = repCounts[repCounts.length - 1] || 0;
      const repDecline = firstSetReps > 0 ? ((firstSetReps - lastSetReps) / firstSetReps) * 100 : 0;
      
      // Higher decline = higher effort
      enduranceScore = Math.max(20, Math.min(95, 30 + repDecline * 2));

      // Calculate overall effort from criteria
      const overallScore = (velocityScore + consistencyScore + enduranceScore) / 3;

      // Determine level and description based on overall score
      if (overallScore >= 60) {
        effortLevel = 'High';
        color = 'orange';
        
        if (velocityScore >= consistencyScore && velocityScore >= enduranceScore) {
          description = 'Lift speed slowed near the end of the session';
        } else if (enduranceScore >= velocityScore && enduranceScore >= consistencyScore) {
          description = 'Effort increased toward the final reps';
        } else {
          description = 'The workout was challenging but remained controlled';
        }
      } else if (overallScore <= 40) {
        effortLevel = 'Low';
        color = 'green';
        
        description = 'You maintained consistent control throughout the session';
      } else {
        effortLevel = 'Moderate';
        color = 'amber';
        
        description = 'The workout was challenging but remained controlled';
      }
    }

  } catch (error) {
    console.error('Error analyzing workout effort:', error);
    // Fall back to defaults
  }

  return { 
    level: effortLevel, 
    description, 
    color, 
    criteria: {
      velocity: Math.round(velocityScore),
      consistency: Math.round(consistencyScore),
      endurance: Math.round(enduranceScore)
    }
  };
}

/**
 * WorkoutEffort Component
 * Displays overall session effort similar to fitness tracker style
 */
export default function WorkoutEffort({ setsData, chartData }) {
  const { level, description, color, criteria } = useMemo(
    () => analyzeWorkoutEffort(setsData, chartData),
    [setsData, chartData]
  );

  // Color schemes for the badge
  const colorSchemes = {
    green: {
      text: 'text-emerald-400',
      icon: 'text-emerald-400',
      chart: '#34D399'
    },
    amber: {
      text: 'text-amber-400',
      icon: 'text-amber-400',
      chart: '#F59E0B'
    },
    orange: {
      text: 'text-orange-400',
      icon: 'text-orange-400',
      chart: '#F97316'
    }
  };

  const scheme = colorSchemes[color] || colorSchemes.amber;

  // Calculate overall effort score for display
  const overallScore = Math.round((criteria.velocity + criteria.consistency + criteria.endurance) / 3);

  // Generate chart data points from criteria (simulate a trend)
  const chartPoints = [
    criteria.endurance * 0.7,
    criteria.consistency * 0.85,
    criteria.velocity * 0.9,
    overallScore
  ];

  // Find min and max for scaling
  const minValue = Math.min(...chartPoints);
  const maxValue = Math.max(...chartPoints);
  const range = maxValue - minValue || 20;

  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-pink-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-white/70">
          Workout Effort
        </h3>
      </div>

      {/* Main content: Score on left, Chart on right */}
      <div className="flex items-center justify-between mb-4">
        {/* Left side - Large score display */}
        <div className="flex-shrink-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-bold text-white">
              {overallScore}
            </span>
            <span className="text-lg text-white/50 mb-1">
              %
            </span>
          </div>
          <div className="text-xs text-white/50 mt-1">
            Average
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <svg 
              className={`w-4 h-4 ${scheme.icon}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className={`text-sm font-medium ${scheme.text}`}>
              {level}
            </span>
          </div>
        </div>

        {/* Right side - Mini line chart */}
        <div className="flex-1 ml-6">
          <svg 
            width="100%" 
            height="80" 
            viewBox="0 0 200 80" 
            preserveAspectRatio="none"
            className="overflow-visible"
          >
            {/* Background gradient area */}
            <defs>
              <linearGradient id="effortGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={scheme.chart} stopOpacity="0.3" />
                <stop offset="100%" stopColor={scheme.chart} stopOpacity="0.05" />
              </linearGradient>
            </defs>
            
            {/* Fill area under the line */}
            <path
              d={`M 0 80 L ${chartPoints.map((point, i) => {
                const x = (i / (chartPoints.length - 1)) * 200;
                const y = 80 - ((point - minValue) / range) * 60;
                return `${x} ${y}`;
              }).join(' L ')} L 200 80 Z`}
              fill="url(#effortGradient)"
            />
            
            {/* Line */}
            <polyline
              points={chartPoints.map((point, i) => {
                const x = (i / (chartPoints.length - 1)) * 200;
                const y = 80 - ((point - minValue) / range) * 60;
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke={scheme.chart}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Score label on far right */}
        <div className="text-3xl font-bold text-white/40 ml-4 flex-shrink-0">
          {overallScore}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-white/60 leading-relaxed">
        {description}
      </p>
    </div>
  );
}
