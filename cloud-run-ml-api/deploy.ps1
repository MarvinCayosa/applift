# Cloud Run ML API Deployment Script (PowerShell)
# This script builds and deploys the ML classification service to Google Cloud Run

param(
    [string]$ServiceName = "workout-ml-classifier", 
    [string]$Region = "asia-southeast1"
)

# Function to read .env file
function Read-EnvFile {
    param([string]$EnvPath)
    
    $envVars = @{}
    if (Test-Path $EnvPath) {
        Get-Content $EnvPath | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.*)$') {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                $value = $value -replace '^["'']|["'']$', ''
                $envVars[$key] = $value
            }
        }
    }
    return $envVars
}

# Read .env file from parent directory
$EnvPath = Join-Path $PSScriptRoot "../.env"
$EnvVars = Read-EnvFile -EnvPath $EnvPath

# Get project ID from .env file
$ProjectId = $EnvVars["GCS_PROJECT_ID"]
if (-not $ProjectId) { $ProjectId = $EnvVars["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] }
if (-not $ProjectId) { $ProjectId = $EnvVars["FIREBASE_PROJECT_ID"] }
if (-not $ProjectId) {
    Write-Error "No project ID found in .env file. Add GCS_PROJECT_ID to your .env"
    exit 1
}

$ImageName = "gcr.io/$ProjectId/$ServiceName"

Write-Host "Deploying ML Classification API to Cloud Run..." -ForegroundColor Green
Write-Host "Project: $ProjectId" -ForegroundColor Yellow
Write-Host "Service: $ServiceName" -ForegroundColor Yellow
Write-Host "Region: $Region" -ForegroundColor Yellow

# Step 1: Copy ML models
Write-Host "[1/6] Copying ML models..." -ForegroundColor Blue
Copy-Item (Join-Path $PSScriptRoot "../ml_scripts/models/*.pkl") (Join-Path $PSScriptRoot "models/") -Force

# Step 2: Build the container image using Cloud Build
Write-Host "[2/6] Building Docker image via Cloud Build..." -ForegroundColor Blue
gcloud builds submit --tag $ImageName --project $ProjectId
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker build failed. Check the output above."
    exit 1
}

# Step 3: Deploy to Cloud Run
Write-Host "[3/6] Deploying to Cloud Run..." -ForegroundColor Blue
gcloud run deploy $ServiceName `
    --image $ImageName `
    --platform managed `
    --region $Region `
    --allow-unauthenticated `
    --memory 2Gi `
    --cpu 2 `
    --max-instances 10 `
    --timeout 300 `
    --project $ProjectId

if ($LASTEXITCODE -ne 0) {
    Write-Error "Cloud Run deployment failed. Check the output above."
    exit 1
}

# Step 4: Get the service URL
Write-Host "[4/6] Getting service URL..." -ForegroundColor Blue
$ServiceUrl = gcloud run services describe $ServiceName --platform managed --region $Region --format "value(status.url)" --project $ProjectId
Write-Host "Service URL: $ServiceUrl" -ForegroundColor Cyan

# Step 5: Update .env file with the service URL
Write-Host "[5/6] Updating .env file..." -ForegroundColor Blue
$EnvFilePath = Join-Path $PSScriptRoot "../.env"
$EnvContent = Get-Content $EnvFilePath -Raw
if ($EnvContent -match "NEXT_PUBLIC_ML_API_URL=.*") {
    $EnvContent = $EnvContent -replace "NEXT_PUBLIC_ML_API_URL=.*", "NEXT_PUBLIC_ML_API_URL=$ServiceUrl"
} else {
    $EnvContent += "`nNEXT_PUBLIC_ML_API_URL=$ServiceUrl"
}
Set-Content $EnvFilePath -Value $EnvContent -NoNewline
Write-Host ".env file updated with ML API URL" -ForegroundColor Green

# Step 6: Test the deployment
Write-Host "[6/6] Testing the deployment..." -ForegroundColor Blue
try {
    $Response = Invoke-RestMethod -Uri "$ServiceUrl/" -Method Get
    Write-Host "Health check passed! Status: $($Response.status)" -ForegroundColor Green
} catch {
    Write-Warning "Health check failed - the service may still be starting up. Try again in a minute."
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deployment successful!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Service URL: $ServiceUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Your .env file has been updated with the service URL"
Write-Host "  2. Add NEXT_PUBLIC_ML_API_URL=$ServiceUrl to Vercel env vars"
Write-Host "  3. Test: curl $ServiceUrl/models"
Write-Host "  4. Monitor: gcloud logs tail $ServiceName --project $ProjectId"
