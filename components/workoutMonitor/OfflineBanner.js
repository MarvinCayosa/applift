/**
 * OfflineBanner
 *
 * Persistent, non-blocking banner shown at the top of the workout monitor
 * when the internet is unavailable but BLE is still connected.
 *
 * Slides in smoothly from the top and includes a subtle status indicator.
 * Does NOT block workout interactions.
 */

import { useEffect, useState } from 'react';

export default function OfflineBanner({ visible, onCancel }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      // Small delay so the slide animation plays
      const t = setTimeout(() => setShow(true), 50);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [visible]);

  if (!visible && !show) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[120] transition-transform duration-500 ease-out ${
        show ? 'translate-y-0' : '-translate-y-full'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className="mx-3 mt-2 rounded-2xl px-4 py-3 flex items-center gap-3"
        style={{
          background: 'rgba(30, 30, 35, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Pulsing dot */}
        <div className="relative flex-shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-yellow-400 animate-ping opacity-60" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">No Internet Connection</p>
          <p className="text-[11px] text-white/40 leading-tight mt-0.5">
            Offline mode. Waiting to upload set analysis.
          </p>
        </div>

        {/* Cancel button (optional) */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex-shrink-0 text-[11px] text-red-400/80 font-medium px-2.5 py-1.5 rounded-lg transition-colors active:bg-red-500/10"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
