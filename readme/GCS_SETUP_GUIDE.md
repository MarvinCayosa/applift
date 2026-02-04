# 🔧 GCS & Firebase Setup Guide for AppLift

## Quick Setup (5 minutes)

### Step 1: Get Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create one)
3. **Client-side config**:
   - Go to Project Settings (gear icon) → General → Your apps
   - Copy the web app config
4. **Server-side config**:
   - Go to Project Settings → Service Accounts
   - Click "Generate new private key"
   - Save the JSON file

### Step 2: Create GCS Bucket

1. Go to [Google Cloud Console Storage](https://console.cloud.google.com/storage/browser)
2. Click **"Create Bucket"**
3. Settings:
   - Name: `applift-imu-data` (or your choice)
   - Location: Choose closest region
   - Storage class: Standard
   - Access control: Fine-grained
4. Click **"Create"**

### Step 3: Create Service Account for GCS

1. Go to [IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click **"Create Service Account"**
3. Name: `applift-storage-admin`
4. Click **"Create and Continue"**
5. Grant role: **"Storage Admin"** (under Cloud Storage)
6. Click **"Continue"** → **"Done"**
7. Click on the new service account
8. Go to **"Keys"** tab → **"Add Key"** → **"Create new key"** → **JSON**
9. Save the downloaded JSON file

### Step 4: Create .env.local

Create a file called `.env.local` in your project root:

```env
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123

# Firebase Admin (from service account JSON)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# GCS (from storage service account JSON)
GCS_PROJECT_ID=your-project-id
GCS_CLIENT_EMAIL=applift-storage-admin@your-project.iam.gserviceaccount.com
GCS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GCS_BUCKET_NAME=applift-imu-data
```

**⚠️ Important**: For the private keys:
- Keep the `\n` characters as they are
- Wrap the entire key in double quotes
- Copy the ENTIRE key including BEGIN and END lines

### Step 5: Test the Connection

Run the test script:

```bash
node scripts/test-gcs.js
```

Expected output:
```
🧪 Testing Google Cloud Storage Connection...

✅ Environment variables found
✅ Storage client initialized
✅ Bucket "applift-imu-data" exists
📤 Testing file upload...
✅ Test file uploaded
📥 Testing file read...
✅ Test file read successfully
🔗 Testing signed URL generation...
✅ Signed URL generated

✅✅✅ All GCS tests passed! ✅✅✅
```

---

## 🧪 Testing the Full Workout Flow

### Test 1: Mock Mode (No GCS Required)

If GCS is not configured, the app runs in **mock mode**:

1. Start the dev server: `npm run dev`
2. Go to Dashboard → Select a workout
3. Configure custom set (e.g., 5kg, 2 sets, 10 reps)
4. Click "Let's Workout"
5. Check browser console for logs:
   ```
   🏋️ Starting Workout: { exercise: "...", setType: "custom", ... }
   📋 Workout Config Updated: { sets: 2, reps: 10, weight: 5, ... }
   [IMU Stream API] GCS not configured, using mock mode
   ```

### Test 2: With GCS Configured

1. Ensure `.env.local` is set up (run `node scripts/test-gcs.js` to verify)
2. Restart dev server: `npm run dev`
3. Go through the workout flow
4. After completing a workout, check GCS bucket:
   - Go to [GCS Browser](https://console.cloud.google.com/storage/browser)
   - Navigate to: `applift-imu-data/users/{userId}/workouts/{workoutId}/`
   - You should see:
     - `metadata.json` - Workout config and status
     - `workout_data.json` - All IMU data organized by sets/reps

### Test 3: Check Firestore

1. Go to [Firebase Console → Firestore](https://console.firebase.google.com/project/_/firestore)
2. Look for `workoutLogs` collection
3. Each workout should have a document with:
   ```json
   {
     "exercise": { "name": "...", "equipment": "..." },
     "planned": { "sets": 2, "reps": 10, "weight": 5 },
     "results": { "completedSets": 2, "completedReps": 20 },
     "status": "completed",
     "gcsPath": "gs://applift-imu-data/users/xxx/workouts/xxx/"
   }
   ```

---

## 🔍 Debugging

### Common Issues

#### "GCS not configured, using mock mode"
- Missing `.env.local` or environment variables not set
- Restart the dev server after creating `.env.local`

#### "Permission denied"
- Service account doesn't have "Storage Admin" role
- Go to IAM & Admin → IAM → Find your service account → Add role

#### "Bucket not found"
- Bucket doesn't exist or wrong name in `GCS_BUCKET_NAME`
- Create bucket in GCS Console

#### "invalid_grant"
- Private key format issue
- Make sure the key is properly escaped with `\n`
- Try using single backslash: `\n` not `\\n`

#### "Token verification failed"
- Firebase Admin not configured correctly
- Check `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`

### Enable Debug Logging

Add to your `.env.local`:
```env
DEBUG=true
```

Then check the server console for detailed logs.

---

## 📊 Data Structure in GCS

After a workout, your data looks like this:

```
applift-imu-data/
  users/
    {userId}/
      workouts/
        workout_abc123/
          metadata.json         # Workout config, status, timestamps
          workout_data.json     # Complete workout with all IMU data
```

### metadata.json
```json
{
  "exercise": "Concentration Curls",
  "equipment": "Dumbbell",
  "plannedSets": 2,
  "plannedReps": 10,
  "weight": 5,
  "weightUnit": "kg",
  "setType": "custom",
  "status": "completed",
  "completedSets": 2,
  "completedReps": 20,
  "startTime": "2026-02-01T10:00:00Z",
  "endTime": "2026-02-01T10:15:00Z"
}
```

### workout_data.json
```json
{
  "workoutId": "workout_abc123",
  "exercise": "Concentration Curls",
  "sets": [
    {
      "setNumber": 1,
      "reps": [
        {
          "repNumber": 1,
          "duration": 2500,
          "samples": [
            {
              "set": 1,
              "rep": 1,
              "timestamp": "00:00.000",
              "accelX": -0.27,
              "accelY": 2.38,
              "accelZ": 9.49,
              ...
            }
          ]
        }
      ]
    }
  ]
}
```

---

## 🚀 Deploy to Vercel

When deploying to Vercel:

1. Go to your Vercel project settings
2. Add all environment variables from `.env.local`
3. For private keys, paste the entire key including newlines
4. Redeploy your app

That's it! Your workout logging pipeline is ready for production! 🎉
