import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import WorkoutSummaryCard from '../components/workoutFinished/WorkoutSummaryCard';
import LiftPhases from '../components/workoutFinished/LiftPhases';
import RepByRepCard from '../components/workoutFinished/RepByRepCard';

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
    recommendedSets,
    recommendedReps
  } = router.query;

  // Parse JSON data from query params
  const parsedChartData = chartData ? JSON.parse(chartData) : [];
  const parsedTimeData = timeData ? JSON.parse(timeData) : [];
  const parsedRepsData = repsData ? JSON.parse(repsData) : [];
  const parsedSetsData = setsData ? JSON.parse(setsData) : [];
  
  // Debug logging
  useEffect(() => {
    console.log('=== WORKOUT FINISHED DEBUG ===');
    console.log('Query params - setsData (raw):', setsData);
    console.log('Query params - totalReps:', totalReps);
    console.log('Query params - recommendedSets:', recommendedSets);
    console.log('Query params - recommendedReps:', recommendedReps);
    console.log('Parsed setsData:', parsedSetsData);
    console.log('Parsed setsData length:', parsedSetsData?.length);
    console.log('Parsed chartData length:', parsedChartData?.length);
    console.log('Each set detail:');
    parsedSetsData.forEach((set, idx) => {
      console.log(`  Set ${idx + 1}:`, {
        setNumber: set.setNumber,
        reps: set.reps,
        repsDataLength: set.repsData?.length
      });
    });
    console.log('==============================');
  }, [setsData, totalReps, recommendedSets, recommendedReps, parsedSetsData, parsedChartData]);
  
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
    <div className="h-screen bg-black text-white overflow-hidden">
      {/* Scrollable content - includes header */}
      <div className="h-full overflow-y-auto px-4 space-y-3 max-w-2xl mx-auto pb-6">
        
        {/* Header with back button and title on same line */}
        <div className="pt-6 pb-1 flex items-center justify-between">
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
          
          {/* Workout completed message - centered */}
          <h2 className="text-xl font-bold text-white flex-1 text-center">
            Workout completed!
          </h2>
          
          {/* Spacer to balance the layout */}
          <div className="w-10"></div>
        </div>

        {/* Workout Summary Card - Top of page */}
        <WorkoutSummaryCard
          workoutName={workoutName}
          equipment={equipment}
          chartData={parsedChartData.map(d => Math.abs(d.filtered || d))}
          timeData={parsedTimeData}
          totalCalories={parseInt(calories) || 0}
          totalWorkoutTime={parseInt(totalTime) || 0}
          setsData={parsedSetsData}
          totalReps={parseInt(totalReps) || 0}
        />

        {/* Movement Phases - Eccentric vs Concentric */}
        <LiftPhases />

        {/* Rep by rep section - now a reusable component */}
        <RepByRepCard 
          setsData={setsData}
          parsedSetsData={parsedSetsData}
          recommendedSets={recommendedSets}
        />

        {/* Single Save Workout button */}
        <button
          onClick={() => router.push('/workouts')}
          className="w-full py-3.5 rounded-full font-semibold text-white text-base transition-all bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg shadow-purple-500/30"
        >
          Save Workout
        </button>
      </div>
    </div>
  );
}
