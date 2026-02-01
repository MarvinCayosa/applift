/**
 * Test script to upload a sample file to GCS bucket
 * This verifies that the upload mechanism is working
 */

const { Storage } = require('@google-cloud/storage');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Initialize GCS client
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n')
  }
});

const bucketName = process.env.GCS_BUCKET_NAME;

async function testUpload() {
  console.log('\n🧪 Testing GCS Upload...\n');

  try {
    const bucket = storage.bucket(bucketName);
    
    // Create test data - simulating IMU data structure
    const testWorkoutData = {
      workoutId: 'test_workout_' + Date.now(),
      exercise: 'Test Exercise',
      equipment: 'Test Equipment',
      plannedSets: 3,
      plannedReps: 10,
      weight: 50,
      weightUnit: 'kg',
      setType: 'test',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      status: 'completed',
      sets: [
        {
          setNumber: 1,
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          totalReps: 3,
          reps: [
            {
              repNumber: 1,
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              duration: 2500,
              sampleCount: 50,
              samples: [
                {
                  set: 1,
                  rep: 1,
                  timestamp: '00:00.000',
                  timestamp_ms: 0,
                  accelX: 0.5,
                  accelY: -0.3,
                  accelZ: 9.8,
                  accelMag: 9.9,
                  gyroX: 0.1,
                  gyroY: 0.2,
                  gyroZ: 0.3,
                  roll: 5.0,
                  pitch: 10.0,
                  yaw: 0.0,
                  filteredX: 0.48,
                  filteredY: -0.28,
                  filteredZ: 9.75,
                  filteredMag: 9.88
                },
                {
                  set: 1,
                  rep: 1,
                  timestamp: '00:00.050',
                  timestamp_ms: 50,
                  accelX: 0.6,
                  accelY: -0.4,
                  accelZ: 9.7,
                  accelMag: 9.8,
                  gyroX: 0.15,
                  gyroY: 0.25,
                  gyroZ: 0.35,
                  roll: 5.5,
                  pitch: 10.5,
                  yaw: 0.5,
                  filteredX: 0.58,
                  filteredY: -0.38,
                  filteredZ: 9.65,
                  filteredMag: 9.78
                }
              ]
            }
          ]
        }
      ]
    };

    const testMetadata = {
      workoutId: testWorkoutData.workoutId,
      exercise: testWorkoutData.exercise,
      equipment: testWorkoutData.equipment,
      plannedSets: 3,
      plannedReps: 10,
      completedSets: 1,
      completedReps: 3,
      totalReps: 3,
      status: 'completed',
      startTime: testWorkoutData.startTime,
      endTime: testWorkoutData.endTime,
      setType: 'test'
    };

    // Test user ID
    const testUserId = 'test_user';
    const workoutId = testWorkoutData.workoutId;

    console.log('📦 Uploading test workout data...');
    console.log(`   Workout ID: ${workoutId}`);
    console.log(`   User ID: ${testUserId}\n`);

    // Upload workout_data.json
    const workoutDataPath = `users/${testUserId}/workouts/${workoutId}/workout_data.json`;
    const workoutDataFile = bucket.file(workoutDataPath);
    await workoutDataFile.save(JSON.stringify(testWorkoutData, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'no-cache'
      }
    });
    console.log('✅ Uploaded: workout_data.json');

    // Upload metadata.json
    const metadataPath = `users/${testUserId}/workouts/${workoutId}/metadata.json`;
    const metadataFile = bucket.file(metadataPath);
    await metadataFile.save(JSON.stringify(testMetadata, null, 2), {
      contentType: 'application/json',
      metadata: {
        cacheControl: 'no-cache'
      }
    });
    console.log('✅ Uploaded: metadata.json');

    // Create and upload CSV format
    const csvData = `set,rep,timestamp,timestamp_ms,accelX,accelY,accelZ,accelMag,gyroX,gyroY,gyroZ,roll,pitch,yaw,filteredX,filteredY,filteredZ,filteredMag
1,1,00:00.000,0,0.5,-0.3,9.8,9.9,0.1,0.2,0.3,5.0,10.0,0.0,0.48,-0.28,9.75,9.88
1,1,00:00.050,50,0.6,-0.4,9.7,9.8,0.15,0.25,0.35,5.5,10.5,0.5,0.58,-0.38,9.65,9.78`;

    const csvPath = `users/${testUserId}/workouts/${workoutId}/workout_data.csv`;
    const csvFile = bucket.file(csvPath);
    await csvFile.save(csvData, {
      contentType: 'text/csv',
      metadata: {
        cacheControl: 'no-cache'
      }
    });
    console.log('✅ Uploaded: workout_data.csv');

    console.log('\n📊 Test Upload Summary:');
    console.log(`   Path: gs://${bucketName}/users/${testUserId}/workouts/${workoutId}/`);
    console.log(`   Files: 3 (workout_data.json, metadata.json, workout_data.csv)`);

    // Verify files exist
    console.log('\n🔍 Verifying uploaded files...');
    const [files] = await bucket.getFiles({
      prefix: `users/${testUserId}/workouts/${workoutId}/`
    });
    
    console.log(`\n✅ Found ${files.length} file(s) in bucket:`);
    files.forEach(file => {
      console.log(`   - ${file.name}`);
    });

    console.log('\n✅✅✅ Test upload completed successfully! ✅✅✅\n');
    console.log('💡 You can now view these files in the GCS Console:');
    console.log(`   https://console.cloud.google.com/storage/browser/${bucketName}/users/${testUserId}/workouts/${workoutId}\n`);

    return {
      success: true,
      workoutId,
      filesUploaded: files.length
    };

  } catch (error) {
    console.error('\n❌ Upload test failed:', error.message);
    console.error('\nError details:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testUpload()
  .then(result => {
    if (result.success) {
      console.log('🎉 All tests passed!\n');
      process.exit(0);
    } else {
      console.log('❌ Test failed\n');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
