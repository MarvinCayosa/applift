/**
 * CancelConfirmModal
 *
 * Confirmation dialog shown when the user requests to cancel a workout.
 * Always requires explicit confirmation before discarding.
 *
 * Actions:
 *   • Keep Workout  – dismiss modal, return to previous state.
 *   • Discard        – destructive; stops everything and navigates away.
 */

import { useEffect, useState } from 'react';

export default function CancelConfirmModal({ visible, onKeep, onDiscard }) {
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
      className={`fixed inset-0 z-[160] flex items-center justify-center transition-all duration-300 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
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
        {/* Icon & Text */}
        <div className="px-6 pt-8 pb-2 text-center">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-yellow-500/15 flex items-center justify-center">
            <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">Cancel Workout?</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            This will discard this session and it won&apos;t be saved.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pt-4 pb-6 flex flex-col gap-2.5">
          {/* Keep */}
          <button
            onClick={onKeep}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-[15px] transition-all active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
              boxShadow: '0 4px 16px rgba(147, 51, 234, 0.35)',
            }}
          >
            Keep Workout
          </button>

          {/* Discard */}
          <button
            onClick={onDiscard}
            className="w-full py-3.5 rounded-2xl text-red-400 font-semibold text-[15px] transition-all active:scale-[0.97]"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
