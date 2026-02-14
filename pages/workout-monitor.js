import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import AccelerationChart from '../components/workoutMonitor/AccelerationChart';
import WorkoutNotification from '../components/workoutMonitor/WorkoutNotification';
import ConnectPill from '../components/ConnectPill';
import { useBluetooth } from '../context/BluetoothProvider';
import { useWorkoutSession } from '../utils/useWorkoutSession';
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';
import LoadingScreen from '../components/LoadingScreen';

export default function WorkoutMonitor() {
  const router = useRouter();
  const { equipment, workout, plannedSets, plannedReps, weight, weightUnit, setType } = router.query;
  
  // Workout logging context - streaming version
  const { 
    startStreaming, 
    streamIMUSample, 
    handleRepDetected, 
    handleSetComplete, 
    finishWorkout,
    cancelWorkout,
    isStreaming,
    workoutId,
    currentLog,
    workoutConfig 
  } = useWorkoutLogging();
  
  // Track last rep count for detecting new reps
  const lastRepCountRef = useRef(0);
  const lastSetRef = useRef(1);
  
  // Analyzing loading screen state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Helper function to get the correct background image based on equipment and workout
  const getWorkoutImage = () => {
    if (!equipment || !workout) return null;
    
    const equipmentLower = equipment.toLowerCase();
    const workoutLower = workout.toLowerCase();
    
    // Map equipment and workout to actual image filenames
    if (equipmentLower.includes('barbell')) {
      if (workoutLower.includes('bench') || workoutLower.includes('press')) {
        return '/images/workout-cards/barbell-flat-bench-press.jpg';
      } else if (workoutLower.includes('squat')) {
        return '/images/workout-cards/barbell-front-squats.jpg';
      }
      return '/images/workout-cards/barbell-comingsoon.jpg';
    } else if (equipmentLower.includes('dumbbell') || equipmentLower.includes('dumbbell')) {
      if (workoutLower.includes('curl')) {
        return '/images/workout-cards/dumbbell-concentration-curls.jpg';
      } else if (workoutLower.includes('extension') || workoutLower.includes('tricep')) {
        return '/images/workout-cards/dumbbell-overhead-extension.jpg';
      }
      return '/images/workout-cards/dumbbell-comingsoon.jpg';
    } else if (equipmentLower.includes('weight stack') || equipmentLower.includes('weightstack') || equipmentLower.includes('cable')) {
      if (workoutLower.includes('pulldown') || workoutLower.includes('lat')) {
        return '/images/workout-cards/weightstack-lateral-pulldown.jpg';
      } else if (workoutLower.includes('leg') && workoutLower.includes('extension')) {
        return '/images/workout-cards/weightstack-seated-leg-extension.jpg';
      }
      return '/images/workout-cards/weightstack-comingsoon.jpg';
    }
    
    // Default fallback
    return '/images/workout-cards/barbell-comingsoon.jpg';
  };
   
  const {
    connected,
    device,
    scanning,
    devicesFound,
    availability,
    scanDevices,
    connectToDevice,
    disconnect,
  } = useBluetooth();
  
  // Notification state
  const [lastRepNotification, setLastRepNotification] = useState(null);
  
  // Track ConnectPill expansion for title visibility
  const [isPillExpanded, setIsPillExpanded] = useState(false);
  
  // Workout tracking - Use values from query params (passed from selectedWorkout)
  // Use useEffect to update when router.query changes (needed for client-side hydration)
  const [recommendedSets, setRecommendedSets] = useState(4);
  const [recommendedReps, setRecommendedReps] = useState(2);
  const [workoutWeight, setWorkoutWeight] = useState(0);
  const [workoutWeightUnit, setWorkoutWeightUnit] = useState('kg');
  const [workoutSetType, setWorkoutSetType] = useState('recommended');

  // Update workout config when query params are available
  useEffect(() => {
    if (plannedSets) setRecommendedSets(parseInt(plannedSets));
    if (plannedReps) setRecommendedReps(parseInt(plannedReps));
    if (weight) setWorkoutWeight(parseFloat(weight));
    if (weightUnit) setWorkoutWeightUnit(weightUnit);
    if (setType) setWorkoutSetType(setType);
    
    console.log('📋 Workout Config Updated:', {
      sets: plannedSets,
      reps: plannedReps,
      weight: weight,
      weightUnit: weightUnit,
      setType: setType,
    });
  }, [plannedSets, plannedReps, weight, weightUnit, setType]);
  
  // Initialize streaming session immediately on page load (mark as unfinished)
  // This removes the delay when user presses start
  const hasInitializedStreaming = useRef(false);
  
  useEffect(() => {
    // Only initialize once when we have all workout params available
    if (hasInitializedStreaming.current) return;
    if (!workout || !equipment) return;
    
    const initSession = async () => {
      console.log('🚀 Initializing streaming session on page load...');
      
      const result = await startStreaming({
        exercise: workout,
        equipment: equipment,
        plannedSets: parseInt(plannedSets) || recommendedSets,
        plannedReps: parseInt(plannedReps) || recommendedReps,
        weight: parseFloat(weight) || workoutWeight,
        weightUnit: weightUnit || workoutWeightUnit,
        setType: setType || workoutSetType
      });
      
      if (result?.success) {
        console.log('✅ Streaming session initialized (unfinished):', result.workoutId);
        hasInitializedStreaming.current = true;
      } else {
        console.warn('⚠️ Failed to initialize streaming session on load');
      }
    };
    
    initSession();
  }, [workout, equipment, plannedSets, plannedReps, weight, weightUnit, setType, startStreaming, recommendedSets, recommendedReps, workoutWeight, workoutWeightUnit, workoutSetType]);
  
  // Use the workout session hook for all algorithm logic
  const {
    isRecording,
    isPaused,
    showCountdown,
    countdownValue,
    isOnBreak,
    breakTimeRemaining,
    breakPaused,
    motivationalMessage,
    elapsedTime,
    currentSet,
    repStats,
    workoutStats,
    currentIMU,
    sampleCount,
    dataRate,
    timeData,
    rawAccelData,
    filteredAccelData,
    isSubscribed,
    startRecording: startRecordingSession,
    stopRecording: stopSession,
    togglePause,
    toggleBreakPause,
    stopBreak,
    exportToCSV: getCSV,
    resetReps,
    formatTime,
    repCounterRef,
    rawDataLog
  } = useWorkoutSession({
    connected,
    recommendedReps,
    recommendedSets,
    // Stream IMU samples to GCS as they come in
    onIMUSample: (sample) => {
      if (isStreaming) {
        streamIMUSample(sample);
      }
    },
    // Handle rep detection - save rep data to GCS
    onRepDetected: async (repInfo) => {
      if (isStreaming) {
        console.log('🏋️ Rep detected:', repInfo);
        await handleRepDetected(repInfo);
      }
    },
    // Handle set completion - move to next set folder in GCS
    onSetComplete: async (setNumber) => {
      if (isStreaming) {
        console.log('✅ Set complete:', setNumber);
        await handleSetComplete();
      }
    },
    onWorkoutComplete: async ({ workoutStats: finalStats, repData, chartData }) => {
      // Show analyzing screen
      setIsAnalyzing(true);
      
      // Finish streaming and determine completion status
      const result = await finishWorkout();
      
      // *** CRITICAL: Merge classification data from streaming service ***
      // finalStats.setData doesn't have ML classifications
      // result.workoutData.sets DOES have classifications from background ML
      const mergedSetData = finalStats.setData.map((localSet, setIdx) => {
        const streamingSet = result?.workoutData?.sets?.find(
          s => s.setNumber === localSet.setNumber
        ) || result?.workoutData?.sets?.[setIdx];
        
        if (!streamingSet || !streamingSet.reps) {
          console.log(`[WorkoutComplete] No streaming data for Set ${localSet.setNumber}, keeping local`);
          return localSet;
        }
        
        // Merge classification data into each rep
        const mergedRepsData = localSet.repsData?.map((localRep, repIdx) => {
          const streamingRep = streamingSet.reps.find(
            r => r.repNumber === repIdx + 1
          ) || streamingSet.reps[repIdx];
          
          if (streamingRep?.classification) {
            console.log(`[WorkoutComplete] Merging classification for Set ${localSet.setNumber} Rep ${repIdx + 1}:`, streamingRep.classification);
            return {
              ...localRep,
              classification: streamingRep.classification,
              chartData: streamingRep.samples?.map(s => s.filteredMag) || localRep.chartData
            };
          }
          return localRep;
        }) || [];
        
        return {
          ...localSet,
          repsData: mergedRepsData
        };
      });
      
      console.log('[WorkoutComplete] Merged set data with classifications:', mergedSetData);
      
      // Calculate avg concentric/eccentric
      const avgRepDuration = finalStats.allRepDurations.length > 0
        ? finalStats.allRepDurations.reduce((a, b) => a + b, 0) / finalStats.allRepDurations.length
        : 0;
      
      // Store workout results in sessionStorage for workout-finished page
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('workoutResults', JSON.stringify({
          totalSets: finalStats.completedSets,
          totalReps: finalStats.totalReps,
          totalTime: finalStats.totalTime,
          calories: Math.round(finalStats.totalReps * 5),
          avgConcentric: (avgRepDuration * 0.4).toFixed(1),
          avgEccentric: (avgRepDuration * 0.6).toFixed(1),
          setData: mergedSetData, // Use merged data with classifications
          // Include streaming result status
          status: result?.status || 'completed',
          workoutId: result?.workoutId || workoutId,
        }));
      }
      
      // Wait a bit for the analyzing animation to show
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Navigate to workout finished page with set-grouped data
      router.push({
        pathname: '/workout-finished',
        query: {
          workoutName: workout,
          equipment: equipment,
          totalReps: finalStats.totalReps,
          calories: Math.round(finalStats.totalReps * 5),
          totalTime: finalStats.totalTime,
          avgConcentric: (avgRepDuration * 0.4).toFixed(1),
          avgEccentric: (avgRepDuration * 0.6).toFixed(1),
          chartData: JSON.stringify(chartData.filteredAccelData),
          timeData: JSON.stringify(chartData.timeData),
          setsData: JSON.stringify(mergedSetData), // Use merged data with classifications
          recommendedSets: recommendedSets,
          recommendedReps: recommendedReps,
          weight: workoutWeight,
          weightUnit: workoutWeightUnit,
          setType: workoutSetType,
          status: result?.status || 'completed',
          workoutId: result?.workoutId || workoutId,
          gcsPath: result?.workoutData?.gcsPath || result?.metadata?.gcsPath || '',
        }
      });
    }
  });
  
  // Start recording with streaming
  const startRecording = async () => {
    console.log('🎬 Starting recording with config:', {
      exercise: workout,
      equipment: equipment,
      plannedSets: recommendedSets,
      plannedReps: recommendedReps,
      weight: workoutWeight,
      weightUnit: workoutWeightUnit,
      setType: workoutSetType
    });

    // Check if streaming is already initialized (from page load)
    if (isStreaming) {
      console.log('🎬 Streaming already active, starting recording session...');
      startRecordingSession();
      return;
    }

    // Fallback: Start the streaming session if not already initialized
    const result = await startStreaming({
      exercise: workout,
      equipment: equipment,
      plannedSets: recommendedSets,
      plannedReps: recommendedReps,
      weight: workoutWeight,
      weightUnit: workoutWeightUnit,
      setType: workoutSetType
    });
    
    if (result?.success) {
      console.log('🎬 Streaming started:', result.workoutId);
      startRecordingSession();
    } else {
      console.error('Failed to start streaming');
      alert('Failed to start workout recording. Please try again.');
    }
  };
  
  // Handle stop recording
  const stopRecording = async () => {
    stopSession();
    
    // Cancel the workout if stopped manually
    if (isStreaming) {
      await cancelWorkout();
    }
  };

  return (
    <div className="relative h-screen w-screen bg-black text-white overflow-hidden">
      <Head>
        <title>Workout Monitor — {workout} — AppLift</title>
      </Head>

      {/* Full-screen analyzing loading screen */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-[200]">
          <LoadingScreen message="Analyzing your session..." showLogo={true} />
        </div>
      )}

      {/* Countdown Overlay */}
      {showCountdown && (
        <div className="countdown-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-fadeIn">
          <div className="text-7xl sm:text-8xl md:text-9xl font-bold text-white animate-pulse">
            {countdownValue}
          </div>
        </div>
      )}

      {/* Break Overlay */}
      {isOnBreak && (
        <div className="break-overlay fixed inset-0 z-[100] flex items-center justify-center bg-black px-4 animate-fadeIn">
          <div className="flex flex-col items-center gap-8 sm:gap-10">
            <div className="text-center">
              <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
                Take a break!
              </div>
              <div className="text-base sm:text-lg md:text-xl text-white/70">
                {motivationalMessage}
              </div>
            </div>
            
            {/* Circular Progress Timer - Bigger and centered */}
            <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 256 256">
                {/* Background circle */}
                <circle
                  cx="128"
                  cy="128"
                  r="110"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="16"
                  fill="none"
                />
                {/* Glow effect circle */}
                <circle
                  cx="128"
                  cy="128"
                  r="110"
                  stroke="url(#breakGradient)"
                  strokeWidth="16"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 110}`}
                  strokeDashoffset={`${2 * Math.PI * 110 * (1 - (30 - breakTimeRemaining) / 30)}`}
                  style={{ 
                    transition: breakPaused ? 'none' : 'stroke-dashoffset 1s linear',
                    filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.8))'
                  }}
                />
                {/* Gradient definition - light to dark as time progresses */}
                <defs>
                  <linearGradient id="breakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={breakTimeRemaining > 20 ? "#e9d5ff" : breakTimeRemaining > 10 ? "#c084fc" : "#9333ea"} />
                    <stop offset="50%" stopColor={breakTimeRemaining > 15 ? "#c084fc" : "#a855f7"} />
                    <stop offset="100%" stopColor={breakTimeRemaining > 10 ? "#a855f7" : "#7c3aed"} />
                  </linearGradient>
                </defs>
              </svg>
              
              {/* Timer text in center */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-6xl sm:text-7xl md:text-8xl font-bold text-white">
                  {Math.floor(breakTimeRemaining / 60)}:{(breakTimeRemaining % 60).toString().padStart(2, '0')}
                </div>
              </div>
            </div>
            
            {/* Pause and Stop buttons */}
            <div className="flex items-center gap-8 sm:gap-12">
              {/* Pause button */}
              <button
                onClick={toggleBreakPause}
                className="flex flex-col items-center gap-2 transition-all hover:scale-110"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center">
                  {breakPaused ? (
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm sm:text-base text-white/80">{breakPaused ? 'Resume' : 'Pause'}</span>
              </button>
              
              {/* Stop button */}
              <button
                onClick={stopBreak}
                className="flex flex-col items-center gap-2 transition-all hover:scale-110"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center">
                  <svg className="w-7 h-7 sm:w-9 sm:h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                </div>
                <span className="text-sm sm:text-base text-white/80">End</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rep Notification */}
      <WorkoutNotification 
        notification={lastRepNotification}
        onDismiss={() => setLastRepNotification(null)}
      />

      {/* Header with semi-transparent background */}
      <div className="absolute top-0 left-0 right-0 z-30 px-4 pt-2.5 sm:pt-3.5 pt-pwa-dynamic pb-4" style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0) 100%)'
      }}>
        {/* Top row - Back button and Connection Pill */}
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/20 transition-all"
            aria-label="Go back"
          >
            <img
              src="/images/icons/arrow-point-to-left.png"
              alt="Back"
              className="w-5 h-5 filter brightness-0 invert"
            />
          </button>

          {/* Workout Title - between back button and pill */}
          <div 
            className={`absolute left-1/2 transform -translate-x-1/2 text-center transition-opacity duration-300 px-16 max-w-full ${
              isPillExpanded ? 'opacity-0' : 'opacity-0 animate-fade-in'
            }`}
          >
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{workout}</h1>
          </div>

          <ConnectPill
            connected={connected}
            device={device}
            onScan={scanDevices}
            onConnect={connectToDevice}
            onDisconnect={disconnect}
            scanning={scanning}
            devicesFound={devicesFound}
            availability={availability}
            collapse={1}
            onExpandChange={setIsPillExpanded}
          />
        </div>
        
        {/* Workout Config Badges */}
        <div className="flex items-center justify-center gap-2 opacity-0 animate-fade-in-up" style={{ animationDelay: '1.8s' }}>
          {/* Set Type Badge */}
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            workoutSetType === 'custom' 
              ? 'bg-gray-400 text-gray-900' 
              : 'bg-purple-400 text-purple-900'
          }`}>
            {workoutSetType === 'custom' ? 'Custom Set' : 'Recommended Set'}
          </span>
          
          {/* Equipment Badge */}
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            equipment?.toLowerCase().includes('barbell') ? 'bg-yellow-400 text-yellow-900' :
            equipment?.toLowerCase().includes('dumbbell') || equipment?.toLowerCase().includes('dumbbell') ? 'bg-blue-400 text-blue-900' :
            equipment?.toLowerCase().includes('weight stack') || equipment?.toLowerCase().includes('weightstack') || equipment?.toLowerCase().includes('cable') ? 'bg-red-400 text-red-900' :
            'bg-teal-400 text-teal-900'
          }`}>
            {equipment}
          </span>
          
          {/* Weight Badge (only show if weight > 0) */}
          <span className="text-xs px-3 py-1 rounded-full font-medium bg-amber-400 text-amber-900">
            {workoutWeight > 0 ? `${workoutWeight} ${workoutWeightUnit}` : `0 ${workoutWeightUnit}`}
          </span>
        </div>
      </div>

      <main className="relative h-full w-full">

        {/* Chart - Full Screen Background */}
        <div className="absolute inset-0 z-10">
          <AccelerationChart
            timeData={timeData}
            filteredData={filteredAccelData}
            thresholdHigh={repStats.thresholdHigh}
            thresholdLow={repStats.thresholdLow}
          />
        </div>
      </main>

      {/* Bottom Container - Frosted Glass Overlay */}
      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-6 pt-8" style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.6) 80%, rgba(0,0,0,0) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)'
      }}>
        <div className="mx-auto w-full max-w-lg">
          {/* Bottom Container - Buttons and Info Cards */}
          <div>
            {/* Timer/Start Button Bar */}
            <div className="flex items-center justify-between mb-3 opacity-0 animate-fade-in-up" style={{ animationDelay: '2.1s' }}>
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={!connected || !isSubscribed}
                    className="w-full py-4 rounded-full font-bold text-white text-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                    style={{
                      background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
                      boxShadow: '0 8px 24px rgba(147, 51, 234, 0.4)'
                    }}
                  >
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                    <span>Start Recording</span>
                  </button>
                ) : (
                  <>
                    {!isPaused ? (
                      <button
                        onClick={togglePause}
                        className="w-full py-4 rounded-full font-bold text-white text-xl transition-all flex items-center justify-center gap-3"
                        style={{
                          background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
                          boxShadow: '0 8px 24px rgba(147, 51, 234, 0.4)'
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                          </svg>
                        </div>
                        <span>{formatTime(elapsedTime)}</span>
                      </button>
                    ) : (
                      <button
                        onClick={togglePause}
                        className="w-full py-4 rounded-full font-bold text-white text-xl transition-all flex items-center justify-between px-6"
                        style={{
                          background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
                          boxShadow: '0 8px 24px rgba(147, 51, 234, 0.4)'
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                          <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                        <span>{formatTime(elapsedTime)}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            stopRecording();
                          }}
                          className="w-12 h-12 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-all"
                        >
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="6" width="12" height="12"/>
                          </svg>
                        </button>
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Info Cards Row */}
              <div className="grid grid-cols-2 gap-3 opacity-0 animate-fade-in-up" style={{ animationDelay: '2.4s' }}>
                {/* Rep Count Card */}
                <div className="rounded-2xl p-4 backdrop-blur-md flex flex-col" style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  aspectRatio: '1.4'
                }}>
                  {/* Top Section - Label */}
                  <div className="mb-2">
                    <span className="text-base font-semibold text-white/90">Reps</span>
                  </div>
                  {/* Middle Section - Main Values */}
                  <div className="flex items-baseline gap-2 mb-auto">
                    <span className="text-5xl font-extrabold text-white leading-none">{repStats.repCount}</span>
                    <span className="text-2xl font-semibold text-white/40">/</span>
                    <span className="text-3xl font-semibold text-white/60">{recommendedReps}</span>
                  </div>
                  {/* Bottom Section - Progress Bar (aligned with set card) */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mt-2.5">
                    <div 
                      className="h-full rounded-full transition-all duration-300 ease-in-out"
                      style={{
                        width: `${Math.min((repStats.repCount / recommendedReps) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #EAB308 0%, #CA8A04 50%, #A16207 100%)',
                        boxShadow: '0 0 10px 2px rgba(234, 179, 8, 0.6)'
                      }}
                    />
                  </div>
                </div>

                {/* Set Card */}
                <div className="rounded-2xl p-4 flex flex-col backdrop-blur-md" style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  aspectRatio: '1.4'
                }}>
                  {/* Top Section - Label */}
                  <div className="mb-2">
                    <span className="text-base font-semibold text-white/90">Sets</span>
                  </div>
                  {/* Middle Section - Main Values */}
                  <div className="flex items-baseline gap-2 mb-auto">
                    <span className="text-5xl font-extrabold text-white leading-none">{currentSet}</span>
                    <span className="text-2xl font-semibold text-white/40">/</span>
                    <span className="text-3xl font-semibold text-white/60">{recommendedSets}</span>
                  </div>
                  {/* Bottom Section - Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mt-2.5">
                    <div 
                      className="h-full rounded-full transition-all duration-300 ease-in-out"
                      style={{
                        width: `${Math.min((currentSet / recommendedSets) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
                        boxShadow: '0 0 10px 2px rgba(59, 130, 246, 0.6)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
