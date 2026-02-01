import { useState, useRef, useEffect } from 'react';

export default function CalibrationHistoryPanel({ equipment, workout }) {
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
        Calibrate your device for accurate rep tracking
      </p>
      <button className="text-xs sm:text-sm px-4 py-2 sm:px-6 sm:py-2.5 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 hover:bg-violet-500/30 transition-colors font-medium">
        Start Calibration
      </button>
    </div>
  );
}
