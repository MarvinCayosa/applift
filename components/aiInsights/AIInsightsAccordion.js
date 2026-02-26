/**
 * AIInsightsAccordion
 * Collapsible accordion displaying cached AI session insights.
 * Used on the historical session page (session.js).
 *
 * Props:
 *   insights – { summary, bullets, generatedAt } | null
 */

import { useState, useEffect, useRef } from 'react';

// Inject animation styles once
const STYLE_ID = 'ai-accordion-style';
function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    @keyframes ai-acc-open {
      from { opacity: 0; max-height: 0; }
      to   { opacity: 1; max-height: 500px; }
    }
    .ai-acc-body {
      overflow: hidden;
      animation: ai-acc-open 0.35s ease-out forwards;
    }
  `;
  document.head.appendChild(s);
}

export default function AIInsightsAccordion({ insights }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { injectStyles(); }, []);

  if (!insights?.summary) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.06) 100%)',
        border: '1px solid rgba(139,92,246,0.15)',
      }}
    >
      {/* Accordion header */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-2.5">
          {/* AI sparkle icon */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #8B5CF6, #6366F1)' }}
          >
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <div className="text-left">
            <span className="text-sm font-bold text-white leading-tight">AI Session Summary</span>
            <p className="text-[10px] text-white/40">Powered by Gemini</p>
          </div>
        </div>

        {/* Chevron */}
        <svg
          className="w-4 h-4 text-white/40 transition-transform duration-300"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Accordion body */}
      {isOpen && (
        <div className="ai-acc-body px-4 pb-4">
          {/* Summary */}
          <p className="text-[13px] leading-relaxed text-white/80">{insights.summary}</p>

          {/* Bullets */}
          {insights.bullets?.length > 0 && (
            <ul className="space-y-1.5 mt-3">
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
      )}
    </div>
  );
}
