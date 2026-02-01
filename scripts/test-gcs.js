/**
 * Test script for Google Cloud Storage connection
 * 
 * Run with: node scripts/test-gcs.js
 * 
 * Make sure you have:
 * 1. Created .env.local with GCS credentials
 * 2. Installed @google-cloud/storage: npm install @google-cloud/storage
 */

require('dotenv').config({ path: '.env.local' });

const { Storage } = require('@google-cloud/storage');

async function testGCSConnection() {
  console.log('\n🧪 Testing Google Cloud Storage Connection...\n');

  // Check environment variables
  const requiredVars = ['GCS_PROJECT_ID', 'GCS_CLIENT_EMAIL', 'GCS_PRIVATE_KEY', 'GCS_BUCKET_NAME'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error('❌ Missing environment variables:', missing.join(', '));
    console.log('\n📋 Please create .env.local with the required values.');
    console.log('   See .env.local.example for template.\n');
    process.exit(1);
  }

  console.log('✅ Environment variables found');
  console.log(`   Project ID: ${process.env.GCS_PROJECT_ID}`);
  console.log(`   Client Email: ${process.env.GCS_CLIENT_EMAIL}`);
  console.log(`   Bucket Name: ${process.env.GCS_BUCKET_NAME}`);
  console.log(`   Private Key: ${process.env.GCS_PRIVATE_KEY?.substring(0, 50)}...`);

  try {
    // Initialize Storage
    const storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    console.log('\n✅ Storage client initialized');

    // Get bucket
    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME);
    
    // Check if bucket exists
    const [exists] = await bucket.exists();
    
    if (!exists) {
      console.log(`\n⚠️ Bucket "${process.env.GCS_BUCKET_NAME}" does not exist.`);
      console.log('   Creating bucket...');
      
      await storage.createBucket(process.env.GCS_BUCKET_NAME, {
        location: 'US',
        storageClass: 'STANDARD',
      });
      
      console.log('✅ Bucket created successfully!');
    } else {
      console.log(`\n✅ Bucket "${process.env.GCS_BUCKET_NAME}" exists`);
    }

    // Test write
    const testFile = bucket.file('test/connection-test.json');
    const testData = {
      test: true,
      timestamp: new Date().toISOString(),
      message: 'GCS connection successful!'
    };
    
    console.log('\n📤 Testing file upload...');
    await testFile.save(JSON.stringify(testData, null, 2), {
      contentType: 'application/json',
    });
    console.log('✅ Test file uploaded: test/connection-test.json');

    // Test read
    console.log('\n📥 Testing file read...');
    const [contents] = await testFile.download();
    const parsed = JSON.parse(contents.toString());
    console.log('✅ Test file read successfully:', parsed);

    // Test signed URL generation
    console.log('\n🔗 Testing signed URL generation...');
    const [signedUrl] = await testFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    });
    console.log('✅ Signed URL generated:', signedUrl.substring(0, 100) + '...');

    // Cleanup
    console.log('\n🧹 Cleaning up test file...');
    await testFile.delete();
    console.log('✅ Test file deleted');

    console.log('\n✅✅✅ All GCS tests passed! ✅✅✅\n');
    console.log('Your Google Cloud Storage is configured correctly.');
    console.log('The workout logging pipeline should work!\n');

  } catch (error) {
    console.error('\n❌ GCS Test Failed:', error.message);
    
    if (error.message.includes('invalid_grant')) {
      console.log('\n💡 Tip: Check your private key format.');
      console.log('   Make sure newlines are properly escaped as \\n');
    } else if (error.message.includes('Permission denied')) {
      console.log('\n💡 Tip: Your service account needs "Storage Admin" role.');
      console.log('   Go to IAM & Admin > IAM and add the role.');
    } else if (error.message.includes('not found')) {
      console.log('\n💡 Tip: Check your bucket name or create it first.');
    }
    
    console.log('\nFull error:', error);
    process.exit(1);
  }
}

testGCSConnection();
