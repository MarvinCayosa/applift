import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Haptic feedback helper for PWA
const triggerHaptic = () => {
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
};

// iOS-style Wheel Picker for time selection
function TimePicker({ minutes, seconds, onMinutesChange, onSecondsChange }) {
  const minuteRef = useRef(null);
  const secondRef = useRef(null);
  const scrollTimeoutRef = useRef({ minutes: null, seconds: null });
  const lastIndexRef = useRef({ minutes: -1, seconds: -1 });
  const itemHeight = 44;

  // Minutes: 0-10
  const minuteOptions = Array.from({ length: 11 }, (_, i) => i);
  // Seconds: 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
  const secondOptions = Array.from({ length: 12 }, (_, i) => i * 5);

  // Initialize scroll position on mount
  useEffect(() => {
    if (minuteRef.current) {
      const minIndex = minuteOptions.indexOf(minutes);
      if (minIndex >= 0) {
        minuteRef.current.scrollTop = minIndex * itemHeight;
        lastIndexRef.current.minutes = minIndex;
      }
    }
    if (secondRef.current) {
      const secIndex = secondOptions.indexOf(seconds);
      if (secIndex >= 0) {
        secondRef.current.scrollTop = secIndex * itemHeight;
        lastIndexRef.current.seconds = secIndex;
      }
    }
  }, [minutes, seconds]);

  const handleScroll = (ref, options, setter, type) => {
    if (!ref.current) return;

    const scrollTop = ref.current.scrollTop;
    const rawIndex = scrollTop / itemHeight;
    const snappedIndex = Math.round(rawIndex);
    const clampedIndex = Math.max(0, Math.min(options.length - 1, snappedIndex));

    // Haptic feedback on index change
    if (lastIndexRef.current[type] !== clampedIndex) {
      triggerHaptic();
      lastIndexRef.current[type] = clampedIndex;
      setter(options[clampedIndex]);
    }

    // Auto-snap after scrolling stops
    if (scrollTimeoutRef.current[type]) clearTimeout(scrollTimeoutRef.current[type]);
    scrollTimeoutRef.current[type] = setTimeout(() => {
      if (!ref.current) return;
      ref.current.scrollTo({
        top: clampedIndex * itemHeight,
        behavior: 'smooth'
      });
    }, 100);
  };

  const handleClickItem = (index, options, setter, ref, type) => {
    if (lastIndexRef.current[type] !== index) {
      triggerHaptic();
      lastIndexRef.current[type] = index;
      setter(options[index]);
      ref.current?.scrollTo({
        top: index * itemHeight,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Header row for MIN and SEC labels */}
      <div className="flex gap-4 mb-2">
        <div className="flex-1 text-center">
          <span className="text-sm font-bold text-white uppercase tracking-wider">MIN</span>
        </div>
        <div className="w-8" /> {/* Spacer for colon */}
        <div className="flex-1 text-center">
          <span className="text-sm font-bold text-white uppercase tracking-wider">SEC</span>
        </div>
      </div>

      {/* Picker area */}
      <div className="relative">
        {/* Selection highlight bar - centered in scroll area */}
        <div
          className="absolute inset-x-0 z-10 pointer-events-none rounded-xl"
          style={{
            top: '50%',
            transform: 'translateY(-50%)',
            height: itemHeight,
            backgroundColor: 'rgba(139, 92, 246, 0.15)',
            borderTop: '1px solid rgba(139, 92, 246, 0.3)',
            borderBottom: '1px solid rgba(139, 92, 246, 0.3)',
          }}
        />

        {/* Top fade gradient */}
        <div
          className="absolute inset-x-0 top-0 z-20 pointer-events-none rounded-t-2xl"
          style={{
            height: '80px',
            background: 'linear-gradient(to bottom, rgb(38,38,38), transparent)',
          }}
        />

        {/* Bottom fade gradient */}
        <div
          className="absolute inset-x-0 bottom-0 z-20 pointer-events-none rounded-b-2xl"
          style={{
            height: '80px',
            background: 'linear-gradient(to top, rgb(38,38,38), transparent)',
          }}
        />

        <div className="flex gap-4">
          {/* Minutes Column */}
          <div className="flex-1">
            <div
              ref={minuteRef}
              className="h-52 overflow-y-scroll scrollbar-hide relative"
              style={{ scrollSnapType: 'y mandatory' }}
              onScroll={() => handleScroll(minuteRef, minuteOptions, onMinutesChange, 'minutes')}
            >
              <div style={{ height: itemHeight * 2 }} />
              {minuteOptions.map((min, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-center text-center cursor-pointer transition-all ${
                    min === minutes
                      ? 'text-white font-bold text-4xl'
                      : 'text-white/40 font-normal text-xl'
                  }`}
                  style={{ scrollSnapAlign: 'center', height: itemHeight }}
                  onClick={() => handleClickItem(idx, minuteOptions, onMinutesChange, minuteRef, 'minutes')}
                >
                  {min}
                </div>
              ))}
              <div style={{ height: itemHeight * 2 }} />
            </div>
          </div>

          {/* Separator - vertically centered */}
          <div className="flex items-center justify-center w-8">
            <span className="text-4xl font-bold text-white/60">:</span>
          </div>

          {/* Seconds Column */}
          <div className="flex-1">
            <div
              ref={secondRef}
              className="h-52 overflow-y-scroll scrollbar-hide relative"
              style={{ scrollSnapType: 'y mandatory' }}
              onScroll={() => handleScroll(secondRef, secondOptions, onSecondsChange, 'seconds')}
            >
              <div style={{ height: itemHeight * 2 }} />
              {secondOptions.map((sec, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-center text-center cursor-pointer transition-all ${
                    sec === seconds
                      ? 'text-white font-bold text-4xl'
                      : 'text-white/40 font-normal text-xl'
                  }`}
                  style={{ scrollSnapAlign: 'center', height: itemHeight }}
                  onClick={() => handleClickItem(idx, secondOptions, onSecondsChange, secondRef, 'seconds')}
                >
                  {sec.toString().padStart(2, '0')}
                </div>
              ))}
              <div style={{ height: itemHeight * 2 }} />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

export default function RestTimerModal({ 
  isOpen, 
  onClose, 
  onSave,
  initialMinutes = 0,
  initialSeconds = 30
}) {
  const [minutes, setMinutes] = useState(initialMinutes);
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isClosing, setIsClosing] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Reset values when modal opens
  useEffect(() => {
    if (isOpen) {
      setMinutes(initialMinutes);
      setSeconds(initialSeconds);
    }
  }, [isOpen, initialMinutes, initialSeconds]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 250);
  };

  // Touch handlers for swipe-down-to-dismiss
  const handleHandleTouchStart = (e) => {
    setDragStartY(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleHandleTouchMove = (e) => {
    if (!isDragging) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - dragStartY;
    
    if (diff > 0) {
      setDragCurrentY(diff);
    }
  };

  const handleHandleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    
    if (dragCurrentY > 100) {
      handleClose();
    }
    
    setDragCurrentY(0);
  };

  if (!isOpen) return null;

  const handleSave = () => {
    const totalSeconds = minutes * 60 + seconds;
    onSave({ minutes, seconds, totalSeconds });
    handleClose();
  };

  // Use portal to render modal at document body level
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-50 flex items-end justify-center transition-opacity duration-250 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={handleClose}
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
          <div 
            className="flex justify-center mb-4 py-2 cursor-grab active:cursor-grabbing"
            onTouchStart={handleHandleTouchStart}
            onTouchMove={handleHandleTouchMove}
            onTouchEnd={handleHandleTouchEnd}
          >
            <div className="w-9 h-1 rounded-full bg-white/30" />
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-white">Rest Timer</h3>
            <p className="text-sm text-white/50 mt-1">Set your rest duration between sets</p>
          </div>

          {/* Time Picker */}
          <div className="mb-6">
            <TimePicker
              minutes={minutes}
              seconds={seconds}
              onMinutesChange={setMinutes}
              onSecondsChange={setSeconds}
            />
          </div>

          {/* Done button */}
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-4 text-base bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-bold rounded-xl transition-all duration-150"
          >
            Done
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}
