import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import OverallChartCard from '../components/workoutFinished/OverallChartCard';
import WorkoutStatsCard from '../components/workoutFinished/WorkoutStatsCard';
import TimeUnderTensionChart from '../components/workoutFinished/TimeUnderTensionChart';
import RepCarousel from '../components/workoutFinished/RepCarousel';

export default function WorkoutFinished() {
  const router = useRouter();
  const { 
    workoutName, 
    equipment, 
    totalReps, 
    calories,
    totalTime,
    avgConcentric,
    avgEccentric,
    chartData,
    timeData,
    repsData,
    setsData,
    hasCSV,
    recommendedSets
  } = router.query;

  // Parse JSON data from query params
  const parsedChartData = chartData ? JSON.parse(chartData) : [];
  const parsedTimeData = timeData ? JSON.parse(timeData) : [];
  const parsedRepsData = repsData ? JSON.parse(repsData) : [];
  const parsedSetsData = setsData ? JSON.parse(setsData) : [];
  
  // CSV download state
  const [csvAvailable, setCsvAvailable] = useState(false);
  
  // Active set tab state
  const [activeSet, setActiveSet] = useState(1);
  
  useEffect(() => {
    // Check if CSV is available in sessionStorage
    if (typeof window !== 'undefined' && hasCSV === 'true') {
      const csv = sessionStorage.getItem('workoutCSV');
      setCsvAvailable(!!csv);
    }
  }, [hasCSV]);
  
  const downloadCSV = () => {
    if (typeof window === 'undefined') return;
    
    const csvContent = sessionStorage.getItem('workoutCSV');
    const filename = sessionStorage.getItem('workoutCSVFilename') || 'applift_workout.csv';
    
    if (!csvContent) {
      alert('CSV data not available');
      return;
    }
    
    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Header with back button and title on same line */}
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10 transition-all"
          aria-label="Go back"
        >
          <img
            src="/images/icons/arrow-point-to-left.png"
            alt="Back"
            className="w-5 h-5 filter brightness-0 invert"
          />
        </button>
        
        {/* Workout completed on same line */}
        <h2 className="text-lg font-bold text-white">
          Workout completed!
        </h2>
        
        <div className="w-10"></div> {/* Spacer for centering */}
      </div>

      {/* Scrollable content */}
      <div className="px-4 space-y-5 max-w-2xl mx-auto">

        {/* Workout session chart - stacked rounded card */}
        <div className="mt-6 relative">
          {/* Stacked card effect - visible orange/purple bottom layer */}
          <div className="absolute inset-0 top-3 bg-gradient-to-br from-orange-600/30 to-purple-600/30 rounded-[24px]"></div>
          
          {/* Main card */}
          <div className="relative bg-[#2a2a2a] rounded-[24px] p-5 shadow-2xl">
            {/* Workout Session Label */}
            <h3 className="text-sm font-medium text-gray-400 mb-3">Workout Session</h3>
            
            {/* Metrics - styled like watch tutorial button */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 text-[11px] text-gray-400 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#353535]">
                <span className="font-semibold text-white">{parseInt(totalReps) || 0}</span>
                <span>Reps</span>
              </div>
              <div className="flex-1 text-[11px] text-gray-400 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#353535]">
                <span className="font-semibold text-white">{parseInt(calories) || 0}</span>
                <span>Cal</span>
              </div>
              <div className="flex-1 text-[11px] text-gray-400 flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#353535]">
                <span className="font-semibold text-white">{Math.floor((parseInt(totalTime) || 0) / 60)}:{String((parseInt(totalTime) || 0) % 60).padStart(2, '0')}</span>
                <span>Time</span>
              </div>
            </div>

            {/* Chart */}
            <div className="relative h-48 bg-[#1f1f1f] rounded-2xl overflow-hidden">
              {parsedChartData && parsedChartData.length > 0 ? (
                <svg className="w-full h-full" viewBox="0 0 400 192" preserveAspectRatio="none">
                  <defs>
                    {/* Purple gradient like workout-monitor */}
                    <linearGradient id="chartGradientStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" style={{ stopColor: '#c084fc', stopOpacity: 1 }} />
                      <stop offset="50%" style={{ stopColor: '#a855f7', stopOpacity: 1 }} />
                      <stop offset="100%" style={{ stopColor: '#9333ea', stopOpacity: 1 }} />
                    </linearGradient>
                    <linearGradient id="chartGradientFill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" style={{ stopColor: '#c084fc', stopOpacity: 0.4 }} />
                      <stop offset="100%" style={{ stopColor: '#9333ea', stopOpacity: 0.05 }} />
                    </linearGradient>
                  </defs>

                  {/* Chart line and fill */}
                  {(() => {
                    const maxVal = Math.max(...parsedChartData.map(d => Math.abs(d.filtered)));
                    const minVal = Math.min(...parsedChartData.map(d => Math.abs(d.filtered)));
                    const range = maxVal - minVal || 1;
                    
                    const points = parsedChartData.map((point, index) => {
                      const x = (index / (parsedChartData.length - 1 || 1)) * 400;
                      const normalizedValue = (Math.abs(point.filtered) - minVal) / range;
                      const y = 192 - (normalizedValue * 172) - 10;
                      return `${x},${y}`;
                    }).join(' ');

                    const fillPoints = `${points} 400,192 0,192`;

                    return (
                      <>
                        <polygon
                          points={fillPoints}
                          fill="url(#chartGradientFill)"
                        />
                        <polyline
                          points={points}
                          fill="none"
                          stroke="url(#chartGradientStroke)"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.5))' }}
                        />
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  No chart data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Time under tension - gradient bar with glow */}
        <div className="bg-[#2a2a2a] rounded-[24px] p-5 shadow-xl">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Time Under Tension</h3>
          <div className="relative h-12 bg-[#1f1f1f] rounded-full overflow-hidden shadow-[0_0_30px_rgba(168,85,247,0.2)]">
            {(() => {
              const concentric = parseFloat(avgConcentric) || 0;
              const eccentric = parseFloat(avgEccentric) || 0;
              const total = concentric + eccentric || 1;
              const concentricPercent = (concentric / total) * 100;
              
              return (
                <>
                  {/* Smooth gradient from purple to white */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-purple-500 via-purple-300 to-white transition-all duration-500"
                    style={{ 
                      background: `linear-gradient(to right, #a855f7 0%, #e9d5ff ${concentricPercent}%, #ffffff 100%)`
                    }}
                  />
                  {/* Inner glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/50 via-transparent to-transparent blur-md"></div>
                  {/* Labels */}
                  <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-medium text-white z-10">
                    <span className="drop-shadow-lg">Concentric {concentric.toFixed(1)}s</span>
                    <span className="text-gray-800 drop-shadow-lg">Eccentric {eccentric.toFixed(1)}s</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Rep by rep section */}
        {parsedSetsData.length > 0 || recommendedSets ? (
          <div className="bg-[#2a2a2a] rounded-[24px] p-5 shadow-xl">
            {/* Rep by Rep label with Set Tabs on same line */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-400">Rep by Rep</h3>
              
              {/* Set Tabs - based on recommendedSets */}
              <div className="flex gap-2 overflow-x-auto">
                {Array.from({ length: parseInt(recommendedSets) || parsedSetsData.length || 1 }, (_, i) => i + 1).map((setNum) => {
                  const setData = parsedSetsData.find(s => s.setNumber === setNum);
                  const hasData = !!setData;
                  
                  return (
                    <button
                      key={setNum}
                      onClick={() => setActiveSet(setNum)}
                      disabled={!hasData}
                      className={`text-[11px] flex-shrink-0 transition-all flex items-center gap-1.5 px-4 py-2 rounded-full ${
                        activeSet === setNum && hasData
                          ? 'text-white bg-gradient-to-r from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30'
                          : hasData
                            ? 'text-gray-400 bg-[#353535] hover:bg-[#404040]'
                            : 'text-gray-600 bg-[#252525] cursor-not-allowed'
                      }`}
                    >
                      Set {setNum}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Rep Carousel for Active Set - no arrows */}
            <div>
              {parsedSetsData.map((set) => 
                activeSet === set.setNumber ? (
                  <RepCarousel key={set.setNumber} repsData={set.repsData} />
                ) : null
              )}
            </div>
          </div>
        ) : (
          /* Fallback to old format if no sets data */
          <div className="bg-[#2a2a2a] rounded-[24px] p-5 shadow-xl">
            <h3 className="text-sm font-medium text-gray-400 mb-4">Rep by Rep</h3>
            <RepCarousel repsData={parsedRepsData} />
          </div>
        )}

        {/* Single Save Workout button */}
        <button
          onClick={() => router.push('/workouts')}
          className="w-full py-3.5 rounded-full font-semibold text-white text-base transition-all bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-lg shadow-orange-500/20"
        >
          Save Workout
        </button>
      </div>
    </div>
  );
}
