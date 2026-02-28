/**
 * API Route: /api/check-email
 * Checks if an email is already registered in the system
 */

import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp;
let adminAuth;
let adminDb;

try {
  if (!getApps().length) {
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com`,
    });
  } else {
    adminApp = getApp();
  }
  
  adminAuth = getAuth(adminApp);
  adminDb = getFirestore(adminApp);
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

// Rate limiting - simple in-memory store
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // Allow more frequent checks for UX

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
    const { email } = req.body;

    // Validate email format
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ 
        error: 'Email is required',
        code: 'INVALID_EMAIL'
      });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      if (!adminAuth) {
        console.error('Firebase Admin not initialized');
        return res.status(500).json({ 
          error: 'Service unavailable. Please try again later.',
          code: 'SERVICE_UNAVAILABLE'
        });
      }
      
      // Check if user exists by email using Firebase Admin SDK
      let userExists = false;
      try {
        await adminAuth.getUserByEmail(normalizedEmail);
        userExists = true;
      } catch (error) {
        // auth/user-not-found is expected if user doesn't exist
        if (error.code !== 'auth/user-not-found') {
          throw error;
        }
      }
      
      return res.status(200).json({ 
        exists: userExists,
        email: normalizedEmail
      });
    } catch (error) {
      console.error('Error checking email:', error);
      
      // Don't expose internal errors
      return res.status(500).json({ 
        error: 'Failed to check email. Please try again.',
        code: 'CHECK_EMAIL_FAILED'
      });
    }
  }

  // Method not allowed
  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
