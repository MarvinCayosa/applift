import { useState, useEffect } from 'react';

export default function WorkoutStreak({ streakDays = 0, lastWorkoutDate = null, loading = false, lostStreak = 0 }) {
  const [displayDays, setDisplayDays] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Animate the component on load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 100); // Small delay for smooth entrance

    return () => clearTimeout(timer);
  }, []);

  // Animate the number count up when component mounts
  useEffect(() => {
    if (streakDays > 0) {
      const duration = 600;
      const steps = 20;
      const stepValue = streakDays / steps;
      const stepTime = duration / steps;
      
      let currentStep = 0;
      const timer = setInterval(() => {
        currentStep++;
        if (currentStep <= steps) {
          setDisplayDays(Math.floor(stepValue * currentStep));
        } else {
          setDisplayDays(streakDays);
          clearInterval(timer);
        }
      }, stepTime);

      return () => clearInterval(timer);
    } else {
      setDisplayDays(0);
    }
  }, [streakDays]);

  // Get dynamic status message based on streak progress
  const getStatusMessage = () => {
    // If streak is 0 and there was a lost streak, show the loss message
    if (streakDays === 0 && lostStreak > 0) {
      return `${lostStreak} day streak lost`;
    }
    
    // If streak is 0 and no prior streak, encourage to start
    if (streakDays === 0) return "Start your Streak!";
    if (streakDays === 1) return "Good job!";
    if (streakDays === 2) return "Keep it up!";
    if (streakDays === 3) return "Great work!";
    if (streakDays === 4) return "You're on fire!";
    if (streakDays === 5) return "Amazing streak!";
    if (streakDays === 6) return "Almost a week!";
    if (streakDays === 7) return "One week strong!";
    if (streakDays < 14) return "Building momentum!";
    if (streakDays === 14) return "Two weeks solid!";
    if (streakDays < 21) return "Incredible dedication!";
    if (streakDays === 21) return "Three weeks! Wow!";
    if (streakDays < 30) return "Unstoppable force!";
    if (streakDays === 30) return "One month legend!";
    if (streakDays < 60) return "Habit master!";
    if (streakDays < 100) return "Elite consistency!";
    return "Legendary status!";
  };

  const hasActiveStreak = streakDays > 0;
  const isStreakLost = streakDays === 0 && lostStreak > 0;

  return (
    <div className={`w-full max-w-4xl mx-auto mb-4 transition-all duration-700 ease-out ${
      isVisible 
        ? 'opacity-100 translate-y-0' 
        : 'opacity-0 translate-y-4'
    }`}>
      {/* Detailed Streak Card - Left Aligned */}
      <div className={`relative overflow-hidden rounded-3xl px-4 py-3 transition-all duration-300 ${
        hasActiveStreak 
          ? 'border border-orange-500/30' 
          : 'bg-white/5 border border-white/10'
      }`}>
        
        {/* Animated Wave Background for Active Streaks */}
        {hasActiveStreak && (
          <>
            {/* Primary animated gradient wave */}
            <div 
              className="absolute inset-0 opacity-80 animate-pulse"
              style={{
                background: 'linear-gradient(45deg, rgba(249, 115, 22, 0.15), rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.25), rgba(239, 68, 68, 0.1))',
                backgroundSize: '400% 400%',
                animation: 'gradientWave 8s ease-in-out infinite'
              }}
            ></div>
            
            {/* Secondary wave for depth */}
            <div 
              className="absolute inset-0 opacity-60"
              style={{
                background: 'linear-gradient(-45deg, rgba(239, 68, 68, 0.1), rgba(249, 115, 22, 0.2), rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.1))',
                backgroundSize: '300% 300%',
                animation: 'gradientWave 6s ease-in-out infinite reverse'
              }}
            ></div>
            
            {/* Tertiary subtle wave */}
            <div 
              className="absolute inset-0 opacity-40"
              style={{
                background: 'linear-gradient(90deg, rgba(249, 115, 22, 0.05), rgba(239, 68, 68, 0.1), rgba(249, 115, 22, 0.15), rgba(239, 68, 68, 0.05))',
                backgroundSize: '200% 200%',
                animation: 'gradientWave 4s ease-in-out infinite'
              }}
            ></div>
          </>
        )}
        
        {loading ? (
          // Loading state
          <div className="flex items-center gap-4 animate-pulse relative z-10">
            <div className="w-8 h-8 bg-white/10 rounded-full"></div>
            <div className="flex flex-col gap-2">
              <div className="w-20 h-5 bg-white/10 rounded"></div>
              <div className="w-32 h-3 bg-white/10 rounded"></div>
            </div>
          </div>
        ) : (
          // Normal state
          <div className="flex items-center justify-between gap-4 relative z-10">
            {/* Left side - Fire Icon and Streak Info */}
            <div className="flex items-center gap-4 flex-1">
              {/* Fire Icon with Glow Effect */}
              <div className="relative flex-shrink-0">
                {hasActiveStreak ? (
                  <div className="relative">
                    {/* Enhanced glow effect for active streak */}
                    <div className="absolute inset-0 bg-orange-400/40 rounded-full blur-lg animate-pulse"></div>
                    <div className="absolute inset-0 bg-red-400/30 rounded-full blur-md animate-pulse" 
                         style={{ animationDelay: '0.5s' }}></div>
                    <div 
                      className="relative w-8 h-8 animate-bounce"
                      style={{ 
                        animationDuration: '2.5s',
                        animationIterationCount: 'infinite',
                        animationDelay: `${Math.random() * 2}s`,
                        filter: 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.6))'
                      }}
                    >
                      <svg width="32" height="32" viewBox="-33 0 255 255" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
                        <defs>
                          <linearGradient id="linear-gradient-1" gradientUnits="userSpaceOnUse" x1="94.141" y1="255" x2="94.141" y2="0.188">
                            <stop offset="0" stopColor="#ff4c0d"/>
                            <stop offset="1" stopColor="#fc9502"/>
                          </linearGradient>
                        </defs>
                        <g id="fire">
                          <path d="M187.899,164.809 C185.803,214.868 144.574,254.812 94.000,254.812 C42.085,254.812 -0.000,211.312 -0.000,160.812 C-0.000,154.062 -0.121,140.572 10.000,117.812 C16.057,104.191 19.856,95.634 22.000,87.812 C23.178,83.513 25.469,76.683 32.000,87.812 C35.851,94.374 36.000,103.812 36.000,103.812 C36.000,103.812 50.328,92.817 60.000,71.812 C74.179,41.019 62.866,22.612 59.000,9.812 C57.662,5.384 56.822,-2.574 66.000,0.812 C75.352,4.263 100.076,21.570 113.000,39.812 C131.445,65.847 138.000,90.812 138.000,90.812 C138.000,90.812 143.906,83.482 146.000,75.812 C148.365,67.151 148.400,58.573 155.999,67.813 C163.226,76.600 173.959,93.113 180.000,108.812 C190.969,137.321 187.899,164.809 187.899,164.809 Z" fill="url(#linear-gradient-1)" fillRule="evenodd"/>
                          <path d="M94.000,254.812 C58.101,254.812 29.000,225.711 29.000,189.812 C29.000,168.151 37.729,155.000 55.896,137.166 C67.528,125.747 78.415,111.722 83.042,102.172 C83.953,100.292 86.026,90.495 94.019,101.966 C98.212,107.982 104.785,118.681 109.000,127.812 C116.266,143.555 118.000,158.812 118.000,158.812 C118.000,158.812 125.121,154.616 130.000,143.812 C131.573,140.330 134.753,127.148 143.643,140.328 C150.166,150.000 159.127,167.390 159.000,189.812 C159.000,225.711 129.898,254.812 94.000,254.812 Z" fill="#fc9502" fillRule="evenodd"/>
                          <path d="M95.000,183.812 C104.250,183.812 104.250,200.941 116.000,223.812 C123.824,239.041 112.121,254.812 95.000,254.812 C77.879,254.812 69.000,240.933 69.000,223.812 C69.000,206.692 85.750,183.812 95.000,183.812 Z" fill="#fce202" fillRule="evenodd"/>
                        </g>
                      </svg>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="w-8 h-8 transition-all duration-300"
                    style={{ 
                      filter: 'grayscale(100%) brightness(0.4)',
                      opacity: 0.6
                    }}
                  >
                    <svg width="32" height="32" viewBox="-33 0 255 255" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
                      <defs>
                        <linearGradient id="linear-gradient-1-inactive" gradientUnits="userSpaceOnUse" x1="94.141" y1="255" x2="94.141" y2="0.188">
                          <stop offset="0" stopColor="#666666"/>
                          <stop offset="1" stopColor="#999999"/>
                        </linearGradient>
                      </defs>
                      <g id="fire">
                        <path d="M187.899,164.809 C185.803,214.868 144.574,254.812 94.000,254.812 C42.085,254.812 -0.000,211.312 -0.000,160.812 C-0.000,154.062 -0.121,140.572 10.000,117.812 C16.057,104.191 19.856,95.634 22.000,87.812 C23.178,83.513 25.469,76.683 32.000,87.812 C35.851,94.374 36.000,103.812 36.000,103.812 C36.000,103.812 50.328,92.817 60.000,71.812 C74.179,41.019 62.866,22.612 59.000,9.812 C57.662,5.384 56.822,-2.574 66.000,0.812 C75.352,4.263 100.076,21.570 113.000,39.812 C131.445,65.847 138.000,90.812 138.000,90.812 C138.000,90.812 143.906,83.482 146.000,75.812 C148.365,67.151 148.400,58.573 155.999,67.813 C163.226,76.600 173.959,93.113 180.000,108.812 C190.969,137.321 187.899,164.809 187.899,164.809 Z" fill="url(#linear-gradient-1-inactive)" fillRule="evenodd"/>
                        <path d="M94.000,254.812 C58.101,254.812 29.000,225.711 29.000,189.812 C29.000,168.151 37.729,155.000 55.896,137.166 C67.528,125.747 78.415,111.722 83.042,102.172 C83.953,100.292 86.026,90.495 94.019,101.966 C98.212,107.982 104.785,118.681 109.000,127.812 C116.266,143.555 118.000,158.812 118.000,158.812 C118.000,158.812 125.121,154.616 130.000,143.812 C131.573,140.330 134.753,127.148 143.643,140.328 C150.166,150.000 159.127,167.390 159.000,189.812 C159.000,225.711 129.898,254.812 94.000,254.812 Z" fill="#888888" fillRule="evenodd"/>
                        <path d="M95.000,183.812 C104.250,183.812 104.250,200.941 116.000,223.812 C123.824,239.041 112.121,254.812 95.000,254.812 C77.879,254.812 69.000,240.933 69.000,223.812 C69.000,206.692 85.750,183.812 95.000,183.812 Z" fill="#aaaaaa" fillRule="evenodd"/>
                      </g>
                    </svg>
                  </div>
                )}
              </div>

              {/* Streak Label and Status */}
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                {/* STREAK label */}
                <span className={`text-sm font-bold uppercase tracking-widest transition-colors ${
                  hasActiveStreak ? 'text-orange-300' : isStreakLost ? 'text-red-400' : 'text-white/40'
                }`}>
                  STREAK
                </span>
                
                {/* Status message */}
                <span className={`text-xs font-medium transition-colors ${
                  hasActiveStreak ? 'text-orange-200/60' : isStreakLost ? 'text-red-300/60' : 'text-white/30'
                }`}>
                  {getStatusMessage()}
                </span>
              </div>
            </div>

            {/* Right side - Days Count */}
            <div className="flex-shrink-0 text-right">
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold transition-colors ${
                  hasActiveStreak ? 'text-white' : isStreakLost ? 'text-red-400' : 'text-white/50'
                }`}>
                  {displayDays}
                </span>
                <span className={`text-sm font-medium transition-colors ${
                  hasActiveStreak ? 'text-orange-200' : isStreakLost ? 'text-red-300' : 'text-white/40'
                }`}>
                  {displayDays === 1 ? 'DAY' : 'DAYS'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CSS Keyframes for Wave Animation */}
        <style jsx>{`
          @keyframes gradientWave {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
