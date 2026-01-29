/**
 * API Route: /api/auth
 * Handles user authentication operations (signup, profile update)
 * 
 * POST - Create new user / Update user profile
 * GET - Verify authentication status
 */

import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../../config/firebase';
import { db } from '../../config/firestore';

const auth = getAuth(app);

// Rate limiting - simple in-memory store (use Redis in production)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

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

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate password strength
function isValidPassword(password) {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*(),.?"':{}|<>\-_=+\/\\\[\]`~;]/.test(password)) return false;
  return true;
}

// Sanitize profile data to prevent injection
function sanitizeProfile(profile) {
  const allowedFields = [
    'username', 'displayName', 'gender', 'birthMonth', 'birthYear', 'age',
    'weight', 'weightUnit', 'height', 'heightUnit', 'heightFeet', 'heightInches', 'heightCm',
    'bmi', 'bmiCategory', 'bodyType', 'weightResponse', 'strengthExperience',
    'workoutFrequency', 'fitnessGoal', 'trainingPriority', 'onboardingCompleted',
    'termsAccepted', 'termsAcceptedAt', 'consentAccepted', 'consentAcceptedAt'
  ];
  
  const sanitized = {};
  for (const field of allowedFields) {
    if (profile[field] !== undefined) {
      // Sanitize string values
      if (typeof profile[field] === 'string') {
        sanitized[field] = profile[field].trim().slice(0, 500);
      } else {
        sanitized[field] = profile[field];
      }
    }
  }
  return sanitized;
}

export default async function handler(req, res) {
  // Get client IP for rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
             req.headers['x-real-ip'] || 
             req.socket?.remoteAddress || 
             'unknown';
  
  // Check rate limit
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'POST') {
    const { email, password, action, uid, ...profileData } = req.body;

    // Handle profile update (for existing authenticated users)
    if (action === 'updateProfile' && uid) {
      try {
        const sanitizedProfile = sanitizeProfile(profileData);
        const userRef = doc(db, 'users', uid);
        
        // Verify user exists
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
        }
        
        await updateDoc(userRef, {
          ...sanitizedProfile,
          updatedAt: serverTimestamp(),
        });
        
        return res.status(200).json({ success: true, uid });
      } catch (error) {
        console.error('Profile update error:', error);
        return res.status(500).json({ error: 'Failed to update profile', code: 'UPDATE_FAILED' });
      }
    }

    // Handle signup
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Validate email
    if (!isValidEmail(email)) {
      return res.status(400).json({ 
        error: 'Please enter a valid email address',
        code: 'INVALID_EMAIL'
      });
    }

    // Validate password
    if (!isValidPassword(password)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters with uppercase, number, and symbol',
        code: 'WEAK_PASSWORD'
      });
    }

    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Sanitize and save profile
      const sanitizedProfile = sanitizeProfile(profileData);
      
      await setDoc(doc(db, 'users', user.uid), {
        email: email.toLowerCase().trim(),
        provider: 'email',
        ...sanitizedProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      return res.status(201).json({ 
        uid: user.uid,
        success: true,
        message: 'Account created successfully'
      });
    } catch (error) {
      console.error('Signup error:', error);
      
      // Map Firebase error codes to user-friendly messages
      const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered. Please log in instead.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Password is too weak.',
        'auth/operation-not-allowed': 'Email/password accounts are not enabled.',
      };
      
      const message = errorMessages[error.code] || 'Failed to create account. Please try again.';
      const status = error.code === 'auth/email-already-in-use' ? 409 : 400;
      
      return res.status(status).json({ 
        error: message,
        code: error.code || 'SIGNUP_FAILED'
      });
    }
  }

  // Method not allowed
  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
