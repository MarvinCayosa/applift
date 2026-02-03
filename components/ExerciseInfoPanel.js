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

// Pastel colors for cards (including target muscles)
const cardColors = [
  { bg: '#6B5B95', text: '#ffffff', numberBg: 'rgba(255,255,255,0.25)' }, // Purple for target muscles
  { bg: '#E8A598', text: '#3d2020', numberBg: 'rgba(61,32,32,0.2)' }, // Coral/peach
  { bg: '#7CB8A8', text: '#1a2520', numberBg: 'rgba(26,37,32,0.2)' }, // Sage green  
  { bg: '#D4A574', text: '#2a1f15', numberBg: 'rgba(42,31,21,0.2)' }, // Warm tan
  { bg: '#9ABED4', text: '#152025', numberBg: 'rgba(21,32,37,0.2)' }, // Soft blue
];

// Muscle Icon component for target muscles slide
const MuscleIcon = ({ equipment, workout, size = 'default' }) => {
  const sizeClasses = size === 'large' 
    ? 'w-24 h-24 md:w-32 md:h-32 lg:w-36 lg:h-36'
    : 'w-14 h-14 md:w-16 md:h-16 lg:w-18 lg:h-18';
  const svgClasses = size === 'large'
    ? 'w-18 h-18 md:w-24 md:h-24 lg:w-28 lg:h-28'
    : 'w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14';
  
  return (
  <div className={`${sizeClasses} rounded-full bg-white/10 border border-red-500/40 flex items-center justify-center flex-shrink-0`}>
    <svg viewBox="0 0 64 64" className={svgClasses}>
      <ellipse cx="32" cy="14" rx="8" ry="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      <path d="M24 23 L20 45 L24 62 M40 23 L44 45 L40 62" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      <path d="M24 23 Q32 26 40 23 L40 45 Q32 48 24 45 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      <path d="M24 26 L12 32 L10 45 M40 26 L52 32 L54 45" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
      
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
};

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
  const autoScrollTimer = useRef(null);
  const isUserScrolling = useRef(false);
  const userScrollTimeout = useRef(null);

  // All slides: Target Muscles + individual tips
  const totalSlides = 1 + Math.min(tips.length, 4);

  // Auto-scroll function
  const scrollToNextSlide = () => {
    if (!carouselRef.current || isUserScrolling.current) return;
    
    const nextSlide = (activeSlide + 1) % totalSlides;
    const container = carouselRef.current;
    const slideWidth = container.offsetWidth;
    
    container.scrollTo({
      left: slideWidth * nextSlide,
      behavior: 'smooth'
    });
  };

  // Handle scroll to detect active slide and user interaction
  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const slideWidth = container.offsetWidth;
      const newIndex = Math.round(scrollLeft / slideWidth);
      setActiveSlide(newIndex);
      
      // Mark as user scrolling
      isUserScrolling.current = true;
      
      // Clear existing timeout
      if (userScrollTimeout.current) {
        clearTimeout(userScrollTimeout.current);
      }
      
      // Resume auto-scroll after 3 seconds of no interaction
      userScrollTimeout.current = setTimeout(() => {
        isUserScrolling.current = false;
      }, 3000);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current);
    };
  }, []);

  // Auto-scroll timer
  useEffect(() => {
    autoScrollTimer.current = setInterval(() => {
      scrollToNextSlide();
    }, 4000); // Auto-scroll every 4 seconds

    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [activeSlide, totalSlides]);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Carousel Card */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Carousel - no gap, full width slides with no peeking */}
        <div 
          ref={carouselRef}
          className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {/* Target Muscles Slide - Colored with centered icon */}
          <div className="w-full shrink-0 snap-center snap-always" style={{ minWidth: '100%', scrollSnapAlign: 'center' }}>
            <div 
              className="w-full h-full rounded-2xl p-5 md:p-6 lg:p-7 flex flex-col items-center justify-center relative overflow-hidden"
              style={{ backgroundColor: cardColors[0].bg }}
            >
              {/* Centered content with icon and text overlay */}
              <div className="flex flex-col items-center justify-center gap-3 md:gap-4 relative z-10">
                {/* Target Muscles label and text - above icon */}
                <div className="text-center">
                  <p 
                    className="text-xs md:text-sm lg:text-base font-medium mb-1 opacity-70"
                    style={{ color: cardColors[0].text }}
                  >
                    Target Muscles:
                  </p>
                  <p 
                    className="text-lg md:text-xl lg:text-2xl font-bold leading-snug"
                    style={{ color: cardColors[0].text }}
                  >
                    {targetMuscles}
                  </p>
                </div>
                
                {/* Large centered muscle icon */}
                <MuscleIcon equipment={equipment} workout={workout} size="large" />
              </div>
            </div>
          </div>

          {/* Individual Tip Cards - Pastel colored */}
          {tips.slice(0, 4).map((tip, idx) => {
            const colorScheme = cardColors[(idx % 4) + 1];
            const isLastTip = idx === Math.min(tips.length, 4) - 1;
            return (
              <div key={idx} className="w-full shrink-0 snap-center snap-always" style={{ minWidth: '100%', scrollSnapAlign: 'center' }}>
                <div 
                  className="w-full h-full rounded-2xl p-5 md:p-6 lg:p-7 flex flex-col relative overflow-hidden"
                  style={{ backgroundColor: colorScheme.bg }}
                >
                  {/* Number badge - top right */}
                  <div 
                    className="absolute top-4 md:top-5 lg:top-6 right-4 md:right-5 lg:right-6 w-10 h-10 md:w-11 md:h-11 lg:w-12 lg:h-12 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: colorScheme.numberBg }}
                  >
                    <span className="text-lg md:text-xl lg:text-2xl font-bold" style={{ color: colorScheme.text }}>{idx + 1}</span>
                  </div>

                  {/* Left-aligned content */}
                  <div className="flex-1 flex flex-col justify-center pr-14 md:pr-16 lg:pr-18">
                    <p 
                      className="text-xs md:text-sm lg:text-base font-medium mb-1 opacity-70"
                      style={{ color: colorScheme.text }}
                    >
                      Form Tips:
                    </p>
                    <p 
                      className="text-lg md:text-xl lg:text-2xl font-bold leading-snug"
                      style={{ color: colorScheme.text }}
                    >
                      {tip}
                    </p>
                  </div>

                  {/* Arrow icon - bottom left (only if not last tip) */}
                  {!isLastTip && (
                    <div className="flex justify-start mt-auto pt-3 opacity-50">
                      <img 
                        src="/images/icons/arrow-point-to-right.png" 
                        alt="" 
                        className="w-5 h-5 md:w-6 md:h-6"
                        style={{ filter: colorScheme.text === '#ffffff' ? 'brightness(0) invert(1)' : 'brightness(0)' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Watch Tutorial Button */}
      {tutorialVideo && !hideButton && (
        <a
          href={tutorialVideo}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/5 backdrop-blur-sm rounded-2xl px-5 py-4 flex items-center justify-between hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <span className="text-sm text-white/70 font-medium">Watch Tutorial</span>
          <div className="w-7 h-7 rounded-full bg-violet-500/30 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </a>
      )}
    </div>
  );
}
