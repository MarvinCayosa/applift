import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import WorkoutSummaryCard from '../components/workoutFinished/WorkoutSummaryCard';
import LiftPhases from '../components/workoutFinished/LiftPhases';
import RepByRepCard from '../components/workoutFinished/RepByRepCard';
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';
import { useWorkoutStreak } from '../utils/useWorkoutStreak';
import LoadingScreen from '../components/LoadingScreen';

export default function WorkoutFinished() {
  const router = useRouter();
  const { completeLog, cancelLog, uploadProgress, logError, hasActiveLog } = useWorkoutLogging();
  const { recordWorkout } = useWorkoutStreak();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
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

  // Handle going back without saving (cancel the log)
  const handleGoBack = async () => {
    if (hasActiveLog) {
      // Ask for confirmation
      const confirmed = confirm('Are you sure you want to leave? Your workout data will not be saved.');
      if (!confirmed) return;
      
      // Cancel the log
      await cancelLog('user_abandoned');
    }
    
    // Clean up sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('workoutCSV');
      sessionStorage.removeItem('workoutCSVFilename');
      sessionStorage.removeItem('workoutResults');
    }
    
    router.push('/dashboard');
  };

  return (
    <div className="h-screen bg-black text-white overflow-hidden">
      {/* Scrollable content - includes header */}
      <div className="h-full overflow-y-auto px-4 space-y-3 max-w-2xl mx-auto pb-6">
        
        {/* Header with back button and title on same line */}
        <div className="pt-10 sm:pt-10 pb-1 flex items-center justify-between">
          <button
            onClick={handleGoBack}
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

        {/* Upload status indicator */}
        {uploadProgress && uploadProgress !== 'completed' && (
          <div className="flex items-center justify-center gap-2 py-2">
            {uploadProgress === 'uploading' && (
              <>
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-white/70">Uploading workout data...</span>
              </>
            )}
            {uploadProgress === 'failed' && (
              <span className="text-sm text-red-400">Upload failed. Data saved locally.</span>
            )}
          </div>
        )}

        {/* Error message */}
        {(saveError || logError) && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-center">
            <p className="text-sm text-red-400">{saveError || logError}</p>
          </div>
        )}

        {/* Single Save Workout button */}
        <button
          onClick={async () => {
            if (isSaving) return;
            
            setIsSaving(true);
            setSaveError(null);
            
            try {
              // Get workout results from sessionStorage
              const resultsStr = typeof window !== 'undefined' 
                ? sessionStorage.getItem('workoutResults') 
                : null;
              const results = resultsStr ? JSON.parse(resultsStr) : {
                totalSets: parseInt(recommendedSets) || parsedSetsData?.length || 0,
                totalReps: parseInt(totalReps) || 0,
                totalTime: parseInt(totalTime) || 0,
                calories: parseInt(calories) || 0,
                avgConcentric: parseFloat(avgConcentric) || 0,
                avgEccentric: parseFloat(avgEccentric) || 0,
                setData: parsedSetsData || [],
              };

              // Complete the workout log (uploads IMU data and saves to Firestore)
              if (hasActiveLog) {
                const success = await completeLog(results);
                
                if (!success) {
                  throw new Error('Failed to save workout');
                }
              }
              
              // Update workout streak - this will immediately update the user's streak
              try {
                await recordWorkout(new Date());
                console.log('[WorkoutFinished] Streak updated successfully');
              } catch (streakError) {
                console.warn('[WorkoutFinished] Failed to update streak:', streakError);
                // Don't fail the save if streak update fails
              }
              
              // Clean up sessionStorage
              if (typeof window !== 'undefined') {
                sessionStorage.removeItem('workoutCSV');
                sessionStorage.removeItem('workoutCSVFilename');
                sessionStorage.removeItem('workoutResults');
              }
              
              // Navigate to workouts page
              router.push('/workouts');
            } catch (error) {
              console.error('Error saving workout:', error);
              setSaveError(error.message || 'Failed to save workout. Please try again.');
              setIsSaving(false);
            }
          }}
          disabled={isSaving}
          className={`w-full py-3.5 rounded-full font-semibold text-white text-base transition-all ${
            isSaving 
              ? 'bg-gray-600 cursor-not-allowed' 
              : 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg shadow-purple-500/30'
          }`}
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </span>
          ) : (
            'Save Workout'
          )}
        </button>
      </div>
    </div>
  );
}
