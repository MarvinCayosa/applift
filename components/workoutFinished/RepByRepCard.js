import { useState, useEffect } from 'react';
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

  // Return null if no data
  if (!setsData && !recommendedSets) {
    return null;
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-5 shadow-xl animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
      {/* Header with Set Tabs */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-base font-semibold text-white">Rep by Rep</h3>
        
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
