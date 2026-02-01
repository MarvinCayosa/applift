// Utility to check environment variables configuration
export function checkEnvConfig() {
  const config = {
    firebase: {
      configured: false,
      missing: []
    },
    gcs: {
      configured: false,
      missing: []
    }
  };

  // Check Firebase config
  const firebaseVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY'
  ];

  firebaseVars.forEach(varName => {
    if (!process.env[varName]) {
      config.firebase.missing.push(varName);
    }
  });

  config.firebase.configured = config.firebase.missing.length === 0;

  // Check GCS config
  const gcsVars = [
    'GCS_PROJECT_ID',
    'GCS_BUCKET_NAME',
    'GCS_CLIENT_EMAIL',
    'GCS_PRIVATE_KEY'
  ];

  gcsVars.forEach(varName => {
    if (!process.env[varName]) {
      config.gcs.missing.push(varName);
    }
  });

  config.gcs.configured = config.gcs.missing.length === 0;

  return config;
}

// API route to check environment configuration
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const config = checkEnvConfig();

  res.status(200).json({
    success: true,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    config,
    recommendations: {
      firebase: config.firebase.configured ? 'Firebase is properly configured' : 'Firebase configuration incomplete',
      gcs: config.gcs.configured ? 'GCS is properly configured' : 'GCS configuration incomplete'
    }
  });
}
