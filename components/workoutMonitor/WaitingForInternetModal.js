/**
 * WaitingForInternetModal
 *
 * Shown at workout completion when internet is offline or when there are
 * pending set classification uploads in the IndexedDB queue.
 *
 * Blocks the user from continuing to the analyzing/results screen until
 * connectivity is restored and all queued sets are uploaded.
 *
 * Actions:
 *   • Keep Waiting   – dismiss modal, stay on monitor (workout data preserved)
 *   • Cancel Workout – destructive; discards everything
 */

import { useEffect, useState } from 'react';

export default function WaitingForInternetModal({
  visible,
  pendingCount = 0,
  onKeepWaiting,
  onCancel,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[170] flex items-center justify-center transition-all duration-300 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Card */}
      <div
        className={`w-[calc(100%-48px)] max-w-sm rounded-3xl overflow-hidden transition-all duration-400 ${
          mounted ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        }`}
        style={{
          background: 'rgba(30, 30, 35, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Icon + Title */}
        <div className="px-6 pt-8 pb-2 text-center">
          {/* Wi-Fi off icon */}
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-yellow-500/15 flex items-center justify-center">
            <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
              {/* Strikethrough line */}
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" strokeWidth={2} />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            Waiting for Internet
          </h2>
          <p className="text-sm text-white/50 leading-relaxed">
            Your workout is complete but cannot be analyzed without an internet connection.
            {pendingCount > 0 && (
              <span className="block mt-1.5 text-yellow-400/80">
                {pendingCount} set{pendingCount !== 1 ? 's' : ''} pending upload.
              </span>
            )}
          </p>
        </div>

        {/* Pulsing waiting indicator */}
        <div className="px-6 py-4 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-sm text-white/40 font-medium">
            Waiting for connection…
          </span>
        </div>

        {/* Actions */}
        <div className="px-6 pt-2 pb-6 flex flex-col gap-2.5">
          {/* Keep Waiting */}
          <button
            onClick={onKeepWaiting}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-[15px] transition-all active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
              boxShadow: '0 4px 16px rgba(147, 51, 234, 0.35)',
            }}
          >
            Keep Waiting
          </button>

          {/* Cancel Workout (destructive) */}
          <button
            onClick={onCancel}
            className="w-full py-3.5 rounded-2xl text-red-400 font-semibold text-[15px] transition-all active:scale-[0.97]"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            Cancel Workout
          </button>
        </div>
      </div>
    </div>
  );
}
