/**
 * IAM Permissions Diagnostic API
 * Tests both Firebase and GCS permissions
 * Uses dynamic imports to prevent module-level failures
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    projects: {
      firebase: process.env.FIREBASE_PROJECT_ID || 'NOT SET',
      gcs: process.env.GCS_PROJECT_ID || 'NOT SET',
      mismatch: process.env.FIREBASE_PROJECT_ID !== process.env.GCS_PROJECT_ID
    },
    serviceAccounts: {
      firebase: process.env.FIREBASE_CLIENT_EMAIL || 'NOT SET',
      gcs: process.env.GCS_CLIENT_EMAIL || 'NOT SET',
      mismatch: process.env.FIREBASE_CLIENT_EMAIL !== process.env.GCS_CLIENT_EMAIL
    },
    envVars: {
      FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
      GCS_PROJECT_ID: !!process.env.GCS_PROJECT_ID,
      GCS_BUCKET_NAME: !!process.env.GCS_BUCKET_NAME,
      GCS_CLIENT_EMAIL: !!process.env.GCS_CLIENT_EMAIL,
      GCS_PRIVATE_KEY: !!process.env.GCS_PRIVATE_KEY,
    },
    tests: {}
  };

  // Check if minimum env vars are present
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
    diagnostics.tests.envCheck = { 
      success: false, 
      error: 'Missing Firebase environment variables. Please check Vercel settings.' 
    };
    return res.status(200).json(diagnostics);
  }

  // Test 1: Firebase Admin Initialization
  try {
    const { initializeApp, getApps, cert } = await import('firebase-admin/app');
    
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    diagnostics.tests.firebaseInit = { success: true, message: 'Firebase Admin initialized' };
  } catch (error) {
    diagnostics.tests.firebaseInit = { success: false, error: error.message };
  }

  // Test 2: Firestore Access
  if (diagnostics.tests.firebaseInit?.success) {
    try {
      const { getFirestore } = await import('firebase-admin/firestore');
      const db = getFirestore();
      await db.collection('test').limit(1).get();
      diagnostics.tests.firestoreAccess = { success: true, message: 'Firestore accessible' };
    } catch (error) {
      diagnostics.tests.firestoreAccess = { success: false, error: error.message };
    }
  }

  // Test 3: Firebase Auth Access
  if (diagnostics.tests.firebaseInit?.success) {
    try {
      const { getAuth } = await import('firebase-admin/auth');
      await getAuth().listUsers(1);
      diagnostics.tests.firebaseAuth = { success: true, message: 'Firebase Auth accessible' };
    } catch (error) {
      diagnostics.tests.firebaseAuth = { success: false, error: error.message };
    }
  }

  // Test 4: GCS Access
  if (process.env.GCS_PROJECT_ID && process.env.GCS_PRIVATE_KEY) {
    try {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID,
        credentials: {
          client_email: process.env.GCS_CLIENT_EMAIL,
          private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
      });
      
      const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
      const [exists] = await bucket.exists();
      diagnostics.tests.gcsAccess = { 
        success: true, 
        message: 'GCS bucket accessible',
        bucketExists: exists 
      };
    } catch (error) {
      diagnostics.tests.gcsAccess = { success: false, error: error.message };
    }
  } else {
    diagnostics.tests.gcsAccess = { 
      success: false, 
      error: 'Missing GCS environment variables' 
    };
  }

  // IAM Recommendations
  diagnostics.recommendations = [];
  
  if (diagnostics.projects.mismatch) {
    diagnostics.recommendations.push({
      issue: 'Different projects for Firebase and GCS',
      solution: 'Grant Firebase service account Storage Admin role in GCS project',
      command: `gcloud projects add-iam-policy-binding ${process.env.GCS_PROJECT_ID} --member="serviceAccount:${process.env.FIREBASE_CLIENT_EMAIL}" --role="roles/storage.admin"`
    });
  }

  if (diagnostics.serviceAccounts.mismatch) {
    diagnostics.recommendations.push({
      issue: 'Different service accounts for Firebase and GCS',
      solution: 'Use unified service account or grant cross-project permissions'
    });
  }

  if (!diagnostics.tests.gcsAccess?.success) {
    diagnostics.recommendations.push({
      issue: 'GCS access failed',
      solution: 'Check GCS service account has Storage Admin role'
    });
  }

  res.status(200).json(diagnostics);
}
