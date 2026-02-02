/**
 * IMU Streaming API Route
 * 
 * Handles real-time IMU data uploads to Google Cloud Storage.
 * Supports:
 * - Getting signed URLs for direct uploads
 * - Metadata updates
 * - Workout completion status
 */

import { Storage } from '@google-cloud/storage';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// API route config for Vercel
export const config = {
  api: {
    bodyParser: true,
  },
};

// Lazy initialization - will be initialized on first request
let firebaseInitialized = false;
let firebaseInitError = null;
let storage = null;
let storageInitError = null;

/**
 * Initialize Firebase Admin on demand
 */
function initFirebase() {
  if (firebaseInitialized || firebaseInitError) return;
  
  try {
    if (!getApps().length) {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
        throw new Error('Missing Firebase environment variables');
      }
      
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    }
    firebaseInitialized = true;
    console.log('[IMU Stream API] Firebase initialized');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    firebaseInitError = error;
  }
}

/**
 * Initialize GCS on demand
 */
function initGCS() {
  if (storage || storageInitError) return;
  
  try {
    const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!process.env.GCS_PROJECT_ID || !process.env.GCS_CLIENT_EMAIL || !privateKey) {
      throw new Error('Missing GCS environment variables');
    }
    
    storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });
    console.log('[IMU Stream API] GCS initialized with project:', process.env.GCS_PROJECT_ID);
  } catch (error) {
    console.error('GCS initialization error:', error);
    storageInitError = error;
  }
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
async function generateSignedUploadUrl(filePath, contentType = 'text/csv') {
  const bucket = storage.bucket(BUCKET_NAME);
  const file = bucket.file(filePath);

  // Generate signed URL valid for 5 minutes (shorter for streaming)
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    contentType,
  });

  return signedUrl;
}

/**
 * Sanitize string for use in Firestore document paths
 * Converts to lowercase, replaces spaces with hyphens, removes special characters
 */
function sanitizeForPath(str) {
  if (!str) return 'unknown';
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Save workout metadata to Firestore
 * Structure: workoutLogs/{equipment}/{exercise}/{workoutId}
 * Also maintains a user-indexed collection for queries
 */
async function saveWorkoutToFirestore(userId, workoutId, metadata) {
  try {
    const db = getFirestore();
    
    // Sanitize equipment and exercise for path
    const equipment = sanitizeForPath(metadata.equipment);
    const exercise = sanitizeForPath(metadata.exercise);
    
    // Get the GCS path from metadata or construct it
    const gcsPath = metadata.gcsPath || `users/${userId}/${equipment}/${exercise}`;
    
    // Document data
    const workoutData = {
      odUSerId: userId,
      odWorkoutId: workoutId,
      exercise: {
        name: metadata.exercise,
        equipment: metadata.equipment,
        // Sanitized versions for querying
        namePath: exercise,
        equipmentPath: equipment,
      },
      planned: {
        sets: metadata.plannedSets,
        reps: metadata.plannedReps,
        weight: metadata.weight,
        weightUnit: metadata.weightUnit,
      },
      results: {
        completedSets: metadata.completedSets,
        completedReps: metadata.completedReps,
        totalReps: metadata.totalReps,
        sets: metadata.sets,
      },
      status: metadata.status,
      setType: metadata.setType,
      gcsPath: `gs://${BUCKET_NAME}/${gcsPath}`,
      timestamps: {
        started: metadata.startTime ? new Date(metadata.startTime) : null,
        completed: metadata.endTime ? new Date(metadata.endTime) : null,
      },
      updatedAt: new Date(),
    };

    // Save to hierarchical structure: workoutLogs/{equipment}/{exercise}/{workoutId}
    const hierarchicalRef = db
      .collection('workoutLogs')
      .doc(equipment)
      .collection(exercise)
      .doc(workoutId);
    
    await hierarchicalRef.set(workoutData, { merge: true });

    // Also save to user-indexed collection for easy user queries
    // userWorkouts/{userId}/logs/{workoutId}
    const userRef = db
      .collection('userWorkouts')
      .doc(userId)
      .collection('logs')
      .doc(workoutId);
    
    await userRef.set({
      ...workoutData,
      // Add reference to hierarchical location
      hierarchicalPath: `workoutLogs/${equipment}/${exercise}/${workoutId}`
    }, { merge: true });

    console.log(`[IMU Stream API] Saved workout to: workoutLogs/${equipment}/${exercise}/${workoutId}`);
    return true;
  } catch (error) {
    console.error('[IMU Stream API] Firestore save error:', error);
    return false;
  }
}

export default async function handler(req, res) {
  // Enable CORS for Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowedMethods: ['POST'],
      received: req.method 
    });
  }

  // Initialize services on demand
  initFirebase();
  initGCS();

  // Check for initialization errors
  if (firebaseInitError) {
    console.error('[IMU Stream API] Firebase init error:', firebaseInitError.message);
    return res.status(500).json({
      error: 'Service configuration error',
      message: 'Firebase not properly configured',
      details: process.env.NODE_ENV === 'development' ? firebaseInitError.message : undefined
    });
  }

  if (storageInitError) {
    console.error('[IMU Stream API] GCS init error:', storageInitError.message);
    return res.status(500).json({
      error: 'Service configuration error', 
      message: 'Cloud Storage not properly configured',
      details: process.env.NODE_ENV === 'development' ? storageInitError.message : undefined
    });
  }

  // Add debug logging for Vercel
  console.log('[IMU Stream API] Request received:', {
    method: req.method,
    headers: req.headers,
    body: req.body ? 'Body present' : 'No body',
    environment: process.env.VERCEL_ENV || 'development'
  });

  // Check if GCS is properly configured
  if (!storage) {
    console.warn('[IMU Stream API] GCS not configured, using mock mode');
    // Return mock response for development
    return res.status(200).json({
      success: true,
      signedUrl: 'mock://upload-url',
      message: 'GCS not configured - mock mode',
      environment: process.env.VERCEL_ENV || 'development'
    });
  }

  try {
    // Verify authentication
    const decodedToken = await verifyAuthToken(req.headers.authorization);
    
    if (!decodedToken) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or missing authentication token' 
      });
    }

    const { action, userId, filePath, contentType, metadata, workoutId } = req.body;

    // Ensure user can only upload to their own folder
    if (userId !== decodedToken.uid) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'You can only upload data to your own user folder' 
      });
    }

    // Handle different actions
    switch (action) {
      case 'upload': {
        // Get signed URL for file upload
        if (!filePath) {
          return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'filePath is required' 
          });
        }

        const signedUrl = await generateSignedUploadUrl(filePath, contentType || 'text/csv');
        
        return res.status(200).json({
          success: true,
          signedUrl,
          filePath: `gs://${BUCKET_NAME}/${filePath}`,
        });
      }

      case 'saveMetadata': {
        // Save workout metadata to Firestore
        if (!workoutId || !metadata) {
          return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'workoutId and metadata are required' 
          });
        }

        const saved = await saveWorkoutToFirestore(userId, workoutId, metadata);
        
        return res.status(200).json({
          success: saved,
          message: saved ? 'Metadata saved' : 'Failed to save metadata'
        });
      }

      case 'completeWorkout': {
        // Mark workout as complete/incomplete in Firestore
        if (!workoutId || !metadata) {
          return res.status(400).json({ 
            error: 'Bad Request', 
            message: 'workoutId and metadata are required' 
          });
        }

        const saved = await saveWorkoutToFirestore(userId, workoutId, metadata);
        
        return res.status(200).json({
          success: saved,
          status: metadata.status,
          completedSets: metadata.completedSets,
          plannedSets: metadata.plannedSets,
        });
      }

      default:
        return res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Invalid action. Supported: upload, saveMetadata, completeWorkout' 
        });
    }
  } catch (error) {
    console.error('[IMU Stream API] Error:', error);
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  }
}
