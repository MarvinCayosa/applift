/**
 * SetBreakOverlay
 * 
 * Full-screen overlay shown during rest period between sets.
 * 
 * PHASE 1 (0-3s): Original large circular timer (glow, motivational msg,
 *                  pause/skip buttons below)
 * PHASE 2 (3s+):  Warps into set performance details:
 *   - One-line timer bar (inherits circular timer's purple gradient glow aesthetic)
 *   - Rep carousel with classification badges
 *   - Velocity analysis chart
 *   - AI-generated 2-sentence feedback (from /api/set-feedback)
 *     → Falls back to hardcoded context-based tips if offline / API fails
 * 
 * All section cards: rounded-2xl bg-white/[0.06], NO borders
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import SetRepCarousel from './SetRepCarousel';
import SetVelocityOverview from './SetVelocityOverview';
import { getCompleteWorkoutData } from '../../services/imuStreamingService';
import { useAuth } from '../../context/AuthContext';

// ── How long to show the circular timer before warping (ms) ──
const CIRCLE_PHASE_DURATION = 3000;

// ── Offline fallback tips based on set data context ──────────
function generateFallbackFeedback(reps, exerciseName, equipment) {
  if (!reps || reps.length === 0) return 'Complete your set and review your performance here.';

  // Analyze classifications
  const classified = reps.filter(r => r.classification);
  const cleanCount = classified.filter(r => {
    const label = typeof r.classification === 'string' ? r.classification : r.classification?.label || '';
    return label.toLowerCase() === 'clean';
  }).length;
  const totalClassified = classified.length;
  const cleanRatio = totalClassified > 0 ? cleanCount / totalClassified : 0;

  // Analyze velocity using Best Rep vs Mean Last 3
  const velocities = reps.map(r => r.meanVelocity || r.peakVelocity || 0).filter(v => v > 0);
  let velocityDrop = 0;
  if (velocities.length >= 3) {
    const baseline = Math.max(...velocities); // Best Rep = baseline
    const lastN = Math.min(3, velocities.length);
    const avgLast = velocities.slice(-lastN).reduce((s, v) => s + v, 0) / lastN;
    velocityDrop = baseline > 0 ? Math.round(((baseline - avgLast) / baseline) * 100) : 0;
  } else if (velocities.length > 1) {
    const baseline = Math.max(...velocities);
    const last = velocities[velocities.length - 1];
    velocityDrop = baseline > 0 ? Math.round(((baseline - last) / baseline) * 100) : 0;
  }

  // Build context-appropriate feedback
  const exName = exerciseName || 'this exercise';

  if (cleanRatio >= 0.8 && velocityDrop < 15) {
    return `Great form this set — most of your reps were clean and controlled. Keep this up and consider adding a bit more weight next set.`;
  }
  if (cleanRatio >= 0.6 && velocityDrop < 25) {
    return `Solid effort with mostly good form. Try slowing down the lowering phase next set to get even cleaner reps.`;
  }
  if (velocityDrop > 25) {
    return `You slowed down quite a bit toward the end, which means fatigue is setting in. Take the full rest and consider going a bit lighter next set.`;
  }
  if (cleanRatio < 0.5 && totalClassified > 0) {
    return `Your form was a bit inconsistent this set. Focus on controlled, steady reps next time — slow down and prioritize quality over speed.`;
  }
  return `${reps.length} reps done. Focus on keeping a steady tempo and going through the full range of motion next set.`;
}

export default function SetBreakOverlay({
  isOpen,
  setData,
  currentSet,
  totalSets,
  timeRemaining,
  totalTime,
  isPaused,
  onTogglePause,
  onSkip,
  motivationalMessage,
  backgroundMLStatus = {},
  exerciseName = '',
  equipment = '',
  weight = '',
  weightUnit = 'kg'
}) {
  // ── Phase state ──────────────────────────────────────────────
  const [phase, setPhase] = useState('circle'); // 'circle' | 'details'
  const [isClosing, setIsClosing] = useState(false);

  // ── Swipe state: which view is showing ───────────────────────
  // 'timer' = circular timer fullscreen, 'info' = set details
  const [view, setView] = useState('timer');
  const swipeDragRef = useRef(null);
  const [swipeDelta, setSwipeDelta] = useState(0);

  // ── Classification polling ───────────────────────────────────
  const [classifiedReps, setClassifiedReps] = useState([]);
  const [classificationState, setClassificationState] = useState('waiting');
  const pollIntervalRef = useRef(null);
  const hasInitialized = useRef(false);

  // ── AI Feedback ──────────────────────────────────────────────
  const [aiFeedback, setAiFeedback] = useState(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [isAIGenerated, setIsAIGenerated] = useState(false);
  const aiFeedbackRequested = useRef(false);
  const { user } = useAuth();

  // ── Derived ──────────────────────────────────────────────────
  const hasSetData = setData && setData.repsData && setData.repsData.length > 0;
  const mlStatus = backgroundMLStatus[currentSet];

  // ── Phase transition timer ───────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setPhase('circle');
    setView('timer');
    const warpTimer = setTimeout(() => {
      setPhase('details');
      setView('info');
    }, 3000);
    return () => clearTimeout(warpTimer);
  }, [isOpen]);

  // ── Poll for ML classifications ──────────────────────────────
  const pollForClassifications = useCallback(() => {
    if (!hasSetData || !currentSet) return;
    try {
      const workoutData = getCompleteWorkoutData();
      const imuSetData = workoutData?.sets?.[currentSet - 1];
      if (!imuSetData?.reps) return;
      const mergedReps = setData.repsData.map((rep, idx) => {
        const imuRep = imuSetData.reps.find(r => r.repNumber === (rep.repNumber || idx + 1));
        if (imuRep?.classification) {
          return { ...rep, classification: imuRep.classification, confidence: imuRep.confidence };
        }
        return rep;
      });
      const allClassified = mergedReps.every(r => r.classification);
      setClassifiedReps(mergedReps);
      if (allClassified) {
        setClassificationState('complete');
        if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      }
    } catch (err) {
      console.warn('[SetBreakOverlay] Poll error:', err);
    }
  }, [hasSetData, currentSet, setData]);

  useEffect(() => {
    if (isOpen && hasSetData && !hasInitialized.current) {
      hasInitialized.current = true;
      setClassifiedReps(setData.repsData);
      setClassificationState('waiting');
      pollForClassifications();
      pollIntervalRef.current = setInterval(pollForClassifications, 500);
    }
  }, [isOpen, hasSetData, setData, pollForClassifications]);

  useEffect(() => {
    if (!isOpen || !hasSetData) return;
    if (mlStatus === 'complete') { pollForClassifications(); setClassificationState('complete'); }
    else if (mlStatus === 'error') { setClassificationState('error'); }
  }, [mlStatus, isOpen, hasSetData, pollForClassifications]);

  // ── Fetch AI feedback (with offline fallback) ────────────────
  const fetchAIFeedback = useCallback(async (reps) => {
    if (aiFeedbackRequested.current || !user) return;
    aiFeedbackRequested.current = true;
    setAiFeedbackLoading(true);

    // Check online status first
    if (!navigator.onLine) {
      const fallback = generateFallbackFeedback(reps, exerciseName, equipment);
      setAiFeedback(fallback);
      setIsAIGenerated(false);
      setAiFeedbackLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/set-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          setData: {
            exerciseName: exerciseName || 'Unknown Exercise',
            equipment: equipment || 'unknown',
            weight: weight || 0,
            weightUnit: weightUnit || 'kg',
            setNumber: currentSet,
            totalSets: totalSets,
            repsData: reps,
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.feedback) {
        setAiFeedback(data.feedback);
        setIsAIGenerated(true);
      } else {
        throw new Error('No feedback');
      }
    } catch (err) {
      console.warn('[SetBreakOverlay] AI feedback error, using fallback:', err);
      const fallback = generateFallbackFeedback(reps, exerciseName, equipment);
      setAiFeedback(fallback);
      setIsAIGenerated(false);
    } finally {
      setAiFeedbackLoading(false);
    }
  }, [user, exerciseName, equipment, weight, weightUnit, currentSet, totalSets]);

  // Trigger AI feedback once classifications are available (or after 6s fallback)
  useEffect(() => {
    if (!isOpen || !hasSetData || aiFeedbackRequested.current) return;
    if (classificationState === 'complete') {
      fetchAIFeedback(classifiedReps);
    } else {
      const fallback = setTimeout(() => {
        if (!aiFeedbackRequested.current) {
          fetchAIFeedback(classifiedReps.length > 0 ? classifiedReps : setData.repsData);
        }
      }, 6000);
      return () => clearTimeout(fallback);
    }
  }, [isOpen, hasSetData, classificationState, classifiedReps, fetchAIFeedback, setData]);

  // ── Cleanup ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false;
      aiFeedbackRequested.current = false;
      setClassifiedReps([]);
      setClassificationState('waiting');
      setAiFeedback(null);
      setAiFeedbackLoading(false);
      setIsAIGenerated(false);
      setPhase('circle');
      setView('timer');
      setIsClosing(false);
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    }
    return () => { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; } };
  }, [isOpen]);

  // ── Handle close ─────────────────────────────────────────────
  const handleClose = () => {
    setIsClosing(true);
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    setTimeout(() => onSkip(), 300);
  };

  // ── Swipe handlers ───────────────────────────────────────────
  // timer view: swipe UP → go to info. info view: swipe DOWN → go back to timer
  const handleSwipeStart = (e) => {
    swipeDragRef.current = { startY: e.touches[0].clientY, view };
    setSwipeDelta(0);
  };
  const handleSwipeMove = (e) => {
    if (!swipeDragRef.current) return;
    const dy = e.touches[0].clientY - swipeDragRef.current.startY;
    if (swipeDragRef.current.view === 'timer' && dy < 0) setSwipeDelta(dy);
    else if (swipeDragRef.current.view === 'info' && dy > 0) setSwipeDelta(dy);
    else setSwipeDelta(dy * 0.15);
  };
  const handleSwipeEnd = () => {
    if (!swipeDragRef.current) return;
    const threshold = 60;
    if (swipeDragRef.current.view === 'timer' && swipeDelta < -threshold) setView('info');
    else if (swipeDragRef.current.view === 'info' && swipeDelta > threshold) setView('timer');
    setSwipeDelta(0);
    swipeDragRef.current = null;
  };

  if (!isOpen) return null;

  const isClassifying = classificationState === 'waiting' && mlStatus !== 'complete';
  const displayReps = classifiedReps.length > 0 ? classifiedReps : (setData?.repsData || []);

  // Timer values
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const progress = totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0;
  const circumference = 2 * Math.PI * 110;
  const progressPercent = totalTime > 0 ? ((totalTime - timeRemaining) / totalTime) * 100 : 0;

  // Two full-screen pages stacked vertically.
  // Timer page = Y:0, Info page = Y:100vh (below).
  // When view='info', both shift up by 100vh.
  const pageShift = view === 'info'
    ? -window.innerHeight + Math.max(0, swipeDelta)   // info visible; swipe down = positive = going back
    : Math.min(0, swipeDelta);                         // timer visible; swipe up = negative = going to info
  const isAnimating = swipeDelta !== 0;
  const pageTransition = isAnimating ? 'none' : 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)';

  return (
    <div className={`fixed inset-0 z-[100] bg-black text-white overflow-hidden ${isClosing ? 'animate-fadeOut' : ''}`}>

      {/* Outer container that slides both pages together */}
      <div
        className="absolute inset-x-0"
        style={{ top: 0, height: '200vh', transform: `translateY(${pageShift}px)`, transition: pageTransition }}
      >
        {/* ── PAGE 1: Circular Timer (top half) ── */}
        <div
          className="h-screen flex flex-col items-center justify-center relative"
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
          onTouchEnd={handleSwipeEnd}
        >
          <div className="text-3xl font-bold text-white mb-4">Take a break!</div>
          <div className="text-lg text-white/70 mb-8">{motivationalMessage}</div>

          <div className="relative w-64 h-64">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 256 256">
              <circle cx="128" cy="128" r="110" stroke="rgba(255,255,255,0.1)" strokeWidth="16" fill="none" />
              <circle
                cx="128" cy="128" r="110"
                stroke="url(#breakGradientCircle)"
                strokeWidth="16" fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                style={{ transition: isPaused ? 'none' : 'stroke-dashoffset 1s linear', filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.8))' }}
              />
              <defs>
                <linearGradient id="breakGradientCircle" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-6xl font-bold text-white">{timeStr}</span>
            </div>
          </div>

          <div className="flex items-center gap-8 mt-8">
            <button onClick={onTogglePause} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                {isPaused
                  ? <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  : <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                }
              </div>
              <span className="text-sm text-white/80">{isPaused ? 'Resume' : 'Pause'}</span>
            </button>
            <button onClick={handleClose} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </div>
              <span className="text-sm text-white/80">End</span>
            </button>
          </div>

          {/* Swipe-up tab — pill only, pinned to bottom */}
          {phase === 'details' && (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center select-none pointer-events-none">
              <div className="w-12 h-1.5 rounded-full bg-white" />
            </div>
          )}
        </div>

        {/* ── PAGE 2: Info (bottom half) ── */}
        <div className="h-screen flex flex-col bg-black" onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          {/* Swipe-down tab — pill only, touch handlers only here */}
          <div
            className="flex justify-center pt-4 pb-5 shrink-0 select-none"
            onTouchStart={handleSwipeStart}
            onTouchMove={handleSwipeMove}
            onTouchEnd={handleSwipeEnd}
          >
            <div className="w-12 h-1.5 rounded-full bg-white" />
          </div>

          {/* Bar timer */}
          <div className="px-6 pb-4 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider whitespace-nowrap">
                Set {currentSet} of {totalSets}
              </span>
              <div className="flex-1 flex items-center gap-3">
                <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #c084fc, #7c3aed)', boxShadow: '0 0 8px rgba(168,85,247,0.6)' }} />
                </div>
                <span className="text-3xl font-bold text-white tabular-nums min-w-[75px] text-right">{timeStr}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={onTogglePause} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  {isPaused
                    ? <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    : <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                  }
                </button>
                <button onClick={handleClose} className="px-4 py-2 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold hover:bg-purple-500/30 transition-colors">Skip</button>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 md:max-w-3xl md:mx-auto md:w-full">
            {hasSetData && (
              <div className="animate-slideUp" style={{ animationDelay: '0.05s', animationFillMode: 'backwards' }}>
                <SetRepCarousel repsData={displayReps} isClassifying={isClassifying} targetROM={setData.targetROM} romUnit={setData.romUnit} />
              </div>
            )}
            {hasSetData && (
              <div className="rounded-2xl bg-white/[0.06] overflow-hidden animate-slideUp" style={{ animationDelay: '0.15s', animationFillMode: 'backwards' }}>
                <div className="p-4">
                  <SetVelocityOverview repsData={displayReps} setNumber={currentSet} isLoading={false} />
                </div>
              </div>
            )}
            <div className="rounded-2xl overflow-hidden animate-slideUp" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.06) 100%)', animationDelay: '0.25s', animationFillMode: 'backwards' }}>
              <div className="p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)' }}>
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white leading-tight">AI Set Feedback</h3>
                    <p className="text-[10px] text-white/40">{aiFeedbackLoading ? 'Generating…' : isAIGenerated ? 'Powered by Gemini' : 'Based on your data'}</p>
                  </div>
                </div>
                {aiFeedbackLoading ? (
                  <div className="space-y-2">
                    <div className="ai-shimmer-bar h-3.5 w-full" />
                    <div className="ai-shimmer-bar h-3.5 w-[88%]" />
                    <div className="ai-shimmer-bar h-3.5 w-[72%]" />
                  </div>
                ) : aiFeedback ? (
                  <p className="text-[13px] leading-relaxed text-white/80 ai-fade-in">{aiFeedback}</p>
                ) : (
                  <p className="text-xs text-white/30">Waiting for set data…</p>
                )}
              </div>
            </div>
            {!hasSetData && (
              <div className="flex flex-col items-center justify-center py-12 animate-slideUp">
                <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-3" />
                <span className="text-xs text-white/40">Loading set data...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═════════ Global Styles ═════════ */}
      <style jsx global>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideUp { animation: slideUp 0.45s cubic-bezier(0.32, 0.72, 0, 1); }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .animate-fadeOut { animation: fadeOut 0.3s ease-out forwards; }
        @keyframes ai-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes ai-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ai-shimmer-bar {
          background: linear-gradient(90deg, rgba(139,92,246,0.12) 25%, rgba(139,92,246,0.30) 50%, rgba(139,92,246,0.12) 75%);
          background-size: 200% 100%;
          animation: ai-shimmer 1.8s ease-in-out infinite;
          border-radius: 6px;
        }
        .ai-fade-in { animation: ai-fade-in 0.45s ease-out both; }
      `}</style>
    </div>
  );
}
