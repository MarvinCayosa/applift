/**
 * SetRepCard
 * 
 * Individual rep performance card for set break review.
 * Shows classification with loading/check animation, ROM, duration, phases.
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import ROMInfoModal from '../shared/ROMInfoModal';

// Classification display configuration — colors by severity, not label
// Labels come from the ML API and vary by exercise/equipment type:
//   Dumbbell:     Clean / Uncontrolled Movement / Abrupt Initiation
//   Barbell:      Clean / Uncontrolled Movement / Inclination Asymmetry
//   Weight Stack: Clean / Pulling Too Fast / Releasing Too Fast
const CLASSIFICATION_CONFIG = {
  clean:    { color: '#22c55e', bgColor: 'bg-green-500/20', textColor: 'text-green-400' },
  moderate: { color: '#f59e0b', bgColor: 'bg-yellow-500/20', textColor: 'text-yellow-400' },
  severe:   { color: '#ef4444', bgColor: 'bg-red-500/20', textColor: 'text-red-400' },
  pending:  { label: 'Classifying...', color: '#6b7280', bgColor: 'bg-gray-500/20', textColor: 'text-gray-400' }
};

export default function SetRepCard({ 
  repData, 
  repNumber,
  isLoading = false,
  targetROM,
  romUnit = '°'
}) {
  const {
    rom,
    romFulfillment,
    liftingTime,
    loweringTime,
    time,
    duration,
    meanVelocity,
    peakVelocity,
    classification,
    confidence
  } = repData || {};

  // Track if classification just arrived (for animation)
  const [justClassified, setJustClassified] = useState(false);
  const prevClassification = useRef(null);

  useEffect(() => {
    if (classification && !prevClassification.current) {
      // Classification just arrived — trigger animation
      setJustClassified(true);
      const timer = setTimeout(() => setJustClassified(false), 1200);
      return () => clearTimeout(timer);
    }
    prevClassification.current = classification;
  }, [classification]);

  // Calculate phase breakdown
  const totalPhaseTime = (liftingTime || 0) + (loweringTime || 0);
  const hasPhaseData = totalPhaseTime > 0;
  const liftingPercent = hasPhaseData ? (liftingTime / totalPhaseTime) * 100 : 50;
  const loweringPercent = hasPhaseData ? (loweringTime / totalPhaseTime) * 100 : 50;
  
  // Rep duration
  const repDuration = totalPhaseTime > 0 ? totalPhaseTime : (time || duration || 0);
  
  // ROM display
  const displayRom = rom ? Math.round(rom) : null;
  const displayRomUnit = romUnit || '°';
  const romPercent = targetROM && displayRom ? Math.min(100, (displayRom / targetROM) * 100) : (romFulfillment || null);
  
  // Classification display — uses prediction index + actual label from ML
  // prediction 0 = Clean (all exercises)
  // prediction 1 = form issue (Uncontrolled Movement / Pulling Too Fast)
  // prediction 2 = form issue (Abrupt Initiation / Inclination Asymmetry / Releasing Too Fast)
  const classConfig = useMemo(() => {
    if (!classification) return CLASSIFICATION_CONFIG.pending;
    
    const pred = classification.prediction;
    const label = classification.label || '';
    
    // prediction 0 is always Clean
    if (pred === 0 || label.toLowerCase() === 'clean') {
      return { ...CLASSIFICATION_CONFIG.clean, label: label || 'Clean' };
    }
    
    // prediction 2 = red/severe (Abrupt, Inclination Asymmetry, Releasing Too Fast)
    if (pred === 2) {
      return { ...CLASSIFICATION_CONFIG.severe, label: label || 'Poor Form' };
    }
    
    // prediction 1 = yellow/moderate (Uncontrolled, Pulling Too Fast)
    return { ...CLASSIFICATION_CONFIG.moderate, label: label || 'Poor Form' };
  }, [classification]);

  // Confidence display
  const confidencePercent = confidence ? `${Math.round(confidence * 100)}%` : null;

  // Whether we're still waiting
  const isPending = !classification;

  // Velocity
  const velocity = meanVelocity || peakVelocity || null;

  return (
    <div className="bg-white/[0.04] rounded-2xl p-4 w-full flex flex-col gap-3">
      {/* Header - Rep number and Classification badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white/90">Rep {repNumber}</span>
        
        {/* Classification badge with loading/check states */}
        <div className={`px-2.5 py-0.5 rounded-full flex items-center gap-1.5 transition-all duration-300 ${
          isPending ? 'bg-gray-500/20' : classConfig.bgColor
        } ${justClassified ? 'scale-110' : 'scale-100'}`}>
          {isPending ? (
            <>
              <div className="w-2.5 h-2.5 border-[1.5px] border-gray-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-medium text-gray-400">Classifying...</span>
            </>
          ) : (
            <>
              <span className={`text-[10px] font-semibold ${justClassified ? 'animate-popIn' : ''} ${classConfig.textColor}`}>
                {classConfig.label}
              </span>
              {confidencePercent && (
                <span className={`text-[8px] opacity-60 ${classConfig.textColor}`}>
                  {confidencePercent}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* ROM */}
        <ROMCard displayRom={displayRom} displayRomUnit={displayRomUnit} romPercent={romPercent} targetROM={targetROM} />

        {/* Duration */}
        <div className="bg-white/[0.06] rounded-xl p-3">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide mb-0.5">Duration</div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-lg font-bold text-white">
              {repDuration > 0 ? repDuration.toFixed(1) : '--'}
            </span>
            <span className="text-xs text-gray-400">s</span>
          </div>
          {velocity !== null && velocity > 0 && (
            <div className="text-[9px] text-gray-500 mt-0.5">
              {velocity.toFixed(2)} m/s
            </div>
          )}
        </div>
      </div>

      {/* Phase Breakdown - Compact */}
      {hasPhaseData && (
        <MovementPhasesCard
          liftingTime={liftingTime}
          loweringTime={loweringTime}
          liftingPercent={liftingPercent}
          loweringPercent={loweringPercent}
        />
      )}
      
      {/* Animation styles */}
      <style jsx global>{`
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.3); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-popIn {
          animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>
    </div>
  );
}

// ── ROM Card with info modal ──────────────────────────────────
function ROMCard({ displayRom, displayRomUnit, romPercent }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <div className="bg-white/[0.06] rounded-xl p-3">
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide">ROM</div>
          <button
            onClick={() => setShowInfo(true)}
            className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center text-white/30 active:text-white/60 transition-colors"
            aria-label="About ROM"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
          </button>
        </div>
        <div className="flex items-baseline gap-0.5">
          {displayRom !== null ? (
            <>
              <span className="text-lg font-bold text-white">{displayRom}</span>
              <span className="text-xs text-gray-400">{displayRomUnit}</span>
            </>
          ) : (
            <span className="text-base text-gray-500">--</span>
          )}
        </div>
        {romPercent !== null && (
          <div className="mt-1">
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, romPercent)}%`,
                  backgroundColor: romPercent >= 85 ? '#22c55e' : romPercent >= 70 ? '#f59e0b' : '#ef4444'
                }}
              />
            </div>
            <span className="text-[9px] text-gray-500">{Math.round(romPercent)}% of target</span>
          </div>
        )}
      </div>

      {showInfo && <ROMInfoModal onClose={() => setShowInfo(false)} />}
    </>
  );
}

// ── Movement Phases sub-component with info modal ─────────────────────
function MovementPhasesCard({ liftingTime, loweringTime, liftingPercent, loweringPercent }) {
  const [showInfo, setShowInfo] = useState(false);
  const [isClosingInfo, setIsClosingInfo] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const closeInfo = () => {
    setIsClosingInfo(true);
    setTimeout(() => { setShowInfo(false); setIsClosingInfo(false); setDragCurrentY(0); }, 250);
  };
  const handleTouchStart = (e) => { setDragStartY(e.touches[0].clientY); setIsDragging(true); };
  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragStartY;
    if (diff > 0) setDragCurrentY(diff);
  };
  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragCurrentY > 80) closeInfo(); else setDragCurrentY(0);
  };

  return (
    <>
      <div className="bg-white/[0.06] rounded-xl p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[9px] text-gray-500 uppercase tracking-wide">Movement Phases</div>
          <button
            onClick={() => setShowInfo(true)}
            className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center text-white/30 active:text-white/60 transition-colors"
            aria-label="About movement phases"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
          </button>
        </div>

        {/* Phase bar */}
        <div className="h-1.5 rounded-full overflow-hidden flex">
          <div className="bg-cyan-500 transition-all" style={{ width: `${liftingPercent}%` }} />
          <div className="bg-purple-500 transition-all" style={{ width: `${loweringPercent}%` }} />
        </div>

        {/* Phase labels */}
        <div className="flex justify-between mt-1.5 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
            <span className="text-gray-400">Lifting</span>
            <span className="text-white font-medium">{liftingTime?.toFixed(1)}s</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="text-gray-400">Lowering</span>
            <span className="text-white font-medium">{loweringTime?.toFixed(1)}s</span>
          </div>
        </div>
      </div>

      {/* Info bottom sheet */}
      {showInfo && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center" onClick={closeInfo}>
          <div className={`absolute inset-0 bg-black/60 transition-opacity duration-250 ${isClosingInfo ? 'opacity-0' : 'opacity-100'}`} />
          <div
            className={`relative w-full max-w-lg rounded-t-2xl bg-[#1e1e1e] border-t border-white/10 pb-8 ${isClosingInfo ? 'animate-slideDown' : 'animate-slideUp'}`}
            style={{ transform: isDragging ? `translateY(${dragCurrentY}px)` : undefined }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2 cursor-grab" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-5 pb-2">
              <h4 className="text-[16px] font-bold text-white mb-3">Movement Phases</h4>
              <p className="text-[13px] text-white/60 leading-relaxed mb-4">
                Each rep has two phases — lifting and lowering. The time you spend on each tells a lot about your control and technique.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-xl bg-cyan-500/10 p-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 mt-1 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-white/80">Lifting Phase</p>
                    <p className="text-[12px] text-white/40 leading-relaxed">The concentric phase — when you push or pull the weight against gravity. Faster here means more power output.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl bg-purple-500/10 p-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-purple-500 mt-1 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-white/80">Lowering Phase</p>
                    <p className="text-[12px] text-white/40 leading-relaxed">The eccentric phase — when you lower the weight back down. Controlling this phase builds more muscle and reduces injury risk.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
