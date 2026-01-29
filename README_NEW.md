# AppLift PWA - Authentication & Deployment

A progressive web application for workout tracking with secure authentication and Google OAuth support.

## ✨ Features

- 🔐 Secure email/password authentication
- 🌐 Google OAuth sign-in
- 👤 User profile management & onboarding
- 🛡️ Protected routes
- 📱 Progressive Web App (PWA)
- 🚀 Optimized for Vercel deployment

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Firebase project
- Vercel account (for deployment)

### Installation

1. **Clone and install dependencies:**
```bash
npm install
```

2. **Set up environment variables:**
```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local and add your Firebase credentials
```

3. **Configure Firebase:**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project or select existing
   - Enable Email/Password authentication
   - Enable Google authentication
   - Download service account key (Project Settings > Service Accounts)
   - Add credentials to `.env.local`

4. **Run development server:**
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 📦 Project Structure

```
applift-pwa-deploy/
├── components/          # React components
│   ├── AuthErrorAlert.js
│   ├── GoogleSignInButton.js
│   ├── ProtectedRoute.js
│   └── ...
├── config/             # Configuration
│   ├── firebase.js
│   └── firestore.js
├── context/            # React contexts
│   └── AuthContext.js  # Auth state management
├── lib/                # Utility libraries
│   └── firebase-admin.js
├── pages/
│   ├── api/           # API routes
│   │   ├── auth.js
│   │   └── google-auth.js
│   ├── login.js
│   ├── signup.js
│   ├── dashboard.js
│   └── ...
├── services/          # Business logic
├── utils/             # Utilities
└── public/            # Static assets
```

## 🔐 Authentication Flow

### Email Signup
1. User fills signup form
2. Password validation (8+ chars, uppercase, number, symbol)
3. Account created in Firebase Auth
4. Profile stored in Firestore
5. User completes onboarding
6. Redirect to dashboard

### Google OAuth
**New Users:**
1. Click "Sign in with Google"
2. Google authentication
3. Profile created with `onboardingCompleted: false`
4. Redirect to onboarding (skip credential step)
5. Complete profile details
6. Redirect to dashboard

**Existing Users:**
1. Click "Sign in with Google"
2. Google authentication
3. Redirect to dashboard

### Login
1. User enters email/password
2. Firebase authentication
3. Check onboarding status
4. Redirect to dashboard or onboarding

## 🛡️ Security Features

- ✅ Rate limiting (10 requests/minute)
- ✅ Input validation & sanitization
- ✅ Password strength requirements
- ✅ Secure HTTP headers
- ✅ Firebase Admin SDK for server-side operations
- ✅ No sensitive data exposure in errors
- ✅ Protected routes with automatic redirects

## 🚀 Deployment to Vercel

### Option 1: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# ... add all environment variables

# Deploy to production
vercel --prod
```

### Option 2: Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Import your Git repository
3. Add environment variables in project settings
4. Deploy

### Post-Deployment

1. **Add Vercel domain to Firebase:**
   - Firebase Console > Authentication > Settings
   - Add your Vercel domain to authorized domains

2. **Test the deployment:**
   - Sign up with email
   - Login with email
   - Sign in with Google
   - Test protected routes

## 📝 Environment Variables

Required environment variables (see `.env.example`):

### Public (Frontend)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

### Secret (Server-side only)
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

## 🧪 Testing

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### Manual Testing Checklist

- [ ] Email signup works
- [ ] Email login works
- [ ] Google signup (new user) → onboarding
- [ ] Google login (existing user) → dashboard
- [ ] Invalid credentials show error
- [ ] Password validation enforced
- [ ] Protected routes redirect properly
- [ ] Error messages are user-friendly
- [ ] Logout works correctly
- [ ] Rate limiting prevents spam

## 📚 API Routes

### POST /api/auth
Create new user or update profile
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "username": "John Doe",
  // ... other profile fields
}
```

### POST /api/google-auth
Handle Google OAuth authentication
```json
{
  "idToken": "google_id_token_here"
}
```

## 🔧 Configuration Files

- `vercel.json` - Vercel deployment configuration
- `next.config.js` - Next.js configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `jsconfig.json` - JavaScript configuration

## 📱 PWA Features

- Offline support
- Install prompt
- Service worker
- App-like experience on mobile

## 🐛 Troubleshooting

### Firebase Auth Errors
- Check Firebase Console > Authentication is enabled
- Verify API key in environment variables
- Check authorized domains include your domain

### Google OAuth Issues
- Verify Google Auth is enabled in Firebase
- Check OAuth consent screen is configured
- Verify redirect URIs are whitelisted

### Deployment Issues
- Check Vercel build logs
- Verify all environment variables are set
- Check Node version compatibility

## 📄 License

Proprietary - DesPro Finals Project

## 👥 Contributors

- Marvin (Developer)

## 📞 Support

For issues or questions, please refer to `DEPLOYMENT_GUIDE.md` for detailed documentation.

---

Built with ❤️ using Next.js, Firebase, and Tailwind CSS
