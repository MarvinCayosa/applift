/**
 * useBleConnectionWatcher Hook
 *
 * Monitors the BLE connection state using DIRECT gattserverdisconnected
 * events on the device object for **instant** detection — no React state
 * propagation delay.  Also watches the `connected` boolean as a fallback.
 *
 * Features:
 * - Instant disconnect detection via gattserverdisconnected event
 * - Automatic reconnection with exponential backoff
 * - Connection timeout (15 seconds)
 * - Configurable max retry attempts
 * - Manual reconnect override
 *
 * Does NOT own the reconnection logic — it delegates to BluetoothProvider's
 * `connectToDevice` / `scanDevices`.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const RECONNECT_TIMEOUT_MS = 15000; // 15 seconds
const MAX_AUTO_RECONNECT_ATTEMPTS = 5;
const MIN_BACKOFF_MS = 1000; // 1 second
const MAX_BACKOFF_MS = 10000; // 10 seconds

/**
 * @param {object}   opts
 * @param {boolean}  opts.connected        – Current BLE connection state.
 * @param {boolean}  opts.isRecording      – Whether a workout is actively recording.
 * @param {object}   opts.device           – Currently connected BLE device (from BluetoothProvider).
 * @param {Function} opts.connectToDevice  – BluetoothProvider's reconnect function.
 * @param {Function} opts.onDisconnect     – Called when BLE drops during recording.
 * @param {Function} opts.onReconnect      – Called when BLE reconnects after a drop.
 * @param {boolean}  opts.autoReconnect    – Enable automatic reconnection (default: true).
 */
export function useBleConnectionWatcher({
  connected,
  isRecording,
  device,
  connectToDevice,
  onDisconnect,
  onReconnect,
  autoReconnect = true,
}) {
  const wasRecordingOnDisconnect = useRef(false);
  const disconnectFired = useRef(false); // prevents double-fire
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const deviceRef = useRef(device);

  // Keep latest callback refs so the event listener always calls current version
  const onDisconnectRef = useRef(onDisconnect);
  const onReconnectRef = useRef(onReconnect);
  const isRecordingRef = useRef(isRecording);
  useEffect(() => { onDisconnectRef.current = onDisconnect; });
  useEffect(() => { onReconnectRef.current = onReconnect; });
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // Keep device ref current (only update when truthy — preserve for reconnect)
  useEffect(() => {
    if (device) deviceRef.current = device;
  }, [device]);

  // ── DIRECT gattserverdisconnected listener — fires INSTANTLY ──
  useEffect(() => {
    const dev = device;
    if (!dev) return;

    const handleGattDisconnect = () => {
      if (disconnectFired.current) return; // already handled
      if (!isRecordingRef.current) return; // not in a session

      disconnectFired.current = true;
      wasRecordingOnDisconnect.current = true;
      console.log('[BLEWatcher] ⚡ gattserverdisconnected — instant fire');
      setReconnectFailed(false);
      setReconnectAttempt(0);
      reconnectAttemptsRef.current = 0;
      onDisconnectRef.current?.();
    };

    dev.addEventListener('gattserverdisconnected', handleGattDisconnect);

    return () => {
      try {
        dev.removeEventListener('gattserverdisconnected', handleGattDisconnect);
      } catch (_) {}
    };
  }, [device]);

  // ── Fallback: watch React `connected` boolean for reconnect detection ──
  const prevConnected = useRef(connected);
  useEffect(() => {
    // Transition: connected → disconnected (fallback if direct event missed)
    if (prevConnected.current && !connected && isRecording && !disconnectFired.current) {
      console.log('[BLEWatcher] Disconnect detected via React state (fallback)');
      wasRecordingOnDisconnect.current = true;
      disconnectFired.current = true;
      setReconnectFailed(false);
      setReconnectAttempt(0);
      reconnectAttemptsRef.current = 0;
      onDisconnectRef.current?.();
    }

    // Transition: disconnected → connected (after a recording-time disconnect)
    if (!prevConnected.current && connected && wasRecordingOnDisconnect.current) {
      console.log('[BLEWatcher] ✅ Device reconnected after session disconnect');
      wasRecordingOnDisconnect.current = false;
      disconnectFired.current = false;
      setIsReconnecting(false);
      setReconnectFailed(false);
      setReconnectAttempt(0);
      reconnectAttemptsRef.current = 0;
      
      // Clear any pending reconnect timer
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      
      onReconnectRef.current?.();
    }

    prevConnected.current = connected;
  }, [connected, isRecording]);

  // ── Attempt reconnection with timeout ──
  const attemptReconnect = useCallback(async () => {
    const dev = deviceRef.current;
    if (!dev) {
      console.warn('[BLEWatcher] No device reference for reconnect');
      setReconnectFailed(true);
      return false;
    }

    setIsReconnecting(true);
    setReconnectFailed(false);

    try {
      console.log(`[BLEWatcher] 🔄 Reconnect attempt ${reconnectAttemptsRef.current + 1}/${MAX_AUTO_RECONNECT_ATTEMPTS}`);
      
      // Race between connection and timeout
      await Promise.race([
        connectToDevice(dev),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), RECONNECT_TIMEOUT_MS)
        )
      ]);
      
      // Success - the connected state change will trigger the useEffect above
      console.log('[BLEWatcher] ✅ Reconnect successful');
      return true;
    } catch (err) {
      console.error('[BLEWatcher] ❌ Reconnect attempt failed:', err.message);
      setIsReconnecting(false);
      setReconnectFailed(true);
      return false;
    }
  }, [connectToDevice]);

  // ── Automatic reconnection with exponential backoff ──
  const autoReconnectWithBackoff = useCallback(async () => {
    if (!autoReconnect) {
      console.log('[BLEWatcher] Auto-reconnect disabled');
      return;
    }
    
    if (reconnectAttemptsRef.current >= MAX_AUTO_RECONNECT_ATTEMPTS) {
      console.log('[BLEWatcher] ⚠️ Max auto-reconnect attempts reached');
      setReconnectFailed(true);
      setIsReconnecting(false);
      return;
    }

    reconnectAttemptsRef.current++;
    setReconnectAttempt(reconnectAttemptsRef.current);
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 10s (capped)
    const delay = Math.min(
      MIN_BACKOFF_MS * Math.pow(2, reconnectAttemptsRef.current - 1),
      MAX_BACKOFF_MS
    );
    
    console.log(`[BLEWatcher] 🔄 Auto-reconnect attempt ${reconnectAttemptsRef.current}/${MAX_AUTO_RECONNECT_ATTEMPTS} in ${delay}ms`);

    reconnectTimerRef.current = setTimeout(async () => {
      const success = await attemptReconnect();
      
      if (!success && reconnectAttemptsRef.current < MAX_AUTO_RECONNECT_ATTEMPTS) {
        // Retry with exponential backoff
        autoReconnectWithBackoff();
      } else if (!success) {
        console.log('[BLEWatcher] ❌ All auto-reconnect attempts failed');
        setReconnectFailed(true);
        setIsReconnecting(false);
      }
      // If success, the connected state change will handle cleanup
    }, delay);
  }, [autoReconnect, attemptReconnect]);

  // ── Trigger auto-reconnect on disconnect ──
  useEffect(() => {
    if (disconnectFired.current && wasRecordingOnDisconnect.current && autoReconnect) {
      console.log('[BLEWatcher] 🚀 Starting auto-reconnect sequence');
      autoReconnectWithBackoff();
    }
    
    // Cleanup on unmount
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [autoReconnect, autoReconnectWithBackoff]);

  // ── Manual reconnect (resets attempt counter) ──
  const manualReconnect = useCallback(async () => {
    // Clear any pending auto-reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    
    // Reset attempt counter for manual retry
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    
    return await attemptReconnect();
  }, [attemptReconnect]);

  // ── Cancel auto-reconnect ──
  const cancelAutoReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    setReconnectAttempt(0);
    setIsReconnecting(false);
    console.log('[BLEWatcher] Auto-reconnect cancelled by user');
  }, []);

  return {
    /** Whether a reconnect attempt is in progress */
    isReconnecting,
    /** Whether the last reconnect attempt failed */
    reconnectFailed,
    /** Current reconnect attempt number (0 if not reconnecting) */
    reconnectAttempt,
    /** Max reconnect attempts allowed */
    maxAttempts: MAX_AUTO_RECONNECT_ATTEMPTS,
    /** Trigger a manual reconnection attempt (resets counter) */
    attemptReconnect: manualReconnect,
    /** Cancel ongoing auto-reconnect sequence */
    cancelAutoReconnect,
  };
}
