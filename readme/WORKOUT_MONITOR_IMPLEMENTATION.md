# Workout Monitor Integration - Implementation Summary

## Overview
Successfully integrated the IMU-based workout monitoring features from test.html into the main AppLift PWA application as a dedicated workout monitor page.

## Files Created

### 1. **utils/RepCounter.js**
- Advanced rep counting algorithm using sliding window analysis
- Peak/valley detection with prominence-based filtering
- Dynamic threshold adaptation based on recent movement patterns
- Configurable parameters (window duration, overlap, peak distance, etc.)
- Rep segmentation with detailed metadata (start time, end time, duration, range)
- Data export functionality for CSV generation

### 2. **utils/KalmanFilter.js**
- 1D Kalman filter implementation for sensor data smoothing
- Reduces noise in accelerometer/gyroscope readings
- Maintains responsiveness to actual motion changes
- Configurable noise parameters

### 3. **utils/useIMUData.js**
- Custom React hook for handling BLE GATT notifications
- Parses IMU data packets (40 bytes) from the connected device
- Applies Kalman filtering to accelerometer data in real-time
- Handles both IMU data and NFC equipment detection
- Automatic subscription/cleanup management
- Uses existing BluetoothProvider context

### 4. **components/workoutMonitor/AccelerationChart.js**
- Real-time acceleration visualization using Chart.js
- Displays raw and filtered acceleration magnitude
- Shows dynamic thresholds (high/low) for rep detection
- Optimized for performance with animation disabled
- Dark theme matching app visual style
- Responsive design

### 5. **components/workoutMonitor/StatCard.js**
- Reusable component for displaying single statistics
- Clean, consistent styling matching app theme

### 6. **components/workoutMonitor/SensorDataCard.js**
- Reusable component for displaying sensor data groups
- Color-coded values (X: blue, Y: green, Z: purple, Mag: yellow)

### 7. **pages/workout-monitor.js** (Main Page)
- Full workout monitoring interface
- Real-time rep counting with visual notifications
- IMU data visualization (acceleration chart)
- Comprehensive statistics display:
  - Rep count and state
  - Raw and filtered accelerometer data
  - Gyroscope data
  - Orientation (roll, pitch, yaw)
  - Rep detection metrics
  - Dynamic thresholds
  - Connection status
  - NFC equipment detection
- Recording controls:
  - Start with 3-2-1 countdown
  - Pause/Resume functionality
  - Stop and save with CSV export
  - Reset rep counter
- Data export to CSV with proper formatting
- Responsive grid layout

## Key Features Implemented

### Rep Counting Algorithm
- **Sliding Window Analysis**: 1.5-second windows with 80% overlap for fast response
- **Peak/Valley Detection**: 3-sample window for stable detection
- **Dynamic Thresholds**: Auto-adjusts based on movement range and standard deviation
- **Minimum Peak Prominence**: 0.15 m/s² to filter out noise
- **Minimum Peak Distance**: 15 samples (0.75s at 20Hz) to prevent duplicate detections
- **Bi-directional Detection**: Counts reps for both valley→peak and peak→valley patterns

### Data Processing
- **Kalman Filtering**: Smooths sensor data while preserving motion characteristics
- **Real-time Processing**: Processes data as it arrives from BLE notifications
- **Buffering**: Maintains last 100 chart points (5 seconds at 20Hz)
- **Sample Tracking**: Counts samples and calculates data rate (Hz)

### User Experience
- **3-2-1 Countdown**: Visual countdown before recording starts
- **Rep Notifications**: Animated popup when rep is detected
- **NFC Integration**: Displays equipment detected via NFC scan
- **Pause/Resume**: Ability to pause recording without losing data
- **CSV Export**: Downloads complete workout data with rep labeling
- **Visual Feedback**: Color-coded states and real-time updates

### Visual Design
- Matches main app's dark theme with purple/pink gradients
- Responsive grid layout adapts to different screen sizes
- Clean, minimalist cards with subtle borders and backgrounds
- Color-coded sensor data for easy reading
- Hero rep count card with gradient background

## Integration with Existing Code

### Uses Existing Infrastructure
- **BluetoothProvider**: Leverages existing BLE connection management
- **BLE Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b` (AppLift IMU)
- **IMU Characteristic**: `beb5483e-36e1-4688-b7f5-ea07361b26a8`
- **NFC Characteristic**: `ceb5483e-36e1-4688-b7f5-ea07361b26a8`
- **Visual Style**: Consistent with globals.css theme
- **Navigation**: Integrated with Next.js router

### Data Format
Parses 40-byte IMU data packets:
```javascript
{
  accelX: Float32 (0-3)    // m/s²
  accelY: Float32 (4-7)    // m/s²
  accelZ: Float32 (8-11)   // m/s²
  gyroX: Float32 (12-15)   // rad/s
  gyroY: Float32 (16-19)   // rad/s
  gyroZ: Float32 (20-23)   // rad/s
  roll: Float32 (24-27)    // degrees
  pitch: Float32 (28-31)   // degrees
  yaw: Float32 (32-35)     // degrees
  timestamp: Uint32 (36-39) // milliseconds
}
```

## Updated Files

### pages/selectedWorkout.js
- Modified "Let's Workout" button to navigate to `/workout-monitor`
- Passes `equipment` and `workout` query parameters for context

## Dependencies
- **Chart.js**: ^4.5.1 (already installed)
- **Next.js**: 14.2.33 (already installed)
- **React**: ^18 (already installed)

## Usage

1. **Connect Device**: User connects to IMU device via BLE
2. **Select Workout**: User navigates to selected workout page
3. **Start Monitor**: User clicks "Let's Workout" button
4. **Begin Recording**: User clicks "Start Workout" → sees countdown
5. **Perform Reps**: System automatically counts reps in real-time
6. **Monitor Data**: User sees live acceleration chart and sensor data
7. **Stop & Export**: User clicks "Stop & Save" → downloads CSV with all data

## CSV Export Format
- Rep number (which rep each sample belongs to)
- Timestamp (formatted as seconds.milliseconds)
- All raw sensor values (accel, gyro, orientation)
- Filtered values
- Filename: `applift_{workout}_{timestamp}.csv`

## Performance Optimizations
- Chart animations disabled for smooth 20Hz updates
- Circular buffer limits chart data to 100 points
- Efficient sliding window implementation
- Minimal re-renders using useCallback and useRef
- Lazy-loaded Chart.js component

## Code Quality
- Clean, modular architecture
- Reusable components and utilities
- Comprehensive comments
- TypeScript-ready (can add types easily)
- Follows React best practices
- Proper cleanup of BLE subscriptions

## Testing Recommendations
1. Test with actual IMU device connected
2. Verify rep counting accuracy with slow and fast reps
3. Test pause/resume functionality
4. Validate CSV export format
5. Check NFC equipment detection
6. Test on different screen sizes
7. Verify BLE disconnection handling

## Future Enhancements (Optional)
- Add set tracking (multiple sets per workout)
- Rest timer between sets
- Audio/haptic feedback for rep completion
- Historical workout data storage
- Workout summary screen
- Form analysis using orientation data
- Workout templates and programs
- Social sharing of workout data
