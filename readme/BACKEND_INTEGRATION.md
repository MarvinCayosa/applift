/**
 * Backend Integration Setup
 * Quick start guide for integrating the frontend with backend services
 */

# Backend Integration Guide

## Directory Structure

```
applift-pwa/
├── api/                          # API layer
│   ├── httpClient.js            # HTTP client with interceptors
│   ├── errorHandler.js          # Error handling utilities
│   └── index.js                 # API exports
├── services/                     # Business logic services
│   ├── authService.js           # Authentication
│   ├── workoutService.js        # Workout operations
│   ├── userService.js           # User profile/settings
│   └── index.js                 # Services exports
├── models/                       # Data models & schemas
│   ├── User.js                  # User model definition
│   ├── Workout.js               # Workout model definition
│   └── index.js                 # Models exports
├── config/                       # Configuration
│   └── api.js                   # API endpoints & config
├── .env.example                 # Environment template
└── pages/api/                   # Next.js API routes (optional)
```

## Setup Steps

### 1. Configure Environment Variables
```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local with your backend URL
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_API_TIMEOUT=30000
NEXT_PUBLIC_AUTH_ENABLED=true
```

### 2. Import Services in Components
```javascript
import { authService, workoutService, userService } from '@/api'

// Login
const result = await authService.login(email, password)

// Get workouts
const workouts = await workoutService.getWorkouts()

// Get user profile
const profile = await userService.getProfile()
```

### 3. Add Request/Response Interceptors
```javascript
import { httpClient } from '@/api'

// Add auth token to all requests
httpClient.addRequestInterceptor(async (config) => {
  const token = authService.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses
httpClient.addErrorInterceptor(async (error) => {
  if (error.status === 401) {
    // Refresh token or redirect to login
  }
  return error
})
```

### 4. Add Loading States & Error Handling
```javascript
import { useState } from 'react'
import { workoutService, getErrorMessage } from '@/api'

export default function WorkoutsPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [workouts, setWorkouts] = useState([])

  const fetchWorkouts = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await workoutService.getWorkouts()
      setWorkouts(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {loading && <div>Loading...</div>}
      {/* Display workouts */}
    </div>
  )
}
```

## API Endpoints Reference

### Authentication
- `POST /api/auth/login` - Login user
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh` - Refresh token
- `GET /api/auth/verify` - Verify token

### User
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile
- `GET /api/user/settings` - Get settings
- `PUT /api/user/settings` - Update settings

### Workouts
- `GET /api/workouts` - List workouts
- `POST /api/workouts` - Create workout
- `GET /api/workouts/:id` - Get single workout
- `PUT /api/workouts/:id` - Update workout
- `DELETE /api/workouts/:id` - Delete workout

### Exercises
- `GET /api/exercises` - List exercises
- `GET /api/exercises/:id` - Get exercise
- `GET /api/exercises/search` - Search exercises

### Equipment
- `GET /api/equipment` - List equipment
- `GET /api/equipment/:id` - Get equipment

### Devices
- `GET /api/devices` - List paired devices
- `POST /api/devices/pair` - Pair new device
- `DELETE /api/devices/:id` - Unpair device
- `GET /api/devices/:id` - Get device info

### History
- `GET /api/history` - Get workout history
- `POST /api/history` - Create history entry
- `GET /api/history/:id` - Get history entry

## HTTP Client Usage

### Basic Request
```javascript
import { httpClient } from '@/api'

const response = await httpClient.get('/api/workouts')
const data = response.data
```

### With Options
```javascript
const response = await httpClient.post('/api/workouts', 
  { exercise: 'Squats', weight: 100 },
  { 
    headers: { 'X-Custom': 'value' },
    timeout: 5000
  }
)
```

### Available Methods
- `httpClient.get(url, options)`
- `httpClient.post(url, data, options)`
- `httpClient.put(url, data, options)`
- `httpClient.patch(url, data, options)`
- `httpClient.delete(url, options)`
- `httpClient.request(method, url, options)`

## Error Handling

```javascript
import { getErrorMessage, ApiError } from '@/api'

try {
  await workoutService.deleteWorkout(id)
} catch (error) {
  if (error instanceof ApiError) {
    console.error('Status:', error.status)
    console.error('Message:', error.message)
    console.error('Data:', error.data)
  }
  
  // Get user-friendly message
  const message = getErrorMessage(error)
  console.error(message)
}
```

## Next Steps

1. **Implement Authentication Context** - Create auth context wrapper for app
2. **Add Loading States** - Use React Query or SWR for data fetching
3. **Implement API Routes** - Add proxy routes in `pages/api/` if needed
4. **Add Token Refresh** - Auto-refresh tokens on 401 responses
5. **Add Offline Support** - Cache responses for offline functionality
6. **Add Analytics** - Track API performance and errors
7. **Add Testing** - Unit tests for services and integration tests

## Backend Requirements

The backend should implement the following:

### Authentication
- JWT-based token authentication
- Refresh token rotation
- Password hashing (bcrypt)
- Rate limiting

### Data Validation
- Input validation on all endpoints
- CORS configuration
- Request size limits

### Error Responses
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": { "email": "Invalid email format" }
  }
}
```

### Success Responses
```json
{
  "success": true,
  "data": { /* response data */ }
}
```
