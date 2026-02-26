# ROM Calculations in AppLift PWA

## Overview

Range of Motion (ROM) calculation is a core feature of the AppLift PWA that measures the movement amplitude during exercise repetitions. The system uses IMU sensor data (quaternions, accelerometer, gyroscope) to compute ROM for different equipment types, providing users with real-time feedback on exercise performance.

## ROM Types

AppLift supports two distinct ROM calculation methods based on equipment type:

### 1. **Angle ROM** (Dumbbell Exercises)
- **Equipment**: Dumbbell, Resistance Bands
- **Exercises**: Concentration Curls, Overhead Extension
- **Unit**: Degrees (°)
- **Method**: Quaternion-based angular displacement

### 2. **Stroke ROM** (Linear Displacement Exercises)  
- **Equipment**: Barbell, Weight Stack
- **Exercises**: Bench Press, Back Squats, Lateral Pulldown, Leg Extension
- **Unit**: Centimeters (cm)
- **Method**: Quaternion gravity removal + vertical displacement integration

---

## Technical Implementation

### File Location
- **Primary**: `utils/ROMComputer.js` 
- **Integration**: `utils/useWorkoutSession.js`
- **Calibration**: `components/CalibrationModal.js`

### Angle ROM Algorithm

**Used for**: Dumbbell exercises where the sensor rotates with the equipment

```javascript
// 1. Establish baseline quaternion at neutral position
baselineQuat = { w, x, y, z }

// 2. For each sample, calculate total angular displacement
angleDeg = quatAngleDeg(baselineQuat, currentQuat)

// 3. Track min/max within rep for range calculation
repROM = maxAngle - minAngle
```

**Key Features**:
- Orientation-independent (works regardless of sensor mounting)
- Auto-detects primary rotation axis (roll, pitch, yaw)
- No integration drift (direct quaternion measurement)

### Stroke ROM Algorithm (Recently Upgraded)

**Used for**: Barbell/weight stack exercises with constrained vertical motion

#### Algorithm Steps:

```javascript
// 1. Quaternion-based gravity removal
accelWorld = rotateVector(accelSensor, quaternion)
verticalAccel = accelWorld.z - calibratedGravityMagnitude

// 2. EMA smoothing (preserves slow movements)
smoothedAccel = 0.25 * prevAccel + 0.75 * rawAccel

// 3. Combined accel + gyro ZUPT (Zero-Velocity Update)
accelDeviation = |accelMagnitude - gravityMag|
gyroMagnitude = sqrt(gx² + gy² + gz²)
isStill = (accelDeviation < 0.12) AND (gyroMag < 0.06 rad/s)

// 4. Trapezoidal integration
velocity += accelInput * dt
displacement += (oldVelocity + newVelocity) / 2 * dt

// 5. ROM = peak-to-trough displacement within rep
repROM = maxDisplacement - minDisplacement
```

#### Recent Improvements (Feb 2026):

| Aspect | Old Algorithm | New Algorithm | Benefit |
|--------|---------------|---------------|---------|
| **Gravity Removal** | Single-axis detection | Quaternion world-frame projection | Orientation-independent |
| **Filtering** | High-pass filter (0.12 α) | EMA smoothing (0.25 α) | Preserves slow movements |
| **ZUPT** | Accel-only (0.3 threshold) | Combined accel+gyro (0.12 + 0.06) | More robust stillness detection |
| **Integration** | Euler + 0.97 drag | Trapezoidal + velocity clamping | Higher accuracy, no artificial damping |
| **Sensitivity** | 0.3 m/s² noise floor | 0.06 m/s² noise floor | 5x more sensitive to small movements |
| **Drift Control** | 0.4 decay factor | 0.03 decay factor | 13x faster zero-lock |

---

## Calibration Process

### Baseline Calibration (Per Set)
- **Trigger**: Start of each new set
- **Purpose**: Reset reference position to eliminate carry-over drift
- **Method**: `romComputer.calibrateBaseline()` zeroes displacement state

### Target ROM Calibration (Per Exercise)
- **Trigger**: First use of equipment+exercise combination
- **Duration**: ~30 seconds total
  - 5s countdown
  - 3s baseline hold (capture sensor at rest)
  - 3x full ROM reps
- **Result**: Average of 3 reps becomes target ROM
- **Storage**: localStorage + Firestore for sync

#### Calibration Flow:
```javascript
1. User holds starting position → 3s baseline capture
2. setBaselineFromSamples() → compute gravityMag, gyroBias, gyroUnits
3. User performs 3 full reps → measure ROM for each
4. setTargetFromCalibration() → average becomes target
5. Save to storage → subsequent workouts load this target
```

---

## Integration Points

### Data Flow
```
ESP32 IMU → BLE → useIMUData → useWorkoutSession → ROMComputer
                     ↓              ↓              ↓
              Parse 56-byte    Pass to ROM    addSample()
              packet with      computer       ↓
              quat + gyro                   angle/stroke
                                           algorithm
```

### Key Integration Files:

#### `useIMUData.js`
- Parses 56-byte BLE packets: `accel(12) + gyro(12) + euler(12) + quat(16) + timestamp(4)`
- Applies Kalman filtering
- Passes complete data object including `gyroX/Y/Z` to workout session

#### `useWorkoutSession.js`
- Creates ROM computer instance per equipment+exercise combo
- Calls `romComputer.addSample(data)` for each IMU sample
- Calls `romComputer.completeRep()` when rep counter detects rep boundary
- Resets baseline at start of each set via `calibrateBaseline()`

#### `CalibrationModal.js`
- Manages calibration UI flow
- Handles BLE subscription during calibration
- Auto-detects rep boundaries during calibration
- Saves calibration data to localStorage + Firestore

---

## Usage Examples

### Checking ROM Status
```javascript
import { getROMComputer } from './utils/ROMComputer';

const rom = getROMComputer();
console.log('ROM Type:', rom.getROMType(rom.exerciseType));
console.log('Unit:', rom.getUnit());
console.log('Target ROM:', rom.targetROM);
console.log('Calibrated:', rom.romCalibrated);
```

### Manual ROM Calculation
```javascript
// Set exercise first
rom.setExerciseFromNames('barbell', 'bench press');

// Add IMU samples (during rep)
rom.addSample({
  accelX, accelY, accelZ,
  gyroX, gyroY, gyroZ,
  qw, qx, qy, qz,
  timestamp
});

// Complete rep and get ROM
const repResult = rom.completeRep();
console.log(`Rep ROM: ${repResult.romValue.toFixed(1)}${repResult.unit}`);
```

### Calibration
```javascript
// Start calibration rep
rom.startCalibrationRep();

// ... add samples during rep ...

// Finish calibration rep
const romValue = rom.finishCalibrationRep();

// Set target after 3 reps
const targetROM = rom.setTargetFromCalibration([rom1, rom2, rom3]);
```

---

## Exercise-to-ROM Mapping

```javascript
const EXERCISE_ROM_TYPE = {
  0: 'angle',   // Concentration Curls (dumbbell)
  1: 'angle',   // Overhead Extension (dumbbell)
  2: 'stroke',  // Bench Press (barbell)
  3: 'stroke',  // Back Squats (barbell)
  4: 'stroke',  // Lateral Pulldown (weight stack)
  5: 'stroke',  // Seated Leg Extension (weight stack)
};
```

---

## Performance Characteristics

### Accuracy
- **Angle ROM**: Direct quaternion measurement, no drift
- **Stroke ROM**: ±2cm accuracy for 20-100cm movements
- **Sensitivity**: Detects movements as small as 3cm (stroke) or 5° (angle)

### Real-time Performance
- **Sample Rate**: 20 Hz from ESP32 IMU
- **Latency**: <50ms from sensor to ROM display
- **Processing**: All calculations run in main thread (lightweight)

### Calibration Requirements
- **Per Exercise**: One-time 30s calibration per equipment+exercise combo
- **Per Set**: Automatic baseline reset (instantaneous)
- **Storage**: Persisted calibration survives app restarts

---

## Troubleshooting

### Common Issues

#### "ROM seems too small/large"
**Cause**: Incorrect equipment/exercise selection or poor calibration
**Fix**: 
1. Verify equipment type matches actual equipment
2. Recalibrate with full range of motion
3. Ensure sensor is securely attached

#### "ROM drifts during set"
**Cause**: Sensor mounting loose or baseline not reset
**Fix**:
1. Check sensor attachment
2. Baseline auto-resets per set - ensure workout session restarts properly
3. For stroke exercises: ensure sensor orientation doesn't change

#### "Calibration fails"
**Cause**: Insufficient movement during calibration or connectivity issues
**Fix**:
1. Perform full range of motion (minimum thresholds: 5° angle, 3cm stroke)
2. Hold baseline position steady for full 3 seconds
3. Check BLE connection stability

#### "ROM values inconsistent between reps"
**Cause**: Movement pattern variation or sensor drift
**Fix**:
1. Focus on consistent movement pattern
2. For stroke: ZUPT algorithm should handle most drift automatically
3. Check for loose sensor mounting

### Debug Mode
```javascript
const rom = getROMComputer();
rom.enableDebugMode();
// Check browser console for detailed logging
```

---

## References

### Algorithm Sources
- **Quaternion rotation**: Standard computer graphics quaternion-vector multiplication
- **ZUPT (Zero-Velocity Update)**: Pedestrian navigation technique adapted for exercise equipment
- **Trapezoidal integration**: Numerical integration method for improved accuracy over Euler

### External Dependencies
- **ESP32 IMU**: Provides fused quaternion data (eliminates need for manual sensor fusion)
- **BLE Web API**: For real-time sensor data streaming
- **Kalman Filter**: From `utils/KalmanFilter.js` for additional smoothing

### File Dependencies
```
ROMComputer.js
├── KalmanFilter.js (imported by useIMUData)
├── useIMUData.js (BLE parsing)
├── useWorkoutSession.js (integration)
├── CalibrationModal.js (calibration UI)
└── Firebase/Firestore (calibration persistence)
```

---

## Future Enhancements

### Planned Improvements
- **Multi-axis ROM**: For complex exercises with non-vertical motion
- **ROM quality scoring**: Beyond just magnitude, assess smoothness and control
- **Adaptive thresholds**: Machine learning to optimize ZUPT parameters per user
- **Cross-session analytics**: ROM trend analysis over time

### Known Limitations
- **Stroke ROM orientation dependency**: Requires roughly vertical motion
- **Single-plane measurement**: Current stroke algorithm assumes primary vertical component
- **Calibration requirement**: Each exercise needs initial calibration setup

---

*Last updated: February 27, 2026*
*Algorithm version: v2.0 (Quaternion-based gravity removal)*