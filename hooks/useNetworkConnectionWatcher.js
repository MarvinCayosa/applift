/**
 * useNetworkConnectionWatcher Hook
 *
 * Reliable network status detection using three signals:
 *   1. Browser online/offline events (baseline, but slow/unreliable)
 *   2. Custom 'applift:fetch-failed' events dispatched on TypeError: Failed to fetch
 *   3. Periodic lightweight connectivity probe (every 4s when recording)
 *
 * This ensures we detect offline status within ~1-4 seconds maximum,
 * not the 10-60+ seconds that browser events alone can take.
 */

import { useEffect, useState, useRef } from 'react';

// ── Module-level offline flag (sync check from any module) ───────────
// After the first fetch failure, every subsequent service can instantly
// skip its own fetch instead of waiting for its own timeout.
let _isKnownOffline = false;

// ── Consecutive failure threshold ────────────────────────────────────
// A single request timeout does NOT mean we're offline. We require
// CONSECUTIVE_FAILURE_THRESHOLD failures before declaring offline.
const CONSECUTIVE_FAILURE_THRESHOLD = 2;
let _consecutiveFailures = 0;

/**
 * Synchronous check — returns true when we KNOW the network is down.
 * Import this from any service to short-circuit before doing a fetch.
 */
export function isNetworkOffline() {
  return _isKnownOffline;
}

// ── Global fetch-failure signal ──────────────────────────────────────
// Call this from any service when a fetch throws TypeError. The watcher
// only transitions to offline after CONSECUTIVE_FAILURE_THRESHOLD
// consecutive failures (not a single one).
export function signalFetchFailed() {
  _consecutiveFailures++;
  if (_consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
    _isKnownOffline = true;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('applift:fetch-failed'));
    }
  } else {
    console.log(`[NetworkWatcher] Fetch failed (${_consecutiveFailures}/${CONSECUTIVE_FAILURE_THRESHOLD}) — not offline yet`);
  }
}
export function signalFetchOk() {
  _consecutiveFailures = 0;
  _isKnownOffline = false;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('applift:fetch-ok'));
  }
}

/**
 * @param {object}   opts
 * @param {Function} [opts.onOffline]  – Called when we detect offline.
 * @param {Function} [opts.onOnline]   – Called when connectivity is restored.
 * @param {boolean}  [opts.activeProbe] – Enable periodic connectivity probe (default true).
 */
export function useNetworkConnectionWatcher({ onOffline, onOnline, activeProbe = true } = {}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Refs to always have latest callbacks without re-registering listeners
  const onOfflineRef = useRef(onOffline);
  const onOnlineRef = useRef(onOnline);
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { onOfflineRef.current = onOffline; });
  useEffect(() => { onOnlineRef.current = onOnline; });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const goOffline = () => {
      if (!isOnlineRef.current) return; // already offline
      console.log('[NetworkWatcher] ⚡ Offline detected');
      isOnlineRef.current = false;
      setIsOnline(false);
      onOfflineRef.current?.();
    };

    const goOnline = () => {
      if (isOnlineRef.current) return; // already online
      console.log('[NetworkWatcher] ✅ Online restored');
      isOnlineRef.current = true;
      setIsOnline(true);
      onOnlineRef.current?.();
    };

    // Signal 1: Browser events
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Signal 2: Custom events from failed/successful fetches
    window.addEventListener('applift:fetch-failed', goOffline);
    window.addEventListener('applift:fetch-ok', goOnline);

    // Signal 3: Active probe — lightweight HEAD request every 4s
    //   On localhost, probing '/' always succeeds, so we probe an
    //   external Google connectivity-check URL instead.
    let probeTimer = null;
    if (activeProbe) {
      // Use an external URL so localhost can't fool us
      const PROBE_URL = 'https://www.gstatic.com/generate_204';

      let probeFailures = 0;

      const probe = async () => {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 3000);
          await fetch(PROBE_URL, {
            method: 'HEAD',
            mode: 'no-cors',       // avoid CORS — opaque response is fine
            signal: ctrl.signal,
            cache: 'no-store',
          });
          clearTimeout(tid);
          // mode:'no-cors' gives resp.type === 'opaque' with status 0,
          // but it only resolves if the network round-trip succeeded.
          probeFailures = 0;
          _consecutiveFailures = 0; // reset module-level counter too
          goOnline();
        } catch (_) {
          probeFailures++;
          // Only declare offline after consecutive probe failures
          if (probeFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
            goOffline();
          }
        }
      };
      probeTimer = setInterval(probe, 4000);
    }

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('applift:fetch-failed', goOffline);
      window.removeEventListener('applift:fetch-ok', goOnline);
      if (probeTimer) clearInterval(probeTimer);
    };
  }, [activeProbe]);

  return { isOnline };
}
