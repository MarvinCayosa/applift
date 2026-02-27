/**
 * Workout Analysis Service
 * 
 * Comprehensive workout analytics computation migrated from Python scripts.
 * Includes: fatigue analysis, consistency scoring, smoothness metrics, ROM calculation,
 * and feature extraction for ML classification.
 * 
 * Core Algorithms:
 * - Fatigue: F = 0.35·D_ω + 0.25·I_T + 0.20·I_J + 0.20·I_S
 * - Consistency: CV-based scoring (100 - CV × 333)
 * - Smoothness: Normalized jerk + direction changes + peak count
 * - ROM: Accelerometer-based tilt angle in degrees
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const QUALITY_NAMES_BY_EXERCISE = {
  // Dumbbell exercises
  'Concentration Curls': { 0: 'Clean', 1: 'Uncontrolled Movement', 2: 'Abrupt Initiation' },
  'Overhead Extension': { 0: 'Clean', 1: 'Uncontrolled Movement', 2: 'Abrupt Initiation' },
  // Barbell exercises
  'Bench Press': { 0: 'Clean', 1: 'Uncontrolled Movement', 2: 'Inclination Asymmetry' },
  'Back Squat': { 0: 'Clean', 1: 'Uncontrolled Movement', 2: 'Inclination Asymmetry' },
  // Weight Stack exercises
  'Lateral Pulldown': { 0: 'Clean', 1: 'Pulling Too Fast', 2: 'Releasing Too Fast' },
  'Seated Leg Extension': { 0: 'Clean', 1: 'Pulling Too Fast', 2: 'Releasing Too Fast' },
};

const FATIGUE_THRESHOLDS = {
  minimal: 15,
  low: 30,
  moderate: 50,
  high: 70,
  // >= 70 = severe
};

const CONSISTENCY_THRESHOLDS = {
  excellent: 0.08,  // CV < 8%
  good: 0.15,       // CV 8-15%
  fair: 0.25,       // CV 15-25%
  // > 25% = poor
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate mean of array
 */
const mean = (arr) => {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

/**
 * Calculate standard deviation
 */
const std = (arr) => {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / arr.length;
  return Math.sqrt(variance);
};

/**
 * Calculate percentile
 */
const percentile = (arr, p) => {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

/**
 * Simple linear regression slope
 */
const linearRegressionSlope = (values) => {
  if (!values || values.length < 2) return 0;
  const n = values.length;
  const indices = values.map((_, i) => i);
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumXX = indices.reduce((sum, x) => sum + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
};

/**
 * Find peaks in signal using prominence-based detection
 */
const findPeaks = (signal, prominenceThreshold = 0.05) => {
  if (!signal || signal.length < 3) return { peaks: [], valleys: [] };
  
  const peaks = [];
  const valleys = [];
  const range = Math.max(...signal) - Math.min(...signal);
  const minProminence = range * prominenceThreshold;
  
  for (let i = 1; i < signal.length - 1; i++) {
    // Check for peak
    if (signal[i] > signal[i - 1] && signal[i] > signal[i + 1]) {
      const leftDepth = signal[i] - Math.min(...signal.slice(Math.max(0, i - 5), i));
      const rightDepth = signal[i] - Math.min(...signal.slice(i + 1, Math.min(signal.length, i + 6)));
      const prominence = Math.min(leftDepth, rightDepth);
      if (prominence >= minProminence) {
        peaks.push({ index: i, value: signal[i], prominence });
      }
    }
    // Check for valley
    if (signal[i] < signal[i - 1] && signal[i] < signal[i + 1]) {
      const leftHeight = Math.max(...signal.slice(Math.max(0, i - 5), i)) - signal[i];
      const rightHeight = Math.max(...signal.slice(i + 1, Math.min(signal.length, i + 6))) - signal[i];
      const prominence = Math.min(leftHeight, rightHeight);
      if (prominence >= minProminence) {
        valleys.push({ index: i, value: signal[i], prominence });
      }
    }
  }
  
  return { peaks, valleys };
};

// ============================================================================
// CORE METRIC COMPUTATIONS
// ============================================================================

/**
 * Compute angle from accelerometer data (degrees)
 * Returns tilt angle: 0° = vertical, 90° = horizontal
 */
export const computeAngleFromAccelerometer = (accelX, accelY, accelZ) => {
  if (!accelX || !accelY || !accelZ || accelX.length === 0) {
    return [];
  }
  
  // Compute both roll and pitch angles
  const rollAngles = [];
  const pitchAngles = [];
  
  for (let i = 0; i < accelX.length; i++) {
    const x = accelX[i];
    const y = accelY[i];
    const z = accelZ[i];
    
    // Calculate magnitude
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    if (magnitude === 0) {
      rollAngles.push(0);
      pitchAngles.push(0);
      continue;
    }
    
    // Pitch: rotation around X-axis (Y vs Z)
    const pitch = Math.atan2(y, Math.sqrt(x * x + z * z));
    pitchAngles.push((pitch * 180 / Math.PI) + 90);
    
    // Roll: rotation around Y-axis (X vs Z)
    const roll = Math.atan2(x, Math.sqrt(y * y + z * z));
    rollAngles.push((roll * 180 / Math.PI) + 90);
  }
  
  // Auto-detect primary rotation axis: use whichever axis has the largest range
  // This makes ROM computation orientation-independent for dumbbell exercises
  const pitchRange = Math.max(...pitchAngles) - Math.min(...pitchAngles);
  const rollRange = Math.max(...rollAngles) - Math.min(...rollAngles);
  
  return pitchRange >= rollRange ? pitchAngles : rollAngles;
};

/**
 * Compute Range of Motion in degrees from ORIENTATION ANGLES (roll/pitch/yaw)
 * This is more accurate than accelerometer-based ROM because:
 * 1. Orientation angles are gravity-compensated
 * 2. They represent actual device rotation, not acceleration
 * 3. Small movements show small ROM (10% movement = ~10% ROM)
 */
export const computeROMFromOrientation = (roll, pitch, yaw) => {
  if (!roll || roll.length === 0) {
    return { romDegrees: 0, primaryAxis: 'unknown', rollRange: 0, pitchRange: 0, yawRange: 0 };
  }
  
  // Calculate range on each axis
  const rollRange = Math.max(...roll) - Math.min(...roll);
  const pitchRange = Math.max(...pitch) - Math.min(...pitch);
  const yawRange = Math.max(...yaw) - Math.min(...yaw);
  
  // Primary axis is the one with most movement (highest range)
  let primaryAxis = 'roll';
  let romDegrees = rollRange;
  
  if (pitchRange > romDegrees) {
    primaryAxis = 'pitch';
    romDegrees = pitchRange;
  }
  if (yawRange > romDegrees) {
    primaryAxis = 'yaw';
    romDegrees = yawRange;
  }
  
  return {
    romDegrees,
    primaryAxis,
    rollRange,
    pitchRange,
    yawRange,
    rollMin: Math.min(...roll),
    rollMax: Math.max(...roll),
    pitchMin: Math.min(...pitch),
    pitchMax: Math.max(...pitch),
    yawMin: Math.min(...yaw),
    yawMax: Math.max(...yaw)
  };
};

/**
 * Compute Range of Motion in degrees from accelerometer (LEGACY - less accurate)
 */
export const computeROMDegrees = (accelX, accelY, accelZ) => {
  const angles = computeAngleFromAccelerometer(accelX, accelY, accelZ);
  
  if (angles.length === 0) {
    return { romDegrees: 0, minAngle: 0, maxAngle: 0, meanAngle: 0, angleArray: [] };
  }
  
  const minAngle = Math.min(...angles);
  const maxAngle = Math.max(...angles);
  const romDegrees = maxAngle - minAngle;
  const meanAngle = mean(angles);
  
  return {
    romDegrees,
    minAngle,
    maxAngle,
    meanAngle,
    angleArray: angles
  };
};

/**
 * Compute smoothness metrics (LDLJ-inspired)
 * Returns irregularity score and smoothness score
 * 
 * Key insight: Uses normalized jerk + direction changes + peak count
 */
export const computeSmoothnessMetrics = (accelX, accelY, accelZ, timestamps, filteredMag = null) => {
  if (!accelX || accelX.length < 4) {
    return { irregularityScore: 0, smoothnessScore: 50 };
  }
  
  // Duration in seconds
  const duration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000;
  if (duration <= 0) {
    return { irregularityScore: 0, smoothnessScore: 50 };
  }
  
  // Time step
  const dt = duration / (timestamps.length - 1);
  
  // Compute signal (use filtered mag if available, else compute magnitude)
  let signal;
  if (filteredMag && filteredMag.length === accelX.length) {
    signal = filteredMag;
  } else {
    signal = accelX.map((x, i) => Math.sqrt(x * x + accelY[i] * accelY[i] + accelZ[i] * accelZ[i]));
  }
  
  // Range of motion
  const rom = Math.max(...signal) - Math.min(...signal);
  const safeRom = rom < 0.1 ? 0.1 : rom;
  
  // === METRIC 1: Normalized Jerk ===
  const velocity = [];
  for (let i = 1; i < signal.length; i++) {
    velocity.push((signal[i] - signal[i - 1]) / dt);
  }
  
  const jerk = [];
  for (let i = 1; i < velocity.length; i++) {
    jerk.push(Math.abs((velocity[i] - velocity[i - 1]) / dt));
  }
  
  const meanJerk = jerk.length > 0 ? mean(jerk) : 0;
  const normalizedJerk = meanJerk / safeRom;
  
  // === METRIC 2: Direction Changes ===
  let directionChanges = 0;
  for (let i = 1; i < velocity.length; i++) {
    if ((velocity[i] > 0 && velocity[i - 1] < 0) || (velocity[i] < 0 && velocity[i - 1] > 0)) {
      directionChanges++;
    }
  }
  const directionRate = directionChanges / duration;
  
  // === METRIC 3: Peak Detection ===
  const { peaks, valleys } = findPeaks(signal, 0.05);
  const totalPeaks = peaks.length + valleys.length;
  const excessPeaks = Math.max(0, totalPeaks - 2);
  
  // === COMBINE INTO IRREGULARITY SCORE ===
  // Calibrated from real IMU data
  const jerkContrib = Math.min(40, Math.max(0, normalizedJerk - 1.5) * 13.3);
  const dirContrib = Math.min(35, Math.max(0, directionRate - 0.5) * 10);
  const peaksContrib = Math.min(25, excessPeaks * 3.3);
  
  const irregularityScore = jerkContrib + dirContrib + peaksContrib;
  const smoothnessScore = Math.max(0, Math.min(100, 100 - irregularityScore));
  
  return {
    irregularityScore: Math.round(irregularityScore * 100) / 100,
    smoothnessScore: Math.round(smoothnessScore * 100) / 100,
    normalizedJerk,
    directionChanges,
    directionRate,
    totalPeaks,
    meanJerk
  };
};

/**
 * Compute Range of Motion metrics from signal
 */
export const computeROM = (signal) => {
  if (!signal || signal.length < 2) {
    return { rom: 0, romNormalized: 0, peak: 0, trough: 0, mean: 0, std: 0 };
  }
  
  const peak = Math.max(...signal);
  const trough = Math.min(...signal);
  const rom = peak - trough;
  const meanVal = mean(signal);
  const stdVal = std(signal);
  
  // Normalized ROM (0-100 scale)
  const romNormalized = meanVal > 0 ? Math.min(100, (rom / meanVal) * 50) : 0;
  
  return {
    rom,
    romNormalized,
    peak,
    trough,
    mean: meanVal,
    std: stdVal
  };
};

/**
 * Compute per-rep metrics from samples
 */
export const computeRepMetrics = (repData) => {
  const { samples, duration, sampleCount, repNumber, setNumber } = repData;
  
  if (!samples || samples.length < 3) {
    return {
      repNumber,
      setNumber,
      durationMs: duration || 0,
      sampleCount: sampleCount || 0,
      error: 'Insufficient samples'
    };
  }
  
  // Extract arrays - accelerometer
  const accelX = samples.map(s => s.accelX || 0);
  const accelY = samples.map(s => s.accelY || 0);
  const accelZ = samples.map(s => s.accelZ || 0);
  
  // Extract arrays - gyroscope
  const gyroX = samples.map(s => s.gyroX || 0);
  const gyroY = samples.map(s => s.gyroY || 0);
  const gyroZ = samples.map(s => s.gyroZ || 0);
  
  // Extract arrays - ORIENTATION ANGLES (roll/pitch/yaw from IMU firmware)
  // These are gravity-compensated and represent true device rotation
  const roll = samples.map(s => s.roll || 0);
  const pitch = samples.map(s => s.pitch || 0);
  const yaw = samples.map(s => s.yaw || 0);
  
  // Try both field names: filteredMag and filteredMagnitude (from streaming vs stored data)
  const filteredMag = samples.map(s => s.filteredMag || s.filteredMagnitude || s.accelMag || 0);
  // IMPORTANT: Use explicit null check — timestamp_ms=0 is valid (first sample)
  const timestamps = samples.map(s => {
    if (s.timestamp_ms != null && typeof s.timestamp_ms === 'number') return s.timestamp_ms;
    if (typeof s.timestamp === 'number') return s.timestamp;
    // Parse string timestamps like "00:00.130" → milliseconds
    if (typeof s.timestamp === 'string') {
      const parts = s.timestamp.match(/(\d+):(\d+)\.(\d+)/);
      if (parts) return parseInt(parts[1]) * 60000 + parseInt(parts[2]) * 1000 + parseInt(parts[3]);
    }
    return 0;
  });
  
  // Basic metrics
  const durationMs = duration || (timestamps[timestamps.length - 1] - timestamps[0]);
  
  // ROM from filtered magnitude (legacy - for backward compatibility)
  const romMetrics = computeROM(filteredMag);
  
  // *** ROM in degrees from ORIENTATION ANGLES (more accurate) ***
  // Check if we have valid orientation data (not all zeros)
  const hasOrientationData = roll.some(r => r !== 0) || pitch.some(p => p !== 0) || yaw.some(y => y !== 0);
  const romFromOrientation = hasOrientationData 
    ? computeROMFromOrientation(roll, pitch, yaw)
    : { romDegrees: 0, primaryAxis: 'unknown', rollRange: 0, pitchRange: 0, yawRange: 0 };
  
  // Use orientation-based ROM if available, otherwise fall back to accelerometer-based
  const romDegrees = hasOrientationData 
    ? romFromOrientation 
    : computeROMDegrees(accelX, accelY, accelZ);
  
  // Smoothness metrics
  const smoothnessMetrics = computeSmoothnessMetrics(accelX, accelY, accelZ, timestamps, filteredMag);
  
  // Gyroscope metrics - use for angular velocity reference
  const gyroMag = gyroX.map((x, i) => Math.sqrt(x * x + gyroY[i] * gyroY[i] + gyroZ[i] * gyroZ[i]));
  
  // *** VELOCITY: Use baseline-compensated values ***
  const baselineSamples = Math.min(3, Math.floor(gyroMag.length / 4));
  const gyroBaseline = baselineSamples > 0 
    ? mean(gyroMag.slice(0, baselineSamples)) 
    : 0;
  
  const gyroFromBaseline = gyroMag.map(g => Math.abs(g - gyroBaseline));
  const gyroPeak = Math.max(...gyroFromBaseline);
  const gyroMean = mean(gyroFromBaseline);
  
  // Also keep absolute metrics for legacy compatibility
  const gyroPeakAbsolute = Math.max(...gyroMag);
  const gyroRms = Math.sqrt(mean(gyroMag.map(g => g * g)));
  const gyroStd = std(gyroMag);
  
  // Shakiness: RMS of angular acceleration
  let shakiness = 0;
  if (timestamps.length > 2 && durationMs > 0) {
    const dt = (durationMs / 1000) / (timestamps.length - 1);
    const angularAccel = [];
    for (let i = 1; i < gyroMag.length; i++) {
      angularAccel.push((gyroMag[i] - gyroMag[i - 1]) / dt);
    }
    shakiness = Math.sqrt(mean(angularAccel.map(a => a * a)));
  }
  
  // ============================================================================
  // REAL PEAK VELOCITY (m/s) via ACCELEROMETER INTEGRATION
  // ============================================================================
  // Physics: at rest, accelMag ≈ 9.81 (gravity). During movement:
  //   - Lifting: net accel = measured - gravity (positive = upward force)
  //   - Velocity = integral of net acceleration over time
  //   - Peak velocity = max absolute velocity during rep
  //
  // Industry standard (PUSH Band, Gymaware, Tendo Unit):
  //   1. Compute accel magnitude
  //   2. Subtract gravity baseline (~9.81)
  //   3. Trapezoidal integration → velocity
  //   4. Apply high-pass filter to remove drift
  //   5. Peak velocity = max |velocity| during concentric phase
  // ============================================================================
  
  const accelMag = samples.map(s => s.accelMag || Math.sqrt(s.accelX * s.accelX + s.accelY * s.accelY + s.accelZ * s.accelZ));
  
  // Establish gravity baseline from first few (stationary) and last few samples
  // More robust: use median of first 3 samples as gravity reference
  const gravityEstimateSamples = Math.min(3, Math.floor(accelMag.length / 4));
  const gravityBaseline = gravityEstimateSamples > 0
    ? mean(accelMag.slice(0, gravityEstimateSamples))
    : 9.81;
  
  // Net acceleration (subtract gravity) — positive = accelerating away from rest
  const netAccel = accelMag.map(a => a - gravityBaseline);
  
  // Trapezoidal integration: net acceleration → velocity
  const velocityProfile = [0]; // velocity starts at 0
  for (let i = 1; i < netAccel.length; i++) {
    // dt in seconds between samples
    let dt;
    if (timestamps[i] > 0 && timestamps[i - 1] > 0) {
      dt = (timestamps[i] - timestamps[i - 1]) / 1000;
    } else {
      dt = (durationMs / 1000) / (netAccel.length - 1);
    }
    
    // Clamp dt to reasonable range (prevent spikes from timestamp errors)
    dt = Math.max(0.005, Math.min(0.2, dt));
    
    // Trapezoidal rule: v(t) = v(t-1) + 0.5 * (a(t) + a(t-1)) * dt
    const v = velocityProfile[i - 1] + 0.5 * (netAccel[i] + netAccel[i - 1]) * dt;
    velocityProfile.push(v);
  }
  
  // High-pass filter to remove drift (simple: subtract linear trend)
  // Integration drift is the biggest problem with accelerometer → velocity
  if (velocityProfile.length > 2) {
    const firstV = velocityProfile[0];
    const lastV = velocityProfile[velocityProfile.length - 1];
    const driftPerSample = (lastV - firstV) / (velocityProfile.length - 1);
    for (let i = 0; i < velocityProfile.length; i++) {
      velocityProfile[i] -= firstV + driftPerSample * i;
    }
  }
  
  // Peak velocity = maximum absolute velocity during the rep
  const absVelocityProfile = velocityProfile.map(v => Math.abs(v));
  const peakLinearVelocity = Math.max(...absVelocityProfile);
  
  // Mean velocity (average of absolute velocities, industry metric)
  const meanLinearVelocity = mean(absVelocityProfile);
  
  // Peak acceleration from baseline
  const accelFromBaseline = accelMag.map(a => Math.abs(a - gravityBaseline));
  const peakAcceleration = Math.max(...accelFromBaseline);
  const peakAccelerationAbsolute = Math.max(...accelMag);
  
  // *** PHASE TIMING: Use ORIENTATION angles for more accurate phase detection ***
  const phaseTimings = hasOrientationData 
    ? computePhaseTimingsFromOrientation(roll, pitch, yaw, timestamps)
    : computePhaseTimings(accelX, accelY, accelZ, timestamps);
  const { liftingTime, loweringTime, primaryAxis: phaseAxis, peakTimePercent } = phaseTimings;
  
  return {
    repNumber,
    setNumber,
    durationMs,
    sampleCount: samples.length,
    
    // ROM metrics (orientation-based, more accurate)
    rom: romMetrics.rom,
    romNormalized: romMetrics.romNormalized,
    peak: romMetrics.peak,
    trough: romMetrics.trough,
    romDegrees: romDegrees.romDegrees,
    minAngle: romDegrees.minAngle || romDegrees.pitchMin,
    maxAngle: romDegrees.maxAngle || romDegrees.pitchMax,
    meanAngle: romDegrees.meanAngle,
    // New: orientation-based ROM details
    romPrimaryAxis: romDegrees.primaryAxis,
    romRollRange: romDegrees.rollRange,
    romPitchRange: romDegrees.pitchRange,
    romYawRange: romDegrees.yawRange,
    hasOrientationData,
    
    // Smoothness metrics
    smoothnessScore: smoothnessMetrics.smoothnessScore,
    meanJerk: smoothnessMetrics.irregularityScore,
    normalizedJerk: smoothnessMetrics.normalizedJerk,
    directionChanges: smoothnessMetrics.directionChanges,
    
    // Gyroscope metrics (baseline-compensated for better velocity detection)
    gyroPeak, // Angular velocity change from baseline (rad/s)
    gyroPeakAbsolute, // Absolute peak (legacy)
    gyroMean, // Average angular velocity change
    gyroRms,
    gyroStd,
    gyroBaseline, // For debugging
    shakiness,
    
    // Phase timings (using orientation angles when available)
    liftingTime,
    loweringTime,
    totalPhaseTime: liftingTime + loweringTime,
    liftingPercent: liftingTime + loweringTime > 0 
      ? (liftingTime / (liftingTime + loweringTime)) * 100 
      : 50,
    primaryMovementAxis: phaseAxis,
    peakTimePercent,
    
    // *** REAL VELOCITY METRICS (from accelerometer integration) ***
    peakAcceleration,
    peakAccelerationAbsolute,
    peakVelocity: peakLinearVelocity, // TRUE peak velocity in m/s
    meanVelocity: meanLinearVelocity, // Mean velocity in m/s
    velocityProfile, // Full velocity curve for visualization
    gravityBaseline, // Gravity estimate used (for debugging)
    
    // Chart data for visualization
    chartData: filteredMag
  };
};

/**
 * Compute eccentric/concentric phase timings using PRIMARY AXIS method
 * 
 * Algorithm (from main_csv.py):
 * 1. Determine the PRIMARY movement axis (X, Y, or Z) based on which has highest range of motion
 * 2. Find peaks on the primary axis signal (both positive and negative peaks)
 * 3. Concentric = time BEFORE the main peak (lifting/pushing phase)
 * 4. Eccentric = time AFTER the main peak (lowering/returning phase)
 * 
 * This is more accurate than using magnitude because it captures the actual movement direction.
 * 
 * @param {number[]} accelX - X-axis acceleration values
 * @param {number[]} accelY - Y-axis acceleration values  
 * @param {number[]} accelZ - Z-axis acceleration values
 * @param {number[]} timestamps - Timestamps in ms
 * @returns {{ liftingTime: number, loweringTime: number, primaryAxis: string, peakTimePercent: number }}
 */
const computePhaseTimings = (accelX, accelY, accelZ, timestamps) => {
  if (!accelX || accelX.length < 3) {
    return { liftingTime: 0, loweringTime: 0, primaryAxis: 'unknown', peakTimePercent: 50 };
  }
  
  // Check if timestamps are valid (not all zeros)
  const hasValidTimestamps = timestamps && timestamps.length === accelX.length 
    && timestamps.some(t => t > 0) 
    && (timestamps[timestamps.length - 1] - timestamps[0]) > 0;
  
  // *** STEP 1: Determine PRIMARY movement axis (highest range of motion) ***
  const xRange = Math.max(...accelX) - Math.min(...accelX);
  const yRange = Math.max(...accelY) - Math.min(...accelY);
  const zRange = Math.max(...accelZ) - Math.min(...accelZ);
  
  let primarySignal;
  let primaryAxis;
  
  if (xRange >= yRange && xRange >= zRange) {
    primarySignal = accelX;
    primaryAxis = 'X';
  } else if (yRange >= xRange && yRange >= zRange) {
    primarySignal = accelY;
    primaryAxis = 'Y';
  } else {
    primarySignal = accelZ;
    primaryAxis = 'Z';
  }
  
  // *** STEP 2: Find peaks on primary axis (both positive and negative) ***
  const { peaks: positivePeaks } = findPeaks(primarySignal, 0.1);
  
  // Find negative peaks by inverting the signal
  const invertedSignal = primarySignal.map(v => -v);
  const { peaks: negativePeaks } = findPeaks(invertedSignal, 0.1);
  
  // Combine all peaks and find the most prominent one
  const allPeaks = [
    ...positivePeaks.map(p => ({ ...p, type: 'positive' })),
    ...negativePeaks.map(p => ({ index: p.index, value: primarySignal[p.index], prominence: p.prominence, type: 'negative' }))
  ];
  
  // *** STEP 3: Find the MAIN peak (most prominent) ***
  let transitionIdx;
  
  if (allPeaks.length > 0) {
    // Sort by absolute value of signal at peak position (find most prominent movement)
    const peakAmplitudes = allPeaks.map(p => Math.abs(primarySignal[p.index]));
    const mainPeakArrayIdx = peakAmplitudes.indexOf(Math.max(...peakAmplitudes));
    transitionIdx = allPeaks[mainPeakArrayIdx].index;
  } else {
    // Fallback: use index of maximum absolute value
    const absValues = primarySignal.map(Math.abs);
    transitionIdx = absValues.indexOf(Math.max(...absValues));
  }
  
  // *** STEP 4: Calculate phase timings ***
  // Concentric (lifting) = time BEFORE peak
  // Eccentric (lowering) = time AFTER peak
  
  let liftingTime = 0;  // Concentric
  let loweringTime = 0; // Eccentric
  
  if (hasValidTimestamps) {
    // Use actual timestamps for accurate timing
    const startTime = timestamps[0];
    const peakTime = timestamps[transitionIdx];
    const endTime = timestamps[timestamps.length - 1];
    
    liftingTime = (peakTime - startTime) / 1000;  // Convert ms to seconds
    loweringTime = (endTime - peakTime) / 1000;
  } else {
    // No valid timestamps - estimate from sample count (~50ms per sample at 20Hz)
    const sampleRate = 0.05; // 50ms per sample (20Hz)
    const totalDuration = primarySignal.length * sampleRate;
    
    liftingTime = (transitionIdx / primarySignal.length) * totalDuration;
    loweringTime = ((primarySignal.length - transitionIdx) / primarySignal.length) * totalDuration;
  }
  
  // Ensure non-negative values
  liftingTime = Math.max(0, liftingTime);
  loweringTime = Math.max(0, loweringTime);
  
  // Calculate peak time as percentage
  const peakTimePercent = primarySignal.length > 0 
    ? (transitionIdx / primarySignal.length) * 100 
    : 50;
  
  return { 
    liftingTime, 
    loweringTime, 
    primaryAxis,
    peakTimePercent
  };
};

/**
 * Compute eccentric/concentric phase timings from ORIENTATION ANGLES
 * 
 * This is MORE ACCURATE than accelerometer-based because:
 * 1. Orientation angles (roll/pitch/yaw) are gravity-compensated
 * 2. They represent actual device rotation (true movement)
 * 3. The peak in orientation = the turning point of the exercise
 * 
 * Algorithm (similar to main_csv.py but using orientation):
 * 1. Find the primary rotation axis (roll, pitch, or yaw with highest range)
 * 2. Find the EXTREMUM (max or min) on that axis = the turning point
 * 3. Concentric = time to reach extremum (lifting)
 * 4. Eccentric = time from extremum to end (lowering)
 */
const computePhaseTimingsFromOrientation = (roll, pitch, yaw, timestamps) => {
  if (!roll || roll.length < 3) {
    return { liftingTime: 0, loweringTime: 0, primaryAxis: 'unknown', peakTimePercent: 50 };
  }
  
  // Check if timestamps are valid
  const hasValidTimestamps = timestamps && timestamps.length === roll.length 
    && timestamps.some(t => t > 0) 
    && (timestamps[timestamps.length - 1] - timestamps[0]) > 0;
  
  // Find primary rotation axis (highest range)
  const rollRange = Math.max(...roll) - Math.min(...roll);
  const pitchRange = Math.max(...pitch) - Math.min(...pitch);
  const yawRange = Math.max(...yaw) - Math.min(...yaw);
  
  let primarySignal;
  let primaryAxis;
  
  if (rollRange >= pitchRange && rollRange >= yawRange) {
    primarySignal = roll;
    primaryAxis = 'roll';
  } else if (pitchRange >= rollRange && pitchRange >= yawRange) {
    primarySignal = pitch;
    primaryAxis = 'pitch';
  } else {
    primarySignal = yaw;
    primaryAxis = 'yaw';
  }
  
  // Find the turning point (extremum) - this is where concentric ends and eccentric begins
  // For most exercises, this is either the MAX or MIN on the primary axis
  const maxIdx = primarySignal.indexOf(Math.max(...primarySignal));
  const minIdx = primarySignal.indexOf(Math.min(...primarySignal));
  
  // Determine which extremum is the true turning point:
  // If max is closer to middle, it's likely the turning point (typical curl motion)
  // If min is closer to middle, it's likely the turning point (e.g., overhead extension)
  const midPoint = primarySignal.length / 2;
  const maxDistFromEdge = Math.min(maxIdx, primarySignal.length - 1 - maxIdx);
  const minDistFromEdge = Math.min(minIdx, primarySignal.length - 1 - minIdx);
  
  // The extremum that's more "internal" (further from edges) is the turning point
  let transitionIdx;
  if (maxDistFromEdge > minDistFromEdge) {
    transitionIdx = maxIdx;
  } else if (minDistFromEdge > maxDistFromEdge) {
    transitionIdx = minIdx;
  } else {
    // Both equally internal - use the one closer to center
    transitionIdx = Math.abs(maxIdx - midPoint) < Math.abs(minIdx - midPoint) ? maxIdx : minIdx;
  }
  
  // Ensure transition isn't at the very edge (fallback to center if so)
  if (transitionIdx <= 1 || transitionIdx >= primarySignal.length - 2) {
    // Use center point as fallback (indicates roughly equal phases)
    transitionIdx = Math.round(primarySignal.length / 2);
  }
  
  // Calculate phase timings
  let liftingTime = 0;  // Concentric (before turning point)
  let loweringTime = 0; // Eccentric (after turning point)
  
  if (hasValidTimestamps) {
    const startTime = timestamps[0];
    const peakTime = timestamps[transitionIdx];
    const endTime = timestamps[timestamps.length - 1];
    
    liftingTime = (peakTime - startTime) / 1000;
    loweringTime = (endTime - peakTime) / 1000;
  } else {
    // Estimate from sample count (~50ms per sample at 20Hz)
    const sampleRate = 0.05;
    const totalDuration = primarySignal.length * sampleRate;
    
    liftingTime = (transitionIdx / primarySignal.length) * totalDuration;
    loweringTime = ((primarySignal.length - transitionIdx) / primarySignal.length) * totalDuration;
  }
  
  // Ensure non-negative
  liftingTime = Math.max(0, liftingTime);
  loweringTime = Math.max(0, loweringTime);
  
  const peakTimePercent = (transitionIdx / primarySignal.length) * 100;
  
  return { 
    liftingTime, 
    loweringTime, 
    primaryAxis,
    peakTimePercent,
    transitionIdx
  };
};

/**
 * Compute fatigue indicators using gyroscope-based methodology
 * 
 * Updated Formula (with ML classification):
 * F = 0.25·D_ω + 0.18·I_T + 0.14·I_J + 0.14·I_S + 0.29·Q_exec
 * 
 * Original Formula (without ML classification):
 * F = 0.35·D_ω + 0.25·I_T + 0.20·I_J + 0.20·I_S
 * 
 * Where:
 * - D_ω: Peak angular velocity change 
 * - I_T: Tempo/duration increase 
 * - I_J: Jerk increase 
 * - I_S: Shakiness increase 
 * - Q_exec: Execution quality penalty from ML classification
 *   - Based on clean rep percentage
 *   - Penalizes "Abrupt Initiation" (momentum use = fatigue compensation)
 *   - Penalizes "Uncontrolled Movement" (loss of control = muscular fatigue)
 * 
 * @param {Array} repMetricsList - Array of rep metrics
 * @param {Object} mlClassification - Optional ML classification data with cleanPercentage and classDistribution
 */
export const computeFatigueIndicators = (repMetricsList, mlClassification = null) => {
  if (!repMetricsList || repMetricsList.length < 3) {
    return {
      fatigueScore: 0,
      fatigueLevel: 'insufficient_data',
      D_omega: 0,
      I_T: 0,
      I_J: 0,
      I_S: 0,
      Q_exec: 0,
      gyroDirection: 'stable',
      consistencyScore: 0,
      performanceReport: {
        sessionQuality: 'Insufficient Data',
        consistencyRating: 'Unknown',
        keyFindings: ['⚠️ Need at least 3 reps for analysis']
      },
      nRepsAnalyzed: repMetricsList.length
    };
  }
  
  const nReps = repMetricsList.length;
  const third = Math.max(1, Math.floor(nReps / 3));
  
  // Extract per-rep metrics
  const gyroPeaks = repMetricsList.map(m => m.gyroPeak || 0);
  const hasGyro = gyroPeaks.some(g => g > 0);
  const shakiness = repMetricsList.map(m => m.shakiness || 0);
  const hasShakiness = shakiness.some(s => s > 0);
  const durations = repMetricsList.map(m => m.durationMs || 0);
  const jerkValues = repMetricsList.map(m => m.meanJerk || 0);
  const roms = repMetricsList.map(m => m.romDegrees || m.rom || 0);
  const smoothnessValues = repMetricsList.map(m => m.smoothnessScore || 50);
  const peaks = repMetricsList.map(m => m.peak || 0);
  
  // === D_ω: Peak Angular Velocity Change (35%) ===
  // Only penalize velocity DROPS (fatigue), not increases (warming up)
  let D_omega, gyroDirection;
  if (hasGyro) {
    const avgGyroFirst = mean(gyroPeaks.slice(0, third));
    const avgGyroLast = mean(gyroPeaks.slice(-third));
    D_omega = avgGyroFirst > 0 ? Math.max(0, (avgGyroFirst - avgGyroLast) / avgGyroFirst) : 0;
    gyroDirection = avgGyroLast < avgGyroFirst ? 'drop' : 'surge';
  } else {
    const avgPeakFirst = mean(peaks.slice(0, third));
    const avgPeakLast = mean(peaks.slice(-third));
    D_omega = avgPeakFirst > 0 ? Math.max(0, (avgPeakFirst - avgPeakLast) / avgPeakFirst) : 0;
    gyroDirection = avgPeakLast < avgPeakFirst ? 'drop' : 'surge';
  }
  
  // === I_T: Tempo/Duration Increase (25%) ===
  const avgDurFirst = mean(durations.slice(0, third));
  const avgDurLast = mean(durations.slice(-third));
  const I_T = avgDurFirst > 0 ? (avgDurLast - avgDurFirst) / avgDurFirst : 0;
  
  // === I_J: Jerk Increase (20%) ===
  const avgJerkFirst = mean(jerkValues.slice(0, third));
  const avgJerkLast = mean(jerkValues.slice(-third));
  const I_J = avgJerkFirst > 0 ? (avgJerkLast - avgJerkFirst) / avgJerkFirst : 0;
  
  // === I_S: Shakiness Increase (20%) ===
  let I_S = 0;
  let avgShakyFirst = 0, avgShakyLast = 0;
  if (hasShakiness) {
    avgShakyFirst = mean(shakiness.slice(0, third));
    avgShakyLast = mean(shakiness.slice(-third));
    I_S = avgShakyFirst > 0 ? (avgShakyLast - avgShakyFirst) / avgShakyFirst : 0;
  }
  
  // === Q_exec: Execution Quality Penalty from ML Classification ===
  // This addresses the issue where all reps are poor quality (user fatigued from start)
  // The kinematic indicators measure DECLINE, but Q_exec measures ABSOLUTE quality
  let Q_exec = 0;
  let hasMLClassification = false;
  
  if (mlClassification && typeof mlClassification.cleanPercentage === 'number') {
    hasMLClassification = true;
    const cleanPct = mlClassification.cleanPercentage;
    
    // Base penalty: inverse of clean percentage (0 = all clean, 1 = no clean reps)
    // Scale: 100% clean = 0 penalty, 0% clean = 1.0 penalty
    Q_exec = (100 - cleanPct) / 100;
    
    // Additional penalties for specific problematic classifications
    if (mlClassification.classDistribution) {
      const dist = mlClassification.classDistribution;
      const totalClassified = Object.values(dist).reduce((sum, count) => sum + count, 0);
      
      if (totalClassified > 0) {
        // "Abrupt Initiation" indicates momentum use - sign of fatigue compensation
        // User is "cheating" the movement by using momentum instead of controlled muscle force
        const abruptInitiation = dist['Abrupt Initiation'] || dist['abrupt_initiation'] || 0;
        const abruptPct = abruptInitiation / totalClassified;
        if (abruptPct > 0.25) {
          // 25%+ abrupt initiation = momentum compensation penalty
          // This catches users who swing/jerk weights to compensate for tired muscles
          Q_exec = Math.min(1.0, Q_exec + (abruptPct - 0.25) * 0.4);
        }
        
        // "Uncontrolled Movement" indicates loss of control - direct sign of muscular fatigue
        // User cannot maintain proper form through the full range of motion
        const uncontrolled = dist['Uncontrolled Movement'] || dist['uncontrolled_movement'] || 0;
        const uncontrolledPct = uncontrolled / totalClassified;
        if (uncontrolledPct > 0.20) {
          // 20%+ uncontrolled = lost control penalty
          // This catches users who are losing motor control from fatigue
          Q_exec = Math.min(1.0, Q_exec + (uncontrolledPct - 0.20) * 0.5);
        }
      }
    }
  }
  
  // === Composite Fatigue Score ===
  const D_omega_clamped = Math.max(0, D_omega);
  const I_T_clamped = Math.max(0, I_T);
  const I_J_clamped = Math.max(0, I_J);
  const I_S_clamped = Math.max(0, I_S);
  const Q_exec_clamped = Math.max(0, Math.min(1, Q_exec));
  
  let fatigueRaw;
  if (hasMLClassification) {
    // With ML classification: give significant weight to execution quality
    // This fixes the "all bad reps = low fatigue" problem
    fatigueRaw = (0.25 * D_omega_clamped) +
                 (0.18 * I_T_clamped) +
                 (0.14 * I_J_clamped) +
                 (0.14 * I_S_clamped) +
                 (0.29 * Q_exec_clamped);
  } else {
    // Without ML classification: use original kinematic-only formula
    fatigueRaw = (0.35 * D_omega_clamped) +
                 (0.25 * I_T_clamped) +
                 (0.20 * I_J_clamped) +
                 (0.20 * I_S_clamped);
  }
  
  // Boost for severe indicators (conservative threshold)
  const worstKinematicIndicator = Math.max(D_omega_clamped, I_T_clamped, I_J_clamped, I_S_clamped);
  if (worstKinematicIndicator > 0.50) {
    fatigueRaw = Math.min(1.0, fatigueRaw + (worstKinematicIndicator - 0.50) * 0.25);
  }
  
  // Additional boost if execution quality is very poor (even without kinematic decline)
  // This ensures "consistently bad form" gets flagged as fatigued/compensating
  if (hasMLClassification && Q_exec_clamped > 0.60) {
    fatigueRaw = Math.min(1.0, fatigueRaw + (Q_exec_clamped - 0.60) * 0.2);
  }
  
  // Sanity cap: good execution quality limits fatigue score
  // If 70%+ reps are clean, the body is clearly performing well — can't be severe fatigue
  if (hasMLClassification && mlClassification && typeof mlClassification.cleanPercentage === 'number') {
    const cleanPct = mlClassification.cleanPercentage;
    if (cleanPct >= 70) {
      // 70% clean → max ~50 (moderate), 80% → ~43, 90% → ~37
      const maxForQuality = (50 - (cleanPct - 70) * 0.43) / 100;
      fatigueRaw = Math.min(fatigueRaw, maxForQuality);
    }
  }
  
  // Coherence check: if all kinematic indicators are mild, cap at moderate
  const allKinematicMild = D_omega_clamped < 0.15 && I_T_clamped < 0.15 && I_J_clamped < 0.15 && I_S_clamped < 0.15;
  if (allKinematicMild && fatigueRaw > 0.45) {
    fatigueRaw = 0.45;
  }
  
  const fatigueScore = Math.min(100, fatigueRaw * 100);
  
  // Determine fatigue level
  let fatigueLevel;
  if (fatigueScore < FATIGUE_THRESHOLDS.minimal) fatigueLevel = 'minimal';
  else if (fatigueScore < FATIGUE_THRESHOLDS.low) fatigueLevel = 'low';
  else if (fatigueScore < FATIGUE_THRESHOLDS.moderate) fatigueLevel = 'moderate';
  else if (fatigueScore < FATIGUE_THRESHOLDS.high) fatigueLevel = 'high';
  else fatigueLevel = 'severe';
  
  // === Consistency Analysis ===
  const getConsistency = (values) => {
    if (values.length < 2 || mean(values) === 0) return 0;
    const cv = std(values) / mean(values);
    return Math.max(0, Math.min(100, 100 - cv * 333));
  };
  
  const romConsistency = getConsistency(roms);
  const smoothnessConsistency = getConsistency(smoothnessValues);
  const durationConsistency = getConsistency(durations);
  const peakConsistency = getConsistency(peaks);
  const consistencyScore = mean([romConsistency, smoothnessConsistency, durationConsistency, peakConsistency]);
  
  // === Trend Analysis ===
  const getTrend = (values) => {
    const slope = linearRegressionSlope(values);
    const m = mean(values);
    return m !== 0 ? (slope / m) * 100 : 0;
  };
  
  const romTrend = getTrend(roms);
  const smoothnessTrend = getTrend(smoothnessValues);
  const durationTrend = getTrend(durations);
  
  // === Early vs Late Comparison ===
  const avgRomFirst = mean(roms.slice(0, third));
  const avgRomLast = mean(roms.slice(-third));
  const romChangePercent = avgRomFirst > 0 ? ((avgRomLast - avgRomFirst) / avgRomFirst) * 100 : 0;
  
  const avgSmoothFirst = mean(smoothnessValues.slice(0, third));
  const avgSmoothLast = mean(smoothnessValues.slice(-third));
  const smoothnessDegradation = avgSmoothFirst > 0 ? ((avgSmoothFirst - avgSmoothLast) / avgSmoothFirst) * 100 : 0;
  
  // === Performance Report ===
  const getSessionQuality = (score) => {
    if (score < 15) return 'Excellent';
    if (score < 30) return 'Good';
    if (score < 50) return 'Fair';
    if (score < 70) return 'Poor';
    return 'Very Poor';
  };
  
  const getConsistencyRating = (score) => {
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  };
  
  const keyFindings = [];
  if (fatigueScore < 15) {
    keyFindings.push('✅ Excellent fatigue resistance — stable speed and control throughout');
  } else if (fatigueScore > 60) {
    keyFindings.push('⚠️ Significant fatigue detected — movement quality degraded notably');
  }
  
  // ML Classification-based insights
  if (hasMLClassification && mlClassification) {
    const cleanPct = mlClassification.cleanPercentage;
    if (cleanPct < 30) {
      keyFindings.push(`⚠️ Very low clean rep % (${cleanPct}%) — likely using compensation patterns`);
    } else if (cleanPct < 50) {
      keyFindings.push(`⚠️ Less than half of reps are clean (${cleanPct}%) — form breakdown detected`);
    }
    
    // Check for specific problematic patterns
    if (mlClassification.classDistribution) {
      const dist = mlClassification.classDistribution;
      const totalClassified = Object.values(dist).reduce((sum, count) => sum + count, 0);
      
      if (totalClassified > 0) {
        const abruptInitiation = dist['Abrupt Initiation'] || dist['abrupt_initiation'] || 0;
        const uncontrolled = dist['Uncontrolled Movement'] || dist['uncontrolled_movement'] || 0;
        const abruptPct = (abruptInitiation / totalClassified) * 100;
        const uncontrolledPct = (uncontrolled / totalClassified) * 100;
        
        if (abruptPct > 40) {
          keyFindings.push(`⚠️ High momentum use (${abruptPct.toFixed(0)}% abrupt initiation) — consider reducing weight`);
        }
        
        if (uncontrolledPct > 30) {
          keyFindings.push(`⚠️ Loss of control (${uncontrolledPct.toFixed(0)}% uncontrolled) — muscular fatigue evident`);
        }
      }
    }
  }
  
  if (hasGyro && D_omega > 0.15) {
    if (gyroDirection === 'surge') {
      keyFindings.push(`⚠️ Peak angular velocity SURGED ${(D_omega * 100).toFixed(1)}% — compensatory swinging`);
    } else {
      keyFindings.push(`⚠️ Peak angular velocity dropped ${(D_omega * 100).toFixed(1)}% — muscles slowing`);
    }
  }
  
  if (hasShakiness && I_S > 0.20) {
    keyFindings.push(`⚠️ Within-rep shakiness increased ${(I_S * 100).toFixed(1)}% — losing motor control`);
  }
  
  if (I_T > 0.15) {
    keyFindings.push(`⚠️ Rep duration increased ${(I_T * 100).toFixed(1)}% — slowing down`);
  }
  
  if (consistencyScore > 85) {
    keyFindings.push('✅ Highly consistent, controlled movements');
  } else if (consistencyScore < 60) {
    keyFindings.push('⚠️ High variability — erratic rep execution');
  }
  
  if (keyFindings.length === 0) {
    keyFindings.push('📊 Moderate performance with mixed indicators');
  }
  
  return {
    fatigueScore: Math.round(fatigueScore * 10) / 10,
    fatigueLevel,
    D_omega: Math.round(D_omega * 10000) / 10000,
    I_T: Math.round(I_T * 10000) / 10000,
    I_J: Math.round(I_J * 10000) / 10000,
    I_S: Math.round(I_S * 10000) / 10000,
    Q_exec: Math.round(Q_exec_clamped * 10000) / 10000,
    hasMLClassification,
    gyroDirection,
    hasGyro,
    
    consistencyScore: Math.round(consistencyScore * 10) / 10,
    romConsistency: Math.round(romConsistency * 10) / 10,
    smoothnessConsistency: Math.round(smoothnessConsistency * 10) / 10,
    durationConsistency: Math.round(durationConsistency * 10) / 10,
    peakConsistency: Math.round(peakConsistency * 10) / 10,
    
    romTrend: Math.round(romTrend * 100) / 100,
    smoothnessTrend: Math.round(smoothnessTrend * 100) / 100,
    durationTrend: Math.round(durationTrend * 100) / 100,
    
    romChangePercent: Math.round(romChangePercent * 10) / 10,
    smoothnessDegradation: Math.round(smoothnessDegradation * 10) / 10,
    
    earlyVsLate: {
      avgRomFirst: Math.round(avgRomFirst * 100) / 100,
      avgRomLast: Math.round(avgRomLast * 100) / 100,
      avgDurationFirst: Math.round(avgDurFirst),
      avgDurationLast: Math.round(avgDurLast),
      avgSmoothFirst: Math.round(avgSmoothFirst * 10) / 10,
      avgSmoothLast: Math.round(avgSmoothLast * 10) / 10,
      avgGyroFirst: hasGyro ? Math.round(mean(gyroPeaks.slice(0, third)) * 1000) / 1000 : 0,
      avgGyroLast: hasGyro ? Math.round(mean(gyroPeaks.slice(-third)) * 1000) / 1000 : 0,
      avgShakyFirst: Math.round(avgShakyFirst * 1000) / 1000,
      avgShakyLast: Math.round(avgShakyLast * 1000) / 1000
    },
    
    performanceReport: {
      sessionQuality: getSessionQuality(fatigueScore),
      consistencyRating: getConsistencyRating(consistencyScore),
      fatigueComponents: {
        D_omega: Math.round(D_omega * 100 * 100) / 100,
        I_T: Math.round(I_T * 100 * 100) / 100,
        I_J: Math.round(I_J * 100 * 100) / 100,
        I_S: Math.round(I_S * 100 * 100) / 100,
        gyroDirection,
        formula: 'F = 0.35·D_ω + 0.25·I_T + 0.20·I_J + 0.20·I_S'
      },
      keyFindings
    },
    
    nRepsAnalyzed: nReps
  };
};

/**
 * Compute consistency score for rep overlays
 * Uses curve-based comparison similar to Python implementation
 */
export const computeRepConsistency = (repChartDataList) => {
  if (!repChartDataList || repChartDataList.length < 2) {
    return { consistencyScore: 100, inconsistentRepIndex: -1 };
  }
  
  // Normalize all curves to same length
  const maxLen = Math.max(...repChartDataList.map(c => c.length));
  const normalizedCurves = repChartDataList.map(curve => {
    if (curve.length === maxLen) return curve;
    // Resample to maxLen
    const resampled = [];
    for (let i = 0; i < maxLen; i++) {
      const srcIdx = (i / (maxLen - 1)) * (curve.length - 1);
      const low = Math.floor(srcIdx);
      const high = Math.ceil(srcIdx);
      const frac = srcIdx - low;
      resampled.push(curve[low] * (1 - frac) + (curve[high] || curve[low]) * frac);
    }
    return resampled;
  });
  
  // Calculate mean curve
  const meanCurve = [];
  for (let i = 0; i < maxLen; i++) {
    const sum = normalizedCurves.reduce((acc, c) => acc + c[i], 0);
    meanCurve.push(sum / normalizedCurves.length);
  }
  
  // Calculate deviation of each rep from mean
  const deviations = normalizedCurves.map(curve => {
    let totalDev = 0;
    for (let i = 0; i < maxLen; i++) {
      const diff = curve[i] - meanCurve[i];
      totalDev += diff * diff;
    }
    return Math.sqrt(totalDev / maxLen);
  });
  
  // Find most inconsistent rep
  const maxDeviation = Math.max(...deviations);
  const inconsistentRepIndex = deviations.indexOf(maxDeviation);
  
  // Calculate overall consistency
  const avgDeviation = mean(deviations);
  const meanValue = mean(meanCurve);
  const normalizedDev = meanValue > 0 ? avgDeviation / meanValue : 0;
  const consistencyScore = Math.max(0, Math.min(100, Math.round(100 * (1 - normalizedDev * 2))));
  
  return { consistencyScore, inconsistentRepIndex };
};

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze complete workout data
 * 
 * @param {Object} workoutData - Complete workout data from GCS
 * @returns {Object} - Comprehensive workout analysis
 */
export const analyzeWorkout = (workoutData) => {
  if (!workoutData || !workoutData.sets || workoutData.sets.length === 0) {
    return {
      error: 'No workout data available',
      workoutId: workoutData?.workoutId,
      analyzedAt: new Date().toISOString()
    };
  }
  
  const { workoutId, exercise, equipment, sets } = workoutData;
  
  // Collect all reps across all sets
  const allRepMetrics = [];
  const setsAnalysis = [];
  
  for (const set of sets) {
    if (!set.reps || set.reps.length === 0) continue;
    
    const setRepMetrics = [];
    for (const rep of set.reps) {
      const metrics = computeRepMetrics(rep);
      setRepMetrics.push(metrics);
      allRepMetrics.push(metrics);
    }
    
    // Per-set analysis
    const setFatigue = computeFatigueIndicators(setRepMetrics);
    const setChartData = setRepMetrics.map(m => m.chartData || []);
    const setConsistency = computeRepConsistency(setChartData);
    
    setsAnalysis.push({
      setNumber: set.setNumber,
      repsCount: setRepMetrics.length,
      repMetrics: setRepMetrics,
      fatigueAnalysis: setFatigue,
      consistencyScore: setConsistency.consistencyScore,
      inconsistentRepIndex: setConsistency.inconsistentRepIndex,
      avgDuration: mean(setRepMetrics.map(m => m.durationMs)),
      avgROM: mean(setRepMetrics.map(m => m.romDegrees || m.rom)),
      avgSmoothness: mean(setRepMetrics.map(m => m.smoothnessScore)),
      totalTime: setRepMetrics.reduce((sum, m) => sum + (m.durationMs || 0), 0)
    });
  }
  
  // Overall fatigue: per-set aggregation to avoid cross-set calibration contamination
  // Dumbbell/free-weight exercises have different IMU calibration between sets,
  // so comparing Set 1 reps vs Set 2 reps creates artificial "degradation"
  let overallFatigue;
  const validSetFatigues = setsAnalysis.filter(s => s.fatigueAnalysis.fatigueLevel !== 'insufficient_data');
  
  if (validSetFatigues.length > 1) {
    // Multiple valid sets: weighted average of per-set fatigue scores
    const totalReps = validSetFatigues.reduce((sum, s) => sum + s.repsCount, 0);
    const weightedScore = validSetFatigues.reduce((sum, s) => {
      return sum + (s.fatigueAnalysis.fatigueScore * s.repsCount);
    }, 0);
    const avgScore = totalReps > 0 ? weightedScore / totalReps : 0;
    
    // Aggregate individual indicators (weighted average across sets)
    const aggIndicator = (key) => {
      return totalReps > 0
        ? validSetFatigues.reduce((s, set) => s + ((set.fatigueAnalysis[key] || 0) * set.repsCount), 0) / totalReps
        : 0;
    };
    
    let fatigueLevel;
    if (avgScore < FATIGUE_THRESHOLDS.minimal) fatigueLevel = 'minimal';
    else if (avgScore < FATIGUE_THRESHOLDS.low) fatigueLevel = 'low';
    else if (avgScore < FATIGUE_THRESHOLDS.moderate) fatigueLevel = 'moderate';
    else if (avgScore < FATIGUE_THRESHOLDS.high) fatigueLevel = 'high';
    else fatigueLevel = 'severe';
    
    // Use best-consistency set's report as base
    const bestSet = validSetFatigues.reduce((best, s) => 
      s.fatigueAnalysis.consistencyScore > best.fatigueAnalysis.consistencyScore ? s : best
    , validSetFatigues[0]);
    
    overallFatigue = {
      ...bestSet.fatigueAnalysis,
      fatigueScore: Math.round(avgScore * 10) / 10,
      fatigueLevel,
      D_omega: Math.round(aggIndicator('D_omega') * 10000) / 10000,
      I_T: Math.round(aggIndicator('I_T') * 10000) / 10000,
      I_J: Math.round(aggIndicator('I_J') * 10000) / 10000,
      I_S: Math.round(aggIndicator('I_S') * 10000) / 10000,
      aggregationMethod: 'per_set_weighted_average',
    };
  } else {
    // Single set or no valid sets: compute directly on all reps
    overallFatigue = computeFatigueIndicators(allRepMetrics);
  }
  
  // Overall consistency from all rep charts
  const allChartData = allRepMetrics.map(m => m.chartData || []).filter(c => c.length > 0);
  const overallConsistency = computeRepConsistency(allChartData);
  
  // Calculate session averages
  // Fixed: Swap liftingTime and loweringTime since they're backwards in the algorithm
  const avgConcentric = mean(allRepMetrics.map(m => m.loweringTime || 0)); // Use loweringTime for concentric (actual lifting)
  const avgEccentric = mean(allRepMetrics.map(m => m.liftingTime || 0));   // Use liftingTime for eccentric (actual lowering)
  const avgROMDegrees = mean(allRepMetrics.map(m => m.romDegrees || 0));
  const avgSmoothness = mean(allRepMetrics.map(m => m.smoothnessScore || 50));
  const avgDuration = mean(allRepMetrics.map(m => m.durationMs || 0));
  const totalDuration = allRepMetrics.reduce((sum, m) => sum + (m.durationMs || 0), 0);
  
  // Quality names for this exercise
  const qualityNames = QUALITY_NAMES_BY_EXERCISE[exercise] || {
    0: 'Clean',
    1: 'Uncontrolled Movement',
    2: 'Form Error'
  };
  
  return {
    workoutId,
    userId: workoutData.odUSerId,
    exercise,
    equipment,
    analyzedAt: new Date().toISOString(),
    
    // Summary metrics
    summary: {
      totalSets: setsAnalysis.length,
      totalReps: allRepMetrics.length,
      totalDurationMs: totalDuration,
      avgDurationMs: avgDuration,
      avgROMDegrees,
      avgSmoothness,
      avgConcentric,
      avgEccentric,
      concentricPercent: avgConcentric + avgEccentric > 0 
        ? (avgConcentric / (avgConcentric + avgEccentric)) * 100 
        : 50,
      eccentricPercent: avgConcentric + avgEccentric > 0 
        ? (avgEccentric / (avgConcentric + avgEccentric)) * 100 
        : 50
    },
    
    // Fatigue analysis
    fatigue: overallFatigue,
    
    // Consistency analysis  
    consistency: {
      score: overallConsistency.consistencyScore,
      inconsistentRepIndex: overallConsistency.inconsistentRepIndex,
      rating: overallFatigue.performanceReport.consistencyRating
    },
    
    // Per-set analysis
    setsAnalysis,
    
    // All rep metrics for detailed views
    repMetrics: allRepMetrics,
    
    // Quality labels for ML predictions
    qualityNames,
    
    // Performance insights
    insights: overallFatigue.performanceReport.keyFindings
  };
};

/**
 * Extract ML features for a single rep
 * Matches the format expected by trained models
 */
export const extractMLFeatures = (repData) => {
  const { samples } = repData;
  
  if (!samples || samples.length === 0) {
    return null;
  }
  
  const features = {};
  
  // Signal columns to compute features from
  const signalColumns = ['filteredMag', 'filteredX', 'filteredY', 'filteredZ',
                         'accelMag', 'accelX', 'accelY', 'accelZ',
                         'gyroX', 'gyroY', 'gyroZ'];
  
  // Duration - explicit null check since timestamp_ms=0 is valid
  const timestamps = samples.map(s => {
    if (s.timestamp_ms != null && typeof s.timestamp_ms === 'number') return s.timestamp_ms;
    if (typeof s.timestamp === 'number') return s.timestamp;
    if (typeof s.timestamp === 'string') {
      const parts = s.timestamp.match(/(\d+):(\d+)\.(\d+)/);
      if (parts) return parseInt(parts[1]) * 60000 + parseInt(parts[2]) * 1000 + parseInt(parts[3]);
    }
    return 0;
  });
  features.rep_duration_ms = timestamps[timestamps.length - 1] - timestamps[0];
  features.sample_count = samples.length;
  if (timestamps.length > 1) {
    features.avg_sample_rate = 1000 / mean(timestamps.slice(1).map((t, i) => t - timestamps[i]));
  }
  
  // Compute features for each signal column
  for (const col of signalColumns) {
    const signal = samples.map(s => s[col]).filter(v => v !== undefined && v !== null);
    
    if (signal.length === 0) continue;
    
    // Basic statistics
    features[`${col}_mean`] = mean(signal);
    features[`${col}_std`] = std(signal);
    features[`${col}_min`] = Math.min(...signal);
    features[`${col}_max`] = Math.max(...signal);
    features[`${col}_range`] = Math.max(...signal) - Math.min(...signal);
    features[`${col}_median`] = percentile(signal, 50);
    
    // Percentiles
    features[`${col}_p25`] = percentile(signal, 25);
    features[`${col}_p75`] = percentile(signal, 75);
    features[`${col}_iqr`] = features[`${col}_p75`] - features[`${col}_p25`];
    
    // Energy and power
    features[`${col}_energy`] = signal.reduce((sum, v) => sum + v * v, 0);
    features[`${col}_rms`] = Math.sqrt(features[`${col}_energy`] / signal.length);
    
    // Rate of change (first derivative stats)
    if (signal.length > 1) {
      const diff = signal.slice(1).map((v, i) => v - signal[i]);
      features[`${col}_diff_mean`] = mean(diff);
      features[`${col}_diff_std`] = std(diff);
      features[`${col}_diff_max`] = Math.max(...diff.map(Math.abs));
    }
    
    // Peak-related features
    const peakIdx = signal.indexOf(Math.max(...signal));
    features[`${col}_peak_position`] = peakIdx / signal.length;
    features[`${col}_peak_value`] = signal[peakIdx];
  }
  
  return features;
};

export default {
  analyzeWorkout,
  computeRepMetrics,
  computeFatigueIndicators,
  computeRepConsistency,
  computeSmoothnessMetrics,
  computeROMDegrees,
  computeROMFromOrientation,
  extractMLFeatures,
  QUALITY_NAMES_BY_EXERCISE
};
