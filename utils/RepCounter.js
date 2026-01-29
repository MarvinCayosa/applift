/**
 * RepCounter - Advanced rep detection using sliding window analysis
 * 
 * Features:
 * - Sliding window with configurable overlap for real-time detection
 * - Peak/valley detection with prominence-based filtering
 * - Dynamic threshold adaptation based on recent movement
 * - Rep segmentation with detailed metadata
 */
export class RepCounter {
  constructor(config = {}) {
    this.repCount = 0;
    
    // Sliding window parameters (optimized for fast response)
    this.windowDuration = config.windowDuration || 1.5; // 1.5 second window
    this.windowOverlap = config.windowOverlap || 0.8; // 80% overlap
    this.samplingRate = config.samplingRate || 20; // 20Hz
    this.windowSamples = Math.floor(this.windowDuration * this.samplingRate);
    this.stepSize = Math.floor(this.windowSamples * (1 - this.windowOverlap));
    
    // Data buffers
    this.accelBuffer = [];
    this.timeBuffer = [];
    this.allSamples = [];
    
    // Rep segmentation
    this.reps = [];
    this.currentRep = null;
    this.lastRepEndTime = 0;
    
    // Peak detection parameters - Made less sensitive to false positives
    this.minPeakProminence = config.minPeakProminence || 0.35; // Increased from 0.15 to 0.35
    this.minPeakDistance = config.minPeakDistance || 20; // Increased from 15 to 20 (1.0s at 20Hz)
    this.minRepDuration = config.minRepDuration || 0.8; // Increased from 0.0 to 0.8 seconds
    this.maxRepDuration = config.maxRepDuration || 8.0; // Decreased from 12.0 to 8.0 seconds
    
    // Dynamic threshold
    this.thresholdHigh = 10.5;
    this.thresholdLow = 9.5;
    this.repHeight = 0;
    
    // State tracking
    this.state = 'IDLE';
    this.lastPeakIndex = -1;
    this.lastValleyIndex = -1;
    this.lastDetectedValleyIndex = -1;
    this.lastDetectedPeakIndex = -1;
    this.inRepPhase = false;
    
    // Statistics
    this.repTimes = [];
    this.repStartTime = 0;
  }
  
  addSample(accelX, accelY, accelZ, gyroX, gyroY, gyroZ, roll, pitch, yaw, accelMag, timestamp) {
    // Store complete sample data
    const sample = {
      timestamp: timestamp,
      accelX, accelY, accelZ,
      gyroX, gyroY, gyroZ,
      roll, pitch, yaw,
      accelMag: accelMag,
      repNumber: Math.max(1, this.repCount + 1)
    };
    
    this.allSamples.push(sample);
    this.accelBuffer.push(accelMag);
    this.timeBuffer.push(timestamp);
    
    // Process window when we have enough samples
    if (this.accelBuffer.length >= this.windowSamples) {
      this.processWindow();
    }
  }
  
  processWindow() {
    // Get current window
    const window = this.accelBuffer.slice(-this.windowSamples);
    const windowTimes = this.timeBuffer.slice(-this.windowSamples);
    
    // Calculate statistics
    const max = Math.max(...window);
    const min = Math.min(...window);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const range = max - min;
    
    // Calculate standard deviation
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
    const stdDev = Math.sqrt(variance);
    
    // More conservative threshold approach to reduce false positives
    const rangeThreshold = Math.max(range * 0.30, 0.35); // Increased from 0.20 to 0.30 and 0.35
    const stdThreshold = Math.max(stdDev * 0.8, 0.35);   // Increased from 0.6 to 0.8 and 0.35
    const finalThreshold = Math.min(rangeThreshold, stdThreshold);
    
    // Update thresholds
    this.thresholdHigh = mean + finalThreshold;
    this.thresholdLow = mean - finalThreshold;
    this.repHeight = range;
    
    // Detect peaks and valleys
    this.detectRepsInWindow(window, windowTimes);
  }
  
  detectRepsInWindow(window, windowTimes) {
    const n = window.length;
    const currentGlobalIndex = this.accelBuffer.length - 1;
    
    // Find all peaks (local maxima) - More stringent peak detection
    const peaks = [];
    for (let i = 5; i < n - 5; i++) { // Increased from 3 to 5 for larger neighborhood
      let isPeak = true;
      const centerValue = window[i];
      
      // Check larger neighborhood for more robust peak detection
      for (let j = i - 5; j <= i + 5; j++) { // Increased from 3 to 5
        if (j !== i && window[j] >= centerValue) {
          isPeak = false;
          break;
        }
      }
      
      if (isPeak && centerValue > this.thresholdHigh) {
        const globalIndex = currentGlobalIndex - (n - 1 - i);
        
        if (this.lastPeakIndex === -1 || globalIndex - this.lastPeakIndex >= this.minPeakDistance) {
          peaks.push({
            index: globalIndex,
            value: centerValue,
            time: windowTimes[i]
          });
        }
      }
    }
    
    // Find all valleys (local minima) - More stringent valley detection
    const valleys = [];
    for (let i = 5; i < n - 5; i++) { // Increased from 3 to 5 for larger neighborhood
      let isValley = true;
      const centerValue = window[i];
      
      // Check larger neighborhood for more robust valley detection
      for (let j = i - 5; j <= i + 5; j++) { // Increased from 3 to 5
        if (j !== i && window[j] <= centerValue) {
          isValley = false;
          break;
        }
      }
      
      if (isValley && centerValue < this.thresholdLow) {
        const globalIndex = currentGlobalIndex - (n - 1 - i);
        
        if (this.lastValleyIndex === -1 || globalIndex - this.lastValleyIndex >= this.minPeakDistance) {
          valleys.push({
            index: globalIndex,
            value: centerValue,
            time: windowTimes[i]
          });
        } 
      }
    }
    
    // Detect rep completion: valley -> peak pattern
    if (valleys.length >= 1 && peaks.length >= 1) {
      const lastValley = valleys[valleys.length - 1];
      const lastPeak = peaks[peaks.length - 1];
      
      let isValidRep = false;
      let startPoint, endPoint, prominence, repDuration;
      
      // Case 1: Valley -> Peak (lifting up)
      if (lastValley.index < lastPeak.index) {
        if (lastPeak.index <= this.lastDetectedPeakIndex) {
          return;
        }
        
        startPoint = lastValley;
        endPoint = lastPeak;
        prominence = Math.abs(lastPeak.value - lastValley.value);
        repDuration = (lastPeak.time - lastValley.time) / 1000;
        isValidRep = true;
      }
      // Case 2: Peak -> Valley (lowering down)
      else if (lastPeak.index < lastValley.index) {
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
        // Enhanced validation to reduce false positives
        const timeSinceLastRep = (startPoint.time - this.lastRepEndTime) / 1000;
        const minTimeBetweenReps = 0.5; // Minimum 0.5 seconds between reps
        
        if (repDuration >= this.minRepDuration && 
            repDuration <= this.maxRepDuration && 
            prominence >= this.minPeakProminence &&
            timeSinceLastRep >= minTimeBetweenReps && // Additional time validation
            prominence > this.repHeight * 0.3) { // Prominence must be at least 30% of recent range
          
          this.completeRep(startPoint, lastPeak, endPoint);
          
          // Mark indices as used
          this.lastDetectedValleyIndex = lastValley.index;
          this.lastDetectedPeakIndex = lastPeak.index;
          this.lastValleyIndex = lastValley.index;
          this.lastPeakIndex = lastPeak.index;
          this.lastRepEndTime = endPoint.time;
        }
      }
    }
    
    // Track rep phase
    if (valleys.length > 0 && peaks.length === 0) {
      this.inRepPhase = true;
      this.state = 'STARTING';
    } else if (peaks.length > 0) {
      this.state = 'LIFTING';
    } else {
      this.inRepPhase = false;
      this.state = 'REST';
    }
  }
  
  completeRep(startValley, peak, endValley) {
    this.repCount++;
    const duration = (endValley.time - startValley.time) / 1000;
    
    console.log(`✅ REP #${this.repCount} | Duration: ${duration.toFixed(2)}s | Range: ${Math.abs(peak.value - startValley.value).toFixed(2)} m/s²`);
    
    // Store rep metadata
    this.reps.push({
      repNumber: this.repCount,
      startTime: startValley.time,
      endTime: endValley.time,
      duration: duration,
      peakAcceleration: peak.value, // Added for compatibility
      peakValue: peak.value,
      peakVelocity: peak.value / 2, // Estimated velocity
      valleyValue: startValley.value,
      range: Math.abs(peak.value - startValley.value)
    });
    
    this.repTimes.push(duration);
    
    // Update previous samples with rep number
    for (let i = this.allSamples.length - 1; i >= 0; i--) {
      const sample = this.allSamples[i];
      if (sample.repNumber === this.repCount) {
        sample.repNumber = this.repCount;
      } else {
        break;
      }
    }
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
