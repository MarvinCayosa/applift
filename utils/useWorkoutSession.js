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
 * Compute velocity metrics from rep samples using accelerometer integration
 * Physics: integrate (acceleration - gravity) to get velocity
 * Returns { peak, mean } in m/s
 *   peak = maximum absolute velocity (instantaneous peak)
 *   mean = Mean Propulsive Velocity (MPV) — primary metric for fatigue detection
 *         MPV only includes the propulsive phase (net accel > 0), excluding deceleration
 */
function computeLocalVelocity(samples) {
  if (!samples || samples.length < 3) return { peak: 0, mean: 0 };
  
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
  
  if (duration <= 0) return { peak: 0, mean: 0 };
  
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
  
  const absVelocities = velocityProfile.map(v => Math.abs(v));
  
  // Peak velocity = max absolute velocity (instantaneous)
  const peakVelocity = Math.max(...absVelocities);
  
  // ============================================================================
  // MEAN PROPULSIVE VELOCITY (MPV) — Better for fatigue than MCV
  // ============================================================================
  // MPV = Mean velocity during propulsive phase only (net accel > threshold)
  // Excludes deceleration/"braking" phase which isn't indicative of effort
  const PROPULSIVE_THRESHOLD = 0.1; // m/s² noise floor
  const propulsiveVelocities = [];
  
  for (let i = 0; i < netAccel.length; i++) {
    if (netAccel[i] > PROPULSIVE_THRESHOLD) {
      propulsiveVelocities.push(absVelocities[i]);
    }
  }
  
  // Calculate MPV, fallback to MCV if propulsive phase not detected
  const meanVelocity = propulsiveVelocities.length > 2
    ? propulsiveVelocities.reduce((a, b) => a + b, 0) / propulsiveVelocities.length
    : absVelocities.reduce((a, b) => a + b, 0) / absVelocities.length;
  
  return {
    peak: Math.round(peakVelocity * 100) / 100,
    mean: Math.round(meanVelocity * 100) / 100
  };
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
/**
 * Compute concentric/eccentric phase timings using ORIENTATION ANGLES (pitch/roll/yaw).
 * 
 * This mirrors the ROM computation approach:
 * - Find the primary rotation axis (highest angular range)
 * - Find the physical turning point (the extremum furthest from both edges)
 * - Concentric = start → turning point (lifting phase)
 * - Eccentric  = turning point → end (lowering phase)
 * 
 * Requires samples that include pitch/roll/yaw fields (IMU fusion output).
 */
function computeLocalPhaseTimings(samples, repInfo = null) {
  if (!samples || samples.length < 3) {
    return { liftingTime: 0, loweringTime: 0 };
  }

  const timestamps = samples.map(s => s.relativeTime ?? s.timestamp_ms ?? s.timestamp ?? 0);
  const hasValidTimestamps = timestamps.some(t => t > 0) &&
    (timestamps[timestamps.length - 1] - timestamps[0]) > 0;
  const totalDurationMs = hasValidTimestamps 
    ? (timestamps[timestamps.length - 1] - timestamps[0])
    : samples.length * 50; // ~50ms per sample at 20Hz

  // ── Orientation-based detection (quaternion fusion angles) ──────────────────
  const pitch = samples.map(s => s.pitch ?? 0);
  const roll  = samples.map(s => s.roll  ?? 0);
  const yaw   = samples.map(s => s.yaw   ?? 0);
  const hasOrientation = pitch.some(p => p !== 0) || roll.some(r => r !== 0);

  if (hasOrientation) {
    // Select the axis with the highest angular range
    const pitchRange = Math.max(...pitch) - Math.min(...pitch);
    const rollRange  = Math.max(...roll)  - Math.min(...roll);
    const yawRange   = Math.max(...yaw)   - Math.min(...yaw);

    let primarySignal, axisName;
    if (pitchRange >= rollRange && pitchRange >= yawRange) {
      primarySignal = pitch;
      axisName = 'pitch';
    } else if (rollRange >= yawRange) {
      primarySignal = roll;
      axisName = 'roll';
    } else {
      primarySignal = yaw;
      axisName = 'yaw';
    }

    const n = primarySignal.length;
    const minVal = Math.min(...primarySignal);
    const maxVal = Math.max(...primarySignal);
    const minIdx = primarySignal.indexOf(minVal);
    const maxIdx = primarySignal.indexOf(maxVal);
    const startVal = primarySignal[0];
    const endVal = primarySignal[n - 1];
    
    // For dumbbell curls: min pitch = arm curled (peak of movement) = turning point
    // max pitch = arm extended (rest position)
    // The movement cycle is: rest(max) → curl(min) → rest(max)
    
    // IMPORTANT: Use min pitch as turning point for curl exercises
    // This is the top of the curl where concentric ends and eccentric begins
    const turningIdx = minIdx;
    const turningVal = minVal;
    
    // Calculate total angular movement from start to turning point
    const phase1AngleChange = Math.abs(startVal - turningVal);
    const phase2AngleChange = Math.abs(endVal - turningVal);
    const totalAngleChange = phase1AngleChange + phase2AngleChange;
    
    // If the rep starts near max pitch (rest), Phase 1 is lifting
    // If the rep starts near min pitch (curled), Phase 1 is lowering
    const startDistFromRest = Math.abs(startVal - maxVal);
    const startDistFromCurl = Math.abs(startVal - minVal);
    const startsNearRest = startDistFromRest < startDistFromCurl;
    
    // Time-based phase calculation
    const turningTimeMs = hasValidTimestamps 
      ? (timestamps[turningIdx] - timestamps[0])
      : (turningIdx / n) * totalDurationMs;
    const afterTurningMs = totalDurationMs - turningTimeMs;
    
    let liftingTimeMs, loweringTimeMs;
    
    // Check if there's a clear lower→lift→lower pattern
    // This happens when: 1) max comes before min, AND 2) we start significantly away from rest
    // If we start AT rest (close to max), it's a normal lift→lower pattern even if maxIdx < minIdx
    const startDistFromMax = Math.abs(startVal - maxVal);
    const totalRange = maxVal - minVal;
    const startFarFromRest = startDistFromMax > totalRange * 0.10; // >10% away from max
    
    if (maxIdx < minIdx && maxIdx > 2 && startFarFromRest) {
      // Pattern: [partial lower] → max (rest) → min (curl) → [partial lower]
      // The lifting phase is strictly: max → min
      const maxTimeMs = hasValidTimestamps 
        ? (timestamps[maxIdx] - timestamps[0])
        : (maxIdx / n) * totalDurationMs;
      const liftPhaseMs = turningTimeMs - maxTimeMs; // From max to min
      
      // Lowering = everything else (before max + after min)
      loweringTimeMs = totalDurationMs - liftPhaseMs;
      liftingTimeMs = liftPhaseMs;
      
      console.log(`[PhaseTimings] Detected lower→lift→lower pattern, maxIdx=${maxIdx}, liftMs=${liftingTimeMs.toFixed(0)}`);
    } else if (startsNearRest) {
      // Started at rest → Phase 1 (to turning point) is lifting
      // BUT: the rep data might be incomplete (doesn't return to rest)
      // Scale based on angle coverage to estimate full phases
      
      // Check if Phase 2 captures full return to rest
      const expectedReturnAngle = phase1AngleChange; // Should match lifting
      const returnRatio = Math.min(1.0, phase2AngleChange / expectedReturnAngle);
      
      if (returnRatio < 0.5) {
        // Very incomplete lowering - estimate based on lifting velocity
        // Assume eccentric (lowering) takes similar time as concentric (lifting)
        const estimatedFullLowerMs = turningTimeMs * 1.1; // Eccentric ~10% longer typically
        const estimatedTotalMs = turningTimeMs + estimatedFullLowerMs;
        const scaleFactor = totalDurationMs / estimatedTotalMs;
        
        liftingTimeMs = turningTimeMs * scaleFactor;
        loweringTimeMs = totalDurationMs - liftingTimeMs;
      } else {
        // Reasonable coverage - use time-based with adjustment
        // Scale Phase 2 time based on angle completion
        const adjustedLowerMs = afterTurningMs / returnRatio;
        const adjustedTotalMs = turningTimeMs + adjustedLowerMs;
        const scaleFactor = totalDurationMs / adjustedTotalMs;
        
        liftingTimeMs = turningTimeMs * scaleFactor;
        loweringTimeMs = totalDurationMs - liftingTimeMs;
      }
    } else {
      // Started from curled position - Phase 1 is completing previous rep's lowering
      // Find the max (rest position) to determine where lifting starts
      
      if (maxIdx < minIdx) {
        // Sequence: start → max (rest) → min (curl) → end
        // Lowering: start to max, Lifting: max to min, Lowering: min to end
        const toRestMs = hasValidTimestamps 
          ? (timestamps[maxIdx] - timestamps[0])
          : (maxIdx / n) * totalDurationMs;
        const liftMs = turningTimeMs - toRestMs;
        const afterCurlMs = afterTurningMs;
        
        liftingTimeMs = liftMs;
        loweringTimeMs = totalDurationMs - liftMs;
      } else {
        // max is after min - unusual sequence, use 50/50 with slight eccentric bias
        liftingTimeMs = totalDurationMs * 0.45;
        loweringTimeMs = totalDurationMs * 0.55;
      }
    }
    
    let liftingTime = liftingTimeMs / 1000;
    let loweringTime = loweringTimeMs / 1000;
    const total = liftingTime + loweringTime;
    
    // Sanity bounds: phases should be between 25% and 75%
    const liftRatio = liftingTime / total;
    if (liftRatio < 0.25) {
      liftingTime = total * 0.35;
      loweringTime = total * 0.65;
    } else if (liftRatio > 0.75) {
      liftingTime = total * 0.55;
      loweringTime = total * 0.45;
    }
    
    console.log(`[PhaseTimings] turningIdx=${turningIdx}/${n-1}, startsNear=${startsNearRest?'rest':'curl'}, lift=${liftingTime.toFixed(2)}s, lower=${loweringTime.toFixed(2)}s`);
    
    return { liftingTime: Math.max(0, liftingTime), loweringTime: Math.max(0, loweringTime) };
  }

  // ── Fallback: accelerometer-based ───────────────────────────────────────────
  // Only used when orientation angles are unavailable.
  const accelX = samples.map(s => s.accelX || 0);
  const accelY = samples.map(s => s.accelY || 0);
  const accelZ = samples.map(s => s.accelZ || 0);
  const xRange = Math.max(...accelX) - Math.min(...accelX);
  const yRange = Math.max(...accelY) - Math.min(...accelY);
  const zRange = Math.max(...accelZ) - Math.min(...accelZ);
  let primarySignal;
  if (xRange >= yRange && xRange >= zRange) primarySignal = accelX;
  else if (yRange >= zRange) primarySignal = accelY;
  else primarySignal = accelZ;

  let bestIdx = 0, bestAbs = 0;
  for (let i = 1; i < primarySignal.length - 1; i++) {
    const v = primarySignal[i];
    if (((v > primarySignal[i-1] && v > primarySignal[i+1]) ||
         (v < primarySignal[i-1] && v < primarySignal[i+1])) && Math.abs(v) > bestAbs) {
      bestAbs = Math.abs(v); bestIdx = i;
    }
  }
  if (bestAbs === 0) {
    const abs = primarySignal.map(Math.abs);
    bestIdx = abs.indexOf(Math.max(...abs));
  }
  if (bestIdx <= 0) bestIdx = 1;
  if (bestIdx >= primarySignal.length - 1) bestIdx = primarySignal.length - 2;

  let liftingTime, loweringTime;
  if (hasValidTimestamps) {
    liftingTime  = (timestamps[bestIdx]              - timestamps[0]) / 1000;
    loweringTime = (timestamps[timestamps.length - 1] - timestamps[bestIdx]) / 1000;
  } else {
    const total = primarySignal.length * 0.05;
    liftingTime  = (bestIdx / primarySignal.length) * total;
    loweringTime = ((primarySignal.length - bestIdx) / primarySignal.length) * total;
  }
  // Swap: accel peak comes early in concentric; swap so liftingTime = concentric.
  return { liftingTime: Math.max(0, loweringTime), loweringTime: Math.max(0, liftingTime) };
}

export function useWorkoutSession({ 
  connected, 
  recommendedReps = 5, 
  recommendedSets = 2,
  restTime = 30,     // Custom rest time in seconds
  equipment,         // Equipment name for ROM calibration
  workout,           // Exercise name for ROM calibration
  userId,            // User ID for user-specific calibration
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
  
  // Collect IMU samples during countdown for baseline calibration
  const countdownSamplesRef = useRef([]);
  
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
  
  // Final rep lowering phase delay (for valley-to-peak exercises like bench press)
  // When target reps are reached at the peak, we delay completion to capture lowering phase
  const finalRepDelayRef = useRef(null);
  const awaitingFinalLoweringRef = useRef(false);
  const delayCompletedRef = useRef(false); // Track when the lowering delay has completed
  const [setCompletionTrigger, setSetCompletionTrigger] = useState(0); // Force effect re-run
  const FINAL_LOWERING_DELAY_MS = 2000; // 2 seconds to capture lowering phase

  // *** QUATERNION-BASED REP COMPLETION ***
  // When a rep is detected (accel peak/valley), we DON'T immediately fire onRepDetected.
  // Instead we wait until the orientation (pitch/roll) returns to the starting position,
  // meaning the full eccentric phase has been captured in the sample buffer.
  const pendingRepCallbackRef = useRef(null);
  // { repNumber, startPitch, detectedAtTime, lastRepMeta, romResult }
  
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
      
      // Load saved calibration target ROM (user-specific)
      const calibration = loadCalibration(userId, equipment, workout);
      if (calibration && calibration.targetROM) {
        rc.targetROM = calibration.targetROM;
        rc.romCalibrated = true;
        rc.calibrationROMs = calibration.repROMs || [];
        console.log(`[WorkoutSession] Loaded ROM calibration: target=${calibration.targetROM.toFixed(1)}${rc.getUnit()}`);
      }
      
      romComputerRef.current = rc;
    }
  }, [userId, equipment, workout]);
  
  // Initialize RepCounter with exercise-specific counting direction
  // This prevents double-counting issues (e.g., bench press counting both lift and lower)
  useEffect(() => {
    if (equipment && workout) {
      // Use the standard count direction from exercise mapping (PEAK_TO_VALLEY for dumbbells)
      // Orientation-valley mode is DISABLED - it has issues with first rep detection
      repCounterRef.current.setExerciseFromNames(equipment, workout);
      // Don't override with orientation-valley mode - use acceleration-based detection
      console.log('[WorkoutSession] Using acceleration-based rep detection (PEAK_TO_VALLEY for dumbbell)');
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
    
    // Collect samples during countdown for baseline calibration
    if (countdownActiveRef.current && isRecordingRef.current) {
      countdownSamplesRef.current.push(data);
      // Keep only last 30 samples (3 seconds at 10Hz)
      if (countdownSamplesRef.current.length > 30) {
        countdownSamplesRef.current.shift();
      }
    }
    
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
      // *** STOP counting new reps once we're awaiting final eccentric capture ***
      // This prevents overcounting during the 2-second set-finalization delay.
      // The pitch-return check below still runs for the current pending rep.
      if (!awaitingFinalLoweringRef.current) {
        repCounterRef.current.addSample({
          ...data,
          relativeTime // Include relative time for timestamp
        });
      }
      
      // Feed quaternion data to ROMComputer for real ROM tracking
      if (romComputerRef.current && data.qw !== undefined) {
        romComputerRef.current.addSample(data);
        // For stroke exercises (weight stack/barbell), store displacement for charting
        // The displacement value shows actual motion better than accelMag
        if (romComputerRef.current.liveDisplacementCm !== undefined) {
          data.displacement = romComputerRef.current.liveDisplacementCm;
        }
      }
      
      const newStats = repCounterRef.current.getStats();
      setRepStats(newStats);
      
      // Check if a new rep was detected
      // Skip new rep detection if awaiting final eccentric (we're done counting)
      if (!awaitingFinalLoweringRef.current && newStats.repCount > lastRepCountRef.current) {
        console.log(`[WorkoutSession] Rep ${newStats.repCount} detected!`);
        lastRepCountRef.current = newStats.repCount;

        // Clear the post-rollback flag now that a new rep has been detected
        postRollbackRef.current = false;

        // If a previous rep is still pending (unlikely but possible), fire it immediately
        // with whatever samples are available now before starting the new pending rep.
        if (pendingRepCallbackRef.current) {
          const prev = pendingRepCallbackRef.current;
          const prevRepData = repCounterRef.current.exportData();
          const prevSamples = prevRepData.samples.filter(s => s.repNumber === prev.repNumber);
          if (onRepDetectedRef.current && prevSamples.length > 0) {
            console.log(`[WorkoutSession] Flushing pending rep ${prev.repNumber} (${prevSamples.length} samples) — next rep started`);
            onRepDetectedRef.current({
              repNumber: prev.repNumber,
              duration: prev.lastRepMeta?.duration || (prevSamples.length * 0.1),
              peakAcceleration: prev.lastRepMeta?.peakValue,
              startTime: prev.lastRepMeta?.actualStartTime,
              endTime: prevSamples[prevSamples.length - 1]?.relativeTime ?? prevSamples[prevSamples.length - 1]?.timestamp,
              samples: prevSamples
            });
          }
          pendingRepCallbackRef.current = null;
        }

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
        const countDirection = repCounterRef.current?.countDirection || 'both';

        // For BOTH, FULL-CYCLE, PEAK-TO-VALLEY, and ORIENTATION-VALLEY modes: 
        // Rep is already counted at end of eccentric (full cycle captured)
        // The samples are complete - fire callback immediately
        if (countDirection === 'both' || countDirection === 'full-cycle' || 
            countDirection === 'peak-to-valley' || countDirection === 'orientation-valley') {
          const repSamples = repData.samples.filter(s => s.repNumber === newStats.repCount);
          console.log(`[WorkoutSession] Rep ${newStats.repCount} complete (${countDirection}), ${repSamples.length} samples`);
          
          if (onRepDetectedRef.current && repSamples.length > 0) {
            const startIndex = repSamples[0]?.sampleIndex ?? lastRep?.actualStartIndex;
            const endIndex = repSamples[repSamples.length - 1]?.sampleIndex ?? lastRep?.actualEndIndex;
            
            onRepDetectedRef.current({
              repNumber: newStats.repCount,
              duration: lastRep?.duration || (repSamples.length * 0.1),
              peakAcceleration: lastRep?.peakValue,
              startTime: lastRep?.actualStartTime ?? 0,
              endTime: lastRep?.actualEndTime ?? relativeTime,
              startIndex,
              endIndex,
              samples: repSamples
            });
          }
        } else {
          // For other modes (valley-to-peak, peak-to-valley): defer until pitch returns
          // *** QUATERNION-BASED DEFERRED COMPLETION ***
          // Don't call onRepDetected yet — the eccentric phase samples haven't arrived.
          // Record the starting orientation so we can detect when the arm returns.
          const repStartSampleIdx = lastRep?.actualStartIndex ?? 0;
          const repStartPitch = repData.samples[repStartSampleIdx]?.pitch ?? data.pitch ?? 0;

          pendingRepCallbackRef.current = {
            repNumber: newStats.repCount,
            startPitch: repStartPitch,
            detectedAtTime: relativeTime,
            lastRepMeta: lastRep,
            romResult: repROMResult
          };
          console.log(`[WorkoutSession] Rep ${newStats.repCount} pending — waiting for pitch to return to ~${repStartPitch.toFixed(1)}°`);
        }
      }

      // ── Pitch-return check: fire deferred onRepDetected ─────────────────────
      // Every sample, check if orientation has returned close enough to the start
      // of the pending rep, signalling the end of the eccentric phase.
      if (pendingRepCallbackRef.current && data.pitch !== undefined) {
        const pending = pendingRepCallbackRef.current;
        const timeSinceDetection = relativeTime - pending.detectedAtTime;
        const pitchDiff = Math.abs(data.pitch - pending.startPitch);
        
        // Track peak pitch during eccentric phase for better return detection
        if (!pending.peakPitchDiff || pitchDiff > pending.peakPitchDiff) {
          pending.peakPitchDiff = pitchDiff;
        }

        // Debug: Log pitch status every second while waiting
        if (!pending.lastDebugLog || timeSinceDetection - (pending.lastDebugLog || 0) > 1000) {
          console.log(`[WorkoutSession] Rep ${pending.repNumber} waiting: pitchDiff=${pitchDiff.toFixed(1)}°, peakSoFar=${(pending.peakPitchDiff || 0).toFixed(1)}°, elapsed=${timeSinceDetection.toFixed(0)}ms`);
          pending.lastDebugLog = timeSinceDetection;
        }

        // Thresholds: 
        // - Minimum 1500ms after detection (a real rep eccentric takes 1.5-3s)
        // - Pitch must return within 15° of starting position
        // - Must have seen significant movement (peak > 40°) to avoid false triggers
        const MIN_ECCENTRIC_MS = 1500;
        const PITCH_RETURN_THRESHOLD = 15; // degrees - tighter threshold
        const MIN_PEAK_MOVEMENT = 40; // must have moved at least 40° during rep

        const hasMovedEnough = pending.peakPitchDiff >= MIN_PEAK_MOVEMENT;
        if (timeSinceDetection > MIN_ECCENTRIC_MS && pitchDiff < PITCH_RETURN_THRESHOLD && hasMovedEnough) {
          const allRepData = repCounterRef.current.exportData();
          const repSamples = allRepData.samples.filter(s => s.repNumber === pending.repNumber);

          console.log(`[WorkoutSession] Rep ${pending.repNumber} complete — pitch returned (diff=${pitchDiff.toFixed(1)}°, peakMovement=${pending.peakPitchDiff.toFixed(1)}°, eccentric=${timeSinceDetection.toFixed(0)}ms), ${repSamples.length} samples`);

          if (onRepDetectedRef.current && repSamples.length > 0) {
            const startTime = pending.lastRepMeta?.actualStartTime ?? 0;
            // Get actual sample indices for proper data extraction
            const startIndex = repSamples[0]?.sampleIndex ?? pending.lastRepMeta?.actualStartIndex;
            const endIndex = repSamples[repSamples.length - 1]?.sampleIndex ?? pending.lastRepMeta?.actualEndIndex;
            
            onRepDetectedRef.current({
              repNumber: pending.repNumber,
              duration: (relativeTime - startTime) / 1000,
              peakAcceleration: pending.lastRepMeta?.peakValue,
              startTime,
              endTime: relativeTime,
              startIndex,
              endIndex,
              samples: repSamples
            });
          }
          pendingRepCallbackRef.current = null;
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
      if (postRollbackRef.current) {
        console.log('[WorkoutSession] Skipping set completion check - post-rollback state');
        return;
      }
      // Skip if we're waiting for the final lowering phase (but not if delay has completed)
      if (awaitingFinalLoweringRef.current && !delayCompletedRef.current) {
        return;
      }
      if (repStats.repCount >= recommendedReps && repStats.repCount > 0) {
        const countDirection = repCounterRef.current?.countDirection || 'both';
        const isDumbbell = /dumbbell/i.test(equipment) || /dumbbell/i.test(workout);
        const needsLoweringDelay = countDirection === 'valley-to-peak';
        // For dumbbell exercises in orientation-valley mode, force-complete the last rep at set end
        if (isDumbbell && repCounterRef.current.forceCompleteCurrentRep) {
          const forcedRep = repCounterRef.current.forceCompleteCurrentRep();
          console.log('[WorkoutSession] Dumbbell: force-completed last rep at set end (orientation-valley mode)', forcedRep);
          
          // Trigger onRepDetected callback for the force-completed rep so it gets saved to GCS
          if (forcedRep && onRepDetectedRef.current) {
            const repData = repCounterRef.current.exportData();
            const repSamples = repData.samples.filter(s => s.repNumber === forcedRep.repNumber);
            if (repSamples.length > 0) {
              console.log(`[WorkoutSession] Triggering onRepDetected for force-completed rep ${forcedRep.repNumber} (${repSamples.length} samples)`);
              onRepDetectedRef.current({
                repNumber: forcedRep.repNumber,
                duration: forcedRep.duration,
                peakAcceleration: forcedRep.peakAcceleration || forcedRep.peakValue,
                startTime: forcedRep.actualStartTime || forcedRep.startTime,
                endTime: forcedRep.actualEndTime || forcedRep.endTime,
                samples: repSamples
              });
            }
          }
        }
        // If we're currently waiting for the delay (timeout in progress), skip
        if (finalRepDelayRef.current) {
          return;
        }
        // If we need a delay and haven't started one yet, start it now
        if (needsLoweringDelay && !awaitingFinalLoweringRef.current) {
          console.log('[WorkoutSession] 🏋️ Final rep detected — waiting for full eccentric phase (pitch return)...');
          awaitingFinalLoweringRef.current = true;
          finalRepDelayRef.current = setTimeout(() => {
            console.log('[WorkoutSession] ✅ Eccentric capture window complete — finalizing set');
            finalRepDelayRef.current = null;
            delayCompletedRef.current = true;
            if (pendingRepCallbackRef.current) {
              const pending = pendingRepCallbackRef.current;
              const flushRepData = repCounterRef.current.exportData();
              const flushSamples = flushRepData.samples.filter(s => s.repNumber === pending.repNumber);
              if (onRepDetectedRef.current && flushSamples.length > 0) {
                console.log(`[WorkoutSession] Flushing final pending rep ${pending.repNumber} at set end (${flushSamples.length} samples)`);
                const startTime = pending.lastRepMeta?.actualStartTime ?? 0;
                onRepDetectedRef.current({
                  repNumber: pending.repNumber,
                  duration: (flushSamples[flushSamples.length - 1]?.relativeTime ?? flushSamples[flushSamples.length - 1]?.timestamp ?? startTime) / 1000 - startTime / 1000,
                  peakAcceleration: pending.lastRepMeta?.peakValue,
                  startTime,
                  samples: flushSamples
                });
              }
              pendingRepCallbackRef.current = null;
            }
            setSetCompletionTrigger(prev => prev + 1);
          }, FINAL_LOWERING_DELAY_MS);
          return;
        }
        // Clear the delay states if they exist (either delay completed or not needed)
        if (finalRepDelayRef.current) {
          clearTimeout(finalRepDelayRef.current);
          finalRepDelayRef.current = null;
        }
        awaitingFinalLoweringRef.current = false;
        delayCompletedRef.current = false;
        
        // Track stats for this completed set
        const currentRepData = repCounterRef.current.exportData();
        const repDurations = currentRepData.reps.map(rep => rep.duration);
        
        // Prepare rep data for this set — each rep gets its OWN data segment
        const allSamples = currentRepData.samples;
        
        // Check if this is a stroke exercise (has displacement data)
        const isStrokeExercise = allSamples.some(s => s.displacement !== undefined);
        
        const setRepsData = currentRepData.reps.map((rep, index) => {
          // *** Use repNumber assignment for precise extraction ***
          // This matches the index.html algorithm exactly
          const repSamples = allSamples.filter(s => s.repNumber === rep.repNumber);
          // For stroke exercises: use displacement for charting (shows actual motion)
          // For angle exercises: use filteredMagnitude (shows acceleration variation)
          const repChartData = isStrokeExercise 
            ? repSamples.map(s => Math.abs(s.displacement ?? 0))
            : repSamples.map(s => s.filteredMagnitude || s.accelMag || 0);
          
          // *** Compute phase timings locally using primary movement axis ***
          // (matching main_csv.py algorithm)
          // Pass rep info with peakIndex for accurate turning point detection
          const phaseTimings = computeLocalPhaseTimings(repSamples, rep);
          
          // Compute local smoothness and velocity metrics immediately
          const localSmoothnessScore = computeLocalSmoothnessScore(repSamples);
          const localVelocity = computeLocalVelocity(repSamples);
          
          return {
            repNumber: rep.repNumber,
            time: rep.duration,
            duration: rep.duration, // Also store as 'duration' for compatibility
            durationMs: rep.duration * 1000, // Store in ms too
            rom: (romComputerRef.current ? romComputerRef.current.getROMForRep(rep.repNumber) : 0) || rep.peakAcceleration * 10,
            romFulfillment: romComputerRef.current?.repROMs?.find(r => r.repIndex === rep.repNumber)?.fulfillment || null,
            romUnit: romComputerRef.current?.getUnit() || '°',
            peakVelocity: localVelocity.peak || rep.peakVelocity || rep.peakAcceleration / 2,
            meanVelocity: localVelocity.mean || rep.meanVelocity || 0,
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
  }, [repStats.repCount, recommendedReps, isRecording, isPaused, countdownActive, isOnBreak, currentSet, recommendedSets, setCompletionTrigger]);

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
    pendingRepCallbackRef.current = null;  // Discard any pending deferred rep
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
    setCurrentSet(prev => prev + 1);
    
    // *** CRITICAL: Reset lastRepCountRef so Set 2+ can detect reps ***
    // Without this, the check `newStats.repCount > lastRepCountRef.current` fails
    // because lastRepCountRef still holds Set 1's final count
    lastRepCountRef.current = 0;
    
    // Clear any pending final rep delay from previous set
    if (finalRepDelayRef.current) {
      clearTimeout(finalRepDelayRef.current);
      finalRepDelayRef.current = null;
    }
    awaitingFinalLoweringRef.current = false;
    delayCompletedRef.current = false;
    
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
    
    // Clear countdown samples at start - fresh baseline collection
    countdownSamplesRef.current = [];
    
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
    
    // *** Set ROM baseline from countdown samples ***
    // Uses samples collected during 3-2-1 countdown for accurate baseline
    // This ensures displacement starts at 0cm when recording begins
    if (romComputerRef.current) {
      const samples = countdownSamplesRef.current;
      if (samples.length >= 5) {
        romComputerRef.current.setBaselineFromSamples(samples);
        console.log(`[WorkoutSession] ROM baseline set from ${samples.length} countdown samples`);
      } else {
        romComputerRef.current.calibrateBaseline();
        console.log('[WorkoutSession] ROM baseline reset (insufficient countdown samples)');
      }
      // Clear countdown samples for next set
      countdownSamplesRef.current = [];
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
    pendingRepCallbackRef.current = null;
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
    
    // Clear any pending final rep delay
    if (finalRepDelayRef.current) {
      clearTimeout(finalRepDelayRef.current);
      finalRepDelayRef.current = null;
    }
    awaitingFinalLoweringRef.current = false;
    delayCompletedRef.current = false;
    
    console.log('[WorkoutSession] Starting recording...');
    
    // Run countdown
    await runCountdown();
  };

  // Stop recording
  const stopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setIsOnBreak(false);
    
    // Clear final rep delay if it's running
    if (finalRepDelayRef.current) {
      clearTimeout(finalRepDelayRef.current);
      finalRepDelayRef.current = null;
    }
    awaitingFinalLoweringRef.current = false;
    delayCompletedRef.current = false;
    
    // Reset for next session
    setCurrentSet(1);
    workoutStartTime.current = 0;
    setWorkoutStats({ totalReps: 0, allRepDurations: [], completedSets: 0, totalTime: 0, setData: [] });
    pendingRepCallbackRef.current = null;
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
    pendingRepCallbackRef.current = null;
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
      // Pass rep info with peakIndex for accurate turning point detection
      const phaseTimings = computeLocalPhaseTimings(repSamples, rep);
      
      // Compute local smoothness and velocity metrics immediately
      const localSmoothnessScore = computeLocalSmoothnessScore(repSamples);
      const localVelocity = computeLocalVelocity(repSamples);

      return {
        repNumber: rep.repNumber,
        time: rep.duration,
        duration: rep.duration, // Also store as 'duration' for compatibility
        durationMs: rep.duration * 1000, // Store in ms too
        rom: (romComputerRef.current ? romComputerRef.current.getROMForRep(rep.repNumber) : 0) || rep.peakAcceleration * 10,
        romFulfillment: romComputerRef.current?.repROMs?.find(r => r.repIndex === rep.repNumber)?.fulfillment || null,
        romUnit: romComputerRef.current?.getUnit() || '°',
        peakVelocity: localVelocity.peak || rep.peakVelocity || rep.peakAcceleration / 2,
        meanVelocity: localVelocity.mean || rep.meanVelocity || 0,
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
    pendingRepCallbackRef.current = null;
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
