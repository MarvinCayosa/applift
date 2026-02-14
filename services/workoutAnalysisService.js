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
  minimal: 10,
  low: 20,
  moderate: 35,
  high: 55,
  // > 55 = severe
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
  
  const angles = [];
  for (let i = 0; i < accelX.length; i++) {
    const x = accelX[i];
    const y = accelY[i];
    const z = accelZ[i];
    
    // Calculate magnitude
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    if (magnitude === 0) {
      angles.push(0);
      continue;
    }
    
    // Calculate pitch angle (rotation around X-axis)
    const pitch = Math.atan2(y, Math.sqrt(x * x + z * z));
    // Convert to degrees and normalize to 0-180 range
    const pitchDegrees = (pitch * 180 / Math.PI) + 90;
    angles.push(pitchDegrees);
  }
  
  return angles;
};

/**
 * Compute Range of Motion in degrees from accelerometer
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
  
  // Extract arrays
  const accelX = samples.map(s => s.accelX || 0);
  const accelY = samples.map(s => s.accelY || 0);
  const accelZ = samples.map(s => s.accelZ || 0);
  const gyroX = samples.map(s => s.gyroX || 0);
  const gyroY = samples.map(s => s.gyroY || 0);
  const gyroZ = samples.map(s => s.gyroZ || 0);
  // Try both field names: filteredMag and filteredMagnitude (from streaming vs stored data)
  const filteredMag = samples.map(s => s.filteredMag || s.filteredMagnitude || s.accelMag || 0);
  const timestamps = samples.map(s => s.timestamp_ms || 0);
  
  // Basic metrics
  const durationMs = duration || (timestamps[timestamps.length - 1] - timestamps[0]);
  
  // ROM from filtered magnitude
  const romMetrics = computeROM(filteredMag);
  
  // ROM in degrees from accelerometer
  const romDegrees = computeROMDegrees(accelX, accelY, accelZ);
  
  // Smoothness metrics
  const smoothnessMetrics = computeSmoothnessMetrics(accelX, accelY, accelZ, timestamps, filteredMag);
  
  // Gyroscope metrics
  const gyroMag = gyroX.map((x, i) => Math.sqrt(x * x + gyroY[i] * gyroY[i] + gyroZ[i] * gyroZ[i]));
  const gyroPeak = Math.max(...gyroMag);
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
  
  // Peak acceleration
  const accelMag = samples.map(s => s.accelMag || Math.sqrt(s.accelX * s.accelX + s.accelY * s.accelY + s.accelZ * s.accelZ));
  const peakAcceleration = Math.max(...accelMag);
  
  // Eccentric/Concentric phase detection
  const { liftingTime, loweringTime } = computePhaseTimings(filteredMag, timestamps);
  
  return {
    repNumber,
    setNumber,
    durationMs,
    sampleCount: samples.length,
    
    // ROM metrics
    rom: romMetrics.rom,
    romNormalized: romMetrics.romNormalized,
    peak: romMetrics.peak,
    trough: romMetrics.trough,
    romDegrees: romDegrees.romDegrees,
    minAngle: romDegrees.minAngle,
    maxAngle: romDegrees.maxAngle,
    meanAngle: romDegrees.meanAngle,
    
    // Smoothness metrics
    smoothnessScore: smoothnessMetrics.smoothnessScore,
    meanJerk: smoothnessMetrics.irregularityScore,
    normalizedJerk: smoothnessMetrics.normalizedJerk,
    directionChanges: smoothnessMetrics.directionChanges,
    
    // Gyroscope metrics
    gyroPeak,
    gyroRms,
    gyroStd,
    shakiness,
    
    // Phase timings
    liftingTime,
    loweringTime,
    totalPhaseTime: liftingTime + loweringTime,
    liftingPercent: liftingTime + loweringTime > 0 
      ? (liftingTime / (liftingTime + loweringTime)) * 100 
      : 50,
    
    // Peak metrics
    peakAcceleration,
    peakVelocity: gyroPeak, // Angular velocity as proxy
    
    // Chart data for visualization
    chartData: filteredMag
  };
};

/**
 * Compute eccentric/concentric phase timings
 * Concentric (lifting) = valley to peak (signal increasing)
 * Eccentric (lowering) = peak to valley (signal decreasing)
 */
const computePhaseTimings = (signal, timestamps) => {
  if (!signal || signal.length < 3) {
    return { liftingTime: 0, loweringTime: 0 };
  }
  
  // Check if timestamps are valid (not all zeros)
  const hasValidTimestamps = timestamps && timestamps.length === signal.length 
    && timestamps.some(t => t > 0) 
    && (timestamps[timestamps.length - 1] - timestamps[0]) > 0;
  
  // Find valley (minimum) and peak (maximum) indices
  let valleyIdx = 0;
  let peakIdx = 0;
  let minVal = signal[0];
  let maxVal = signal[0];
  
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] < minVal) {
      minVal = signal[i];
      valleyIdx = i;
    }
    if (signal[i] > maxVal) {
      maxVal = signal[i];
      peakIdx = i;
    }
  }
  
  // If peak and valley are at same position, no phase split possible
  if (peakIdx === valleyIdx) return { liftingTime: 0, loweringTime: 0 };
  
  let liftingTime = 0;
  let loweringTime = 0;
  
  if (hasValidTimestamps) {
    // Use actual timestamps for accurate timing
    if (valleyIdx < peakIdx) {
      for (let i = 1; i < signal.length; i++) {
        const dt = (timestamps[i] - timestamps[i - 1]) / 1000;
        if (dt <= 0) continue;
        if (i <= peakIdx) {
          liftingTime += dt;
        } else {
          loweringTime += dt;
        }
      }
    } else {
      for (let i = 1; i < signal.length; i++) {
        const dt = (timestamps[i] - timestamps[i - 1]) / 1000;
        if (dt <= 0) continue;
        if (i <= valleyIdx) {
          loweringTime += dt;
        } else {
          liftingTime += dt;
        }
      }
    }
  } else {
    // No valid timestamps — estimate from sample count (~20ms per sample at 50Hz)
    const totalDuration = signal.length * 0.02;
    if (valleyIdx < peakIdx) {
      liftingTime = (peakIdx / signal.length) * totalDuration;
      loweringTime = ((signal.length - peakIdx) / signal.length) * totalDuration;
    } else {
      loweringTime = (valleyIdx / signal.length) * totalDuration;
      liftingTime = ((signal.length - valleyIdx) / signal.length) * totalDuration;
    }
  }
  
  return { liftingTime, loweringTime };
};

/**
 * Compute fatigue indicators using gyroscope-based methodology
 * 
 * Formula: F = 0.35·D_ω + 0.25·I_T + 0.20·I_J + 0.20·I_S
 * 
 * Where:
 * - D_ω: Peak angular velocity change (35%)
 * - I_T: Tempo/duration increase (25%)
 * - I_J: Jerk increase (20%)
 * - I_S: Shakiness increase (20%)
 */
export const computeFatigueIndicators = (repMetricsList) => {
  if (!repMetricsList || repMetricsList.length < 3) {
    return {
      fatigueScore: 0,
      fatigueLevel: 'insufficient_data',
      D_omega: 0,
      I_T: 0,
      I_J: 0,
      I_S: 0,
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
  let D_omega, gyroDirection;
  if (hasGyro) {
    const avgGyroFirst = mean(gyroPeaks.slice(0, third));
    const avgGyroLast = mean(gyroPeaks.slice(-third));
    D_omega = avgGyroFirst > 0 ? Math.abs(avgGyroFirst - avgGyroLast) / avgGyroFirst : 0;
    gyroDirection = avgGyroLast < avgGyroFirst ? 'drop' : 'surge';
  } else {
    const avgPeakFirst = mean(peaks.slice(0, third));
    const avgPeakLast = mean(peaks.slice(-third));
    D_omega = avgPeakFirst > 0 ? Math.abs(avgPeakFirst - avgPeakLast) / avgPeakFirst : 0;
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
  
  // === Composite Fatigue Score ===
  const D_omega_clamped = Math.max(0, D_omega);
  const I_T_clamped = Math.max(0, I_T);
  const I_J_clamped = Math.max(0, I_J);
  const I_S_clamped = Math.max(0, I_S);
  
  let fatigueRaw = (0.35 * D_omega_clamped) +
                   (0.25 * I_T_clamped) +
                   (0.20 * I_J_clamped) +
                   (0.20 * I_S_clamped);
  
  // Boost for severe indicators
  const worstIndicator = Math.max(D_omega_clamped, I_T_clamped, I_J_clamped, I_S_clamped);
  if (worstIndicator > 0.40) {
    fatigueRaw = Math.min(1.0, fatigueRaw + (worstIndicator - 0.40) * 0.5);
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
    if (score < 10) return 'Excellent';
    if (score < 20) return 'Good';
    if (score < 35) return 'Fair';
    if (score < 55) return 'Poor';
    return 'Very Poor';
  };
  
  const getConsistencyRating = (score) => {
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  };
  
  const keyFindings = [];
  if (fatigueScore < 10) {
    keyFindings.push('✅ Excellent fatigue resistance — stable speed and control throughout');
  } else if (fatigueScore > 45) {
    keyFindings.push('⚠️ Significant fatigue detected — movement quality degraded notably');
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
  
  // Overall fatigue analysis
  const overallFatigue = computeFatigueIndicators(allRepMetrics);
  
  // Overall consistency from all rep charts
  const allChartData = allRepMetrics.map(m => m.chartData || []).filter(c => c.length > 0);
  const overallConsistency = computeRepConsistency(allChartData);
  
  // Calculate session averages
  const avgConcentric = mean(allRepMetrics.map(m => m.liftingTime || 0));
  const avgEccentric = mean(allRepMetrics.map(m => m.loweringTime || 0));
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
  
  // Duration
  const timestamps = samples.map(s => s.timestamp_ms || 0);
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
  extractMLFeatures,
  QUALITY_NAMES_BY_EXERCISE
};
