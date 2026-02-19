import { useState } from 'react';
import RestTimerModal from './RestTimerModal';

export default function CustomSetCard({ 
  workout, 
  image,
  // Custom values from parent
  customWeight = null,
  customSets = null,
  customReps = null,
  customWeightUnit = 'kg',
  // Rest timer values
  restMinutes = 0,
  restSeconds = 30,
  onRestTimeChange = () => {},
  // Callback to open custom field modal
  onCustomFieldClick = () => {},
}) {
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [localRestMinutes, setLocalRestMinutes] = useState(restMinutes);
  const [localRestSeconds, setLocalRestSeconds] = useState(restSeconds);

  // Format rest time for display
  const restTimeDisplay = `${localRestMinutes}:${localRestSeconds.toString().padStart(2, '0')}`;

  return (
    <div 
      className="shrink-0 snap-center"
      style={{ width: 'calc(100% - 32px)' }}
    >
      {/* Main workout card with static gray outer container */}
      <div
        className="rounded-3xl shadow-lg shadow-black/30"
        style={{
          background: 'linear-gradient(90deg, rgba(60,60,60,0.4), rgba(80,80,80,0.6), rgba(60,60,60,0.4))',
          padding: '6px',
        }}
      >
        {/* Inner container with image and stats */}
        <div className="rounded-[22px] bg-black/90 overflow-hidden">
          <div className="rounded-[20px] overflow-hidden relative w-full mx-auto" style={{ height: 'clamp(200px, 28vh, 300px)' }}>
            {/* Background image */}
            <img
              src={image}
              alt="Custom Set"
              className="w-full h-full object-cover"
            />
            
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Top gradient overlay */}
            <div 
              className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
              }}
            />

            {/* Bottom gradient overlay */}
            <div 
              className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
              }}
            />

            {/* Content overlay */}
            <div className="absolute inset-0 flex flex-col justify-between p-5">
              {/* Title and timer button */}
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">
                  Custom Set
                </h2>
                <button
                  type="button"
                  onClick={() => setShowTimerModal(true)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
                  aria-label="Set rest timer"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="2" />
                    <polyline points="12,6 12,12 16,14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Rest Timer Display - Above stats */}
              <div className="flex justify-center mb-2">
                <button
                  type="button"
                  onClick={() => setShowTimerModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="2" />
                    <polyline points="12,6 12,12 16,14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-semibold text-violet-400">Rest: {restTimeDisplay}</span>
                </button>
              </div>

              {/* Stats - Weight, Sets, Reps */}
              <div className="flex justify-start gap-3">
                <button
                  type="button"
                  onClick={() => onCustomFieldClick('weight')}
                  className="rounded-2xl px-4 py-3 min-w-[90px] hover:bg-white/10 transition-colors"
                >
                  <p className="text-[11px] text-white/70 mb-1">Weight</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-4xl font-bold text-white leading-none">
                      {customWeight || '__'}
                    </p>
                    <p className="text-xs text-white/70 leading-none">{customWeightUnit}</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onCustomFieldClick('sets')}
                  className="rounded-2xl px-4 py-3 min-w-[70px] text-center hover:bg-white/10 transition-colors"
                >
                  <p className="text-[11px] text-white/70 mb-1">Sets</p>
                  <p className="text-4xl font-bold text-white leading-none">
                    {customSets || '_'}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onCustomFieldClick('reps')}
                  className="rounded-2xl px-4 py-3 min-w-[70px] text-center hover:bg-white/10 transition-colors"
                >
                  <p className="text-[11px] text-white/70 mb-1">Reps</p>
                  <p className="text-4xl font-bold text-white leading-none">
                    {customReps || '_'}
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rest Timer Modal */}
      <RestTimerModal
        isOpen={showTimerModal}
        onClose={() => setShowTimerModal(false)}
        onSave={({ minutes, seconds, totalSeconds }) => {
          setLocalRestMinutes(minutes);
          setLocalRestSeconds(seconds);
          onRestTimeChange(totalSeconds);
        }}
        initialMinutes={localRestMinutes}
        initialSeconds={localRestSeconds}
      />
    </div>
  );
}
