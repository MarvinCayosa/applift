/**
 * DeviceDisconnectedModal
 *
 * Full-screen dim/blur overlay with a centered card shown when the BLE
 * device disconnects during an active workout session.
 *
 * Features:
 * - Shows reconnection status with attempt counter
 * - Automatic reconnection with exponential backoff
 * - Manual reconnect button
 * - Cancel auto-reconnect option
 * - Cancel workout (destructive action)
 *
 * Actions:
 *   • Reconnect  – triggers manual BLE reconnection; shows spinner while in progress.
 *   • Cancel Auto-Reconnect – stops automatic reconnection attempts
 *   • Cancel Workout – destructive; opens CancelConfirmModal.
 */

import { useEffect, useState } from 'react';

export default function DeviceDisconnectedModal({
  visible,
  isReconnecting,
  reconnectFailed,
  reconnectAttempt = 0,
  maxAttempts = 5,
  currentRep = 0,
  plannedReps = 0,
  onReconnect,
  onCancelAutoReconnect,
  onCancel,
}) {
  const [mounted, setMounted] = useState(false);

  // Animate in
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [visible]);

  if (!visible) return null;

  const isAutoReconnecting = isReconnecting && reconnectAttempt > 0;
  const hasReachedMaxAttempts = reconnectAttempt >= maxAttempts;
  const showRepProgress = currentRep > 0 && plannedReps > 0;

  return (
    <div
      className={`fixed inset-0 z-[150] flex items-center justify-center transition-all duration-300 ${
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
          {/* BLE disconnect icon */}
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">Device Disconnected</h2>
          
          {/* Rep progress */}
          {showRepProgress && (
            <div className="mb-3 px-4 py-2 rounded-xl inline-block" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
              <span className="text-lg font-bold text-white">{currentRep}</span>
              <span className="text-sm text-white/40 mx-1">/</span>
              <span className="text-base font-semibold text-white/60">{plannedReps}</span>
              <span className="text-xs text-white/40 ml-2">reps completed</span>
            </div>
          )}
          
          <p className="text-sm text-white/50 leading-relaxed">
            {isAutoReconnecting 
              ? 'Attempting to reconnect automatically...' 
              : 'Your session is paused. Reconnect your device to continue.'}
          </p>
          
          {/* Data quality explanation */}
          {showRepProgress && (
            <p className="text-xs text-white/30 leading-relaxed mt-3 px-2">
              Any partial rep data has been discarded to maintain data quality. You'll continue from rep {currentRep} after reconnecting.
            </p>
          )}
        </div>

        {/* Status indicator */}
        {isReconnecting && (
          <div className="px-6 py-3 flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
            <span className="text-sm text-purple-400 font-medium">
              {isAutoReconnecting 
                ? `Auto-reconnecting (${reconnectAttempt}/${maxAttempts})…` 
                : 'Reconnecting…'}
            </span>
          </div>
        )}

        {reconnectFailed && !isReconnecting && (
          <div className="px-6 py-3 flex flex-col items-center justify-center gap-1">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-yellow-400 font-medium">
                {hasReachedMaxAttempts ? 'Max attempts reached' : 'Reconnection failed'}
              </span>
            </div>
            {hasReachedMaxAttempts && (
              <p className="text-xs text-white/40 text-center mt-1">
                Please check your device and try again
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="px-6 pt-3 pb-6 flex flex-col gap-2.5">
          {/* Reconnect / Retry */}
          <button
            onClick={onReconnect}
            disabled={isReconnecting}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-[15px] transition-all active:scale-[0.97] disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #c084fc 0%, #a855f7 50%, #9333ea 100%)',
              boxShadow: '0 4px 16px rgba(147, 51, 234, 0.35)',
            }}
          >
            {isReconnecting 
              ? (isAutoReconnecting ? 'Reconnecting…' : 'Connecting…')
              : (reconnectFailed ? 'Retry Reconnect' : 'Reconnect')}
          </button>

          {/* Cancel Auto-Reconnect (only show during auto-reconnect) */}
          {isAutoReconnecting && onCancelAutoReconnect && (
            <button
              onClick={onCancelAutoReconnect}
              className="w-full py-3.5 rounded-2xl text-yellow-400 font-semibold text-[15px] transition-all active:scale-[0.97]"
              style={{
                background: 'rgba(234, 179, 8, 0.08)',
                border: '1px solid rgba(234, 179, 8, 0.2)',
              }}
            >
              Cancel Auto-Reconnect
            </button>
          )}

          {/* Cancel workout */}
          <button
            onClick={onCancel}
            disabled={isReconnecting}
            className="w-full py-3.5 rounded-2xl text-red-400 font-semibold text-[15px] transition-all active:scale-[0.97] disabled:opacity-30"
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
