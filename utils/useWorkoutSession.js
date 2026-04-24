import { useCallback, useEffect, useRef, useState } from 'react';
import { RepCounter } from './RepCounter';
import { useIMUData } from './useIMUData';
import { getROMComputer, resetROMComputer } from './ROMComputer';
import { loadCalibration } from '../components/CalibrationModal';

const MAX_CHART_POINTS = 100; // Last 5 seconds at 20Hz

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL METRIC COMPUTATION HELPERS
// Compute peakVelocity locally so it's available immediately without
// waiting for server analysis.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute velocity metrics from rep samples using accelerometer integration
 * Physics: integrate (acceleration - gravity) to get velocity
 * Returns { peak, mean } in m/s
 *   peak = maximum absolute velocity (instantaneous peak)
 *   mean = Mean Propulsive Velocity (MPV) — primary metric for fatigue detection
 *         MPV only includes the propulsive phase (net accel > 0), excluding deceleration
 */
function computeLocalVelocity(samples, isFirstRepInSet = false) {
  if (!samples || samples.length < 3) return { peak: 0, mean: 0 };
  
  const accelMag = samples.map(s => s.accelMag || s.filteredMagnitude || 0);
  const timestamps = samples.map(s => s.relativeTime ?? s.timestamp ?? 0);
  
  // ── Robust gravity baseline estimation ──────────────────────────────────
  // Use MEDIAN of all samples instead of just first 3.
  // During a rep, the accelerometer reads near gravity for most of the time
  // (at rest positions, transitions). The median is robust against the
  // concentric/eccentric acceleration spikes.
  // This prevents the first rep from getting an inflated velocity when the
  // backward scan includes extra pre-movement resting samples.
  const sorted = [...accelMag].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const gravityBaseline = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  
  // Net acceleration (subtract gravity)
  const netAccel = accelMag.map(a => a - gravityBaseline);
  
  // ── First-rep startup transient correction ──────────────────────────────
  // Problem: The first rep of each set starts from dead rest. There is nothing
  // canceling gravity initially — no eccentric momentum from a previous rep.
  // The sudden rest→motion transition creates an artificially high acceleration
  // spike that, when integrated, inflates the velocity reading for rep 1.
  // This makes ALL other reps appear to have high velocity loss (>20%) and
  // get classified as "ineffective" when they are actually performing normally.
  //
  // Fix: Detect the initial transient spike in the first ~25% of samples.
  // If the peak acceleration in that window is significantly higher than the
  // steady-state acceleration of the rest of the rep, cap it to remove the
  // artifact and recover the true rep velocity.
  if (isFirstRepInSet && netAccel.length > 10) {
    const absNetAccel = netAccel.map(Math.abs);
    const quarterLen = Math.ceil(netAccel.length * 0.25);
    
    // Peak acceleration in startup region (first 25% of samples)
    const initialMax = Math.max(...absNetAccel.slice(0, quarterLen));
    
    // Median acceleration in the rest of the rep (true working level)
    const restSlice = absNetAccel.slice(quarterLen);
    const restSorted = [...restSlice].sort((a, b) => a - b);
    const restMedian = restSorted[Math.floor(restSorted.length / 2)] || 0;
    
    // If initial spike is >1.5x the steady-state level, it's a startup artifact
    // The dead-start gravity transition inflates the acceleration reading.
    // But rep 1 IS legitimately slightly faster (freshest muscles), so we don't
    // want to flatten it completely — just remove the sensor artifact.
    if (restMedian > 0 && initialMax > restMedian * 1.5) {
      // Cap at 1.5x steady-state: removes the artifact while preserving
      // the real first-rep velocity advantage (~5-15% faster is normal in VBT)
      const capValue = restMedian * 1.5;
      for (let i = 0; i < quarterLen; i++) {
        if (Math.abs(netAccel[i]) > capValue) {
          netAccel[i] = Math.sign(netAccel[i]) * capValue;
        }
      }
    }
  }
  
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
function computeLocalPhaseTimings(samples, repInfo = null, exerciseType = null) {
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
    
    // Determine the physical turning point: the extremum FURTHEST from the
    // average of the start and end values. This correctly identifies the peak
    // of movement regardless of exercise type:
    //  - Curls: min pitch (arm curled) is furthest from rest → turning point
    //  - Bench press: max pitch (arms extended) is furthest from chest → turning point
    //  - Squats, pulldowns, etc.: automatically correct
    const edgeAvg = (startVal + endVal) / 2;
    const distToMin = Math.abs(minVal - edgeAvg);
    const distToMax = Math.abs(maxVal - edgeAvg);
    const turningIdx = distToMin >= distToMax ? minIdx : maxIdx;
    const turningVal = primarySignal[turningIdx];
    
    // Calculate total angular movement from start to turning point
    const phase1AngleChange = Math.abs(startVal - turningVal);
    const phase2AngleChange = Math.abs(endVal - turningVal);
    const totalAngleChange = phase1AngleChange + phase2AngleChange;
    
    // Determine which end is "rest" and which is "peak".
    // Rest = the extremum that is NOT the turning point.
    const restVal = turningIdx === minIdx ? maxVal : minVal;
    const startDistFromRest = Math.abs(startVal - restVal);
    const startDistFromPeak = Math.abs(startVal - turningVal);
    const startsNearRest = startDistFromRest < startDistFromPeak;
    
    // Time-based phase calculation
    const turningTimeMs = hasValidTimestamps 
      ? (timestamps[turningIdx] - timestamps[0])
      : (turningIdx / n) * totalDurationMs;
    const afterTurningMs = totalDurationMs - turningTimeMs;
    
    let liftingTimeMs, loweringTimeMs;
    
    // Check if there's a clear lower→lift→lower pattern
    // This happens when rest position comes BETWEEN start and turning point
    const restIdx = turningIdx === minIdx ? maxIdx : minIdx;
    const totalRange = maxVal - minVal;
    const startDistFromRestPos = Math.abs(startVal - restVal);
    const startFarFromRest = startDistFromRestPos > totalRange * 0.10;
    
    if (restIdx < turningIdx && restIdx > 2 && startFarFromRest) {
      // Pattern: [partial lower] → rest → turning point → [partial lower]
      // The lifting phase is strictly: rest → turning point
      const restTimeMs = hasValidTimestamps 
        ? (timestamps[restIdx] - timestamps[0])
        : (restIdx / n) * totalDurationMs;
      const liftPhaseMs = turningTimeMs - restTimeMs;
      
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
      // Started from peak position - Phase 1 is completing previous rep's lowering
      // Find the rest position to determine where lifting starts
      
      if (restIdx < turningIdx) {
        // Sequence: start → rest → turning point → end
        // Lowering: start to rest, Lifting: rest to turning, Lowering: turning to end
        const toRestMs = hasValidTimestamps 
          ? (timestamps[restIdx] - timestamps[0])
          : (restIdx / n) * totalDurationMs;
        const liftMs = turningTimeMs - toRestMs;
        
        liftingTimeMs = liftMs;
        loweringTimeMs = totalDurationMs - liftMs;
      } else {
        // rest is after turning - unusual sequence, use 50/50 with slight eccentric bias
        liftingTimeMs = totalDurationMs * 0.45;
        loweringTimeMs = totalDurationMs * 0.55;
      }
    }
    
    let liftingTime = liftingTimeMs / 1000;
    let loweringTime = loweringTimeMs / 1000;
    const total = liftingTime + loweringTime;
    
    // Back squat specific correction (exercise type 3) - use OLD logic
    // Revert to original 30-70% bounds for back squats to restore previous behavior
    if (exerciseType === 3) {
      // Original sanity bounds: phases should be between 30% and 70%
      // Real-world lifting rarely has a phase shorter than 30% of total duration
      const liftRatio = liftingTime / total;
      if (liftRatio < 0.30) {
        liftingTime = total * 0.35;
        loweringTime = total * 0.65;
      } else if (liftRatio > 0.70) {
        liftingTime = total * 0.55;
        loweringTime = total * 0.45;
      }
      console.log(`[PhaseTimings] Back squat (OLD logic): turningIdx=${exerciseType}, lift=${liftingTime.toFixed(2)}s, lower=${loweringTime.toFixed(2)}s`);
    } else {
      // Sanity bounds for other exercises: phases should be between 30% and 70%
      // Real-world lifting rarely has a phase shorter than 30% of total duration
      const liftRatio = liftingTime / total;
      if (liftRatio < 0.30) {
        liftingTime = total * 0.35;
        loweringTime = total * 0.65;
      } else if (liftRatio > 0.70) {
        liftingTime = total * 0.55;
        loweringTime = total * 0.45;
      }
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
  [liftingTime, loweringTime] = [loweringTime, liftingTime];

  // Sanity bounds for accel fallback: phases between 30% and 70%
  const totalAccel = liftingTime + loweringTime;
  if (totalAccel > 0) {
    const accelLiftRatio = liftingTime / totalAccel;
    if (accelLiftRatio < 0.30) {
      liftingTime = totalAccel * 0.35;
      loweringTime = totalAccel * 0.65;
    } else if (accelLiftRatio > 0.70) {
      liftingTime = totalAccel * 0.55;
      loweringTime = totalAccel * 0.45;
    }
  }

  return { liftingTime: Math.max(0, liftingTime), loweringTime: Math.max(0, loweringTime) };
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
  
  // Inactivity detection state
  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const lastActivityTimeRef = useRef(Date.now());
  const inactivityCheckIntervalRef = useRef(null);
  const lastAccelMagRef = useRef(0);
  const INACTIVITY_THRESHOLD_MS = 10000; // 10 seconds
  const ACCEL_CHANGE_THRESHOLD = 0.05; // m/s² - minimum change to count as activity
  
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
      
      // *** INACTIVITY DETECTION ***
      // Track significant acceleration changes to detect if user is still active
      const currentAccelMag = data.filteredMagnitude || data.accelMag || 0;
      const accelChange = Math.abs(currentAccelMag - lastAccelMagRef.current);
      
      if (accelChange > ACCEL_CHANGE_THRESHOLD) {
        // Significant movement detected - update last activity time
        lastActivityTimeRef.current = Date.now();
        lastAccelMagRef.current = currentAccelMag;
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

        // Get the precise boundary info from RepCounter FIRST
        // We need the samples to pass to ROMComputer for accurate ROM calculation
        const repData = repCounterRef.current.exportData();
        const lastRep = repData.reps[repData.reps.length - 1];
        const currentRepSamples = repData.samples.filter(s => s.repNumber === newStats.repCount);

        // Complete the rep in ROMComputer to get real ROM value
        // Pass the actual rep samples for accurate per-rep ROM (matches calibration behavior)
        let repROMResult = null;
        if (romComputerRef.current) {
          repROMResult = romComputerRef.current.completeRep(currentRepSamples);
          if (repROMResult) {
            console.log(`[WorkoutSession] Rep ${newStats.repCount} ROM: ${repROMResult.romValue.toFixed(1)}${repROMResult.unit === 'deg' ? '°' : ' cm'}${repROMResult.fulfillment ? ` (${repROMResult.fulfillment.toFixed(0)}% of target)` : ''}`);
          }
        }
        const countDirection = repCounterRef.current?.countDirection || 'both';

        // For BOTH, FULL-CYCLE, PEAK-TO-VALLEY, and ORIENTATION-VALLEY modes: 
        // Rep is already counted at end of eccentric (full cycle captured)
        // The samples are complete - fire callback immediately
        //
        // ALSO: For VALLEY-TO-PEAK mode, fire immediately because RepCounter
        // handles the full cycle with pendingRep mechanism (finalized at set end)
        // This prevents the 1-3 second delay from waiting for pitch/accel return
        if (countDirection === 'both' || countDirection === 'full-cycle' || 
            countDirection === 'peak-to-valley' || countDirection === 'orientation-valley' ||
            countDirection === 'valley-to-peak') {
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
          // For other modes: defer until pitch returns
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

      // ── Return-to-rest check: fire deferred onRepDetected ─────────────────────
      // Every sample, check if the sensor has returned close enough to the start
      // position, signalling the end of the eccentric phase.
      // 
      // For DUMBBELL exercises: Use pitch-based detection (sensor rotates 40°+)
      // For BARBELL exercises: Use accel magnitude return-to-baseline (pitch change is minimal ~2-3°)
      if (pendingRepCallbackRef.current) {
        const pending = pendingRepCallbackRef.current;
        const timeSinceDetection = relativeTime - pending.detectedAtTime;
        
        // Detect if this is a stroke exercise (barbell/weight stack) vs angle exercise (dumbbell)
        const isStrokeExercise = romComputerRef.current && 
          romComputerRef.current.getROMType(romComputerRef.current.exerciseType) === 'stroke';
        
        let repComplete = false;
        let completionReason = '';
        
        if (isStrokeExercise) {
          // *** BARBELL/WEIGHT STACK: Accel-based return detection ***
          // Track accel magnitude deviation from gravity baseline (~9.81 m/s²)
          const accelMag = data.filteredMagnitude || data.accelMag || data.rawMagnitude || 9.81;
          const baselineAccel = pending.baselineAccel ?? accelMag;
          const accelDev = Math.abs(accelMag - baselineAccel);
          
          // Initialize baseline from first sample after detection
          if (!pending.baselineAccel) {
            pending.baselineAccel = 9.81; // Gravity baseline
          }
          
          // Track peak deviation during motion
          if (!pending.peakAccelDev || accelDev > pending.peakAccelDev) {
            pending.peakAccelDev = accelDev;
          }
          
          // Also track gyro for stillness detection
          const gyroMag = Math.sqrt((data.gyroX || 0)**2 + (data.gyroY || 0)**2 + (data.gyroZ || 0)**2);
          const gyroMagRad = gyroMag * (Math.PI / 180); // Assume degrees
          
          // Stillness thresholds (relaxed for hand vibration)
          const STILL_ACCEL_DEV = 0.3; // m/s² from baseline
          const STILL_GYRO_RAD = 0.15; // rad/s
          const isCurrentlyStill = accelDev < STILL_ACCEL_DEV && gyroMagRad < STILL_GYRO_RAD;
          
          // Track consecutive still samples
          if (isCurrentlyStill) {
            pending.stillCounter = (pending.stillCounter || 0) + 1;
          } else {
            pending.stillCounter = 0;
          }
          
          // Debug: Log status every second
          if (!pending.lastDebugLog || timeSinceDetection - (pending.lastDebugLog || 0) > 1000) {
            console.log(`[WorkoutSession] Rep ${pending.repNumber} waiting (stroke): accelDev=${accelDev.toFixed(2)}, peakDev=${(pending.peakAccelDev || 0).toFixed(2)}, stillCount=${pending.stillCounter || 0}, elapsed=${timeSinceDetection.toFixed(0)}ms`);
            pending.lastDebugLog = timeSinceDetection;
          }
          
          // Complete when: enough time passed + sensor is still + had significant motion
          const MIN_ECCENTRIC_MS = 1200; // Slightly shorter for stroke exercises
          const STILL_SAMPLES_NEEDED = 4; // ~200ms at 20Hz, ~400ms at 10Hz
          const MIN_PEAK_ACCEL_DEV = 0.5; // Must have seen at least 0.5 m/s² deviation during rep
          
          const hasMovedEnough = (pending.peakAccelDev || 0) >= MIN_PEAK_ACCEL_DEV;
          if (timeSinceDetection > MIN_ECCENTRIC_MS && 
              (pending.stillCounter || 0) >= STILL_SAMPLES_NEEDED && 
              hasMovedEnough) {
            repComplete = true;
            completionReason = `accel returned (stillCount=${pending.stillCounter}, peakDev=${(pending.peakAccelDev || 0).toFixed(2)})`;
          }
        } else {
          // *** DUMBBELL: Pitch-based return detection ***
          const pitchDiff = Math.abs((data.pitch ?? 0) - pending.startPitch);
          
          // Track peak pitch during eccentric phase
          if (!pending.peakPitchDiff || pitchDiff > pending.peakPitchDiff) {
            pending.peakPitchDiff = pitchDiff;
          }
          
          // Debug: Log status every second
          if (!pending.lastDebugLog || timeSinceDetection - (pending.lastDebugLog || 0) > 1000) {
            console.log(`[WorkoutSession] Rep ${pending.repNumber} waiting (angle): pitchDiff=${pitchDiff.toFixed(1)}°, peakSoFar=${(pending.peakPitchDiff || 0).toFixed(1)}°, elapsed=${timeSinceDetection.toFixed(0)}ms`);
            pending.lastDebugLog = timeSinceDetection;
          }
          
          const MIN_ECCENTRIC_MS = 1500;
          const PITCH_RETURN_THRESHOLD = 15; // degrees
          const MIN_PEAK_MOVEMENT = 40; // degrees
          
          const hasMovedEnough = (pending.peakPitchDiff || 0) >= MIN_PEAK_MOVEMENT;
          if (timeSinceDetection > MIN_ECCENTRIC_MS && 
              pitchDiff < PITCH_RETURN_THRESHOLD && 
              hasMovedEnough) {
            repComplete = true;
            completionReason = `pitch returned (diff=${pitchDiff.toFixed(1)}°, peak=${(pending.peakPitchDiff || 0).toFixed(1)}°)`;
          }
        }
        
        // *** TIMEOUT FALLBACK: Fire after max expected eccentric duration ***
        // If neither accel nor pitch detection works, use time-based fallback
        const MAX_ECCENTRIC_MS = 3500; // 3.5 seconds max for eccentric phase
        if (!repComplete && timeSinceDetection > MAX_ECCENTRIC_MS) {
          repComplete = true;
          completionReason = `timeout (${timeSinceDetection.toFixed(0)}ms)`;
        }
        
        if (repComplete) {
          const allRepData = repCounterRef.current.exportData();
          const repSamples = allRepData.samples.filter(s => s.repNumber === pending.repNumber);
          
          console.log(`[WorkoutSession] Rep ${pending.repNumber} complete — ${completionReason}, eccentric=${timeSinceDetection.toFixed(0)}ms, ${repSamples.length} samples`);
          
          if (onRepDetectedRef.current && repSamples.length > 0) {
            const startTime = pending.lastRepMeta?.actualStartTime ?? 0;
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

  // Inactivity detection effect
  useEffect(() => {
    if (isRecording && !isPaused && !countdownActive && !showInactivityModal) {
      // Check for inactivity every 2 seconds
      inactivityCheckIntervalRef.current = setInterval(() => {
        const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
        
        if (timeSinceLastActivity >= INACTIVITY_THRESHOLD_MS) {
          console.log('[WorkoutSession] Inactivity detected - pausing session');
          // Pause the session
          setIsPaused(true);
          isPausedRef.current = true;
          // Show inactivity modal
          setShowInactivityModal(true);
          // Clear the check interval
          if (inactivityCheckIntervalRef.current) {
            clearInterval(inactivityCheckIntervalRef.current);
            inactivityCheckIntervalRef.current = null;
          }
        }
      }, 2000);
    } else {
      if (inactivityCheckIntervalRef.current) {
        clearInterval(inactivityCheckIntervalRef.current);
        inactivityCheckIntervalRef.current = null;
      }
    }

    return () => {
      if (inactivityCheckIntervalRef.current) {
        clearInterval(inactivityCheckIntervalRef.current);
      }
    };
  }, [isRecording, isPaused, countdownActive, showInactivityModal]);

  // Inactivity modal handlers
  const handleInactivityResume = useCallback(() => {
    console.log('[WorkoutSession] User resumed from inactivity');
    setShowInactivityModal(false);
    setIsPaused(false);
    isPausedRef.current = false;
    // Reset activity tracking
    lastActivityTimeRef.current = Date.now();
  }, []);

  const handleInactivityEndSession = useCallback(() => {
    console.log('[WorkoutSession] User ended session from inactivity modal');
    setShowInactivityModal(false);
    // End the workout
    completeWorkout();
  }, []);

  // Timer effect - manages timer based on state changes
  // Note: Timer is also started directly in runCountdown() for precise timing
  useEffect(() => {
    if (isRecording && !isPaused && !countdownActive) {
      // Only start if not already running (runCountdown may have started it)
      if (!timerIntervalRef.current) {
        console.log('[WorkoutSession] Timer effect: Starting timer');
        timerIntervalRef.current = setInterval(() => {
          setElapsedTime(prev => prev + 1);
        }, 1000);
      }
    } else {
      // Only clear if we're truly stopping (not just during countdown)
      // During countdown, isRecording=true but countdownActive=true, so timer should stay off
      // After countdown, both isRecording=true and countdownActive=false, so timer should run
      if (timerIntervalRef.current && (!isRecording || isPaused)) {
        console.log('[WorkoutSession] Timer effect: Clearing timer (isRecording:', isRecording, 'isPaused:', isPaused, ')');
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
        
        // *** NO DELAY FOR VALLEY-TO-PEAK MODE ***
        // RepCounter's pendingRep mechanism + finalizePendingReps() already handles
        // capturing the full cycle. The 2-second delay is unnecessary and causes
        // a poor user experience.
        
        // Clear any existing delay states
        if (finalRepDelayRef.current) {
          clearTimeout(finalRepDelayRef.current);
          finalRepDelayRef.current = null;
        }
        awaitingFinalLoweringRef.current = false;
        delayCompletedRef.current = false;
        
        // Flush any pending rep callback
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
        
        // *** FINALIZE PENDING REPS BEFORE SET COMPLETION ***
        // For valley-to-peak mode (back squats, bench press), the last rep may be pending
        // waiting for the lowering phase. Finalize it now to include all samples.
        if (repCounterRef.current.finalizePendingReps) {
          repCounterRef.current.finalizePendingReps();
          console.log('[WorkoutSession] Finalized pending reps at set completion');
        }
        
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
          const currentExerciseType = romComputerRef.current?.exerciseType || null;
          const phaseTimings = computeLocalPhaseTimings(repSamples, rep, currentExerciseType);
          
          // Compute local velocity metrics immediately
          const isFirstRepInSet = rep.repNumber === 1;
          const localVelocity = computeLocalVelocity(repSamples, isFirstRepInSet);
          
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
            isClean: rep.duration >= 2.0 && rep.duration <= 4.0,
            chartData: repChartData,
            liftingTime: phaseTimings.liftingTime,
            loweringTime: phaseTimings.loweringTime,
            // Include raw samples for ML if needed
            samples: repSamples
          };
        });
        
        // ── First-rep velocity compensation ────────────────────────────────
        // Rep 1 starts from dead rest (no eccentric momentum), causing accelerometer
        // velocity to be inflated by gravity transition. Compare Rep 1 to median of
        // reps 2+; if >1.25x, cap at 1.10x median (allows ~10% first-rep freshness).
        // Applied ONCE here so the corrected value is saved to Firestore.
        if (setRepsData.length >= 3) {
          const MIN_VELOCITY = 0.02;
          const rep1 = setRepsData[0];
          const vel1 = rep1.meanVelocity > MIN_VELOCITY ? rep1.meanVelocity : rep1.peakVelocity;
          
          if (vel1 > MIN_VELOCITY) {
            const otherVels = setRepsData.slice(1)
              .map(r => r.meanVelocity > MIN_VELOCITY ? r.meanVelocity : r.peakVelocity)
              .filter(v => v > MIN_VELOCITY);
            
            if (otherVels.length >= 2) {
              const sorted = [...otherVels].sort((a, b) => a - b);
              const median = sorted[Math.floor(sorted.length / 2)];
              
              if (median > 0 && vel1 > median * 1.25) {
                const corrected = Math.round(median * 1.10 * 1000) / 1000;
                // Update whichever velocity field was used
                if (rep1.meanVelocity > MIN_VELOCITY) {
                  setRepsData[0] = { ...rep1, meanVelocity: corrected };
                } else {
                  setRepsData[0] = { ...rep1, peakVelocity: corrected };
                }
                console.log(`[useWorkoutSession] Rep 1 velocity corrected: ${vel1.toFixed(3)} → ${corrected.toFixed(3)} (median: ${median.toFixed(3)})`);
              }
            }
          }
        }
        
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
          
          // *** FINALIZE PENDING REPS BEFORE WORKOUT COMPLETION ***
          // For valley-to-peak mode (back squats, bench press), the last rep may be pending
          if (repCounterRef.current.finalizePendingReps) {
            repCounterRef.current.finalizePendingReps();
            console.log('[WorkoutSession] Finalized pending reps at workout completion');
          }
          
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
    
    // *** CRITICAL: Start elapsed timer IMMEDIATELY to avoid delay ***
    // The useEffect timer depends on async state updates which can lag behind
    // Starting the timer here ensures it's in sync with when recording actually starts
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    timerIntervalRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    
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
      const currentExerciseType = romComputerRef.current?.exerciseType || null;
      const phaseTimings = computeLocalPhaseTimings(repSamples, rep, currentExerciseType);
      
      // Compute local velocity metrics immediately
      const isFirstRepInSet = rep.repNumber === 1;
      const localVelocity = computeLocalVelocity(repSamples, isFirstRepInSet);

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
        isClean: rep.duration >= 2.0 && rep.duration <= 4.0,
        chartData: repChartData,
        liftingTime: phaseTimings.liftingTime,
        loweringTime: phaseTimings.loweringTime,
        samples: repSamples
      };
    });

    // ── First-rep velocity compensation (same as main path) ──────────────
    // Rep 1 starts from dead rest (no eccentric momentum), causing accelerometer
    // velocity to be inflated by gravity transition. Compare Rep 1 to median of
    // reps 2+; if >1.25x, cap at 1.10x median (allows ~10% first-rep freshness).
    if (setRepsData.length >= 3) {
      const MIN_VELOCITY = 0.02;
      const rep1 = setRepsData[0];
      const vel1 = rep1.meanVelocity > MIN_VELOCITY ? rep1.meanVelocity : rep1.peakVelocity;
      
      if (vel1 > MIN_VELOCITY) {
        const otherVels = setRepsData.slice(1)
          .map(r => r.meanVelocity > MIN_VELOCITY ? r.meanVelocity : r.peakVelocity)
          .filter(v => v > MIN_VELOCITY);
        
        if (otherVels.length >= 2) {
          const sorted = [...otherVels].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          
          if (median > 0 && vel1 > median * 1.25) {
            const corrected = Math.round(median * 1.10 * 1000) / 1000;
            // Update whichever velocity field was used
            if (rep1.meanVelocity > MIN_VELOCITY) {
              setRepsData[0] = { ...rep1, meanVelocity: corrected };
            } else {
              setRepsData[0] = { ...rep1, peakVelocity: corrected };
            }
            console.log(`[useWorkoutSession:incomplete] Rep 1 velocity corrected: ${vel1.toFixed(3)} → ${corrected.toFixed(3)} (median: ${median.toFixed(3)})`);
          }
        }
      }
    }

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

      // *** FINALIZE PENDING REPS BEFORE WORKOUT COMPLETION (SKIP SET) ***
      if (repCounterRef.current.finalizePendingReps) {
        repCounterRef.current.finalizePendingReps();
        console.log('[WorkoutSession] Finalized pending reps at workout completion (skip set)');
      }

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

      // *** FINALIZE PENDING REPS BEFORE SET COMPLETION (SKIP SET) ***
      if (repCounterRef.current.finalizePendingReps) {
        repCounterRef.current.finalizePendingReps();
        console.log('[WorkoutSession] Finalized pending reps at set completion (skip set)');
      }

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
    showInactivityModal,
    
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
    handleInactivityResume,
    handleInactivityEndSession,
    
    // Refs for advanced use
    repCounterRef,
    rawDataLog,
    romComputerRef
  };
}
