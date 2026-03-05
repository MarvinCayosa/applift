/**
 * ROMComputer - Range of Motion calculator
 * 
 * Supports two ROM types (same calibration flow, different computation):
 * 
 * - ANGLE ROM (dumbbell exercises):
 *   Uses quaternion angular displacement. Sensor rotates with the dumbbell,
 *   so ROM = angular range (degrees) of the primary rotation axis.
 * 
 * - STROKE ROM (barbell / weight stack exercises):
 *   Sensor on the bar or flat on the weight stack — constrained to 1D vertical motion.
 *   Applied to: Bench Press, Back Squats, Lateral Pulldown, Seated Leg Extension.
 *   VERTICAL ONLY — horizontal and diagonal acceleration are ignored.
 *   1. At rest, capture gravity vector → compute unit vector (vertical reference axis).
 *   2. Each sample: project raw accel onto gravity unit vector → vertical-only linear accel.
 *   3. Double-integrate per rep: accel → velocity → displacement (cm).
 *   4. ZUPT (Zero-Velocity Update) at top/bottom of each rep kills drift.
 *   ROM = peak-to-trough vertical displacement within a rep.
 * 
 * Calibration flow (identical for both types):
 * 1. User holds starting position for 3 seconds (baseline capture)
 * 2. User performs 3 full-ROM reps
 * 3. Average ROM of 3 reps becomes the target
 * 4. Each subsequent rep shows fulfillment % against target
 */

// Exercise code → ROM type mapping
// Dumbbell exercises (0,1) = angle, everything else = stroke
// Stroke ROM only applies to vertical-motion exercises:
//   Bench Press, Back Squats, Lateral Pulldown, Seated Leg Extension
const EXERCISE_ROM_TYPE = {
  0: 'angle', // Concentration Curls
  1: 'angle', // Overhead Extension
  2: 'stroke', // Bench Press (vertical bar path)
  3: 'stroke', // Back Squats (vertical bar path)
  4: 'stroke', // Lateral Pulldown (vertical stack motion)
  5: 'stroke', // Seated Leg Extension (vertical stack motion)
};

// Physical maximum ROM per exercise (degrees for angle, cm for stroke)
// Anything above these values is definitely sensor drift / integration error.
const EXERCISE_MAX_ROM = {
  0: 180,  // Concentration Curls (angle)
  1: 180,  // Overhead Extension (angle)
  2: 80,   // Bench Press — chest to lockout ≈ 40-60cm, 80cm generous max
  3: 100,  // Back Squats — full depth ≈ 50-80cm, 100cm generous max
  4: 80,   // Lateral Pulldown — full pull ≈ 50-70cm
  5: 60,   // Seated Leg Extension — full extension ≈ 30-50cm
};

// Equipment name → exercise code mapping for lookup
const EQUIPMENT_EXERCISE_MAP = {
  'dumbbell': { 'concentration curls': 0, 'overhead extension': 1 },
  'barbell': { 'bench press': 2, 'back squats': 3 },
  'weight stack': { 'lateral pulldown': 4, 'seated leg extension': 5, 'leg extension': 5 },
};

export class ROMComputer {
  constructor() {
    this.exerciseType = 0;
    this.repROMs = [];
    this.currentRepData = [];
    
    // Angle ROM state (quaternion-based)
    this.baselineQuat = null;       // {w,x,y,z} at neutral
    this.primaryAxis = null;        // auto-detected: 'roll','pitch','yaw'
    this.baselineAngle = null;      // Euler baseline
    
    // Stroke ROM state — VERTICAL ONLY displacement via gravity-axis projection
    // Simple approach: double-integrate vertical acceleration to get displacement
    // Reset to 0cm after each rep for consistent measurements
    this.velocity = 0;
    this.displacement = 0;
    this.lastTimestamp = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.baselineGravity = null;    // calibrated gravity vector {x,y,z} from baseline hold
    this.gravityUnitVec = null;     // unit vector along gravity axis (vertical reference)
    this.gravityMag = 9.81;         // calibrated gravity magnitude (from rest accel vector norm)
    this.gravityInitSamples = [];   // buffer: first N accel samples averaged for robust gravity
    this.GRAVITY_INIT_COUNT = 3;    // FAST: only 3 samples (~0.15s at 20Hz) for quick reset
    this.storedGravity = null;      // Store good gravity baseline for instant reuse
    this.storedGravityUnitVec = null;
    this.storedGravityMag = 9.81;
    this.gyroBias = {x:0,y:0,z:0}; // calibrated gyro offset (native units) from baseline hold
    this.gyroInRadians = false;     // auto-detected: true if ESP32 outputs rad/s
    this.stillCounter = 0;          // consecutive near-zero samples for ZUPT
    this.NOISE_FLOOR = 0.15;        // m/s² — acceleration dead-zone (raised from 0.06 to reject MEMS noise)
    this.ZUPT_THRESHOLD = 0.20;     // m/s² — accel-magnitude rest detection for ZUPT (relaxed for hand vibration)
    this.GYRO_STILL_RAD = 0.08;     // rad/s — gyro rest detection (~4.6°/s, relaxed)
    this.ZUPT_SAMPLES = 3;          // consecutive still samples to trigger ZUPT (more conservative)
    this.ZUPT_DECAY = 0.03;         // very aggressive velocity decay at rest (was 0.4)
    this.MAX_DISPLACEMENT = 1.0;    // meters (100 cm) — no exercise exceeds this
    this.MAX_VELOCITY = 1.5;        // m/s — velocity clamp (typical exercise bar speed < 1 m/s)
    this.prevVertAccel = 0;         // previous vertical accel for EMA smoothing
    this.prevVertAccel2 = 0;        // second-stage EMA state for cascaded filter
    this.DEG2RAD = Math.PI / 180;   // conversion constant for gyro unit handling
    this.DEBUG_MODE = false;        // set to true for extra logging
    
    // Target ROM & Calibration
    this.targetROM = null;          // target ROM from calibration reps (degrees or cm)
    this.isCalibrationRep = false;  // true during calibration rep
    this.romCalibrated = false;     // true after target ROM is set
    this.calibrationROMs = [];      // ROMs from calibration reps (for averaging 3 reps)
    
    // Within-rep tracking (position-independent: max - min within the rep)
    this.repMinAngle = Infinity;    // tracks min angle within current rep
    this.repMaxAngle = -Infinity;   // tracks max angle within current rep
    
    // Live tracking
    this.liveAngleDeg = 0;          // current angle from baseline (degrees)
    this.liveDisplacementCm = 0;    // current displacement (cm)
    this.liveVelocity = 0;
    this.liveFulfillment = 0;       // current rep ROM / targetROM * 100
    this.liveRepROM = 0;            // current rep ROM (max-min so far)
    this.liveAdjustedROM = 0;       // retro-corrected live ROM for stroke exercises
    this.sampleHistory = [];        // last N samples for live chart
    
    // Pre-rep buffer: keep last N samples BEFORE rep starts so retroCorrect has rest data
    this.preRepBuffer = [];         // rolling buffer of recent samples
    this.savedPreRepBuffer = null;  // snapshot of preRepBuffer saved after each rep
    this.PRE_REP_BUFFER_SIZE = 30;  // ~0.5s at 60Hz - enough to capture pre-motion stillness
    this.maxHistorySize = 200;      // ~10s at 20Hz
    
    // Stroke rolling buffer: keeps ALL recent raw samples across rep boundaries.
    // RepCounter detects half-reps (valley→peak or peak→valley), so splitting
    // currentRepData at those boundaries gives ROM only half the motion.
    // Instead, we retroCorrect the last ~4s of samples and extract peak-to-trough.
    this.strokeRollingBuffer = [];  // raw sensor data for last ~4s
    this.STROKE_BUFFER_DURATION = 4000; // ms — 4 seconds of data
    this.emaInitialized = false;    // whether EMA filter has been primed
  }
  
  // ---- ROM type detection ----
  getROMType(exerciseCode) {
    return EXERCISE_ROM_TYPE[exerciseCode] || 'angle';
  }
  
  /**
   * Set exercise from equipment/exercise name strings.
   * Uses word-based matching: ALL words in the map key must appear in the
   * input exercise name (order-independent). This handles cases like
   * "Flat Bench Barbell Press" matching map key "bench press" even though
   * the words aren't contiguous in the full name.
   */
  setExerciseFromNames(equipmentName, exerciseName) {
    if (!equipmentName || !exerciseName) return;
    const eqKey = equipmentName.toLowerCase().trim();
    const exKey = exerciseName.toLowerCase().trim();
    
    for (const [eq, exercises] of Object.entries(EQUIPMENT_EXERCISE_MAP)) {
      if (eqKey.includes(eq)) {
        // First try exact match
        if (exercises[exKey] !== undefined) {
          this.setExercise(exercises[exKey]);
          return;
        }
        // Then try word-based matching: every word in the map key must
        // appear somewhere in the input exercise name
        for (const [ex, code] of Object.entries(exercises)) {
          const mapWords = ex.split(/\s+/);
          if (mapWords.every(w => exKey.includes(w))) {
            console.log(`[ROMComputer] Matched "${equipmentName}/${exerciseName}" → exercise code ${code} (${this.getROMType(code)})`);
            this.setExercise(code);
            return;
          }
        }
      }
    }
    // Default to angle ROM for dumbbell
    if (eqKey.includes('dumbbell')) {
      this.setExercise(0);
    }
  }
  
  setExercise(exerciseCode) {
    this.exerciseType = exerciseCode;
    this.reset();
  }
  
  // ---- Quaternion math helpers (from index.html) ----
  quatConjugate(q) {
    return { w: q.w, x: -q.x, y: -q.y, z: -q.z };
  }
  
  quatMultiply(a, b) {
    return {
      w: a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z,
      x: a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
      y: a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x,
      z: a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w
    };
  }
  
  quatToEuler(q) {
    const sinr = 2 * (q.w * q.x + q.y * q.z);
    const cosr = 1 - 2 * (q.x * q.x + q.y * q.y);
    const roll = Math.atan2(sinr, cosr) * (180 / Math.PI);
    
    let pitch;
    const sinp = 2 * (q.w * q.y - q.z * q.x);
    if (Math.abs(sinp) >= 1) {
      pitch = Math.sign(sinp) * 90;
    } else {
      pitch = Math.asin(sinp) * (180 / Math.PI);
    }
    
    const siny = 2 * (q.w * q.z + q.x * q.y);
    const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
    const yaw = Math.atan2(siny, cosy) * (180 / Math.PI);
    
    return { roll, pitch, yaw };
  }
  
  // Angle between two quaternions in degrees
  quatAngleDeg(q1, q2) {
    const dot = q1.w*q2.w + q1.x*q2.x + q1.y*q2.y + q1.z*q2.z;
    const clamped = Math.min(1, Math.max(-1, Math.abs(dot)));
    return 2 * Math.acos(clamped) * (180 / Math.PI);
  }
  
  rotateVector(v, q) {
    const p = { w: 0, x: v.x, y: v.y, z: v.z };
    const r = this.quatMultiply(this.quatMultiply(q, p), this.quatConjugate(q));
    return { x: r.x, y: r.y, z: r.z };
  }

  /**
   * Project raw acceleration onto the gravity axis (vertical only).
   * Returns the signed scalar component along the gravity direction minus gravity magnitude.
   * This ignores ALL horizontal and diagonal acceleration — only vertical motion is measured.
   *
   * Why not quaternion rotation?
   *   Quaternion rotation maps accel to a full 3D world frame, then extracts world-Z.
   *   If the quaternion has drift or orientation error, horizontal accelerations leak into Z.
   *   Gravity-axis projection is immune to this — it uses the stable gravity reference
   *   established at rest, projecting raw accel directly onto that axis.
   */
  projectOnGravity(ax, ay, az) {
    if (!this.gravityUnitVec) return 0;
    const gu = this.gravityUnitVec;
    // dot(rawAccel, gravityUnitVector) = component along gravity axis
    const verticalComponent = ax * gu.x + ay * gu.y + az * gu.z;
    // Subtract gravity magnitude to get linear vertical acceleration
    return verticalComponent - this.gravityMag;
  }
  
  // ---- Main sample entry ----
  addSample(data) {
    const { roll, pitch, yaw, qw, qx, qy, qz, accelX, accelY, accelZ, gyroX, gyroY, gyroZ, timestamp } = data;
    const romType = this.getROMType(this.exerciseType);
    const q = { w: qw || 0, x: qx || 0, y: qy || 0, z: qz || 0 };
    
    // Skip if no valid quaternion data
    if (qw === undefined && qx === undefined) return;
    
    if (romType === 'angle') {
      this.addAngleSample(roll || 0, pitch || 0, yaw || 0, q, timestamp);
    } else {
      // Stroke exercises (barbell/weight stack) now use gyro data for ZUPT stillness detection
      this.addStrokeSample(q, accelX || 0, accelY || 0, accelZ || 0, gyroX || 0, gyroY || 0, gyroZ || 0, timestamp);
    }
  }
  
  // ---- ANGLE ROM (Quaternion-based) - from index.html ----
  addAngleSample(roll, pitch, yaw, q, timestamp) {
    // Set baseline on first sample (auto)
    if (this.baselineQuat === null) {
      this.baselineQuat = { ...q };
      this.baselineAngle = { roll, pitch, yaw };
    }
    
    // Total angular displacement from baseline (single scalar, degrees)
    // This is the TRUE rotation angle — immune to Euler wrapping/gimbal lock
    this.liveAngleDeg = this.quatAngleDeg(this.baselineQuat, q);
    
    // Per-axis delta, wrap-corrected to [-180, 180] to avoid discontinuities
    // when Euler angles cross the ±180° atan2 boundary
    const wrapDelta = (a) => { let d = a % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
    const deltaRoll = wrapDelta(roll - this.baselineAngle.roll);
    const deltaPitch = wrapDelta(pitch - this.baselineAngle.pitch);
    const deltaYaw = wrapDelta(yaw - this.baselineAngle.yaw);
    
    // Always use quaternion angular displacement for ROM tracking.
    // Euler decomposition suffers from wrapping artifacts at ±180° boundaries
    // that inflate ROM values (e.g. 350° instead of 130° for concentration curls).
    const trackValue = this.liveAngleDeg;
    this.repMinAngle = Math.min(this.repMinAngle, trackValue);
    this.repMaxAngle = Math.max(this.repMaxAngle, trackValue);
    this.liveRepROM = this.repMaxAngle - this.repMinAngle;
    
    // Update fulfillment
    if (this.targetROM && this.targetROM > 0) {
      this.liveFulfillment = Math.min(150, (this.liveRepROM / this.targetROM) * 100);
    }
    
    this.currentRepData.push({
      roll: deltaRoll,
      pitch: deltaPitch,
      yaw: deltaYaw,
      totalAngle: this.liveAngleDeg,
      timestamp
    });
    
    // Update live chart history
    this.sampleHistory.push({ t: timestamp, v: this.liveRepROM });
    if (this.sampleHistory.length > this.maxHistorySize) this.sampleHistory.shift();
  }
  
  // ---- STROKE ROM (VERTICAL ONLY displacement) ----
  // VERTICAL ONLY: Projects acceleration onto the gravity axis established at rest.
  // Ignores ALL horizontal and diagonal acceleration components.
  // Resets to 0cm after each rep for consistent measurements.
  addStrokeSample(q, accelX, accelY, accelZ, gyroX, gyroY, gyroZ, timestamp) {
    // === Gravity initialization ===
    // Fast: use stored gravity if available, otherwise collect 3 samples
    if (this.baselineGravity === null) {
      // Use stored gravity for instant start (no delay between reps)
      if (this.storedGravity !== null) {
        this.baselineGravity = this.storedGravity;
        this.gravityUnitVec = this.storedGravityUnitVec;
        this.gravityMag = this.storedGravityMag;
        // DON'T set lastTimestamp here - let it be set later so dt > 0 and this sample is processed
        console.log(`⚡ [ROM] Using stored gravity - instant 0cm reset`);
      } else {
        // First time: collect samples to establish gravity baseline
        this.gravityInitSamples.push({ x: accelX, y: accelY, z: accelZ });
        this.lastTimestamp = timestamp;
        
        if (this.gravityInitSamples.length < this.GRAVITY_INIT_COUNT) {
          return; // Still collecting samples
        }
        
        // Average samples for gravity estimation
        let avgAx = 0, avgAy = 0, avgAz = 0;
        this.gravityInitSamples.forEach(s => { avgAx += s.x; avgAy += s.y; avgAz += s.z; });
        const count = this.gravityInitSamples.length;
        avgAx /= count; avgAy /= count; avgAz /= count;
        
        this.baselineGravity = { x: avgAx, y: avgAy, z: avgAz };
        this.gravityMag = Math.sqrt(avgAx*avgAx + avgAy*avgAy + avgAz*avgAz);
        if (this.gravityMag > 0) {
          this.gravityUnitVec = {
            x: avgAx / this.gravityMag,
            y: avgAy / this.gravityMag,
            z: avgAz / this.gravityMag
          };
        }
        // Store for instant reuse after rep reset
        this.storedGravity = this.baselineGravity;
        this.storedGravityUnitVec = this.gravityUnitVec;
        this.storedGravityMag = this.gravityMag;
        this.gravityInitSamples = [];
        console.log(`🔍 [ROM] Gravity baseline set: mag=${this.gravityMag.toFixed(3)}`);
        return;
      }
    }
    
    if (this.lastTimestamp === 0) { this.lastTimestamp = timestamp; return; }
    const dt = (timestamp - this.lastTimestamp) / 1000;
    if (dt <= 0 || dt >= 0.5) { this.lastTimestamp = timestamp; return; }
    this.lastTimestamp = timestamp;
    
    // === STEP 1: Gravity-axis projection (VERTICAL ONLY) ===
    // Project raw acceleration onto the gravity unit vector.
    // This extracts ONLY the vertical component — horizontal is ignored.
    const rawVertAccel = this.projectOnGravity(accelX, accelY, accelZ);
    
    // === STEP 2: Cascaded EMA smoothing (2-stage) ===
    // Two-stage EMA gives ~12dB/octave noise rolloff (-3dB at ~4Hz for 20Hz sampling).
    // Single-stage at 0.25 prev was too weak — noise passed through to double integration
    // causing quadratic position drift. Two stages of 0.4/0.6 is equivalent to a
    // ~4th-order IIR filter with good noise rejection while preserving 0.5-2Hz exercise motion.
    //
    // IMPORTANT: Prime EMA from first sample instead of starting from 0.
    // Starting from 0 attenuates the first 3-5 samples by 35-64%, which causes
    // the first rep's live displacement to be severely under-reported.
    if (!this.emaInitialized) {
      this.prevVertAccel = rawVertAccel;
      this.prevVertAccel2 = rawVertAccel;
      this.emaInitialized = true;
    }
    const stage1 = 0.4 * this.prevVertAccel + 0.6 * rawVertAccel;
    const vertAccel = 0.4 * this.prevVertAccel2 + 0.6 * stage1;
    this.prevVertAccel = stage1;
    this.prevVertAccel2 = vertAccel;
    
    // === STEP 3: Dead-zone (sensor noise floor) ===
    // Raised from 0.06 to 0.15 m/s² — MEMS accelerometers have RMS noise ~0.07-0.3 m/s²
    // at 20-50Hz. Setting below noise floor lets garbage accumulate through double integration.
    const accelInput = Math.abs(vertAccel) < this.NOISE_FLOOR ? 0 : vertAccel;
    
    // === STEP 4: ZUPT — combined accel + gyro stillness detection ===
    // Old approach: accel-only, missed cases where sensor drifts while "still".
    // New approach: checks BOTH accel magnitude deviation from gravity AND gyro rotation rate.
    // Equipment is only "still" when neither accelerating nor rotating.
    const accelMagDev = Math.abs(Math.sqrt(accelX*accelX+accelY*accelY+accelZ*accelZ) - this.gravityMag);
    const gyroMagRaw = Math.sqrt(gyroX*gyroX + gyroY*gyroY + gyroZ*gyroZ);
    // Convert to rad/s for comparison if gyro is in deg/s (auto-detected during calibration)
    const gyroMagRad = this.gyroInRadians ? gyroMagRaw : gyroMagRaw * this.DEG2RAD;
    const isStill = accelMagDev < this.ZUPT_THRESHOLD && gyroMagRad < this.GYRO_STILL_RAD;
    
    if (isStill) {
      this.stillCounter++;
    } else {
      this.stillCounter = 0;
    }
    
    if (this.stillCounter >= this.ZUPT_SAMPLES) {
      // Very aggressive decay (0.03) — much faster zero-lock than old 0.4
      const oldVel = this.velocity;
      this.velocity *= this.ZUPT_DECAY;
      if (Math.abs(this.velocity) < 0.001) this.velocity = 0;
      if (this.DEBUG_MODE && oldVel !== 0 && this.velocity === 0) {
        console.log(`🛑 [ROM DEBUG] ZUPT triggered - velocity zeroed (was ${oldVel.toFixed(4)})`);
      }
    }
    
    // === STEP 5: Trapezoidal integration ===
    // More accurate than old Euler integration (velocity += accel * dt).
    // Uses average of old and new velocity for displacement update.
    // No artificial drag (old 0.97 multiplier removed) — ZUPT handles drift instead.
    let newVelocity = this.velocity + accelInput * dt;
    // Clamp velocity to prevent runaway integration drift
    newVelocity = Math.max(-this.MAX_VELOCITY, Math.min(this.MAX_VELOCITY, newVelocity));
    this.displacement += (this.velocity + newVelocity) / 2 * dt;
    this.velocity = newVelocity;
    
    this.displacement = Math.max(-this.MAX_DISPLACEMENT, Math.min(this.MAX_DISPLACEMENT, this.displacement));
    
    if (this.DEBUG_MODE && this.currentRepData.length % 10 === 0) {
      console.log(`📏 [ROM] VertAccel:${vertAccel.toFixed(3)} Vel:${this.velocity.toFixed(4)} Disp:${(this.displacement*100).toFixed(1)}cm Still:${this.stillCounter}`);
    }
    
    this.peakDisplacement = Math.max(this.peakDisplacement, this.displacement);
    this.minDisplacement = Math.min(this.minDisplacement, this.displacement);
    
    // Convert to cm for display
    this.liveDisplacementCm = this.displacement * 100;
    this.liveVelocity = this.velocity;
    
    // Track within-rep min/max displacement (cm) for ROM = peak-to-trough
    this.repMinAngle = Math.min(this.repMinAngle, this.liveDisplacementCm);
    this.repMaxAngle = Math.max(this.repMaxAngle, this.liveDisplacementCm);
    this.liveRepROM = this.repMaxAngle - this.repMinAngle;
    
    // Update fulfillment % (use retro-corrected ROM when available for accuracy)
    if (this.targetROM && this.targetROM > 0) {
      const displayROM = this.liveAdjustedROM > 0 ? this.liveAdjustedROM : this.liveRepROM;
      this.liveFulfillment = Math.min(150, (displayROM / this.targetROM) * 100);
    }
    
    // Store RAW sensor data for retrospective correction (retroCorrect)
    // Live displacement is for real-time display; final ROM uses retroCorrect for accuracy
    this.currentRepData.push({
      // Raw sensor data (needed for retroCorrect)
      ax: accelX,
      ay: accelY,
      az: accelZ,
      gx: gyroX,
      gy: gyroY,
      gz: gyroZ,
      qw: q.w,
      qx: q.x,
      qy: q.y,
      qz: q.z,
      ts: timestamp,
      // Live integration (for display only)
      displacement: this.liveDisplacementCm,
      velocity: this.velocity,
      vertAccel: vertAccel
    });
    
    this.sampleHistory.push({ t: timestamp, v: this.liveRepROM });
    if (this.sampleHistory.length > this.maxHistorySize) this.sampleHistory.shift();
    
    // Periodic retro-correction for accurate live display (stroke exercises)
    // Run retroCorrect every ~15 samples to get drift-corrected ROM
    if (this.currentRepData.length > 10 && this.currentRepData.length % 15 === 0) {
      try {
        const retroResult = this.retroCorrect(this.currentRepData, false);
        if (retroResult && retroResult.rom > 0) {
          // Use max to prevent jitter (ROM only grows during a rep)
          this.liveAdjustedROM = Math.max(this.liveAdjustedROM, retroResult.rom);
        }
      } catch (e) {
        // Silently ignore — fall back to raw liveRepROM
      }
    }
    
    // Maintain pre-rep rolling buffer (for stroke exercises, so retroCorrect has rest segments)
    const romType = this.getROMType(this.exerciseType);
    if (romType === 'stroke') {
      const sampleForBuffer = {
        ax: accelX, ay: accelY, az: accelZ,
        gx: gyroX, gy: gyroY, gz: gyroZ,
        qw: q.w, qx: q.x, qy: q.y, qz: q.z,
        ts: timestamp,
        displacement: this.liveDisplacementCm,
        velocity: this.velocity,
        vertAccel: vertAccel
      };
      
      if (!this.isCalibrationRep) {
        this.preRepBuffer.push(sampleForBuffer);
        if (this.preRepBuffer.length > this.PRE_REP_BUFFER_SIZE) {
          this.preRepBuffer.shift();
        }
      }
      
      // Stroke rolling buffer: keeps last ~4s of raw data for full-cycle ROM extraction.
      // This buffer is NOT cleared between reps — it spans rep boundaries so that
      // retroCorrect always has a full up+down cycle regardless of where the RepCounter
      // splits the rep. Trimmed by timestamp, not sample count.
      this.strokeRollingBuffer.push(sampleForBuffer);
      const cutoff = timestamp - this.STROKE_BUFFER_DURATION;
      while (this.strokeRollingBuffer.length > 0 && this.strokeRollingBuffer[0].ts < cutoff) {
        this.strokeRollingBuffer.shift();
      }
    }
  }
  
  // ---- Start calibration rep ----
  startCalibrationRep() {
    this.isCalibrationRep = true;
    
    // IMPORTANT: Copy pre-rep buffer into currentRepData so retroCorrect has rest samples!
    // This captures the last ~0.5s of data BEFORE motion started.
    this.currentRepData = [...this.preRepBuffer];
    console.log(`[ROMComputer] Calibration rep started — preserved ${this.currentRepData.length} pre-motion samples`);
    
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveAdjustedROM = 0;
    this.liveFulfillment = 0;
    // Reset stroke state for clean integration - start from 0cm
    this.velocity = 0;
    this.displacement = 0;
    this.liveDisplacementCm = 0;
    this.stillCounter = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.prevVertAccel = 0;
    this.prevVertAccel2 = 0;
    this.emaInitialized = false;
    // Clear current baseline - will use storedGravity if available
    this.baselineGravity = null;
    this.gravityUnitVec = null;
    this.gravityInitSamples = [];
  }
  
  // ---- Finish calibration rep and return ROM value ----
  finishCalibrationRep() {
    if (this.currentRepData.length < 5) {
      console.log('[ROMComputer] Not enough data for calibration rep');
      this.isCalibrationRep = false;
      return null;
    }
    
    const romType = this.getROMType(this.exerciseType);
    let romValue;
    
    if (romType === 'angle') {
      romValue = this.computeAngleROM();
      // For angle ROM, also use within-rep tracking as alternative (take max)
      const repRangeROM = this.repMaxAngle - this.repMinAngle;
      romValue = Math.max(romValue, repRangeROM);
    } else {
      // For stroke ROM, use retroCorrect for accurate drift-free measurement.
      // CALIBRATION: Use PEAK displacement (not max-min ROM) because:
      //   - We start from a known 0 position
      //   - preRepBuffer may include transition motion from previous rep which
      //     causes false negative displacement and inflates max-min ROM
      //   - Peak is the actual distance traveled from start position
      const corrected = this.retroCorrect(this.currentRepData);
      if (corrected && corrected.peak > 0) {
        // For calibration, use peak displacement (distance from 0)
        romValue = corrected.peak;
        console.log(`[ROMComputer] Calibration stroke: using peak=${corrected.peak.toFixed(1)}cm (raw rom=${corrected.rom.toFixed(1)}cm)`);
      } else {
        // Fallback to live tracking
        romValue = this.repMaxAngle - this.repMinAngle;
      }
    }
    
    // Clamp to exercise-specific physical maximum — anything above is sensor drift
    const maxROM = EXERCISE_MAX_ROM[this.exerciseType] || (romType === 'angle' ? 180 : 100);
    romValue = Math.min(romValue, maxROM);
    
    this.isCalibrationRep = false;
    
    // Reset for next rep
    this.currentRepData = [];
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveAdjustedROM = 0;
    
    // Reset stroke state - reset to 0cm for next rep
    if (romType === 'stroke') {
      this.velocity = 0;
      this.displacement = 0;
      this.liveDisplacementCm = 0;
      this.stillCounter = 0;
      this.peakDisplacement = 0;
      this.minDisplacement = 0;
      this.prevVertAccel = 0;
      this.prevVertAccel2 = 0;
      this.emaInitialized = false;
      // Clear current baseline - will use storedGravity for next rep
      this.baselineGravity = null;
      this.gravityUnitVec = null;
      this.gravityInitSamples = [];
      // Clear preRepBuffer to prevent transition samples from contaminating next calibration rep
      this.preRepBuffer = [];
    }
    
    const unit = romType === 'angle' ? '°' : ' cm';
    console.log(`[ROMComputer] Calibration rep ROM: ${romValue.toFixed(1)}${unit}`);
    return romValue;
  }
  
  /**
   * Set the target ROM from calibration (average of 3 reps)
   */
  setTargetFromCalibration(romValues) {
    if (!romValues || romValues.length === 0) return null;
    
    const avg = romValues.reduce((a, b) => a + b, 0) / romValues.length;
    this.targetROM = avg;
    this.romCalibrated = true;
    this.calibrationROMs = [...romValues];
    
    const romType = this.getROMType(this.exerciseType);
    const unit = romType === 'angle' ? '°' : ' cm';
    console.log(`[ROMComputer] Target ROM set from ${romValues.length} reps: ${avg.toFixed(1)}${unit}`);
    
    return avg;
  }
  
  // ---- Rep completion (called by RepCounter) ----
  completeRep() {
    if (this.currentRepData.length < 3) return null;
    
    const romType = this.getROMType(this.exerciseType);
    let romValue = 0;
    
    if (romType === 'angle') {
      romValue = this.computeAngleROM();
      // For angle ROM, also use within-rep (max-min) tracking
      const repRangeROM = this.repMaxAngle - this.repMinAngle;
      if (isFinite(repRangeROM)) {
        romValue = Math.max(romValue, repRangeROM);
      }
    } else {
      // For stroke ROM during workout:
      // Use the strokeRollingBuffer (last ~4s of continuous data) instead of
      // currentRepData (which only has samples since the last rep boundary).
      // RepCounter detects half-reps (valley→peak or peak→valley), so
      // currentRepData only contains half the physical motion. The rolling
      // buffer always spans at least one full up+down cycle, giving
      // retroCorrect the complete motion + pre-motion rest for anchoring.
      // This fixes the "first rep ROM always too low" issue because the rolling
      // buffer includes pre-motion stillness that currentRepData lacks.
      if (this.strokeRollingBuffer.length >= 10) {
        const bufferCopy = [...this.strokeRollingBuffer];
        // Temporarily swap currentRepData for retroCorrect
        const original = this.currentRepData;
        this.currentRepData = bufferCopy;
        romValue = this.computeStrokeROM();
        this.currentRepData = original;
        console.log(`[ROMComputer] completeRep: used ${bufferCopy.length} rolling buffer samples (${((bufferCopy[bufferCopy.length-1].ts - bufferCopy[0].ts)/1000).toFixed(1)}s)`);
      } else {
        romValue = this.computeStrokeROM();
      }
    }
    
    // Clamp to exercise-specific physical maximum — anything above is sensor drift
    const maxROM = EXERCISE_MAX_ROM[this.exerciseType] || (romType === 'angle' ? 180 : 100);
    romValue = Math.min(romValue, maxROM);
    
    const repROM = {
      repIndex: this.repROMs.length + 1,
      romValue: romValue,
      romType: romType,
      unit: romType === 'angle' ? 'deg' : 'cm',
      fulfillment: this.targetROM ? Math.min(150, (romValue / this.targetROM) * 100) : null
    };
    this.repROMs.push(repROM);
    
    // Zero-velocity reset at rep boundary for stroke
    // Reset everything to 0 immediately when rep is recorded
    // This ensures next rep starts fresh at 0cm
    if (romType === 'stroke') {
      this.velocity = 0;
      this.displacement = 0;
      this.peakDisplacement = 0;
      this.minDisplacement = 0;
      this.stillCounter = 0;
      // Reset live display to 0cm immediately
      this.liveDisplacementCm = 0;
      this.liveVelocity = 0;
      // Reset EMA filter state so next rep starts fresh
      this.prevVertAccel = 0;
      this.prevVertAccel2 = 0;
      this.emaInitialized = false;
      // Clear current gravity baseline - will use storedGravity for instant restart
      // Keep storedGravity for instant reuse on next rep
      this.baselineGravity = null;
      this.gravityUnitVec = null;
      this.gravityInitSamples = [];
      console.log(`📍 [ROM] Rep finished - reset to 0cm (instant restart ready)`);
    }
    this.currentRepData = [];
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveAdjustedROM = 0;
    this.liveFulfillment = 0;
    
    return repROM;
  }
  
  computeAngleROM() {
    if (this.currentRepData.length < 3) return 0;
    
    // Quaternion angular displacement: immune to Euler wrapping & gimbal lock.
    // Each sample's totalAngle = quatAngleDeg(baseline, current), range 0–180°.
    // ROM = peak angle – trough angle within the rep.
    const totalAngles = this.currentRepData.map(d => d.totalAngle);
    const quatROM = Math.max(...totalAngles) - Math.min(...totalAngles);
    
    // Auto-detect primary Euler axis for diagnostics/logging only
    if (this.primaryAxis === null) {
      const ranges = {
        roll: Math.max(...this.currentRepData.map(d => d.roll)) - Math.min(...this.currentRepData.map(d => d.roll)),
        pitch: Math.max(...this.currentRepData.map(d => d.pitch)) - Math.min(...this.currentRepData.map(d => d.pitch)),
        yaw: Math.max(...this.currentRepData.map(d => d.yaw)) - Math.min(...this.currentRepData.map(d => d.yaw))
      };
      this.primaryAxis = Object.entries(ranges).sort((a, b) => b[1] - a[1])[0][0];
      console.log(`[ROMComputer] Primary axis (info): ${this.primaryAxis} (range: ${ranges[this.primaryAxis].toFixed(1)}°)`);
    }
    
    // Use ONLY quaternion-based ROM — Euler axis ranges can inflate due to
    // atan2 wrapping (e.g. 350° instead of 130° for curls crossing ±180° boundary)
    return quatROM;
  }
  
  computeStrokeROM() {
    if (this.currentRepData.length < 3) return 0;
    
    // Use retrospective forward-backward integration for accurate ROM
    // This eliminates accumulated drift that live integration suffers from
    const corrected = this.retroCorrect(this.currentRepData);
    
    if (corrected && corrected.rom > 0) {
      console.log(`📏 [ROM] RetroCorrect: ROM=${corrected.rom.toFixed(1)}cm peak=${corrected.peak.toFixed(1)}cm`);
      return corrected.rom;
    }
    
    // Fallback to live integration if retroCorrect fails
    const disp = this.currentRepData.map(d => d.displacement);
    return Math.max(...disp) - Math.min(...disp);
  }
  
  // ========== RETROSPECTIVE CORRECTION (Forward-Backward Integration) ==========
  // Ported from references/vertical_rom_test.html
  // After a rep ends, re-process all samples with:
  // 1. Gravity-axis projection for vertical-only acceleration (ignores horizontal/diagonal)
  // 2. Acceleration bias estimation & removal from rest segments
  // 3. Light smoothing to reduce noise amplification
  // 4. Forward-backward velocity integration (drift cancellation)
  // 5. Rest-segment velocity zeroing (gyro-assisted)
  // 6. Position integration with linear detrending
  // This approach is speed-invariant and eliminates accumulated drift.
  retroCorrect(samples, isComplete = true) {
    const g = this.gravityMag;
    const n = samples.length;
    if (n < 5) return null;
    
    // ====== STEP 1: Extract vertical-only acceleration (gravity-axis projection) ======
    const rawAcc = new Float64Array(n);
    const dts = new Float64Array(n);
    
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      if (i > 0) {
        const dt = (s.ts - samples[i - 1].ts) / 1000;
        dts[i] = (dt > 0 && dt < 0.5) ? dt : 0;
      }
      // Vertical-only: project raw accel onto gravity axis, subtract gravity magnitude
      // This ignores all horizontal and diagonal acceleration components
      rawAcc[i] = this.projectOnGravity(s.ax, s.ay, s.az);
    }
    
    // ====== STEP 2: Detect rest/still segments (accel + gyro) ======
    const STILL_ACCEL = 0.25;  // m/s² (relaxed for better rest detection with hand vibration)
    const STILL_GYRO = 0.10;   // rad/s (relaxed to catch more rest samples)
    const isStill = new Uint8Array(n);
    
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const aMagDev = Math.abs(Math.sqrt(s.ax ** 2 + s.ay ** 2 + s.az ** 2) - g);
      const gMag = Math.sqrt(s.gx ** 2 + s.gy ** 2 + s.gz ** 2);
      const gMagRad = this.gyroInRadians ? gMag : gMag * this.DEG2RAD;
      isStill[i] = (aMagDev < STILL_ACCEL && gMagRad < STILL_GYRO) ? 1 : 0;
    }
    
    // Cluster into contiguous rest segments (minimum 2 consecutive samples)
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
    
    // ====== STEP 3: Estimate & remove acceleration bias from rest periods ======
    // At rest, vertical acceleration should be exactly 0. Any non-zero mean = systematic bias.
    let biasSum = 0, biasN = 0;
    restSegs.forEach(([s, e]) => {
      for (let i = s; i <= e; i++) { biasSum += rawAcc[i]; biasN++; }
    });
    // Fallback: for a complete rep (returns to start), mean acceleration ≈ 0
    let accBias;
    if (biasN > 5) {
      accBias = biasSum / biasN;
    } else {
      let fullSum = 0;
      for (let i = 0; i < n; i++) fullSum += rawAcc[i];
      accBias = fullSum / n;
    }
    
    // ====== STEP 4: Bias removal + noise floor ======
    const acc = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let a = rawAcc[i] - accBias;
      // Force zero at rest segments; apply noise floor elsewhere
      if (isStill[i]) {
        a = 0;
      } else if (Math.abs(a) < 0.12) {
        a = 0; // Noise floor: reject sub-threshold acceleration (raised from 0.05)
      }
      acc[i] = a;
    }
    
    // ====== STEP 4b: Two-pass triangle smoothing [1,2,1]/4 ======
    // Single-pass gave only -6dB/octave noise attenuation, inadequate for double integration.
    // Two passes give -12dB/octave — much better noise rejection while preserving
    // the 0.5-2Hz exercise motion signal. Rest segments kept at zero.
    if (n > 10) {
      for (let pass = 0; pass < 2; pass++) {
        const prev = Float64Array.from(acc);
        for (let i = 1; i < n - 1; i++) {
          if (!isStill[i]) {
            acc[i] = (prev[i - 1] + 2 * prev[i] + prev[i + 1]) / 4;
          }
        }
      }
    }
    
    // ====== STEP 5: Forward-backward velocity integration ======
    // Forward pass: v_fwd[0] = 0, integrate forward using trapezoidal rule
    const vFwd = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      vFwd[i] = vFwd[i - 1] + (acc[i - 1] + acc[i]) / 2 * dts[i];
    }
    
    // Backward pass: v_bwd[n-1] = 0, integrate backward using trapezoidal rule
    const vBwd = new Float64Array(n);
    for (let i = n - 2; i >= 0; i--) {
      vBwd[i] = vBwd[i + 1] - (acc[i] + acc[i + 1]) / 2 * dts[i + 1];
    }
    
    // Average forward and backward velocities — drift errors cancel out
    const vel = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      vel[i] = (vFwd[i] + vBwd[i]) / 2;
    }
    
    // ====== STEP 5b: Velocity detrending (complete reps only) ======
    // The averaged fwd/bwd velocity still carries residual linear drift: b*(t - T/2).
    // For a complete rep (start and end at rest), velocity at both boundaries ≈ 0.
    // Linear detrend removes this residual without affecting mid-rep velocity shape.
    if (isComplete && n > 10) {
      const edgeSamples = Math.min(5, Math.floor(n / 4));
      let vStartSum = 0, vEndSum = 0;
      for (let i = 0; i < edgeSamples; i++) vStartSum += vel[i];
      for (let i = n - edgeSamples; i < n; i++) vEndSum += vel[i];
      const vStart = vStartSum / edgeSamples;
      const vEnd = vEndSum / edgeSamples;
      const vSlope = (vEnd - vStart) / (n - 1);
      for (let i = 0; i < n; i++) {
        vel[i] -= (vStart + vSlope * i);
      }
    }
    
    // Force velocity to 0 in all detected rest segments
    restSegs.forEach(([s, e]) => {
      for (let i = s; i <= e; i++) vel[i] = 0;
    });
    
    // ====== STEP 6: Integrate position from corrected velocity ======
    const pos = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      pos[i] = pos[i - 1] + (vel[i - 1] + vel[i]) / 2 * dts[i];
    }
    
    // ====== STEP 7: Position detrending ======
    // Enforce position = 0 at first and last rest segment midpoints (start/end at rest)
    if (restSegs.length >= 2) {
      const fMid = Math.round((restSegs[0][0] + restSegs[0][1]) / 2);
      const lMid = Math.round((restSegs[restSegs.length - 1][0] + restSegs[restSegs.length - 1][1]) / 2);
      if (lMid > fMid) {
        const p0 = pos[fMid], p1 = pos[lMid];
        const slope = (p1 - p0) / (lMid - fMid);
        for (let i = 0; i < n; i++) {
          pos[i] -= (p0 + slope * (i - fMid));
        }
      }
    } else if (restSegs.length === 1) {
      const mid = Math.round((restSegs[0][0] + restSegs[0][1]) / 2);
      if (isComplete) {
        // Linear detrend: rest anchor (pos=0) ↔ opposite signal boundary (pos≈0)
        // A complete rep returns to the starting position, so both ends should be ~0.
        const restIsNearStart = mid < n / 2;
        const anchor1 = restIsNearStart ? mid : 0;
        const anchor2 = restIsNearStart ? n - 1 : mid;
        const p0 = pos[anchor1], p1 = pos[anchor2];
        const span = anchor2 - anchor1;
        if (span > 0) {
          const slope = (p1 - p0) / span;
          for (let i = 0; i < n; i++) {
            pos[i] -= (p0 + slope * (i - anchor1));
          }
        }
      } else {
        // In-progress: just shift so rest point = 0 (no linear detrend — rep isn't done)
        const offset = pos[mid];
        for (let i = 0; i < n; i++) pos[i] -= offset;
      }
    } else {
      // NO REST SEGMENTS DETECTED — fallback to linear detrending from start to end.
      // Assumes user started at rest (pos=0) and ended at rest (pos=0).
      // This handles the case where auto rep detection didn't capture enough stillness.
      console.log('⚠️ [RetroCorrect] No rest segments detected — using linear detrend fallback');
      const p0 = pos[0], p1 = pos[n - 1];
      const slope = (p1 - p0) / (n - 1);
      for (let i = 0; i < n; i++) {
        pos[i] -= (p0 + slope * i);
      }
    }
    
    // ====== STEP 8: Extract peak & ROM ======
    let maxD = -Infinity, minD = Infinity;
    for (let i = 0; i < n; i++) {
      if (pos[i] > maxD) maxD = pos[i];
      if (pos[i] < minD) minD = pos[i];
    }
    
    const peakAbs = Math.max(Math.abs(maxD), Math.abs(minD));
    const rom = maxD - minD;
    
    if (this.DEBUG_MODE) {
      console.log(`📏 [RetroCorrect] bias=${(accBias).toFixed(4)}m/s² restSegs=${restSegs.length} peak=${(peakAbs*100).toFixed(1)}cm rom=${(rom*100).toFixed(1)}cm complete=${isComplete}`);
    }
    
    return {
      peak: peakAbs * 100,   // cm
      rom: rom * 100,         // cm
      maxDisp: maxD * 100,
      minDisp: minD * 100
    };
  }
  
  getSetStats() {
    if (this.repROMs.length === 0) return null;
    const values = this.repROMs.map(r => r.romValue);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const stdDev = Math.sqrt(values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length);
    const consistency = avg > 0 ? ((1 - stdDev / avg) * 100) : 100;
    
    const fulfillments = this.repROMs.filter(r => r.fulfillment !== null).map(r => r.fulfillment);
    const avgFulfillment = fulfillments.length > 0 ? fulfillments.reduce((a, b) => a + b, 0) / fulfillments.length : null;
    
    return {
      avgROM: avg,
      maxROM: max,
      romConsistencyPercent: Math.max(0, Math.min(100, consistency)),
      romType: this.getROMType(this.exerciseType),
      unit: this.getROMType(this.exerciseType) === 'angle' ? 'deg' : 'cm',
      repCount: this.repROMs.length,
      targetROM: this.targetROM,
      avgFulfillment: avgFulfillment
    };
  }
  
  getROMForRep(repNumber) {
    const rom = this.repROMs.find(r => r.repIndex === repNumber);
    return rom ? rom.romValue : 0;
  }
  
  /**
   * Get the best available live ROM value.
   * For stroke exercises, returns retro-corrected value (drift-free).
   * For angle exercises, returns the raw live rep ROM.
   */
  getLiveROM() {
    const romType = this.getROMType(this.exerciseType);
    if (romType === 'stroke' && this.liveAdjustedROM > 0) {
      return this.liveAdjustedROM;
    }
    return this.liveRepROM;
  }
  
  getROMLabel() {
    const romType = this.getROMType(this.exerciseType);
    if (romType === 'angle') return 'Equipment ROM';
    if (this.exerciseType <= 3) return 'Vertical Displacement';
    return 'Stack Displacement';
  }
  
  getUnit() {
    return this.getROMType(this.exerciseType) === 'angle' ? '°' : ' cm';
  }
  
  /**
   * Enable debug logging and testing modes
   */
  enableDebugMode() {
    this.DEBUG_MODE = true;
    console.log('🔧 [ROM DEBUG] Debug mode enabled');
  }
  
  disableDebugMode() {
    this.DEBUG_MODE = false;
    console.log('🔧 [ROM DEBUG] Debug mode disabled');
  }
  
  bypassHighPassFilter(bypass = true) {
    // No-op: HP filter removed in favor of quaternion gravity removal + adaptive ZUPT.
    // Quaternion-based world-frame projection handles what the HP filter used to do,
    // without attenuating slow movements.
    console.log(`🔧 [ROM DEBUG] HP filter no longer used (quaternion gravity removal handles drift)`);
  }
  
  /**
   * Force reset displacement to zero (when user returns to starting position)
   * Call this when you know the sensor is back at the baseline position
   */
  resetDisplacementToZero() {
    this.displacement = 0;
    this.velocity = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.stillCounter = 0;
    this.prevVertAccel = 0;
    this.prevVertAccel2 = 0;
    console.log('🔄 [ROM DEBUG] Displacement manually reset to zero');
  }
  
  /**
   * Set baseline from calibration samples (hold-still calibration)
   * Averages quaternion/accel samples for accurate baseline
   */
  setBaselineFromSamples(samples) {
    if (!samples || samples.length < 5) return false;
    
    let sumW = 0, sumX = 0, sumY = 0, sumZ = 0;
    let sumRoll = 0, sumPitch = 0, sumYaw = 0;
    let sumAx = 0, sumAy = 0, sumAz = 0;
    
    // Ensure consistent hemisphere
    const ref = samples[0];
    samples.forEach(s => {
      const dot = ref.qw*s.qw + ref.qx*s.qx + ref.qy*s.qy + ref.qz*s.qz;
      const sign = dot < 0 ? -1 : 1;
      sumW += s.qw * sign;
      sumX += s.qx * sign;
      sumY += s.qy * sign;
      sumZ += s.qz * sign;
      sumRoll += s.roll || 0;
      sumPitch += s.pitch || 0;
      sumYaw += s.yaw || 0;
      sumAx += s.accelX || 0;
      sumAy += s.accelY || 0;
      sumAz += s.accelZ || 0;
    });
    
    const n = samples.length;
    const avgQ = { w: sumW/n, x: sumX/n, y: sumY/n, z: sumZ/n };
    const norm = Math.sqrt(avgQ.w**2 + avgQ.x**2 + avgQ.y**2 + avgQ.z**2);
    avgQ.w /= norm; avgQ.x /= norm; avgQ.y /= norm; avgQ.z /= norm;
    
    this.baselineQuat = avgQ;
    this.baselineAngle = { roll: sumRoll/n, pitch: sumPitch/n, yaw: sumYaw/n };
    this.baselineGravity = { x: sumAx/n, y: sumAy/n, z: sumAz/n };
    this.gravityInitSamples = []; // Gravity established from calibration \u2014 no need to re-init
    
    // Set gravity magnitude and vertical reference axis from averaged accel at rest.
    // The gravity unit vector defines the "vertical" direction for stroke ROM —
    // all acceleration is projected onto this axis, ignoring horizontal/diagonal.
    this.gravityMag = Math.sqrt(this.baselineGravity.x**2 + this.baselineGravity.y**2 + this.baselineGravity.z**2);
    if (this.gravityMag > 0) {
      this.gravityUnitVec = {
        x: this.baselineGravity.x / this.gravityMag,
        y: this.baselineGravity.y / this.gravityMag,
        z: this.baselineGravity.z / this.gravityMag
      };
    }
    
    // Store gravity for instant reuse after rep reset (critical for calibration!)
    this.storedGravity = this.baselineGravity;
    this.storedGravityUnitVec = this.gravityUnitVec;
    this.storedGravityMag = this.gravityMag;
    
    // Compute gyro bias from rest samples (if gyro data available)
    // At rest, any non-zero gyro reading is bias/offset that should be subtracted.
    let sumGx=0, sumGy=0, sumGz=0;
    samples.forEach(s => {
      sumGx += s.gyroX || 0;
      sumGy += s.gyroY || 0;
      sumGz += s.gyroZ || 0;
    });
    this.gyroBias = { x: sumGx/n, y: sumGy/n, z: sumGz/n };
    
    // Auto-detect gyro units: if bias magnitude is small (<0.3), it's likely radians/sec.
    // ESP32 BNO055 typically outputs deg/s (~0-250 range), MPU6050 can be either.
    const gyroBiasMag = Math.abs(this.gyroBias.x) + Math.abs(this.gyroBias.y) + Math.abs(this.gyroBias.z);
    this.gyroInRadians = gyroBiasMag < 0.3;
    
    const grav = this.baselineGravity;
    const gyroUnits = this.gyroInRadians ? 'rad/s' : 'deg/s';
    console.log(`🔍 [ROM DEBUG] Baseline gravity: [${grav.x.toFixed(3)}, ${grav.y.toFixed(3)}, ${grav.z.toFixed(3)}] mag=${this.gravityMag.toFixed(4)}`);
    console.log(`🎯 [ROM DEBUG] Gyro bias: [${this.gyroBias.x.toFixed(4)}, ${this.gyroBias.y.toFixed(4)}, ${this.gyroBias.z.toFixed(4)}] ${gyroUnits} (auto-detected)`);
    
    // Reset tracking state
    this.currentRepData = [];
    this.sampleHistory = [];
    this.preRepBuffer = [];  // Clear pre-rep buffer for fresh calibration
    this.velocity = 0;
    this.displacement = 0;
    this.stillCounter = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.prevVertAccel = 0;
    this.prevVertAccel2 = 0;
    this.liveAngleDeg = 0;
    this.liveDisplacementCm = 0;
    this.repROMs = [];
    this.primaryAxis = null;
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveAdjustedROM = 0;
    this.liveFulfillment = 0;
    
    console.log(`[ROMComputer] Baseline set from ${n} samples. Q: [${avgQ.w.toFixed(3)}, ${avgQ.x.toFixed(3)}, ${avgQ.y.toFixed(3)}, ${avgQ.z.toFixed(3)}]`);
    return true;
  }
  
  calibrateBaseline() {
    // IMPORTANT: Preserve gravity fields (baselineGravity, gravityUnitVec, gravityMag)
    // across sets! The gravity direction is a physical constant of the sensor orientation
    // and doesn't change between sets. Resetting it forces re-initialization from a
    // single noisy sample, which was causing wildly inconsistent ROM readings (20-100+ cm
    // for a 46cm bench press) because each set got a different gravity axis.
    this.baselineQuat = null;
    this.baselineAngle = null;
    // baselineGravity, gravityUnitVec, gravityMag — PRESERVED (not reset)
    // gyroBias, gyroInRadians — PRESERVED (calibrated physical constants)
    this.gravityInitSamples = [];     // Clear init buffer (gravity already established)
    this.currentRepData = [];
    this.sampleHistory = [];
    this.preRepBuffer = [];           // Clear rolling buffer
    this.savedPreRepBuffer = null;    // Will be populated after first samples come in
    
    // === FIX FOR FIRST REP ROM ISSUE ===
    // Problem: When strokeRollingBuffer is cleared, the first rep has no "rest" samples
    // at the beginning. retroCorrect needs rest segments to anchor position detrending.
    // Without rest anchoring, it falls back to linear detrending which is inaccurate,
    // causing the first rep of every set to show low/incorrect ROM.
    //
    // Solution: Inject synthetic "at rest" samples using the calibrated gravity values.
    // These synthetic samples have zero velocity/acceleration (at rest), giving
    // retroCorrect the rest anchoring it needs for accurate first-rep ROM.
    const SYNTHETIC_REST_SAMPLES = 20; // ~0.5-1s of synthetic rest at typical sample rates
    const now = Date.now();
    this.strokeRollingBuffer = [];
    
    if (this.baselineGravity && this.gravityMag > 0) {
      // Create synthetic rest samples with calibrated gravity values
      // At rest: accel = gravity only, gyro = bias only (near zero), velocity = 0
      for (let i = 0; i < SYNTHETIC_REST_SAMPLES; i++) {
        const syntheticSample = {
          ax: this.baselineGravity.x,
          ay: this.baselineGravity.y,
          az: this.baselineGravity.z,
          gx: this.gyroBias.x,
          gy: this.gyroBias.y,
          gz: this.gyroBias.z,
          qw: 1, qx: 0, qy: 0, qz: 0,  // Identity quaternion (will be overwritten by real data)
          ts: now - (SYNTHETIC_REST_SAMPLES - i) * 40, // ~40ms apart (25Hz)
          displacement: 0,
          velocity: 0,
          vertAccel: 0,
          isSynthetic: true  // Mark for debugging
        };
        this.strokeRollingBuffer.push(syntheticSample);
        this.preRepBuffer.push(syntheticSample);
      }
      console.log(`[ROMComputer] Injected ${SYNTHETIC_REST_SAMPLES} synthetic rest samples for first-rep anchoring`);
    }
    
    this.emaInitialized = false;      // Re-prime EMA from first sample of new set
    this.velocity = 0;
    this.displacement = 0;
    this.stillCounter = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.prevVertAccel = 0;
    this.prevVertAccel2 = 0;
    this.liveAngleDeg = 0;
    this.liveDisplacementCm = 0;
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveAdjustedROM = 0;
    this.liveFulfillment = 0;
    // Reset per-set rep ROMs so repIndex matches RepCounter's per-set repNumber
    this.repROMs = [];
    console.log('[ROMComputer] Baseline recalibrated — integration state reset, gravity preserved');
  }
  
  reset() {
    this.baselineQuat = null;
    this.baselineAngle = null;
    this.baselineGravity = null;
    this.gravityUnitVec = null;
    this.gravityMag = 9.81;
    this.gravityInitSamples = [];    // Reset gravity averaging buffer
    this.gyroBias = {x:0,y:0,z:0};
    this.gyroInRadians = false;
    this.primaryAxis = null;
    this.repROMs = [];
    this.currentRepData = [];
    this.preRepBuffer = [];
    this.savedPreRepBuffer = null;
    this.strokeRollingBuffer = [];
    this.emaInitialized = false;
    this.velocity = 0;
    this.displacement = 0;
    this.lastTimestamp = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.stillCounter = 0;
    this.prevVertAccel = 0;
    this.prevVertAccel2 = 0;
    this.liveAngleDeg = 0;
    this.liveDisplacementCm = 0;
    this.liveVelocity = 0;
    this.sampleHistory = [];
    this.targetROM = null;
    this.isCalibrationRep = false;
    this.romCalibrated = false;
    this.calibrationROMs = [];
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveAdjustedROM = 0;
    this.liveFulfillment = 0;
    this.DEBUG_MODE = false;
  }
}

// Singleton instance for global access
let _instance = null;

export function getROMComputer() {
  if (!_instance) {
    _instance = new ROMComputer();
  }
  return _instance;
}

export function resetROMComputer() {
  if (_instance) {
    _instance.reset();
  }
  _instance = new ROMComputer();
  return _instance;
}

// Global access for debugging in browser console
if (typeof window !== 'undefined') {
  window.getROMComputer = getROMComputer;
  window.debugROM = () => {
    const rom = getROMComputer();
    rom.enableDebugMode();
    console.log('🔧 Use rom.bypassHighPassFilter(true), rom.resetDisplacementToZero(), etc.');
    return rom;
  };
}
