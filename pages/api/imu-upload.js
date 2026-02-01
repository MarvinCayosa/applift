/**
 * IMU Data Upload API Route
 * 
 * Handles:
 * 1. Generating signed URLs for direct GCS uploads
 * 2. Verifying Firebase Auth tokens
 * 3. Ensuring users can only upload to their own folder
 * 
 * Required Environment Variables:
 * - GCS_BUCKET_NAME: Google Cloud Storage bucket name
 * - GCS_PROJECT_ID: Google Cloud project ID
 * - GCS_CLIENT_EMAIL: Service account email
 * - GCS_PRIVATE_KEY: Service account private key
 */

import { Storage } from '@google-cloud/storage';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCS_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

// Initialize Google Cloud Storage
let storage;
try {
  storage = new Storage({
    projectId: process.env.GCS_PROJECT_ID,
    credentials: {
      client_email: process.env.GCS_CLIENT_EMAIL,
      private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  });
} catch (error) {
  console.error('GCS initialization error:', error);
}

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'applift-imu-data';

/**
 * Verify Firebase ID token
 */
async function verifyAuthToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Generate a signed URL for uploading to GCS
 */
async function generateSignedUploadUrl(userId, sessionId, contentType = 'text/csv') {
  const fileName = `users/${userId}/sessions/${sessionId}/imu_data.csv`;
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(fileName);

  // Generate signed URL valid for 15 minutes
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType,
  });

  return {
    signedUrl,
    filePath: `gs://${BUCKET_NAME}/${fileName}`,
  };
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if GCS is properly configured
  if (!storage) {
    return res.status(500).json({ 
      error: 'GCS not configured',
      message: 'Google Cloud Storage is not properly configured. Please check environment variables.'
    });
  }

  try {
    // Verify authentication
    const decodedToken = await verifyAuthToken(req.headers.authorization);
    
    if (!decodedToken) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing authentication token' });
    }

    const { action, userId, sessionId, contentType } = req.body;

    // Ensure user can only upload to their own folder
    if (userId !== decodedToken.uid) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'You can only upload data to your own user folder' 
      });
    }

    // Validate required fields
    if (!userId || !sessionId) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: 'userId and sessionId are required' 
      });
    }

    // Handle different actions
    switch (action) {
      case 'getSignedUrl':
        const { signedUrl, filePath } = await generateSignedUploadUrl(
          userId, 
          sessionId, 
          contentType || 'text/csv'
        );
        
        return res.status(200).json({
          success: true,
          signedUrl,
          filePath,
          expiresIn: 900, // 15 minutes in seconds
        });

      default:
        return res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Invalid action. Supported actions: getSignedUrl' 
        });
    }
  } catch (error) {
    console.error('[IMU Upload API] Error:', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  }
}
