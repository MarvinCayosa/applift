import { useState, useRef, useEffect } from 'react';
import { hasCalibration, loadCalibration } from './CalibrationModal';

export default function CalibrationHistoryPanel({ equipment, workout, onCalibrateClick }) {
  const [calibrationData, setCalibrationData] = useState(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  
  useEffect(() => {
    if (equipment && workout) {
      const calibrated = hasCalibration(equipment, workout);
      setIsCalibrated(calibrated);
      if (calibrated) {
        setCalibrationData(loadCalibration(equipment, workout));
      }
    }
  }, [equipment, workout]);
  
  if (isCalibrated && calibrationData) {
    const unit = calibrationData.unit || '°';
    const targetROM = calibrationData.targetROM;
    const savedAt = calibrationData.savedAt ? new Date(calibrationData.savedAt) : null;
    const timeAgo = savedAt ? getTimeAgo(savedAt) : '';
    
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl p-2.5 sm:p-4 h-full flex flex-col items-center justify-center">
        {/* Calibrated icon */}
        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mb-2 sm:mb-3">
          <svg className="w-5 h-5 sm:w-7 sm:h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h4 className="text-sm sm:text-base font-semibold text-white mb-1">ROM Calibrated</h4>
        <p className="text-lg sm:text-xl font-bold text-green-400 mb-1">
          {targetROM?.toFixed(1)}{unit}
        </p>
        {timeAgo && (
          <p className="text-[10px] sm:text-xs text-white/30 mb-2">{timeAgo}</p>
        )}
        <button 
          onClick={onCalibrateClick}
          className="text-[10px] sm:text-xs px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-violet-500/15 border border-violet-500/30 text-violet-300 hover:bg-violet-500/25 transition-colors font-medium"
        >
          Recalibrate
        </button>
      </div>
    );
  }
  
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl p-2.5 sm:p-4 h-full flex flex-col items-center justify-center">
      {/* Circular Icon */}
      <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center mb-2 sm:mb-4">
        <svg className="w-5 h-5 sm:w-7 sm:h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h4 className="text-base sm:text-lg font-semibold text-white mb-1.5 sm:mb-2">First Time?</h4>
      <p className="text-xs sm:text-sm text-white/50 text-center leading-relaxed mb-3 sm:mb-4 px-2">
        Calibrate your ROM for accurate rep tracking
      </p>
      <button 
        onClick={onCalibrateClick}
        className="text-xs sm:text-sm px-4 py-2 sm:px-6 sm:py-2.5 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/30 transition-colors font-medium"
      >
        Start ROM Calibration
      </button>
    </div>
  );
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
