import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function WorkoutFinishedModal({ 
  show, 
  stats,
  workoutName,
  equipment,
  backgroundImage,
  onExport, 
  onClose,
  onDoAnother 
}) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setIsVisible(true);
    }
  }, [show]);

  if (!show) return null;

  // Calculate form safety level
  const getFormSafety = () => {
    if (!stats || stats.averageConsistency >= 80) {
      return {
        level: 'Safe & Controlled',
        icon: '🟢',
        message: 'You maintained safe form throughout the session.'
      };
    } else if (stats.averageConsistency >= 60) {
      return {
        level: 'Minor Inconsistencies',
        icon: '🟡',
        message: 'Some reps showed variation in tempo.'
      };
    } else {
      return {
        level: 'High Risk Detected',
        icon: '🔴',
        message: 'Consider focusing on controlled movements.'
      };
    }
  };

  const formSafety = getFormSafety();

  // Format time from seconds to MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black">
      {/* Background Image with Dark Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
          backgroundColor: '#1a1a1a'
        }}
      >
        {/* Dark gradient overlay - heavier at bottom for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black/95" />
      </div>

      {/* Content */}
      <div className="relative h-full flex flex-col">
        {/* Top Section - Back Button Only */}
        <div className="flex-shrink-0 p-4 pt-6">
          <button
            onClick={() => {
              if (onClose) onClose();
              router.back();
            }}
            className="flex items-center justify-center h-11 w-11 rounded-full hover:bg-black/40 transition-all backdrop-blur-md"
            aria-label="Go back"
          >
            <img
              src="/images/icons/arrow-point-to-left.png"
              alt="Back"
              className="w-5 h-5 filter brightness-0 invert"
            />
          </button>
        </div>

        {/* Spacer to push content to bottom half */}
        <div className="flex-1"></div>

        {/* Bottom Half - All Text Content */}
        <div className="flex-shrink-0 px-6 pb-8 space-y-6">
          {/* Title Section */}
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold text-white/90">Workout Finished!</h1>
            <h2 className="text-4xl font-bold text-white leading-tight">{workoutName || 'Workout'}</h2>
            <p className="text-base text-white/50">With {equipment || 'Equipment'}</p>
          </div>

          {/* 3 Column Stats Grid */}
          <div className="grid grid-cols-3 gap-4 py-4">
            {/* Reps Completed */}
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-1">{stats?.totalReps || 0}</div>
              <div className="text-xs text-white/50 font-medium">Reps</div>
            </div>

            {/* Average Tempo */}
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-1">{stats?.averageConsistency || 0}%</div>
              <div className="text-xs text-white/50 font-medium">Tempo</div>
            </div>

            {/* Total Time */}
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-1">{formatTime(stats?.totalTime || 0)}</div>
              <div className="text-xs text-white/50 font-medium">Time</div>
            </div>
          </div>

          {/* Form Safety Indicator */}
          <div className="text-center py-3 px-4">
            <p className="text-sm text-white/70">
              <span className="mr-1.5">{formSafety.icon}</span>
              <span className="font-medium">{formSafety.level}</span>
              <span className="mx-2">•</span>
              <span className="text-white/50">{formSafety.message}</span>
            </p>
          </div>

          {/* Bottom Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => {
                if (onDoAnother) onDoAnother();
                setIsVisible(false);
              }}
              className="py-3.5 rounded-full font-semibold text-white text-base transition-all border-2 border-white/25 hover:border-white/40 hover:bg-white/5 backdrop-blur-sm"
            >
              Do Another Round
            </button>
            <button
              onClick={() => {
                if (onExport) {
                  const shouldExport = confirm('Download workout data CSV?');
                  if (shouldExport) {
                    onExport();
                  }
                }
                if (onClose) onClose();
                router.back();
              }}
              className="py-3.5 rounded-full font-semibold text-white text-base transition-all"
              style={{
                background: 'linear-gradient(to right, #fb923c 0%, #f97316 100%)',
                boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)'
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
