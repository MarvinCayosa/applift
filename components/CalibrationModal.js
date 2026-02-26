import { useState, useRef, useEffect, useCallback } from 'react';
import { ROMComputer } from '../utils/ROMComputer';
import { useBluetooth } from '../context/BluetoothProvider';
import { KalmanFilter } from '../utils/KalmanFilter';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firestore';

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID_IMU = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Haptic feedback helper for PWA
const triggerHaptic = (pattern) => {
  if (navigator.vibrate) {
    navigator.vibrate(pattern || 10);
  }
};

// LocalStorage key prefix for calibration data
const CALIBRATION_KEY_PREFIX = 'rom_calibration_';

function getCalibrationKey(equipment, exercise) {
  const eq = (equipment || '').toLowerCase().replace(/\s+/g, '-');
  const ex = (exercise || '').toLowerCase().replace(/\s+/g, '-');
  return `${CALIBRATION_KEY_PREFIX}${eq}_${ex}`;
}

/**
 * Sanitize string for Firestore document path
 */
function sanitizeForFirestore(str) {
  return (str || 'unknown').trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Save ROM calibration data for an equipment+exercise combo
 * Saves to both localStorage (for offline/fast access) and Firestore (for persistence)
 */
export function saveCalibration(equipment, exercise, data) {
  try {
    const key = getCalibrationKey(equipment, exercise);
    localStorage.setItem(key, JSON.stringify({
      ...data,
      savedAt: new Date().toISOString()
    }));
  } catch (e) {
    console.warn('Failed to save calibration to localStorage:', e);
  }
}

/**
 * Save ROM calibration data to Firestore
 * Path: userWorkouts/{userId}/{equipment}/{exercise}/calibration/rom
 */
export async function saveCalibrationToFirestore(userId, equipment, exercise, data) {
  if (!userId || !equipment || !exercise) return;
  try {
    const eq = sanitizeForFirestore(equipment);
    const ex = sanitizeForFirestore(exercise);
    const docRef = doc(db, 'userWorkouts', userId, eq, ex, 'calibration', 'rom');
    await setDoc(docRef, {
      targetROM: data.targetROM ?? null,
      repROMs: data.repROMs ?? [],
      exerciseType: data.exerciseType ?? null,
      romType: data.romType ?? null,
      unit: data.unit ?? '°',
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    console.log('[CalibrationModal] ✅ Calibration saved to Firestore');
  } catch (e) {
    console.warn('[CalibrationModal] Failed to save calibration to Firestore:', e);
  }
}

/**
 * Load ROM calibration data from Firestore
 * Path: userWorkouts/{userId}/{equipment}/{exercise}/calibration/rom
 */
export async function loadCalibrationFromFirestore(userId, equipment, exercise) {
  if (!userId || !equipment || !exercise) return null;
  try {
    const eq = sanitizeForFirestore(equipment);
    const ex = sanitizeForFirestore(exercise);
    const docRef = doc(db, 'userWorkouts', userId, eq, ex, 'calibration', 'rom');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data();
    }
    return null;
  } catch (e) {
    console.warn('[CalibrationModal] Failed to load calibration from Firestore:', e);
    return null;
  }
}

/**
 * Load saved ROM calibration data (from localStorage for fast access)
 */
export function loadCalibration(equipment, exercise) {
  try {
    const key = getCalibrationKey(equipment, exercise);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Check if calibration exists for equipment+exercise (localStorage)
 */
export function hasCalibration(equipment, exercise) {
  return loadCalibration(equipment, exercise) !== null;
}

export default function CalibrationModal({ isOpen, onClose, onCalibrate, equipment, exercise }) {
  const { device, connected } = useBluetooth();
  const [isClosing, setIsClosing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  
  // Steps: 1=Instructions, 2=Countdown, 3=BaselineHold, 4=Recording reps, 5=Success
  const [step, setStep] = useState(1);
  const [countdown, setCountdown] = useState(5);
  const [baselineCountdown, setBaselineCountdown] = useState(3);
  const [completedReps, setCompletedReps] = useState(0);
  const [repROMs, setRepROMs] = useState([]);
  const [avgROM, setAvgROM] = useState(0);
  const [liveROM, setLiveROM] = useState(0);
  const [romUnit, setRomUnit] = useState('°');
  const [errorMsg, setErrorMsg] = useState('');
  
  const REQUIRED_REPS = 3;
  
  // Equipment-specific text
  const eqLower = (equipment || '').toLowerCase();
  const isBarbell = eqLower.includes('barbell');
  const isWeightStack = eqLower.includes('weight') || eqLower.includes('stack');
  const isStrokeType = isBarbell || isWeightStack;
  
  const holdText = isBarbell
    ? 'Hold the barbell in your starting position (sensor on bar)'
    : isWeightStack
      ? 'Let the weight stack rest at the starting position (sensor on stack)'
      : 'Hold the weight in your starting/neutral position for 3 seconds';
  
  const repText = isStrokeType
    ? 'Do 3 reps with your full range of motion. We\u2019ll measure the vertical displacement.'
    : 'Do 3 reps with your full range of motion. We\u2019ll measure and average them.';
  
  const unitLabel = isStrokeType ? 'cm' : '\u00b0';
  
  // Refs for BLE subscription during calibration
  const romComputerRef = useRef(null);
  const characteristicRef = useRef(null);
  const kalmanFiltersRef = useRef({
    x: new KalmanFilter(0.01, 0.5, 1, 0),
    y: new KalmanFilter(0.01, 0.5, 1, 0),
    z: new KalmanFilter(0.01, 0.5, 1, 9.81)
  });
  const baselineSamplesRef = useRef([]);
  const stepRef = useRef(1);
  const completedRepsRef = useRef(0);
  const repROMsRef = useRef([]);
  const repInProgressRef = useRef(false);
  const lastRepTimeRef = useRef(0);
  const sampleCountRef = useRef(0);
  const pendingRepCompletionRef = useRef(null); // timestamp when rep completion was triggered (delay to capture post-motion rest)
  
  // Keep refs in sync with state
  useEffect(() => { stepRef.current = step; }, [step]);
  useEffect(() => { completedRepsRef.current = completedReps; }, [completedReps]);
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setStep(1);
      setCountdown(5);
      setBaselineCountdown(3);
      setCompletedReps(0);
      setRepROMs([]);
      setAvgROM(0);
      setLiveROM(0);
      setErrorMsg('');
      baselineSamplesRef.current = [];
      completedRepsRef.current = 0;
      repROMsRef.current = [];
      repInProgressRef.current = false;
      lastRepTimeRef.current = 0;
      sampleCountRef.current = 0;
      
      // Initialize ROMComputer
      const rc = new ROMComputer();
      rc.setExerciseFromNames(equipment, exercise);
      romComputerRef.current = rc;
      
      const romType = rc.getROMType(rc.exerciseType);
      setRomUnit(romType === 'angle' ? '°' : ' cm');
    }
  }, [isOpen, equipment, exercise]);
  
  // Cleanup BLE subscription on unmount or close
  useEffect(() => {
    return () => {
      cleanupBLE();
    };
  }, []);
  
  const cleanupBLE = useCallback(() => {
    if (characteristicRef.current) {
      try {
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleIMUDataForCalibration);
        characteristicRef.current.stopNotifications();
      } catch (e) {
        console.warn('Error cleaning up calibration BLE:', e);
      }
      characteristicRef.current = null;
    }
  }, []);
  
  const handleClose = useCallback(() => {
    cleanupBLE();
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setStep(1);
    }, 250);
  }, [onClose, cleanupBLE]);
  
  // IMU data handler for calibration - parses raw BLE data
  const handleIMUDataForCalibration = useCallback((event) => {
    try {
      const value = event.target.value;
      const dataView = new DataView(value.buffer);
      const byteLength = value.byteLength;
      const hasQuaternions = byteLength >= 56;
      
      const imuData = {
        accelX: dataView.getFloat32(0, true),
        accelY: dataView.getFloat32(4, true),
        accelZ: dataView.getFloat32(8, true),
        gyroX: dataView.getFloat32(12, true),
        gyroY: dataView.getFloat32(16, true),
        gyroZ: dataView.getFloat32(20, true),
        roll: dataView.getFloat32(24, true),
        pitch: dataView.getFloat32(28, true),
        yaw: dataView.getFloat32(32, true),
        qw: hasQuaternions ? dataView.getFloat32(36, true) : undefined,
        qx: hasQuaternions ? dataView.getFloat32(40, true) : undefined,
        qy: hasQuaternions ? dataView.getFloat32(44, true) : undefined,
        qz: hasQuaternions ? dataView.getFloat32(48, true) : undefined,
        timestamp: hasQuaternions ? dataView.getUint32(52, true) : dataView.getUint32(36, true)
      };
      
      sampleCountRef.current++;
      const rc = romComputerRef.current;
      if (!rc) return;
      
      const currentStep = stepRef.current;
      
      // Step 3: Collecting baseline samples (hold still)
      if (currentStep === 3) {
        baselineSamplesRef.current.push(imuData);
        return;
      }
      
      // Step 4: Recording calibration reps
      if (currentStep === 4) {
        rc.addSample(imuData);
        
        // Update live ROM display
        setLiveROM(rc.liveRepROM || 0);
        
        // Auto-detect rep completion using magnitude peak detection
        // Simple approach: when ROM rises then falls significantly, count as rep boundary
        const now = Date.now();
        const timeSinceLastRep = now - lastRepTimeRef.current;
        
        if (!repInProgressRef.current && rc.liveRepROM > 5) {
          // Rep motion started
          repInProgressRef.current = true;
          rc.startCalibrationRep();
        }
        
        // Rep completes when: motion has been going, ROM is significant, and motion slows
        // We use a simple heuristic: if rep ROM > 10° (or 5cm) and has enough data
        const minROM = rc.getROMType(rc.exerciseType) === 'angle' ? 10 : 3;
        
        if (repInProgressRef.current && rc.currentRepData.length > 15 && timeSinceLastRep > 1500) {
          // Check if we've passed the peak and are returning (ROM started decreasing or leveled)
          const recent = rc.sampleHistory.slice(-5);
          const older = rc.sampleHistory.slice(-15, -5);
          
          if (recent.length >= 5 && older.length >= 5) {
            const recentAvg = recent.reduce((s, p) => s + p.v, 0) / recent.length;
            const olderAvg = older.reduce((s, p) => s + p.v, 0) / older.length;
            
            // ROM is dropping or stable after being significant
            if (rc.liveRepROM > minROM && (recentAvg < olderAvg * 0.8 || (recentAvg < olderAvg * 1.05 && rc.currentRepData.length > 30))) {
              // For stroke exercises, delay completion by 500ms to capture post-motion rest samples
              // This ensures retroCorrect has rest data at the END of the rep for better accuracy
              const romType = rc.getROMType(rc.exerciseType);
              const POST_MOTION_DELAY = romType === 'stroke' ? 500 : 0;
              
              if (!pendingRepCompletionRef.current) {
                pendingRepCompletionRef.current = now;
                console.log(`[CalibrationModal] Rep motion ended, waiting ${POST_MOTION_DELAY}ms for post-rest samples...`);
              } else if (now - pendingRepCompletionRef.current >= POST_MOTION_DELAY) {
                // Enough time has passed - complete the rep now
                pendingRepCompletionRef.current = null;
                const romValue = rc.finishCalibrationRep();
              
              if (romValue && romValue > minROM * 0.5) {
                const newRepROMs = [...repROMsRef.current, romValue];
                repROMsRef.current = newRepROMs;
                setRepROMs(newRepROMs);
                setCompletedReps(newRepROMs.length);
                lastRepTimeRef.current = now;
                repInProgressRef.current = false;
                
                triggerHaptic([50, 30, 50]); // Double buzz for rep
                
                console.log(`[CalibrationModal] Rep ${newRepROMs.length}/${REQUIRED_REPS}: ROM = ${romValue.toFixed(1)}`);
                
                // Check if all reps done
                if (newRepROMs.length >= REQUIRED_REPS) {
                  finishCalibration(newRepROMs);
                }
              } else {
                // ROM too small, reset for retry
                repInProgressRef.current = false;
                rc.startCalibrationRep();
              }
              } // end delayed completion
            } else {
              // Motion resumed - cancel pending completion
              if (pendingRepCompletionRef.current) {
                pendingRepCompletionRef.current = null;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in calibration IMU handler:', err);
    }
  }, []);
  
  const finishCalibration = useCallback((roms) => {
    const rc = romComputerRef.current;
    if (!rc) return;
    
    const target = rc.setTargetFromCalibration(roms);
    setAvgROM(target || 0);
    
    // Save to localStorage
    saveCalibration(equipment, exercise, {
      targetROM: target,
      repROMs: roms,
      exerciseType: rc.exerciseType,
      romType: rc.getROMType(rc.exerciseType),
      unit: rc.getUnit()
    });
    
    cleanupBLE();
    setStep(5);
    triggerHaptic([100, 50, 100, 50, 100]); // Success vibration
    
    if (onCalibrate) {
      onCalibrate({
        targetROM: target,
        repROMs: roms,
        romType: rc.getROMType(rc.exerciseType),
        unit: rc.getUnit()
      });
    }
  }, [equipment, exercise, onCalibrate, cleanupBLE]);
  
  // Subscribe to BLE IMU characteristic for calibration
  const subscribeToBLE = useCallback(async () => {
    if (!device || !connected || !device.gatt) {
      setErrorMsg('Device not connected. Please connect your device first.');
      return false;
    }
    
    try {
      const server = device.gatt;
      if (!server.connected) {
        await server.connect();
      }
      
      const service = await server.getPrimaryService(SERVICE_UUID);
      const imuChar = await service.getCharacteristic(CHARACTERISTIC_UUID_IMU);
      await imuChar.startNotifications();
      imuChar.addEventListener('characteristicvaluechanged', handleIMUDataForCalibration);
      characteristicRef.current = imuChar;
      
      console.log('[CalibrationModal] BLE IMU subscription started');
      return true;
    } catch (err) {
      console.error('Failed to subscribe to BLE for calibration:', err);
      setErrorMsg('Failed to connect to sensor. Please try again.');
      return false;
    }
  }, [device, connected, handleIMUDataForCalibration]);
  
  // Start calibration: subscribe to BLE, then start countdown
  const handleStartCalibration = useCallback(async () => {
    triggerHaptic();
    setErrorMsg('');
    
    if (!connected) {
      setErrorMsg('Please connect your device first.');
      return;
    }
    
    // Subscribe to BLE
    const ok = await subscribeToBLE();
    if (!ok) return;
    
    // Start 5-second countdown
    setStep(2);
    setCountdown(5);
  }, [connected, subscribeToBLE]);
  
  // Countdown timer effect (Step 2: Get ready countdown)
  useEffect(() => {
    if (step !== 2) return;
    
    if (countdown <= 0) {
      // Move to baseline hold (step 3)
      setStep(3);
      setBaselineCountdown(3);
      baselineSamplesRef.current = [];
      return;
    }
    
    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [step, countdown]);
  
  // Baseline hold timer (Step 3: Hold still for 3 seconds to capture baseline)
  useEffect(() => {
    if (step !== 3) return;
    
    if (baselineCountdown <= 0) {
      // Set baseline from collected samples
      const rc = romComputerRef.current;
      if (rc && baselineSamplesRef.current.length >= 10) {
        rc.setBaselineFromSamples(baselineSamplesRef.current);
        console.log(`[CalibrationModal] Baseline set from ${baselineSamplesRef.current.length} samples`);
        
        // Move to rep recording
        setStep(4);
        triggerHaptic([100, 50, 100]); // Signal to start reps
        lastRepTimeRef.current = Date.now();
        repInProgressRef.current = false;
      } else {
        setErrorMsg('Not enough sensor data for baseline. Please ensure device is connected and try again.');
        setStep(1);
        cleanupBLE();
      }
      return;
    }
    
    const timer = setTimeout(() => {
      setBaselineCountdown(prev => prev - 1);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [step, baselineCountdown, cleanupBLE]);

  // Touch handlers for swipe-down-to-dismiss - ONLY on handle area
  const handleHandleTouchStart = (e) => {
    setDragStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleHandleTouchMove = (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - dragStartY;
    if (diff > 0) setDragCurrentY(diff);
  };

  const handleHandleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragCurrentY > 100) handleClose();
    setDragCurrentY(0);
  };
  
  // Manual rep finish button (fallback if auto-detection misses)
  const handleManualRepFinish = useCallback(() => {
    const rc = romComputerRef.current;
    if (!rc || stepRef.current !== 4) return;
    
    const romValue = rc.finishCalibrationRep();
    const minROM = rc.getROMType(rc.exerciseType) === 'angle' ? 2 : 1;
    
    if (romValue && romValue > minROM) {
      const newRepROMs = [...repROMsRef.current, romValue];
      repROMsRef.current = newRepROMs;
      setRepROMs(newRepROMs);
      setCompletedReps(newRepROMs.length);
      repInProgressRef.current = false;
      lastRepTimeRef.current = Date.now();
      
      triggerHaptic([50, 30, 50]);
      
      if (newRepROMs.length >= REQUIRED_REPS) {
        finishCalibration(newRepROMs);
      } else {
        rc.startCalibrationRep();
      }
    } else {
      triggerHaptic(20);
      rc.startCalibrationRep();
    }
  }, [finishCalibration]);

  if (!isOpen) return null;

  // Determine if swipe-to-close is allowed
  const canClose = step === 1 || step === 5;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-250 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={canClose ? handleClose : undefined}
    >
      {/* Modal */}
      <div 
        className={`w-full transition-transform ease-out ${isClosing ? 'translate-y-full' : 'translate-y-0'}`}
        onClick={(e) => e.stopPropagation()}
        style={{ 
          animation: !isClosing ? 'slideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)' : undefined,
          transform: isDragging ? `translateY(${dragCurrentY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.25s ease-out',
        }}
      >
        <div 
          className="rounded-t-3xl pt-3 pb-8 px-5"
          style={{ backgroundColor: 'rgb(38, 38, 38)' }}
        >
          {/* Handle */}
          {canClose ? (
            <div 
              className="flex justify-center mb-6 py-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleHandleTouchStart}
              onTouchMove={handleHandleTouchMove}
              onTouchEnd={handleHandleTouchEnd}
            >
              <div className="w-9 h-1 rounded-full bg-white/30" />
            </div>
          ) : (
            <div className="flex justify-center mb-6 py-2">
              <div className="w-9 h-1 rounded-full bg-white/30" />
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <div className="mb-4 px-4 py-3 bg-red-500/15 border border-red-500/30 rounded-xl">
              <p className="text-sm text-red-400 text-center">{errorMsg}</p>
            </div>
          )}

          {/* Step 1: Instructions */}
          {step === 1 && (
            <div className="mb-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">ROM Calibration</h2>
                <p className="text-sm text-white/60">Set your baseline range of motion</p>
              </div>
              
              <div className="space-y-4 mb-8">
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-400 font-bold text-sm">1</span>
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Hold Starting Position</p>
                      <p className="text-sm text-white/60">{holdText}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-400 font-bold text-sm">2</span>
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Perform 3 Full Reps</p>
                      <p className="text-sm text-white/60">{repText}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-400 font-bold text-sm">3</span>
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Baseline Saved</p>
                      <p className="text-sm text-white/60">Your average ROM becomes the target for your workout reps</p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartCalibration}
                disabled={!connected}
                className={`w-full py-4 text-base font-bold rounded-xl transition-all duration-150 ${
                  connected 
                    ? 'bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white' 
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                {connected ? 'Start ROM Calibration' : 'Connect Device First'}
              </button>
            </div>
          )}

          {/* Step 2: Countdown (5 seconds) */}
          {step === 2 && (
            <div className="mb-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Get Ready</h2>
                <p className="text-sm text-white/60">Hold your starting position</p>
              </div>
              
              <div className="flex justify-center mb-6">
                <div className="relative w-28 h-28">
                  {/* Countdown ring */}
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" stroke="rgba(139, 92, 246, 0.15)" strokeWidth="6" fill="none" />
                    <circle
                      cx="50" cy="50" r="42"
                      stroke="#8B5CF6" strokeWidth="6" fill="none"
                      strokeDasharray={2 * Math.PI * 42}
                      strokeDashoffset={2 * Math.PI * 42 * (1 - countdown / 5)}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-bold text-white">{countdown}</span>
                  </div>
                </div>
              </div>
              
              <p className="text-center text-white/40 text-sm">Hold the weight in starting position...</p>
            </div>
          )}

          {/* Step 3: Baseline Hold (3 seconds) */}
          {step === 3 && (
            <div className="mb-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Hold Still</h2>
                <p className="text-sm text-white/60">Capturing baseline orientation...</p>
              </div>
              
              <div className="flex justify-center mb-6">
                <div className="relative w-28 h-28">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" stroke="rgba(59, 130, 246, 0.15)" strokeWidth="6" fill="none" />
                    <circle
                      cx="50" cy="50" r="42"
                      stroke="#3B82F6" strokeWidth="6" fill="none"
                      strokeDasharray={2 * Math.PI * 42}
                      strokeDashoffset={2 * Math.PI * 42 * (1 - baselineCountdown / 3)}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset 1s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-bold text-blue-400">{baselineCountdown}</span>
                  </div>
                </div>
              </div>
              
              <p className="text-center text-white/40 text-sm">Keep the weight perfectly still...</p>
            </div>
          )}

          {/* Step 4: Recording Reps */}
          {step === 4 && (
            <div className="mb-8">
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-white mb-2">Perform Your Reps</h2>
                <p className="text-sm text-white/60">Full range of motion — {completedReps} of {REQUIRED_REPS} reps</p>
              </div>
              
              {/* Rep progress circles */}
              <div className="flex justify-center gap-4 mb-6">
                {Array.from({ length: REQUIRED_REPS }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                      i < completedReps 
                        ? 'bg-green-500/20 border-green-500 text-green-400' 
                        : i === completedReps
                          ? 'bg-violet-500/20 border-violet-500 text-violet-400 animate-pulse'
                          : 'bg-white/5 border-white/20 text-white/30'
                    }`}>
                      {i < completedReps ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="font-bold">{i + 1}</span>
                      )}
                    </div>
                    {i < completedReps && repROMs[i] !== undefined && (
                      <span className="text-xs text-green-400 font-medium">{repROMs[i].toFixed(1)}{romUnit}</span>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Live ROM display */}
              <div className="bg-white/5 rounded-xl p-4 mb-4 text-center">
                <p className="text-xs text-white/40 mb-1">Live ROM</p>
                <p className="text-3xl font-bold text-violet-400">{liveROM.toFixed(1)}<span className="text-lg text-white/50">{romUnit}</span></p>
              </div>
              
              {/* Manual rep finish button */}
              <button
                type="button"
                onClick={handleManualRepFinish}
                className="w-full py-3 text-sm bg-white/10 hover:bg-white/15 active:bg-white/20 text-white/70 font-medium rounded-xl transition-all duration-150"
              >
                Tap When Rep is Complete
              </button>
              
              <p className="text-center text-white/30 text-xs mt-3">
                Reps are auto-detected, or tap the button above after each rep
              </p>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && (
            <div className="mb-8">
              <div className="text-center mb-6">
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                    <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">ROM Calibration Saved!</h2>
                <p className="text-sm text-white/60">Your baseline is set for this exercise</p>
              </div>
              
              {/* ROM result */}
              <div className="bg-white/5 rounded-xl p-5 mb-6">
                <div className="text-center mb-4">
                  <p className="text-xs text-white/40 mb-1">Target ROM (Average)</p>
                  <p className="text-4xl font-bold text-green-400">{avgROM.toFixed(1)}<span className="text-lg text-white/50">{romUnit}</span></p>
                </div>
                
                {/* Individual rep ROMs */}
                <div className="flex justify-center gap-6">
                  {repROMs.map((rom, i) => (
                    <div key={i} className="text-center">
                      <p className="text-xs text-white/30">Rep {i + 1}</p>
                      <p className="text-sm font-medium text-white/70">{rom.toFixed(1)}{romUnit}</p>
                    </div>
                  ))}
                </div>
              </div>
              
              <button
                type="button"
                onClick={handleClose}
                className="w-full py-4 text-base bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-bold rounded-xl transition-all duration-150"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
