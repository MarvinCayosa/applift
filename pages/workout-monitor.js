import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState } from 'react';
import AccelerationChart from '../components/workoutMonitor/AccelerationChart';
import WorkoutNotification from '../components/workoutMonitor/WorkoutNotification';
import ConnectPill from '../components/ConnectPill';
import { useBluetooth } from '../context/BluetoothProvider';
import { useWorkoutSession } from '../utils/useWorkoutSession';

export default function WorkoutMonitor() {
  const router = useRouter();
  const { equipment, workout } = router.query;
  
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
    } else if (equipmentLower.includes('dumbbell') || equipmentLower.includes('dumbell')) {
      if (workoutLower.includes('curl')) {
        return '/images/workout-cards/dumbell-concentration-curls.jpg';
      } else if (workoutLower.includes('extension') || workoutLower.includes('tricep')) {
        return '/images/workout-cards/dumbell-overhead-extension.jpg';
      }
      return '/images/workout-cards/dumbell-comingsoon.jpg';
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
  
  // Workout tracking - Backend integration ready
  const [recommendedSets] = useState(4); // Placeholder - will be from backend
  const [recommendedReps] = useState(2); // Placeholder - will be from backend
  
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
    startRecording,
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
    onWorkoutComplete: ({ workoutStats: finalStats, repData, chartData }) => {
      // Calculate avg concentric/eccentric
      const avgRepDuration = finalStats.allRepDurations.length > 0
        ? finalStats.allRepDurations.reduce((a, b) => a + b, 0) / finalStats.allRepDurations.length
        : 0;
      
      // Generate CSV data and store in sessionStorage
      const csvContent = getCSV();
      if (typeof window !== 'undefined' && csvContent) {
        sessionStorage.setItem('workoutCSV', csvContent);
        sessionStorage.setItem('workoutCSVFilename', `applift_${workout}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
      }
      
      // Navigate to workout finished page with set-grouped data
      router.push({
        pathname: '/workout-finished',
        query: {
          workoutName: workout,
          equipment: equipment,
          totalReps: finalStats.totalReps,
          calories: Math.round(finalStats.totalReps * 5), // Placeholder
          totalTime: finalStats.totalTime,
          avgConcentric: (avgRepDuration * 0.4).toFixed(1),
          avgEccentric: (avgRepDuration * 0.6).toFixed(1),
          chartData: JSON.stringify(chartData.filteredAccelData),
          timeData: JSON.stringify(chartData.timeData),
          setsData: JSON.stringify(finalStats.setData), // Pass all sets data
          recommendedSets: recommendedSets, // Pass recommended sets
          recommendedReps: recommendedReps, // Pass recommended reps per set
          hasCSV: 'true'
        }
      });
    }
  });
  
  // Handle stop recording with CSV export option
  const stopRecording = () => {
    stopSession();
    
    if (rawDataLog.current.length > 0) {
      const shouldExport = confirm(`Recorded ${repStats.repCount} reps with ${rawDataLog.current.length} samples. Download CSV?`);
      if (shouldExport) {
        const csvContent = getCSV();
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `applift_${workout}_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    }
  };

  return (
    <div className="relative h-screen w-screen bg-black text-white overflow-hidden">
      <Head>
        <title>Workout Monitor — {workout} — AppLift</title>
      </Head>

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
      <div className="absolute top-0 left-0 right-0 z-30 px-4 pt-6 pb-4" style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0) 100%)'
      }}>
        {/* Top row - Back button and Connection Pill */}
        <div className="flex items-center justify-between mb-4">
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

          <ConnectPill
            connected={connected}
            device={device}
            onScan={scanDevices}
            onConnect={connectToDevice}
            onDisconnect={disconnect}
            scanning={scanning}
            devicesFound={devicesFound}
            availability={availability}
          />
        </div>
        
        {/* Workout Title */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">{workout}</h1>
          <p className="text-sm text-white/70">{equipment}</p>
        </div>
      </div>

      <main className="relative h-full w-full">

        {/* Disconnection Warning during session */}
        {!connected && isRecording && (
          <div className="absolute top-32 left-4 right-4 z-30 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/50 p-4 text-center animate-pulse">
            <p className="text-sm text-red-300 font-semibold">⚠️ Device disconnected. Please reconnect to continue session.</p>
          </div>
        )}

        {/* Connection Status - Before Starting */}
        {!connected && !isRecording && (
          <div className="absolute top-32 left-4 right-4 z-30 rounded-xl bg-red-500/20 backdrop-blur-md border border-red-500/50 p-4 text-center">
            <p className="text-sm text-red-300">⚠️ Device not connected. Please connect your IMU device.</p>
          </div>
        )}

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
            <div className="flex items-center justify-between mb-3">
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
              <div className="grid grid-cols-2 gap-3">
                {/* Rep Count Card */}
                <div className="rounded-2xl p-4 backdrop-blur-md flex flex-col" style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  aspectRatio: '1.4'
                }}>
                  {/* Top Section - Icon and Label */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-yellow-600/30 flex items-center justify-center">
                      <svg className="w-3 h-3 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <span className="text-base font-semibold text-white/90">Reps</span>
                  </div>
                  {/* Middle Section - Main Values */}
                  <div className="flex items-baseline gap-2 mb-auto">
                    <span className="text-5xl font-extrabold text-white leading-none">{repStats.repCount}</span>
                    <span className="text-2xl font-semibold text-white/40">/</span>
                    <span className="text-3xl font-semibold text-white/40">{recommendedReps}</span>
                  </div>
                  {/* Bottom Section - Progress Bar (aligned with set card) */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mt-2">
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
                <div className="rounded-2xl p-2 flex flex-col backdrop-blur-md" style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  aspectRatio: '1.4'
                }}>
                  {/* Top Section - Icon and Label */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-blue-500/30 flex items-center justify-center">
                      <svg className="w-3 h-3 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <span className="text-base font-semibold text-white/90">Sets</span>
                  </div>
                  {/* Middle Section - Main Values */}
                  <div className="flex items-baseline gap-2 mb-auto">
                    <span className="text-5xl font-extrabold text-white leading-none">{currentSet}</span>
                    <span className="text-2xl font-semibold text-white/40">/</span>
                    <span className="text-3xl font-semibold text-white/40">{recommendedSets}</span>
                  </div>
                  {/* Bottom Section - Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mt-2">
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
