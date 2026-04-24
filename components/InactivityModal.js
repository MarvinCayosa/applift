/**
 * InactivityModal
 * 
 * Shows when no IMU activity detected for 10 seconds during workout
 * Asks user if they're still there and offers to resume or end session
 */

import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

export default function InactivityModal({ isOpen, onResume, onEndSession }) {
  const [isClosing, setIsClosing] = useState(false);
  const [countdown, setCountdown] = useState(30); // 30 second auto-end countdown

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setCountdown(30);
      
      // Auto-end session after 30 seconds of no response
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            handleEndSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [isOpen]);

  const handleResume = () => {
    setIsClosing(true);
    setTimeout(() => {
      onResume();
    }, 250);
  };

  const handleEndSession = () => {
    setIsClosing(true);
    setTimeout(() => {
      onEndSession();
    }, 250);
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-250 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      />
      
      {/* Modal Card */}
      <div 
        className={`relative bg-gradient-to-br from-zinc-900 to-black border border-zinc-700 rounded-2xl shadow-2xl max-w-md w-full transition-all duration-250 ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3 mb-2">
            {/* Pause Icon */}
            <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white">Session Paused</h3>
              <p className="text-sm text-gray-400">No activity detected</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-300 mb-4">
            We haven't detected any movement for the last 10 seconds. Are you still working out?
          </p>

          {/* Auto-end warning */}
          <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Auto-ending in {countdown}s</p>
                <p className="text-xs text-gray-400">Session will end automatically if no response</p>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-300 font-medium mb-2">💡 Tips:</p>
            <ul className="text-xs text-blue-200/80 space-y-1">
              <li>• Make sure your device is securely attached</li>
              <li>• Check if the sensor is still connected</li>
              <li>• Resume when you're ready to continue</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleEndSession}
              className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors border border-zinc-700"
            >
              End Session
            </button>
            <button
              onClick={handleResume}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all"
            >
              I'm Here! Resume
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
