# Workout Logging Pipeline Documentation

## Overview

This document describes the comprehensive workout logging pipeline implemented in AppLift. The pipeline handles:

1. **Real-time IMU streaming** - Stream sensor data directly to cloud as workout progresses
2. **ML-ready data format** - JSON structure optimized for feature extraction
3. **Set/Rep organization** - Data organized by sets and reps for easy analysis
4. **Real-time classification** - Support for ML model classification after each rep
5. **Cloud storage** - Complete workout JSON stored in Google Cloud Storage (GCS)
6. **Dashboard integration** - Displaying workout history and statistics

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Selected       │     │  Workout        │     │  Workout        │
│  Workout Page   │────▶│  Monitor Page   │────▶│  Finished Page  │
│  (Start Log)    │     │  (Stream IMU)   │     │  (Save/Upload)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Initialize     │     │  Buffer + Rep   │     │  Upload Full    │
│  Streaming      │     │  Detection      │     │  Workout JSON   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                       ┌─────────────────┐
                       │  ML Model       │
                       │  (Per-Rep)      │
                       └─────────────────┘
```

## Data Format (ML-Optimized JSON)

```json
{
  "workoutId": "workout_xxx",
  "exercise": "Bench Press",
  "equipment": "Barbell",
  "plannedSets": 4,
  "plannedReps": 8,
  "status": "completed",
  "sets": [
    {
      "setNumber": 1,
      "startTime": "2026-02-01T...",
      "endTime": "2026-02-01T...",
      "reps": [
        {
          "repNumber": 1,
          "duration": 2500,
          "sampleCount": 50,
          "classification": "good_form",  // From ML model
          "confidence": 0.92,
          "samples": [
            {
              "set": 1,
              "rep": 1,
              "timestamp": "00:00.000",
              "timestamp_ms": 0,
              "accelX": -0.27,
              "accelY": 2.38,
              "accelZ": 9.49,
              "accelMag": 9.62,
              "gyroX": -0.14,
              "gyroY": -0.14,
              "gyroZ": -0.03,
              "roll": -0.44,
              "pitch": 75.81,
              "yaw": 297.44,
              "filteredX": -0.27,
              "filteredY": 2.38,
              "filteredZ": 9.49,
              "filteredMag": 9.62
            }
          ]
        }
      ]
    }
  ]
}
```

## CSV Export Format

For compatibility, data can also be exported as CSV:

```csv
set,rep,timestamp,timestamp_ms,accelX,accelY,accelZ,accelMag,gyroX,gyroY,gyroZ,roll,pitch,yaw,filteredX,filteredY,filteredZ,filteredMag
1,1,00:00.000,0,-0.27,2.38,9.49,9.62,-0.14,-0.14,-0.03,-0.44,75.81,297.44,-0.27,2.38,9.49,9.62
1,1,00:00.050,50,-0.25,2.40,9.51,9.64,-0.13,-0.15,-0.02,-0.42,75.85,297.48,-0.26,2.39,9.50,9.63
```

## File Structure

```
services/
├── workoutLogService.js     # Firestore CRUD for workout logs
├── imuUploadService.js      # Legacy batch upload
└── imuStreamingService.js   # NEW: Real-time streaming + ML integration

context/
└── WorkoutLoggingContext.js # React context with ML hooks

pages/api/
├── imu-upload.js            # Legacy upload API
└── imu-stream.js            # NEW: Streaming API

utils/
└── useWorkoutLogs.js        # Hook for fetching workout history
```

## GCS Storage Structure

```
bucket/users/{userId}/workouts/{workoutId}/
  ├── metadata.json         # Workout metadata (status, exercise, etc.)
  └── workout_data.json     # Complete workout data with all sets/reps
```

## ML Integration Flow

### 1. During Recording
```javascript
// In workout-monitor.js - when rep is detected
const result = await handleRepDetected(repInfo);

// Get rep data formatted for ML
const mlData = getRepForML(result.setNumber, result.repNumber);

// Send to ML model for classification
const classification = await sendToMLModel(mlData);

// Store classification result
setRepClassification(result.setNumber, result.repNumber, classification.label, classification.confidence);
```

### 2. ML Model Integration Points

```javascript
// Option A: Real-time per-rep classification
const onRepComplete = async (repResult) => {
  const mlData = getRepForML(repResult.setNumber, repResult.repNumber);
  
  // mlData contains:
  // - samples: Array of IMU readings with set/rep context
  // - asCSV: Same data as CSV string
  // - duration, sampleCount, etc.
  
  const prediction = await yourMLModel.predict(mlData.samples);
  setRepClassification(repResult.setNumber, repResult.repNumber, prediction);
};

// Option B: Post-workout batch processing
const onWorkoutComplete = async () => {
  const workoutData = getWorkoutData();
  const csvExport = exportAsCSV();
  
  // Process entire workout
  await sendToBatchMLPipeline(workoutData);
};
```

## Firestore Schema

### Collection: `workoutLogs`

```javascript
{
  userId: string,           // Firebase Auth UID
  sessionId: string,        // Unique session identifier (session_xxx_xxx)
  status: 'pending' | 'in_progress' | 'completed' | 'canceled',
  
  exercise: {
    name: string,           // e.g., "Flat Bench Barbell Press"
    equipment: string,      // e.g., "Barbell"
    targetMuscles: string[] // e.g., ["Chest", "Shoulders", "Triceps"]
  },
  
  planned: {
    sets: number,           // Planned number of sets
    reps: number,           // Planned reps per set
    weight: number,         // Weight in specified unit
    weightUnit: 'kg' | 'lbs'
  },
  
  results: {
    totalSets: number,      // Actual completed sets
    totalReps: number,      // Total reps across all sets
    totalTime: number,      // Duration in seconds
    calories: number,       // Estimated calories burned
    avgConcentric: number,  // Average concentric phase duration
    avgEccentric: number,   // Average eccentric phase duration
    setData: [{             // Per-set breakdown
      setNumber: number,
      reps: number,
      duration: number,
      repsData: [{...}]     // Per-rep details
    }]
  },
  
  imuDataPath: string,      // GCS path (gs://bucket/users/uid/sessions/sid/imu_data.csv)
  cancelReason: string,     // Only if status === 'canceled'
  
  timestamps: {
    created: Timestamp,     // When log was created (pre-workout)
    started: Timestamp,     // When recording began
    completed: Timestamp    // When workout finished or canceled
  }
}
```

## GCS File Structure

```
gs://applift-imu-data/
└── users/
    └── {userId}/
        └── sessions/
            └── {sessionId}/
                └── imu_data.csv
```

### CSV Format

```csv
# AppLift IMU Data Export
# Generated: 2024-01-15T10:30:00.000Z
# User ID: abc123
# Session ID: session_xyz_123
# Exercise: Flat Bench Barbell Press
# Equipment: Barbell
# Planned Sets: 4
# Planned Reps: 8
# Weight: 60 kg
# Total Samples: 2400
# Sample Rate: ~20Hz
#
timestamp_ms,accel_x,accel_y,accel_z,gyro_x,gyro_y,gyro_z,roll,pitch,yaw,raw_magnitude,filtered_magnitude,set_number,rep_number,rep_label,is_rep_peak
0,0.123456,-0.234567,9.812345,0.001234,-0.002345,0.003456,0.1234,0.2345,0.3456,9.823456,9.815678,1,0,,0
50,0.234567,-0.345678,9.823456,0.002345,-0.003456,0.004567,0.1345,0.2456,0.3567,9.834567,9.826789,1,1,Set1_Rep1,0
...
```

## Environment Variables

Add these to your `.env.local` file:

```env
# Firebase (existing)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Google Cloud Storage (new)
GCS_PROJECT_ID=your_gcs_project_id
GCS_BUCKET_NAME=applift-imu-data
GCS_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
GCS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Firebase Admin (for token verification)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## GCS Setup

1. **Create a GCS Bucket**:
   ```bash
   gsutil mb -l US gs://applift-imu-data
   ```

2. **Create a Service Account**:
   - Go to Google Cloud Console → IAM & Admin → Service Accounts
   - Create new service account with name `applift-backend`
   - Grant "Storage Object Admin" role for the bucket
   - Create and download JSON key

3. **Configure CORS** (for direct browser uploads):
   ```json
   [
     {
       "origin": ["https://your-domain.com", "http://localhost:3000"],
       "method": ["PUT", "GET"],
       "responseHeader": ["Content-Type"],
       "maxAgeSeconds": 3600
     }
   ]
   ```
   Apply with: `gsutil cors set cors.json gs://applift-imu-data`

## Firestore Security Rules

Add these rules to allow users to read/write only their own workout logs:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Workout logs - users can only access their own
    match /workoutLogs/{logId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null 
        && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## Usage Examples

### Creating a Workout Log
```javascript
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';

const { initializeLog } = useWorkoutLogging();

// On "Let's Workout" button click
await initializeLog({
  exercise: 'Flat Bench Barbell Press',
  equipment: 'Barbell',
  targetMuscles: ['Chest', 'Shoulders', 'Triceps'],
  sets: 4,
  reps: 8,
  weight: 60,
  weightUnit: 'kg',
});
```

### Completing a Workout
```javascript
const { completeLog } = useWorkoutLogging();

// On "Save Workout" button click
await completeLog({
  totalSets: 4,
  totalReps: 32,
  totalTime: 480,
  calories: 160,
  avgConcentric: 1.2,
  avgEccentric: 1.8,
  setData: [...],
});
```

### Fetching Workout History
```javascript
import { useWorkoutLogs } from '../utils/useWorkoutLogs';

const { 
  recentWorkouts, 
  stats, 
  loading,
  equipmentDistribution,
} = useWorkoutLogs({ includeStats: true });
```

## Error Handling

The pipeline includes several fallback mechanisms:

1. **Upload Failure**: If GCS upload fails, data is saved to localStorage
2. **Retry Logic**: Uploads are retried up to 3 times with exponential backoff
3. **Offline Support**: Logs can be marked pending and synced when online
4. **Graceful Degradation**: Missing GCS config falls back to local-only storage

## Dependencies

Add these packages if not already installed:

```bash
npm install @google-cloud/storage firebase-admin
```

## Testing

To test the pipeline:

1. Connect BLE sensor and start recording
2. Perform a few reps
3. Complete the workout
4. Check Firestore for the log entry
5. Check GCS bucket for the CSV file
6. Verify dashboard shows the workout
