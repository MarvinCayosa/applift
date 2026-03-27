import { useState, useRef, useEffect, useMemo } from 'react';
import RepInsightCard from './RepInsightCard';

export default function RepCarousel({ repsData, targetROM, romUnit, romCalibrated }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const carouselRef = useRef(null);

  // ── Display-time first-rep startup correction ─────────────────────
  // Rep 1 starts from dead rest — accelerometer velocity is inflated.
  // Compare Rep 1 to median of reps 2+; if >1.25× median, cap at 1.10×.
  // This ensures the RepInsightCard shows the corrected velocity.
  const correctedRepsData = useMemo(() => {
    if (!repsData || repsData.length < 3) return repsData;
    
    const MIN_VELOCITY = 0.02;
    const reps = repsData.map((rep, idx) => ({ ...rep })); // shallow clone each
    
    const rep1 = reps[0];
    const mcv1 = parseFloat(rep1?.meanVelocity) || 0;
    const pv1 = parseFloat(rep1?.peakVelocity) || 0;
    const vel1 = mcv1 > 0 ? mcv1 : pv1;
    
    if (vel1 <= MIN_VELOCITY) return reps;
    
    const otherVels = reps.slice(1)
      .map(r => {
        const mcv = parseFloat(r.meanVelocity) || 0;
        const pv = parseFloat(r.peakVelocity) || 0;
        return mcv > 0 ? mcv : pv;
      })
      .filter(v => v > MIN_VELOCITY);
    
    if (otherVels.length < 2) return reps;
    
    const sorted = [...otherVels].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    if (median > 0 && vel1 > median * 1.25) {
      const corrected = Math.round(median * 1.10 * 1000) / 1000;
      // Update whichever velocity field was used
      if (mcv1 > 0) {
        reps[0] = { ...reps[0], meanVelocity: corrected };
      } else {
        reps[0] = { ...reps[0], peakVelocity: corrected };
      }
    }
    
    return reps;
  }, [repsData]);

  if (!repsData || repsData.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <p className="text-center text-gray-500 text-sm">No rep data available</p>
      </div>
    );
  }

  const handleTouchStart = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    setTouchStart(clientX);
  };

  const handleTouchMove = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    setTouchEnd(clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentIndex < repsData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  const handleMouseDown = (e) => {
    e.preventDefault();
    setTouchStart(e.clientX);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e) => {
    setTouchEnd(e.clientX);
  };

  const handleMouseUp = () => {
    handleTouchEnd();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const goToNext = () => {
    if (currentIndex < repsData.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div 
        ref={carouselRef}
        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div 
          className="h-full flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {correctedRepsData.map((repData, index) => (
            <div key={index} className="w-full h-full flex-shrink-0">
              <RepInsightCard repData={repData} repNumber={index + 1} targetROM={targetROM} romUnit={romUnit} romCalibrated={romCalibrated} />
            </div>
          ))}
        </div>

        {/* Dots indicator - Inside carousel container at bottom */}
        <div className="absolute bottom-6 sm:bottom-8 lg:bottom-10 left-0 right-0 flex justify-center gap-2 sm:gap-2.5 lg:gap-3 z-10">
          {correctedRepsData.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`h-2 sm:h-2.5 lg:h-3 rounded-full transition-all ${
                index === currentIndex 
                  ? 'w-8 sm:w-10 lg:w-12 bg-white' 
                  : 'w-2 sm:w-2.5 lg:w-3 bg-white/40'
              }`}
              aria-label={`Go to rep ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
