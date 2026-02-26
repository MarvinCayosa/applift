import { useState, useEffect } from 'react';

/**
 * PostWorkoutAssessmentModal - Collects user feedback after workout completion
 * 
 * Captures:
 * - How the user felt during the workout (1-5)
 * - Perceived difficulty of the workout (1-5: Too Easy → Too Hard)
 * - Rating of AI recommendation accuracy (1-5)
 * - Optional notes
 * 
 * This data is saved to Firestore and used to improve future AI recommendations.
 */

const feelingOptions = [
  { value: 1, emoji: '😫', label: 'Very Poor' },
  { value: 2, emoji: '😕', label: 'Poor' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '💪', label: 'Great' },
];

const difficultyOptions = [
  { value: 1, emoji: '🌱', label: 'Too Easy' },
  { value: 2, emoji: '👍', label: 'Easy' },
  { value: 3, emoji: '✅', label: 'Just Right' },
  { value: 4, emoji: '😤', label: 'Hard' },
  { value: 5, emoji: '🔥', label: 'Too Hard' },
];

const recommendationOptions = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
];

export default function PostWorkoutAssessmentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  exerciseName,
  aiRecommendationUsed = true,
  isSubmitting = false 
}) {
  const [feelingRating, setFeelingRating] = useState(null);
  const [difficultyRating, setDifficultyRating] = useState(null);
  const [recommendationRating, setRecommendationRating] = useState(null);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState(1); // 1: Feeling, 2: Difficulty, 3: AI Rating (optional), 4: Notes
  const [isClosing, setIsClosing] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFeelingRating(null);
      setDifficultyRating(null);
      setRecommendationRating(null);
      setNotes('');
      setStep(1);
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleSkip = () => {
    // Submit with whatever data we have
    handleSubmit();
  };

  const handleSubmit = () => {
    const feedback = {
      feelingRating,
      difficultyRating,
      recommendationRating: aiRecommendationUsed ? recommendationRating : null,
      notes: notes.trim() || null,
      submittedAt: new Date().toISOString(),
    };
    onSubmit(feedback);
  };

  const handleNext = () => {
    if (step === 1 && feelingRating) {
      setStep(2);
    } else if (step === 2 && difficultyRating) {
      if (aiRecommendationUsed) {
        setStep(3);
      } else {
        setStep(4);
      }
    } else if (step === 3) {
      setStep(4);
    }
  };

  const canProceed = () => {
    if (step === 1) return feelingRating !== null;
    if (step === 2) return difficultyRating !== null;
    if (step === 3) return true; // AI rating is optional
    if (step === 4) return true; // Notes are optional
    return false;
  };

  const totalSteps = aiRecommendationUsed ? 4 : 3;

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
    >
      <div 
        className={`w-full max-w-md mx-4 rounded-3xl overflow-hidden transition-transform ease-out ${isClosing ? 'scale-95' : 'scale-100'}`}
        style={{ 
          backgroundColor: 'rgb(38, 38, 38)',
          animation: !isClosing ? 'fadeScaleIn 0.25s ease-out' : undefined 
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-white">How was your workout?</h2>
            <button 
              onClick={handleClose}
              className="p-2 -mr-2 text-white/40 hover:text-white/60 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-white/50">{exerciseName || 'Your workout'}</p>
          
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i + 1 === step ? 'w-6 bg-orange-400' : i + 1 < step ? 'w-3 bg-orange-400/60' : 'w-3 bg-white/20'
                }`} 
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {/* Step 1: How did you feel? */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-center text-white/70 text-sm mb-4">How did you feel during the workout?</p>
              <div className="flex justify-center gap-3">
                {feelingOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFeelingRating(opt.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                      feelingRating === opt.value 
                        ? 'bg-orange-500/20 ring-2 ring-orange-400 scale-105' 
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className={`text-[10px] font-medium ${feelingRating === opt.value ? 'text-orange-400' : 'text-white/50'}`}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Difficulty */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-center text-white/70 text-sm mb-4">How difficult was the workout?</p>
              <div className="flex justify-center gap-3">
                {difficultyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDifficultyRating(opt.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                      difficultyRating === opt.value 
                        ? 'bg-orange-500/20 ring-2 ring-orange-400 scale-105' 
                        : 'bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className={`text-[10px] font-medium ${difficultyRating === opt.value ? 'text-orange-400' : 'text-white/50'}`}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: AI Recommendation Rating */}
          {step === 3 && aiRecommendationUsed && (
            <div className="space-y-4">
              <p className="text-center text-white/70 text-sm mb-2">How accurate was the AI recommendation?</p>
              <p className="text-center text-white/40 text-xs mb-4">Was the suggested weight/reps appropriate for you?</p>
              <div className="flex justify-center gap-2">
                {recommendationOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRecommendationRating(opt.value)}
                    className={`w-12 h-12 rounded-xl font-bold text-lg transition-all ${
                      recommendationRating === opt.value 
                        ? 'bg-orange-500 text-white scale-105' 
                        : 'bg-white/10 text-white/60 hover:bg-white/15'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-white/40 px-2">
                <span>Not helpful</span>
                <span>Very helpful</span>
              </div>
            </div>
          )}

          {/* Step 4: Notes */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-center text-white/70 text-sm mb-4">Any additional notes? (Optional)</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Felt strong today, shoulder felt tight, need more rest..."
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                rows={3}
                maxLength={200}
              />
              <p className="text-right text-xs text-white/30">{notes.length}/200</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 mt-6">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white/70 font-medium text-sm hover:bg-white/15 transition-colors"
              >
                Back
              </button>
            )}
            
            {step < totalSteps ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                  canProceed()
                    ? 'bg-orange-500 text-white hover:bg-orange-400'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                  isSubmitting
                    ? 'bg-green-600/50 text-white/50 cursor-wait'
                    : 'bg-green-500 text-white hover:bg-green-400'
                }`}
              >
                {isSubmitting ? 'Saving...' : 'Done'}
              </button>
            )}
          </div>
          
          {/* Skip option for AI rating step */}
          {step === 3 && (
            <button
              onClick={handleNext}
              className="w-full mt-3 py-2 text-white/40 text-xs hover:text-white/60 transition-colors"
            >
              Skip this step
            </button>
          )}
        </div>

        <style jsx>{`
          @keyframes fadeScaleIn {
            from { 
              opacity: 0; 
              transform: scale(0.95); 
            }
            to { 
              opacity: 1; 
              transform: scale(1); 
            }
          }
        `}</style>
      </div>
    </div>
  );
}
