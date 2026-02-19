/**
 * Velocity Verification Script
 * 
 * Fetches real workout data from GCS and runs the new accelerometer-based
 * velocity calculation to verify values are realistic (0.3-1.5 m/s range).
 * 
 * Usage: node scripts/verify-velocity.mjs [workoutId]
 */

import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'applift-imu-data';
const TARGET_WORKOUT_ID = process.argv[2] || '20260220_wtv5ddmyxvi';

// Init GCS
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

// ============ Velocity Math (mirrors workoutAnalysisService.js) ============

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeVelocityFromAccel(samples) {
  if (!samples || samples.length < 3) return null;

  const accelMag = samples.map(s =>
    s.accelMag || Math.sqrt((s.accelX || 0) ** 2 + (s.accelY || 0) ** 2 + (s.accelZ || 0) ** 2)
  );
  // IMPORTANT: Use explicit null check — timestamp_ms=0 is valid (first sample)
  const timestamps = samples.map(s => {
    if (s.timestamp_ms != null && typeof s.timestamp_ms === 'number') return s.timestamp_ms;
    if (typeof s.timestamp === 'number') return s.timestamp;
    // Parse string timestamps like "00:00.130" → milliseconds
    if (typeof s.timestamp === 'string') {
      const parts = s.timestamp.match(/(\d+):(\d+)\.(\d+)/);
      if (parts) return parseInt(parts[1]) * 60000 + parseInt(parts[2]) * 1000 + parseInt(parts[3]);
    }
    return 0;
  });
  const durationMs = timestamps[timestamps.length - 1] - timestamps[0];

  // Gravity baseline from first few samples
  const n = Math.min(3, Math.floor(accelMag.length / 4));
  const gravityBaseline = n > 0 ? mean(accelMag.slice(0, n)) : 9.81;

  // Net acceleration
  const netAccel = accelMag.map(a => a - gravityBaseline);

  // Trapezoidal integration -> velocity
  const velocityProfile = [0];
  for (let i = 1; i < netAccel.length; i++) {
    let dt;
    if (timestamps[i] > 0 && timestamps[i - 1] > 0) {
      dt = (timestamps[i] - timestamps[i - 1]) / 1000;
    } else {
      dt = (durationMs / 1000) / (netAccel.length - 1);
    }
    dt = Math.max(0.005, Math.min(0.2, dt));
    const v = velocityProfile[i - 1] + 0.5 * (netAccel[i] + netAccel[i - 1]) * dt;
    velocityProfile.push(v);
  }

  // High-pass drift correction
  if (velocityProfile.length > 2) {
    const firstV = velocityProfile[0];
    const lastV = velocityProfile[velocityProfile.length - 1];
    const driftPerSample = (lastV - firstV) / (velocityProfile.length - 1);
    for (let i = 0; i < velocityProfile.length; i++) {
      velocityProfile[i] -= firstV + driftPerSample * i;
    }
  }

  const absV = velocityProfile.map(v => Math.abs(v));
  const peakVelocity = Math.max(...absV);
  const meanVelocity = mean(absV);

  return {
    gravityBaseline,
    peakVelocity,
    meanVelocity,
    durationMs,
    sampleCount: samples.length,
    accelMagRange: { min: Math.min(...accelMag), max: Math.max(...accelMag) },
    netAccelRange: { min: Math.min(...netAccel), max: Math.max(...netAccel) },
    velocityProfile: velocityProfile.slice(0, 10).map(v => v.toFixed(4)) // first 10 for debug
  };
}

// ============ GCS Fetch ============

async function findWorkoutFile(workoutId) {
  console.log(`\nSearching GCS bucket '${BUCKET_NAME}' for workout: ${workoutId}`);

  const bucket = storage.bucket(BUCKET_NAME);

  // Try listing files with the workout ID prefix pattern
  const [files] = await bucket.getFiles({ prefix: 'users/' });
  
  const matchingFiles = files.filter(f => f.name.includes(workoutId));
  
  if (matchingFiles.length > 0) {
    console.log(`Found ${matchingFiles.length} matching file(s):`);
    matchingFiles.forEach(f => console.log(`  - ${f.name}`));
    
    // Pick the workout_data.json
    const dataFile = matchingFiles.find(f => f.name.endsWith('workout_data.json')) || matchingFiles[0];
    return dataFile;
  }

  // If no match, list a few files to understand the structure
  console.log('\nNo direct match. Listing first 20 files to understand structure:');
  const [allFiles] = await bucket.getFiles({ maxResults: 20 });
  allFiles.forEach(f => console.log(`  - ${f.name}`));
  
  return null;
}

async function main() {
  console.log('=== Velocity Verification Script ===');
  console.log(`Target workout: ${TARGET_WORKOUT_ID}`);
  console.log(`GCS Bucket: ${BUCKET_NAME}`);
  console.log(`GCS Project: ${process.env.GCS_PROJECT_ID}`);

  try {
    const file = await findWorkoutFile(TARGET_WORKOUT_ID);
    
    if (!file) {
      console.error('\n❌ Could not find workout data. Trying to list all workout_data.json files...');
      
      const bucket = storage.bucket(BUCKET_NAME);
      const [allFiles] = await bucket.getFiles({ maxResults: 200 });
      const jsonFiles = allFiles.filter(f => f.name.endsWith('workout_data.json'));
      
      console.log(`\nFound ${jsonFiles.length} workout_data.json files:`);
      jsonFiles.slice(-10).forEach(f => console.log(`  - ${f.name}`));
      
      if (jsonFiles.length > 0) {
        console.log('\n→ Using the LATEST workout file for verification:');
        const latestFile = jsonFiles[jsonFiles.length - 1];
        console.log(`  ${latestFile.name}`);
        await analyzeFile(latestFile);
      }
      return;
    }

    await analyzeFile(file);
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.message.includes('credentials')) {
      console.log('Check your .env GCS_* variables.');
    }
  }
}

async function analyzeFile(file) {
  console.log(`\nDownloading: ${file.name}`);
  const [content] = await file.download();
  const workoutData = JSON.parse(content.toString('utf8'));

  console.log('\n=== WORKOUT METADATA ===');
  console.log(`  Workout ID: ${workoutData.workoutId}`);
  console.log(`  Exercise: ${workoutData.exercise}`);
  console.log(`  Equipment: ${workoutData.equipment}`);
  console.log(`  User: ${workoutData.odUSerId}`);
  console.log(`  Sets: ${workoutData.sets?.length}`);

  if (!workoutData.sets || workoutData.sets.length === 0) {
    console.log('No sets found in workout data.');
    return;
  }

  console.log('\n=== VELOCITY ANALYSIS (NEW: Accelerometer Integration) ===');
  console.log('Expected ranges for VBT:');
  console.log('  Peak: 0.3-1.5 m/s (typical dumbbell/barbell exercises)');
  console.log('  Zones: >1.3 Power | 0.75-1.3 Speed-Strength | 0.5-0.75 Strength | <0.5 Max Strength\n');

  const allResults = [];

  for (const set of workoutData.sets) {
    console.log(`--- Set ${set.setNumber} (${set.reps?.length || 0} reps) ---`);
    
    if (!set.reps) continue;

    for (const rep of set.reps) {
      const result = computeVelocityFromAccel(rep.samples);
      
      if (!result) {
        console.log(`  Rep ${rep.repNumber}: ⚠️ Insufficient samples`);
        continue;
      }

      allResults.push({ setNumber: set.setNumber, repNumber: rep.repNumber, ...result });

      // Classify velocity zone
      let zone = 'Unknown';
      if (result.peakVelocity > 1.3) zone = '⚡ Power';
      else if (result.peakVelocity > 0.75) zone = '🔥 Speed-Strength';
      else if (result.peakVelocity > 0.5) zone = '💪 Strength';
      else if (result.peakVelocity > 0.1) zone = '🏋️ Max Strength';
      else zone = '🐢 Very Slow';

      const realistic = result.peakVelocity >= 0.1 && result.peakVelocity <= 2.5;
      const marker = realistic ? '✅' : '⚠️';

      console.log(
        `  Rep ${rep.repNumber}: ${marker} Peak=${result.peakVelocity.toFixed(3)} m/s | ` +
        `Mean=${result.meanVelocity.toFixed(3)} m/s | ${zone} | ` +
        `Gravity=${result.gravityBaseline.toFixed(3)} | ` +
        `AccelRange=[${result.accelMagRange.min.toFixed(2)}, ${result.accelMagRange.max.toFixed(2)}] | ` +
        `Samples=${result.sampleCount} | Duration=${result.durationMs}ms`
      );
    }
    console.log();
  }

  // Summary
  if (allResults.length > 0) {
    const peaks = allResults.map(r => r.peakVelocity);
    const gravities = allResults.map(r => r.gravityBaseline);
    
    console.log('=== SUMMARY ===');
    console.log(`  Total reps analyzed: ${allResults.length}`);
    console.log(`  Peak velocity range: ${Math.min(...peaks).toFixed(3)} - ${Math.max(...peaks).toFixed(3)} m/s`);
    console.log(`  Average peak velocity: ${mean(peaks).toFixed(3)} m/s`);
    console.log(`  Gravity baseline range: ${Math.min(...gravities).toFixed(3)} - ${Math.max(...gravities).toFixed(3)}`);
    
    // Velocity loss across reps
    if (allResults.length >= 2) {
      const first = peaks[0];
      const last = peaks[peaks.length - 1];
      const loss = ((first - last) / first * 100).toFixed(1);
      console.log(`  Velocity loss (first→last): ${loss}%`);
      console.log(`  (>10% = significant fatigue in VBT literature)`);
    }

    // Sanity checks
    console.log('\n=== SANITY CHECKS ===');
    const avgGravity = mean(gravities);
    console.log(`  Gravity ≈ 9.81? ${avgGravity.toFixed(3)} → ${Math.abs(avgGravity - 9.81) < 1.0 ? '✅ OK' : '⚠️ Off'}`);
    
    const avgPeak = mean(peaks);
    console.log(`  Velocity realistic (0.1-2.5 m/s)? ${avgPeak.toFixed(3)} → ${avgPeak >= 0.1 && avgPeak <= 2.5 ? '✅ OK' : '⚠️ Check'}`);
    
    // Check for velocity drop pattern (fatigue should show declining velocity)
    if (allResults.length >= 3) {
      const firstHalf = mean(peaks.slice(0, Math.floor(peaks.length / 2)));
      const secondHalf = mean(peaks.slice(Math.floor(peaks.length / 2)));
      const dropPercent = ((firstHalf - secondHalf) / firstHalf * 100).toFixed(1);
      console.log(`  First-half vs second-half velocity: ${firstHalf.toFixed(3)} vs ${secondHalf.toFixed(3)} (${dropPercent}% drop)`);
    }

    // Show raw sample for first rep (for deep debugging)
    const firstRep = workoutData.sets[0]?.reps?.[0];
    if (firstRep?.samples?.length > 0) {
      console.log('\n=== FIRST REP RAW SAMPLE (first 5 data points) ===');
      console.log('  Available fields:', Object.keys(firstRep.samples[0]));
      firstRep.samples.slice(0, 5).forEach((s, i) => {
        const mag = s.accelMag || Math.sqrt((s.accelX || 0) ** 2 + (s.accelY || 0) ** 2 + (s.accelZ || 0) ** 2);
        console.log(
          `  [${i}] accelX=${(s.accelX || 0).toFixed(3)} accelY=${(s.accelY || 0).toFixed(3)} ` +
          `accelZ=${(s.accelZ || 0).toFixed(3)} mag=${mag.toFixed(3)} ` +
          `gyroX=${(s.gyroX || 0).toFixed(3)} gyroY=${(s.gyroY || 0).toFixed(3)} gyroZ=${(s.gyroZ || 0).toFixed(3)} ` +
          `ts_ms=${s.timestamp_ms} ts=${s.timestamp} ` +
          `type_ts_ms=${typeof s.timestamp_ms} type_ts=${typeof s.timestamp}`
        );
      });
      console.log('\n  Rep-level data:', JSON.stringify({ 
        repNumber: firstRep.repNumber, 
        setNumber: firstRep.setNumber,
        duration: firstRep.duration,
        sampleCount: firstRep.sampleCount,
        repKeys: Object.keys(firstRep).filter(k => k !== 'samples')
      }, null, 2));
    }
  }
}

main();
