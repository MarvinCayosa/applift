/**
 * Simple API health check - no external dependencies
 * This helps diagnose if the issue is with API routes or dependencies
 */

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Simple response - no external dependencies
  return res.status(200).json({
    success: true,
    message: 'API routes are working',
    timestamp: new Date().toISOString(),
    method: req.method,
    env: {
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV || 'not-vercel',
      // Check if env vars exist (don't expose values)
      hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasFirebasePrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasGcsProjectId: !!process.env.GCS_PROJECT_ID,
      hasGcsBucketName: !!process.env.GCS_BUCKET_NAME,
      hasGcsClientEmail: !!process.env.GCS_CLIENT_EMAIL,
      hasGcsPrivateKey: !!process.env.GCS_PRIVATE_KEY,
    }
  });
}
