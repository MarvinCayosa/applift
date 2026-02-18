# Cloud Run ML API Setup Guide

## 🚀 Quick Start

This guide will help you deploy your workout classification models to Google Cloud Run for scalable, serverless ML inference.

## 📋 Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud SDK** installed ([Download](https://cloud.google.com/sdk/docs/install))
3. **Docker** installed ([Download](https://www.docker.com/products/docker-desktop))
4. **Python 3.11+** (for local testing)

## 🛠️ Setup Steps

### Step 1: Configure Google Cloud

```bash
# Login to Google Cloud
gcloud auth login

# Set your project ID (replace with your actual project)
gcloud config set project your-gcp-project-id

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

### Step 2: Prepare Your Models

Your models are already in `ml_scripts/models/`. The deployment will copy them automatically:
- `CONCENTRATION_CURLS_RF.pkl`
- `LATERAL_PULLDOWN_RF.pkl`  
- `OVERHEAD_EXTENSIONS_RF.pkl`

### Step 3: Edit Configuration

Edit `deploy.ps1` and update:
```powershell
$ProjectId = "your-actual-gcp-project-id"  # 👈 Change this!
```

### Step 4: Deploy to Cloud Run

```powershell
# Navigate to the API directory
cd cloud-run-ml-api

# Run deployment (PowerShell)
.\deploy.ps1

# Or if using bash/Linux
chmod +x deploy.sh
./deploy.sh
```

### Step 5: Test Your Deployment

After deployment, test the API:

```bash
# Health check
curl https://your-service-url/

# List available models
curl https://your-service-url/models

# Test classification
curl -X POST https://your-service-url/classify \
  -H "Content-Type: application/json" \
  -d '{
    "exercise_type": "CONCENTRATION_CURLS",
    "features": {
      "mean_acceleration": 0.5,
      "max_velocity": 1.2,
      "range_of_motion": 90.0
    }
  }'
```

## 🔧 Local Development

### Run Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Copy models
cp ../ml_scripts/models/*.pkl ./models/

# Run the server
python main.py
```

API will be available at: `http://localhost:8080`

### Test Locally

```bash
# Health check
curl http://localhost:8080/

# Test classification
curl -X POST http://localhost:8080/classify \
  -H "Content-Type: application/json" \
  -d '{
    "exercise_type": "CONCENTRATION_CURLS",
    "features": {
      "mean_acceleration": 0.5,
      "max_velocity": 1.2
    }
  }'
```

## 🌐 Frontend Integration

### Update Your Next.js App

Create an API client in your Next.js app:

```javascript
// utils/mlApi.js
const ML_API_BASE_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8080';

export async function classifyExercise(exerciseType, features) {
  const response = await fetch(`${ML_API_BASE_URL}/classify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      exercise_type: exerciseType,
      features: features
    })
  });

  if (!response.ok) {
    throw new Error(`Classification failed: ${response.statusText}`);
  }

  return response.json();
}
```

### Environment Variables

Add to your `.env.local`:
```
NEXT_PUBLIC_ML_API_URL=https://your-cloud-run-service-url
```

## 💰 Cost Optimization

Cloud Run pricing is based on usage:
- **CPU**: ~$0.00002400 per vCPU-second
- **Memory**: ~$0.00000250 per GiB-second
- **Requests**: ~$0.40 per million requests

**Monthly cost estimate** (1000 classifications/day):
- ~$5-15/month for typical usage
- Scales to zero when not in use!

## 🔍 Monitoring & Logs

```bash
# View logs
gcloud logs tail workout-ml-classifier --project your-project-id

# Monitor metrics
gcloud run services describe workout-ml-classifier --region us-central1
```

## 🛡️ Security & Production

### For Production:

1. **Authentication**: Remove `--allow-unauthenticated` and implement Firebase Auth
2. **CORS**: Configure specific origins instead of `allow_origins=["*"]`
3. **Rate Limiting**: Add rate limiting middleware
4. **Monitoring**: Set up Cloud Monitoring alerts

### Example with Auth:

```python
# Add Firebase Auth verification
from firebase_admin import auth

async def verify_firebase_token(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(401, "Authorization header required")
    
    token = authorization.replace("Bearer ", "")
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception:
        raise HTTPException(401, "Invalid token")
```

## 🎯 Why This Approach is Better

✅ **Serverless**: No server management
✅ **Auto-scaling**: Handles traffic spikes  
✅ **Cost-effective**: Pay only for usage
✅ **Fast deployments**: ~2-3 minutes
✅ **Reliable**: Google's infrastructure
✅ **Version control**: Easy rollbacks
✅ **Monitoring**: Built-in observability

vs running models in your Next.js app:
❌ Large bundle size
❌ Cold start delays  
❌ Memory limitations
❌ CPU-intensive blocking

## 📞 Support

If you encounter issues:
1. Check Cloud Run logs
2. Verify your GCP project has billing enabled
3. Ensure all APIs are enabled
4. Test locally first