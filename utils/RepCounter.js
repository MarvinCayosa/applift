/**
 * RepCounter - Advanced rep detection using sliding window analysis
 * 
 * Algorithm from index.html IMU Monitor - Sliding Window Rep Counter
 * 
 * Features:
 * - Sliding window with 90% overlap for real-time detection
 * - Peak/valley detection with prominence-based filtering
 * - Dynamic threshold adaptation based on recent movement
 * - Continuous rep segmentation with NO GAPS using boundary tracking
 * - Rep metadata with precise boundary information
 * - Exercise-specific counting direction (concentric phase only)
 */

// Counting direction: which phase to count as a rep
// 'valley-to-peak': Count when lifting up (Valley → Peak) - most exercises
// 'peak-to-valley': Count when pulling down (Peak → Valley) - pulldown exercises
// 'both': Count both directions (original behavior) - dumbbell exercises
const COUNT_DIRECTION = {
  VALLEY_TO_PEAK: 'valley-to-peak',  // Lifting up = rep (bench press push, squats push)
  PEAK_TO_VALLEY: 'peak-to-valley',  // Pulling down = rep (lat pulldown)
  BOTH: 'both',  // Count both directions (dumbbell exercises - original behavior)
};

// Exercise-specific counting direction
// Dumbbell exercises: count BOTH directions (original working behavior)
// Barbell exercises: count valley-to-peak only (prevents double-counting)
// Weight stack: direction depends on exercise type
const EXERCISE_COUNT_DIRECTION = {
  0: COUNT_DIRECTION.BOTH,            // Concentration Curls - ORIGINAL BEHAVIOR
  1: COUNT_DIRECTION.BOTH,            // Overhead Extension - ORIGINAL BEHAVIOR
  2: COUNT_DIRECTION.VALLEY_TO_PEAK,  // Bench Press - push up from chest only
  3: COUNT_DIRECTION.VALLEY_TO_PEAK,  // Back Squats - stand up only
  4: COUNT_DIRECTION.PEAK_TO_VALLEY,  // Lateral Pulldown - pull down only
  5: COUNT_DIRECTION.VALLEY_TO_PEAK,  // Seated Leg Extension - extend up only
};

// Equipment name → exercise code mapping (same as ROMComputer)
const EQUIPMENT_EXERCISE_MAP = {
  'dumbbell': { 'concentration curls': 0, 'overhead extension': 1 },
  'barbell': { 'bench press': 2, 'back squats': 3 },
  'weight stack': { 'lateral pulldown': 4, 'seated leg extension': 5, 'leg extension': 5 },
};

export class RepCounter {
  constructor(config = {}) {
    this.repCount = 0;
    
    // Sliding window parameters (optimized for fast response - from index.html)
    this.windowDuration = config.windowDuration || 1.5; // 1.5 second window for faster detection
    this.windowOverlap = config.windowOverlap || 0.9; // 90% overlap - process almost every sample
    this.samplingRate = config.samplingRate || 20; // 20Hz
    this.windowSamples = Math.floor(this.windowDuration * this.samplingRate);
    this.stepSize = Math.floor(this.windowSamples * (1 - this.windowOverlap));
    
    // Data buffers
    this.accelBuffer = [];
    this.timeBuffer = [];
    this.allSamples = [];
    
    // Rep segmentation
    this.reps = []; // Array of rep segments with timestamps
    this.currentRep = null;
    this.lastRepEndTime = 0;
    
    // Peak detection for slow movements (balanced sensitivity)
    this.minPeakProminence = config.minPeakProminence || 0.25; // Increased from 0.15 - filters small tremors
    this.minPeakDistance = config.minPeakDistance || 20; // Increased from 15 - minimum 1.0s between peaks (20Hz * 1.0)
    this.minRepDuration = config.minRepDuration || 0.6; // Increased from 0.5 - filters quick tremor spikes
    this.maxRepDuration = config.maxRepDuration || 8.0; // Maximum 8 seconds per rep (controlled reps)
    this.adaptiveThreshold = true; // Use adaptive thresholding
    
    // Anti-tremor: Refractory period after counting a rep (prevents double-counting during shaking)
    this.refractoryPeriod = config.refractoryPeriod || 800; // 800ms cooldown after rep
    this.lastRepCountedTime = 0; // Timestamp of last counted rep
    
    // Dynamic threshold (in m/s² - gravity ≈ 9.81 m/s²)
    this.thresholdHigh = 10.5;
    this.thresholdLow = 9.5;
    this.repHeight = 0;
    
    // State tracking
    this.state = 'IDLE';
    this.lastPeakIndex = -1;
    this.lastValleyIndex = -1;
    this.lastDetectedValleyIndex = -1; // Track the last valley used in a rep
    this.lastDetectedPeakIndex = -1;   // Track the last peak used in a rep
    this.previousRepEndValley = null;  // Track where the previous rep ended (next rep starts here)
    this.previousRepEndIndex = null;   // Track the sample index where previous rep ended
    this.inRepPhase = false;
    
    // Pending rep for direction-specific modes (valley-to-peak, peak-to-valley)
    // We count at the turn point but wait for the return to capture full cycle
    this.pendingRep = null; // { startPoint, peakPoint, countedAt, waitingFor: 'valley' | 'peak' }
    
    // Statistics
    this.repTimes = [];
    this.repStartTime = 0;
    
    // Exercise-specific counting direction
    // Default: 'both' (count when lifting - works for dumbbell exercises)
    this.exerciseCode = config.exerciseCode ?? 0;
    this.countDirection = config.countDirection || EXERCISE_COUNT_DIRECTION[this.exerciseCode] || COUNT_DIRECTION.BOTH;
  }
  
  /**
   * Set exercise type from equipment and workout names
   * This configures the appropriate counting direction for the exercise
   * @param {string} equipment - Equipment name (e.g., 'barbell', 'dumbbell')
   * @param {string} workout - Exercise name (e.g., 'bench press', 'concentration curls')
   */
  setExerciseFromNames(equipment, workout) {
    const equipmentLower = (equipment || '').toLowerCase().trim();
    const workoutLower = (workout || '').toLowerCase().trim();
    
    // Find matching exercise code
    let exerciseCode = 0; // Default to concentration curls
    let foundMatch = false;
    for (const [eqName, exercises] of Object.entries(EQUIPMENT_EXERCISE_MAP)) {
      if (equipmentLower.includes(eqName)) {
        for (const [exName, code] of Object.entries(exercises)) {
          if (workoutLower.includes(exName)) {
            exerciseCode = code;
            foundMatch = true;
            break;
          }
        }
      }
    }
    
    this.exerciseCode = exerciseCode;
    this.countDirection = EXERCISE_COUNT_DIRECTION[exerciseCode] || COUNT_DIRECTION.BOTH;
    
    console.log(`[RepCounter] Exercise set: code=${exerciseCode}, countDirection=${this.countDirection} (${equipment}/${workout})${!foundMatch ? ' [NO MATCH FOUND, using defaults]' : ''}`);
  }
  
  /**
   * Set counting direction directly
   * @param {'valley-to-peak' | 'peak-to-valley' | 'both'} direction
   */
  setCountDirection(direction) {
    if (direction === COUNT_DIRECTION.VALLEY_TO_PEAK || direction === COUNT_DIRECTION.PEAK_TO_VALLEY || direction === COUNT_DIRECTION.BOTH) {
      this.countDirection = direction;
      console.log(`[RepCounter] Count direction set to: ${direction}`);
    }
  }
  
  /**
   * Add a sample for rep detection
   * Can accept either individual parameters (legacy) or a complete sample object
   */
  addSample(accelXOrSample, accelY, accelZ, gyroX, gyroY, gyroZ, roll, pitch, yaw, accelMag, timestamp) {
    let sample;
    let magForDetection;
    let ts;
    
    // Check if first parameter is a sample object (new API)
    if (typeof accelXOrSample === 'object' && accelXOrSample !== null) {
      const inputSample = accelXOrSample;
      ts = inputSample.relativeTime ?? inputSample.timestamp ?? Date.now();
      magForDetection = inputSample.filteredMagnitude ?? inputSample.accelMag ?? 9.81;
      
      // Store complete sample data with all fields
      sample = {
        timestamp: ts,
        accelX: inputSample.accelX ?? 0,
        accelY: inputSample.accelY ?? 0,
        accelZ: inputSample.accelZ ?? 0,
        gyroX: inputSample.gyroX ?? 0,
        gyroY: inputSample.gyroY ?? 0,
        gyroZ: inputSample.gyroZ ?? 0,
        roll: inputSample.roll ?? 0,
        pitch: inputSample.pitch ?? 0,
        yaw: inputSample.yaw ?? 0,
        // Store BOTH raw and filtered magnitudes for ML/charting
        rawMagnitude: inputSample.rawMagnitude ?? inputSample.accelMag ?? 0,
        filteredMagnitude: inputSample.filteredMagnitude ?? inputSample.accelMag ?? 0,
        accelMag: magForDetection, // For backward compatibility
        // Filtered individual axes if available
        filteredX: inputSample.filteredX ?? inputSample.accelX ?? 0,
        filteredY: inputSample.filteredY ?? inputSample.accelY ?? 0,
        filteredZ: inputSample.filteredZ ?? inputSample.accelZ ?? 0,
        // Quaternion data for ROM computation
        qw: inputSample.qw,
        qx: inputSample.qx,
        qy: inputSample.qy,
        qz: inputSample.qz,
        sampleIndex: this.allSamples.length,
        repNumber: 0
      };
    } else {
      // Legacy API: individual parameters
      ts = timestamp;
      magForDetection = accelMag;
      sample = {
        timestamp: ts,
        accelX: accelXOrSample,
        accelY, accelZ,
        gyroX, gyroY, gyroZ,
        roll, pitch, yaw,
        accelMag: accelMag,
        rawMagnitude: accelMag, // Assume filtered is passed in legacy mode
        filteredMagnitude: accelMag,
        sampleIndex: this.allSamples.length,
        repNumber: 0
      };
    }
    
    this.allSamples.push(sample);
    
    // Use filtered magnitude for rep detection on ALL exercises
    this.accelBuffer.push(magForDetection);
    this.timeBuffer.push(ts);
    
    // Process window immediately when we have enough samples
    if (this.accelBuffer.length >= this.windowSamples) {
      this.processWindow();
    }
  }
  
  processWindow() {
    // Get current window
    const window = this.accelBuffer.slice(-this.windowSamples);
    const windowTimes = this.timeBuffer.slice(-this.windowSamples);
    
    // Calculate statistics EVERY time to prevent threshold drift
    const max = Math.max(...window);
    const min = Math.min(...window);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const range = max - min;
    
    // Calculate standard deviation
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);
    
    // Fixed threshold approach - use minimum threshold to prevent issues with many reps
    // Use 20% of range OR 0.2 m/s² minimum (more conservative to avoid false positives)
    const rangeThreshold = Math.max(range * 0.20, 0.20);
    const stdThreshold = Math.max(stdDev * 0.6, 0.20);
    const finalThreshold = Math.min(rangeThreshold, stdThreshold);
    
    // Update thresholds EVERY window
    this.thresholdHigh = mean + finalThreshold;
    this.thresholdLow = mean - finalThreshold;
    this.repHeight = range;
    
    // Detect peaks and valleys using prominence-based method
    this.detectRepsInWindow(window, windowTimes);
  }
  
  detectRepsInWindow(window, windowTimes) {
    const n = window.length;
    const currentGlobalIndex = this.accelBuffer.length - 1;
    
    // Anti-tremor: Check if we're in refractory period (skip detection entirely)
    const now = Date.now();
    if (this.lastRepCountedTime && (now - this.lastRepCountedTime) < this.refractoryPeriod) {
      // Still in refractory period - skip peak/valley detection to prevent tremor-induced double counting
      return;
    }
    
    // Find all peaks (local maxima) - 5-sample window for stable detection (increased from 3)
    // Wider window helps filter out high-frequency tremor/shaking
    const peaks = [];
    for (let i = 5; i < n - 5; i++) {
      let isPeak = true;
      const centerValue = window[i];
      
      // Check if it's higher than neighbors (5-sample window = filters tremors better)
      for (let j = i - 5; j <= i + 5; j++) {
        if (j !== i && window[j] >= centerValue) {
          isPeak = false;
          break;
        }
      }
      
      if (isPeak && centerValue > this.thresholdHigh) {
        const globalIndex = currentGlobalIndex - (n - 1 - i);
        
        // Check minimum peak distance to prevent multiple detections in one rep
        if (this.lastPeakIndex === -1 || globalIndex - this.lastPeakIndex >= this.minPeakDistance) {
          peaks.push({
            index: globalIndex,
            value: centerValue,
            time: windowTimes[i]
          });
        }
      }
    }
    
    // Find all valleys (local minima) - 5-sample window for stable detection (increased from 3)
    // Wider window helps filter out high-frequency tremor/shaking
    const valleys = [];
    for (let i = 5; i < n - 5; i++) {
      let isValley = true;
      const centerValue = window[i];
      
      // Check if it's lower than neighbors (5-sample window = filters tremors better)
      for (let j = i - 5; j <= i + 5; j++) {
        if (j !== i && window[j] <= centerValue) {
          isValley = false;
          break;
        }
      }
      
      if (isValley && centerValue < this.thresholdLow) {
        const globalIndex = currentGlobalIndex - (n - 1 - i);
        
        // Check minimum valley distance to prevent multiple detections in one rep
        if (this.lastValleyIndex === -1 || globalIndex - this.lastValleyIndex >= this.minPeakDistance) {
          valleys.push({
            index: globalIndex,
            value: centerValue,
            time: windowTimes[i]
          });
        } 
      }
    }
    
    // Detect rep completion based on exercise-specific counting direction
    // - 'both': Count both directions (ORIGINAL behavior for dumbbell exercises)
    // - 'valley-to-peak': Count when lifting only (barbell exercises) - extends to include lowering
    // - 'peak-to-valley': Count when pulling down only (pulldown exercises) - extends to include return
    if (valleys.length >= 1 && peaks.length >= 1) {
      const lastValley = valleys[valleys.length - 1];
      const lastPeak = peaks[peaks.length - 1];
      
      // Debug: Log peak/valley detection (every 5 seconds to avoid spam)
      if (!this._lastDebugLog || Date.now() - this._lastDebugLog > 5000) {
        console.log(`🔬 [RepCounter] peaks=${peaks.length}, valleys=${valleys.length}, countDirection=${this.countDirection}, lastValley.idx=${lastValley.index}, lastPeak.idx=${lastPeak.index}`);
        this._lastDebugLog = Date.now();
      }
      
      let isValidRep = false;
      let startPoint, endPoint, peakPoint, prominence, repDuration;
      
      // BOTH mode: Original behavior - count valley→peak AND peak→valley
      // This is the working behavior for dumbbell exercises
      if (this.countDirection === 'both') {
        // Determine which came first to decide the direction
        // Case 1: Valley -> Peak (lifting up from bottom)
        if (lastValley.index < lastPeak.index) {
          // Skip if we've already counted this peak
          if (lastPeak.index <= this.lastDetectedPeakIndex) {
            return;
          }
          
          startPoint = lastValley;
          endPoint = lastPeak;
          peakPoint = lastPeak;
          prominence = Math.abs(lastPeak.value - lastValley.value);
          repDuration = (lastPeak.time - lastValley.time) / 1000;
          isValidRep = true;
        }
        // Case 2: Peak -> Valley (lowering down from top)
        else if (lastPeak.index < lastValley.index) {
          // Skip if we've already counted this valley
          if (lastValley.index <= this.lastDetectedValleyIndex) {
            return;
          }
          
          startPoint = lastPeak;
          endPoint = lastValley;
          peakPoint = lastPeak;
          prominence = Math.abs(lastPeak.value - lastValley.value);
          repDuration = (lastValley.time - lastPeak.time) / 1000;
          isValidRep = true;
        }
      }
      // VALLEY-TO-PEAK mode: Count valley→peak, but capture full cycle (valley→peak→valley)
      else if (this.countDirection === 'valley-to-peak') {
        // First check if we have a pending rep waiting for completion (lowering phase)
        if (this.pendingRep && this.pendingRep.waitingFor === 'valley') {
          // Check if this valley comes after the pending rep's peak
          if (lastValley.index > this.pendingRep.peakPoint.index && 
              lastValley.index > this.lastDetectedValleyIndex) {
            // Complete the pending rep with full cycle data
            this.extendLastRepToPoint(lastValley);
            this.pendingRep = null;
            this.lastDetectedValleyIndex = lastValley.index;
            this.lastValleyIndex = lastValley.index;
            console.log(`📦 [RepCounter] Extended last rep to include lowering phase (valley idx=${lastValley.index})`);
          }
        }
        
        // Count Valley -> Peak (lifting up from bottom)
        if (lastValley.index < lastPeak.index) {
          // Skip if we've already counted this peak
          if (lastPeak.index <= this.lastDetectedPeakIndex) {
            return;
          }
          
          startPoint = lastValley;
          endPoint = lastPeak; // Initially ends at peak, will be extended later
          peakPoint = lastPeak;
          prominence = Math.abs(lastPeak.value - lastValley.value);
          repDuration = (lastPeak.time - lastValley.time) / 1000;
          isValidRep = true;
        }
      }
      // PEAK-TO-VALLEY mode: Count peak→valley, but capture full cycle (peak→valley→peak)
      else if (this.countDirection === 'peak-to-valley') {
        // First check if we have a pending rep waiting for completion (return phase)
        if (this.pendingRep && this.pendingRep.waitingFor === 'peak') {
          // Check if this peak comes after the pending rep's valley
          if (lastPeak.index > this.pendingRep.endPoint.index && 
              lastPeak.index > this.lastDetectedPeakIndex) {
            // Complete the pending rep with full cycle data
            this.extendLastRepToPoint(lastPeak);
            this.pendingRep = null;
            this.lastDetectedPeakIndex = lastPeak.index;
            this.lastPeakIndex = lastPeak.index;
            console.log(`📦 [RepCounter] Extended last rep to include return phase (peak idx=${lastPeak.index})`);
          }
        }
        
        // Count Peak -> Valley (pulling down from top)
        if (lastPeak.index < lastValley.index) {
          // Skip if we've already counted this valley
          if (lastValley.index <= this.lastDetectedValleyIndex) {
            return;
          }
          
          startPoint = lastPeak;
          endPoint = lastValley; // Initially ends at valley, will be extended later
          peakPoint = lastPeak;
          prominence = Math.abs(lastPeak.value - lastValley.value);
          repDuration = (lastValley.time - lastPeak.time) / 1000;
          isValidRep = true;
        }
      }
      
      if (isValidRep) {
        // Log detection attempt for debugging
        console.log(`🔍 Rep candidate: duration=${repDuration.toFixed(2)}s, prominence=${prominence.toFixed(3)} m/s²`);
        
        // Validation with anti-tremor checks
        // Increased prominence threshold filters out small shaking movements
        if (repDuration >= this.minRepDuration && 
            repDuration <= this.maxRepDuration && 
            prominence >= this.minPeakProminence) {
          
          // Count the rep and start refractory period
          this.completeRep(startPoint, peakPoint, endPoint);
          this.lastRepCountedTime = Date.now(); // Start refractory period
          
          // Mark these indices as used
          this.lastDetectedValleyIndex = lastValley.index;
          this.lastDetectedPeakIndex = lastPeak.index;
          this.lastValleyIndex = lastValley.index;
          this.lastPeakIndex = lastPeak.index;
          this.lastRepEndTime = endPoint.time;
          
          // For direction-specific modes, mark pending rep to capture full cycle
          if (this.countDirection === 'valley-to-peak') {
            this.pendingRep = {
              startPoint,
              peakPoint,
              endPoint,
              waitingFor: 'valley' // Wait for lowering phase
            };
          } else if (this.countDirection === 'peak-to-valley') {
            this.pendingRep = {
              startPoint,
              peakPoint,
              endPoint,
              waitingFor: 'peak' // Wait for return phase
            };
          }
        } else {
          console.log(`❌ Failed validation: duration=${repDuration >= this.minRepDuration && repDuration <= this.maxRepDuration}, prominence=${prominence >= this.minPeakProminence} (need ${this.minPeakProminence})`);
        }
      } else if (this.countDirection !== 'both') {
        // For direction-specific modes only: update tracking indices when ignoring a direction
        // This prevents the distance check from blocking future peak/valley detection
        if (peaks.length > 0) {
          this.lastPeakIndex = lastPeak.index;
        }
        if (valleys.length > 0) {
          this.lastValleyIndex = lastValley.index;
        }
      }
    }
    
    // Track rep phase for real-time labeling
    if (valleys.length > 0 && peaks.length === 0) {
      this.inRepPhase = true;
      this.state = 'STARTING'; // Bottom position (valley)
    } else if (peaks.length > 0) {
      this.state = 'LIFTING'; // Moving up to peak or coming down
    } else {
      this.inRepPhase = false;
      this.state = 'REST';
    }
  }
  
  completeRep(startValley, peak, endValley) {
    this.repCount++;
    const duration = (endValley.time - startValley.time) / 1000;
    
    console.log(`✅ REP #${this.repCount} | Duration: ${duration.toFixed(2)}s | Range: ${Math.abs(peak.value - startValley.value).toFixed(2)} m/s²`);
    
    // Store rep metadata with precise boundary information
    const repData = {
      repNumber: this.repCount,
      startTime: startValley.time,
      endTime: endValley.time,
      startIndex: startValley.index,
      endIndex: endValley.index,
      duration: duration,
      peakAcceleration: peak.value,
      peakValue: peak.value,
      peakVelocity: peak.value / 2, // Estimated velocity
      valleyValue: startValley.value,
      range: Math.abs(peak.value - startValley.value)
    };
    this.reps.push(repData);
    this.repTimes.push(duration);
    
    // *** CRITICAL FIX: Continuous segmentation with NO GAPS ***
    // Rep boundaries: each rep INCLUDES the valley sample at the end
    // The next rep starts at the sample AFTER the valley
    
    let repStartIndex = 0;
    
    if (this.repCount === 1) {
      // First rep: starts from sample 0 (beginning of recording)
      repStartIndex = 0;
    } else if (this.previousRepEndIndex !== null) {
      // Subsequent reps: start at the sample AFTER previous rep's valley
      // This ensures continuous coverage: Rep N ends at valley index X, Rep N+1 starts at X+1
      repStartIndex = this.previousRepEndIndex + 1;
    }
    
    // Find the end index: INCLUDE the end valley sample in this rep
    // The next rep will start at the sample AFTER this valley
    // This ensures continuous coverage with NO GAPS
    let repEndIndex = this.allSamples.length - 1;
    for (let i = 0; i < this.allSamples.length; i++) {
      if (this.allSamples[i].timestamp >= endValley.time) {
        // Include the valley sample in this rep (not i-1, but i)
        repEndIndex = i;
        break;
      }
    }
    
    // Ensure we don't overlap with previous rep
    if (repStartIndex > repEndIndex) {
      repEndIndex = repStartIndex;
    }
    
    // *** VALIDATION: Reject reps with unreasonable sample counts ***
    // At 20Hz: 0.5s = 10 samples, 8s = 160 samples
    // If we have way more, it means segmentation failed
    const sampleCount = repEndIndex - repStartIndex + 1;
    const maxExpectedSamples = this.maxRepDuration * this.samplingRate * 1.2; // 20% buffer
    
    if (sampleCount > maxExpectedSamples) {
      console.warn(`⚠️ Rep ${this.repCount} rejected: ${sampleCount} samples exceeds max ${maxExpectedSamples.toFixed(0)} (likely false detection)`);
      this.repCount--; // Rollback rep count
      this.reps.pop(); // Remove rep metadata
      this.repTimes.pop(); // Remove rep time
      return; // Don't assign samples to this rep
    }
    
    console.log(`📍 Rep ${this.repCount} boundaries: sample ${repStartIndex} to ${repEndIndex} (${sampleCount} samples, valley at ${endValley.time.toFixed(0)}ms)`);
    
    // Assign rep number to all samples in this range
    for (let i = repStartIndex; i <= repEndIndex; i++) {
      if (this.allSamples[i]) {
        this.allSamples[i].repNumber = this.repCount;
      }
    }
    
    // Update rep data with actual sample indices AND accurate start/end times
    repData.actualStartIndex = repStartIndex;
    repData.actualEndIndex = repEndIndex;
    
    // *** CRITICAL: Use the actual timestamps from the sample indices ***
    // This ensures the timestamps match the segmentation logic
    if (this.allSamples[repStartIndex]) {
      repData.actualStartTime = this.allSamples[repStartIndex].timestamp;
    }
    if (this.allSamples[repEndIndex]) {
      repData.actualEndTime = this.allSamples[repEndIndex].timestamp;
    }
    
    // *** Store this rep's end index for the next rep to continue from ***
    this.previousRepEndIndex = repEndIndex;
    this.previousRepEndValley = endValley;
  }
  
  /**
   * Extend the last rep's endpoint to include additional samples
   * Used for direction-specific modes to capture full cycle (e.g., bench press lowering phase)
   * @param {object} newEndPoint - The new endpoint { index, time, value }
   */
  extendLastRepToPoint(newEndPoint) {
    if (this.reps.length === 0) return;
    
    const lastRep = this.reps[this.reps.length - 1];
    const oldEndIndex = lastRep.actualEndIndex || lastRep.endIndex;
    
    // Find the new end sample index
    let newEndIndex = this.allSamples.length - 1;
    for (let i = oldEndIndex; i < this.allSamples.length; i++) {
      if (this.allSamples[i].timestamp >= newEndPoint.time) {
        newEndIndex = i;
        break;
      }
    }
    
    // Only extend if new index is actually further
    if (newEndIndex <= oldEndIndex) return;
    
    const extensionSamples = newEndIndex - oldEndIndex;
    console.log(`📍 Extending Rep ${lastRep.repNumber} from sample ${oldEndIndex} to ${newEndIndex} (+${extensionSamples} samples for return phase)`);
    
    // Update rep metadata
    lastRep.endIndex = newEndIndex;
    lastRep.actualEndIndex = newEndIndex;
    lastRep.endTime = newEndPoint.time;
    lastRep.actualEndTime = this.allSamples[newEndIndex]?.timestamp || newEndPoint.time;
    lastRep.duration = (lastRep.actualEndTime - lastRep.actualStartTime) / 1000;
    
    // Tag the extended samples with this rep number
    for (let i = oldEndIndex + 1; i <= newEndIndex; i++) {
      if (this.allSamples[i]) {
        this.allSamples[i].repNumber = lastRep.repNumber;
      }
    }
    
    // Update previous rep end tracking
    this.previousRepEndIndex = newEndIndex;
    this.lastRepEndTime = newEndPoint.time;
  }
  
  getAverageRepTime() {
    if (this.repTimes.length === 0) return 0;
    return this.repTimes.reduce((a, b) => a + b, 0) / this.repTimes.length;
  }
  
  getLastRepTime() {
    return this.repTimes.length > 0 ? this.repTimes[this.repTimes.length - 1] : 0;
  }
  
  getStats() {
    return {
      repCount: this.repCount,
      averageRepTime: this.getAverageRepTime(),
      avgRepDuration: this.getAverageRepTime(), // Alias for compatibility
      lastRepTime: this.getLastRepTime(),
      state: this.state,
      thresholdHigh: this.thresholdHigh,
      thresholdLow: this.thresholdLow,
      repHeight: this.repHeight,
      bufferSize: this.accelBuffer.length,
      windowSize: this.windowSamples
    };
  }
  
  reset() {
    this.repCount = 0;
    this.accelBuffer = [];
    this.timeBuffer = [];
    this.allSamples = [];
    this.reps = [];
    this.currentRep = null;
    this.lastRepEndTime = 0;
    this.repTimes = [];
    this.state = 'IDLE';
    this.lastPeakIndex = -1;
    this.lastValleyIndex = -1;
    this.lastDetectedValleyIndex = -1;
    this.lastDetectedPeakIndex = -1;
    this.previousRepEndValley = null;  // Reset previous rep end valley
    this.previousRepEndIndex = null;   // Reset previous rep end index
    this.pendingRep = null;            // Reset pending rep for direction-specific modes
    this.inRepPhase = false;
    this.repStartTime = 0;
  }
  
  /**
   * Finalize any pending reps that are waiting for their return phase.
   * This is called automatically by exportData() to ensure complete rep cycles.
   * For valley-to-peak exercises (squats, bench), this extends the last rep
   * to include all samples up to the current point (the lowering phase).
   */
  finalizePendingReps() {
    if (!this.pendingRep) return;
    
    // For pending reps waiting for their return phase, extend to current samples
    if (this.pendingRep.waitingFor === 'valley' || this.pendingRep.waitingFor === 'peak') {
      if (this.reps.length === 0) {
        this.pendingRep = null;
        return;
      }
      
      const lastRep = this.reps[this.reps.length - 1];
      const oldEndIndex = lastRep.actualEndIndex || lastRep.endIndex;
      const newEndIndex = this.allSamples.length - 1;
      
      // Only extend if we have more samples
      if (newEndIndex > oldEndIndex) {
        console.log(`📦 [RepCounter] Finalizing pending rep ${lastRep.repNumber}: extending from sample ${oldEndIndex} to ${newEndIndex} (+${newEndIndex - oldEndIndex} samples)`);
        
        // Update rep metadata
        lastRep.endIndex = newEndIndex;
        lastRep.actualEndIndex = newEndIndex;
        lastRep.actualEndTime = this.allSamples[newEndIndex]?.timestamp || lastRep.actualEndTime;
        lastRep.duration = (lastRep.actualEndTime - lastRep.actualStartTime) / 1000;
        
        // Tag the extended samples with this rep number
        for (let i = oldEndIndex + 1; i <= newEndIndex; i++) {
          if (this.allSamples[i]) {
            this.allSamples[i].repNumber = lastRep.repNumber;
          }
        }
        
        // Update tracking
        this.previousRepEndIndex = newEndIndex;
      }
    }
    
    this.pendingRep = null;
  }
  
  exportData() {
    // Finalize any pending reps before export to ensure complete cycles
    this.finalizePendingReps();
    
    return {
      samples: this.allSamples,
      reps: this.reps,
      stats: this.getStats()
    };
  }

  /**
   * Truncate internal state to a known checkpoint.
   * Used by SessionCheckpointManager for deterministic rollback after
   * a BLE disconnect/reconnect.
   *
   * @param {number} repCount     – Number of fully completed reps to keep.
   * @param {number} sampleIndex  – Number of samples to keep.
   */
  truncateTo(repCount, sampleIndex) {
    // 1. Truncate reps
    this.reps = this.reps.slice(0, repCount);
    this.repCount = repCount;

    // 2. Truncate sample buffer
    this.allSamples = this.allSamples.slice(0, sampleIndex);

    // 3. Rebuild accelBuffer/timeBuffer from remaining samples
    this.accelBuffer = this.allSamples.map(s => s.filteredMagnitude || s.accelMag || 0);
    this.timeBuffer = this.allSamples.map(s => s.relativeTime ?? s.timestamp ?? 0);

    // 4. Reset detection state so it can resume cleanly
    this.state = 'IDLE';
    this.currentRep = null;
    this.inRepPhase = false;
    this.lastPeakIndex = -1;
    this.lastValleyIndex = -1;
    this.lastDetectedValleyIndex = -1;
    this.lastDetectedPeakIndex = -1;
    this.pendingRep = null;  // Clear pending rep for direction-specific modes
    this.repStartTime = 0;

    // 5. Re-establish previous rep end references from last kept rep
    if (this.reps.length > 0) {
      const lastRep = this.reps[this.reps.length - 1];
      this.previousRepEndIndex = lastRep.actualEndIndex ?? sampleIndex - 1;
      this.lastRepEndTime = lastRep.actualEndTime ?? 0;
      this.repTimes = this.reps.map(r => r.duration);
    } else {
      this.previousRepEndValley = null;
      this.previousRepEndIndex = null;
      this.lastRepEndTime = 0;
      this.repTimes = [];
    }

    console.log(`[RepCounter] Truncated to repCount=${repCount}, samples=${sampleIndex}`);
  }
}
