import Head from 'next/head';
import { useRouter } from 'next/router';
import { useRef, useState, useEffect } from 'react';
import CalibrationHistoryPanel from '../components/CalibrationHistoryPanel';
import ConnectPill from '../components/ConnectPill';
import CustomSetModal from '../components/CustomSetModal';
import ExerciseInfoPanel from '../components/ExerciseInfoPanel';
import RecommendedSetCard from '../components/RecommendedSetCard';
import WarmUpBanner from '../components/WarmUpBanner';
import WorkoutActionButton from '../components/WorkoutActionButton';
import { useBluetooth } from '../context/BluetoothProvider';
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';

// Exercise Info Carousel Component
function ExerciseInfoCarousel({ equipment, workout, tips, getTargetMuscles }) {
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

  // Muscle icon SVG based on exercise
  const MuscleIcon = () => (
    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/5 border-2 border-red-500/40 flex items-center justify-center">
      <svg viewBox="0 0 64 64" className="w-16 h-16 sm:w-20 sm:h-20">
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

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex-1 min-h-0 flex flex-col">
      {/* Carousel Container */}
      <div 
        ref={carouselRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {/* Slide 1: Target Muscles with Icon */}
        <div className="min-w-full w-full shrink-0 snap-center snap-always flex flex-col items-center justify-center px-2" style={{ scrollSnapAlign: 'center' }}>
          <h3 className="text-xs sm:text-sm font-semibold text-white text-center mb-2 sm:mb-3">Target Muscles</h3>
          <p className="text-xs sm:text-sm text-violet-400/70 text-center mb-3 sm:mb-4 font-medium">{getTargetMuscles()}</p>
          <MuscleIcon />
        </div>

        {/* Form Tips Slides - One tip per slide */}
        {tips.slice(0, 4).map((tip, idx) => (
          <div key={idx} className="min-w-full w-full shrink-0 snap-center snap-always flex flex-col items-center justify-center px-4 sm:px-6" style={{ scrollSnapAlign: 'center' }}>
            <div className="w-full max-w-xs">
              <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm sm:text-base font-bold text-violet-400">{idx + 1}</span>
                </div>
                <h4 className="text-xs sm:text-sm font-semibold text-white/80">Form Tip</h4>
              </div>
              <p className="text-xs sm:text-sm text-white/80 text-center leading-relaxed">{tip}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Carousel Indicators */}
      <div className="flex justify-center gap-1 mt-2">
        {[0, ...tips.slice(0, 4).map((_, i) => i + 1)].map((idx) => (
          <span
            key={idx}
            className={`${idx === activeSlide ? 'bg-white w-4' : 'bg-white/30 w-1'} h-1 rounded-full transition-all duration-300`}
          />
        ))}
      </div>
    </div>
  );
}

// Info & History Carousel Component
function InfoHistoryCarousel({ equipment, workout, tips, tutorialVideo, equipmentColor }) {
  // Get target muscles based on exercise
  const getTargetMuscles = () => {
    if (equipment === 'Barbell' && workout === 'Flat Bench Barbell Press') return 'Chest, Shoulders, Triceps';
    if (equipment === 'Barbell' && workout === 'Front Squats') return 'Quadriceps, Core, Lower Back';
    if (equipment === 'Dumbell' && workout === 'Concentration Curls') return 'Biceps';
    if (equipment === 'Dumbell' && workout === 'Single-arm Overhead Extension') return 'Triceps, Shoulders';
    if (equipment === 'Weight Stack' && workout === 'Lateral Pulldown') return 'Back, Lats';
    return 'Quadriceps';
  };

  return (
    <div className="content-fade-up-2 flex-1 min-h-0 max-w-md mx-auto w-full" style={{ animationDelay: '0.15s' }}>
      <div className="h-full flex flex-col" style={{ 
        height: 'calc(100vh - 750px)',
        minHeight: '160px',
        maxHeight: '220px'
      }}>
        {/* Info Panels (Calibration + Exercise Info + Tutorial) */}
        <div className="flex-1 px-0.5">
          <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5 h-full w-full">
            {/* Left Column - Calibration */}
            <CalibrationHistoryPanel
              equipment={equipment}
              workout={workout}
            />
            
            {/* Right Column - Exercise Info & Tutorial Button */}
            <div className="flex flex-col gap-1.5 sm:gap-2 h-full">
              {/* Exercise Info Carousel */}
              <ExerciseInfoCarousel 
                equipment={equipment}
                workout={workout}
                tips={tips}
                getTargetMuscles={getTargetMuscles}
              />
              
              {/* Watch Tutorial Button */}
              {tutorialVideo && (
                <a
                  href={tutorialVideo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <span className="text-xs sm:text-sm text-white/70 font-medium">Watch Tutorial</span>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-violet-500/30 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-300" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </a>
              )}
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
      recommendedSets: 4,
      recommendedReps: '6-8',
      difficulty: 'Intermediate',
      tutorialVideo: 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
      tips: [
        'Keep your feet flat on the floor',
        'Retract your shoulder blades for stability',
        'Lower the bar to mid-chest level',
        'Drive through your heels as you press'
      ]
    },
    'Front Squats': {
      description: 'Hold the barbell across the front of your shoulders with elbows high. Squat down by pushing your hips back and bending your knees, keeping your torso upright throughout.',
      recommendedSets: 4,
      recommendedReps: '6-8',
      difficulty: 'Intermediate',
      tutorialVideo: 'https://www.youtube.com/watch?v=uYumuL_G_V0',
      tips: [
        'Keep your elbows high throughout',
        'Push your knees out over your toes',
        'Maintain an upright torso',
        'Descend until thighs are parallel to floor'
      ]
    },
  },
  Dumbell: {
    'Concentration Curls': {
      description: 'Sit on a bench with your elbow braced against your inner thigh. Curl the dumbbell up with control, squeeze at the top, then lower slowly to full extension.',
      recommendedSets: 3,
      recommendedReps: '8-12',
      difficulty: 'Beginner',
      tutorialVideo: 'https://www.youtube.com/watch?v=Jvj2wV0vOYU',
      tips: [
        'Brace your elbow firmly against your thigh',
        'Squeeze at the top of the movement',
        'Lower the weight slowly for 2-3 seconds',
        'Avoid swinging or using momentum'
      ]
    },
    'Single-arm Overhead Extension': {
      description: 'Hold a dumbbell overhead with one arm fully extended. Lower the weight behind your head by bending at the elbow, then extend back up to the starting position.',
      recommendedSets: 3,
      recommendedReps: '8-12',
      difficulty: 'Beginner',
      tutorialVideo: 'https://www.youtube.com/watch?v=YbX7Wd8jQ-Q',
      tips: [
        'Keep your upper arm stationary',
        'Lower the weight behind your head slowly',
        'Fully extend at the top without locking',
        'Engage your core for stability'
      ]
    },
  },
  'Weight Stack': {
    'Lateral Pulldown': {
      description: 'Grip the bar wider than shoulder-width, lean back slightly, and pull the bar down to your upper chest. Squeeze your lats at the bottom, then control the weight back up.',
      recommendedSets: 4,
      recommendedReps: '8-10',
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
      recommendedSets: 3,
      recommendedReps: '10-12',
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
  Dumbell: '#3B82F6', // Blue
  Dumbbell: '#3B82F6', // Blue (alternate spelling)
  'Weight Stack': '#EF4444', // Red
};

const workoutImages = {
  Barbell: {
    'Flat Bench Barbell Press': '/images/workout-cards/barbell-flat-bench-press.jpg',
    'Front Squats': '/images/workout-cards/barbell-front-squats.jpg',
  },
  Dumbell: {
    'Concentration Curls': '/images/workout-cards/dumbell-concentration-curls.jpg',
    'Single-arm Overhead Extension': '/images/workout-cards/dumbell-overhead-extension.jpg',
  },
  'Weight Stack': {
    'Lateral Pulldown': '/images/workout-cards/weightstack-lateral-pulldown.jpg',
    'Seated Leg Extension': '/images/workout-cards/weightstack-seated-leg-extension.jpg',
  },
};

export default function SelectedWorkout() {
  const router = useRouter();
  const { equipment, workout } = router.query;
  const mainRef = useRef(null);

  // Workout logging
  const { initializeLog, isLogging } = useWorkoutLogging();

  // Modal state for custom set
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalField, setModalField] = useState('weight');
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  
  // Carousel active index state (0 = AI Generated/Recommended, 1 = Custom)
  const [carouselActiveIndex, setCarouselActiveIndex] = useState(0);
  
  // Custom set values
  const [customWeight, setCustomWeight] = useState(null);
  const [customSets, setCustomSets] = useState(null);
  const [customReps, setCustomReps] = useState(null);
  const [customWeightUnit, setCustomWeightUnit] = useState('kg');
  const [customSetError, setCustomSetError] = useState('');
  const [errorVisible, setErrorVisible] = useState(false);

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
  const handleCarouselIndexChange = (index) => {
    setCarouselActiveIndex(index);
    // Clear error when switching cards
    setCustomSetError('');
    setErrorVisible(false);
    const carouselType = index === 0 ? 'AI Generated (Recommended)' : 'Custom';
    console.log('📊 Carousel changed to:', carouselType);
    console.log('   - Index:', index);
    console.log('   - Type:', carouselType);
  };

  // Handle opening modal for specific field
  const handleCustomFieldClick = (field) => {
    setModalField(field);
    setIsModalOpen(true);
  };

  // Handle save from modal
  const handleModalSave = ({ value, weightUnit: wu, fieldType }) => {
    switch (fieldType) {
      case 'weight':
        setCustomWeight(value);
        setCustomWeightUnit(wu);
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

  const details = workoutDetails[equipment]?.[workout];
  const equipmentColor = equipmentColors[equipment] || '#7c3aed';
  const workoutImage = workoutImages[equipment]?.[workout] || '/images/workout-cards/barbell-flat-bench-press.jpg';

  if (!details) {
    return (
      <div className="relative min-h-screen bg-black text-white pb-24">
        <Head>
          <title>Workout — AppLift</title>
        </Head>
        <main className="mx-auto w-full max-w-[640px] px-4 pt-10">
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

      <main ref={mainRef} className="flex-1 w-full px-4 sm:px-6 md:px-8 pt-4 pb-24 flex flex-col overflow-hidden">
        <div className="mx-auto w-full max-w-4xl flex flex-col flex-1 space-y-3 overflow-hidden">
        {/* Header with back button and connection pill */}
        <div className="flex items-center justify-between content-fade-up-1 flex-shrink-0">
          {/* Back button */}
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
          />
        </div>

        {/* Recommended Set Card */}
        <div className="content-fade-up-2 flex-shrink-0" style={{ animationDelay: '0.05s' }}>
          <RecommendedSetCard
            equipment={equipment}
            workout={workout}
            recommendedSets={details.recommendedSets}
            recommendedReps={details.recommendedReps}
            image={workoutImage}
            equipmentColor={equipmentColor}
            customWeight={customWeight}
            customSets={customSets}
            customReps={customReps}
            customWeightUnit={customWeightUnit}
            onCustomFieldClick={handleCustomFieldClick}
            onActiveIndexChange={handleCarouselIndexChange}
          />
        </div>

        {/* Info & History Carousel */}
        <InfoHistoryCarousel
          equipment={equipment}
          workout={workout}
          tips={details.tips || []}
          tutorialVideo={details.tutorialVideo}
          equipmentColor={equipmentColor}
        />
        </div>
      </main>

      {/* Fixed Bottom Workout Action Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6" style={{
        background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 60%, rgba(0,0,0,0) 100%)',
      }}>
        <div className="mx-auto w-full max-w-4xl">
          {/* Warm Up Banner */}
          <div className="mb-3">
            <WarmUpBanner />
          </div>
          
          {/* Error message with fade animation */}
          {customSetError && (
            <div 
              className={`mb-3 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-xl text-center transition-opacity duration-300 ${errorVisible ? 'opacity-100' : 'opacity-0'}`}
            >
              <p className="text-sm text-red-400">{customSetError}</p>
            </div>
          )}
          <WorkoutActionButton
            disabled={isStartingWorkout}
            onClick={async () => {
              if (isStartingWorkout) return;
              
              // Check device connection first
              if (!connected) {
                setCustomSetError('Please connect your device to start the workout');
                return;
              }
              
              // Validate custom set values if on custom card
              const isCustomSet = carouselActiveIndex === 1;
              if (isCustomSet && (customWeight === null || customSets === null || customReps === null)) {
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
                    : equipment === 'Barbell' && workout === 'Front Squats'
                    ? ['Quadriceps', 'Core', 'Lower Back']
                    : equipment === 'Dumbell' && workout === 'Concentration Curls'
                    ? ['Biceps']
                    : equipment === 'Dumbell' && workout === 'Single-arm Overhead Extension'
                    ? ['Triceps', 'Shoulders']
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

                // Determine final values based on set type
                const finalSets = isCustomSet ? (customSets || details.recommendedSets) : details.recommendedSets;
                const finalReps = isCustomSet ? (customReps || parseReps(details.recommendedReps)) : parseReps(details.recommendedReps);
                const finalWeight = isCustomSet ? (customWeight || 0) : 0;
                const finalWeightUnit = customWeightUnit;

                console.log('🏋️ Starting Workout:', {
                  exercise: workout,
                  equipment: equipment,
                  setType: setType,
                  sets: finalSets,
                  reps: finalReps,
                  weight: finalWeight,
                  weightUnit: finalWeightUnit,
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
                    setType: setType,
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
      />
    </div>
  );
}
