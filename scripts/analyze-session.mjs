/**
 * Session Analysis Script
 * 
 * Fetches workout data from GCS and analyzes ROM calculation,
 * rep duration, and segmentation issues.
 * 
 * Usage: node scripts/analyze-session.mjs [gcsPath]
 */

import { Storage } from '@google-cloud/storage';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'applift-imu-data';
const TARGET_PATH = process.argv[2] || 'users/knTxVIBqYgZ3yjUM46EoTYov6Z02/barbell/flat-bench-barbell-press/20260306_wej88ikyzh0';

// Init GCS
const storage = new Storage({
  projectId: process.env.GCS_PROJECT_ID,
  credentials: {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
});

// ============ Analysis Functions ============

function analyzeRepDuration(rep) {
  const samples = rep.samples || [];
  if (samples.length < 2) return null;
  
  const timestamps = samples.map(s => s.timestamp_ms ?? 0);
  const actualDuration = timestamps[timestamps.length - 1] - timestamps[0];
  const storedDuration = rep.duration;
  
  // Calculate based on sample count at 20Hz
  const expectedDuration = (samples.length - 1) * 50; // 50ms between samples at 20Hz
  
  return {
    repNumber: rep.repNumber,
    sampleCount: samples.length,
    storedDuration: storedDuration,
    timestampDuration: actualDuration,
    expectedDuration20Hz: expectedDuration,
    firstTimestamp: timestamps[0],
    lastTimestamp: timestamps[timestamps.length - 1],
    avgSampleInterval: samples.length > 1 ? actualDuration / (samples.length - 1) : 0
  };
}

function analyzeStrokeROM(samples, gravityMag = 9.81) {
  if (!samples || samples.length < 5) return null;
  
  // Re-implement retroCorrect for analysis
  const n = samples.length;
  const STILL_ACCEL = 0.25;
  const STILL_GYRO = 0.10;
  const DEG2RAD = Math.PI / 180;
  
  // Extract raw sensor data
  const rawData = samples.map(s => ({
    ax: s.accelX || 0,
    ay: s.accelY || 0,
    az: s.accelZ || 0,
    gx: s.gyroX || 0,
    gy: s.gyroY || 0,
    gz: s.gyroZ || 0,
    ts: s.timestamp_ms ?? 0
  }));
  
  // Detect rest segments
  const isStill = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const s = rawData[i];
    const aMag = Math.sqrt(s.ax ** 2 + s.ay ** 2 + s.az ** 2);
    const aMagDev = Math.abs(aMag - gravityMag);
    const gMag = Math.sqrt(s.gx ** 2 + s.gy ** 2 + s.gz ** 2);
    const gMagRad = gMag * DEG2RAD; // Assuming degrees
    isStill[i] = (aMagDev < STILL_ACCEL && gMagRad < STILL_GYRO) ? 1 : 0;
  }
  
  // Find rest segments
  const restSegs = [];
  let rStart = -1;
  for (let i = 0; i < n; i++) {
    if (isStill[i]) {
      if (rStart < 0) rStart = i;
    } else {
      if (rStart >= 0 && (i - rStart) >= 2) restSegs.push([rStart, i - 1]);
      rStart = -1;
    }
  }
  if (rStart >= 0 && (n - rStart) >= 2) restSegs.push([rStart, n - 1]);
  
  // Estimate gravity from first rest segment
  let localGravityVec = { x: 0, y: 0, z: 1 };
  let localGravityMag = gravityMag;
  
  if (restSegs.length > 0) {
    const [firstStart, firstEnd] = restSegs[0];
    let gx = 0, gy = 0, gz = 0;
    const count = firstEnd - firstStart + 1;
    for (let i = firstStart; i <= firstEnd; i++) {
      gx += rawData[i].ax;
      gy += rawData[i].ay;
      gz += rawData[i].az;
    }
    gx /= count; gy /= count; gz /= count;
    const gMag = Math.sqrt(gx*gx + gy*gy + gz*gz);
    if (gMag > 8.0 && gMag < 12.0) {
      localGravityMag = gMag;
      localGravityVec = { x: gx/gMag, y: gy/gMag, z: gz/gMag };
    }
  }
  
  // Project acceleration onto gravity axis
  const rawAcc = [];
  const dts = [];
  for (let i = 0; i < n; i++) {
    const s = rawData[i];
    if (i > 0) {
      const dt = (s.ts - rawData[i - 1].ts) / 1000;
      dts.push((dt > 0 && dt < 0.5) ? dt : 0);
    } else {
      dts.push(0);
    }
    const vertComponent = s.ax * localGravityVec.x + s.ay * localGravityVec.y + s.az * localGravityVec.z;
    rawAcc.push(vertComponent - localGravityMag);
  }
  
  // Calculate acceleration bias
  let biasSum = 0, biasN = 0;
  restSegs.forEach(([s, e]) => {
    for (let i = s; i <= e; i++) { biasSum += rawAcc[i]; biasN++; }
  });
  const accBias = biasN > 5 ? biasSum / biasN : rawAcc.reduce((a,b) => a+b, 0) / n;
  
  // Remove bias and apply noise floor
  const acc = rawAcc.map((a, i) => {
    let val = a - accBias;
    if (isStill[i]) return 0;
    if (Math.abs(val) < 0.06) return 0;
    return val;
  });
  
  // Forward-backward velocity integration
  const vFwd = [0];
  for (let i = 1; i < n; i++) {
    vFwd.push(vFwd[i - 1] + (acc[i - 1] + acc[i]) / 2 * dts[i]);
  }
  
  const vBwd = new Array(n).fill(0);
  for (let i = n - 2; i >= 0; i--) {
    vBwd[i] = vBwd[i + 1] - (acc[i] + acc[i + 1]) / 2 * dts[i + 1];
  }
  
  // Average forward and backward
  const vel = vFwd.map((v, i) => (v + vBwd[i]) / 2);
  
  // Integrate position
  const pos = [0];
  for (let i = 1; i < n; i++) {
    pos.push(pos[i - 1] + (vel[i - 1] + vel[i]) / 2 * dts[i]);
  }
  
  // Find peak displacement
  const maxD = Math.max(...pos);
  const minD = Math.min(...pos);
  const peakAbs = Math.max(Math.abs(maxD), Math.abs(minD));
  const rawRom = maxD - minD;
  
  return {
    restSegments: restSegs.length,
    gravityMag: localGravityMag,
    accBias: accBias,
    peakDisplacement: peakAbs * 100, // cm
    maxDisplacement: maxD * 100,
    minDisplacement: minD * 100,
    rom: rawRom * 100
  };
}

function findPhaseTimings(samples) {
  if (!samples || samples.length < 3) return null;
  
  // Use pitch for turning point detection (like calibration)
  const pitch = samples.map(s => s.pitch ?? 0);
  const timestamps = samples.map(s => s.timestamp_ms ?? 0);
  
  if (pitch.every(p => p === 0)) {
    // No pitch data, use accel magnitude
    const accelMag = samples.map(s => s.accelMag || s.filteredMag || 0);
    const maxIdx = accelMag.indexOf(Math.max(...accelMag));
    const duration = timestamps[timestamps.length - 1] - timestamps[0];
    const toMaxTime = timestamps[maxIdx] - timestamps[0];
    return {
      turningIdx: maxIdx,
      liftingTime: toMaxTime,
      loweringTime: duration - toMaxTime,
      method: 'accelMag'
    };
  }
  
  // Find pitch extremes
  const minPitch = Math.min(...pitch);
  const maxPitch = Math.max(...pitch);
  const minIdx = pitch.indexOf(minPitch);
  const maxIdx = pitch.indexOf(maxPitch);
  
  const duration = timestamps[timestamps.length - 1] - timestamps[0];
  const toMinTime = timestamps[minIdx] - timestamps[0];
  const toMaxTime = timestamps[maxIdx] - timestamps[0];
  
  return {
    pitchRange: maxPitch - minPitch,
    minPitchIdx: minIdx,
    maxPitchIdx: maxIdx,
    minPitch,
    maxPitch,
    toMinTimeMs: toMinTime,
    toMaxTimeMs: toMaxTime,
    durationMs: duration,
    method: 'pitch'
  };
}

async function main() {
  console.log('=== Session Analysis Script ===');
  console.log(`Target path: ${TARGET_PATH}`);
  console.log(`GCS Bucket: ${BUCKET_NAME}`);

  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const filePath = `${TARGET_PATH}/workout_data.json`;
    const file = bucket.file(filePath);
    
    console.log(`\nDownloading: ${filePath}`);
    const [content] = await file.download();
    const workoutData = JSON.parse(content.toString('utf8'));
    
    // Save to local file for inspection
    writeFileSync(resolve(__dirname, '..', 'gcs_session_data.json'), JSON.stringify(workoutData, null, 2));
    console.log('\nSaved to gcs_session_data.json');

    console.log('\n=== WORKOUT METADATA ===');
    console.log(`  Workout ID: ${workoutData.workoutId}`);
    console.log(`  Exercise: ${workoutData.exercise}`);
    console.log(`  Equipment: ${workoutData.equipment}`);
    console.log(`  User: ${workoutData.odUSerId}`);
    console.log(`  Sets: ${workoutData.sets?.length}`);
    console.log(`  GCS Path: ${workoutData.gcsPath}`);

    if (!workoutData.sets || workoutData.sets.length === 0) {
      console.log('No sets found in workout data.');
      return;
    }

    console.log('\n=== REP DURATION ANALYSIS ===');
    console.log('Expected: Video-based times - Rep1=3.2s, Rep2=3.1s, Rep3=3s, Rep4=3.5s, Rep5=3.2s\n');

    for (const set of workoutData.sets) {
      console.log(`--- Set ${set.setNumber} (${set.reps?.length || 0} reps) ---`);
      
      if (!set.reps) continue;

      for (const rep of set.reps) {
        const durationAnalysis = analyzeRepDuration(rep);
        if (durationAnalysis) {
          console.log(`\nRep ${durationAnalysis.repNumber}:`);
          console.log(`  Sample count: ${durationAnalysis.sampleCount}`);
          console.log(`  Stored duration: ${durationAnalysis.storedDuration}ms (${(durationAnalysis.storedDuration/1000).toFixed(2)}s)`);
          console.log(`  Timestamp duration: ${durationAnalysis.timestampDuration}ms (${(durationAnalysis.timestampDuration/1000).toFixed(2)}s)`);
          console.log(`  Expected @20Hz: ${durationAnalysis.expectedDuration20Hz}ms (${(durationAnalysis.expectedDuration20Hz/1000).toFixed(2)}s)`);
          console.log(`  Avg sample interval: ${durationAnalysis.avgSampleInterval.toFixed(1)}ms`);
          console.log(`  First/Last timestamp: ${durationAnalysis.firstTimestamp}ms - ${durationAnalysis.lastTimestamp}ms`);
        }
      }
    }

    console.log('\n=== ROM ANALYSIS ===');
    console.log('Rep 3 was done with intentionally incomplete ROM - should show <100%\n');

    for (const set of workoutData.sets) {
      if (!set.reps) continue;

      for (const rep of set.reps) {
        const romAnalysis = analyzeStrokeROM(rep.samples);
        if (romAnalysis) {
          console.log(`\nRep ${rep.repNumber} ROM Analysis:`);
          console.log(`  Rest segments detected: ${romAnalysis.restSegments}`);
          console.log(`  Gravity magnitude: ${romAnalysis.gravityMag.toFixed(3)} m/s²`);
          console.log(`  Accel bias: ${romAnalysis.accBias.toFixed(4)} m/s²`);
          console.log(`  Peak displacement: ${romAnalysis.peakDisplacement.toFixed(1)} cm`);
          console.log(`  Max/Min: ${romAnalysis.maxDisplacement.toFixed(1)}/${romAnalysis.minDisplacement.toFixed(1)} cm`);
          console.log(`  ROM (max-min): ${romAnalysis.rom.toFixed(1)} cm`);
        }
      }
    }

    console.log('\n=== PHASE TIMING ANALYSIS ===');
    console.log('Segmentation should stop at lowering phase end\n');

    for (const set of workoutData.sets) {
      if (!set.reps) continue;

      for (const rep of set.reps) {
        const phaseAnalysis = findPhaseTimings(rep.samples);
        if (phaseAnalysis) {
          console.log(`\nRep ${rep.repNumber} Phase Analysis:`);
          if (phaseAnalysis.method === 'pitch') {
            console.log(`  Pitch range: ${phaseAnalysis.pitchRange.toFixed(1)}° (${phaseAnalysis.minPitch.toFixed(1)} to ${phaseAnalysis.maxPitch.toFixed(1)})`);
            console.log(`  Min pitch at: idx=${phaseAnalysis.minPitchIdx}, time=${phaseAnalysis.toMinTimeMs}ms`);
            console.log(`  Max pitch at: idx=${phaseAnalysis.maxPitchIdx}, time=${phaseAnalysis.toMaxTimeMs}ms`);
            console.log(`  Total duration: ${phaseAnalysis.durationMs}ms`);
          } else {
            console.log(`  Turning point at: idx=${phaseAnalysis.turningIdx}`);
            console.log(`  Lifting time: ${phaseAnalysis.liftingTime}ms`);
            console.log(`  Lowering time: ${phaseAnalysis.loweringTime}ms`);
          }
        }
      }
    }

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (err.code === 404) {
      console.log('File not found. Listing available files...');
      const bucket = storage.bucket(BUCKET_NAME);
      const [files] = await bucket.getFiles({ prefix: TARGET_PATH.split('/').slice(0, 4).join('/'), maxResults: 20 });
      files.forEach(f => console.log(`  - ${f.name}`));
    }
  }
}

main();
