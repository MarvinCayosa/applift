/**
 * Setup CORS for GCS bucket
 * Run this script once to enable browser uploads
 */

const { Storage } = require('@google-cloud/storage');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
    private_key: (process.env.GCS_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n')
  }
});

const bucketName = process.env.GCS_BUCKET_NAME || 'applift-imu-data';

const corsConfiguration = [
  {
    origin: ['*'], // Allow all origins - you can restrict to specific domains
    method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Content-Length',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Methods',
      'Access-Control-Allow-Headers',
      'X-Goog-Algorithm',
      'X-Goog-Credential',
      'X-Goog-Date',
      'X-Goog-Expires',
      'X-Goog-SignedHeaders',
      'X-Goog-Signature'
    ],
    maxAgeSeconds: 3600
  }
];

async function setupCORS() {
  try {
    console.log(`\n🔧 Setting up CORS for bucket: ${bucketName}\n`);
    
    const bucket = storage.bucket(bucketName);
    
    // Check current CORS
    const [metadata] = await bucket.getMetadata();
    console.log('Current CORS settings:');
    console.log(JSON.stringify(metadata.cors || 'None', null, 2));
    
    // Apply new CORS config
    await bucket.setCorsConfiguration(corsConfiguration);
    
    console.log('\n✅ CORS configuration applied successfully!\n');
    console.log('New CORS Configuration:');
    console.log(JSON.stringify(corsConfiguration, null, 2));
    
    // Verify
    const [newMetadata] = await bucket.getMetadata();
    console.log('\n🔍 Verified CORS settings:');
    console.log(JSON.stringify(newMetadata.cors, null, 2));
    
    console.log('\n✅✅✅ CORS setup complete! Browser uploads should now work. ✅✅✅\n');
    
  } catch (error) {
    console.error('❌ Error setting up CORS:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

setupCORS();
