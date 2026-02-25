import { useState, useRef, useEffect } from 'react';

// Haptic feedback helper for PWA
const triggerHaptic = () => {
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
};

// Ruler Picker - For weight with 0.5 increments (starting at 1)
// UI matches the reference image with vertical tick marks and center indicator
function RulerPicker({ value, onValueChange, unit, onUnitChange }) {
  const wheelRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const lastValueRef = useRef(-1);
  const [displayValue, setDisplayValue] = useState(value);
  
  const config = { min: 1, max: 200, step: 0.5 };
  const tickWidth = 20;
  const totalTicks = Math.floor((config.max - config.min) / config.step) + 1;

  const valueToIndex = (val) => Math.round((val - config.min) / config.step);
  const indexToValue = (idx) => config.min + idx * config.step;

  // Sync display value with prop
  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  // Sync scroll position when value changes (including on mount)
  useEffect(() => {
    if (wheelRef.current && value !== undefined) {
      const idx = valueToIndex(value);
      wheelRef.current.scrollLeft = idx * tickWidth;
      lastValueRef.current = value;
    }
  }, [value]);

  const handleScroll = () => {
    if (!wheelRef.current) return;
    
    const scrollLeft = wheelRef.current.scrollLeft;
    const rawIndex = scrollLeft / tickWidth;
    const snappedIndex = Math.round(rawIndex);
    const clampedIndex = Math.max(0, Math.min(totalTicks - 1, snappedIndex));
    const currentValue = indexToValue(clampedIndex);
    
    // Real-time display update
    setDisplayValue(currentValue);
    
    // Haptic feedback for each tick
    if (lastValueRef.current !== currentValue) {
      triggerHaptic();
      lastValueRef.current = currentValue;
      onValueChange(currentValue);
    }
    
    // Auto-snap to closest value after scrolling stops
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (!wheelRef.current) return;
      const finalScrollLeft = wheelRef.current.scrollLeft;
      const finalIndex = Math.round(finalScrollLeft / tickWidth);
      const finalClamped = Math.max(0, Math.min(totalTicks - 1, finalIndex));
      
      wheelRef.current.scrollTo({
        left: finalClamped * tickWidth,
        behavior: 'smooth'
      });
    }, 100);
  };

  const ticks = Array.from({ length: totalTicks }, (_, i) => ({
    index: i,
    value: indexToValue(i)
  }));

  const formatValue = (val) => {
    return val % 1 === 0 ? `${val}.0` : val.toFixed(1);
  };

  // Major tick every 1kg, minor tick every 0.5kg
  const isMajorTick = (tickValue) => tickValue % 1 === 0;
  // Show number label every 0.5kg (like 75.5, 76.0, 76.5)
  const showLabel = (tickValue) => tickValue % 0.5 === 0;

  return (
    <div className="relative">
      {/* Weight Label */}
      <div className="text-center mb-1">
        <p className="text-sm text-white/50 font-medium">Weight</p>
      </div>
      
      {/* Large value display with kg unit */}
      <div className="text-center mb-2 p-2 flex items-baseline justify-center gap-2">
        <span 
          className="text-7xl font-bold text-white tabular-nums tracking-tight"
          style={{ 
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.03em',
          }}
        >
          {formatValue(displayValue)}
        </span>
        <span className="text-lg font-semibold text-violet-400">{unit}</span>
      </div>

      {/* Center indicator - purple line inline with the ruler */}
      <div
        className="absolute z-30 pointer-events-none left-1/2 -translate-x-1/2"
        style={{
          bottom: '0px',
          width: '4px',
          height: '32px',
          background: 'linear-gradient(to bottom, #8B5CF6, #7C3AED)',
          borderRadius: '2px',
        }}
      />

      {/* Left fade gradient */}
      <div
        className="absolute bottom-0 left-0 z-20 pointer-events-none"
        style={{
          width: '80px',
          height: '50px',
          background: 'linear-gradient(to right, rgb(38,38,38) 0%, transparent 100%)',
        }}
      />

      {/* Right fade gradient */}
      <div
        className="absolute bottom-0 right-0 z-20 pointer-events-none"
        style={{
          width: '80px',
          height: '50px',
          background: 'linear-gradient(to left, rgb(38,38,38) 0%, transparent 100%)',
        }}
      />

      {/* Scrollable ruler */}
      <div
        ref={wheelRef}
        className="w-full overflow-x-scroll scrollbar-hide flex items-end"
        onScroll={handleScroll}
        style={{ touchAction: 'pan-x', height: '45px' }}
      >
        {/* Left padding: 50% minus half of tick width to center the first tick */}
        <div style={{ minWidth: 'calc(50% - 10px)' }} className="flex-shrink-0" />
        {ticks.map(({ index, value: tickValue }) => {
          const isMajor = isMajorTick(tickValue);
          return (
            <div
              key={index}
              className="flex-shrink-0 flex flex-col items-center justify-end"
              style={{ width: tickWidth }}
            >
              {/* Tick mark */}
              <div
                style={{ 
                  width: isMajor ? '3px' : '2px',
                  height: isMajor ? '42px' : '24px',
                  backgroundColor: isMajor ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)',
                  borderRadius: '1.5px',
                }}
              />
            </div>
          );
        })}
        {/* Right padding: 50% minus half of tick width */}
        <div style={{ minWidth: 'calc(50% - 10px)' }} className="flex-shrink-0" />
      </div>
    </div>
  );
}

// Horizontal Wheel Picker - For sets and reps (horizontal scroll with numbers)
function WheelPicker({ value, onValueChange, min, max, label }) {
  const wheelRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const lastValueRef = useRef(null);
  const isUserScrolling = useRef(false);
  
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  
  // Fixed item width for consistent centering
  const ITEM_WIDTH = 56;
  const HALF_ITEM = ITEM_WIDTH / 2;

  // Sync scroll position when value changes - always update on value change
  useEffect(() => {
    if (wheelRef.current && value !== undefined) {
      const index = values.indexOf(value);
      if (index >= 0) {
        // Always scroll to the correct position when value prop changes
        // This handles modal opening with a new field type
        wheelRef.current.scrollLeft = index * ITEM_WIDTH;
        lastValueRef.current = value;
        isUserScrolling.current = false;
      }
    }
  }, [value, min, max]); // Also reset when range changes (switching between sets/reps)

  const handleScroll = () => {
    if (!wheelRef.current) return;
    
    isUserScrolling.current = true;
    
    const scrollLeft = wheelRef.current.scrollLeft;
    const index = Math.round(scrollLeft / ITEM_WIDTH);
    const clampedIndex = Math.max(0, Math.min(values.length - 1, index));
    const currentValue = values[clampedIndex];
    
    // Haptic feedback for each value change
    if (lastValueRef.current !== currentValue) {
      triggerHaptic();
      lastValueRef.current = currentValue;
      onValueChange(currentValue);
    }

    // Auto-snap after scrolling stops
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      if (!wheelRef.current) return;
      
      const finalScrollLeft = wheelRef.current.scrollLeft;
      const finalIndex = Math.round(finalScrollLeft / ITEM_WIDTH);
      const finalClamped = Math.max(0, Math.min(values.length - 1, finalIndex));
      const targetScroll = finalClamped * ITEM_WIDTH;
      
      // Only snap if not already at target
      if (Math.abs(finalScrollLeft - targetScroll) > 1) {
        wheelRef.current.scrollTo({
          left: targetScroll,
          behavior: 'smooth'
        });
      }
      
      // Reset scrolling flag after animation
      setTimeout(() => {
        isUserScrolling.current = false;
      }, 150);
    }, 80);
  };

  const handleClickItem = (clickedValue) => {
    if (clickedValue !== value) {
      triggerHaptic();
      onValueChange(clickedValue);
      
      const index = values.indexOf(clickedValue);
      wheelRef.current?.scrollTo({
        left: index * ITEM_WIDTH,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="relative">
      {/* Label */}
      <div className="text-center mb-4">
        <span className="text-sm font-semibold text-white/60">{label}</span>
      </div>
      
      {/* Center highlight box - precisely centered */}
      <div 
        className="absolute left-1/2 -translate-x-1/2 bottom-0 z-10 pointer-events-none"
        style={{
          width: `${ITEM_WIDTH}px`,
          height: '64px',
          border: '2px solid #8b5cf6',
          borderRadius: '12px',
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
        }}
      />

      {/* Left fade */}
      <div
        className="absolute bottom-0 left-0 z-20 pointer-events-none h-16"
        style={{
          width: '60px',
          background: 'linear-gradient(to right, rgb(38,38,38) 0%, transparent 100%)',
        }}
      />

      {/* Right fade */}
      <div
        className="absolute bottom-0 right-0 z-20 pointer-events-none h-16"
        style={{
          width: '60px',
          background: 'linear-gradient(to left, rgb(38,38,38) 0%, transparent 100%)',
        }}
      />

      {/* Horizontal scrollable wheel - smooth scrolling */}
      <div
        ref={wheelRef}
        className="w-full h-16 overflow-x-auto scrollbar-hide flex items-center"
        onScroll={handleScroll}
        style={{ 
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Left padding - exactly half container minus half item to center first item */}
        <div style={{ minWidth: `calc(50% - ${HALF_ITEM}px)` }} className="flex-shrink-0" />
        {values.map((val) => {
          const isSelected = val === value;
          return (
            <div
              key={val}
              onClick={() => handleClickItem(val)}
              className="flex-shrink-0 flex items-center justify-center cursor-pointer"
              style={{
                width: `${ITEM_WIDTH}px`,
                height: '64px',
                color: isSelected ? '#fff' : 'rgba(255,255,255,0.35)',
                fontSize: isSelected ? '28px' : '18px',
                fontWeight: isSelected ? 'bold' : 'normal',
                transition: 'color 0.15s, font-size 0.15s',
              }}
            >
              {val}
            </div>
          );
        })}
        {/* Right padding - exactly half container minus half item */}
        <div style={{ minWidth: `calc(50% - ${HALF_ITEM}px)` }} className="flex-shrink-0" />
      </div>
    </div>
  );
}

export default function CustomSetModal({ 
  isOpen, 
  onClose, 
  onSave,
  initialValue = null,
  initialWeightUnit = 'kg',
  fieldType = 'weight',
  equipment = ''
}) {
  // Default values for each field type - start at the lowest value
  const getDefaultValue = (type) => {
    switch (type) {
      case 'weight': return 1;
      case 'sets': return 1;
      case 'reps': return 1;
      default: return 1;
    }
  };

  // If initialValue is null, undefined, empty string, or 0 - use default (lowest)
  const getInitialValue = () => {
    if (initialValue === null || initialValue === undefined || initialValue === '' || initialValue === 0) {
      return getDefaultValue(fieldType);
    }
    return initialValue;
  };

  const [value, setValue] = useState(getInitialValue());
  const [weightUnit, setWeightUnit] = useState(initialWeightUnit);
  const [isClosing, setIsClosing] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Bar / handle weight state (for Barbell & Dumbbell exercises)
  const isBarbell = equipment === 'Barbell';
  const isDumbbell = equipment === 'Dumbbell';
  const hasBaseWeight = isBarbell || isDumbbell;
  const defaultBaseWeight = isBarbell ? 20 : 2; // Olympic bar 20kg, Dumbbell handle 2kg
  const baseLabel = isBarbell ? 'Bar Weight' : 'Handle Weight';
  const baseOnlyLabel = isBarbell ? 'Bar Only' : 'Handle Only';
  const [barWeight, setBarWeight] = useState(defaultBaseWeight);
  const [barOnly, setBarOnly] = useState(false);
  const [editingBarWeight, setEditingBarWeight] = useState(false);
  const [barWeightInput, setBarWeightInput] = useState(String(defaultBaseWeight));

  // Reset value when modal opens or fieldType changes
  useEffect(() => {
    if (isOpen) {
      setValue(getInitialValue());
      setWeightUnit(initialWeightUnit);
      setBarOnly(false);
      setBarWeight(defaultBaseWeight);
      setBarWeightInput(String(defaultBaseWeight));
    }
  }, [isOpen, fieldType, initialValue, initialWeightUnit, defaultBaseWeight]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 250);
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

  const handleSave = () => {
    onSave({ value, weightUnit, fieldType, barWeight: hasBaseWeight ? barWeight : 0, barOnly });
    handleClose();
  };

  return (
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
          {/* Handle - only this area allows swipe to dismiss */}
          <div 
            className="flex justify-center mb-6 py-2 cursor-grab active:cursor-grabbing"
            onTouchStart={handleHandleTouchStart}
            onTouchMove={handleHandleTouchMove}
            onTouchEnd={handleHandleTouchEnd}
          >
            <div className="w-9 h-1 rounded-full bg-white/30" />
          </div>

          {/* Bar / handle weight section for Barbell & Dumbbell */}
          {hasBaseWeight && fieldType === 'weight' && (
            <div className="mb-4">
              {/* Bar Weight row */}
              <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2.5">
                  {/* Equipment icon */}
                  {isBarbell ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.8)" strokeWidth="2" strokeLinecap="round">
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <rect x="4" y="8" width="3" height="8" rx="1" fill="rgba(139,92,246,0.3)" />
                      <rect x="17" y="8" width="3" height="8" rx="1" fill="rgba(139,92,246,0.3)" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.8)" strokeWidth="2" strokeLinecap="round">
                      <rect x="8" y="4" width="8" height="16" rx="2" fill="rgba(139,92,246,0.3)" />
                      <line x1="12" y1="2" x2="12" y2="4" />
                      <line x1="12" y1="20" x2="12" y2="22" />
                    </svg>
                  )}
                  <span className="text-sm font-medium text-white/70">{baseLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Editable bar weight */}
                  {editingBarWeight ? (
                    <input
                      type="number"
                      autoFocus
                      className="w-16 text-right text-lg font-bold text-white bg-transparent border-b-2 border-violet-500 outline-none appearance-none"
                      style={{ MozAppearance: 'textfield' }}
                      value={barWeightInput}
                      onChange={(e) => setBarWeightInput(e.target.value)}
                      onBlur={() => {
                        const parsed = parseFloat(barWeightInput);
                        if (!isNaN(parsed) && parsed >= 0) {
                          setBarWeight(parsed);
                          if (barOnly) setValue(parsed);
                        } else {
                          setBarWeightInput(String(barWeight));
                        }
                        setEditingBarWeight(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                      }}
                    />
                  ) : (
                    <span
                      className="text-lg font-bold text-white cursor-pointer"
                      onClick={() => {
                        setBarWeightInput(String(barWeight));
                        setEditingBarWeight(true);
                        triggerHaptic();
                      }}
                    >
                      {barWeight}
                    </span>
                  )}
                  <span className="text-sm text-white/40">{weightUnit}</span>
                </div>
              </div>

              {/* Bar Only toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !barOnly;
                  setBarOnly(next);
                  if (next) {
                    setValue(barWeight);
                  }
                  triggerHaptic();
                }}
                className={`mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  barOnly
                    ? 'bg-violet-600/30 text-violet-300 border border-violet-500/50'
                    : 'bg-white/[0.04] text-white/40 border border-white/10'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  barOnly ? 'border-violet-400' : 'border-white/30'
                }`}>
                  {barOnly && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                </div>
                {baseOnlyLabel}
              </button>
            </div>
          )}

          {/* Picker */}
          <div className="mb-8">
            {fieldType === 'weight' ? (
              <div className={barOnly && hasBaseWeight ? 'opacity-30 pointer-events-none' : ''}>
                <RulerPicker
                  value={value}
                  onValueChange={(v) => {
                    setValue(v);
                    if (barOnly) setBarOnly(false);
                  }}
                  unit={weightUnit}
                  onUnitChange={setWeightUnit}
                />
              </div>
            ) : (
              <WheelPicker
                value={value}
                onValueChange={setValue}
                min={fieldType === 'sets' ? 1 : 1}
                max={fieldType === 'sets' ? 20 : 50}
                label={fieldType === 'sets' ? 'Sets' : 'Reps'}
              />
            )}
          </div>

          {/* Single confirm button - minimalist */}
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
    </div>
  );
}
