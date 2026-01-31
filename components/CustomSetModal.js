import { useState, useRef, useEffect } from 'react';

// Horizontal Wheel Picker Component for numbers (sets, reps) - Auto-snapping
function WheelPicker({ items, selectedValue, onValueChange }) {
  const wheelRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const itemWidth = 56;

  // Initialize scroll position on mount
  useEffect(() => {
    if (wheelRef.current && selectedValue !== undefined) {
      const idx = items.indexOf(selectedValue);
      if (idx !== -1) {
        wheelRef.current.scrollLeft = idx * itemWidth;
      }
    }
  }, [selectedValue, items]);

  const handleScroll = () => {
    if (!wheelRef.current) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const scrollLeft = wheelRef.current.scrollLeft;
      const index = Math.round(scrollLeft / itemWidth);
      const clamped = Math.max(0, Math.min(items.length - 1, index));
      const selected = items[clamped];
      onValueChange(selected);
      // Smooth snap to center
      wheelRef.current.scrollTo({
        left: clamped * itemWidth,
        behavior: 'smooth'
      });
    }, 50);
  };

  const handleClickItem = (index) => {
    const selected = items[index];
    onValueChange(selected);
    if (wheelRef.current) {
      wheelRef.current.scrollTo({
        left: index * itemWidth,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="relative">
      {/* Selection indicator - purple theme */}
      <div
        className="absolute inset-y-0 z-10 pointer-events-none"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          width: itemWidth,
          backgroundColor: 'rgba(139, 92, 246, 0.12)',
          borderLeft: '2px solid rgba(139, 92, 246, 0.5)',
          borderRight: '2px solid rgba(139, 92, 246, 0.5)',
          borderRadius: '12px',
        }}
      />

      {/* Left fade - stronger gradient */}
      <div
        className="absolute inset-y-0 left-0 z-20 pointer-events-none"
        style={{
          width: '80px',
          background: 'linear-gradient(to right, rgba(23,23,23,1) 0%, rgba(23,23,23,0.8) 40%, rgba(23,23,23,0) 100%)',
        }}
      />

      {/* Right fade - stronger gradient */}
      <div
        className="absolute inset-y-0 right-0 z-20 pointer-events-none"
        style={{
          width: '80px',
          background: 'linear-gradient(to left, rgba(23,23,23,1) 0%, rgba(23,23,23,0.8) 40%, rgba(23,23,23,0) 100%)',
        }}
      />

      <div
        ref={wheelRef}
        className="w-full h-24 overflow-x-scroll scrollbar-hide relative flex items-center"
        style={{ scrollSnapType: 'x mandatory' }}
        onScroll={handleScroll}
      >
        <div style={{ width: itemWidth * 2.5 }} className="flex-shrink-0" />
        {items.map((item, idx) => {
          const isCentered = item === selectedValue;
          return (
            <div
              key={idx}
              className="flex items-center justify-center text-center cursor-pointer flex-shrink-0"
              style={{ 
                scrollSnapAlign: 'center', 
                width: itemWidth,
                fontSize: isCentered ? '2.5rem' : '1.25rem',
                fontWeight: isCentered ? 700 : 500,
                color: isCentered ? 'white' : 'rgba(255,255,255,0.3)',
                transition: 'font-size 0.2s ease-out, color 0.2s ease-out, font-weight 0.2s ease-out',
              }}
              onClick={() => handleClickItem(idx)}
            >
              {item}
            </div>
          );
        })}
        <div style={{ width: itemWidth * 2.5 }} className="flex-shrink-0" />
      </div>
    </div>
  );
}

// Weight Picker Component - Ruler/Scale style, allows any value but snaps nicely
function WeightPicker({ value, onValueChange, unit, onUnitChange }) {
  const wheelRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const tickWidth = 8;
  const maxWeight = 200;

  // Initialize scroll position on mount
  useEffect(() => {
    if (wheelRef.current && value !== undefined) {
      wheelRef.current.scrollLeft = value * tickWidth;
    }
  }, [value]);

  const handleScroll = () => {
    if (!wheelRef.current) return;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const scrollLeft = wheelRef.current.scrollLeft;
      const rawValue = scrollLeft / tickWidth;
      // Snap to nearest whole number - allows any weight (1, 2, 14, etc.)
      const snappedValue = Math.round(rawValue);
      const clamped = Math.max(1, Math.min(maxWeight, snappedValue));
      onValueChange(clamped);
      // Smooth snap to position
      wheelRef.current.scrollTo({
        left: clamped * tickWidth,
        behavior: 'smooth'
      });
    }, 50);
  };

  // Generate tick marks
  const ticks = Array.from({ length: maxWeight + 1 }, (_, i) => i);

  return (
    <div className="relative">
      {/* Value display */}
      <div className="text-center mb-3">
        <span className="text-4xl font-bold text-white" style={{ transition: 'all 0.15s ease-out' }}>{value}</span>
        <button
          type="button"
          onClick={() => onUnitChange(unit === 'kg' ? 'lbs' : 'kg')}
          className="ml-2 text-lg text-white/60 hover:text-white/80 transition-colors"
        >
          {unit}
        </button>
      </div>

      {/* Center indicator line - slightly taller than major ticks */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 0,
          width: '3px',
          height: '34px',
          backgroundColor: 'rgba(139, 92, 246, 1)',
          borderRadius: '2px',
        }}
      />

      {/* Left fade */}
      <div
        className="absolute bottom-0 left-0 z-20 pointer-events-none"
        style={{
          width: '80px',
          height: '48px',
          background: 'linear-gradient(to right, rgba(23,23,23,1) 0%, rgba(23,23,23,0.8) 40%, rgba(23,23,23,0) 100%)',
        }}
      />

      {/* Right fade */}
      <div
        className="absolute bottom-0 right-0 z-20 pointer-events-none"
        style={{
          width: '80px',
          height: '48px',
          background: 'linear-gradient(to left, rgba(23,23,23,1) 0%, rgba(23,23,23,0.8) 40%, rgba(23,23,23,0) 100%)',
        }}
      />

      {/* Ruler track */}
      <div
        ref={wheelRef}
        className="w-full h-12 overflow-x-scroll scrollbar-hide relative flex items-end"
        onScroll={handleScroll}
      >
        <div style={{ width: '50%' }} className="flex-shrink-0" />
        {ticks.map((tick) => {
          const isMajor = tick % 10 === 0;
          const isMid = tick % 5 === 0 && !isMajor;
          const isMinor = !isMajor && !isMid;
          return (
            <div
              key={tick}
              className="flex-shrink-0 flex flex-col items-center justify-end"
              style={{ width: tickWidth }}
            >
              <div
                className={`w-0.5 rounded-full ${
                  isMajor ? 'bg-violet-400' : isMid ? 'bg-white/40' : 'bg-white/20'
                }`}
                style={{ height: isMajor ? '28px' : isMid ? '18px' : '8px' }}
              />
            </div>
          );
        })}
        <div style={{ width: '50%' }} className="flex-shrink-0" />
      </div>
    </div>
  );
}

export default function CustomSetModal({ 
  isOpen, 
  onClose, 
  onSave,
  initialValue = 5,
  initialWeightUnit = 'kg',
  fieldType = 'weight' // 'weight', 'sets', 'reps'
}) {
  const [value, setValue] = useState(initialValue);
  const [weightUnit, setWeightUnit] = useState(initialWeightUnit);

  // Generate arrays for wheel pickers based on field type
  const getOptions = () => {
    switch (fieldType) {
      case 'sets':
        return Array.from({ length: 10 }, (_, i) => i + 1);
      case 'reps':
        return Array.from({ length: 30 }, (_, i) => i + 1);
      default:
        return Array.from({ length: 50 }, (_, i) => i + 1);
    }
  };

  const getFieldLabel = () => {
    switch (fieldType) {
      case 'weight':
        return 'Weight';
      case 'sets':
        return 'Sets';
      case 'reps':
        return 'Reps';
      default:
        return 'Value';
    }
  };

  // Reset to initial values when modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue || (fieldType === 'weight' ? 5 : getOptions()[0]));
      setWeightUnit(initialWeightUnit);
    }
  }, [isOpen, initialValue, initialWeightUnit, fieldType]);

  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 300); // Match animation duration
  };

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({ value, weightUnit, fieldType });
    handleClose();
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-end justify-center px-4 transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.75)', 
        backdropFilter: 'blur(16px)', 
        WebkitBackdropFilter: 'blur(16px)' 
      }}
      onClick={handleClose}
    >
      {/* Modal at bottom with padding from sides */}
      <div 
        className={`w-full max-w-lg mb-6 transition-all duration-300 ease-out ${isClosing ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0 animate-slide-up'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal content - taller */}
        <div 
          className="bg-neutral-900 rounded-2xl p-5 border border-white/10"
          style={{ 
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)' 
          }}
        >
          {/* Header */}
          <div className="text-center mb-4">
            <h2 className="text-base font-semibold text-white">{getFieldLabel()}</h2>
          </div>

          {/* Picker - different style for weight vs sets/reps */}
          <div className="mb-5">
            {fieldType === 'weight' ? (
              <WeightPicker
                value={value}
                onValueChange={setValue}
                unit={weightUnit}
                onUnitChange={setWeightUnit}
              />
            ) : (
              <WheelPicker
                items={getOptions()}
                selectedValue={value}
                onValueChange={setValue}
              />
            )}
          </div>

          {/* Action Buttons - More rounded */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-3 text-sm bg-neutral-700 hover:bg-neutral-600 text-white/80 font-medium rounded-full transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-3 text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-full transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
