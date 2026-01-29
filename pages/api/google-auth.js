/**
 * API Route: /api/google-auth
 * Handles Google OAuth authentication
 * 
 * POST - Verify Google ID token and create/update user
 */

import { getAuth, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../../config/firebase';
import { db } from '../../config/firestore';

const auth = getAuth(app);

// Rate limiting - simple in-memory store
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 15;

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, timestamp: now });
    return true;
  }
  
  if (record.count >= MAX_REQUESTS) {
    return false;
  }
  
  record.count++;
  return true;
}

export default async function handler(req, res) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get client IP for rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
             req.headers['x-real-ip'] || 
             req.socket?.remoteAddress || 
             'unknown';
  
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  const { idToken } = req.body;
  
  if (!idToken) {
    return res.status(400).json({ 
      error: 'Google ID token is required',
      code: 'MISSING_TOKEN'
    });
  }

  // Basic token validation (should be a long string)
  if (typeof idToken !== 'string' || idToken.length < 100) {
    return res.status(400).json({ 
      error: 'Invalid token format',
      code: 'INVALID_TOKEN_FORMAT'
    });
  }

  try {
    // Create credential from ID token
    const credential = GoogleAuthProvider.credential(idToken);
    
    // Verify and sign in with the credential
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;

    // Check if user profile exists in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // New user - create profile with onboarding not completed
      const newProfile = {
        email: user.email?.toLowerCase() || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        provider: 'google',
        onboardingCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      await setDoc(userRef, newProfile);
      
      return res.status(200).json({ 
        uid: user.uid,
        newUser: true,
        onboardingCompleted: false,
        message: 'New user created. Please complete onboarding.'
      });
    }

    // Existing user - update last login
    const existingProfile = userDoc.data();
    await updateDoc(userRef, {
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return res.status(200).json({ 
      uid: user.uid,
      newUser: false,
      onboardingCompleted: existingProfile.onboardingCompleted ?? false,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Google auth error:', error);
    
    // Handle specific error cases
    if (error.code === 'auth/invalid-credential') {
      return res.status(401).json({ 
        error: 'Invalid or expired Google token. Please try again.',
        code: 'INVALID_CREDENTIAL'
      });
    }
    
    if (error.code === 'auth/user-disabled') {
      return res.status(403).json({ 
        error: 'This account has been disabled. Please contact support.',
        code: 'USER_DISABLED'
      });
    }
    
    return res.status(500).json({ 
      error: 'Authentication failed. Please try again.',
      code: 'AUTH_FAILED'
    });
  }
}
