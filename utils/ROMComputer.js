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
 *   1. Detect gravity axis: at rest, whichever accel axis reads ~9.8 m/s² is vertical.
 *   2. Subtract gravity from that axis → linear acceleration.
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
const EXERCISE_ROM_TYPE = {
  0: 'angle', // Concentration Curls
  1: 'angle', // Overhead Extension
  2: 'stroke', // Bench Press
  3: 'stroke', // Back Squats
  4: 'stroke', // Lateral Pulldown
  5: 'stroke', // Seated Leg Extension
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
    
    // Stroke ROM state — gravity-axis vertical displacement
    this.velocity = 0;
    this.displacement = 0;
    this.lastTimestamp = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.baselineGravity = null;    // calibrated gravity vector {x,y,z} from baseline hold
    this.gravityAxis = null;        // 'x', 'y', or 'z' — auto-detected axis with ~9.8 m/s²
    this.gravitySign = 1;           // +1 or -1 — sign of gravity on detected axis
    this.gravityMagnitude = 9.81;   // measured gravity magnitude from baseline
    this.accelHP = 0;               // high-pass filtered acceleration
    this.accelLP = 0;               // low-pass state for HP filter
    this.stillCounter = 0;          // consecutive near-zero samples
    this.STILL_THRESHOLD = 0.3;     // m/s² — below this = probably still
    this.STILL_SAMPLES = 3;         // samples below threshold to trigger zero-velocity update
    this.MAX_DISPLACEMENT = 2.0;    // meters (200 cm) — hard clamp for safety
    this.DEBUG_MODE = false;        // set to true for extra logging
    this.BYPASS_HIGH_PASS = false;  // set to true to test without high-pass filter
    
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
    this.sampleHistory = [];        // last N samples for live chart
    this.maxHistorySize = 200;      // ~10s at 20Hz
  }
  
  // ---- ROM type detection ----
  getROMType(exerciseCode) {
    return EXERCISE_ROM_TYPE[exerciseCode] || 'angle';
  }
  
  /**
   * Set exercise from equipment/exercise name strings
   */
  setExerciseFromNames(equipmentName, exerciseName) {
    if (!equipmentName || !exerciseName) return;
    const eqKey = equipmentName.toLowerCase().trim();
    const exKey = exerciseName.toLowerCase().trim();
    
    for (const [eq, exercises] of Object.entries(EQUIPMENT_EXERCISE_MAP)) {
      if (eqKey.includes(eq)) {
        for (const [ex, code] of Object.entries(exercises)) {
          if (exKey.includes(ex) || ex.includes(exKey)) {
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
  
  // ---- Main sample entry ----
  addSample(data) {
    const { roll, pitch, yaw, qw, qx, qy, qz, accelX, accelY, accelZ, timestamp } = data;
    const romType = this.getROMType(this.exerciseType);
    const q = { w: qw || 0, x: qx || 0, y: qy || 0, z: qz || 0 };
    
    // Skip if no valid quaternion data
    if (qw === undefined && qx === undefined) return;
    
    if (romType === 'angle') {
      this.addAngleSample(roll || 0, pitch || 0, yaw || 0, q, timestamp);
    } else {
      this.addStrokeSample(q, accelX || 0, accelY || 0, accelZ || 0, timestamp);
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
    this.liveAngleDeg = this.quatAngleDeg(this.baselineQuat, q);
    
    // Per-axis delta for auto-axis detection
    const deltaRoll = roll - this.baselineAngle.roll;
    const deltaPitch = pitch - this.baselineAngle.pitch;
    const deltaYaw = yaw - this.baselineAngle.yaw;
    
    // Track within-rep range using primary axis if known
    let trackValue = this.liveAngleDeg;
    if (this.primaryAxis) {
      const axisMap = { roll: deltaRoll, pitch: deltaPitch, yaw: deltaYaw };
      trackValue = axisMap[this.primaryAxis];
    }
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
  
  // ---- STROKE ROM (vertical displacement via gravity-axis detection) ----
  // Physics: sensor on barbell bar or weight stack → constrained 1D vertical motion.
  // 1. At baseline hold, detect which accel axis carries ~9.8 m/s² → that's the vertical axis.
  // 2. Each sample: subtract gravity from that axis → linear acceleration.
  // 3. Double-integrate (accel → velocity → displacement) within each rep only.
  // 4. ZUPT (Zero-Velocity Update) when equipment is momentarily still.
  addStrokeSample(q, accelX, accelY, accelZ, timestamp) {
    // --- First sample: detect gravity axis automatically ---
    if (this.gravityAxis === null) {
      const axes = { x: accelX, y: accelY, z: accelZ };
      // The axis closest to ±9.81 m/s² is the vertical (gravity) axis
      let bestAxis = 'z', bestVal = 0;
      for (const [axis, val] of Object.entries(axes)) {
        if (Math.abs(val) > Math.abs(bestVal)) {
          bestAxis = axis;
          bestVal = val;
        }
      }
      this.gravityAxis = bestAxis;
      this.gravitySign = Math.sign(bestVal);        // +1 if gravity reads positive, -1 if negative
      this.gravityMagnitude = Math.abs(bestVal);     // actual magnitude (≈9.81)
      this.baselineGravity = { x: accelX, y: accelY, z: accelZ };
      this.lastTimestamp = timestamp;
      console.log(`🔍 [ROM DEBUG] Gravity axis: ${bestAxis} = ${bestVal.toFixed(3)} m/s² | X:${accelX.toFixed(2)} Y:${accelY.toFixed(2)} Z:${accelZ.toFixed(2)}`);
      return;
    }
    
    // --- Extract acceleration on the gravity axis and subtract gravity ---
    const axisMap = { x: accelX, y: accelY, z: accelZ };
    const rawAccel = axisMap[this.gravityAxis];
    // Linear acceleration = raw - gravity (removes the constant ~9.81 component)
    const linearAccel = rawAccel - (this.gravitySign * this.gravityMagnitude);
    
    if (this.lastTimestamp > 0) {
      const dt = (timestamp - this.lastTimestamp) / 1000;
      if (dt > 0 && dt < 0.5) { // Guard against timestamp jumps
        // High-pass filter to remove any residual DC offset / slow drift
        let finalAccel;
        if (this.BYPASS_HIGH_PASS) {
          finalAccel = linearAccel;
        } else {
          const lpAlpha = 0.12;
          this.accelLP = lpAlpha * linearAccel + (1 - lpAlpha) * this.accelLP;
          this.accelHP = linearAccel - this.accelLP;
          finalAccel = this.accelHP;
        }
        
        // Dead-zone: if acceleration is tiny, treat as zero (noise floor)
        const accelInput = Math.abs(finalAccel) < this.STILL_THRESHOLD ? 0 : finalAccel;
        
        // --- ZUPT: Zero-Velocity Update ---
        // When equipment is still (top/bottom of rep), force velocity → 0
        if (Math.abs(finalAccel) < this.STILL_THRESHOLD) {
          this.stillCounter++;
        } else {
          this.stillCounter = 0;
        }
        
        if (this.stillCounter >= this.STILL_SAMPLES) {
          // Exponential decay → zero velocity at rest points
          const oldVel = this.velocity;
          this.velocity *= 0.4;
          if (Math.abs(this.velocity) < 0.003) this.velocity = 0;
          if (this.DEBUG_MODE && oldVel !== 0 && this.velocity === 0) {
            console.log(`🛑 [ROM DEBUG] ZUPT triggered - velocity zeroed (was ${oldVel.toFixed(4)})`);
          }
        }
        
        // --- Double integration: accel → velocity → displacement ---
        this.velocity += accelInput * dt;
        this.velocity *= 0.97; // Gentle drag to limit drift accumulation
        const oldDisp = this.displacement;
        this.displacement += this.velocity * dt;
        this.displacement = Math.max(-this.MAX_DISPLACEMENT, Math.min(this.MAX_DISPLACEMENT, this.displacement));
        
        // Debug logging every 10th sample to avoid spam
        if (this.DEBUG_MODE && this.currentRepData.length % 10 === 0) {
          console.log(`📏 [ROM] Raw:${rawAccel.toFixed(3)} Linear:${linearAccel.toFixed(3)} Final:${finalAccel.toFixed(3)} Vel:${this.velocity.toFixed(4)} Disp:${(this.displacement*100).toFixed(1)}cm Still:${this.stillCounter}`);
        }
        
        this.peakDisplacement = Math.max(this.peakDisplacement, this.displacement);
        this.minDisplacement = Math.min(this.minDisplacement, this.displacement);
      }
    }
    this.lastTimestamp = timestamp;
    
    // Convert to cm for display
    this.liveDisplacementCm = this.displacement * 100;
    this.liveVelocity = this.velocity;
    
    // Track within-rep min/max displacement (cm) for ROM = peak-to-trough
    this.repMinAngle = Math.min(this.repMinAngle, this.liveDisplacementCm);
    this.repMaxAngle = Math.max(this.repMaxAngle, this.liveDisplacementCm);
    this.liveRepROM = this.repMaxAngle - this.repMinAngle;
    
    // Update fulfillment %
    if (this.targetROM && this.targetROM > 0) {
      this.liveFulfillment = Math.min(150, (this.liveRepROM / this.targetROM) * 100);
    }
    
    this.currentRepData.push({
      displacement: this.liveDisplacementCm,
      velocity: this.velocity,
      linearAccel: linearAccel,
      timestamp
    });
    
    this.sampleHistory.push({ t: timestamp, v: this.liveRepROM });
    if (this.sampleHistory.length > this.maxHistorySize) this.sampleHistory.shift();
  }
  
  // ---- Start calibration rep ----
  startCalibrationRep() {
    this.isCalibrationRep = true;
    this.currentRepData = [];
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveFulfillment = 0;
    // Reset stroke state for clean integration
    this.velocity = 0;
    this.displacement = 0;
    this.accelHP = 0;
    this.accelLP = 0;
    this.stillCounter = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    console.log('[ROMComputer] Calibration rep started — do one full-range rep');
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
    } else {
      romValue = this.computeStrokeROM();
    }
    
    // Also use within-rep tracking as alternative
    const repRangeROM = this.repMaxAngle - this.repMinAngle;
    romValue = Math.max(romValue, repRangeROM);
    
    // Clamp
    romValue = romType === 'angle' ? Math.min(romValue, 360) : Math.min(romValue, 300);
    
    this.isCalibrationRep = false;
    
    // Reset for next rep
    this.currentRepData = [];
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    
    // Reset stroke state
    if (romType === 'stroke') {
      this.velocity = 0;
      this.displacement = 0;
      this.accelHP = 0;
      this.accelLP = 0;
      this.stillCounter = 0;
      this.peakDisplacement = 0;
      this.minDisplacement = 0;
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
    } else {
      romValue = this.computeStrokeROM();
    }
    
    // Also use within-rep (max-min) tracking
    const repRangeROM = this.repMaxAngle - this.repMinAngle;
    if (isFinite(repRangeROM)) {
      romValue = Math.max(romValue, repRangeROM);
    }
    
    // Clamp unrealistic values
    romValue = romType === 'angle' ? Math.min(romValue, 360) : Math.min(romValue, 200);
    
    const repROM = {
      repIndex: this.repROMs.length + 1,
      romValue: romValue,
      romType: romType,
      unit: romType === 'angle' ? 'deg' : 'cm',
      fulfillment: this.targetROM ? Math.min(150, (romValue / this.targetROM) * 100) : null
    };
    this.repROMs.push(repROM);
    
    // Zero-velocity reset at rep boundary for stroke
    if (romType === 'stroke') {
      this.velocity = 0;
      this.displacement = 0;
      this.peakDisplacement = 0;
      this.minDisplacement = 0;
      this.accelHP = 0;
      this.accelLP = 0;
      this.stillCounter = 0;
    }
    this.currentRepData = [];
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveFulfillment = 0;
    
    return repROM;
  }
  
  computeAngleROM() {
    if (this.currentRepData.length < 3) return 0;
    
    // Option 1: Use total quaternion angular displacement
    const totalAngles = this.currentRepData.map(d => d.totalAngle);
    const quatROM = Math.max(...totalAngles) - Math.min(...totalAngles);
    
    // Option 2: Auto-detect primary Euler axis
    if (this.primaryAxis === null) {
      const ranges = {
        roll: Math.max(...this.currentRepData.map(d => d.roll)) - Math.min(...this.currentRepData.map(d => d.roll)),
        pitch: Math.max(...this.currentRepData.map(d => d.pitch)) - Math.min(...this.currentRepData.map(d => d.pitch)),
        yaw: Math.max(...this.currentRepData.map(d => d.yaw)) - Math.min(...this.currentRepData.map(d => d.yaw))
      };
      this.primaryAxis = Object.entries(ranges).sort((a, b) => b[1] - a[1])[0][0];
      console.log(`[ROMComputer] Auto-detected primary axis: ${this.primaryAxis} (range: ${ranges[this.primaryAxis].toFixed(1)}°)`);
    }
    
    const axisValues = this.currentRepData.map(d => d[this.primaryAxis]);
    const axisROM = Math.max(...axisValues) - Math.min(...axisValues);
    
    return Math.max(quatROM, axisROM);
  }
  
  computeStrokeROM() {
    if (this.currentRepData.length < 3) return 0;
    const disp = this.currentRepData.map(d => d.displacement);
    return Math.max(...disp) - Math.min(...disp);
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
    this.BYPASS_HIGH_PASS = bypass;
    console.log(`🔧 [ROM DEBUG] High-pass filter ${bypass ? 'BYPASSED' : 'ENABLED'}`);
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
    this.accelHP = 0;
    this.accelLP = 0;
    this.stillCounter = 0;
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
    
    // Auto-detect gravity axis from baseline samples
    const grav = this.baselineGravity;
    const axes = { x: grav.x, y: grav.y, z: grav.z };
    let bestAxis = 'z', bestVal = 0;
    for (const [axis, val] of Object.entries(axes)) {
      if (Math.abs(val) > Math.abs(bestVal)) {
        bestAxis = axis;
        bestVal = val;
      }
    }
    this.gravityAxis = bestAxis;
    this.gravitySign = Math.sign(bestVal);
    this.gravityMagnitude = Math.abs(bestVal);
    console.log(`🔍 [ROM DEBUG] Baseline gravity: X:${grav.x.toFixed(3)} Y:${grav.y.toFixed(3)} Z:${grav.z.toFixed(3)}`);
    console.log(`🎯 [ROM DEBUG] Selected axis: ${bestAxis} (${bestVal.toFixed(3)} m/s²) | Total magnitude: ${Math.sqrt(grav.x**2 + grav.y**2 + grav.z**2).toFixed(3)}`);
    
    // Reset tracking state
    this.currentRepData = [];
    this.sampleHistory = [];
    this.velocity = 0;
    this.displacement = 0;
    this.accelHP = 0;
    this.accelLP = 0;
    this.stillCounter = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.liveAngleDeg = 0;
    this.liveDisplacementCm = 0;
    this.repROMs = [];
    this.primaryAxis = null;
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveFulfillment = 0;
    
    console.log(`[ROMComputer] Baseline set from ${n} samples. Q: [${avgQ.w.toFixed(3)}, ${avgQ.x.toFixed(3)}, ${avgQ.y.toFixed(3)}, ${avgQ.z.toFixed(3)}]`);
    return true;
  }
  
  calibrateBaseline() {
    this.baselineQuat = null;
    this.baselineAngle = null;
    this.baselineGravity = null;
    this.gravityAxis = null;
    this.gravitySign = 1;
    this.gravityMagnitude = 9.81;
    this.currentRepData = [];
    this.sampleHistory = [];
    this.velocity = 0;
    this.displacement = 0;
    this.accelHP = 0;
    this.accelLP = 0;
    this.stillCounter = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.liveAngleDeg = 0;
    this.liveDisplacementCm = 0;
    this.repMinAngle = Infinity;
    this.repMaxAngle = -Infinity;
    this.liveRepROM = 0;
    this.liveFulfillment = 0;
    console.log('[ROMComputer] Baseline recalibrated to current position');
  }
  
  reset() {
    this.baselineQuat = null;
    this.baselineAngle = null;
    this.baselineGravity = null;
    this.gravityAxis = null;
    this.gravitySign = 1;
    this.gravityMagnitude = 9.81;
    this.primaryAxis = null;
    this.repROMs = [];
    this.currentRepData = [];
    this.velocity = 0;
    this.displacement = 0;
    this.lastTimestamp = 0;
    this.peakDisplacement = 0;
    this.minDisplacement = 0;
    this.accelHP = 0;
    this.accelLP = 0;
    this.stillCounter = 0;
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
    this.liveFulfillment = 0;
    this.DEBUG_MODE = false;
    this.BYPASS_HIGH_PASS = false;
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
