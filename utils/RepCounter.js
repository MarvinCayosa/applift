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
 */
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
    
    // Peak detection for slow movements (VERY sensitive)
    this.minPeakProminence = config.minPeakProminence || 0.15; // For m/s² units
    this.minPeakDistance = config.minPeakDistance || 15; // Minimum 0.75s between peaks (20Hz * 0.75)
    this.minRepDuration = config.minRepDuration || 0.5; // Minimum 0.5 seconds - filter false detections during rest
    this.maxRepDuration = config.maxRepDuration || 8.0; // Maximum 8 seconds per rep (controlled reps)
    this.adaptiveThreshold = true; // Use adaptive thresholding
    
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
    
    // Statistics
    this.repTimes = [];
    this.repStartTime = 0;
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
    
    // Find all peaks (local maxima) - 3-sample window for stable detection
    const peaks = [];
    for (let i = 3; i < n - 3; i++) {
      let isPeak = true;
      const centerValue = window[i];
      
      // Check if it's higher than neighbors (3-sample window = stable detection)
      for (let j = i - 3; j <= i + 3; j++) {
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
    
    // Find all valleys (local minima) - 3-sample window for stable detection
    const valleys = [];
    for (let i = 3; i < n - 3; i++) {
      let isValley = true;
      const centerValue = window[i];
      
      // Check if it's lower than neighbors (3-sample window = stable detection)
      for (let j = i - 3; j <= i + 3; j++) {
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
    
    // Detect rep completion: valley -> peak pattern (1 rep = one cycle)
    // Simple: just need one valley and one peak to count as a rep
    if (valleys.length >= 1 && peaks.length >= 1) {
      const lastValley = valleys[valleys.length - 1];
      const lastPeak = peaks[peaks.length - 1];
      
      // Determine which came first to decide the direction
      let isValidRep = false;
      let startPoint, endPoint, prominence, repDuration;
      
      // Case 1: Valley -> Peak (lifting up from bottom)
      if (lastValley.index < lastPeak.index) {
        // Skip if we've already counted this peak
        if (lastPeak.index <= this.lastDetectedPeakIndex) {
          return;
        }
        
        startPoint = lastValley;
        endPoint = lastPeak;
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
        prominence = Math.abs(lastPeak.value - lastValley.value);
        repDuration = (lastValley.time - lastPeak.time) / 1000;
        isValidRep = true;
      }
      
      if (isValidRep) {
        // Log detection attempt for debugging
        console.log(`🔍 Rep candidate: duration=${repDuration.toFixed(2)}s, prominence=${prominence.toFixed(3)} m/s²`);
        
        // Very relaxed validation - catch almost all movements
        if (repDuration >= this.minRepDuration && 
            repDuration <= this.maxRepDuration && 
            prominence >= this.minPeakProminence) {
          
          // Count the rep
          this.completeRep(startPoint, lastPeak, endPoint);
          
          // Mark these indices as used
          this.lastDetectedValleyIndex = lastValley.index;
          this.lastDetectedPeakIndex = lastPeak.index;
          this.lastValleyIndex = lastValley.index;
          this.lastPeakIndex = lastPeak.index;
          this.lastRepEndTime = endPoint.time;
        } else {
          console.log(`❌ Failed validation: duration=${repDuration >= this.minRepDuration && repDuration <= this.maxRepDuration}, prominence=${prominence >= this.minPeakProminence} (need ${this.minPeakProminence})`);
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
    this.inRepPhase = false;
    this.repStartTime = 0;
  }
  
  exportData() {
    return {
      samples: this.allSamples,
      reps: this.reps,
      stats: this.getStats()
    };
  }
}
