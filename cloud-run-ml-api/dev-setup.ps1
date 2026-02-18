# Local Development Setup Script
# Run this to set up and test the ML API locally

Write-Host "🚀 Setting up ML Classification API for local development..." -ForegroundColor Green

# Step 1: Check Python installation
try {
    $PythonVersion = python --version 2>&1
    Write-Host "✅ Python found: $PythonVersion" -ForegroundColor Green
} catch {
    Write-Error "❌ Python not found. Please install Python 3.11+"
    exit 1
}

# Step 2: Create virtual environment
Write-Host "📦 Creating virtual environment..." -ForegroundColor Blue
if (Test-Path "venv") {
    Write-Host "Virtual environment already exists, activating..." -ForegroundColor Yellow
} else {
    python -m venv venv
    Write-Host "✅ Virtual environment created" -ForegroundColor Green
}

# Activate virtual environment
Write-Host "🔄 Activating virtual environment..." -ForegroundColor Blue
& ".\venv\Scripts\Activate.ps1"

# Verify activation by using the virtual environment's python and pip directly
$venvPython = ".\venv\Scripts\python.exe"
$venvPip = ".\venv\Scripts\pip.exe"

# Step 3: Install dependencies
Write-Host "📚 Installing dependencies..." -ForegroundColor Blue
& ".\venv\Scripts\pip.exe" install --upgrade pip
& ".\venv\Scripts\pip.exe" install -r requirements.txt

Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green

# Step 4: Copy models
Write-Host "🧠 Copying ML models..." -ForegroundColor Blue
if (Test-Path "../ml_scripts/models") {
    Copy-Item "../ml_scripts/models/*.pkl" "./models/" -Force -ErrorAction SilentlyContinue
    Write-Host "✅ Models copied successfully" -ForegroundColor Green
} else {
    Write-Warning "⚠️ Models directory not found at ../ml_scripts/models"
    Write-Host "Please ensure your models are in the correct location" -ForegroundColor Yellow
}

# Step 5: Start the server
Write-Host "🚀 Starting development server..." -ForegroundColor Green
Write-Host "API will be available at: http://localhost:8080" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Use the virtual environment's Python
& ".\venv\Scripts\python.exe" main.py