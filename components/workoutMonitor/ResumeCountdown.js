/**
 * ResumeCountdown
 *
 * Full-screen 3-2-1 countdown overlay shown after BLE reconnects
 * and the session checkpoint has been rolled back.
 *
 * Matches the existing countdown visual style from workout-monitor.js
 * but is rendered as a standalone component for clean composition.
 */

import { useEffect, useState, useRef } from 'react';

/**
 * @param {object}   props
 * @param {boolean}  props.active   – Whether the countdown is running.
 * @param {Function} props.onDone   – Called when countdown reaches 0.
 */
export default function ResumeCountdown({ active, onDone }) {
  const [value, setValue] = useState(3);
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      setFadeOut(false);
      return;
    }

    setVisible(true);
    setFadeOut(false);
    setValue(3);

    let current = 3;

    const tick = setInterval(() => {
      current -= 1;

      if (current > 0) {
        setValue(current);
      } else if (current === 0) {
        setValue('GO!');
      } else {
        // current < 0 → fade out and finish
        clearInterval(tick);
        setFadeOut(true);
        setTimeout(() => {
          setVisible(false);
          onDoneRef.current?.();
        }, 400);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[140] flex items-center justify-center transition-opacity duration-400 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        background: 'rgba(0, 0, 0, 0.9)',
      }}
    >
      {/* Subtle radial glow behind the number */}
      <div
        className="absolute rounded-full"
        style={{
          width: '280px',
          height: '280px',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%)',
        }}
      />

      <div className="text-center">
        <div className="text-sm text-white/40 mb-4 font-medium tracking-wide uppercase">
          Resuming Session
        </div>
        <div
          className="text-8xl font-bold text-white animate-pulse"
          key={value} // re-mount for animation
        >
          {value}
        </div>
      </div>
    </div>
  );
}
