#!/bin/bash

# Cloud Run ML API Deployment Script
# This script builds and deploys the ML classification service to Google Cloud Run

set -e

# Configuration
PROJECT_ID="your-gcp-project-id"
SERVICE_NAME="workout-ml-classifier"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying ML Classification API to Cloud Run..."
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME}"
echo "Region: ${REGION}"

# Step 1: Copy ML models
echo "📁 Copying ML models..."
cp ../ml_scripts/models/*.pkl ./models/

# Step 2: Build the container image
echo "🐳 Building Docker image..."
gcloud builds submit --tag ${IMAGE_NAME} --project ${PROJECT_ID}

# Step 3: Deploy to Cloud Run
echo "☁️ Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --platform managed \
    --region ${REGION} \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 10 \
    --timeout 300 \
    --project ${PROJECT_ID}

# Step 4: Get the service URL
echo "✅ Deployment complete!"
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)' --project ${PROJECT_ID})
echo "🔗 Service URL: ${SERVICE_URL}"

# Step 5: Test the deployment
echo "🧪 Testing the deployment..."
curl "${SERVICE_URL}/" || echo "⚠️ Health check failed - check logs"

echo ""
echo "🎉 Deployment successful!"
echo "📋 Next steps:"
echo "1. Update your Next.js app to use: ${SERVICE_URL}"
echo "2. Test the /classify endpoint"
echo "3. Monitor logs: gcloud logs tail ${SERVICE_NAME} --project ${PROJECT_ID}"