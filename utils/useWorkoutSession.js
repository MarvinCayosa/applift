import { useCallback, useEffect, useRef, useState } from 'react';
import { RepCounter } from './RepCounter';
import { useIMUData } from './useIMUData';

const MAX_CHART_POINTS = 100; // Last 5 seconds at 20Hz

/**
 * Compute eccentric/concentric phase timings from IMU samples using primary movement axis.
 * Matches the algorithm in main_csv.py:
 * 1. Find which accel axis (X/Y/Z) has the highest range of motion
 * 2. Find the most prominent peak (positive or negative) on that axis
 * 3. Concentric (lifting) = time before peak, Eccentric (lowering) = time after peak
 *
 * @param {Array} samples - IMU sample objects with accelX, accelY, accelZ, relativeTime
 * @returns {{ liftingTime: number, loweringTime: number }}
 */
function computeLocalPhaseTimings(samples) {
  if (!samples || samples.length < 3) {
    return { liftingTime: 0, loweringTime: 0 };
  }

  const accelX = samples.map(s => s.accelX || 0);
  const accelY = samples.map(s => s.accelY || 0);
  const accelZ = samples.map(s => s.accelZ || 0);

  // Step 1: Determine primary movement axis (highest range)
  const xRange = Math.max(...accelX) - Math.min(...accelX);
  const yRange = Math.max(...accelY) - Math.min(...accelY);
  const zRange = Math.max(...accelZ) - Math.min(...accelZ);

  let primarySignal;
  if (xRange >= yRange && xRange >= zRange) {
    primarySignal = accelX;
  } else if (yRange >= xRange && yRange >= zRange) {
    primarySignal = accelY;
  } else {
    primarySignal = accelZ;
  }

  // Step 2: Find the most prominent peak (by absolute value)
  let bestIdx = 0;
  let bestAbs = 0;

  for (let i = 1; i < primarySignal.length - 1; i++) {
    const val = primarySignal[i];
    const prev = primarySignal[i - 1];
    const next = primarySignal[i + 1];
    // Check if it's a local peak (positive) or valley (negative)
    const isPeak = (val > prev && val > next) || (val < prev && val < next);
    if (isPeak && Math.abs(val) > bestAbs) {
      bestAbs = Math.abs(val);
      bestIdx = i;
    }
  }

  // Fallback: use index of max absolute value
  if (bestAbs === 0) {
    const absVals = primarySignal.map(Math.abs);
    bestIdx = absVals.indexOf(Math.max(...absVals));
  }

  // Guard edges
  if (bestIdx <= 0) bestIdx = 1;
  if (bestIdx >= primarySignal.length - 1) bestIdx = primarySignal.length - 2;

  // Step 3: Calculate phase durations
  // Try to use timestamps from samples
  const timestamps = samples.map(s => s.relativeTime ?? s.timestamp_ms ?? s.timestamp ?? 0);
  const hasValidTimestamps = timestamps.some(t => t > 0) && (timestamps[timestamps.length - 1] - timestamps[0]) > 0;

  let liftingTime, loweringTime;

  if (hasValidTimestamps) {
    const startTime = timestamps[0];
    const peakTime = timestamps[bestIdx];
    const endTime = timestamps[timestamps.length - 1];
    liftingTime = (peakTime - startTime) / 1000;
    loweringTime = (endTime - peakTime) / 1000;
  } else {
    // Estimate from sample count (~50ms per sample at 20Hz)
    const totalDuration = primarySignal.length * 0.05;
    liftingTime = (bestIdx / primarySignal.length) * totalDuration;
    loweringTime = ((primarySignal.length - bestIdx) / primarySignal.length) * totalDuration;
  }

  return {
    liftingTime: Math.max(0, liftingTime),
    loweringTime: Math.max(0, loweringTime)
  };
}

export function useWorkoutSession({ 
  connected, 
  recommendedReps = 5, 
  recommendedSets = 2,
  restTime = 30,     // Custom rest time in seconds
  onIMUSample,       // NEW: Called for each IMU sample (for streaming)
  onRepDetected,     // NEW: Called when a rep is detected
  onSetComplete,
  onWorkoutComplete 
}) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const [countdownActive, setCountdownActive] = useState(false);
  const recordingStartTime = useRef(0);
  const workoutStartTime = useRef(0); // Track total workout time including breaks
  const rawDataLog = useRef([]);
  
  // *** REFS FOR CALLBACKS - AVOIDS STALE CLOSURE ISSUES ***
  // These refs always hold the latest callback versions
  const onIMUSampleRef = useRef(onIMUSample);
  const onRepDetectedRef = useRef(onRepDetected);
  const onSetCompleteRef = useRef(onSetComplete);
  const onWorkoutCompleteRef = useRef(onWorkoutComplete);
  
  // Update refs on each render to always have latest callbacks
  useEffect(() => {
    onIMUSampleRef.current = onIMUSample;
    onRepDetectedRef.current = onRepDetected;
    onSetCompleteRef.current = onSetComplete;
    onWorkoutCompleteRef.current = onWorkoutComplete;
  });
  
  // Refs to avoid closure issues in callbacks
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const countdownActiveRef = useRef(false);
  
  // Break state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakTimeRemaining, setBreakTimeRemaining] = useState(restTime);
  const [breakPaused, setBreakPaused] = useState(false);
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const breakTimerRef = useRef(null);
  
  // Workout stats tracking across all sets
  const [workoutStats, setWorkoutStats] = useState({
    totalReps: 0,
    allRepDurations: [],
    completedSets: 0,
    totalTime: 0,
    setData: [] // Track data for each completed set
  });
  
  // Timer state
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = useRef(null);
  
  // Rep counter
  const repCounterRef = useRef(new RepCounter());
  const [repStats, setRepStats] = useState(repCounterRef.current.getStats());
  
  // Workout tracking
  const [currentSet, setCurrentSet] = useState(1);
  
  // Chart data (limited for real-time display)
  const [timeData, setTimeData] = useState([]);
  const [rawAccelData, setRawAccelData] = useState([]);
  const [filteredAccelData, setFilteredAccelData] = useState([]);
  
  // Full chart data (complete workout session for workout-finished page)
  const fullTimeData = useRef([]);
  const fullRawAccelData = useRef([]);
  const fullFilteredAccelData = useRef([]);
  
  // IMU data display
  const [currentIMU, setCurrentIMU] = useState({
    accelX: 0, accelY: 0, accelZ: 0,
    gyroX: 0, gyroY: 0, gyroZ: 0,
    roll: 0, pitch: 0, yaw: 0,
    rawMagnitude: 0, filteredMagnitude: 0
  });
  
  // Statistics
  const [sampleCount, setSampleCount] = useState(0);
  const [dataRate, setDataRate] = useState(0);
  const lastSampleTime = useRef(Date.now());
  const sampleCounter = useRef(0);
  
  // Track last rep count for detecting new reps
  const lastRepCountRef = useRef(0);

  // Handle IMU data callback
  const handleIMUData = useCallback((data) => {
    // Always update display values (even during countdown)
    setCurrentIMU(data);
    
    // Update sample count
    sampleCounter.current++;
    const now = Date.now();
    if (now - lastSampleTime.current >= 1000) {
      setDataRate(sampleCounter.current);
      setSampleCount(prev => prev + sampleCounter.current);
      sampleCounter.current = 0;
      lastSampleTime.current = now;
    }
    
    // Start chart and counting after countdown completes - use refs to avoid closure issues
    if (isRecordingRef.current && !isPausedRef.current && !countdownActiveRef.current) {
      if (recordingStartTime.current === 0) {
        recordingStartTime.current = data.timestamp;
      }
      
      const relativeTime = data.timestamp - recordingStartTime.current;
      
      // Call onIMUSample callback for streaming
      if (onIMUSampleRef.current) {
        onIMUSampleRef.current({
          ...data,
          timestamp: data.timestamp,
          relativeTime
        });
      }
      
      // Log raw data
      rawDataLog.current.push({
        timestamp: relativeTime,
        ...data
      });
      
      // Update chart data
      const seconds = Math.floor(relativeTime / 1000);
      const milliseconds = relativeTime % 1000;
      const displayTime = `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
      
      // Store in full data arrays (complete workout)
      fullTimeData.current.push(displayTime);
      fullRawAccelData.current.push(data.rawMagnitude);
      fullFilteredAccelData.current.push(data.filteredMagnitude);
      
      // Update limited chart data for real-time display
      setTimeData(prev => {
        const newData = [...prev, displayTime];
        return newData.length > MAX_CHART_POINTS ? newData.slice(-MAX_CHART_POINTS) : newData;
      });
      
      setRawAccelData(prev => {
        const newData = [...prev, data.rawMagnitude];
        return newData.length > MAX_CHART_POINTS ? newData.slice(-MAX_CHART_POINTS) : newData;
      });
      
      setFilteredAccelData(prev => {
        const newData = [...prev, data.filteredMagnitude];
        return newData.length > MAX_CHART_POINTS ? newData.slice(-MAX_CHART_POINTS) : newData;
      });
      
      // Rep counting - pass complete sample object for proper ML data storage
      repCounterRef.current.addSample({
        ...data,
        relativeTime // Include relative time for timestamp
      });
      
      const newStats = repCounterRef.current.getStats();
      setRepStats(newStats);
      
      // Check if a new rep was detected
      if (newStats.repCount > lastRepCountRef.current) {
        console.log(`[WorkoutSession] Rep ${newStats.repCount} detected!`);
        lastRepCountRef.current = newStats.repCount;
        
        // Get the precise boundary info from RepCounter
        const repData = repCounterRef.current.exportData();
        const lastRep = repData.reps[repData.reps.length - 1];
        
        // *** CRITICAL FIX: Extract samples directly from RepCounter by repNumber ***
        // This matches index.html's approach - samples are assigned repNumber in allSamples
        // We pass these samples directly instead of relying on time-based filtering
        const samplesForRep = repData.samples.filter(s => s.repNumber === newStats.repCount);
        console.log(`[WorkoutSession] Rep ${newStats.repCount}: extracted ${samplesForRep.length} samples from RepCounter (indices ${lastRep?.actualStartIndex}-${lastRep?.actualEndIndex})`);
        
        // Call onRepDetected callback with samples directly from RepCounter
        // This is the SINGLE SOURCE OF TRUTH, like index.html
        if (onRepDetectedRef.current) {
          onRepDetectedRef.current({
            repNumber: newStats.repCount,
            duration: lastRep?.duration || newStats.avgRepDuration,
            peakAcceleration: lastRep?.peakValue || newStats.thresholdHigh,
            // Precise boundary times
            startTime: lastRep?.actualStartTime !== undefined ? lastRep.actualStartTime : lastRep?.startTime,
            endTime: lastRep?.actualEndTime !== undefined ? lastRep.actualEndTime : lastRep?.endTime,
            startIndex: lastRep?.actualStartIndex,
            endIndex: lastRep?.actualEndIndex,
            // *** NEW: Pass samples directly from RepCounter ***
            samples: samplesForRep
          });
        }
      }
    }
  }, []);

  // Subscribe to IMU data
  const { isSubscribed: imuSubscribed, error: imuError, resetFilters } = useIMUData(handleIMUData, null);
  
  // Sync state to refs to avoid closure issues in callbacks
  useEffect(() => {
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
    countdownActiveRef.current = countdownActive;
  }, [isRecording, isPaused, countdownActive]);

  // Timer effect - starts after countdown completes
  useEffect(() => {
    if (isRecording && !isPaused && !countdownActive) {
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isRecording, isPaused, countdownActive]);

  // Break timer effect
  useEffect(() => {
    if (isOnBreak && !breakPaused) {
      breakTimerRef.current = setInterval(() => {
        setBreakTimeRemaining(prev => {
          if (prev <= 1) {
            endBreak();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
        breakTimerRef.current = null;
      }
    }

    return () => {
      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
      }
    };
  }, [isOnBreak, breakPaused]);

  // Check if set is complete (reps reached target)
  useEffect(() => {
    if (isRecording && !isPaused && !countdownActive && !isOnBreak) {
      if (repStats.repCount >= recommendedReps && repStats.repCount > 0) {
        // Track stats for this completed set
        const currentRepData = repCounterRef.current.exportData();
        const repDurations = currentRepData.reps.map(rep => rep.duration);
        
        // Prepare rep data for this set — each rep gets its OWN data segment
        const allSamples = currentRepData.samples;
        const setRepsData = currentRepData.reps.map((rep, index) => {
          // *** Use repNumber assignment for precise extraction ***
          // This matches the index.html algorithm exactly
          const repSamples = allSamples.filter(s => s.repNumber === rep.repNumber);
          // Use filteredMagnitude for proper charting (smooth curve)
          const repChartData = repSamples.map(s => s.filteredMagnitude || s.accelMag || 0);
          
          // *** Compute phase timings locally using primary movement axis ***
          // (matching main_csv.py algorithm)
          const phaseTimings = computeLocalPhaseTimings(repSamples);
          
          return {
            repNumber: rep.repNumber,
            time: rep.duration,
            rom: rep.peakAcceleration * 10,
            peakVelocity: rep.peakVelocity || rep.peakAcceleration / 2,
            isClean: rep.duration >= 2.0 && rep.duration <= 4.0,
            chartData: repChartData,
            liftingTime: phaseTimings.liftingTime,
            loweringTime: phaseTimings.loweringTime,
            // Include raw samples for ML if needed
            samples: repSamples
          };
        });
        
        // Store this set's data
        const currentSetData = {
          setNumber: currentSet,
          reps: repStats.repCount,
          duration: elapsedTime,
          repsData: setRepsData,
          chartData: [...fullFilteredAccelData.current],
          timeData: [...fullTimeData.current]
        };
        
        // Build updated workout stats with current set included
        const updatedSetData = [...workoutStats.setData, currentSetData];
        const updatedTotalReps = workoutStats.totalReps + repStats.repCount;
        const updatedAllRepDurations = [...workoutStats.allRepDurations, ...repDurations];
        
        // Set complete - trigger break or workout complete
        if (currentSet >= recommendedSets) {
          // Last set complete - workout finished
          // Calculate ACTUAL workout duration from start to end (including breaks)
          const actualWorkoutDuration = workoutStartTime.current > 0 
            ? Math.round((Date.now() - workoutStartTime.current) / 1000)
            : workoutStats.totalTime + elapsedTime;
          
          const updatedTotalTime = actualWorkoutDuration;
          
          setWorkoutStats(prev => ({
            totalReps: updatedTotalReps,
            allRepDurations: updatedAllRepDurations,
            completedSets: currentSet,
            totalTime: updatedTotalTime,
            setData: updatedSetData
          }));
          
          setIsRecording(false);
          setIsPaused(false);
          
          // *** USE REF TO AVOID STALE CLOSURE ***
          if (onWorkoutCompleteRef.current) {
            // Use the updated stats that include the current set and ACTUAL duration
            onWorkoutCompleteRef.current({
              workoutStats: {
                totalReps: updatedTotalReps,
                allRepDurations: updatedAllRepDurations,
                completedSets: currentSet,
                totalTime: updatedTotalTime,
                setData: updatedSetData
              },
              repData: repCounterRef.current.exportData(),
              chartData: { 
                rawAccelData: fullRawAccelData.current, 
                filteredAccelData: fullFilteredAccelData.current, 
                timeData: fullTimeData.current 
              }
            });
          }
        } else {
          // More sets remaining - take a break
          // Just update the set data, don't calculate total time yet
          const updatedTotalTime = workoutStats.totalTime + elapsedTime;
          
          setWorkoutStats(prev => ({
            totalReps: updatedTotalReps,
            allRepDurations: updatedAllRepDurations,
            completedSets: prev.completedSets + 1,
            totalTime: updatedTotalTime,
            setData: updatedSetData
          }));
          
          startBreak();
          // *** USE REF TO AVOID STALE CLOSURE ***
          if (onSetCompleteRef.current) {
            onSetCompleteRef.current(currentSet);
          }
        }
      }
    }
  }, [repStats.repCount, recommendedReps, isRecording, isPaused, countdownActive, isOnBreak, currentSet, recommendedSets]);

  // Pause/Resume
  const togglePause = () => {
    setIsPaused(prev => {
      const newValue = !prev;
      isPausedRef.current = newValue;
      return newValue;
    });
  };

  // Start break between sets
  const startBreak = () => {
    const messages = [
      "You're doing amazing!",
      "Keep up the great work!",
      "Stay strong, you've got this!",
      "Almost there, keep pushing!",
      "You're crushing it!",
      "Breathe and recover!",
      "Rest up for the next set!",
      "You're making progress!"
    ];
    setMotivationalMessage(messages[Math.floor(Math.random() * messages.length)]);
    setIsOnBreak(true);
    setIsPaused(true);
    setBreakTimeRemaining(restTime);
  };

  // End break and start next set automatically
  const endBreak = async () => {
    // Fade out the break timer first
    const breakOverlay = document.querySelector('.break-overlay');
    if (breakOverlay) {
      breakOverlay.classList.add('animate-fadeOut');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    setIsOnBreak(false);
    setBreakPaused(false);
    
    // Reset reps and increment set
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
    setCurrentSet(prev => prev + 1);
    
    // *** CRITICAL: Reset lastRepCountRef so Set 2+ can detect reps ***
    // Without this, the check `newStats.repCount > lastRepCountRef.current` fails
    // because lastRepCountRef still holds Set 1's final count
    lastRepCountRef.current = 0;
    
    // Clear chart data for new set BEFORE countdown
    setTimeData([]);
    setRawAccelData([]);
    setFilteredAccelData([]);
    fullTimeData.current = [];
    fullRawAccelData.current = [];
    fullFilteredAccelData.current = [];
    recordingStartTime.current = 0;
    rawDataLog.current = [];
    resetFilters();
    setElapsedTime(0);
    
    // Run countdown
    await runCountdown();
  };

  // Stop break and start next set immediately
  const stopBreak = () => {
    if (breakTimerRef.current) {
      clearInterval(breakTimerRef.current);
      breakTimerRef.current = null;
    }
    setBreakTimeRemaining(restTime);
    endBreak();
  };
  
  // Toggle pause for break timer
  const toggleBreakPause = () => {
    setBreakPaused(prev => !prev);
  };

  // Run countdown sequence
  const runCountdown = async () => {
    // Set states for countdown phase
    setCountdownActive(true);
    countdownActiveRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setIsRecording(true);
    isRecordingRef.current = true;
    
    // Set workout start time on first set (after countdown starts)
    if (currentSet === 1 && workoutStartTime.current === 0) {
      workoutStartTime.current = Date.now();
      console.log('[WorkoutSession] Workout started at:', new Date(workoutStartTime.current).toISOString());
    }
    
    // Show countdown overlay
    setShowCountdown(true);
    setCountdownValue(3);
    
    for (let i = 3; i > 0; i--) {
      setCountdownValue(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setCountdownValue('GO!');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Add fade-out animation
    const countdownOverlay = document.querySelector('.countdown-overlay');
    if (countdownOverlay) {
      countdownOverlay.classList.add('animate-fadeOut');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // Countdown complete - enable recording and counting
    setShowCountdown(false);
    setCountdownActive(false);
    countdownActiveRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setIsRecording(true);
    isRecordingRef.current = true;
    
    // Scroll to top to show chart
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Start recording with countdown
  const startRecording = async () => {
    if (!connected || !imuSubscribed) {
      alert('Please connect to your IMU device first!');
      return;
    }
    
    // Reset data BEFORE countdown
    recordingStartTime.current = 0;
    workoutStartTime.current = 0; // Reset workout start time
    rawDataLog.current = [];
    repCounterRef.current.reset();
    resetFilters();
    setRepStats(repCounterRef.current.getStats());
    setTimeData([]);
    setRawAccelData([]);
    setFilteredAccelData([]);
    fullTimeData.current = [];
    fullRawAccelData.current = [];
    fullFilteredAccelData.current = [];
    setSampleCount(0);
    setElapsedTime(0);
    
    // Reset rep tracking for streaming
    lastRepCountRef.current = 0;
    
    console.log('[WorkoutSession] Starting recording...');
    
    // Run countdown
    await runCountdown();
  };

  // Stop recording
  const stopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setIsOnBreak(false);
    
    // Reset for next session
    setCurrentSet(1);
    workoutStartTime.current = 0;
    setWorkoutStats({ totalReps: 0, allRepDurations: [], completedSets: 0, totalTime: 0, setData: [] });
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
  };

  // Export data to CSV
  const exportToCSV = () => {
    const data = repCounterRef.current.exportData();
    const samples = data.samples;
    
    if (samples.length === 0) {
      alert('No data to export!');
      return;
    }
    
    // Create CSV header
    const headers = [
      'rep', 'timestamp', 'timestamp_ms',
      'accelX', 'accelY', 'accelZ', 'accelMag',
      'gyroX', 'gyroY', 'gyroZ',
      'roll', 'pitch', 'yaw',
      'filteredX', 'filteredY', 'filteredZ', 'filteredMag'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    // Add data rows
    samples.forEach(sample => {
      const seconds = Math.floor(sample.timestamp / 1000);
      const milliseconds = sample.timestamp % 1000;
      const formattedTime = `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
      
      const row = [
        sample.repNumber,
        formattedTime,
        sample.timestamp,
        sample.accelX.toFixed(4),
        sample.accelY.toFixed(4),
        sample.accelZ.toFixed(4),
        sample.accelMag.toFixed(4),
        sample.gyroX.toFixed(4),
        sample.gyroY.toFixed(4),
        sample.gyroZ.toFixed(4),
        sample.roll.toFixed(2),
        sample.pitch.toFixed(2),
        sample.yaw.toFixed(2),
        sample.accelX.toFixed(4),
        sample.accelY.toFixed(4),
        sample.accelZ.toFixed(4),
        sample.accelMag.toFixed(4)
      ];
      
      csvContent += row.join(',') + '\n';
    });
    
    return csvContent;
  };

  // Reset rep counter
  const resetReps = () => {
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
  };

  // Format elapsed time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    // State
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
    isSubscribed: imuSubscribed,
    restTime, // Export rest time for UI progress calculation
    
    // Chart data
    timeData,
    rawAccelData,
    filteredAccelData,
    
    // Actions
    startRecording,
    stopRecording,
    togglePause,
    toggleBreakPause,
    stopBreak,
    exportToCSV,
    resetReps,
    formatTime,
    
    // Refs for advanced use
    repCounterRef,
    rawDataLog
  };
}
