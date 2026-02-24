/**
 * AIReasoningPanel
 * 
 * Expandable panel that shows the AI's safety justification,
 * guideline reference, and progression notes.
 * Matches the app's dark theme with violet accents.
 */

import { useState } from 'react';

export default function AIReasoningPanel({ reasoning, isFromCache, regenCount, maxRegen }) {
  const [expanded, setExpanded] = useState(false);

  if (!reasoning) return null;

  return (
    <div className="rounded-2xl bg-white/[0.06] border border-white/10 overflow-hidden transition-all duration-300">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {/* AI sparkle icon */}
          <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-violet-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-white/90">AI Coaching Insight</p>
            {isFromCache && (
              <p className="text-[10px] text-white/40">Cached recommendation</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Regen badge */}
          <span className="text-[10px] text-white/30 tabular-nums">
            {regenCount}/{maxRegen}
          </span>
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
        className={`transition-all duration-300 ease-in-out overflow-hidden ${expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-4 pb-4 space-y-3 border-t border-white/5">
          {/* Safety Justification */}
          {reasoning.safetyJustification && (
            <div className="pt-3">
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/>
                </svg>
                <p className="text-[10px] font-semibold text-green-400 uppercase tracking-wide">Safety</p>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">{reasoning.safetyJustification}</p>
            </div>
          )}

          {/* Guideline Reference */}
          {reasoning.guidelineReference && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14v2a6 6 0 0 0 6-6h-2a4 4 0 0 1-4 4zm0-12C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
                </svg>
                <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Guideline</p>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">{reasoning.guidelineReference}</p>
            </div>
          )}

          {/* Progression Notes */}
          {reasoning.progressionNotes && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z"/>
                </svg>
                <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Coach Note</p>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">{reasoning.progressionNotes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
