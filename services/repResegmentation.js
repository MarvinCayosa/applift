/**
 * Rep Resegmentation Service
 * 
 * Corrects rep boundaries using valley-to-valley detection.
 * This is a SELECTIVE preprocessing step that:
 *   - SKIPS sets that already have valid multi-rep segmentation
 *   - ONLY resegments sets with obviously merged reps (e.g., 1 long rep that should be 3)
 * 
 * Problem: Original segmentation sometimes merges multiple reps into one
 *          (e.g., Set 2 shows 1 rep of 76 samples when it should be 3 reps of ~25 each)
 * 
 * Solution: Detect merged reps by duration heuristics, then use valley-to-valley
 *           detection ONLY on those reps/sets.
 */

/**
 * Check if a set has valid segmentation that should NOT be resegmented
 * @param {Object} set - Set with reps array
 * @param {Object} params - Exercise-specific parameters
 * @returns {boolean} true if segmentation looks valid (skip reseg)
 */
function isSetSegmentationValid(set, params) {
  if (!set || !set.reps || set.reps.length === 0) return true;

  // If set has only 1 rep, check if it looks like merged reps  
  if (set.reps.length === 1) {
    const rep = set.reps[0];
    const sampleCount = rep.samples?.length || 0;
    const duration = rep.duration || 0;
    
    // If a single rep has way too many samples or too long duration, it's likely merged
    // Typical single rep: 20-40 samples at 20Hz = 1-2 seconds
    if (sampleCount > 60 || duration > 4000) {
      console.log(`[Resegmentation] Set ${set.setNumber}: Single rep with ${sampleCount} samples / ${duration}ms → likely merged, will resegment`);
      return false; // needs resegmentation
    }
    
    // Single rep with reasonable size → probably just 1 rep, skip
    return true;
  }

  // Multiple reps: check if durations are reasonable and consistent
  const durations = set.reps.map(r => r.duration || 0).filter(d => d > 0);
  const sampleCounts = set.reps.map(r => r.samples?.length || 0);
  
  if (durations.length === 0 && sampleCounts.every(s => s > 0)) {
    // No duration info but have samples - estimate from sample counts
    const avgSamples = sampleCounts.reduce((a, b) => a + b, 0) / sampleCounts.length;
    const maxDeviation = Math.max(...sampleCounts.map(s => Math.abs(s - avgSamples) / avgSamples));
    
    // If all reps have similar sample counts, segmentation is valid
    if (maxDeviation < 0.8) {
      console.log(`[Resegmentation] Set ${set.setNumber}: ${set.reps.length} reps with consistent samples (maxDev=${(maxDeviation*100).toFixed(0)}%) → SKIP`);
      return true;
    }
  }

  if (durations.length > 0) {
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    
    // If any rep is 3x longer than average, it might be merged
    if (maxDuration > avgDuration * 3 && set.reps.length > 1) {
      console.log(`[Resegmentation] Set ${set.setNumber}: Rep duration outlier (max=${maxDuration}ms, avg=${avgDuration}ms) → will resegment`);
      return false;
    }
    
    // All durations within normal range
    if (avgDuration >= params.minRepDurationMs && avgDuration <= params.maxRepDurationMs) {
      console.log(`[Resegmentation] Set ${set.setNumber}: ${set.reps.length} reps with valid durations (avg=${avgDuration.toFixed(0)}ms) → SKIP`);
      return true;
    }
  }

  // If we have multiple reps with reasonable sample counts, trust the segmentation
  if (set.reps.length >= 2) {
    const allHaveSamples = set.reps.every(r => (r.samples?.length || 0) >= 5);
    if (allHaveSamples) {
      console.log(`[Resegmentation] Set ${set.setNumber}: ${set.reps.length} reps all with samples → SKIP`);
      return true;
    }
  }

  return true; // Default: trust original segmentation
}

/**
 * Find valleys (local minima) in a signal with adaptive parameters
 * @param {number[]} signal - Signal array
 * @param {number} minDistance - Minimum distance between valleys (samples)
 * @param {number} minProminence - Absolute minimum prominence
 * @returns {number[]} Array of valley indices
 */
function findValleys(signal, minDistance = 8, minProminence = 0.02) {
  if (!signal || signal.length < 3) return [];

  const valleys = [];

  for (let i = 1; i < signal.length - 1; i++) {
    // Check if it's a local minimum
    if (signal[i] < signal[i - 1] && signal[i] < signal[i + 1]) {
      // Check prominence: how deep is this valley compared to neighbors?
      const windowSize = Math.max(8, Math.floor(minDistance * 0.8));
      const leftWindow = signal.slice(Math.max(0, i - windowSize), i);
      const rightWindow = signal.slice(i + 1, Math.min(signal.length, i + 1 + windowSize));
      
      const leftMax = leftWindow.length > 0 ? Math.max(...leftWindow) : signal[i];
      const rightMax = rightWindow.length > 0 ? Math.max(...rightWindow) : signal[i];
      const prominence = Math.min(leftMax - signal[i], rightMax - signal[i]);

      if (prominence >= minProminence) {
        // Check minimum distance from last valley
        if (valleys.length === 0 || i - valleys[valleys.length - 1] >= minDistance) {
          valleys.push(i);
        } else if (valleys.length > 0 && signal[i] < signal[valleys[valleys.length - 1]]) {
          // Replace last valley if this one is deeper (keep the better valley)
          valleys[valleys.length - 1] = i;
        }
      }
    }
  }

  return valleys;
}

/**
 * Smooth signal using simple moving average
 * @param {number[]} signal - Signal array
 * @param {number} windowSize - Window size for smoothing (auto-adjusted if too large)
 * @returns {number[]} Smoothed signal
 */
function smoothSignal(signal, windowSize = 5) {
  // Auto-adjust window: never more than 1/4 of signal length
  const maxWindow = Math.max(3, Math.floor(signal.length / 4));
  const actualWindow = Math.min(windowSize, maxWindow);
  
  if (signal.length < actualWindow) return [...signal];

  const smoothed = [];
  const halfWindow = Math.floor(actualWindow / 2);

  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - halfWindow);
    const end = Math.min(signal.length, i + halfWindow + 1);
    const window = signal.slice(start, end);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    smoothed.push(avg);
  }

  return smoothed;
}

/**
 * Get exercise-specific resegmentation parameters
 * @param {string} exercise - Exercise name
 * @returns {Object} Parameters for resegmentation
 */
function getExerciseParameters(exercise) {
  const exerciseLower = (exercise || '').toLowerCase().replace(/[\s_-]+/g, '');

  // Concentration Curls - relatively fast, ~1-3s per rep
  if (exerciseLower.includes('concentration') || exerciseLower.includes('curl')) {
    return {
      minRepDurationMs: 600,
      maxRepDurationMs: 6000,
      smoothingWindow: 5,
      minDistance: 8
    };
  }

  // Overhead Extension
  if (exerciseLower.includes('overhead') || exerciseLower.includes('extension')) {
    return {
      minRepDurationMs: 600,
      maxRepDurationMs: 6000,
      smoothingWindow: 5,
      minDistance: 8
    };
  }

  // Bench Press
  if (exerciseLower.includes('bench') || exerciseLower.includes('press')) {
    return {
      minRepDurationMs: 800,
      maxRepDurationMs: 8000,
      smoothingWindow: 7,
      minDistance: 10
    };
  }

  // Squat
  if (exerciseLower.includes('squat')) {
    return {
      minRepDurationMs: 1000,
      maxRepDurationMs: 10000,
      smoothingWindow: 7,
      minDistance: 12
    };
  }

  // Weight Stack machines
  if (exerciseLower.includes('pulldown') || exerciseLower.includes('legextension') || 
      exerciseLower.includes('lateral') || exerciseLower.includes('seated')) {
    return {
      minRepDurationMs: 1000,
      maxRepDurationMs: 10000,
      smoothingWindow: 7,
      minDistance: 12
    };
  }

  // Default
  return {
    minRepDurationMs: 600,
    maxRepDurationMs: 6000,
    smoothingWindow: 5,
    minDistance: 8
  };
}

/**
 * Resegment a single set's reps using valley-to-valley detection
 * Only called for sets that NEED resegmentation (merged reps detected)
 * @param {Object} set - Set data with reps array
 * @param {string} exercise - Exercise name
 * @param {number} maxRepsPerSet - Maximum reps allowed per set (0 = no limit)
 * @returns {Object} Resegmented set with corrected rep boundaries
 */
function resegmentSet(set, exercise, maxRepsPerSet = 0) {
  if (!set || !set.reps || set.reps.length === 0) {
    return set;
  }

  const params = getExerciseParameters(exercise);

  // === SMART SKIP: Don't resegment sets with valid segmentation ===
  if (isSetSegmentationValid(set, params)) {
    return set; // Return unchanged
  }

  // === Only resegment sets that need it ===
  // Extract continuous signal from all samples in this set
  const allSamples = [];
  set.reps.forEach(rep => {
    if (rep.samples && Array.isArray(rep.samples)) {
      allSamples.push(...rep.samples);
    }
  });

  if (allSamples.length < 10) {
    console.log(`[Resegmentation] Set ${set.setNumber}: Too few samples (${allSamples.length}), skipping`);
    return set;
  }

  console.log(`[Resegmentation] Set ${set.setNumber}: Resegmenting ${allSamples.length} samples (was ${set.reps.length} rep)`);

  // Extract signal magnitude
  const signal = allSamples.map(s => {
    if (s.filteredMag !== undefined) return s.filteredMag;
    if (s.accelMag !== undefined) return s.accelMag;
    const ax = s.accelX || 0;
    const ay = s.accelY || 0;
    const az = s.accelZ || 0;
    return Math.sqrt(ax * ax + ay * ay + az * az);
  });

  const timestamps = allSamples.map(s => s.timestamp_ms || 0);

  // Light smoothing (small window to preserve peaks/valleys)
  const signalSmooth = smoothSignal(signal, params.smoothingWindow);

  // Estimate sample rate from median dt
  const dtArray = timestamps.slice(1).map((t, i) => t - timestamps[i]).filter(d => d > 0);
  const sortedDt = [...dtArray].sort((a, b) => a - b);
  const medianDt = sortedDt.length > 0 
    ? sortedDt[Math.floor(sortedDt.length / 2)]
    : 50;

  // Calculate min distance in samples
  const minDistanceSamples = Math.max(
    Math.floor(params.minRepDurationMs / medianDt),
    params.minDistance
  );

  // Calculate signal range for prominence
  const signalRange = Math.max(...signalSmooth) - Math.min(...signalSmooth);
  
  // Try progressively lower prominence thresholds — pick the one that gives most valleys
  const prominenceThresholds = [
    signalRange * 0.12,
    signalRange * 0.08,
    signalRange * 0.05,
    signalRange * 0.03,
    signalRange * 0.02,
  ].filter(p => p > 0.005);

  let bestValleys = [];
  
  for (const prom of prominenceThresholds) {
    const valleys = findValleys(signalSmooth, minDistanceSamples, prom);
    if (valleys.length > bestValleys.length) {
      bestValleys = valleys;
    }
  }

  console.log(`[Resegmentation] Best valley count: ${bestValleys.length} valleys at indices: [${bestValleys.join(', ')}]`);

  if (bestValleys.length < 1) {
    console.log(`[Resegmentation] Set ${set.setNumber}: No valleys found, keeping original`);
    return set;
  }

  // Build rep boundaries from valleys
  // Reps go from: start→valley1, valley1→valley2, ..., lastValley→end
  const boundaries = [0, ...bestValleys, allSamples.length];
  
  // Filter out segments that are too short
  const validBoundaries = [0];
  for (let i = 1; i < boundaries.length; i++) {
    const segmentLength = boundaries[i] - validBoundaries[validBoundaries.length - 1];
    const startTs = timestamps[validBoundaries[validBoundaries.length - 1]] || 0;
    const endTs = timestamps[Math.min(boundaries[i], timestamps.length - 1)] || 0;
    const segmentDuration = endTs - startTs;
    
    if (segmentLength >= 5 && segmentDuration >= params.minRepDurationMs * 0.4) {
      validBoundaries.push(boundaries[i]);
    }
  }
  // Ensure last boundary is the end
  if (validBoundaries[validBoundaries.length - 1] !== allSamples.length) {
    validBoundaries[validBoundaries.length - 1] = allSamples.length;
  }

  const newRepCount = validBoundaries.length - 1;
  
  if (newRepCount <= set.reps.length) {
    // Resegmentation didn't find MORE reps than original — keep original
    console.log(`[Resegmentation] Set ${set.setNumber}: Reseg found ${newRepCount} reps (≤ original ${set.reps.length}), keeping original`);
    return set;
  }

  // Cap at maxRepsPerSet if specified
  let cappedBoundaries = validBoundaries;
  if (maxRepsPerSet > 0 && newRepCount > maxRepsPerSet) {
    console.log(`[Resegmentation] Set ${set.setNumber}: Capping from ${newRepCount} to ${maxRepsPerSet} reps (plannedReps limit)`);
    cappedBoundaries = validBoundaries.slice(0, maxRepsPerSet + 1);
    // Ensure last boundary extends to end of samples
    cappedBoundaries[cappedBoundaries.length - 1] = allSamples.length;
  }

  // Create new reps
  const newReps = [];
  for (let i = 0; i < cappedBoundaries.length - 1; i++) {
    const startIdx = cappedBoundaries[i];
    const endIdx = cappedBoundaries[i + 1];
    const repSamples = allSamples.slice(startIdx, endIdx);
    
    const startTime = timestamps[startIdx] || 0;
    const endTime = timestamps[Math.min(endIdx - 1, timestamps.length - 1)] || 0;
    const duration = endTime - startTime;

    // Find peak in this rep
    const repSignal = signalSmooth.slice(startIdx, endIdx);
    const peakLocalIdx = repSignal.length > 0 ? repSignal.indexOf(Math.max(...repSignal)) : 0;

    newReps.push({
      repNumber: i + 1,
      setNumber: set.setNumber,
      startTime: startTime > 0 ? new Date(startTime).toISOString() : null,
      endTime: endTime > 0 ? new Date(endTime).toISOString() : null,
      duration: duration,
      sampleCount: repSamples.length,
      samples: repSamples,
      peakAcceleration: signal[startIdx + peakLocalIdx] || 0,
      classification: null,
      confidence: null
    });
  }

  console.log(`[Resegmentation] Set ${set.setNumber}: ${set.reps.length} original rep → ${newReps.length} resegmented reps ✓`);

  return {
    ...set,
    reps: newReps,
    _resegmented: true,
    _originalRepCount: set.reps.length,
    _cappedToLimit: maxRepsPerSet > 0 && newRepCount > maxRepsPerSet
  };
}

/**
 * Resegment all sets in workout data (SELECTIVE - only fixes merged reps)
 * @param {Object} workoutData - Complete workout data with sets
 * @returns {Object} Workout data with selectively resegmented reps
 */
function resegmentWorkout(workoutData) {
  if (!workoutData || !workoutData.sets || workoutData.sets.length === 0) {
    console.log('[Resegmentation] No sets to resegment');
    return workoutData;
  }

  console.log(`[Resegmentation] Checking ${workoutData.sets.length} sets for merged reps (exercise: ${workoutData.exercise})`);

  // Get max reps per set from planned reps (if available)
  const maxRepsPerSet = parseInt(workoutData.plannedReps) || 0;
  if (maxRepsPerSet > 0) {
    console.log(`[Resegmentation] Max reps per set capped at ${maxRepsPerSet} (plannedReps)`);
  }

  const resegmentedSets = workoutData.sets.map(set => 
    resegmentSet(set, workoutData.exercise, maxRepsPerSet)
  );

  const totalOriginalReps = workoutData.sets.reduce((sum, set) => sum + (set.reps?.length || 0), 0);
  const totalResegmentedReps = resegmentedSets.reduce((sum, set) => sum + (set.reps?.length || 0), 0);
  const setsChanged = resegmentedSets.filter(s => s._resegmented).length;

  console.log(`[Resegmentation] Done: ${totalOriginalReps} → ${totalResegmentedReps} reps (${setsChanged}/${workoutData.sets.length} sets changed)`);

  return {
    ...workoutData,
    sets: resegmentedSets,
    _resegmented: setsChanged > 0,
    _resegmentationSummary: {
      originalReps: totalOriginalReps,
      resegmentedReps: totalResegmentedReps,
      setsChanged,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  resegmentWorkout,
  resegmentSet,
  findValleys,
  smoothSignal,
  getExerciseParameters
};
