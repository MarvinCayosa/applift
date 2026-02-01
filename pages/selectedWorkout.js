import Head from 'next/head';
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';
import ConnectPill from '../components/ConnectPill';
import CustomSetModal from '../components/CustomSetModal';
import RecommendedSetCard from '../components/RecommendedSetCard';
import WarmUpBanner from '../components/WarmUpBanner';
import WorkoutActionButton from '../components/WorkoutActionButton';
import { useBluetooth } from '../context/BluetoothProvider';
import { useWorkoutLogging } from '../context/WorkoutLoggingContext';

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

  // Handle carousel index change and log it
  const handleCarouselIndexChange = (index) => {
    setCarouselActiveIndex(index);
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
    <div className="relative min-h-screen bg-black text-white">
      <Head>
        <title>{workout} — AppLift</title>
      </Head>

      <main ref={mainRef} className="w-full px-4 sm:px-6 md:px-8 pt-6 pb-20 flex items-start justify-center">
        <div className="mx-auto w-full max-w-4xl space-y-3 sm:space-y-4">
        {/* Header with back button and connection pill */}
        <div className="flex items-center justify-between content-fade-up-1">
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
        <div className="content-fade-up-2" style={{ animationDelay: '0.05s' }}>
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

        {/* Target Muscles - Styled like LiftPhases */}
        <div className="content-fade-up-2 max-w-sm mx-auto" style={{ animationDelay: '0.15s' }}>
          <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Vertical Indicator Bar */}
                <div className="w-1 h-10 bg-gradient-to-b from-purple-500 to-violet-400 rounded-full" />
                
                <div className="flex flex-col">
                  <h3 className="text-sm font-semibold text-white">Target Muscles</h3>
                  <p className="text-xs text-gray-400">
                    {equipment === 'Barbell' && workout === 'Flat Bench Barbell Press'
                      ? 'Chest, Shoulders, Triceps'
                      : equipment === 'Barbell' && workout === 'Front Squats'
                      ? 'Quadriceps, Core, Lower Back'
                      : equipment === 'Dumbell' && workout === 'Concentration Curls'
                      ? 'Biceps'
                      : equipment === 'Dumbell' && workout === 'Single-arm Overhead Extension'
                      ? 'Triceps, Shoulders'
                      : equipment === 'Weight Stack' && workout === 'Lateral Pulldown'
                      ? 'Back, Lats'
                      : 'Quadriceps'}
                  </p>
                </div>
              </div>
              
              {/* Muscle Icon */}
              <div className="w-12 h-12 rounded-full bg-white/5 border border-red-500/30 flex items-center justify-center overflow-hidden">
                <svg viewBox="0 0 64 64" className="w-10 h-10">
                  {/* Body outline */}
                  <ellipse cx="32" cy="14" rx="8" ry="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  <path d="M24 23 L20 45 L24 62 M40 23 L44 45 L40 62" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  <path d="M24 23 Q32 26 40 23 L40 45 Q32 48 24 45 Z" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  <path d="M24 26 L12 32 L10 45 M40 26 L52 32 L54 45" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  
                  {/* Highlighted muscles based on exercise */}
                  {equipment === 'Barbell' && workout === 'Flat Bench Barbell Press' && (
                    <>
                      {/* Chest */}
                      <path d="M26 28 Q32 32 38 28 L38 36 Q32 40 26 36 Z" fill="rgba(239,68,68,0.7)"/>
                      {/* Shoulders */}
                      <circle cx="22" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                      <circle cx="42" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                    </>
                  )}
                  {equipment === 'Barbell' && workout === 'Front Squats' && (
                    <>
                      {/* Quadriceps */}
                      <path d="M22 46 L20 58 L26 58 L28 46 Z" fill="rgba(239,68,68,0.7)"/>
                      <path d="M42 46 L44 58 L38 58 L36 46 Z" fill="rgba(239,68,68,0.7)"/>
                      {/* Core */}
                      <ellipse cx="32" cy="40" rx="6" ry="4" fill="rgba(239,68,68,0.5)"/>
                    </>
                  )}
                  {equipment === 'Dumbell' && workout === 'Concentration Curls' && (
                    <>
                      {/* Biceps */}
                      <ellipse cx="16" cy="36" rx="3" ry="5" fill="rgba(239,68,68,0.7)"/>
                      <ellipse cx="48" cy="36" rx="3" ry="5" fill="rgba(239,68,68,0.7)"/>
                    </>
                  )}
                  {equipment === 'Dumbell' && workout === 'Single-arm Overhead Extension' && (
                    <>
                      {/* Triceps */}
                      <ellipse cx="18" cy="38" rx="2.5" ry="5" fill="rgba(239,68,68,0.7)"/>
                      <ellipse cx="46" cy="38" rx="2.5" ry="5" fill="rgba(239,68,68,0.7)"/>
                      {/* Shoulders */}
                      <circle cx="22" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                      <circle cx="42" cy="26" r="4" fill="rgba(239,68,68,0.5)"/>
                    </>
                  )}
                  {equipment === 'Weight Stack' && workout === 'Lateral Pulldown' && (
                    <>
                      {/* Back/Lats */}
                      <path d="M26 28 L24 42 Q32 46 40 42 L38 28 Q32 32 26 28 Z" fill="rgba(239,68,68,0.7)"/>
                    </>
                  )}
                  {equipment === 'Weight Stack' && workout === 'Seated Leg Extension' && (
                    <>
                      {/* Quadriceps */}
                      <path d="M22 46 L20 58 L26 58 L28 46 Z" fill="rgba(239,68,68,0.7)"/>
                      <path d="M42 46 L44 58 L38 58 L36 46 Z" fill="rgba(239,68,68,0.7)"/>
                    </>
                  )}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Exercise Information - Aligned with target muscles container */}
        <div className="content-fade-up-2 max-w-sm mx-auto space-y-3 px-1" style={{ animationDelay: '0.25s' }}>
          {/* Exercise Description */}
          <p className="text-xs text-white/70 leading-relaxed text-left">{details.description}</p>
          
          {/* Form Tips */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-1.5 text-left">Form Tips</h3>
            <ul className="text-xs text-white/70 space-y-1 list-disc list-inside text-left">
              {details.tips?.map((tip, idx) => (
                <li key={idx}>{tip}</li>
              )) || (
                <>
                  <li>Keep your core tight throughout the movement</li>
                  <li>Control the weight on the way down</li>
                  <li>Maintain steady breathing rhythm</li>
                </>
              )}
            </ul>
          </div>

          {/* Watch Tutorial Button */}
          {details.tutorialVideo && (
            <a
              href={details.tutorialVideo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] sm:text-xs text-white/60 hover:text-white/80 transition-colors flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-white/20 hover:border-white/40 w-fit"
            >
              <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Watch Tutorial
            </a>
          )}
        </div>

        {/* Warm Up Banner */}
        <div className="content-fade-up-3" style={{ animationDelay: '0.35s' }}>
          <WarmUpBanner />
        </div>
        </div>
      </main>

      {/* Fixed Bottom Workout Action Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-3 sm:px-4 md:px-6 py-4 sm:py-5 md:py-6" style={{
        background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.98) 60%, rgba(0,0,0,0) 100%)',
      }}>
        <div className="mx-auto w-full max-w-4xl">
          <WorkoutActionButton
            disabled={isStartingWorkout}
            onClick={async () => {
              if (isStartingWorkout) return;
              
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
