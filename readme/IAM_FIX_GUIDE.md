# IAM Permissions Fix Guide

## The Problem
You're using two different Google Cloud projects:
1. **Firebase Project:** `applift-e853d`
2. **GCS Project:** `just-experience-485508-i4`

The Firebase service account (`firebase-adminsdk-fbsvc@applift-e853d.iam.gserviceaccount.com`) doesn't have permission to access GCS in the other project.

## Solutions (Choose One)

### Option 1: Grant Cross-Project Permissions (Recommended)
Grant your Firebase service account access to the GCS project:

```bash
# Grant Storage Admin role to Firebase service account
gcloud projects add-iam-policy-binding just-experience-485508-i4 \
    --member="serviceAccount:firebase-adminsdk-fbsvc@applift-e853d.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# If you need Firestore access too
gcloud projects add-iam-policy-binding just-experience-485508-i4 \
    --member="serviceAccount:firebase-adminsdk-fbsvc@applift-e853d.iam.gserviceaccount.com" \
    --role="roles/datastore.user"
```

### Option 2: Use Same Project for Everything
Move your GCS bucket to the Firebase project:

```bash
# Create bucket in Firebase project
gsutil mb -p applift-e853d gs://applift-e853d-imu-data

# Copy existing data (if any)
gsutil -m cp -r gs://applift-imu-data/* gs://applift-e853d-imu-data/
```

Then update your `.env`:
```
GCS_PROJECT_ID=applift-e853d
GCS_BUCKET_NAME=applift-e853d-imu-data
GCS_CLIENT_EMAIL=firebase-adminsdk-fbsvc@applift-e853d.iam.gserviceaccount.com
GCS_PRIVATE_KEY="<same as FIREBASE_PRIVATE_KEY>"
```

### Option 3: Create Unified Service Account
Create a new service account with access to both projects:

```bash
# Create service account in Firebase project
gcloud iam service-accounts create applift-unified \
    --project=applift-e853d \
    --display-name="AppLift Unified Service Account"

# Grant Firebase permissions
gcloud projects add-iam-policy-binding applift-e853d \
    --member="serviceAccount:applift-unified@applift-e853d.iam.gserviceaccount.com" \
    --role="roles/firebase.admin"

# Grant GCS permissions in other project
gcloud projects add-iam-policy-binding just-experience-485508-i4 \
    --member="serviceAccount:applift-unified@applift-e853d.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

# Generate key
gcloud iam service-accounts keys create applift-unified-key.json \
    --iam-account=applift-unified@applift-e853d.iam.gserviceaccount.com \
    --project=applift-e853d
```

## Testing IAM Permissions

After making changes, test with:
1. **Deploy to Vercel** with updated environment variables
2. **Visit:** `https://applift.fit/api/iam-diagnostic`
3. **Check results** - all tests should show `"success": true`

## Current IAM Issues Detected:

### Issue 1: Mixed Credentials
Your API was using Firebase credentials as fallback for GCS, causing permission conflicts.

### Issue 2: Cross-Project Access
Firebase service account in `applift-e853d` needs explicit permission to access GCS bucket in `just-experience-485508-i4`.

### Issue 3: Service Account Roles
Check if your service accounts have these roles:

**Firebase Service Account needs:**
- Firebase Admin SDK Administrator Service Agent
- Cloud Datastore User (for Firestore)

**GCS Service Account needs:**
- Storage Admin
- Storage Object Admin

## Quick Fix Commands (Run in Google Cloud Shell)

```bash
# Set your projects
export FIREBASE_PROJECT="applift-e853d"
export GCS_PROJECT="just-experience-485508-i4"
export FIREBASE_SA="firebase-adminsdk-fbsvc@applift-e853d.iam.gserviceaccount.com"

# Grant cross-project access
gcloud projects add-iam-policy-binding $GCS_PROJECT \
    --member="serviceAccount:$FIREBASE_SA" \
    --role="roles/storage.admin"

# Verify permissions
gcloud projects get-iam-policy $GCS_PROJECT \
    --filter="bindings.members:serviceAccount:$FIREBASE_SA"
```

## Verification Steps:
1. ✅ Run the IAM diagnostic API
2. ✅ Test file upload to GCS
3. ✅ Test Firestore write operations
4. ✅ Check Vercel function logs for permission errors
