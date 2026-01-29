# Workout Monitor - Quick Reference

## Page Flow
```
Dashboard → Workouts → Selected Workout → [Let's Workout] → Workout Monitor
```

## Workout Monitor Layout

### Header Section
- Back button (top-left)
- Workout name and equipment (center)

### Hero Rep Count Card
- Large purple gradient card
- Shows current rep count (big number)
- Displays rep state (LIFTING, STARTING, REST)

### Control Buttons
- **Start Workout**: Green button - begins recording with countdown
- **Pause/Resume**: Yellow button - pauses data collection
- **Stop & Save**: Red button - stops and prompts for CSV export
- **Reset**: Gray button - resets rep counter

### Real-time Chart
- Line chart showing acceleration over time
- Raw (red) and filtered (blue) acceleration
- Dynamic threshold lines (green/orange dashed)
- Last 5 seconds of data (100 points)

### Stats Grid (9 cards)
1. **Accelerometer (Raw)**: X, Y, Z, Magnitude in m/s²
2. **Accelerometer (Filtered)**: Kalman-filtered X, Y, Z, Magnitude
3. **Gyroscope**: X, Y, Z in rad/s
4. **Orientation**: Roll, Pitch, Yaw in degrees
5. **Rep Detection**: State, Buffer size, Range
6. **Thresholds**: High, Low, Range values
7. **Statistics**: Average rep time, Last rep time, Sample count
8. **Connection**: Status, IMU active, Data rate (Hz)
9. **NFC Equipment**: Current equipment, Last scan time

## Color Coding

### Sensor Data
- **X axis**: Blue
- **Y axis**: Green
- **Z axis**: Purple
- **Magnitude**: Yellow

### Rep States
- **LIFTING**: Green badge (active movement)
- **STARTING**: Yellow badge (at bottom position)
- **REST**: Gray badge (idle)
- **IDLE**: Gray badge (not recording)

### Connection Status
- **Connected + Active**: Green text
- **Disconnected**: Red text
- **Inactive**: Yellow text

## Recording Workflow

### 1. Before Recording
- Ensure device is connected (check Connection card)
- Device should show "Connected" and "Active"
- Rep count should show 0

### 2. Start Recording
1. Click "Start Workout"
2. See countdown: 3... 2... 1... GO!
3. Recording begins automatically
4. Start performing reps

### 3. During Recording
- Watch rep count increase automatically
- See real-time chart update
- Monitor acceleration thresholds adjust dynamically
- Rep notification appears briefly on each detected rep

### 4. Pause (Optional)
- Click "Pause" to temporarily stop data collection
- Chart freezes, rep detection pauses
- Click "Resume" to continue

### 5. Stop Recording
1. Click "Stop & Save"
2. Confirm CSV download prompt
3. File downloads with format: `applift_{workout}_{timestamp}.csv`

### 6. Reset
- Click "Reset" to clear rep count and start fresh
- Does NOT stop recording

## CSV Export Structure

### Columns
- `rep`: Rep number (1, 2, 3...)
- `timestamp`: Formatted as SS.mmm (seconds.milliseconds)
- `timestamp_ms`: Raw milliseconds
- `accelX, accelY, accelZ`: Raw acceleration (m/s²)
- `accelMag`: Raw magnitude
- `gyroX, gyroY, gyroZ`: Angular velocity (rad/s)
- `roll, pitch, yaw`: Orientation (degrees)
- `filteredX, filteredY, filteredZ`: Kalman-filtered acceleration
- `filteredMag`: Filtered magnitude

### Data Organization
- All samples are labeled with their rep number
- Rep 1 starts from first sample
- Easy to filter by rep for analysis
- Timestamp starts at 0 when recording begins

## Rep Detection Algorithm

### How It Works
1. **Sliding Window**: Analyzes last 1.5 seconds of data
2. **Peak Detection**: Finds local maxima above high threshold
3. **Valley Detection**: Finds local minima below low threshold
4. **Pattern Matching**: Looks for valley→peak OR peak→valley
5. **Validation**: Checks duration (0-12s) and prominence (>0.15 m/s²)
6. **Count**: Increments rep counter when valid pattern found

### Thresholds
- **Dynamic**: Automatically adjust based on movement
- **High Threshold**: Mean + calculated offset (for peaks)
- **Low Threshold**: Mean - calculated offset (for valleys)
- **Updates**: Every window (near real-time)

### Sensitivity
- **Window Size**: 1.5 seconds (fast response)
- **Overlap**: 80% (processes almost every sample)
- **Min Prominence**: 0.15 m/s² (filters noise)
- **Min Distance**: 0.75s between peaks (prevents duplicates)

## Troubleshooting

### No Rep Detection
- Check if device is connected (Connection card)
- Verify IMU shows "Active"
- Ensure you're moving enough (check chart for variation)
- Try resetting and starting fresh

### Too Many/Few Reps
- Algorithm is optimized for controlled movements
- Very fast reps may be missed (< 0.75s)
- Very small movements may not trigger (< 0.15 m/s² change)
- Adjust your movement amplitude if needed

### Connection Lost
- Red banner appears at top
- Recording stops automatically
- Reconnect device and start new recording

### Chart Not Updating
- Check if recording is started
- Check if not paused
- Verify data rate > 0 in Connection card

## Best Practices

### For Accurate Counting
1. Perform controlled, deliberate reps
2. Keep consistent movement pattern
3. Complete full range of motion
4. Wait 1-2 seconds before first rep (let thresholds calibize)
5. Maintain steady tempo (not too fast)

### For Data Quality
1. Secure IMU device properly
2. Minimize device vibration
3. Keep device orientation consistent
4. Avoid sudden jerks or drops
5. Ensure good Bluetooth connection (stay nearby)

### For Analysis
1. Export CSV after each set
2. Include multiple sets for comparison
3. Label files clearly (workout name is auto-included)
4. Use spreadsheet software to analyze trends
5. Compare rep durations for consistency

## Technical Notes

### Data Rate
- **Expected**: ~20 Hz (20 samples per second)
- **Display**: Updates every second in Connection card
- **Chart**: Shows last 100 points (5 seconds)

### Kalman Filter
- **Purpose**: Smooths noisy sensor data
- **Settings**: Optimized for human movement (process noise: 0.01, measurement noise: 0.5)
- **Effect**: Blue line (filtered) is smoother than red line (raw)

### Timestamps
- **Relative**: Start at 0 when recording begins
- **Format**: Milliseconds from start
- **Display**: Formatted as seconds.milliseconds
- **Source**: From IMU device, not phone clock
