# Workout Streak Integration Guide

## Overview
The workout streak feature tracks consecutive days of workouts for users, providing motivation and gamification elements to the fitness app.

## Files Added/Modified

### New Files
1. **`components/WorkoutStreak.js`** - React component that displays the streak UI
2. **`services/workoutStreakService.js`** - Backend service for managing streaks in Firestore
3. **`utils/useWorkoutStreak.js`** - React hook for easy integration of streak functionality
4. **`readme/WORKOUT_STREAK_INTEGRATION.md`** - This documentation file

### Modified Files
1. **`pages/dashboard.js`** - Added WorkoutStreak component to the main dashboard

## Database Schema

### User Document Extension
The streak data is stored in the user document in Firestore:

```javascript
// users/{userId}
{
  // ...existing user fields...
  workoutStreak: {
    currentStreak: 5,                    // Current consecutive days
    longestStreak: 12,                   // Longest streak ever achieved
    lastWorkoutDate: Timestamp,          // Firestore Timestamp of last workout
    totalWorkoutDays: 45,                // Total days with workouts
    streakStartDate: Timestamp,          // When current streak started
    lastUpdated: Timestamp               // When this data was last updated
  }
}
```

### Workout Document Schema
Workouts should include a completion timestamp for streak calculation:

```javascript
// workouts/{workoutId}
{
  userId: string,                        // Reference to user
  workoutType: string,                   // Type of workout
  exercises: Array,                      // Exercise data
  startedAt: Timestamp,                  // When workout was started
  completedAt: Timestamp,                // When workout was completed ✓ REQUIRED for streaks
  duration: number,                      // Workout duration in minutes
  // ...other workout fields...
}
```

## Backend Integration Steps

### 1. Update Workout Completion Logic

When a user completes a workout, call the streak service:

```javascript
import { WorkoutStreakService } from '../services/workoutStreakService';

// In your workout completion handler
export async function completeWorkout(userId, workoutData) {
  try {
    // Save the workout with completedAt timestamp
    const workoutDoc = {
      ...workoutData,
      completedAt: new Date(), // or Timestamp.now() for Firestore
      userId: userId
    };
    
    // Save workout to database
    await saveWorkoutToDatabase(workoutDoc);
    
    // Update user's workout streak
    const updatedStreak = await WorkoutStreakService.updateWorkoutStreak(
      userId, 
      workoutDoc.completedAt
    );
    
    console.log('Workout completed! New streak:', updatedStreak.currentStreak);
    
    return { workout: workoutDoc, streak: updatedStreak };
  } catch (error) {
    console.error('Error completing workout:', error);
    throw error;
  }
}
```

### 2. Load Streak Data on Dashboard

The dashboard already uses the `useWorkoutStreak` hook:

```javascript
// In pages/dashboard.js
import { useWorkoutStreak } from '../utils/useWorkoutStreak';

export default function Dashboard() {
  const { streakData, loading, error } = useWorkoutStreak();
  
  // The hook automatically loads streak data when user is authenticated
  // streakData contains: { currentStreak, longestStreak, lastWorkoutDate, totalWorkoutDays }
}
```

### 3. Additional Integration Points

#### A. Profile/Settings Page
Show streak statistics in user profile:

```javascript
import { useWorkoutStreak } from '../utils/useWorkoutStreak';

function ProfilePage() {
  const { streakData } = useWorkoutStreak();
  
  return (
    <div>
      <h3>Workout Statistics</h3>
      <p>Current Streak: {streakData.currentStreak} days</p>
      <p>Longest Streak: {streakData.longestStreak} days</p>
      <p>Total Workout Days: {streakData.totalWorkoutDays}</p>
    </div>
  );
}
```

#### B. Workout Monitor Page
Update streak when workout is completed:

```javascript
import { useWorkoutStreak } from '../utils/useWorkoutStreak';

function WorkoutMonitor() {
  const { recordWorkout } = useWorkoutStreak();
  
  const handleWorkoutComplete = async () => {
    try {
      // Complete the workout in your existing logic
      await completeCurrentWorkout();
      
      // Record the workout for streak tracking
      const updatedStreak = await recordWorkout();
      
      // Show streak update notification
      showStreakNotification(updatedStreak.currentStreak);
    } catch (error) {
      console.error('Error completing workout:', error);
    }
  };
}
```

#### C. Leaderboards (Optional)
Create a leaderboard page showing top streaks:

```javascript
import { WorkoutStreakService } from '../services/workoutStreakService';

function LeaderboardPage() {
  const [topUsers, setTopUsers] = useState([]);
  
  useEffect(() => {
    async function loadLeaderboard() {
      const users = await WorkoutStreakService.getTopStreakUsers(10);
      setTopUsers(users);
    }
    loadLeaderboard();
  }, []);
  
  return (
    <div>
      <h2>Streak Leaderboard</h2>
      {topUsers.map((user, index) => (
        <div key={user.userId}>
          #{index + 1} {user.username}: {user.currentStreak} days
        </div>
      ))}
    </div>
  );
}
```

## API Endpoints (Optional)

If you prefer REST API endpoints instead of direct Firestore calls:

### POST /api/workouts/complete
```javascript
// Body: { workoutId: string, userId: string, completedAt: string }
// Response: { workout: Object, streak: Object }
```

### GET /api/users/:userId/streak
```javascript
// Response: { currentStreak: number, longestStreak: number, ... }
```

### GET /api/leaderboard/streaks
```javascript
// Query: ?limit=10
// Response: [{ userId: string, username: string, currentStreak: number }]
```

## Frontend Components Usage

### Basic Usage
```javascript
import WorkoutStreak from '../components/WorkoutStreak';

function MyPage() {
  return (
    <WorkoutStreak 
      streakDays={5} 
      lastWorkoutDate="2026-01-30T00:00:00Z"
      loading={false}
    />
  );
}
```

### With Hook Integration
```javascript
import { useWorkoutStreak } from '../utils/useWorkoutStreak';
import WorkoutStreak from '../components/WorkoutStreak';

function MyPage() {
  const { streakData, loading } = useWorkoutStreak();
  
  return (
    <WorkoutStreak 
      streakDays={streakData.currentStreak}
      lastWorkoutDate={streakData.lastWorkoutDate}
      loading={loading}
    />
  );
}
```

## Error Handling

The service includes comprehensive error handling:

```javascript
try {
  const streak = await WorkoutStreakService.updateWorkoutStreak(userId);
} catch (error) {
  if (error.message === 'User document not found') {
    // Handle case where user doesn't exist
  } else {
    // Handle other errors
    console.error('Streak update failed:', error);
  }
}
```

## Testing

### Manual Testing Checklist
1. ✓ Complete a workout - streak should increase
2. ✓ Complete workout same day - streak should not change
3. ✓ Skip a day, then workout - streak should reset to 1
4. ✓ Check dashboard shows correct streak
5. ✓ Verify longest streak is tracked correctly
6. ✓ Test with no previous workouts (first-time user)

### Test Data Setup
```javascript
// Create test user with specific streak data
const testStreakData = {
  currentStreak: 3,
  longestStreak: 10,
  lastWorkoutDate: Timestamp.fromDate(new Date('2026-01-30')),
  totalWorkoutDays: 25,
  streakStartDate: Timestamp.fromDate(new Date('2026-01-28'))
};
```

## Performance Considerations

1. **Caching**: The hook caches streak data to avoid unnecessary database calls
2. **Batch Updates**: Consider batching streak updates with workout saves
3. **Indexing**: Add Firestore indexes for streak queries:
   ```
   Collection: users
   Fields: workoutStreak.currentStreak (Descending)
   ```

## Future Enhancements

1. **Streak Rewards**: Award badges or points for streak milestones
2. **Social Features**: Share streak achievements with friends
3. **Weekly/Monthly Streaks**: Track different types of streaks
4. **Streak Recovery**: Allow users to "buy back" broken streaks
5. **Push Notifications**: Remind users to maintain their streak

## Troubleshooting

### Common Issues
1. **Streak not updating**: Check if `completedAt` timestamp is being set on workouts
2. **Loading state stuck**: Verify user authentication and Firestore permissions
3. **Incorrect dates**: Ensure consistent timezone handling across frontend/backend
4. **Performance issues**: Check Firestore query limits and indexing

### Debug Logging
Enable debug logging by setting localStorage flag:
```javascript
localStorage.setItem('debug-workout-streak', 'true');
```

## Security Rules

Add Firestore security rules for streak data:

```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /workouts/{workoutId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
```

---

This integration provides a robust, scalable workout streak system that can grow with your application's needs.
