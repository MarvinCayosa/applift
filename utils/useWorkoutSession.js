import { useCallback, useEffect, useRef, useState } from 'react';
import { RepCounter } from './RepCounter';
import { useIMUData } from './useIMUData';

const MAX_CHART_POINTS = 100; // Last 5 seconds at 20Hz

export function useWorkoutSession({ 
  connected, 
  recommendedReps = 5, 
  recommendedSets = 2,
  onSetComplete,
  onWorkoutComplete 
}) {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const [countdownActive, setCountdownActive] = useState(false);
  const recordingStartTime = useRef(0);
  const rawDataLog = useRef([]);
  
  // Refs to avoid closure issues in callbacks
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const countdownActiveRef = useRef(false);
  
  // Break state
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakTimeRemaining, setBreakTimeRemaining] = useState(30);
  const [breakPaused, setBreakPaused] = useState(false);
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const breakTimerRef = useRef(null);
  
  // Workout stats tracking across all sets
  const [workoutStats, setWorkoutStats] = useState({
    totalReps: 0,
    allRepDurations: [],
    completedSets: 0,
    totalTime: 0,
    setData: [] // Track data for each completed set
  });
  
  // Timer state
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = useRef(null);
  
  // Rep counter
  const repCounterRef = useRef(new RepCounter());
  const [repStats, setRepStats] = useState(repCounterRef.current.getStats());
  
  // Workout tracking
  const [currentSet, setCurrentSet] = useState(1);
  
  // Chart data (limited for real-time display)
  const [timeData, setTimeData] = useState([]);
  const [rawAccelData, setRawAccelData] = useState([]);
  const [filteredAccelData, setFilteredAccelData] = useState([]);
  
  // Full chart data (complete workout session for workout-finished page)
  const fullTimeData = useRef([]);
  const fullRawAccelData = useRef([]);
  const fullFilteredAccelData = useRef([]);
  
  // IMU data display
  const [currentIMU, setCurrentIMU] = useState({
    accelX: 0, accelY: 0, accelZ: 0,
    gyroX: 0, gyroY: 0, gyroZ: 0,
    roll: 0, pitch: 0, yaw: 0,
    rawMagnitude: 0, filteredMagnitude: 0
  });
  
  // Statistics
  const [sampleCount, setSampleCount] = useState(0);
  const [dataRate, setDataRate] = useState(0);
  const lastSampleTime = useRef(Date.now());
  const sampleCounter = useRef(0);

  // Handle IMU data callback
  const handleIMUData = useCallback((data) => {
    // Always update display values (even during countdown)
    setCurrentIMU(data);
    
    // Update sample count
    sampleCounter.current++;
    const now = Date.now();
    if (now - lastSampleTime.current >= 1000) {
      setDataRate(sampleCounter.current);
      setSampleCount(prev => prev + sampleCounter.current);
      sampleCounter.current = 0;
      lastSampleTime.current = now;
    }
    
    // Start chart and counting after countdown completes - use refs to avoid closure issues
    if (isRecordingRef.current && !isPausedRef.current && !countdownActiveRef.current) {
      if (recordingStartTime.current === 0) {
        recordingStartTime.current = data.timestamp;
      }
      
      const relativeTime = data.timestamp - recordingStartTime.current;
      
      // Log raw data
      rawDataLog.current.push({
        timestamp: relativeTime,
        ...data
      });
      
      // Update chart data
      const seconds = Math.floor(relativeTime / 1000);
      const milliseconds = relativeTime % 1000;
      const displayTime = `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
      
      // Store in full data arrays (complete workout)
      fullTimeData.current.push(displayTime);
      fullRawAccelData.current.push(data.rawMagnitude);
      fullFilteredAccelData.current.push(data.filteredMagnitude);
      
      // Update limited chart data for real-time display
      setTimeData(prev => {
        const newData = [...prev, displayTime];
        return newData.length > MAX_CHART_POINTS ? newData.slice(-MAX_CHART_POINTS) : newData;
      });
      
      setRawAccelData(prev => {
        const newData = [...prev, data.rawMagnitude];
        return newData.length > MAX_CHART_POINTS ? newData.slice(-MAX_CHART_POINTS) : newData;
      });
      
      setFilteredAccelData(prev => {
        const newData = [...prev, data.filteredMagnitude];
        return newData.length > MAX_CHART_POINTS ? newData.slice(-MAX_CHART_POINTS) : newData;
      });
      
      // Rep counting
      repCounterRef.current.addSample(
        data.accelX, data.accelY, data.accelZ,
        data.gyroX, data.gyroY, data.gyroZ,
        data.roll, data.pitch, data.yaw,
        data.filteredMagnitude, relativeTime
      );
      
      setRepStats(repCounterRef.current.getStats());
    }
  }, []);

  // Subscribe to IMU data
  const { isSubscribed: imuSubscribed, error: imuError, resetFilters } = useIMUData(handleIMUData, null);
  
  // Sync state to refs to avoid closure issues in callbacks
  useEffect(() => {
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
    countdownActiveRef.current = countdownActive;
  }, [isRecording, isPaused, countdownActive]);

  // Timer effect - starts after countdown completes
  useEffect(() => {
    if (isRecording && !isPaused && !countdownActive) {
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isRecording, isPaused, countdownActive]);

  // Break timer effect
  useEffect(() => {
    if (isOnBreak && !breakPaused) {
      breakTimerRef.current = setInterval(() => {
        setBreakTimeRemaining(prev => {
          if (prev <= 1) {
            endBreak();
            return 30;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
        breakTimerRef.current = null;
      }
    }

    return () => {
      if (breakTimerRef.current) {
        clearInterval(breakTimerRef.current);
      }
    };
  }, [isOnBreak, breakPaused]);

  // Check if set is complete (reps reached target)
  useEffect(() => {
    if (isRecording && !isPaused && !countdownActive && !isOnBreak) {
      if (repStats.repCount >= recommendedReps && repStats.repCount > 0) {
        // Track stats for this completed set
        const currentRepData = repCounterRef.current.exportData();
        const repDurations = currentRepData.reps.map(rep => rep.duration);
        
        // Prepare rep data for this set
        const setRepsData = currentRepData.reps.map((rep, index) => ({
          time: rep.duration,
          rom: rep.peakAcceleration * 10,
          peakVelocity: rep.peakVelocity || rep.peakAcceleration / 2,
          isClean: rep.duration >= 2.0 && rep.duration <= 4.0,
          chartData: fullFilteredAccelData.current
        }));
        
        // Store this set's data
        const currentSetData = {
          setNumber: currentSet,
          reps: repStats.repCount,
          duration: elapsedTime,
          repsData: setRepsData,
          chartData: [...fullFilteredAccelData.current],
          timeData: [...fullTimeData.current]
        };
        
        setWorkoutStats(prev => ({
          totalReps: prev.totalReps + repStats.repCount,
          allRepDurations: [...prev.allRepDurations, ...repDurations],
          completedSets: prev.completedSets + 1,
          totalTime: prev.totalTime + elapsedTime,
          setData: [...prev.setData, currentSetData]
        }));
        
        // Set complete - trigger break or workout complete
        if (currentSet >= recommendedSets) {
          // Last set complete - workout finished
          setIsRecording(false);
          setIsPaused(false);
          
          if (onWorkoutComplete) {
            onWorkoutComplete({
              workoutStats: {
                ...workoutStats,
                totalReps: workoutStats.totalReps + repStats.repCount,
                totalTime: workoutStats.totalTime + elapsedTime
              },
              repData: repCounterRef.current.exportData(),
              chartData: { 
                rawAccelData: fullRawAccelData.current, 
                filteredAccelData: fullFilteredAccelData.current, 
                timeData: fullTimeData.current 
              }
            });
          }
        } else {
          // More sets remaining - take a break
          startBreak();
          if (onSetComplete) {
            onSetComplete(currentSet);
          }
        }
      }
    }
  }, [repStats.repCount, recommendedReps, isRecording, isPaused, countdownActive, isOnBreak, currentSet, recommendedSets]);

  // Pause/Resume
  const togglePause = () => {
    setIsPaused(prev => {
      const newValue = !prev;
      isPausedRef.current = newValue;
      return newValue;
    });
  };

  // Start break between sets
  const startBreak = () => {
    const messages = [
      "You're doing amazing!",
      "Keep up the great work!",
      "Stay strong, you've got this!",
      "Almost there, keep pushing!",
      "You're crushing it!",
      "Breathe and recover!",
      "Rest up for the next set!",
      "You're making progress!"
    ];
    setMotivationalMessage(messages[Math.floor(Math.random() * messages.length)]);
    setIsOnBreak(true);
    setIsPaused(true);
    setBreakTimeRemaining(30);
  };

  // End break and start next set automatically
  const endBreak = async () => {
    // Fade out the break timer first
    const breakOverlay = document.querySelector('.break-overlay');
    if (breakOverlay) {
      breakOverlay.classList.add('animate-fadeOut');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    setIsOnBreak(false);
    setBreakPaused(false);
    
    // Reset reps and increment set
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
    setCurrentSet(prev => prev + 1);
    
    // Clear chart data for new set BEFORE countdown
    setTimeData([]);
    setRawAccelData([]);
    setFilteredAccelData([]);
    fullTimeData.current = [];
    fullRawAccelData.current = [];
    fullFilteredAccelData.current = [];
    recordingStartTime.current = 0;
    rawDataLog.current = [];
    resetFilters();
    setElapsedTime(0);
    
    // Run countdown
    await runCountdown();
  };

  // Stop break and start next set immediately
  const stopBreak = () => {
    if (breakTimerRef.current) {
      clearInterval(breakTimerRef.current);
      breakTimerRef.current = null;
    }
    setBreakTimeRemaining(30);
    endBreak();
  };
  
  // Toggle pause for break timer
  const toggleBreakPause = () => {
    setBreakPaused(prev => !prev);
  };

  // Run countdown sequence
  const runCountdown = async () => {
    // Set states for countdown phase
    setCountdownActive(true);
    countdownActiveRef.current = true;
    setIsPaused(false);
    isPausedRef.current = false;
    setIsRecording(true);
    isRecordingRef.current = true;
    
    // Show countdown overlay
    setShowCountdown(true);
    setCountdownValue(3);
    
    for (let i = 3; i > 0; i--) {
      setCountdownValue(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setCountdownValue('GO!');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Add fade-out animation
    const countdownOverlay = document.querySelector('.countdown-overlay');
    if (countdownOverlay) {
      countdownOverlay.classList.add('animate-fadeOut');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // Countdown complete - enable recording and counting
    setShowCountdown(false);
    setCountdownActive(false);
    countdownActiveRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setIsRecording(true);
    isRecordingRef.current = true;
    
    // Scroll to top to show chart
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Start recording with countdown
  const startRecording = async () => {
    if (!connected || !imuSubscribed) {
      alert('Please connect to your IMU device first!');
      return;
    }
    
    // Reset data BEFORE countdown
    recordingStartTime.current = 0;
    rawDataLog.current = [];
    repCounterRef.current.reset();
    resetFilters();
    setRepStats(repCounterRef.current.getStats());
    setTimeData([]);
    setRawAccelData([]);
    setFilteredAccelData([]);
    fullTimeData.current = [];
    fullRawAccelData.current = [];
    fullFilteredAccelData.current = [];
    setSampleCount(0);
    setElapsedTime(0);
    
    // Run countdown
    await runCountdown();
  };

  // Stop recording
  const stopRecording = () => {
    setIsRecording(false);
    setIsPaused(false);
    setIsOnBreak(false);
    
    // Reset for next session
    setCurrentSet(1);
    setWorkoutStats({ totalReps: 0, allRepDurations: [], completedSets: 0, totalTime: 0, setData: [] });
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
  };

  // Export data to CSV
  const exportToCSV = () => {
    const data = repCounterRef.current.exportData();
    const samples = data.samples;
    
    if (samples.length === 0) {
      alert('No data to export!');
      return;
    }
    
    // Create CSV header
    const headers = [
      'rep', 'timestamp', 'timestamp_ms',
      'accelX', 'accelY', 'accelZ', 'accelMag',
      'gyroX', 'gyroY', 'gyroZ',
      'roll', 'pitch', 'yaw',
      'filteredX', 'filteredY', 'filteredZ', 'filteredMag'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    // Add data rows
    samples.forEach(sample => {
      const seconds = Math.floor(sample.timestamp / 1000);
      const milliseconds = sample.timestamp % 1000;
      const formattedTime = `${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
      
      const row = [
        sample.repNumber,
        formattedTime,
        sample.timestamp,
        sample.accelX.toFixed(4),
        sample.accelY.toFixed(4),
        sample.accelZ.toFixed(4),
        sample.accelMag.toFixed(4),
        sample.gyroX.toFixed(4),
        sample.gyroY.toFixed(4),
        sample.gyroZ.toFixed(4),
        sample.roll.toFixed(2),
        sample.pitch.toFixed(2),
        sample.yaw.toFixed(2),
        sample.accelX.toFixed(4),
        sample.accelY.toFixed(4),
        sample.accelZ.toFixed(4),
        sample.accelMag.toFixed(4)
      ];
      
      csvContent += row.join(',') + '\n';
    });
    
    return csvContent;
  };

  // Reset rep counter
  const resetReps = () => {
    repCounterRef.current.reset();
    setRepStats(repCounterRef.current.getStats());
  };

  // Format elapsed time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    // State
    isRecording,
    isPaused,
    showCountdown,
    countdownValue,
    isOnBreak,
    breakTimeRemaining,
    breakPaused,
    motivationalMessage,
    elapsedTime,
    currentSet,
    repStats,
    workoutStats,
    currentIMU,
    sampleCount,
    dataRate,
    isSubscribed: imuSubscribed,
    
    // Chart data
    timeData,
    rawAccelData,
    filteredAccelData,
    
    // Actions
    startRecording,
    stopRecording,
    togglePause,
    toggleBreakPause,
    stopBreak,
    exportToCSV,
    resetReps,
    formatTime,
    
    // Refs for advanced use
    repCounterRef,
    rawDataLog
  };
}
