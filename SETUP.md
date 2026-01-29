# Quick Setup & Cleanup Script

## Immediate Actions Required

### 1. Install Dependencies
```powershell
npm install firebase-admin
```

### 2. Delete Old API Folder (Not needed for Next.js)
```powershell
Remove-Item -Recurse -Force "c:\Users\Marvin\Documents\School\DesPro Finals\applift-pwa-deploy\api"
```

### 3. Update Environment Variables
Edit `.env.local` with your Firebase credentials from Firebase Console:
- Project Settings > General > Your apps
- Project Settings > Service Accounts > Generate new private key

### 4. Test Locally
```powershell
npm run dev
```
Visit http://localhost:3000 and test:
- [ ] Signup with email
- [ ] Login with email  
- [ ] Google OAuth signup
- [ ] Google OAuth login

### 5. Deploy to Vercel
```powershell
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Add environment variables (do this for each variable)
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add FIREBASE_CLIENT_EMAIL
vercel env add FIREBASE_PRIVATE_KEY
# ... etc

# Deploy to production
vercel --prod
```

### 6. Configure Firebase
1. Go to Firebase Console > Authentication > Settings
2. Add Authorized Domains:
   - Your Vercel deployment URL (e.g., your-app.vercel.app)
   - localhost (for development)

## File Changes Summary

### ✅ Files Created
- `context/AuthContext.js` - Authentication context
- `lib/firebase-admin.js` - Server-side Firebase
- `components/ProtectedRoute.js` - Route protection
- `components/GoogleSignInButton.js` - Google OAuth button
- `components/AuthErrorAlert.js` - Error display
- `vercel.json` - Deployment config
- `DEPLOYMENT_GUIDE.md` - Complete deployment docs
- `README_NEW.md` - Updated README
- `.env.example` - Environment template
- `SETUP.md` - This file

### 🔄 Files Updated
- `pages/_app.js` - Added AuthProvider
- `pages/login.js` - Complete rewrite with new auth
- `pages/signup.js` - Google OAuth support
- `pages/api/auth.js` - Secure signup with validation
- `pages/api/google-auth.js` - OAuth handler
- `package.json` - Added firebase-admin

### ❌ Files to Delete
- `/api/` folder (duplicate, use `/pages/api/` instead)

## Architecture Overview

```
User Request
    ↓
AuthContext (Frontend)
    ↓
Protected Route Check
    ↓
Page Component
    ↓
API Route (if needed)
    ↓
Firebase Admin SDK (Server)
    ↓
Firestore Database
```

## Authentication States

### Not Authenticated
- Can access: `/`, `/login`, `/signup`, `/splash`
- Redirected from: `/dashboard`, `/profile`, `/workouts`, etc.

### Authenticated but Onboarding Incomplete
- Redirected to: `/signup?step=3`
- Must complete profile before accessing app

### Authenticated with Complete Onboarding
- Can access: All protected routes
- Redirected from: `/login`, `/signup`

## Google OAuth Special Handling

### New Google User Flow:
```
Google Sign-in 
→ Backend creates profile (onboardingCompleted: false)
→ Redirect to /signup?step=3&provider=google
→ Skip email/password (already authenticated)
→ Fill personal details (steps 3-5)
→ Complete onboarding
→ Redirect to /dashboard
```

### Existing Google User Flow:
```
Google Sign-in
→ Backend finds existing profile
→ Check onboardingCompleted
→ If true: /dashboard
→ If false: /signup?step=3&provider=google
```

## Security Checklist

- ✅ Password requirements: 8+ chars, uppercase, number, symbol
- ✅ Rate limiting: 10 requests/minute per IP
- ✅ Input sanitization: Email, username, profile fields
- ✅ Secure headers: X-Content-Type-Options, X-Frame-Options
- ✅ Error messages: User-friendly, no sensitive data
- ✅ Firebase Admin SDK: Server-side operations only
- ✅ Environment variables: Properly separated (public vs secret)
- ✅ Route protection: Automatic redirects

## Testing Commands

```powershell
# Install dependencies
npm install

# Run development server
npm run dev

# Build production
npm run build

# Run production locally
npm start

# Lint code
npm run lint
```

## Vercel Environment Variables to Set

Run these commands after `vercel login`:

```powershell
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production
vercel env add NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID production
vercel env add FIREBASE_CLIENT_EMAIL production
vercel env add FIREBASE_PRIVATE_KEY production
```

## Common Issues & Fixes

### Issue: "Firebase Admin not initialized"
**Fix:** Check FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in environment variables

### Issue: "Auth domain not authorized"
**Fix:** Add your domain to Firebase Console > Authentication > Settings > Authorized domains

### Issue: "Google sign-in popup blocked"
**Fix:** Allow popups in browser settings for your domain

### Issue: "Module not found: firebase-admin"
**Fix:** Run `npm install firebase-admin`

### Issue: "Rate limit exceeded"
**Fix:** Wait 1 minute and try again, or adjust rate limits in `/pages/api/auth.js`

## Next Steps After Deployment

1. **Test Everything**
   - Sign up with email
   - Login with email
   - Google OAuth signup
   - Google OAuth login
   - Protected routes
   - Logout
   - Error scenarios

2. **Monitor**
   - Check Vercel Analytics
   - Review Firebase Console for new users
   - Watch for errors in Vercel logs

3. **Optimize**
   - Enable Vercel Analytics
   - Set up error tracking (optional: Sentry)
   - Configure custom domain (optional)

## Support & Documentation

- **Full Deployment Guide:** `DEPLOYMENT_GUIDE.md`
- **Updated README:** `README_NEW.md`
- **Firebase Docs:** https://firebase.google.com/docs
- **Next.js Docs:** https://nextjs.org/docs
- **Vercel Docs:** https://vercel.com/docs

---

**Ready to deploy? Follow the steps above in order!** 🚀
