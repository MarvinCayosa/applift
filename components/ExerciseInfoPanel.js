import { useState, useRef, useEffect } from 'react';

// Helper function to get target muscles based on exercise
const getTargetMuscles = (equipment, workout) => {
  if (equipment === 'Barbell' && workout === 'Flat Bench Barbell Press') return 'Chest, Shoulders, Triceps';
  if (equipment === 'Barbell' && workout === 'Front Squats') return 'Quadriceps, Core, Lower Back';
  if (equipment === 'Dumbell' && workout === 'Concentration Curls') return 'Biceps';
  if (equipment === 'Dumbell' && workout === 'Single-arm Overhead Extension') return 'Triceps, Shoulders';
  if (equipment === 'Weight Stack' && workout === 'Lateral Pulldown') return 'Back, Lats';
  return 'Quadriceps';
};

// Muscle icon SVG based on exercise
function MuscleIcon({ equipment, workout }) {
  return (
    <div className="w-8 h-8 rounded-full bg-white/5 border border-red-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
      <svg viewBox="0 0 64 64" className="w-6 h-6">
        {/* Body outline */}
        <ellipse cx="32" cy="14" rx="8" ry="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
        <path d="M24 23 L20 45 L24 62 M40 23 L44 45 L40 62" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
        <path d="M24 23 Q32 26 40 23 L40 45 Q32 48 24 45 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
        <path d="M24 26 L12 32 L10 45 M40 26 L52 32 L54 45" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
        
        {/* Highlighted muscles based on exercise */}
        {equipment === 'Barbell' && workout === 'Flat Bench Barbell Press' && (
          <>
            <path d="M26 28 Q32 32 38 28 L38 36 Q32 40 26 36 Z" fill="rgba(239,68,68,0.7)"/>
            <circle cx="22" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
            <circle cx="42" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
          </>
        )}
        {equipment === 'Barbell' && workout === 'Front Squats' && (
          <>
            <path d="M22 46 L20 58 L26 58 L28 46 Z" fill="rgba(239,68,68,0.7)"/>
            <path d="M42 46 L44 58 L38 58 L36 46 Z" fill="rgba(239,68,68,0.7)"/>
            <ellipse cx="32" cy="40" rx="6" ry="4" fill="rgba(239,68,68,0.5)"/>
          </>
        )}
        {equipment === 'Dumbell' && workout === 'Concentration Curls' && (
          <>
            <ellipse cx="16" cy="36" rx="3" ry="5" fill="rgba(239,68,68,0.7)"/>
            <ellipse cx="48" cy="36" rx="3" ry="5" fill="rgba(239,68,68,0.7)"/>
          </>
        )}
        {equipment === 'Dumbell' && workout === 'Single-arm Overhead Extension' && (
          <>
            <ellipse cx="18" cy="38" rx="2.5" ry="5" fill="rgba(239,68,68,0.7)"/>
            <ellipse cx="46" cy="38" rx="2.5" ry="5" fill="rgba(239,68,68,0.7)"/>
            <circle cx="22" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
            <circle cx="42" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
          </>
        )}
        {equipment === 'Weight Stack' && workout === 'Lateral Pulldown' && (
          <path d="M26 28 L24 42 Q32 46 40 42 L38 28 Q32 32 26 28 Z" fill="rgba(239,68,68,0.7)"/>
        )}
        {equipment === 'Weight Stack' && workout === 'Seated Leg Extension' && (
          <>
            <path d="M22 46 L20 58 L26 58 L28 46 Z" fill="rgba(239,68,68,0.7)"/>
            <path d="M42 46 L44 58 L38 58 L36 46 Z" fill="rgba(239,68,68,0.7)"/>
          </>
        )}
      </svg>
    </div>
  );
}

export default function ExerciseInfoPanel({ 
  equipment, 
  workout, 
  tips = [], 
  tutorialVideo = null,
  hideButton = false
}) {
  const targetMuscles = getTargetMuscles(equipment, workout);
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef(null);

  // Handle scroll to detect active slide
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const slideWidth = container.offsetWidth;
      const newIndex = Math.round(scrollLeft / slideWidth);
      setActiveSlide(newIndex);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const slides = [
    { type: 'targetMuscles' },
    { type: 'formTips' }
  ];

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Target Muscles & Form Tips Carousel Card */}
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 flex-1 min-h-0 flex flex-col">
        {/* Carousel */}
        <div 
          ref={carouselRef}
          className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        >
          {/* Target Muscles Slide */}
          <div className="min-w-full shrink-0 snap-center flex flex-col">
            <h3 className="text-sm font-semibold text-white text-center mb-2">Target Muscles</h3>
            <p className="text-xs text-gray-400 text-center mb-4">{targetMuscles}</p>
            
            {/* Large Centered Icon - Takes remaining space */}
            <div className="flex-1 flex items-center justify-center min-h-0">
              <div className="w-32 h-32 rounded-full bg-white/5 border-2 border-red-500/40 flex items-center justify-center">
                <svg viewBox="0 0 64 64" className="w-28 h-28">
                  {/* Body outline */}
                  <ellipse cx="32" cy="14" rx="8" ry="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  <path d="M24 23 L20 45 L24 62 M40 23 L44 45 L40 62" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  <path d="M24 23 Q32 26 40 23 L40 45 Q32 48 24 45 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  <path d="M24 26 L12 32 L10 45 M40 26 L52 32 L54 45" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  
                  {/* Highlighted muscles based on exercise */}
                  {equipment === 'Barbell' && workout === 'Flat Bench Barbell Press' && (
                    <>
                      <path d="M26 28 Q32 32 38 28 L38 36 Q32 40 26 36 Z" fill="rgba(239,68,68,0.7)"/>
                      <circle cx="22" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                      <circle cx="42" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                    </>
                  )}
                  {equipment === 'Barbell' && workout === 'Front Squats' && (
                    <>
                      <path d="M22 46 L20 58 L26 58 L28 46 Z" fill="rgba(239,68,68,0.7)"/>
                      <path d="M42 46 L44 58 L38 58 L36 46 Z" fill="rgba(239,68,68,0.7)"/>
                      <ellipse cx="32" cy="40" rx="6" ry="4" fill="rgba(239,68,68,0.5)"/>
                    </>
                  )}
                  {equipment === 'Dumbell' && workout === 'Concentration Curls' && (
                    <>
                      <ellipse cx="16" cy="36" rx="3" ry="5" fill="rgba(239,68,68,0.7)"/>
                      <ellipse cx="48" cy="36" rx="3" ry="5" fill="rgba(239,68,68,0.7)"/>
                    </>
                  )}
                  {equipment === 'Dumbell' && workout === 'Single-arm Overhead Extension' && (
                    <>
                      <ellipse cx="18" cy="38" rx="2.5" ry="5" fill="rgba(239,68,68,0.7)"/>
                      <ellipse cx="46" cy="38" rx="2.5" ry="5" fill="rgba(239,68,68,0.7)"/>
                      <circle cx="22" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                      <circle cx="42" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                    </>
                  )}
                  {equipment === 'Weight Stack' && workout === 'Lateral Pulldown' && (
                    <path d="M26 28 L24 42 Q32 46 40 42 L38 28 Q32 32 26 28 Z" fill="rgba(239,68,68,0.7)"/>
                  )}
                  {equipment === 'Weight Stack' && workout === 'Seated Leg Extension' && (
                    <>
                      <path d="M22 46 L20 58 L26 58 L28 46 Z" fill="rgba(239,68,68,0.7)"/>
                      <path d="M42 46 L44 58 L38 58 L36 46 Z" fill="rgba(239,68,68,0.7)"/>
                    </>
                  )}
                </svg>
              </div>
            </div>
          </div>

          {/* Form Tips Slide */}
          <div className="min-w-full shrink-0 snap-center flex flex-col">
            <h4 className="text-sm font-semibold text-white/80 mb-3 text-center">Form Tips</h4>
            <div className="flex-1 overflow-y-auto px-1">
              <ul className="text-xs text-white/70 space-y-2.5">
                {tips.slice(0, 4).map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-violet-400 mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Carousel Indicators */}
        <div className="flex justify-center gap-1.5 mt-3">
          {slides.map((_, idx) => (
            <span
              key={idx}
              className={`${idx === activeSlide ? 'bg-white w-5' : 'bg-white/30 w-1.5'} h-1.5 rounded-full transition-all duration-300`}
            />
          ))}
        </div>
      </div>

      {/* Watch Tutorial Button */}
      {tutorialVideo && !hideButton && (
        <a
          href={tutorialVideo}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-3.5 flex items-center justify-between hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <span className="text-xs text-white/70 font-medium">Watch Tutorial</span>
          <div className="w-6 h-6 rounded-full bg-violet-500/30 flex items-center justify-center">
            <svg className="w-3 h-3 text-violet-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </a>
      )}
    </div>
  );
}
