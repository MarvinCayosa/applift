# Offline Network Detection System

## Overview

Reliable network status detection that identifies offline conditions within 0-2 seconds, enabling proper handling of workout data when internet connectivity is lost.

## Problem Solved

### Before
- Browser `offline` events: 10-60+ seconds delay
- Single probe timeout: 4-8 seconds
- Localhost always succeeds (dev server running)
- Consecutive failures required: 8-16 seconds total

### After
- **Detection time**: 0-2 seconds
- **Triple-signal system**: Browser events + fetch failures + active probe
- **Localhost fix**: Checks `navigator.onLine` before probing
- **Instant threshold**: Single failure triggers offline state

## Implementation

### Files
- `hooks/useNetworkConnectionWatcher.js` - Core detection logic
- `context/WorkoutLoggingContext.js` - Dual-signal offline checking
- `pages/workout-monitor.js` - Integration & offline UI

### Three Detection Signals

#### Signal 1: Browser Events
```javascript
window.addEventListener('online', goOnline);
window.addEventListener('offline', goOffline);
```
- Baseline detection
- Slow and unreliable (10-60+ seconds)
- Used as fallback

#### Signal 2: Custom Fetch-Failed Events
```javascript
// From any service when fetch throws TypeError
signalFetchFailed();
window.dispatchEvent(new Event('applift:fetch-failed'));
```
- Triggered by actual network failures
- Immediate detection when API calls fail
- Consecutive failure threshold: 1 (instant)

#### Signal 3: Active Probe
```javascript
// Every 2 seconds during workout
const probe = async () => {
  // CRITICAL: Check navigator.onLine FIRST
  if (!navigator.onLine) {
    goOffline();
    return;
  }
  
  // Then try fetch
  const resp = await fetch('/api/health', {
    method: 'HEAD',
    signal: ctrl.signal,
    cache: 'no-store',
  });
  
  if (!resp.ok) throw new Error('probe non-ok');
  goOnline();
};
```
- Probes every 2 seconds (reduced from 4s)
- Timeout: 2 seconds (reduced from 3s)
- **Localhost fix**: Checks `navigator.onLine` before fetch

## Configuration

### Thresholds
```javascript
const CONSECUTIVE_FAILURE_THRESHOLD = 1; // Instant detection
```

### Probe Settings
```javascript
const PROBE_INTERVAL = 2000; // 2 seconds
const PROBE_TIMEOUT = 2000; // 2 seconds
const PROBE_URL = '/api/health'; // Lightweight endpoint
```

### Module-Level State
```javascript
let _isKnownOffline = false; // Sync check from any module
let _consecutiveFailures = 0; // Failure counter
```

## Usage

### In Components
```javascript
const { isOnline } = useNetworkConnectionWatcher({
  onOffline: () => console.log('Offline detected'),
  onOnline: () => console.log('Online restored'),
  activeProbe: true, // Enable periodic probe
});
```

### In Services
```javascript
import { isNetworkOffline, signalFetchFailed, signalFetchOk } from '../hooks/useNetworkConnectionWatcher';

async function apiCall() {
  // Short-circuit if already known offline
  if (isNetworkOffline()) {
    console.log('Skipping API call - offline');
    return null;
  }
  
  try {
    const response = await fetch('/api/endpoint');
    signalFetchOk(); // Reset failure counter
    return response;
  } catch (err) {
    if (err.name === 'TypeError') {
      signalFetchFailed(); // Increment failure counter
    }
    throw err;
  }
}
```

## Localhost Fix

### The Problem
On localhost, the dev server is always running, so:
```javascript
fetch('/api/health') // Always succeeds even when WiFi is off
```

### The Solution
Check `navigator.onLine` BEFORE attempting fetch:
```javascript
if (typeof navigator !== 'undefined' && !navigator.onLine) {
  console.log('[NetworkWatcher] 🔍 Probe: navigator.onLine=false, triggering offline');
  goOffline();
  return; // Don't even try the fetch
}
```

## Performance Metrics

### Detection Time
- **Browser offline event**: 0ms (instant, but unreliable)
- **Fetch failure**: 0-2000ms (timeout)
- **Active probe**: 0-2000ms (interval + timeout)
- **Overall**: 0-2 seconds maximum

### Improvement
- **Before**: 4-8 seconds (2 consecutive failures × 4s interval)
- **After**: 0-2 seconds (1 failure × 2s timeout)
- **Improvement**: 75% faster

## Console Logs

### Offline Detection
```
[NetworkWatcher] 🔍 Probe: navigator.onLine=false, triggering offline
[NetworkWatcher] ⚡ Offline detected
[WorkoutMonitor] 🔴 Network offline detected, isRecording: true
```

### Online Restoration
```
[NetworkWatcher] ✅ Online restored
[WorkoutMonitor] 🟢 Network online detected
```

### Fetch Failures
```
[NetworkWatcher] Fetch failed (1/1) — offline
[NetworkWatcher] ⚡ Offline detected
```

## Offline Workflow

### During Workout
1. User starts workout
2. Network probe runs every 2 seconds
3. WiFi disconnects
4. `navigator.onLine` becomes false
5. Next probe detects offline (0-2 seconds)
6. OfflineBanner appears
7. Set completions queue locally
8. ML classifications queue locally

### After Workout
1. Workout finishes
2. If offline: Show "Waiting for Internet" modal
3. When online: Flush queued operations
4. Upload workout data to GCS
5. Run ML classifications
6. Save to Firestore
7. Navigate to workout-finished page

### Deferred Navigation
```javascript
// Store completion data while offline
deferredWorkoutResultRef.current = {
  finalStats,
  result,
  repData,
  chartData,
};

// When online restored
async function processDeferredWorkout() {
  // 1. Flush GCS uploads
  await flushQueue(uploadOfflineJob, 'gcs_upload');
  
  // 2. Flush ML classifications
  const classifications = await flushPendingSetClassifications();
  
  // 3. Merge classifications into workout data
  // 4. Re-upload patched workout_data.json
  // 5. Save to Firestore
  // 6. Navigate to workout-finished
}
```

## Testing

### Test Scenario 1: Offline During Workout
1. Start workout, begin recording
2. Disconnect WiFi
3. OfflineBanner appears within 0-2 seconds
4. Complete set
5. Set queued locally
6. Reconnect WiFi
7. Banner disappears
8. Toast: "Connection restored"
9. Continue workout normally

### Test Scenario 2: Offline at Workout End
1. Complete final set
2. Disconnect WiFi
3. "Waiting for Internet" modal appears
4. Reconnect WiFi
5. Modal shows "Processing..."
6. Queued operations flush
7. Navigate to workout-finished

### Test Scenario 3: Localhost Development
1. Run `npm run dev`
2. Open localhost:3000
3. Start workout
4. Disconnect WiFi
5. OfflineBanner appears within 0-2 seconds (not 10-60s)
6. Console shows: `navigator.onLine=false`

## Architecture

### State Machine Integration
```
SESSION_STATES.ACTIVE (recording)
    ↓ (offline detected)
SESSION_STATES.ACTIVE_OFFLINE (recording, offline)
    ↓ (online restored)
SESSION_STATES.ACTIVE (recording, online)

SESSION_STATES.IDLE (workout finished)
    ↓ (offline at finish)
SESSION_STATES.WAITING_FOR_INTERNET (deferred navigation)
    ↓ (online restored)
processDeferredWorkout() → navigate to workout-finished
```

### Offline Queue
```javascript
// Queue operations while offline
await enqueueJob({
  type: 'gcs_upload',
  userId: user.uid,
  workoutId,
  filePath: 'workout_data.json',
  data: workoutData,
});

// Flush when online
await flushQueue(uploadOfflineJob, 'gcs_upload');
```

## Future Enhancements (Not Implemented)

1. **Service Worker**: True offline support with background sync
2. **IndexedDB**: Persistent offline queue (survives page refresh)
3. **Retry logic**: Exponential backoff for failed uploads
4. **Conflict resolution**: Handle concurrent edits from multiple devices
