/**
 * AIInsightsCard
 * Displays an AI-generated session summary with gradient loading animation.
 * Used on the workout-finished page inline.
 *
 * Props:
 *   insights   – { summary, bullets, generatedAt } | null (shows loading when null & isLoading)
 *   isLoading  – boolean
 *   error      – string | null
 */

import { useState, useEffect } from 'react';

// ── Gradient shimmer keyframes (injected once) ────────────────────────
const SHIMMER_STYLE_ID = 'ai-insights-shimmer';

function injectShimmerStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SHIMMER_STYLE_ID;
  style.textContent = `
    @keyframes ai-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes ai-fade-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ai-shimmer-bar {
      background: linear-gradient(90deg, rgba(139,92,246,0.15) 25%, rgba(139,92,246,0.35) 50%, rgba(139,92,246,0.15) 75%);
      background-size: 200% 100%;
      animation: ai-shimmer 1.8s ease-in-out infinite;
      border-radius: 6px;
    }
    .ai-fade-in {
      animation: ai-fade-in 0.45s ease-out both;
    }
  `;
  document.head.appendChild(style);
}

// ── Skeleton loader ───────────────────────────────────────────────────
function InsightsSkeleton() {
  return (
    <div className="space-y-3">
      {/* Paragraph shimmer */}
      <div className="space-y-2">
        <div className="ai-shimmer-bar h-3.5 w-full" />
        <div className="ai-shimmer-bar h-3.5 w-[92%]" />
        <div className="ai-shimmer-bar h-3.5 w-[78%]" />
      </div>
      {/* Bullets shimmer */}
      <div className="space-y-2 pt-1">
        {[85, 72, 90, 65].map((w, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="ai-shimmer-bar h-2 w-2 rounded-full mt-1.5 flex-shrink-0" />
            <div className="ai-shimmer-bar h-3" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
export default function AIInsightsCard({ insights, isLoading, error }) {
  // Collapsed by default; auto-opens while loading so skeleton is visible,
  // then collapses once content arrives (user taps to expand).
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    injectShimmerStyle();
  }, []);

  // Open while loading, collapse when content ready
  useEffect(() => {
    if (isLoading) setIsOpen(true);
    else if (insights) setIsOpen(false);
  }, [isLoading, insights]);

  // Nothing to show and not loading/error
  if (!insights && !isLoading && !error) return null;

  const canToggle = !isLoading;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.06) 100%)',
        border: '1px solid rgba(139,92,246,0.15)',
      }}
    >
      {/* Header — tappable when not loading */}
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
        onClick={() => canToggle && setIsOpen(o => !o)}
        disabled={!canToggle}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)' }}
          >
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">AI Session Summary</h3>
            <p className="text-[10px] text-white/40">{isLoading ? 'Generating…' : 'Powered by Gemini'}</p>
          </div>
        </div>
        {/* Chevron — only when content is ready */}
        {canToggle && insights && !error && (
          <svg
            className="w-4 h-4 text-white/40 transition-transform duration-300 flex-shrink-0"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Body */}
      {isOpen && (
        <div className="px-4 pb-4">
          {isLoading ? (
            <InsightsSkeleton />
          ) : error ? (
            <p className="text-xs text-red-400/80">{error}</p>
          ) : insights ? (
            <div className="ai-fade-in space-y-3">
              <p className="text-[13px] leading-relaxed text-white/80">{insights.summary}</p>
              {insights.bullets?.length > 0 && (
                <ul className="space-y-1.5">
                  {insights.bullets.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-[6px] flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)' }}
                      />
                      <span className="text-[12px] leading-relaxed text-white/65">{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
