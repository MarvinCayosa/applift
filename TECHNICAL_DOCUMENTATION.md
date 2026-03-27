# AppLift PWA - Technical Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Algorithms](#core-algorithms)
4. [Data Flow](#data-flow)
5. [Key Features](#key-features)
6. [Technical Implementation](#technical-implementation)

---

## System Overview

AppLift is a Progressive Web App (PWA) that provides real-time workout tracking and analysis using Bluetooth-enabled IMU (Inertial Measurement Unit) sensors. The system captures motion data during exercises, processes it in real-time to count reps, analyzes movement quality, and provides AI-powered insights.

### Technology Stack
- **Frontend**: Next.js (React), TailwindCSS
- **Backend**: Next.js API Routes (Serverless)
- **Database**: Firebase Firestore
- **Storage**: Google Cloud Storage (GCS)
- **ML/AI**: Google Gemini API, Custom ML Models
- **Real-time Data**: Web Bluetooth API
- **Authentication**: Firebase Auth

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (PWA)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Bluetooth  │  │  Rep Counter │  │  UI/Display  │      │
│  │   Provider   │→ │   Algorithm  │→ │  Components  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         ↓                  ↓                  ↓              │
│  ┌──────────────────────────────────────────────────┐      │
│  │         Workout Logging Context                   │      │
│  │  (State Management & Data Streaming)              │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    API Layer (Serverless)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  IMU Stream  │  │   Analysis   │  │  AI Insights │      │
│  │     API      │  │     API      │  │     API      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Storage & Database                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Firestore  │  │     GCS      │  │  IndexedDB   │      │
│  │  (Metadata)  │  │ (Raw Data)   │  │  (Offline)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Data Storage Structure

**Firestore Structure:**
```
userWorkouts/
  {userId}/
    {equipment}/          (e.g., "dumbbell", "barbell")
      {exercise}/         (e.g., "concentration-curls")
        logs/
          {workoutId}/    Workout session data
        analytics/
          {workoutId}/    Analysis results
        calibration/
          rom/            ROM calibration data
```

**GCS Structure:**
```
users/
  {userId}/
    {equipment}/
      {exercise}/
        {timestamp}_{workoutId}/
          workout_data.json    Complete workout data
          metadata.json        Session metadata
          set_1/
            rep_1.json         Individual rep data
            rep_2.json
          set_2/
            ...
```

---

## Core Algorithms

### 1. Rep Detection Algorithm

**Location:** `utils/RepCounter.js`

The rep detection algorithm uses peak detection on filtered acceleration magnitude to identify individual repetitions.

#### Algorithm Steps:

1. **Data Preprocessing**
   ```javascript
   // Apply Exponential Moving Average (EMA) filter
   filteredValue = α × currentValue + (1 - α) × previousFiltered
   // α = 0.3 for smoothing while maintaining responsiveness
   ```

2. **Peak Detection**
   - Detects local maxima in acceleration magnitude
   - Uses prominence threshold to filter noise
   - Adaptive thresholding based on recent rep history

3. **Valley Detection**
   - Identifies local minima between peaks
   - Defines rep boundaries (start and end points)

4. **Validation**
   ```javascript
   isValidRep = (
     duration >= minRepDuration &&    // 0.5s minimum
     duration <= maxRepDuration &&    // 12s maximum
     prominence >= minProminence      // Equipment-specific threshold
   )
   ```

5. **Full-Cycle Detection**
   - Ensures complete concentric + eccentric phases
   - Prevents premature rep counting
   - Validates peak-to-valley-to-peak pattern

#### Equipment-Specific Thresholds:

| Equipment | Min Prominence (m/s²) | Min Duration (s) | Max Duration (s) |
|-----------|----------------------|------------------|------------------|
| Barbell   | 0.5                  | 0.5              | 12.0             |
| Dumbbell  | 0.8                  | 0.5              | 12.0             |
| Weight Stack | 0.6               | 0.5              | 12.0             |

### 2. Movement Phase Analysis

**Location:** `services/workoutAnalysisService.js`

Analyzes concentric (lifting) and eccentric (lowering) phases of each rep.

#### Algorithm:

1. **Velocity Calculation**
   ```javascript
   velocity[i] = (position[i] - position[i-1]) / Δt
   ```

2. **Phase Identification**
   - Concentric: Positive velocity (moving against gravity)
   - Eccentric: Negative velocity (moving with gravity)
   - Peak: Transition point between phases

3. **Phase Timing**
   ```javascript
   concentricTime = timeAtPeak - timeAtStart
   eccentricTime = timeAtEnd - timeAtPeak
   peakTimePercent = (concentricTime / totalDuration) × 100
   ```

4. **Exercise-Specific Ratios**
   - Barbell exercises: 30-70% concentric (explosive lifting)
   - Dumbbell exercises: 40-60% concentric (controlled movement)
   - Weight stack: 35-65% concentric (machine-guided)

### 3. ROM (Range of Motion) Calculation

**Location:** `utils/ROMComputer.js`

Calculates range of motion using gyroscope integration and accelerometer-based displacement.

#### For Angle-Based Exercises (Dumbbell):
```javascript
// Integrate angular velocity over time
angle = ∫ gyroMagnitude × dt

// Apply retroCorrect for drift compensation
correctedAngle = angle - (drift × timeElapsed)
```

#### For Stroke-Based Exercises (Barbell, Weight Stack):
```javascript
// Double integration of acceleration
velocity = ∫ acceleration × dt
displacement = ∫ velocity × dt

// Convert to centimeters
ROM_cm = displacement × 100
```

#### Calibration:
- First rep of first set establishes baseline ROM
- Subsequent reps compared against calibrated target
- ROM fulfillment = (actualROM / targetROM) × 100%

### 4. Movement Quality Scoring

**Location:** `services/workoutAnalysisService.js`

Evaluates smoothness and control of movement.

#### Smoothness Score (0-100):
```javascript
// Calculate jerk (rate of change of acceleration)
jerk[i] = (accel[i] - accel[i-1]) / Δt

// Mean absolute jerk
meanJerk = Σ|jerk| / n

// Normalize to 0-100 scale (lower jerk = higher score)
smoothnessScore = 100 - min(meanJerk × scaleFactor, 100)
```

#### Quality Classification:
- **Clean** (80-100): Smooth, controlled movement
- **Moderate** (50-79): Some instability
- **Uncontrolled** (0-49): Excessive jerk, poor control


### 6. Calorie Calculation

**Location:** `utils/calorieCalculator.js`

Uses MET (Metabolic Equivalent of Task) formula with active time only.

#### Formula:
```javascript
Calories = Duration(min) × (MET × 3.5 × BodyWeight(kg)) / 200
```

#### MET Values (from Compendium of Physical Activities):
- Barbell exercises: 6.0-6.5 MET
- Dumbbell exercises: 4.5-5.5 MET
- Weight stack: 4.0-4.5 MET
- Specific exercises (e.g., deadlift: 6.5, bench press: 6.0)

#### Active Time Calculation:
```javascript
activeTime = Σ(repDurations)  // Excludes rest periods
// Each rep duration from IMU data (typically 2-5 seconds)
```

#### Example:
```
Exercise: Bench Press (6.0 MET)
Reps: 45
Active Time: 135 seconds (3s per rep)
Body Weight: 70 kg

Calories = (135/60) × (6.0 × 3.5 × 70) / 200
         = 2.25 × 1470 / 200
         = 33 kcal
```

---

## Data Flow

### 1. Workout Session Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User starts workout                                       │
│    - Selects exercise, equipment, sets/reps                 │
│    - Connects to Bluetooth IMU sensor                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Real-time data streaming                                  │
│    - IMU samples at 20Hz (50ms intervals)                   │
│    - Rep detection runs on each sample                      │
│    - UI updates in real-time                                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Rep completion                                            │
│    - Rep data saved to memory buffer                        │
│    - Checkpoint created for rollback capability             │
│    - UI shows rep count and metrics                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Set completion                                            │
│    - Rep data uploaded to GCS                               │
│    - ML classification queued (online) or stored (offline)  │
│    - Rest timer starts                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Workout completion                                        │
│    - All data uploaded to GCS                               │
│    - Metadata saved to Firestore                            │
│    - Calories calculated and saved                          │
│    - Cache invalidated                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Analysis & insights                                       │
│    - Workout analysis API processes data                    │
│    - AI generates personalized insights                     │
│    - Results displayed on workout-finished page             │
└─────────────────────────────────────────────────────────────┘
```

### 2. Offline Handling

The app implements a robust offline-first architecture:

#### Offline Detection:
```javascript
// Multi-signal offline detection
const offline = (
  !navigator.onLine ||           // Browser API
  isNetworkOffline() ||          // Custom network check
  failedFetchAttempts > 2        // Failed API calls
)
```

#### Store-and-Forward Pattern:
1. **Queue Operations**: Failed operations stored in IndexedDB
2. **Background Sync**: Automatic retry when connection restored
3. **Conflict Resolution**: Last-write-wins for metadata updates

#### Offline Workflow:
```
Online → Offline:
  - Pause uploads
  - Queue ML classification requests
  - Continue rep detection locally
  - Store data in IndexedDB

Offline → Online:
  - Flush queued uploads
  - Process pending ML classifications
  - Update Firestore with merged data
  - Invalidate stale caches
```

### 3. BLE Reconnection Flow

**Location:** `hooks/useBleConnectionWatcher.js`

Handles Bluetooth disconnections during workouts:

```
Disconnection Detected:
  ↓
Pause Workout:
  - Stop rep detection
  - Save checkpoint
  ↓
Rollback Partial Rep:
  - Truncate to last completed rep
  - Clear incomplete data
  ↓
Show Reconnection Modal:
  - Auto-retry every 3 seconds
  - Max 10 attempts
  - Manual retry option
  ↓
Reconnection Success:
  - Resume from checkpoint
  - Reset rep detection state
  - Continue workout
```

---

## Key Features

### 1. Real-Time Rep Detection

- **Latency**: <50ms from sensor to UI update
- **Accuracy**: 95%+ for standard exercises
- **Adaptive**: Adjusts to user's movement patterns

### 2. Movement Quality Analysis

- **Smoothness Scoring**: Jerk-based quality metric
- **Phase Timing**: Concentric/eccentric analysis
- **ROM Tracking**: Calibrated range of motion
- **Consistency**: Rep-to-rep variation detection

### 3. Fatigue Monitoring

- **Multi-Factor**: Velocity, timing, quality, smoothness
- **Real-Time**: Updates after each rep
- **Predictive**: Warns before form breakdown
- **Actionable**: Suggests rest or weight reduction

### 4. AI-Powered Insights

**Location:** `services/aiInsightsService.js`

Uses Google Gemini API to generate personalized insights:

#### Input Data:
- Workout metrics (sets, reps, weight, duration)
- Movement quality scores
- Fatigue analysis
- Historical performance
- User profile (experience level, goals)

#### Output:
- Performance summary
- Form feedback
- Progressive overload suggestions
- Recovery recommendations
- Injury risk warnings

### 5. Offline Support

- **Full Functionality**: Rep detection works offline
- **Data Persistence**: IndexedDB for queued operations
- **Automatic Sync**: Background sync when online
- **Conflict Resolution**: Intelligent merge strategies

### 6. Progressive Overload Tracking

**Location:** `services/workoutLogService.js`

Tracks strength progression over time:

```javascript
progressiveOverload = {
  volumeIncrease: (currentVolume - previousVolume) / previousVolume,
  intensityIncrease: (currentWeight - previousWeight) / previousWeight,
  densityIncrease: (currentReps/currentTime) / (previousReps/previousTime)
}
```

---

## Technical Implementation

### 1. State Management

**Context Providers:**
- `AuthContext`: User authentication and profile
- `BluetoothProvider`: BLE connection management
- `WorkoutLoggingContext`: Workout session state

**State Machine:**
```javascript
SESSION_STATES = {
  IDLE: 'idle',                           // Not started
  ACTIVE: 'active',                       // Recording
  PAUSED: 'paused',                       // User paused
  ACTIVE_OFFLINE: 'active_offline',       // Recording offline
  PAUSED_BLE_DISCONNECTED: 'paused_ble',  // BLE disconnected
  WAITING_FOR_INTERNET: 'waiting_net',    // Waiting to sync
  CANCELING: 'canceling',                 // Canceling workout
  CANCELED: 'canceled'                    // Canceled
}
```

### 2. Data Streaming

**IMU Streaming Service:**
```javascript
// Streaming architecture
Client → Buffer (50 samples) → GCS Upload → Firestore Metadata

// Upload strategy
- Batch uploads every 50 samples
- Signed URLs for direct GCS upload
- Retry logic with exponential backoff
```

### 3. ML Classification

**Location:** `services/mlClassificationService.js`

Classifies rep quality using trained ML models:

```javascript
// Classification pipeline
RepData → Feature Extraction → ML Model → Quality Label

// Features:
- Peak velocity
- Mean jerk
- Phase timing ratio
- ROM fulfillment
- Smoothness score

// Labels:
- "clean": Proper form
- "uncontrolled": Poor control
- "incomplete": Partial ROM
```

### 4. Caching Strategy

**Multi-Layer Cache:**
```javascript
// Layer 1: Memory (Map)
const memoryCache = new Map()

// Layer 2: SessionStorage
sessionStorage.setItem(key, value)

// Layer 3: IndexedDB
await db.put('cache', { key, value, timestamp })

// Cache invalidation
- On workout completion
- On manual refresh
- After 5 minutes (stale data)
```

### 5. Performance Optimizations

**Code Splitting:**
```javascript
// Dynamic imports for heavy components
const AnalysisComponent = dynamic(() => import('./Analysis'))
```

**Memoization:**
```javascript
// Expensive calculations cached
const analysisData = useMemo(() => 
  transformAnalysisForUI(rawAnalysis), 
  [rawAnalysis]
)
```

**Virtual Scrolling:**
```javascript
// Large lists rendered efficiently
<VirtualList items={reps} itemHeight={80} />
```

---

## API Endpoints

### 1. `/api/imu-stream`
**Purpose:** Handle IMU data uploads and workout metadata

**Actions:**
- `upload`: Get signed URL for GCS upload
- `saveMetadata`: Save workout metadata to Firestore
- `completeWorkout`: Mark workout as complete

### 2. `/api/analyze-workout`
**Purpose:** Analyze workout data and generate metrics

**Process:**
1. Fetch workout data from GCS
2. Run analysis algorithms
3. Save results to Firestore analytics collection
4. Return transformed data for UI

### 3. `/api/classify-rep`
**Purpose:** ML classification of rep quality

**Process:**
1. Extract features from rep data
2. Load appropriate ML model
3. Run inference
4. Return classification label and confidence

### 4. `/api/ai-insights`
**Purpose:** Generate AI-powered workout insights

**Process:**
1. Gather workout metrics and history
2. Build context for Gemini API
3. Generate personalized insights
4. Cache results for 24 hours

### 5. `/api/ai-recommendation`
**Purpose:** Generate next workout recommendations

**Process:**
1. Analyze recent performance
2. Calculate progressive overload targets
3. Generate AI recommendations
4. Return sets/reps/weight suggestions

---

## Error Handling

### 1. Network Errors
```javascript
try {
  await fetch(url)
} catch (error) {
  if (error.name === 'AbortError') {
    // Timeout - retry with backoff
  } else if (!navigator.onLine) {
    // Offline - queue for later
  } else {
    // Unknown error - log and notify user
  }
}
```

### 2. BLE Errors
```javascript
// Connection lost
- Save checkpoint
- Rollback partial data
- Show reconnection UI
- Auto-retry with exponential backoff

// Device not found
- Show pairing instructions
- Suggest troubleshooting steps
```

### 3. Data Validation
```javascript
// Validate rep data
if (!isValidRep(rep)) {
  console.warn('Invalid rep detected', rep)
  // Don't count rep, continue monitoring
}

// Validate workout data
if (!hasMinimumData(workout)) {
  throw new Error('Insufficient data for analysis')
}
```

---

## Testing

### Unit Tests
- Rep detection algorithm
- Phase analysis calculations
- ROM computation
- Calorie calculations

### Integration Tests
- Workout flow end-to-end
- Offline sync behavior
- BLE reconnection
- API endpoints

### Performance Tests
- Rep detection latency
- UI responsiveness
- Memory usage
- Battery consumption

---

## Deployment

### Build Process
```bash
npm run build
# Generates optimized production build
# - Code splitting
# - Tree shaking
# - Minification
# - Service worker generation
```

### Environment Variables
```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
GCS_BUCKET_NAME
GEMINI_API_KEY
```

### Hosting
- **Frontend**: Vercel (Edge Network)
- **API**: Vercel Serverless Functions
- **Database**: Firebase Firestore (Multi-region)
- **Storage**: Google Cloud Storage (Regional)

---

## Future Enhancements

1. **Advanced ML Models**
   - Exercise-specific classification
   - Form correction suggestions
   - Injury risk prediction

2. **Social Features**
   - Workout sharing
   - Leaderboards
   - Training partners

3. **Wearable Integration**
   - Heart rate monitoring
   - Calorie burn validation
   - Recovery tracking

4. **Video Analysis**
   - Camera-based form checking
   - Side-by-side comparison
   - Technique tutorials

---

## Conclusion

AppLift combines real-time sensor data, advanced algorithms, and AI to provide comprehensive workout tracking and analysis. The system is designed for reliability, performance, and user experience, with robust offline support and intelligent error handling.

For questions or contributions, please refer to the main README.md or contact the development team.
