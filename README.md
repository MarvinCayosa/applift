# AppLift PWA - Fitness Tracking Application

A progressive web application for workout tracking with Bluetooth IMU sensors, AI-powered recommendations, and real-time movement quality analysis.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Firebase project
- Google Cloud Platform account (for Vertex AI)
- Vercel account (for deployment)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📦 Project Structure

```
applift-pwa/
├── components/          # React components
├── config/             # Firebase & Firestore configuration
├── context/            # React contexts (Auth, Bluetooth, WorkoutLogging)
├── hooks/              # Custom React hooks
├── pages/              # Next.js pages and API routes
├── services/           # Business logic services
├── utils/              # Utility functions
├── cloud-run-ml-api/   # ML classification API (Python/Flask)
└── public/             # Static assets
```

## ✨ Key Features

### 🔐 Authentication
- Email/password authentication
- Google OAuth sign-in
- Protected routes with automatic redirects
- User profile management & onboarding

### 📱 Workout Tracking
- Real-time BLE sensor data streaming
- Automatic rep detection and counting
- Movement quality analysis (smoothness, velocity, ROM)
- ML-powered movement classification
- Offline support with automatic sync

### 🤖 AI Features (Vertex AI Gemini 2.5 Flash)

#### 1. Pre-Workout Recommendations
- Personalized weight, sets, and reps recommendations
- Based on workout history, recovery time, and performance metrics
- Considers injuries, experience level, and goals
- Cached in Firestore with smart invalidation

#### 2. Post-Workout Insights
- Performance summary paragraph
- 3-5 specific improvement tips
- Based on execution quality, fatigue, and consistency metrics

#### 3. Real-Time Set Feedback
- Coach-style feedback after each set
- Analyzes form quality, velocity loss, ROM consistency
- Actionable tips for next set

### 📊 Performance Metrics

#### Movement Quality Metrics
- **Smoothness Score** (0-100): LDLJ-inspired jerk analysis
- **Peak Velocity**: Maximum movement speed (m/s)
- **Mean Propulsive Velocity (MPV)**: Average speed during propulsive phase
- **Range of Motion (ROM)**: Angle-based (dumbbells) or stroke-based (barbells)
- **Phase Timing**: Concentric/eccentric duration analysis

#### Aggregate Metrics
- **Fatigue Score** (0-100): Composite of velocity drop, duration increase, jerk, and ML quality
- **Consistency Score** (0-100): CV-based analysis of ROM, smoothness, duration, and acceleration
- **ML Classification**: Clean, Abrupt Initiation, or Uncontrolled Movement

## 🔧 Configuration

### Environment Variables

#### Firebase (Frontend)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

#### Firebase Admin (Backend)
```env
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

#### Vertex AI
```env
VERTEX_AI_PROJECT_ID=
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_CLIENT_EMAIL=
VERTEX_AI_PRIVATE_KEY=
VERTEX_AI_MODEL=gemini-2.5-flash
```

#### Google Cloud Storage
```env
GCS_PROJECT_ID=
GCS_CLIENT_EMAIL=
GCS_PRIVATE_KEY=
GCS_BUCKET_NAME=
```

## 🛠️ Development

### Running Locally
```bash
npm run dev
```

### Building for Production
```bash
npm run build
npm start
```

### ML API Development
```bash
cd cloud-run-ml-api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

## 🚀 Deployment

### Vercel (Frontend)
```bash
vercel login
vercel
vercel --prod
```

### Cloud Run (ML API)
```bash
cd cloud-run-ml-api
gcloud run deploy applift-ml-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

## 📡 BLE Connection & Offline Handling

### BLE Reconnection System
- **Instant disconnect detection** via `gattserverdisconnected` events
- **Automatic reconnection** with exponential backoff (1s, 2s, 4s, 8s, 10s)
- **Connection timeout**: 15 seconds per attempt
- **Max attempts**: 5 automatic retries
- **Manual override**: User can reconnect anytime
- **Data integrity**: Partial reps deleted, resumes from last completed rep

### Offline Network Detection
- **Detection time**: 0-2 seconds (instant)
- **Triple-signal system**: Browser events, fetch failures, active probe
- **Localhost fix**: Checks `navigator.onLine` before probing
- **Automatic sync**: Queued operations flush when connection restored

### Rep Counting After Reconnect
- **Checkpoint system**: Saves after every completed rep
- **Rollback mechanism**: Deletes partial rep data on disconnect
- **Data quality**: Ensures all reps have complete IMU data for ML classification
- **User communication**: Shows current progress and explains why partial reps are discarded

## 🧪 Testing

### Manual Testing Checklist

#### Offline Detection
- [ ] Disconnect WiFi during workout
- [ ] OfflineBanner appears within 0-2 seconds
- [ ] Reconnect WiFi
- [ ] Banner disappears, toast shows "Connection restored"

#### BLE Auto-Reconnect
- [ ] Start workout, begin recording
- [ ] Turn off BLE device
- [ ] Modal appears instantly with auto-reconnect
- [ ] Turn on BLE device
- [ ] Reconnects within 1-2 seconds
- [ ] Countdown shows, workout resumes

#### Rep Counting After Reconnect
- [ ] Complete rep 5
- [ ] Start rep 6 (50% complete)
- [ ] Turn off BLE device
- [ ] Modal shows: "5 / 8 reps completed"
- [ ] Turn on device, reconnects
- [ ] Resume from rep 5 (partial rep 6 deleted)

## 📚 Documentation

### Core Documentation
- **AI Features**: See `AI_DOCUMENTATION.txt` for detailed AI implementation
- **Metrics**: See `FINAL_METRICS_DOCUMENTATION.txt` for all metric calculations
- **Codebase**: See `CODEBASE_ANALYSIS.md` for architecture overview

### Implementation Details
- **BLE Reconnection**: See `readme/BLE_RECONNECTION.md`
- **Offline Detection**: See `readme/OFFLINE_DETECTION.md`
- **ML Classification**: See `cloud-run-ml-api/README.md`

## 🏗️ Architecture

### Data Flow
```
IMU Sensor (20Hz)
    ↓
Bluetooth LE
    ↓
PWA (Real-time Processing)
    ├─ Rep Detection
    ├─ Local Metrics (smoothness, velocity, ROM)
    └─ GCS Streaming
    ↓
Cloud Run ML API
    ├─ Movement Classification
    ├─ Fatigue Analysis
    └─ Consistency Scoring
    ↓
Firestore (Workout Logs)
    ↓
Dashboard & Analytics
```

### State Management
- **AuthContext**: User authentication state
- **BluetoothProvider**: BLE connection management
- **WorkoutLoggingContext**: Workout session state and GCS streaming
- **useWorkoutSession**: Real-time workout algorithm (rep detection, metrics)

### API Routes
- `/api/auth` - User authentication
- `/api/google-auth` - Google OAuth
- `/api/ai-recommendation` - Pre-workout AI recommendations
- `/api/ai-insights` - Post-workout AI insights
- `/api/set-feedback` - Real-time set feedback
- `/api/imu-stream` - GCS upload/download for IMU data

## 🔒 Security

- Firebase JWT token verification on all API routes
- Rate limiting (10-20 requests/min per user)
- Input validation & sanitization
- Secure HTTP headers
- No sensitive data in error messages
- Service account credentials for server-side operations

## 📄 License

Proprietary - DesPro Finals Project

## 👥 Contributors

- Marvin (Developer)

---

Built with ❤️ using Next.js, Firebase, Vertex AI, and Tailwind CSS
