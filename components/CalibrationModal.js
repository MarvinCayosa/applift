import { useState, useRef, useEffect } from 'react';

// Haptic feedback helper for PWA
const triggerHaptic = () => {
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
};

export default function CalibrationModal({ isOpen, onClose, onCalibrate }) {
  const [isClosing, setIsClosing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [step, setStep] = useState(1); // 1: Instructions, 2: Calibrating, 3: Success

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
      setStep(1);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setStep(1);
    }, 250);
  };

  const handleStartCalibration = () => {
    triggerHaptic();
    setStep(2);
    
    // Simulate calibration process
    setTimeout(() => {
      setStep(3);
      triggerHaptic();
      
      // Auto close after showing success
      setTimeout(() => {
        handleClose();
        if (onCalibrate) onCalibrate();
      }, 1500);
    }, 3000);
  };

  // Touch handlers for swipe-down-to-dismiss - ONLY on handle area
  const handleHandleTouchStart = (e) => {
    setDragStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleHandleTouchMove = (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - dragStartY;
    
    // Only allow dragging down
    if (diff > 0) {
      setDragCurrentY(diff);
    }
  };

  const handleHandleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    // If dragged down more than 100px, close the modal
    if (dragCurrentY > 100) {
      handleClose();
    }
    
    // Reset drag position
    setDragCurrentY(0);
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-250 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={step !== 2 ? handleClose : undefined}
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
          {/* Handle - only this area allows swipe to dismiss (except during calibration) */}
          {step !== 2 && (
            <div 
              className="flex justify-center mb-6 py-2 cursor-grab active:cursor-grabbing"
              onTouchStart={handleHandleTouchStart}
              onTouchMove={handleHandleTouchMove}
              onTouchEnd={handleHandleTouchEnd}
            >
              <div className="w-9 h-1 rounded-full bg-white/30" />
            </div>
          )}
          
          {step === 2 && (
            <div className="flex justify-center mb-6 py-2">
              <div className="w-9 h-1 rounded-full bg-white/30" />
            </div>
          )}

          {/* Step 1: Instructions */}
          {step === 1 && (
            <div className="mb-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Calibrate Device</h2>
                <p className="text-sm text-white/60">Ensure optimal tracking accuracy</p>
              </div>
              
              {/* Instructions */}
              <div className="space-y-4 mb-8">
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-400 font-bold text-sm">1</span>
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Position Device</p>
                      <p className="text-sm text-white/60">Place the device on a flat, stable surface</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-400 font-bold text-sm">2</span>
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Stay Still</p>
                      <p className="text-sm text-white/60">Keep the device motionless during calibration</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-400 font-bold text-sm">3</span>
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Wait for Completion</p>
                      <p className="text-sm text-white/60">Calibration takes about 3 seconds</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Start Calibration Button */}
              <button
                type="button"
                onClick={handleStartCalibration}
                className="w-full py-4 text-base bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-bold rounded-xl transition-all duration-150"
              >
                Start Calibration
              </button>
            </div>
          )}

          {/* Step 2: Calibrating */}
          {step === 2 && (
            <div className="mb-8">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-white mb-2">Calibrating...</h2>
                <p className="text-sm text-white/60">Keep device still</p>
              </div>
              
              {/* Animated loader */}
              <div className="flex justify-center mb-8">
                <div className="relative w-24 h-24">
                  {/* Spinning circle */}
                  <svg className="animate-spin w-24 h-24" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="rgba(139, 92, 246, 0.2)"
                      strokeWidth="8"
                      fill="none"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#8B5CF6"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray="251.2"
                      strokeDashoffset="62.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  
                  {/* Center icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-10 h-10 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-white/40 text-sm">Please wait...</p>
              </div>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 3 && (
            <div className="mb-8">
              <div className="text-center mb-8">
                <div className="flex justify-center mb-4">
                  <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                    <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Calibration Complete!</h2>
                <p className="text-sm text-white/60">Your device is ready to track</p>
              </div>
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
      `}</style>
    </div>
  );
}
