/**
 * AIReasoningPanel — "AI Insight"
 * 
 * Shows contextual AI reasoning: why these values were chosen,
 * safety notes, guideline reference, and next steps.
 * Designed for the dark theme with violet accents.
 */

import { useState } from 'react';

export default function AIReasoningPanel({ reasoning, recommendation, isFromCache, regenCount, maxRegen, hasPastSessions }) {
  const [expanded, setExpanded] = useState(false);

  if (!reasoning) return null;

  const restDays = recommendation?.recommendedRestDays;

  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 overflow-hidden transition-all duration-300">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {/* Gemini AI icon */}
          <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1L21 6V18L12 23L3 18V6L12 1Z M12 3.5L5.5 7V17L12 20.5L18.5 17V7L12 3.5Z M12 6L18 9.5V14.5L12 18L6 14.5V9.5L12 6Z"/>
            </svg>
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-white/90">AI Insight</p>
            <p className="text-[10px] text-white/40">
              {isFromCache ? 'Cached' : 'Generated'}{hasPastSessions ? ' · Based on history' : ' · First time'}
              {restDays && ` · Rest ${restDays}d`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Regen badge — only show if regenerated at least once */}
          {regenCount > 0 && (
            <span className="text-[10px] text-white/30 tabular-nums">
              {regenCount}/{maxRegen}
            </span>
          )}
          {/* Chevron */}
          <svg 
            className={`w-4 h-4 text-white/40 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} 
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expandable content */}
      <div 
        className={`transition-all duration-300 ease-in-out overflow-hidden ${expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-4 pb-4 space-y-3 border-t border-white/5">

          {/* Rationale — why these values were chosen */}
          {reasoning.rationale && (
            <div className="pt-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3 h-3 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
                </svg>
                <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">Why</p>
              </div>
              <p className="text-xs text-white/70 leading-relaxed text-justify">{reasoning.rationale}</p>
            </div>
          )}

          {/* Safety Note */}
          {reasoning.safetyJustification && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/>
                </svg>
                <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wide">Safety</p>
              </div>
              <p className="text-xs text-white/60 leading-relaxed text-justify">{reasoning.safetyJustification}</p>
            </div>
          )}

          {/* Recommended Rest Days */}
          {restDays && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2z"/>
                </svg>
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Rest Interval</p>
              </div>
              <p className="text-xs text-white/60 leading-relaxed text-justify">
                Wait {restDays} day{restDays > 1 ? 's' : ''} before repeating this exercise for optimal recovery.
              </p>
            </div>
          )}

          {/* Next Steps */}
          {reasoning.progressionNotes && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z"/>
                </svg>
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Next</p>
              </div>
              <p className="text-xs text-white/60 leading-relaxed text-justify">{reasoning.progressionNotes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
