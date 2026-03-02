import { useState, useCallback, useEffect } from 'react';
import { useBluetooth } from '../context/BluetoothProvider';

// ─── Haptic helper ───────────────────────────────────────────────
const triggerHaptic = (pattern) => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(pattern || 10);
  }
};

// ─── Step definitions ────────────────────────────────────────────
const WELCOME_STEPS = [
  { id: 'welcome' },
];

const WORKOUT_STEPS = [
  { id: 'pairing', gated: true },
  { id: 'nfc' },
  { id: 'attach' },
  { id: 'ready' },
];

/**
 * Reusable slide-up InstructionModal
 *
 * Props:
 *  - variant        "welcome" | "workoutSetup"
 *  - isOpen         boolean
 *  - onClose        () => void
 *  - onComplete     () => void           (fires when the user finishes the flow)
 *  - onSkip         () => void           (fires when the user skips / closes early)
 *  - onNavigate     (path: string) => void   (router.push wrapper)
 *  - onDontShowAgain () => void
 *  - initialStep    number               (starting step index, e.g. 1 to skip pairing)
 */
export default function InstructionModal({
  variant = 'welcome',
  isOpen,
  onClose,
  onComplete,
  onSkip,
  onNavigate,
  onDontShowAgain,
  initialStep = 0,
}) {
  const bluetooth = useBluetooth();
  const {
    connected: devicePaired,
    scanDevices,
    connecting,
    scanning,
    devicesFound,
    connectToDevice,
  } = bluetooth;

  const steps = variant === 'welcome' ? WELCOME_STEPS : WORKOUT_STEPS;

  const [currentStep, setCurrentStep] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [attachTab, setAttachTab] = useState(0); // 0 = Dumbbells/Barbells, 1 = Weight Stack
  const [devMode, setDevMode] = useState(false); // bypass pairing gate for testing

  // Reset when variant or open state changes
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(initialStep || 0);
      setIsClosing(false);
      setDontShow(false);
      setAttachTab(0);
      setDevMode(false);
    }
  }, [isOpen, variant, initialStep]);

  // ── Close with exit animation ──────────────────────────────────
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
      setIsClosing(false);
    }, 250);
  }, [onClose]);

  const handleSkip = useCallback(() => {
    onSkip?.();
    handleClose();
  }, [onSkip, handleClose]);

  // ── Navigation ─────────────────────────────────────────────────
  const step = steps[currentStep];
  const isGated = step?.gated && !devicePaired;

  const goNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      triggerHaptic();
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep, steps.length]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      triggerHaptic();
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  // ── Touch / swipe-to-dismiss (only on the handle) ─────────────
  const handleHandleTouchStart = (e) => {
    setDragStartY(e.touches[0].clientY);
    setIsDragging(true);
  };
  const handleHandleTouchMove = (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragStartY;
    if (diff > 0) setDragCurrentY(diff);
  };
  const handleHandleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragCurrentY > 100) handleSkip();
    setDragCurrentY(0);
  };

  if (!isOpen) return null;

  // ════════════════════════════════════════════════════════════════
  // ─── RENDER HELPERS ────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════

  const renderStepIndicator = () => {
    if (steps.length <= 1) return null;
    return (
      <div className="flex justify-center gap-1.5 pt-4 pb-1">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === currentStep ? 'w-6 bg-violet-500' : 'w-1.5 bg-white/20'
            }`}
          />
        ))}
      </div>
    );
  };

  // ── WELCOME VARIANT ────────────────────────────────────────────
  const renderWelcome = () => (
    <div className="px-1 flex flex-col h-full items-center">
      {/* Centered content with top margin */}
      <div className="flex flex-col items-center w-full mt-4">
        {/* Logo */}
        <div className="mb-6">
          <img
            src="/images/applift-logo/AppLift_Logo_White.png"
            alt="AppLift"
            className="w-40 h-40 object-contain"
          />
        </div>

        {/* Title */}
        <h2 className="text-3xl font-bold text-white mb-3">Welcome to AppLift!</h2>

        {/* Subtext */}
        <p className="text-base text-white/50 text-center max-w-xs leading-relaxed mb-6">
          Let&apos;s set up your device to start your first workout.
        </p>

        {/* Buttons */}
        <div className="w-full space-y-3">
          <button
            type="button"
            onClick={() => {
              onComplete?.();
              onNavigate?.('/workouts');
              handleClose();
            }}
            className="w-full py-4 text-base font-bold rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all duration-150"
          >
            Let&apos;s get started
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-3 text-sm font-medium rounded-full text-white/50 hover:text-white/70 transition-all duration-150"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );

  // ── WORKOUT SETUP STEPS ────────────────────────────────────────

  const renderPairing = () => (
    <div className="px-1 mt-3">
      <div className="text-center mb-5">
        <h2 className="text-2xl font-bold text-white mb-2">Pair your AppLift device</h2>
        <p className="text-sm text-white/60">
          To start your workout, pair your AppLift device with the app.
        </p>
      </div>

      {/* GIF */}
      <div className="flex justify-center mb-6">
        <div className="w-64 h-64 rounded-2xl overflow-hidden">
          <img
            src="/gif/Module_Pairing.gif"
            alt="Device pairing"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Status indicator */}
      {devicePaired && (
        <div className="flex items-center justify-center gap-2 mb-4 px-4 py-2.5 bg-green-500/15 border border-green-500/30 rounded-xl">
          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium text-green-400">Device paired successfully!</span>
        </div>
      )}

      {/* Buttons */}
      <div className="space-y-3 mt-4">
        {!devicePaired && (
          <button
            type="button"
            onClick={() => scanDevices?.()}
            disabled={scanning || connecting}
            className={`w-full py-4 text-base font-bold rounded-full transition-all duration-150 ${
              scanning || connecting
                ? 'bg-white/50 text-black/50 cursor-wait'
                : 'bg-white hover:bg-white/90 active:bg-white/80 text-black'
            }`}
          >
            {scanning ? 'Scanning…' : connecting ? 'Connecting…' : 'Pair now'}
          </button>
        )}

        {/* Show found devices */}
        {!devicePaired && devicesFound.length > 0 && (
          <div className="space-y-2">
            {devicesFound.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => connectToDevice?.(d)}
                disabled={connecting}
                className="w-full py-3 px-4 text-sm font-medium rounded-xl bg-white/[0.06] hover:bg-white/10 text-white transition-all duration-150 flex items-center gap-3"
              >
                <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                {d.name || d.id}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={goNext}
          disabled={!devicePaired && !devMode}
          className={`w-full py-4 text-base font-bold rounded-full transition-all duration-150 ${
            devicePaired || devMode
              ? 'bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white'
              : 'bg-white/[0.06] text-white/25 cursor-not-allowed'
          }`}
        >
          Next
        </button>

        {/* Dev / testing bypass when no physical device is available */}
        {!devicePaired && !devMode && (
          <button
            type="button"
            onClick={() => setDevMode(true)}
            className="w-full py-2 text-xs text-white/25 hover:text-white/40 transition-colors"
          >
            I don&apos;t have my device right now
          </button>
        )}
      </div>
    </div>
  );

  const renderNFC = () => (
    <div className="px-1 flex flex-col h-full mt-3">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-white mb-2">Scan the NFC sticker</h2>
        <p className="text-base text-white/60">
          Tap the AppLift device near the NFC sticker of your chosen equipment to select exercise.
        </p>
      </div>

      <div className="flex justify-center flex-1 items-center my-2">
        <div className="w-72 h-72 rounded-2xl overflow-hidden">
          <img
            src="/gif/Grey_Module_Scanning.gif"
            alt="NFC scanning"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Carousel indicator + Nav buttons */}
      <div className="mt-auto space-y-3">
        {renderStepIndicator()}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={goPrev}
            className="flex-1 py-2.5 text-sm font-semibold rounded-full bg-white/[0.06] hover:bg-white/10 text-white/60 transition-all duration-150"
          >
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex-1 py-2.5 text-sm font-semibold rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all duration-150"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  const renderAttach = () => (
    <div className="px-1 flex flex-col h-full mt-3">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-white mb-2">Attach AppLift to the equipment</h2>
        <p className="text-base text-white/60">
          Mount the device securely so it stays stable during your workout.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-3">
        {['Dumbbells & Barbells', 'Weight Stack'].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setAttachTab(i)}
            className={`flex-1 py-2.5 text-xs font-semibold rounded-full transition-all duration-200 ${
              attachTab === i
                ? 'bg-white text-black'
                : 'bg-white/[0.06] text-white/40 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex justify-center flex-1 items-center my-2">
        <div className="w-72 h-72 rounded-2xl overflow-hidden">
          <img
            src={
              attachTab === 0
                ? '/gif/Grey_Module_Attachment.gif'
                : '/gif/Grey_Module_WeightStascks .gif'
            }
            alt={attachTab === 0 ? 'Attach to dumbbell/barbell' : 'Attach to weight stack'}
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Carousel indicator + Nav buttons */}
      <div className="mt-auto space-y-3">
        {renderStepIndicator()}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={goPrev}
            className="flex-1 py-2.5 text-sm font-semibold rounded-full bg-white/[0.06] hover:bg-white/10 text-white/60 transition-all duration-150"
          >
            Back
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex-1 py-2.5 text-sm font-semibold rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all duration-150"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );

  const renderReady = () => (
    <div className="px-1 flex flex-col h-full mt-3">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-white mb-2">You got it!</h2>
        <p className="text-base text-white/50 max-w-[280px] mx-auto leading-relaxed">
          You&apos;re now ready to start your AppLift journey!
        </p>
      </div>

      <div className="flex justify-center flex-1 items-center my-2">
        <div className="w-72 h-72 rounded-2xl overflow-hidden">
          <img
            src="/gif/Module_Pairing.gif"
            alt="Ready to go"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Don't show this again + Nav buttons */}
      <div className="mt-auto space-y-4">
        {/* Don't show this again toggle */}
        <label className="flex items-center justify-center gap-2 cursor-pointer select-none">
          <span
            role="checkbox"
            aria-checked={dontShow}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') setDontShow((v) => !v); }}
            onClick={() => setDontShow((v) => !v)}
            className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all duration-150 ${
              dontShow ? 'bg-violet-600 border-violet-500' : 'bg-white/5 border-white/20'
            }`}
          >
            {dontShow && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
          <span className="text-[11px] text-white/40">Don&apos;t show this again</span>
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={goPrev}
            className="flex-1 py-2.5 text-sm font-semibold rounded-full bg-white/[0.06] hover:bg-white/10 text-white/60 transition-all duration-150"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (dontShow) onDontShowAgain?.();
              onComplete?.();
              handleClose();
            }}
            className="flex-1 py-2.5 text-sm font-semibold rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all duration-150"
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );

  // ── Step dispatcher ────────────────────────────────────────────
  const renderCurrentStep = () => {
    if (variant === 'welcome') return renderWelcome();

    switch (step?.id) {
      case 'pairing': return renderPairing();
      case 'nfc': return renderNFC();
      case 'attach': return renderAttach();
      case 'ready': return renderReady();
      default: return null;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // ─── MAIN RENDER ──────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center transition-opacity duration-250 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={handleSkip}
    >
      {/* Slide-up panel */}
      <div
        className={`w-full transition-transform ease-out ${
          isClosing ? 'translate-y-full' : 'translate-y-0'
        }`}
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: !isClosing ? 'onboardSlideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)' : undefined,
          transform: isDragging ? `translateY(${dragCurrentY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.25s ease-out',
        }}
      >
        <div
          className={`rounded-t-3xl pt-3 pb-10 px-5 max-h-[92vh] overflow-y-auto flex flex-col ${
            variant === 'welcome' ? 'min-h-[55vh]' : 'min-h-[60vh]'
          }`}
          style={{ backgroundColor: 'rgb(38, 38, 38)' }}
        >
          {/* Drag handle */}
          <div
            className="flex justify-center mb-5 py-2 cursor-grab active:cursor-grabbing"
            onTouchStart={handleHandleTouchStart}
            onTouchMove={handleHandleTouchMove}
            onTouchEnd={handleHandleTouchEnd}
          >
            <div className="w-9 h-1 rounded-full bg-white/30" />
          </div>

          {/* Step content */}
          <div className="flex-1 flex flex-col min-h-0">
            {renderCurrentStep()}
          </div>
        </div>
      </div>

      {/* Scoped CSS animation */}
      <style jsx>{`
        @keyframes onboardSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
