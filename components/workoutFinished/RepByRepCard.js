import { useState, useEffect, useMemo } from 'react';
import RepCarousel from './RepCarousel';

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
    <div className="h-full flex flex-col animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
      {/* Header with Title on left and Set Tabs on right */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        {/* Title - left aligned */}
        <h3 className="text-lg font-semibold text-white">Rep by Rep</h3>
        
        {/* Set Tabs - right aligned with purple active color */}
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
                className={`px-2.5 py-1 rounded-full ${isSmallFont ? 'text-[10px]' : 'text-xs'} font-medium transition-all ${
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

      {/* Rep Carousel for Active Set - Takes remaining height */}
      <div className="flex-1 overflow-hidden">
        {parsedSetsData.map((set) => 
          activeSet === set.setNumber ? (
            <RepCarousel key={set.setNumber} repsData={set.repsData} />
          ) : null
        )}
      </div>
    </div>
  );
}
