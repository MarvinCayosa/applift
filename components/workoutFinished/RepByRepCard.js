import { useState, useEffect, useMemo } from 'react';
import RepCarousel from './RepCarousel';

/**
 * Set Fatigue Chart Component
 * Shows fatigue progression across all reps in a set
 */
function SetFatigueChart({ repsData, setNumber }) {
  // Generate fatigue data from reps (using duration as proxy for fatigue)
  const fatigueData = useMemo(() => {
    if (!repsData || repsData.length === 0) {
      // Placeholder data
      return [30, 35, 42, 50, 58, 65];
    }
    
    // Calculate fatigue based on rep duration - longer reps = more fatigue
    const baseline = repsData[0]?.time || 2;
    return repsData.map((rep, idx) => {
      const duration = rep.time || 2;
      // Fatigue increases as duration increases relative to baseline
      const fatigueLevel = 30 + ((duration / baseline) - 1) * 50 + (idx * 8);
      return Math.min(95, Math.max(20, fatigueLevel));
    });
  }, [repsData]);

  const maxFatigue = Math.max(...fatigueData);
  const avgFatigue = Math.round(fatigueData.reduce((a, b) => a + b, 0) / fatigueData.length);

  return (
    <div className="mb-4 bg-[#1a1a1a] rounded-2xl p-4">
      {/* Fatigue level indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm text-white font-medium">Set {setNumber} Fatigue</span>
        </div>
        <span className="text-base font-bold text-purple-400">{avgFatigue}%</span>
      </div>

      {/* Line chart showing fatigue per rep */}
      <div className="relative bg-black/30 rounded-xl p-3" style={{ height: '100px' }}>
        <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`fatigueGradient${setNumber}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#a855f7', stopOpacity: 0.4 }} />
              <stop offset="100%" style={{ stopColor: '#a855f7', stopOpacity: 0.05 }} />
            </linearGradient>
          </defs>
          
          {/* Gradient fill area */}
          <polygon
            points={`
              ${fatigueData.map((fatigue, index) => {
                const x = (index / (fatigueData.length - 1)) * 400;
                const y = 100 - (fatigue / 100) * 85 - 5;
                return `${x},${y}`;
              }).join(' ')}
              400,100 0,100
            `}
            fill={`url(#fatigueGradient${setNumber})`}
          />
          
          {/* Line */}
          <polyline
            points={fatigueData.map((fatigue, index) => {
              const x = (index / (fatigueData.length - 1)) * 400;
              const y = 100 - (fatigue / 100) * 85 - 5;
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="#a855f7"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {fatigueData.map((fatigue, index) => {
            const x = (index / (fatigueData.length - 1)) * 400;
            const y = 100 - (fatigue / 100) * 85 - 5;
            return (
              <circle
                key={index}
                cx={x}
                cy={y}
                r="3.5"
                fill="white"
                stroke="#a855f7"
                strokeWidth="2"
              />
            );
          })}
        </svg>
        
        {/* Rep number labels aligned with data points */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-3 pb-1">
          {fatigueData.map((_, idx) => (
            <span key={idx} className="text-[10px] text-gray-400 font-medium">
              {idx + 1}
            </span>
          ))}
        </div>
      </div>
      
      {/* Rep labels */}
      <div className="text-center mt-2">
        <span className="text-xs text-gray-400">Rep Number</span>
      </div>
    </div>
  );
}

export default function RepByRepCard({ setsData, parsedSetsData, recommendedSets }) {
  const [activeSet, setActiveSet] = useState(1);

  // Debug logging
  useEffect(() => {
    console.log('RepByRepCard - setsData:', setsData);
    console.log('RepByRepCard - parsedSetsData:', parsedSetsData);
    console.log('RepByRepCard - parsedSetsData length:', parsedSetsData?.length);
    console.log('RepByRepCard - recommendedSets:', recommendedSets);
  }, [setsData, parsedSetsData, recommendedSets]);

  // Get active set data
  const activeSetData = useMemo(() => {
    return parsedSetsData?.find(s => s.setNumber === activeSet);
  }, [parsedSetsData, activeSet]);

  // Return null if no data
  if (!setsData && !recommendedSets) {
    return null;
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-5 shadow-xl animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
      {/* Header with Set Tabs */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-white">Performance</h3>
        
        {/* Set Tabs - styled like the reference image */}
        <div className="flex gap-1 bg-gray-800/50 rounded-full p-1">
          {Array.from({ length: parseInt(recommendedSets) || parsedSetsData.length || 1 }, (_, i) => i + 1).map((setNum) => {
            const setData = parsedSetsData.find(s => s.setNumber === setNum);
            const hasData = !!setData;
            const totalSets = parseInt(recommendedSets) || parsedSetsData.length || 1;
            const isSmallFont = totalSets > 3;
            
            return (
              <button
                key={setNum}
                onClick={() => hasData && setActiveSet(setNum)}
                disabled={!hasData}
                className={`px-3 py-1.5 rounded-full ${isSmallFont ? 'text-xs' : 'text-sm'} font-medium transition-all ${
                  activeSet === setNum && hasData
                    ? 'bg-white text-gray-900'
                    : hasData
                      ? 'text-gray-300 hover:text-white'
                      : 'text-gray-600 cursor-not-allowed'
                }`}
              >
                Set {setNum}
              </button>
            );
          })}
        </div>
      </div>

      {/* Set Fatigue Chart */}
      {activeSetData && (
        <SetFatigueChart 
          repsData={activeSetData.repsData} 
          setNumber={activeSet}
        />
      )}

      {/* Separator */}
      <div className="border-t border-white/10 my-4" />

      {/* Rep by Rep Label */}
      <h4 className="text-sm font-medium text-gray-400 mb-3">Rep by Rep</h4>

      {/* Rep Carousel for Active Set */}
      <div>
        {parsedSetsData.map((set) => 
          activeSet === set.setNumber ? (
            <RepCarousel key={set.setNumber} repsData={set.repsData} />
          ) : null
        )}
      </div>
    </div>
  );
}
