/**
 * Test API route for Vercel deployment
 * Visit /api/test-deployment to check if API routes are working
 */

export default function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const deploymentInfo = {
    success: true,
    message: 'API routes are working on Vercel',
    timestamp: new Date().toISOString(),
    method: req.method,
    environment: {
      node_env: process.env.NODE_ENV,
      vercel_env: process.env.VERCEL_ENV,
      vercel_region: process.env.VERCEL_REGION,
      has_firebase_config: !!process.env.FIREBASE_PROJECT_ID,
      has_gcs_config: !!process.env.GCS_PROJECT_ID,
      has_firebase_private_key: !!process.env.FIREBASE_PRIVATE_KEY,
      has_gcs_private_key: !!process.env.GCS_PRIVATE_KEY,
    }
  };

  res.status(200).json(deploymentInfo);
}
