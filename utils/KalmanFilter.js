/**
 * KalmanFilter - 1D Kalman filter for sensor data smoothing
 * 
 * Reduces noise in accelerometer/gyroscope readings while maintaining
 * responsiveness to actual changes in motion.
 */
export class KalmanFilter {
  constructor(processNoise = 0.01, measurementNoise = 0.5, estimationError = 1, initialValue = 0) {
    this.processNoise = processNoise;          // Q - Process noise covariance
    this.measurementNoise = measurementNoise;  // R - Measurement noise covariance
    this.estimationError = estimationError;    // P - Estimation error covariance
    this.value = initialValue;                 // X - Estimated value
  }
  
  update(measurement) {
    // Prediction update
    this.estimationError += this.processNoise;
    
    // Measurement update
    const kalmanGain = this.estimationError / (this.estimationError + this.measurementNoise);
    this.value += kalmanGain * (measurement - this.value);
    this.estimationError = (1 - kalmanGain) * this.estimationError;
    
    return this.value;
  }
  
  reset(initialValue = 0) {
    this.value = initialValue;
    this.estimationError = 1;
  }
}
