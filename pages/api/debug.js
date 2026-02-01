/**
 * Step-by-step diagnostic - tests each component separately
 * Helps identify exactly where the problem is
 */

export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const diagnostics = {
    timestamp: new Date().toISOString(),
    steps: [],
    errors: [],
    envCheck: {}
  };

  // Step 1: Check environment variables
  try {
    diagnostics.envCheck = {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? `SET (${process.env.FIREBASE_PRIVATE_KEY.length} chars)` : 'MISSING',
      GCS_PROJECT_ID: process.env.GCS_PROJECT_ID ? 'SET' : 'MISSING',
      GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME ? 'SET' : 'MISSING',
      GCS_CLIENT_EMAIL: process.env.GCS_CLIENT_EMAIL ? 'SET' : 'MISSING',
      GCS_PRIVATE_KEY: process.env.GCS_PRIVATE_KEY ? `SET (${process.env.GCS_PRIVATE_KEY.length} chars)` : 'MISSING',
    };
    diagnostics.steps.push({ step: 1, name: 'Environment Check', status: 'PASS' });
  } catch (error) {
    diagnostics.steps.push({ step: 1, name: 'Environment Check', status: 'FAIL', error: error.message });
    diagnostics.errors.push({ step: 1, error: error.message });
  }

  // Step 2: Test Firebase Admin import
  try {
    const { getApps, initializeApp, cert } = await import('firebase-admin/app');
    diagnostics.steps.push({ step: 2, name: 'Firebase Admin Import', status: 'PASS' });
    
    // Step 3: Initialize Firebase Admin
    try {
      if (!getApps().length) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        
        if (!privateKey) {
          throw new Error('FIREBASE_PRIVATE_KEY is missing or invalid');
        }
        
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        });
      }
      diagnostics.steps.push({ step: 3, name: 'Firebase Admin Init', status: 'PASS' });
      
      // Step 4: Test Firestore
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore();
        
        // Just test connection, don't actually write
        const testRef = db.collection('_test_connection');
        await testRef.limit(1).get();
        diagnostics.steps.push({ step: 4, name: 'Firestore Connection', status: 'PASS' });
      } catch (error) {
        diagnostics.steps.push({ step: 4, name: 'Firestore Connection', status: 'FAIL', error: error.message });
        diagnostics.errors.push({ step: 4, error: error.message, hint: 'Check Firestore permissions' });
      }
      
    } catch (error) {
      diagnostics.steps.push({ step: 3, name: 'Firebase Admin Init', status: 'FAIL', error: error.message });
      diagnostics.errors.push({ step: 3, error: error.message, hint: 'Check FIREBASE_PRIVATE_KEY format' });
    }
    
  } catch (error) {
    diagnostics.steps.push({ step: 2, name: 'Firebase Admin Import', status: 'FAIL', error: error.message });
    diagnostics.errors.push({ step: 2, error: error.message });
  }

  // Step 5: Test GCS import
  try {
    const { Storage } = await import('@google-cloud/storage');
    diagnostics.steps.push({ step: 5, name: 'GCS Import', status: 'PASS' });
    
    // Step 6: Initialize GCS
    try {
      const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      if (!privateKey) {
        throw new Error('GCS_PRIVATE_KEY is missing or invalid');
      }
      
      const storage = new Storage({
        projectId: process.env.GCS_PROJECT_ID,
        credentials: {
          client_email: process.env.GCS_CLIENT_EMAIL,
          private_key: privateKey,
        },
      });
      diagnostics.steps.push({ step: 6, name: 'GCS Init', status: 'PASS' });
      
      // Step 7: Test bucket access
      try {
        const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
        const [exists] = await bucket.exists();
        diagnostics.steps.push({ 
          step: 7, 
          name: 'GCS Bucket Access', 
          status: exists ? 'PASS' : 'FAIL',
          bucketName: process.env.GCS_BUCKET_NAME,
          exists: exists
        });
      } catch (error) {
        diagnostics.steps.push({ step: 7, name: 'GCS Bucket Access', status: 'FAIL', error: error.message });
        diagnostics.errors.push({ step: 7, error: error.message, hint: 'Check IAM permissions on GCS bucket' });
      }
      
    } catch (error) {
      diagnostics.steps.push({ step: 6, name: 'GCS Init', status: 'FAIL', error: error.message });
      diagnostics.errors.push({ step: 6, error: error.message, hint: 'Check GCS_PRIVATE_KEY format' });
    }
    
  } catch (error) {
    diagnostics.steps.push({ step: 5, name: 'GCS Import', status: 'FAIL', error: error.message });
    diagnostics.errors.push({ step: 5, error: error.message });
  }

  // Summary
  const failedSteps = diagnostics.steps.filter(s => s.status === 'FAIL');
  diagnostics.summary = {
    totalSteps: diagnostics.steps.length,
    passed: diagnostics.steps.filter(s => s.status === 'PASS').length,
    failed: failedSteps.length,
    overallStatus: failedSteps.length === 0 ? 'ALL PASS' : 'HAS FAILURES'
  };

  // Recommendations
  diagnostics.recommendations = [];
  
  if (diagnostics.envCheck.FIREBASE_PRIVATE_KEY === 'MISSING') {
    diagnostics.recommendations.push('Add FIREBASE_PRIVATE_KEY to Vercel Environment Variables');
  }
  if (diagnostics.envCheck.GCS_PRIVATE_KEY === 'MISSING') {
    diagnostics.recommendations.push('Add GCS_PRIVATE_KEY to Vercel Environment Variables');
  }
  if (failedSteps.some(s => s.step === 7)) {
    diagnostics.recommendations.push('Check IAM permissions: GCS service account needs Storage Admin role');
  }

  return res.status(200).json(diagnostics);
}
