/**
 * SetRepCarousel
 * 
 * Horizontal carousel of rep cards showing individual rep performance.
 * Uses touch/swipe for navigation with dot indicators.
 */

import { useState, useRef } from 'react';
import SetRepCard from './SetRepCard';

export default function SetRepCarousel({
  repsData = [],
  isClassifying = false,
  targetROM,
  romUnit
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipeStartX, setSwipeStartX] = useState(null);
  const [swipeX, setSwipeX] = useState(0);
  const containerRef = useRef(null);

  const repCount = repsData.length;
  
  // Touch handlers for swipe navigation
  const handleTouchStart = (e) => {
    setSwipeStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (swipeStartX === null) return;
    const dx = e.touches[0].clientX - swipeStartX;
    // Dampen at edges
    if ((currentIndex === 0 && dx > 0) || (currentIndex === repCount - 1 && dx < 0)) {
      setSwipeX(dx * 0.25);
    } else {
      setSwipeX(dx);
    }
  };

  const handleTouchEnd = () => {
    // Threshold for snap
    if (Math.abs(swipeX) > 50) {
      if (swipeX < 0 && currentIndex < repCount - 1) {
        setCurrentIndex(currentIndex + 1);
      } else if (swipeX > 0 && currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      }
    }
    setSwipeX(0);
    setSwipeStartX(null);
  };

  if (repCount === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-gray-500 text-xs">
        No rep data available
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wide">Rep Performance</h3>
        <span className="text-[10px] text-white/30">
          {currentIndex + 1} of {repCount}
        </span>
      </div>

      {/* Carousel - Full width */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="overflow-hidden -mx-3 px-3"
      >
        <div
          className={`flex gap-2 ${swipeStartX === null ? 'transition-transform duration-300 ease-out' : ''}`}
          style={{ 
            transform: `translateX(calc(-${currentIndex * 100}% - ${currentIndex * 8}px + ${swipeX}px))` 
          }}
        >
          {repsData.map((rep, index) => (
            <div key={rep.repNumber || index} className="flex-shrink-0 w-full">
              <SetRepCard
                repData={rep}
                repNumber={rep.repNumber || index + 1}
                isLoading={isClassifying}
                targetROM={targetROM}
                romUnit={romUnit}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dot indicators - smaller */}
      {repCount > 1 && (
        <div className="flex justify-center gap-1 mt-1">
          {repsData.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`h-1 rounded-full transition-all ${
                index === currentIndex 
                  ? 'w-3 bg-purple-400' 
                  : 'w-1 bg-white/20 hover:bg-white/30'
              }`}
              aria-label={`Go to rep ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
