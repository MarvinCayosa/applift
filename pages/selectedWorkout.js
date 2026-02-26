import Head from 'next/head';
import { useRouter } from 'next/router';
import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import AIReasoningPanel from '../components/AIReasoningPanel';
import CalibrationHistoryPanel from '../components/CalibrationHistoryPanel';
import CalibrationModal, { hasCalibration, loadCalibration } from '../components/CalibrationModal';
import ConnectPill from '../components/ConnectPill';
import CustomSetModal from '../components/CustomSetModal';
import ExerciseInfoPanel from '../components/ExerciseInfoPanel';
import RecommendedSetCard from '../components/RecommendedSetCard';
import VideoPlayerModal from '../components/VideoPlayerModal';
import WarmUpBanner from '../components/WarmUpBanner';
import WorkoutActionButton from '../components/WorkoutActionButton';
import { useAuth } from '../context/AuthContext';
import { useBluetooth } from '../context/BluetoothProvider';
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';
import { useAIRecommendation } from '../hooks/useAIRecommendation';
import { collection, getDocs, getDoc, doc, query, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../config/firestore';

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
    ? 'w-28 h-28 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:w-48 lg:h-48'
    : 'w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 lg:w-22 lg:h-22';
  
  // Get the muscle image for this exercise
  const muscleImage = targetMuscleImages[equipment]?.[workout];
  
  if (!muscleImage) {
    // Fallback if no image is found
    return null;
  }
  
  return (
    <div className={`${sizeClasses} relative flex items-center justify-center flex-shrink-0`}>
      <img
        src={muscleImage}
        alt={`${workout} target muscles`}
        className="w-full h-full object-contain"
      />
    </div>
  );
};

// Exercise Info Carousel Component
function ExerciseInfoCarousel({ equipment, workout, tips, getTargetMuscles }) {
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
    <div className="h-full flex flex-col">
      {/* Carousel Container - no gap, full width slides */}
      <div 
        ref={carouselRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* Slide 1: Target Muscles - Colored card with centered icon */}
        <div className="w-full shrink-0 snap-center snap-always px-1" style={{ minWidth: '100%', scrollSnapAlign: 'center' }}>
          <div 
            className="w-full h-full rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 lg:p-7 flex flex-col items-center justify-center relative overflow-hidden"
            style={{ backgroundColor: cardColors[0].bg }}
          >
            {/* Centered content with icon and text overlay */}
            <div className="flex flex-col items-center justify-center gap-2 sm:gap-2.5 relative z-10">
              {/* Target Muscles label and text - above icon */}
              <div className="text-center">
                <p 
                  className="text-sm sm:text-sm md:text-base lg:text-base font-medium mb-1 opacity-70"
                  style={{ color: cardColors[0].text }}
                >
                  Target Muscles:
                </p>
                <p 
                  className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold leading-snug"
                  style={{ color: cardColors[0].text }}
                >
                  {getTargetMuscles()}
                </p>
              </div>
              
              {/* Large centered muscle icon */}
              <MuscleIcon equipment={equipment} workout={workout} size="large" />
            </div>
          </div>
        </div>

        {/* Form Tips Slides - Pastel colored cards */}
        {tips.slice(0, 4).map((tip, idx) => {
          const colorScheme = cardColors[(idx % 4) + 1];
          const isLastTip = idx === Math.min(tips.length, 4) - 1;
          return (
            <div key={idx} className="w-full shrink-0 snap-center snap-always px-1" style={{ minWidth: '100%', scrollSnapAlign: 'center' }}>
              <div 
                className="w-full h-full rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 lg:p-7 flex flex-col relative overflow-hidden"
                style={{ backgroundColor: colorScheme.bg }}
              >
                {/* Number badge - top right */}
                <div 
                  className="absolute top-3 sm:top-3 md:top-4 lg:top-5 right-3 sm:right-3 md:right-4 lg:right-5 w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 lg:w-12 lg:h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: colorScheme.numberBg }}
                >
                  <span className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold" style={{ color: colorScheme.text }}>{idx + 1}</span>
                </div>

                {/* Left-aligned content */}
                <div className="flex-1 flex flex-col justify-center pr-14 sm:pr-14 md:pr-16 lg:pr-18">
                  <p 
                    className="text-xs sm:text-sm md:text-base lg:text-lg font-medium mb-1 opacity-70"
                    style={{ color: colorScheme.text }}
                  >
                    Form Tips:
                  </p>
                  <p 
                    className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold leading-snug"
                    style={{ color: colorScheme.text }}
                  >
                    {tip}
                  </p>
                </div>

                {/* Arrow icon - bottom left (only if not last tip) */}
                {!isLastTip && (
                  <div className="flex justify-start mt-auto pt-1.5 opacity-50">
                    <img 
                      src="/images/icons/arrow-point-to-right.png" 
                      alt="" 
                      className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6"
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
  );
}

// Info & History Carousel Component
function InfoHistoryCarousel({ equipment, workout, tips, tutorialVideo, equipmentColor, onCalibrateClick, onWatchTutorial, videoThumbnail, isCalibrated, calibrationData }) {
  // Get target muscles based on exercise
  const getTargetMuscles = () => {
    if (equipment === 'Barbell' && workout === 'Flat Bench Barbell Press') return 'Chest, Shoulders, Triceps';
    if (equipment === 'Barbell' && workout === 'Back Squats') return 'Quadriceps, Glutes, Hamstrings';
    if (equipment === 'Dumbbell' && workout === 'Concentration Curls') return 'Biceps';
    if (equipment === 'Dumbbell' && workout === 'Overhead Triceps Extension') return 'Triceps';
    if (equipment === 'Weight Stack' && workout === 'Lateral Pulldown') return 'Back, Lats';
    return 'Quadriceps';
  };

  return (
    <div className="content-fade-up-2 flex-1 min-h-0 w-full" style={{ animationDelay: '0.6s' }}>
      <div className="h-full flex flex-col gap-3 sm:gap-4" style={{ 
        minHeight: 'clamp(220px, 32vh, 280px)',
        maxHeight: 'clamp(280px, 40vh, 340px)'
      }}>
        {/* Calibrate Now Button - Full Width */}
        <button
          onClick={onCalibrateClick}
          className={`w-full backdrop-blur-sm rounded-3xl px-4 py-2.5 sm:px-5 sm:py-3 hover:bg-white/12 transition-colors flex items-center justify-center gap-2 flex-shrink-0 border ${
            isCalibrated ? 'bg-purple-500/15 border-purple-500/30' : 'bg-white/8 border-white/10'
          }`}
        >
          {isCalibrated && (
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          <span className="text-sm sm:text-base text-white font-semibold">
            ROM Calibration{isCalibrated && calibrationData?.targetROM ? ` · ${calibrationData.targetROM.toFixed(1)}${calibrationData.unit || '°'}` : ''}
          </span>
          <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${isCalibrated ? 'text-green-400' : 'text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Info Panels Row */}
        <div className="flex-1 px-0.5 min-h-0">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 h-full w-full">
            {/* Left Column - Watch Tutorial (styled as calibration panel) */}
            {tutorialVideo && (
              <button
                onClick={onWatchTutorial}
                className="relative rounded-xl sm:rounded-2xl p-4 sm:p-5 hover:brightness-110 transition-all overflow-hidden flex flex-col items-center justify-center gap-3 h-full group w-full"
              >
                {/* Background Image - Video Thumbnail */}
                <div 
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url('${videoThumbnail}')` }}
                />
                {/* Dark Overlay */}
                <div className="absolute inset-0 bg-black/70 group-hover:bg-black/60 transition-colors" />
                
                {/* Content */}
                <div className="relative z-10 flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-violet-500/30 flex items-center justify-center">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-violet-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                  <span className="text-xs sm:text-sm text-white/70 font-medium text-center">Watch Tutorial</span>
                </div>
              </button>
            )}
            
            {/* Right Column - Exercise Info Carousel */}
            <div className="h-full">
              <ExerciseInfoCarousel 
                equipment={equipment}
                workout={workout}
                tips={tips}
                getTargetMuscles={getTargetMuscles}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const workoutDetails = {
  Barbell: {
    'Flat Bench Barbell Press': {
      description: 'A fundamental compound movement that builds upper body strength. Lie on a flat bench, grip the bar slightly wider than shoulder-width, lower to your chest, and press up explosively.',
      recommendedSets: 2,
      recommendedReps: '3',
      difficulty: 'Intermediate',
      tutorialVideo: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
      tips: [
        'Keep your feet flat on the floor',
        'Retract your shoulder blades for stability',
        'Lower the bar to mid-chest level',
        'Drive through your heels as you press'
      ]
    },
    'Back Squats': {
      description: 'Position the barbell across your upper back and shoulders. Squat down by pushing your hips back and bending your knees, then drive through your heels to stand back up.',
      recommendedSets: 2,
      recommendedReps: '3',
      difficulty: 'Intermediate',
      tutorialVideo: 'https://www.youtube.com/watch?v=ultWZbUMPL8',
      tips: [
        'Keep your chest up and core engaged',
        'Push your knees out over your toes',
        'Maintain neutral spine throughout',
        'Descend until thighs are parallel to floor'
      ]
    },
  },
  Dumbbell: {
    'Concentration Curls': {
      description: 'Sit on a bench with your elbow braced against your inner thigh. Curl the dumbbell up with control, squeeze at the top, then lower slowly to full extension.',
      recommendedSets: 2,
      recommendedReps: '3',
      difficulty: 'Beginner',
      tutorialVideo: 'https://www.youtube.com/watch?v=Jvj2wV0vOYU',
      tips: [
        'Brace your elbow firmly against your thigh',
        'Squeeze at the top of the movement',
        'Lower the weight slowly for 2-3 seconds',
        'Avoid swinging or using momentum'
      ]
    },
    'Overhead Triceps Extension': {
      description: 'Hold a dumbbell overhead with both hands. Lower the weight behind your head by bending at the elbows, then extend back up to the starting position.',
      recommendedSets: 2,
      recommendedReps: '3',
      difficulty: 'Beginner',
      tutorialVideo: 'https://www.youtube.com/watch?v=YbX7Wd8jQ-Q',
      tips: [
        'Keep your upper arms stationary',
        'Lower the weight behind your head slowly',
        'Fully extend at the top without locking',
        'Engage your core for stability'
      ]
    },
  },
  'Weight Stack': {
    'Lateral Pulldown': {
      description: 'Grip the bar wider than shoulder-width, lean back slightly, and pull the bar down to your upper chest. Squeeze your lats at the bottom, then control the weight back up.',
      recommendedSets: 2,
      recommendedReps: '3',
      difficulty: 'Beginner',
      tutorialVideo: 'https://www.youtube.com/watch?v=CAwf7n6Luuc',
      tips: [
        'Lean back slightly at about 70-80 degrees',
        'Pull with your elbows, not your hands',
        'Squeeze your shoulder blades together',
        'Control the weight on the way up'
      ]
    },
    'Seated Leg Extension': {
      description: 'Sit with your back against the pad and legs under the roller. Extend your legs until straight, pause at the top with a squeeze, then lower with control.',
      recommendedSets: 2,
      recommendedReps: '3',
      difficulty: 'Beginner',
      tutorialVideo: 'https://www.youtube.com/watch?v=YyvSfVjQeL0',
      tips: [
        'Keep your back pressed against the pad',
        'Pause at the top and squeeze your quads',
        'Lower the weight slowly for 2-3 seconds',
        'Avoid locking your knees at full extension'
      ]
    },
  },
};

const equipmentColors = {
  Barbell: '#FBBF24', // Yellow
  Dumbbell: '#3B82F6', // Blue
  Dumbbell: '#3B82F6', // Blue (alternate spelling)
  'Weight Stack': '#EF4444', // Red
};

const workoutImages = {
  Barbell: {
    'Flat Bench Barbell Press': '/images/workout-cards/barbell-flat-bench-press.jpg',
    'Back Squats': '/images/workout-cards/barbell_back_squats.jpg',
  },
  Dumbbell: {
    'Concentration Curls': '/images/workout-cards/dumbbell-concentration-curls.jpg',
    'Overhead Triceps Extension': '/images/workout-cards/dumbbell_overhead_tricep_extensions.png',
  },
  'Weight Stack': {
    'Lateral Pulldown': '/images/workout-cards/weightstack-lateral-pulldown.jpg',
    'Seated Leg Extension': '/images/workout-cards/weightstack-seated-leg-extension.jpg',
  },
};

const tutorialVideos = {
  Barbell: {
    'Flat Bench Barbell Press': '/tutorial-videos/barbell_flat_bench_press_tutorial.mp4',
    'Back Squats': '/tutorial-videos/barbell_back_squats_tutorial.mp4',
  },
  Dumbbell: {
    'Concentration Curls': '/tutorial-videos/dumbbell_concentration_curls_tutorial.mp4',
    'Overhead Triceps Extension': '/tutorial-videos/dumbbell_overhead_extensions_tutorial.mp4',
  },
  'Weight Stack': {
    'Lateral Pulldown': '/tutorial-videos/weight_stack_lateral_pulldown_tutorial.mp4',
    'Seated Leg Extension': '/tutorial-videos/weight_stack_seated_leg_extension_tutorial.mp4',
  },
};

const targetMuscleImages = {
  Barbell: {
    'Flat Bench Barbell Press': '/images/target-muscles/barbell-flat-bench-barbell-press-muscles.png',
    'Back Squats': '/images/target-muscles/barbell-front-squats-muscles.png', // TODO: Replace with barbell-back-squats-muscles.png when available
  },
  Dumbbell: {
    'Concentration Curls': '/images/target-muscles/dumbbell-concentration-curls-muscles.png',
    'Overhead Triceps Extension': '/images/target-muscles/dumbbell-single-arm-overhead-extension-muscles.png', // TODO: Replace with dumbbell-overhead-triceps-extension-muscles.png when available
  },
  'Weight Stack': {
    'Lateral Pulldown': '/images/target-muscles/weight-stack-lateral-pulldown-muscles.png',
    'Seated Leg Extension': '/images/target-muscles/weight-stack-seated-leg-extension-muscles.png',
  },
};

const videoThumbnails = {
  Barbell: {
    'Flat Bench Barbell Press': '/images/video-thumbnails/barbell-flat-bench-press-thumbnail.png',
    'Back Squats': '/images/video-thumbnails/barbell_back_squats_thumbnail.png',
  },
  Dumbbell: {
    'Concentration Curls': '/images/video-thumbnails/dumbbell_concentration_curls_thumbnails.jpg',
    'Overhead Triceps Extension': '/images/video-thumbnails/dumbell_overhead_triceps_extension_thumbnail.png',
  },
  'Weight Stack': {
    'Lateral Pulldown': '/images/video-thumbnails/weight_stack_lateral_pulldown_thumbnail.jpg',
    'Seated Leg Extension': '/images/video-thumbnails/weight_stack_seated_leg_extension_thumbnail.jpg',
  },
};

export default function SelectedWorkout() {
  const router = useRouter();
  const { equipment, workout } = router.query;
  const mainRef = useRef(null);

  // Auth & user profile
  const { user, userProfile } = useAuth();

  // Workout logging
  const { initializeLog, isLogging } = useWorkoutLogging();

  // Modal state for custom set
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalField, setModalField] = useState('weight');
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  
  // Calibration modal state
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState(false);
  const [isROMCalibrated, setIsROMCalibrated] = useState(false);
  const [savedCalibrationData, setSavedCalibrationData] = useState(null);
  
  // Video player modal state
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  
  // Carousel active index state (0 = AI Generated/Recommended, 1 = Custom)
  const [carouselActiveIndex, setCarouselActiveIndex] = useState(0);
  
  // Custom set values
  const [customWeight, setCustomWeight] = useState(null);
  const [customSets, setCustomSets] = useState(null);
  const [customReps, setCustomReps] = useState(null);
  const [customWeightUnit, setCustomWeightUnit] = useState('kg');
  const [customRestTime, setCustomRestTime] = useState(30); // Rest time in seconds
  const [customBarWeight, setCustomBarWeight] = useState(0); // Bar/handle weight for breakdown
  const [customSetError, setCustomSetError] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);
  const [isPillExpanded, setIsPillExpanded] = useState(false);

  // Past sessions for AI context
  const [pastSessions, setPastSessions] = useState([]);

  // Sanitize string for Firestore path (matches workoutLogService convention)
  const sanitizeForPath = useCallback((str) => {
    if (!str) return 'unknown';
    return str
      .trim()
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }, []);

  // Fetch past exercise sessions for AI context (logs + analytics)
  useEffect(() => {
    if (!user?.uid || !equipment || !workout) return;
    
    const fetchPastSessions = async () => {
      try {
        const equipmentPath = sanitizeForPath(equipment);
        const exercisePath = sanitizeForPath(workout);
        const logsRef = collection(db, 'userWorkouts', user.uid, equipmentPath, exercisePath, 'logs');
        const q = query(logsRef, orderBy('timestamps.completed', 'desc'), firestoreLimit(5));
        const snapshot = await getDocs(q);
        
        // Fetch analytics for each log in parallel
        const sessionsWithAnalytics = await Promise.all(
          snapshot.docs.map(async (logDoc) => {
            const data = logDoc.data();
            if (data.status !== 'completed' || !data.results) return null;
            
            // Try to fetch corresponding analytics doc
            let analytics = null;
            try {
              const analyticsRef = doc(db, 'userWorkouts', user.uid, equipmentPath, exercisePath, 'analytics', logDoc.id);
              const analyticsSnap = await getDoc(analyticsRef);
              if (analyticsSnap.exists()) {
                analytics = analyticsSnap.data();
              }
            } catch (err) {
              console.log('[SelectedWorkout] Could not fetch analytics for session:', err.message);
            }
            
            // Extract ML classification summary and clean rep percentage
            let mlSummary = null;
            let cleanRepPct = null;
            let cleanReps = 0;
            let totalReps = 0;
            if (analytics?.mlClassification?.distribution) {
              const dist = analytics.mlClassification.distribution;
              totalReps = Object.values(dist).reduce((sum, c) => sum + c, 0);
              cleanReps = dist['Clean'] || dist['0'] || 0;
              cleanRepPct = totalReps > 0 ? Math.round((cleanReps / totalReps) * 100) : null;
              // Build full distribution breakdown (e.g. "Clean: 37%, Uncontrolled Movement: 53%, Abrupt Initiation: 10%")
              if (totalReps > 0) {
                const parts = Object.entries(dist)
                  .filter(([_, count]) => count > 0)
                  .map(([label, count]) => `${label}: ${Math.round((count / totalReps) * 100)}%`)
                  .join(', ');
                mlSummary = parts;
              } else {
                mlSummary = null;
              }
            }
            
            // Calculate reps per set for better context
            const sets = data.results?.totalSets || data.planned?.sets || 0;
            const reps = data.results?.totalReps || data.planned?.reps || 0;
            const repsPerSet = sets > 0 ? Math.round(reps / sets) : 0;
            
            return {
              date: data.timestamps?.completed?.toDate?.()?.toISOString?.() || null,
              weight: data.results?.weight || data.planned?.weight || 0,
              weightUnit: data.results?.weightUnit || data.planned?.weightUnit || 'kg',
              sets: sets,
              reps: reps,
              repsPerSet: repsPerSet,
              // Form quality from results
              quality: data.results?.avgFormScore 
                ? (data.results.avgFormScore >= 80 ? 'good form' : data.results.avgFormScore >= 60 ? 'moderate form' : 'needs improvement')
                : null,
              // Tempo data (average concentric/eccentric times)
              avgConcentric: data.results?.avgConcentric || null,
              avgEccentric: data.results?.avgEccentric || null,
              // Analytics-derived metrics
              fatigueScore: analytics?.fatigueScore ?? null,
              consistencyScore: analytics?.consistencyScore ?? null,
              keyFindings: analytics?.performanceReport?.keyFindings || null,
              mlClassification: mlSummary,
              // ML Clean rep metrics for AI decision making
              cleanRepPct: cleanRepPct,
              cleanReps: cleanReps,
              // Comprehensive performance summary
              performance: buildPerformanceSummary(data, analytics),
            };
          })
        );
        
        setPastSessions(sessionsWithAnalytics.filter(Boolean));
      } catch (err) {
        console.log('[SelectedWorkout] Could not fetch past sessions:', err.message);
      }
    };
    
    // Helper to build comprehensive performance summary
    const buildPerformanceSummary = (data, analytics) => {
      const parts = [];
      const results = data.results || {};
      const planned = data.planned || {};
      
      // Basic completion info
      if (results.totalSets && results.totalReps) {
        parts.push(`${results.totalSets} sets × ${Math.round(results.totalReps / results.totalSets)} reps at ${results.weight || planned.weight || 0}${results.weightUnit || 'kg'}`);
      }
      
      // Form score
      if (results.avgFormScore) {
        parts.push(`form ${results.avgFormScore}%`);
      }
      
      // Tempo info
      if (results.avgConcentric || results.avgEccentric) {
        const tempo = [];
        if (results.avgEccentric) tempo.push(`${results.avgEccentric.toFixed(1)}s ecc`);
        if (results.avgConcentric) tempo.push(`${results.avgConcentric.toFixed(1)}s con`);
        parts.push(`tempo: ${tempo.join('/')}`);
      }
      
      // Analytics-derived insights
      if (analytics) {
        if (analytics.fatigueScore != null) {
          const level = analytics.fatigueScore < 15 ? 'low' : analytics.fatigueScore < 35 ? 'moderate' : 'high';
          parts.push(`${level} fatigue (${analytics.fatigueScore}%)`);
        }
        if (analytics.consistencyScore != null) {
          parts.push(`consistency ${analytics.consistencyScore}%`);
        }
      }
      
      return parts.length > 0 ? parts.join(', ') : null;
    };
    
    fetchPastSessions();
  }, [user?.uid, equipment, workout, sanitizeForPath]);

  // AI Recommendation
  const aiEnabled = userProfile?.aiRecommendationsEnabled !== false;
  const {
    recommendation: aiRec,
    reasoning: aiReasoning,
    loading: aiLoading,
    error: aiError,
    regenCount,
    maxRegen,
    isFromCache,
    canRegenerate,
    regenerate: aiRegenerate,
  } = useAIRecommendation({
    equipment,
    exerciseName: workout,
    pastSessions,
    enabled: aiEnabled && !!equipment && !!workout,
  });

  // Update rest time when AI provides a recommendation
  useEffect(() => {
    if (aiRec?.restTimeSeconds && customRestTime === 30) {
      setCustomRestTime(aiRec.restTimeSeconds);
    }
  }, [aiRec?.restTimeSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fade error message after 3 seconds
  useEffect(() => {
    if (customSetError) {
      setErrorVisible(true);
      const timer = setTimeout(() => {
        setErrorVisible(false);
        setTimeout(() => setCustomSetError(''), 300); // Clear after fade
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [customSetError]);

  // Handle carousel index change and log it
  const handleCarouselIndexChange = useCallback((index) => {
    setCarouselActiveIndex(index);
    // Clear error when switching cards
    setCustomSetError('');
    setErrorVisible(false);
    const carouselType = index === 0 ? 'AI Generated (Recommended)' : 'Custom';
    console.log('📊 Carousel changed to:', carouselType);
    console.log('   - Index:', index);
    console.log('   - Type:', carouselType);
  }, []);

  // Handle opening modal for specific field
  const handleCustomFieldClick = useCallback((field) => {
    setModalField(field);
    setIsModalOpen(true);
  }, []);

  // Handle save from modal
  const handleModalSave = ({ value, weightUnit: wu, fieldType, barWeight, barOnly }) => {
    switch (fieldType) {
      case 'weight':
        setCustomWeight(value);
        setCustomWeightUnit(wu);
        // Track bar weight for breakdown generation
        if (barWeight !== undefined) setCustomBarWeight(barWeight);
        break;
      case 'sets':
        setCustomSets(value);
        break;
      case 'reps':
        setCustomReps(value);
        break;
    }
  };

  // Get the current value for the modal based on field type
  const getModalInitialValue = () => {
    switch (modalField) {
      case 'weight':
        return customWeight; // Start at null to use default 0.5
      case 'sets':
        return customSets; // Start at null to use default 1
      case 'reps':
        return customReps; // Start at null to use default 1
      default:
        return null;
    }
  };

  const {
    connected,
    device,
    connecting,
    scanning,
    error,
    permissionGranted,
    availability,
    devicesFound,
    scanDevices,
    connectToDevice,
    disconnect,
  } = useBluetooth();

  // Check ROM calibration status on mount and when equipment/workout changes
  useEffect(() => {
    if (equipment && workout) {
      const calibrated = hasCalibration(equipment, workout);
      setIsROMCalibrated(calibrated);
      if (calibrated) {
        setSavedCalibrationData(loadCalibration(equipment, workout));
      }
    }
  }, [equipment, workout]);

  // Auto-open calibration modal if not calibrated and device is connected
  useEffect(() => {
    if (connected && equipment && workout && !isROMCalibrated && !isCalibrationModalOpen) {
      // Small delay to let the page render first
      const timer = setTimeout(() => {
        setIsCalibrationModalOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [connected, equipment, workout, isROMCalibrated]);

  const details = useMemo(() => workoutDetails[equipment]?.[workout], [equipment, workout]);
  const equipmentColor = useMemo(() => equipmentColors[equipment] || '#7c3aed', [equipment]);
  const workoutImage = useMemo(() => workoutImages[equipment]?.[workout] || '/images/workout-cards/barbell-flat-bench-press.jpg', [equipment, workout]);
  const tutorialVideoPath = useMemo(() => tutorialVideos[equipment]?.[workout], [equipment, workout]);
  const videoThumbnail = useMemo(() => videoThumbnails[equipment]?.[workout] || workoutImage, [equipment, workout, workoutImage]);

  if (!details) {
    return (
      <div className="relative min-h-screen bg-black text-white pb-24">
        <Head>
          <title>Workout — AppLift</title>
        </Head>
        <main className="mx-auto w-full max-w-[640px] px-4 pt-2.5 sm:pt-3.5">
          <p>Loading workout details...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="relative h-screen bg-black text-white overflow-hidden flex flex-col">
      <Head>
        <title>{workout} — AppLift</title>
      </Head>

      <main ref={mainRef} className="flex-1 w-full px-4 sm:px-6 md:px-8 pt-2.5 sm:pt-3.5 pt-pwa-dynamic pb-24 flex flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl flex flex-col flex-1 space-y-2">
        {/* Header with back button and connection pill */}
        <div className="flex items-center justify-between content-fade-up-1 flex-shrink-0 relative">
          {/* Back button - stays visible */}
          <button
            onClick={() => router.back()}
            className="flex items-center justify-center h-10 w-10 rounded-lg hover:bg-white/20 transition-all duration-300 shrink-0"
            aria-label="Go back"
          >
            <img
              src="/images/icons/arrow-point-to-left.png"
              alt="Back"
              className="w-5 h-5 filter brightness-0 invert"
            />
          </button>

          {/* Page Title - appears when ConnectPill collapses */}
          <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 pointer-events-none ${
            isPillExpanded ? 'opacity-0' : 'opacity-0 animate-fade-in'
          }`}>
            <h1 className="text-xl sm:text-2xl font-semibold text-white text-center whitespace-nowrap">
              Workout Setup
            </h1>
          </div>

          {/* Connection pill */}
          <ConnectPill
            connected={connected}
            device={device}
            onScan={scanDevices}
            onConnect={connectToDevice}
            onDisconnect={disconnect}
            scanning={scanning}
            devicesFound={devicesFound}
            availability={availability}
            autoCollapse={true}
            onExpandChange={setIsPillExpanded}
          />
        </div>

        {/* Recommended Set Card */}
        <div className="content-fade-up-2 flex-shrink-0" style={{ animationDelay: '0.4s' }}>
          <RecommendedSetCard
            equipment={equipment}
            workout={workout}
            recommendedSets={aiRec?.sets ?? details.recommendedSets}
            recommendedReps={aiRec?.reps ?? details.recommendedReps}
            weight={aiRec?.weight ?? 5}
            weightBreakdown={aiRec?.weightBreakdown || ''}
            time={aiRec?.restTimeSeconds ?? 45}
            burnCalories={aiRec?.estimatedCalories ?? 45}
            image={workoutImage}
            equipmentColor={equipmentColor}
            customWeight={customWeight}
            customSets={customSets}
            customReps={customReps}
            customWeightUnit={customWeightUnit}
            restMinutes={Math.floor(customRestTime / 60)}
            restSeconds={customRestTime % 60}
            onRestTimeChange={setCustomRestTime}
            onCustomFieldClick={handleCustomFieldClick}
            onActiveIndexChange={handleCarouselIndexChange}
            onRefresh={aiRegenerate}
            aiLoading={aiLoading}
            aiEnabled={aiEnabled}
            canRegenerate={canRegenerate}
            regenCount={regenCount}
            maxRegen={maxRegen}
          />
        </div>

        {/* AI Reasoning Panel - auto-collapse with smooth animation */}
        {aiEnabled && aiReasoning && !aiLoading && (
          <div 
            className="flex-shrink-0 px-1 overflow-hidden"
            style={{ 
              maxHeight: carouselActiveIndex === 0 ? '600px' : '0px',
              opacity: carouselActiveIndex === 0 ? 1 : 0,
              marginTop: carouselActiveIndex === 0 ? '16px' : '0px',
              marginBottom: carouselActiveIndex === 0 ? '16px' : '0px',
              transform: carouselActiveIndex === 0 ? 'translateY(0) scale(1)' : 'translateY(-20px) scale(0.95)',
              transition: 'all 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              pointerEvents: carouselActiveIndex === 0 ? 'auto' : 'none'
            }}
          >
            <AIReasoningPanel
              reasoning={aiReasoning}
              recommendation={aiRec}
              regenCount={regenCount}
              maxRegen={maxRegen}
              isFromCache={isFromCache}
              hasPastSessions={pastSessions.length > 0}
            />
          </div>
        )}

        {/* AI Error Notice */}
        {aiEnabled && aiError && !aiLoading && (
          <div className="content-fade-up-2 flex-shrink-0 px-1" style={{ animationDelay: '0.5s' }}>
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
              <p className="text-xs text-red-400/80">
                AI recommendation unavailable — using default values. {aiError}
              </p>
            </div>
          </div>
        )}

        {/* Info & History Carousel */}
        <InfoHistoryCarousel
          equipment={equipment}
          workout={workout}
          tips={details.tips || []}
          tutorialVideo={details.tutorialVideo}
          equipmentColor={equipmentColor}
          onCalibrateClick={() => setIsCalibrationModalOpen(true)}
          videoThumbnail={videoThumbnail}
          onWatchTutorial={() => setIsVideoModalOpen(true)}
          isCalibrated={isROMCalibrated}
          calibrationData={savedCalibrationData}
        />
        </div>
      </main>

      {/* Fixed Bottom Workout Action Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6" style={{
        background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 60%, rgba(0,0,0,0) 100%)',
      }}>
        <div className="mx-auto w-full max-w-4xl">
          {/* Error message with fade animation */}
          {customSetError && (
            <div 
              className={`mb-3 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-xl text-center transition-opacity duration-300 ${errorVisible ? 'opacity-100' : 'opacity-0'}`}
            >
              <p className="text-sm text-red-400">{customSetError}</p>
            </div>
          )}
          {/* Warm Up Banner - just above workout button */}
          <div className="mb-3">
            <WarmUpBanner />
          </div>
          <WorkoutActionButton
            disabled={isStartingWorkout}
            onClick={async () => {
              if (isStartingWorkout) return;
              
              // Check device connection first
              if (!connected) {
                setCustomSetError('Please connect your device to start the workout');
                return;
              }
              
              // Check ROM calibration
              if (!isROMCalibrated) {
                setCustomSetError('Please calibrate ROM before starting the workout');
                return;
              }
              
              // Validate custom set values if on custom card
              const isCustomSet = carouselActiveIndex === 1;
              if (isCustomSet && (!customWeight || !customSets || !customReps)) {
                setCustomSetError('Please set Weight, Sets, and Reps for your custom workout');
                return;
              }
              
              setCustomSetError('');
              setErrorVisible(false);
              setIsStartingWorkout(true);
              
              try {
                // Get target muscles based on exercise
                const targetMuscles = 
                  equipment === 'Barbell' && workout === 'Flat Bench Barbell Press'
                    ? ['Chest', 'Shoulders', 'Triceps']
                    : equipment === 'Barbell' && workout === 'Back Squats'
                    ? ['Quadriceps', 'Glutes', 'Hamstrings']
                    : equipment === 'Dumbbell' && workout === 'Concentration Curls'
                    ? ['Biceps']
                    : equipment === 'Dumbbell' && workout === 'Overhead Triceps Extension'
                    ? ['Triceps']
                    : equipment === 'Weight Stack' && workout === 'Lateral Pulldown'
                    ? ['Back', 'Lats']
                    : ['Quadriceps'];
                
                // Determine set type based on carousel selection
                const isCustomSet = carouselActiveIndex === 1;
                const setType = isCustomSet ? 'custom' : 'recommended';
                
                // Parse recommended reps (e.g., "6-8" -> 6)
                const parseReps = (repsStr) => {
                  if (typeof repsStr === 'number') return repsStr;
                  const match = String(repsStr).match(/(\d+)/);
                  return match ? parseInt(match[1]) : 8;
                };

                // Get AI recommendation values (fallback to defaults)
                const aiSets = aiRec?.sets ?? details.recommendedSets;
                const aiReps = aiRec?.reps ?? details.recommendedReps;
                const aiWeight = aiRec?.weight ?? 5;
                const aiRestTime = aiRec?.restTimeSeconds ?? 30;

                // Determine final values based on set type (AI recommendation vs custom)
                const finalSets = isCustomSet ? (customSets || details.recommendedSets) : aiSets;
                const finalReps = isCustomSet ? (customReps || parseReps(details.recommendedReps)) : parseReps(aiReps);
                const finalWeight = isCustomSet ? (customWeight || 0) : aiWeight;
                const finalWeightUnit = isCustomSet ? customWeightUnit : 'kg';
                const finalRestTime = isCustomSet ? customRestTime : aiRestTime;
                
                // Generate weight breakdown for custom sets
                const generateCustomBreakdown = () => {
                  if (!isCustomSet) return aiRec?.weightBreakdown || '';
                  const w = finalWeight;
                  const unit = finalWeightUnit;
                  const eqLower = equipment.toLowerCase();
                  
                  if (eqLower === 'barbell') {
                    const barW = customBarWeight || 20;
                    const plateW = w - barW;
                    if (plateW <= 0) return `Bar only (${barW}${unit})`;
                    return `${barW}${unit} bar + ${plateW}${unit} plates`;
                  } else if (eqLower === 'dumbbell') {
                    // Just show total weight for dumbbell (unilateral/isolated exercises)
                    const handleW = customBarWeight || 2;
                    const plateW = w - handleW;
                    if (plateW <= 0) return `Handle only (${handleW}${unit})`;
                    return `${handleW}${unit} handle + ${plateW}${unit} plates`;
                  } else {
                    return `${w}${unit} on stack`;
                  }
                };
                const finalWeightBreakdown = generateCustomBreakdown();

                console.log('🏋️ Starting Workout:', {
                  exercise: workout,
                  equipment: equipment,
                  setType: setType,
                  sets: finalSets,
                  reps: finalReps,
                  weight: finalWeight,
                  weightUnit: finalWeightUnit,
                  weightBreakdown: finalWeightBreakdown,
                });

                // Initialize workout log before navigating
                await initializeLog({
                  exercise: workout,
                  equipment: equipment,
                  targetMuscles: targetMuscles,
                  sets: finalSets,
                  reps: finalReps,
                  weight: finalWeight,
                  weightUnit: finalWeightUnit,
                  weightBreakdown: finalWeightBreakdown,
                  setType: setType,
                });

                // Navigate to workout monitor with workout context
                router.push({
                  pathname: '/workout-monitor',
                  query: { 
                    equipment, 
                    workout,
                    plannedSets: finalSets,
                    plannedReps: finalReps,
                    weight: finalWeight,
                    weightUnit: finalWeightUnit,
                    weightBreakdown: finalWeightBreakdown,
                    setType: setType,
                    restTime: finalRestTime,
                  }
                });
              } catch (error) {
                console.error('Failed to initialize workout:', error);
                setIsStartingWorkout(false);
              }
            }}
          />
        </div>
      </div>

      {/* Custom Set Modal */}
      <CustomSetModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleModalSave}
        initialValue={getModalInitialValue()}
        initialWeightUnit={customWeightUnit}
        fieldType={modalField}
        equipment={equipment}
      />
      
      {/* ROM Calibration Modal */}
      <CalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
        equipment={equipment}
        exercise={workout}
        onCalibrate={(calibrationData) => {
          console.log('ROM Calibration saved:', calibrationData);
          setIsROMCalibrated(true);
          setSavedCalibrationData(calibrationData);
        }}
      />
      
      {/* Video Player Modal */}
      <VideoPlayerModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        videoSrc={tutorialVideoPath}
        title={`${workout} Tutorial`}
      />
    </div>
  );
}
