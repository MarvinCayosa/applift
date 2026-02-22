/**
 * useBleConnectionWatcher Hook
 *
 * Monitors the BLE connection state using DIRECT gattserverdisconnected
 * events on the device object for **instant** detection — no React state
 * propagation delay.  Also watches the `connected` boolean as a fallback.
 *
 * Does NOT own the reconnection logic — it delegates to BluetoothProvider's
 * `connectToDevice` / `scanDevices`.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * @param {object}   opts
 * @param {boolean}  opts.connected        – Current BLE connection state.
 * @param {boolean}  opts.isRecording      – Whether a workout is actively recording.
 * @param {object}   opts.device           – Currently connected BLE device (from BluetoothProvider).
 * @param {Function} opts.connectToDevice  – BluetoothProvider's reconnect function.
 * @param {Function} opts.onDisconnect     – Called when BLE drops during recording.
 * @param {Function} opts.onReconnect      – Called when BLE reconnects after a drop.
 */
export function useBleConnectionWatcher({
  connected,
  isRecording,
  device,
  connectToDevice,
  onDisconnect,
  onReconnect,
}) {
  const wasRecordingOnDisconnect = useRef(false);
  const disconnectFired = useRef(false); // prevents double-fire
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectFailed, setReconnectFailed] = useState(false);
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
      onDisconnectRef.current?.();
    }

    // Transition: disconnected → connected (after a recording-time disconnect)
    if (!prevConnected.current && connected && wasRecordingOnDisconnect.current) {
      console.log('[BLEWatcher] Device reconnected after session disconnect');
      wasRecordingOnDisconnect.current = false;
      disconnectFired.current = false;
      setIsReconnecting(false);
      setReconnectFailed(false);
      onReconnectRef.current?.();
    }

    prevConnected.current = connected;
  }, [connected, isRecording]);

  // ── Attempt reconnection ──
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
      await connectToDevice(dev);
      // The `connected` state change will trigger the useEffect above
      return true;
    } catch (err) {
      console.error('[BLEWatcher] Reconnect attempt failed:', err);
      setIsReconnecting(false);
      setReconnectFailed(true);
      return false;
    }
  }, [connectToDevice]);

  return {
    /** Whether a reconnect attempt is in progress */
    isReconnecting,
    /** Whether the last reconnect attempt failed */
    reconnectFailed,
    /** Trigger a reconnection attempt */
    attemptReconnect,
  };
}
