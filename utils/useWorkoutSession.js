import { useCallback, useEffect, useRef, useState } from 'react';
import { RepCounter } from './RepCounter';
import { useIMUData } from './useIMUData';
import { getROMComputer, resetROMComputer } from './ROMComputer';
import { loadCalibration } from '../components/CalibrationModal';

const MAX_CHART_POINTS = 100; // Last 5 seconds at 20Hz

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL METRIC COMPUTATION HELPERS
// Compute smoothnessScore and peakVelocity locally so they're available
// immediately without waiting for server analysis.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute smoothness score from rep samples (LDLJ-inspired algorithm)
 * Based on: normalized jerk + direction changes + excess peaks
 * Higher score = smoother movement
 */
function computeLocalSmoothnessScore(samples) {
  if (!samples || samples.length < 4) return 70; // Default if insufficient data
  
  const signal = samples.map(s => s.filteredMagnitude || s.accelMag || 0);
  const timestamps = samples.map(s => s.relativeTime ?? s.timestamp ?? 0);
  
  // Duration in seconds
  const duration = timestamps.length > 1 
    ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
    : samples.length * 0.05; // Estimate 50ms per sample at 20Hz
  
  if (duration <= 0) return 70;
  
  const dt = duration / (timestamps.length - 1);
  
  // Range of motion
  const rom = Math.max(...signal) - Math.min(...signal);
  const safeRom = rom < 0.1 ? 0.1 : rom;
  
  // METRIC 1: Normalized Jerk (derivative of acceleration)
  const velocity = [];
  for (let i = 1; i < signal.length; i++) {
    velocity.push((signal[i] - signal[i - 1]) / dt);
  }
  
  const jerk = [];
  for (let i = 1; i < velocity.length; i++) {
    jerk.push(Math.abs((velocity[i] - velocity[i - 1]) / dt));
  }
  
  const meanJerk = jerk.length > 0 ? jerk.reduce((a, b) => a + b, 0) / jerk.length : 0;
  const normalizedJerk = meanJerk / safeRom;
  
  // METRIC 2: Direction Changes
  let directionChanges = 0;
  for (let i = 1; i < velocity.length; i++) {
    if ((velocity[i] > 0 && velocity[i - 1] < 0) || (velocity[i] < 0 && velocity[i - 1] > 0)) {
      directionChanges++;
    }
  }
  const directionRate = directionChanges / duration;
  
  // METRIC 3: Peak Count (excess peaks indicate irregular movement)
  let peakCount = 0;
  for (let i = 1; i < signal.length - 1; i++) {
    if ((signal[i] > signal[i-1] && signal[i] > signal[i+1]) ||
        (signal[i] < signal[i-1] && signal[i] < signal[i+1])) {
      peakCount++;
    }
  }
  const excessPeaks = Math.max(0, peakCount - 2); // Expected: 1 peak and 1 valley
  
  // Combine into irregularity score (calibrated weights)
  const jerkContrib = Math.min(40, Math.max(0, normalizedJerk - 1.5) * 13.3);
  const dirContrib = Math.min(35, Math.max(0, directionRate - 0.5) * 10);
  const peakContrib = Math.min(25, excessPeaks * 3.3);
  
  const irregularityScore = jerkContrib + dirContrib + peakContrib;
  const smoothnessScore = Math.max(0, Math.min(100, 100 - irregularityScore));
  
  return Math.round(smoothnessScore);
}

/**
 * Compute peak velocity from rep samples using accelerometer integration
 * Physics: integrate (acceleration - gravity) to get velocity
 * Returns velocity in m/s
 */
function computeLocalPeakVelocity(samples) {
  if (!samples || samples.length < 3) return 0;
  
  const accelMag = samples.map(s => s.accelMag || s.filteredMagnitude || 0);
  const timestamps = samples.map(s => s.relativeTime ?? s.timestamp ?? 0);
  
  // Estimate gravity baseline from first few samples
  const baselineSamples = Math.min(3, Math.floor(accelMag.length / 4));
  const gravityBaseline = baselineSamples > 0 
    ? accelMag.slice(0, baselineSamples).reduce((a, b) => a + b, 0) / baselineSamples
    : 9.81;
  
  // Net acceleration (subtract gravity)
  const netAccel = accelMag.map(a => a - gravityBaseline);
  
  // Duration estimate
  const duration = timestamps.length > 1 && timestamps.some(t => t > 0)
    ? (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
    : samples.length * 0.05;
  
  if (duration <= 0) return 0;
  
  const dt = duration / (netAccel.length - 1);
  
  // Trapezoidal integration: acceleration -> velocity
  const velocityProfile = [0];
  for (let i = 1; i < netAccel.length; i++) {
    const v = velocityProfile[i - 1] + 0.5 * (netAccel[i] + netAccel[i - 1]) * dt;
    velocityProfile.push(v);
  }
  
  // Remove drift (linear trend)
  if (velocityProfile.length > 2) {
    const firstV = velocityProfile[0];
    const lastV = velocityProfile[velocityProfile.length - 1];
    const driftPerSample = (lastV - firstV) / (velocityProfile.length - 1);
    for (let i = 0; i < velocityProfile.length; i++) {
      velocityProfile[i] -= firstV + driftPerSample * i;
    }
  }
  
  // Peak velocity = max absolute velocity
  const peakVelocity = Math.max(...velocityProfile.map(v => Math.abs(v)));
  
  return Math.round(peakVelocity * 100) / 100; // Round to 2 decimals
}

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
  equipment,         // Equipment name for ROM calibration
  workout,           // Exercise name for ROM calibration
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
  
  // ROM Computer - integrated from index.html
  const romComputerRef = useRef(null);
  
  // Initialize ROMComputer with calibration data when equipment/workout are known
  useEffect(() => {
    if (equipment && workout) {
      const rc = resetROMComputer();
      rc.setExerciseFromNames(equipment, workout);
      
      // Load saved calibration target ROM
      const calibration = loadCalibration(equipment, workout);
      if (calibration && calibration.targetROM) {
        rc.targetROM = calibration.targetROM;
        rc.romCalibrated = true;
        rc.calibrationROMs = calibration.repROMs || [];
        console.log(`[WorkoutSession] Loaded ROM calibration: target=${calibration.targetROM.toFixed(1)}${rc.getUnit()}`);
      }
      
      romComputerRef.current = rc;
    }
  }, [equipment, workout]);
  
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

  // Flag to prevent set completion immediately after rollback
  const postRollbackRef = useRef(false);

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
      
      // Feed quaternion data to ROMComputer for real ROM tracking
      if (romComputerRef.current && data.qw !== undefined) {
        romComputerRef.current.addSample(data);
      }
      
      const newStats = repCounterRef.current.getStats();
      setRepStats(newStats);
      
      // Check if a new rep was detected
      if (newStats.repCount > lastRepCountRef.current) {
        console.log(`[WorkoutSession] Rep ${newStats.repCount} detected!`);
        lastRepCountRef.current = newStats.repCount;

        // Clear the post-rollback flag now that a new rep has been detected
        postRollbackRef.current = false;
        
        // Complete the rep in ROMComputer to get real ROM value
        let repROMResult = null;
        if (romComputerRef.current) {
          repROMResult = romComputerRef.current.completeRep();
          if (repROMResult) {
            console.log(`[WorkoutSession] Rep ${newStats.repCount} ROM: ${repROMResult.romValue.toFixed(1)}${repROMResult.unit === 'deg' ? '°' : ' cm'}${repROMResult.fulfillment ? ` (${repROMResult.fulfillment.toFixed(0)}% of target)` : ''}`);
          }
        }
        
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
      // Skip set completion check if we just rolled back from BLE disconnect
      // This prevents immediate completion when repStats already >= target after rollback
      if (postRollbackRef.current) {
        console.log('[WorkoutSession] Skipping set completion check - post-rollback state');
        return;
      }
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
          
          // Compute local smoothness and velocity metrics immediately
          const localSmoothnessScore = computeLocalSmoothnessScore(repSamples);
          const localPeakVelocity = computeLocalPeakVelocity(repSamples);
          
          return {
            repNumber: rep.repNumber,
            time: rep.duration,
            duration: rep.duration, // Also store as 'duration' for compatibility
            durationMs: rep.duration * 1000, // Store in ms too
            rom: (romComputerRef.current ? romComputerRef.current.getROMForRep(rep.repNumber) : 0) || rep.peakAcceleration * 10,
            romFulfillment: romComputerRef.current?.repROMs?.find(r => r.repIndex === rep.repNumber)?.fulfillment || null,
            romUnit: romComputerRef.current?.getUnit() || '°',
            peakVelocity: localPeakVelocity || rep.peakVelocity || rep.peakAcceleration / 2,
            smoothnessScore: localSmoothnessScore, // NEW: Local computation
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
          timeData: [...fullTimeData.current],
          // ROM calibration context for performance display
          targetROM: romComputerRef.current?.targetROM || null,
          romUnit: romComputerRef.current?.getUnit() || '°',
          romCalibrated: romComputerRef.current?.romCalibrated || false,
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
    
    // *** Reset ROM baseline at the start of each set ***
    // This eliminates varying starting positions between sets
    // The next IMU sample will become the new reference position
    if (romComputerRef.current) {
      romComputerRef.current.calibrateBaseline();
      console.log('[WorkoutSession] ROM baseline reset for new set');
    }
    
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

  /**
   * Skip the current set — saves whatever reps have been done as an incomplete set,
   * then triggers a break (or workout complete if it was the last set).
   * Returns the incomplete set data.
   */
  const skipSet = () => {
    if (!isRecording) return null;

    // Pause first
    setIsPaused(true);
    isPausedRef.current = true;

    const currentRepData = repCounterRef.current.exportData();
    const repDurations = currentRepData.reps.map(rep => rep.duration);
    const allSamples = currentRepData.samples;

    // Build repsData for whatever reps were completed
    const setRepsData = currentRepData.reps.map((rep, index) => {
      const repSamples = allSamples.filter(s => s.repNumber === rep.repNumber);
      const repChartData = repSamples.map(s => s.filteredMagnitude || s.accelMag || 0);
      const phaseTimings = computeLocalPhaseTimings(repSamples);
      
      // Compute local smoothness and velocity metrics immediately
      const localSmoothnessScore = computeLocalSmoothnessScore(repSamples);
      const localPeakVelocity = computeLocalPeakVelocity(repSamples);

      return {
        repNumber: rep.repNumber,
        time: rep.duration,
        duration: rep.duration, // Also store as 'duration' for compatibility
        durationMs: rep.duration * 1000, // Store in ms too
        rom: (romComputerRef.current ? romComputerRef.current.getROMForRep(rep.repNumber) : 0) || rep.peakAcceleration * 10,
        romFulfillment: romComputerRef.current?.repROMs?.find(r => r.repIndex === rep.repNumber)?.fulfillment || null,
        romUnit: romComputerRef.current?.getUnit() || '°',
        peakVelocity: localPeakVelocity || rep.peakVelocity || rep.peakAcceleration / 2,
        smoothnessScore: localSmoothnessScore, // NEW: Local computation
        isClean: rep.duration >= 2.0 && rep.duration <= 4.0,
        chartData: repChartData,
        liftingTime: phaseTimings.liftingTime,
        loweringTime: phaseTimings.loweringTime,
        samples: repSamples
      };
    });

    // Build set data with incomplete flag
    const currentSetData = {
      setNumber: currentSet,
      reps: repStats.repCount,
      duration: elapsedTime,
      repsData: setRepsData,
      chartData: [...fullFilteredAccelData.current],
      timeData: [...fullTimeData.current],
      incomplete: true,
      completedReps: repStats.repCount,
      plannedReps: recommendedReps,
      // ROM calibration context for performance display
      targetROM: romComputerRef.current?.targetROM || null,
      romUnit: romComputerRef.current?.getUnit() || '°',
      romCalibrated: romComputerRef.current?.romCalibrated || false,
    };

    const updatedSetData = [...workoutStats.setData, currentSetData];
    const updatedTotalReps = workoutStats.totalReps + repStats.repCount;
    const updatedAllRepDurations = [...workoutStats.allRepDurations, ...repDurations];

    if (currentSet >= recommendedSets) {
      // Last set — finish workout
      const actualWorkoutDuration = workoutStartTime.current > 0
        ? Math.round((Date.now() - workoutStartTime.current) / 1000)
        : workoutStats.totalTime + elapsedTime;

      setWorkoutStats({
        totalReps: updatedTotalReps,
        allRepDurations: updatedAllRepDurations,
        completedSets: currentSet,
        totalTime: actualWorkoutDuration,
        setData: updatedSetData
      });

      setIsRecording(false);
      setIsPaused(false);

      if (onWorkoutCompleteRef.current) {
        onWorkoutCompleteRef.current({
          workoutStats: {
            totalReps: updatedTotalReps,
            allRepDurations: updatedAllRepDurations,
            completedSets: currentSet,
            totalTime: actualWorkoutDuration,
            setData: updatedSetData
          },
          repData: currentRepData,
          chartData: {
            rawAccelData: fullRawAccelData.current,
            filteredAccelData: fullFilteredAccelData.current,
            timeData: fullTimeData.current
          }
        });
      }
    } else {
      // More sets — take a break
      const updatedTotalTime = workoutStats.totalTime + elapsedTime;

      setWorkoutStats({
        totalReps: updatedTotalReps,
        allRepDurations: updatedAllRepDurations,
        completedSets: workoutStats.completedSets + 1,
        totalTime: updatedTotalTime,
        setData: updatedSetData
      });

      startBreak();

      if (onSetCompleteRef.current) {
        onSetCompleteRef.current(currentSet);
      }
    }

    return currentSetData;
  };

  /**
   * Reset the current set — clears reps, chart data and timer for the current set only.
   * Does NOT cancel the workout or affect previous sets.
   */
  const resetCurrentSet = () => {
    if (!isRecording) return;

    // Pause recording while we reset
    setIsPaused(true);
    isPausedRef.current = true;

    // Reset rep counter
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
    lastRepCountRef.current = 0;

    // Clear chart data for this set
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

    // Resume recording (user can press play to start again)
    // Keep paused so user can decide when to start
  };

  // Format elapsed time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Truncate all session data to a checkpoint (for BLE disconnect rollback).
   * Removes any partial rep data after the last completed rep.
   *
   * @param {object} checkpoint – From SessionCheckpointManager
   * @param {number} checkpoint.repCount    – Completed reps to keep
   * @param {number} checkpoint.sampleIndex – Sample buffer length to keep
   * @param {number} checkpoint.elapsedTime – Timer to restore
   */
  const truncateToCheckpoint = useCallback((checkpoint) => {
    if (!checkpoint) return false;

    const MAX_CHART = MAX_CHART_POINTS || 100;
    const rc = repCounterRef.current;

    // 1. Truncate RepCounter
    const exportedData = rc.exportData();
    if (exportedData.reps.length > checkpoint.repCount || exportedData.samples.length > checkpoint.sampleIndex) {
      rc.truncateTo(checkpoint.repCount, checkpoint.sampleIndex);
    }

    // 2. Truncate full chart arrays
    const chartLen = checkpoint.fullChartLen || checkpoint.sampleIndex;
    if (fullTimeData.current.length > chartLen) {
      fullTimeData.current.length = chartLen;
    }
    if (fullRawAccelData.current.length > chartLen) {
      fullRawAccelData.current.length = chartLen;
    }
    if (fullFilteredAccelData.current.length > chartLen) {
      fullFilteredAccelData.current.length = chartLen;
    }

    // 3. Truncate raw data log
    if (rawDataLog.current.length > checkpoint.sampleIndex) {
      rawDataLog.current.length = checkpoint.sampleIndex;
    }

    // 4. Update React state
    setRepStats(rc.getStats());
    setElapsedTime(checkpoint.elapsedTime);
    lastRepCountRef.current = checkpoint.repCount;

    // 5. Set post-rollback flag to prevent immediate set completion
    postRollbackRef.current = true;

    // 5. Rebuild display chart from truncated full arrays
    setTimeData(fullTimeData.current.slice(-MAX_CHART));
    setRawAccelData(fullRawAccelData.current.slice(-MAX_CHART));
    setFilteredAccelData(fullFilteredAccelData.current.slice(-MAX_CHART));

    console.log('[WorkoutSession] Truncated to checkpoint — repCount:', checkpoint.repCount, 'samples:', checkpoint.sampleIndex);
    return true;
  }, []);

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
    skipSet,
    resetCurrentSet,
    formatTime,
    truncateToCheckpoint,
    
    // Refs for advanced use
    repCounterRef,
    rawDataLog,
    romComputerRef
  };
}
