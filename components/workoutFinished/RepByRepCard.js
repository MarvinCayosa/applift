import { useState, useEffect, useMemo, useRef } from 'react';
import RepCarousel from './RepCarousel';

export default function RepByRepCard({ setsData, parsedSetsData, recommendedSets }) {
  const [activeSet, setActiveSet] = useState(1);
  const [animationKey, setAnimationKey] = useState(0);

  // Debug logging
  useEffect(() => {
    console.log('RepByRepCard - setsData:', setsData);
    console.log('RepByRepCard - parsedSetsData:', parsedSetsData);
    console.log('RepByRepCard - parsedSetsData length:', parsedSetsData?.length);
    console.log('RepByRepCard - recommendedSets:', recommendedSets);
  }, [setsData, parsedSetsData, recommendedSets]);

  // Handle set change with animation trigger
  const handleSetChange = (setNum) => {
    if (setNum !== activeSet) {
      setActiveSet(setNum);
      setAnimationKey(prev => prev + 1); // Force re-mount for animation
    }
  };

  // Get active set data
  const activeSetData = useMemo(() => {
    return parsedSetsData?.find(s => s.setNumber === activeSet);
  }, [parsedSetsData, activeSet]);

  // Return null if no data
  if (!setsData && !recommendedSets) {
    return null;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with Title on left and Set Tabs on right */}
      <div className="flex items-center justify-between mb-4 sm:mb-5 lg:mb-6 flex-shrink-0 content-fade-up-2">
        {/* Title - left aligned */}
        <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-white">Rep by Rep</h3>
        
        {/* Set Tabs - right aligned with purple active color */}
        <div className="flex gap-1 sm:gap-1.5 lg:gap-2 bg-gray-800/50 rounded-full p-1 sm:p-1.5 lg:p-2">
          {Array.from({ length: parseInt(recommendedSets) || parsedSetsData.length || 1 }, (_, i) => i + 1).map((setNum) => {
            const setData = parsedSetsData.find(s => s.setNumber === setNum);
            const hasData = !!setData;
            
            return (
              <button
                key={setNum}
                onClick={() => hasData && handleSetChange(setNum)}
                disabled={!hasData}
                className={`px-3 sm:px-4 lg:px-5 py-1.5 sm:py-2 lg:py-2.5 rounded-full text-xs sm:text-sm lg:text-base font-semibold transition-all ${
                  activeSet === setNum && hasData
                    ? 'bg-purple-500 text-white'
                    : hasData
                      ? 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                      : 'text-gray-600 cursor-not-allowed'
                }`}
              >
                Set {setNum}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rep Carousel for Active Set - Takes remaining height with fade-in-up animation on set switch */}
      <div className="flex-1 overflow-hidden">
        {parsedSetsData.map((set) => 
          activeSet === set.setNumber ? (
            <div 
              key={`${set.setNumber}-${animationKey}`} 
              className="h-full animate-fade-in-up"
              style={{ animationDuration: '0.35s' }}
            >
              <RepCarousel repsData={set.repsData} />
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
