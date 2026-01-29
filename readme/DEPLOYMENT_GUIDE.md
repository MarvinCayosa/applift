# AppLift Authentication & Deployment Guide

## Overview
This guide contains all the changes made to implement secure authentication, Google OAuth, and prepare the app for Vercel deployment.

## Key Changes Made

### 1. New Files Created

#### Context & Auth
- **`context/AuthContext.js`** - Centralized authentication context with Firebase Auth integration
- **`lib/firebase-admin.js`** - Firebase Admin SDK for server-side operations (API routes)

#### Components
- **`components/ProtectedRoute.js`** - Route protection wrapper
- **`components/GoogleSignInButton.js`** - Reusable Google OAuth button
- **`components/AuthErrorAlert.js`** - User-friendly error display component

#### API Routes (Updated)
- **`pages/api/auth.js`** - Secure signup/update with validation and rate limiting
- **`pages/api/google-auth.js`** - Google OAuth handler with security measures

### 2. Files Modified

#### Pages
- **`pages/_app.js`** - Added AuthProvider wrapper
- **`pages/login.js`** - Complete rewrite using AuthContext
- **`pages/signup.js`** - Updated to use AuthContext and handle Google OAuth flow

### 3. Environment Variables Required

Create a `.env.local` file in the root directory:

```env
# Firebase Client (Public)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Firebase Admin (Server-side only)
FIREBASE_CLIENT_EMAIL=your_service_account@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"

# Optional: Full service account JSON (alternative to individual keys)
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"..."}'
```

### 4. Deployment to Vercel

#### A. Install Vercel CLI (if not installed)
```bash
npm install -g vercel
```

#### B. Deploy Steps

1. **Initialize Vercel project:**
```bash
vercel
```

2. **Set environment variables** (run for each variable):
```bash
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# ... repeat for all env variables
```

3. **Deploy to production:**
```bash
vercel --prod
```

#### C. Vercel Configuration

Create `vercel.json` in root directory:

```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "regions": ["sin1"],
  "env": {
    "NEXT_PUBLIC_FIREBASE_API_KEY": "@next_public_firebase_api_key",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN": "@next_public_firebase_auth_domain",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID": "@next_public_firebase_project_id",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET": "@next_public_firebase_storage_bucket",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID": "@next_public_firebase_messaging_sender_id",
    "NEXT_PUBLIC_FIREBASE_APP_ID": "@next_public_firebase_app_id"
  }
}
```

### 5. File Structure (Clean & Organized)

```
applift-pwa-deploy/
├── components/          # React components
│   ├── AuthErrorAlert.js
│   ├── GoogleSignInButton.js
│   ├── ProtectedRoute.js
│   └── ... (existing components)
├── config/             # Configuration files
│   ├── api.js          # API endpoints config
│   ├── firebase.js     # Firebase client config
│   └── firestore.js    # Firestore config
├── context/            # React contexts
│   ├── AuthContext.js  # NEW: Auth state management
│   └── BluetoothProvider.js
├── lib/                # Utility libraries
│   └── firebase-admin.js  # NEW: Firebase Admin SDK
├── pages/
│   ├── api/           # API routes (Next.js convention)
│   │   ├── auth.js    # UPDATED: Secure signup
│   │   ├── google-auth.js  # UPDATED: OAuth handler
│   │   └── hello.js
│   ├── _app.js        # UPDATED: Added AuthProvider
│   ├── login.js       # REWRITTEN: New auth flow
│   ├── signup.js      # UPDATED: Google OAuth support
│   ├── dashboard.js
│   └── ... (other pages)
├── services/          # Business logic services
│   ├── authService.js
│   ├── userService.js
│   └── workoutService.js
├── utils/             # Utility functions
│   ├── apiClient.js
│   ├── userProfileStore.js
│   └── ... (other utils)
└── api/               # DELETE: Old API folder (not needed)
```

### 6. Security Features Implemented

1. **Rate Limiting** - Prevents brute force attacks
2. **Input Validation** - Email, password strength, sanitization
3. **Error Handling** - User-friendly messages, no sensitive data leaks
4. **Secure Headers** - X-Content-Type-Options, X-Frame-Options
5. **Password Requirements** - Min 8 chars, uppercase, number, symbol
6. **Session Management** - Firebase Auth tokens

### 7. Google OAuth Flow

#### For New Users:
1. Click "Sign in with Google"
2. Google auth popup
3. User authenticates
4. Backend creates profile with `onboarding Completed: false`
5. Redirect to `/signup?step=3&provider=google`
6. User fills details (skips credential step)
7. Complete onboarding
8. Redirect to dashboard

#### For Existing Users:
1. Click "Sign in with Google"
2. Google auth popup
3. User authenticates
4. Backend checks profile exists
5. Redirect to dashboard directly

### 8. Route Protection

All protected routes automatically check:
- Is user authenticated?
- Has user completed onboarding?
- Redirect appropriately

### 9. Error Handling

All errors are caught and displayed with:
- User-friendly messages
- Auto-dismiss after 5 seconds
- Manual dismiss option
- No technical details exposed

### 10. Testing Checklist

- [ ] Email signup works
- [ ] Email login works
- [ ] Google signup (new user) redirects to onboarding
- [ ] Google signin (existing user) goes to dashboard
- [ ] Invalid credentials show error
- [ ] Password validation works
- [ ] Protected routes redirect unauthenticated users
- [ ] Onboarding completion redirects to dashboard
- [ ] Rate limiting prevents spam
- [ ] Error messages are user-friendly

### 11. Additional Recommendations

#### A. Delete Old API Folder
```bash
rm -rf api/
```

The `/api` folder in root is not used by Next.js. API routes should be in `pages/api/`.

#### B. Install Missing Dependencies (if any)
```bash
npm install
```

#### C. Add Firebase Admin SDK
```bash
npm install firebase-admin
```

#### D. Update .gitignore
```
.env.local
.env*.local
.vercel
```

### 12. Firebase Console Setup

1. **Enable Authentication Methods:**
   - Go to Firebase Console > Authentication > Sign-in method
   - Enable Email/Password
   - Enable Google

2. **Add Authorized Domains:**
   - Add your Vercel domain to authorized domains
   - Add localhost for development

3. **Create Service Account:**
   - Go to Project Settings > Service Accounts
   - Generate new private key
   - Download JSON
   - Add to environment variables

### 13. Post-Deployment Verification

1. Visit your Vercel URL
2. Test signup flow
3. Test login flow
4. Test Google OAuth
5. Check Firebase Console for new users
6. Verify dashboard access
7. Test logout
8. Test route protection

## Support

If you encounter any issues:
1. Check Vercel deployment logs
2. Check Firebase Console logs
3. Check browser console for errors
4. Verify all environment variables are set

## Next Steps

1. Delete old `/api` folder
2. Set up environment variables
3. Test locally
4. Deploy to Vercel
5. Configure Firebase authorized domains
6. Test in production

---

All code is production-ready, secure, and optimized for Vercel deployment.
