/**
 * SetBreakTimer
 * 
 * Compact one-line countdown timer shown at the top during set break.
 * Shows remaining time with progress bar and pause/skip controls.
 */

import { useState } from 'react';

export default function SetBreakTimer({
  timeRemaining,
  totalTime,
  isPaused,
  onTogglePause,
  onSkip,
  currentSet,
  totalSets
}) {
  const progress = totalTime > 0 ? ((totalTime - timeRemaining) / totalTime) * 100 : 0;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;

  return (
    <div className="w-full bg-black/90 backdrop-blur-md px-4 py-3 border-b border-white/[0.06]">
      <div className="flex items-center justify-between gap-4">
        {/* Set indicator */}
        <div className="flex items-center gap-2 min-w-fit">
          <span className="text-xs font-semibold text-purple-400/80 uppercase tracking-wider">
            Set {currentSet} of {totalSets}
          </span>
        </div>

        {/* Progress bar with larger time */}
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500/80 to-purple-400 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xl font-bold text-white/90 tabular-nums min-w-[60px] text-right">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Pause/Resume */}
          <button
            onClick={onTogglePause}
            className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
            aria-label={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? (
              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            )}
          </button>

          {/* Skip/End */}
          <button
            onClick={onSkip}
            className="px-3 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/20 text-purple-300/80 text-xs font-semibold hover:bg-purple-500/25 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
