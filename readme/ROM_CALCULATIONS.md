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
- **Exercises**: Bench Press, Back Squats, Lateral Pulldown, Seated Leg Extension
- **Unit**: Centimeters (cm)
- **Method**: Gravity-axis projection (vertical only) + displacement integration
- **Vertical only**: Horizontal and diagonal acceleration components are ignored

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

**Vertical only**: Only the component of acceleration along the gravity axis is used. Horizontal and diagonal accelerations are completely ignored. This is achieved by projecting raw acceleration onto the gravity unit vector (established during calibration), rather than using quaternion rotation to world frame.

#### Algorithm Steps:

```javascript
// 1. Gravity-axis projection (vertical only)
// At rest, first 10 accel samples are averaged → gravity unit vector
// Single-sample init had ~1° angle error → horizontal accel leakage ~12cm/rep
// 10-sample averaging reduces error to ~0.35° → leakage ~4cm/rep
gravityUnitVec = normalize(average(first10Samples))
// Each sample: project raw accel onto gravity axis, ignore horizontal/diagonal
verticalAccel = dot(rawAccel, gravityUnitVec) - gravityMagnitude

// 2. Cascaded EMA smoothing (2-stage, ~12dB/octave noise rolloff)
// Single-stage at 0.25 was too weak → noise quadratically amplified by double integration
stage1 = 0.4 * prevStage1 + 0.6 * rawAccel
smoothedAccel = 0.4 * prevSmoothed + 0.6 * stage1

// 3. Noise floor dead-zone (0.15 m/s² — raised from 0.06)
// MEMS accelerometers have ~0.07-0.3 m/s² RMS noise at 20-50Hz sampling
accelInput = |smoothedAccel| < 0.15 ? 0 : smoothedAccel

// 4. Combined accel + gyro ZUPT (Zero-Velocity Update)
accelDeviation = |accelMagnitude - gravityMag|
gyroMagnitude = sqrt(gx² + gy² + gz²)
isStill = (accelDeviation < 0.20) AND (gyroMag < 0.08 rad/s) for 3+ samples

// 5. Trapezoidal integration
velocity += accelInput * dt  // clamped to ±1.5 m/s
displacement += (oldVelocity + newVelocity) / 2 * dt  // clamped to ±1.0 m

// 6. ROM = peak-to-trough displacement, clamped to exercise-specific max
repROM = min(maxDisplacement - minDisplacement, EXERCISE_MAX_ROM)
```

#### Recent Improvements (Mar 2026 — Consistency Fix):

| Aspect | Before | After | Benefit |
|--------|--------|-------|--------|
| **Gravity Init** | Single noisy sample | Averaged first 10 samples | ~3x less angular error → consistent readings |
| **Gravity Persistence** | Reset each set | Preserved across sets | Eliminates set-to-set variation |
| **Filtering** | Single EMA (0.25 prev) | Cascaded 2-stage EMA (0.4 prev) | ~12dB/octave noise rejection |
| **Noise Floor** | 0.06 m/s² | 0.15 m/s² | Rejects MEMS sensor noise properly |
| **ZUPT Threshold** | accel 0.12, gyro 0.06 | accel 0.20, gyro 0.08 | Better rest detection during exercise |
| **ZUPT Trigger** | 2 consecutive samples | 3 consecutive samples | Fewer false triggers during motion |
| **Velocity Clamp** | 2.0 m/s | 1.5 m/s | Realistic for exercise bar speeds |
| **Displacement Clamp** | 2.0 m (200 cm) | 1.0 m (100 cm) | No exercise exceeds 100 cm ROM |
| **ROM Clamp** | 200 cm flat | Exercise-specific (60-100 cm) | Bench 80, Squat 100, Pulldown 80, LegExt 60 |
| **RetroCorrect Smoothing** | Single-pass 3-point | Two-pass 3-point (–12dB/oct) | Better noise rejection for final ROM |
| **Exercise Matching** | Substring includes | Word-based matching | Fixes "Flat Bench Barbell Press" → code 2 |

---

## Calibration Process

### Baseline Calibration (Per Set)
- **Trigger**: Start of each new set
- **Purpose**: Reset integration state (velocity/displacement) for clean tracking
- **Method**: `romComputer.calibrateBaseline()` zeroes displacement state
- **Important**: Gravity vector is PRESERVED across sets (physical constant of sensor orientation)
- **Why**: Resetting gravity forced re-initialization from a single noisy sample, causing
  wildly inconsistent ROM (20-100+cm for a 46cm bench press)

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
  2: 'stroke',  // Bench Press (barbell) — vertical bar path
  3: 'stroke',  // Back Squats (barbell) — vertical bar path
  4: 'stroke',  // Lateral Pulldown (weight stack) — vertical stack motion
  5: 'stroke',  // Seated Leg Extension (weight stack) — vertical stack motion
};
```

---

## Performance Characteristics

### Accuracy
- **Angle ROM**: Direct quaternion measurement, no drift
- **Stroke ROM**: ±5cm accuracy for 20-100cm movements (with averaged gravity init)
- **Sensitivity**: Detects movements as small as 5cm (stroke) or 5° (angle)
- **Consistency**: With gravity averaging + preservation, consecutive reps typically within ±10% of each other

### Physical Limits (Exercise-Specific ROM Clamps)
| Exercise | Max ROM | Rationale |
|----------|---------|-----------|
| Bench Press | 80 cm | Chest to lockout ≈40-60cm |
| Back Squats | 100 cm | Full depth ≈50-80cm |
| Lateral Pulldown | 80 cm | Full pull ≈50-70cm |
| Seated Leg Extension | 60 cm | Full extension ≈30-50cm |
| All angle exercises | 180° | Single-joint physical maximum |

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
**Cause**: Gravity vector noise (single-sample init) or sensor drift
**Fix** (v2.2): 
1. Gravity now averaged from first 10 samples (was single sample → ~1° error)
2. Gravity vector preserved across sets (not reset per set anymore)
3. Cascaded 2-stage EMA filter rejects integration noise
4. Exercise-specific ROM clamps reject impossible values
5. If still inconsistent: recalibrate (CalibrationModal averages 60+ samples)

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
- **Vertical-only measurement**: Stroke ROM measures only vertical displacement — exercises with significant horizontal motion components (e.g., cable flyes) are not supported for stroke ROM
- **Calibration requirement**: Each exercise needs initial calibration setup

---

*Last updated: March 2, 2026*
*Algorithm version: v2.2 (Gravity averaging + cascaded EMA + exercise ROM clamps)*