# AppLift Documentation Index

This folder contains all technical documentation for the AppLift PWA project.

## 📚 Core Documentation

### Getting Started
- **[SETUP.md](SETUP.md)** - Initial project setup and configuration
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Deployment instructions for Vercel and Cloud Run

### AI Features
- **[AI_DOCUMENTATION.txt](AI_DOCUMENTATION.txt)** - Complete AI implementation guide
  - Pre-workout recommendations (Vertex AI Gemini)
  - Post-workout insights
  - Real-time set feedback
  - Prompts, parameters, and system architecture

### Performance Metrics
- **[FINAL_METRICS_DOCUMENTATION.txt](FINAL_METRICS_DOCUMENTATION.txt)** - All metric calculations
  - Smoothness score (LDLJ algorithm)
  - Velocity metrics (peak velocity, MPV)
  - Movement phase timing (concentric/eccentric)
  - Range of Motion (ROM) calculation
  - Fatigue score
  - Consistency score
  - ML movement classification

## 🔧 Technical Guides

### Connectivity & Offline Support
- **[BLE_RECONNECTION.md](BLE_RECONNECTION.md)** - Bluetooth reconnection system
  - Automatic reconnection with exponential backoff
  - Data integrity preservation
  - Checkpoint/rollback mechanism
  - Rep counting strategy after disconnect

- **[OFFLINE_DETECTION.md](OFFLINE_DETECTION.md)** - Network offline detection
  - 0-2 second detection time
  - Triple-signal system
  - Localhost fix for development
  - Offline queue and sync

### Backend Integration
- **[BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md)** - Backend services integration
- **[GCS_SETUP_GUIDE.md](GCS_SETUP_GUIDE.md)** - Google Cloud Storage setup
- **[WORKOUT_LOGGING_PIPELINE.md](WORKOUT_LOGGING_PIPELINE.md)** - Workout data pipeline

### Workout System
- **[WORKOUT_MONITOR_GUIDE.md](WORKOUT_MONITOR_GUIDE.md)** - Workout monitor implementation
- **[ROM_CALCULATIONS.md](ROM_CALCULATIONS.md)** - Range of Motion calculations
- **[FATIGUE_VELOCITY_ANALYSIS.md](FATIGUE_VELOCITY_ANALYSIS.md)** - Fatigue and velocity analysis
- **[CALORIE_CALCULATION.md](CALORIE_CALCULATION.md)** - Calorie estimation algorithm
- **[WORKOUT_STREAK_INTEGRATION.md](WORKOUT_STREAK_INTEGRATION.md)** - Workout streak tracking

### Mobile & PWA
- **[IOS_PWA_GUIDE.md](IOS_PWA_GUIDE.md)** - iOS PWA installation and features
- **[PWA_NATIVE_MODE.md](PWA_NATIVE_MODE.md)** - PWA native mode configuration

## 📖 Quick Reference

### For Developers
1. Start with [SETUP.md](SETUP.md) for initial configuration
2. Read [AI_DOCUMENTATION.txt](AI_DOCUMENTATION.txt) for AI features
3. Check [BLE_RECONNECTION.md](BLE_RECONNECTION.md) and [OFFLINE_DETECTION.md](OFFLINE_DETECTION.md) for connectivity
4. Review [FINAL_METRICS_DOCUMENTATION.txt](FINAL_METRICS_DOCUMENTATION.txt) for metrics

### For Validators/Testers
1. [AI_DOCUMENTATION.txt](AI_DOCUMENTATION.txt) - Understand AI recommendations and insights
2. [FINAL_METRICS_DOCUMENTATION.txt](FINAL_METRICS_DOCUMENTATION.txt) - Understand all performance metrics
3. [BLE_RECONNECTION.md](BLE_RECONNECTION.md) - Test BLE reconnection scenarios
4. [OFFLINE_DETECTION.md](OFFLINE_DETECTION.md) - Test offline functionality

### For Deployment
1. [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Main deployment guide
2. [GCS_SETUP_GUIDE.md](GCS_SETUP_GUIDE.md) - Cloud Storage setup
3. [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md) - Backend services

## 🔗 External Documentation

- **Main README**: See [../README.md](../README.md) for project overview
- **ML API**: See [../cloud-run-ml-api/README.md](../cloud-run-ml-api/README.md) for ML service
- **ML Scripts**: See [../ml_scripts/scripts/README.md](../ml_scripts/scripts/README.md) for training scripts

## 📝 Documentation Standards

All documentation follows these principles:
- **Clear structure**: Table of contents, sections, subsections
- **Code examples**: Practical examples with explanations
- **Testing guides**: Step-by-step testing scenarios
- **Console logs**: Expected output for debugging
- **Architecture diagrams**: Visual representation of systems
- **Performance metrics**: Before/after comparisons

## 🗂️ File Organization

```
readme/
├── INDEX.md (this file)
├── AI_DOCUMENTATION.txt
├── FINAL_METRICS_DOCUMENTATION.txt
├── BLE_RECONNECTION.md
├── OFFLINE_DETECTION.md
├── SETUP.md
├── DEPLOYMENT_GUIDE.md
├── GCS_SETUP_GUIDE.md
├── BACKEND_INTEGRATION.md
├── WORKOUT_LOGGING_PIPELINE.md
├── WORKOUT_MONITOR_GUIDE.md
├── ROM_CALCULATIONS.md
├── FATIGUE_VELOCITY_ANALYSIS.md
├── CALORIE_CALCULATION.md
├── WORKOUT_STREAK_INTEGRATION.md
├── IOS_PWA_GUIDE.md
└── PWA_NATIVE_MODE.md
```

## 🔄 Last Updated

This documentation index was last updated: March 27, 2026

For questions or updates, please contact the development team.
