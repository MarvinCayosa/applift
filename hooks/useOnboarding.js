import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firestore';
import { useAuth } from '../context/AuthContext';

const LOCALSTORAGE_KEY = 'applift:onboarding';

/**
 * Default onboarding state shape
 */
const DEFAULT_ONBOARDING = {
  welcomeShown: false,
  workoutTutorialShown: false,
  dontShowAgain: false,
  completedAt: null,
};

/**
 * Write onboarding state to localStorage (keyed per user)
 */
function writeLocal(uid, state) {
  if (typeof window === 'undefined' || !uid) return;
  try {
    localStorage.setItem(`${LOCALSTORAGE_KEY}:${uid}`, JSON.stringify(state));
  } catch {
    // silent
  }
}

/**
 * Read onboarding state from localStorage for a specific user
 */
function readLocalForUser(uid) {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    const raw = localStorage.getItem(`${LOCALSTORAGE_KEY}:${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Custom hook for managing per-user onboarding state.
 * Persists to Firestore (users/{uid}/meta/onboarding) with localStorage cache.
 */
export function useOnboarding() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [state, setState] = useState(DEFAULT_ONBOARDING);
  const [loaded, setLoaded] = useState(false);

  // ── Fetch from Firestore on uid change ────────────────────────
  useEffect(() => {
    // No user → reset to defaults so stale state never leaks across accounts
    if (!uid) {
      setState(DEFAULT_ONBOARDING);
      setLoaded(false);
      return;
    }

    // Start from the per-user localStorage cache (fast) while Firestore loads
    const cached = readLocalForUser(uid);
    if (cached) setState(cached);

    let cancelled = false;

    (async () => {
      try {
        const ref = doc(db, 'users', uid, 'meta', 'onboarding');
        const snap = await getDoc(ref);
        if (cancelled) return;

        if (snap.exists()) {
          const data = { ...DEFAULT_ONBOARDING, ...snap.data() };
          setState(data);
          writeLocal(uid, data);
        } else {
          // First time — seed document
          await setDoc(ref, { ...DEFAULT_ONBOARDING, createdAt: serverTimestamp() });
          setState(DEFAULT_ONBOARDING);
          writeLocal(uid, DEFAULT_ONBOARDING);
        }
      } catch (err) {
        console.warn('[useOnboarding] Firestore fetch failed, using localStorage fallback:', err);
        const local = readLocalForUser(uid);
        if (!cancelled && local) setState(local);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [uid]);

  // ── Persist helper ────────────────────────────────────────────
  const persist = useCallback(async (patch) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      writeLocal(uid, next);
      return next;
    });

    if (!uid) return;
    try {
      const ref = doc(db, 'users', uid, 'meta', 'onboarding');
      await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
    } catch (err) {
      // If the doc doesn't exist yet (race), create it
      try {
        const ref = doc(db, 'users', uid, 'meta', 'onboarding');
        await setDoc(ref, { ...DEFAULT_ONBOARDING, ...patch, updatedAt: serverTimestamp() }, { merge: true });
      } catch {
        console.warn('[useOnboarding] Failed to persist onboarding state:', err);
      }
    }
  }, [uid]);

  // ── Public actions ────────────────────────────────────────────
  const markWelcomeShown = useCallback(() => persist({ welcomeShown: true }), [persist]);

  const markWorkoutTutorialShown = useCallback(
    () => persist({ workoutTutorialShown: true }),
    [persist],
  );

  const markDontShowAgain = useCallback(
    () => persist({ dontShowAgain: true, completedAt: new Date().toISOString() }),
    [persist],
  );

  const markCompleted = useCallback(
    () => persist({ workoutTutorialShown: true, completedAt: new Date().toISOString() }),
    [persist],
  );

  // ── Derived booleans ──────────────────────────────────────────
  const shouldShowWelcome = useMemo(
    () => loaded && !state.welcomeShown && !state.dontShowAgain,
    [loaded, state.welcomeShown, state.dontShowAgain],
  );

  const shouldShowWorkoutTutorial = useMemo(
    () => loaded && !state.dontShowAgain,
    [loaded, state.dontShowAgain],
  );

  return {
    onboarding: state,
    onboardingLoaded: loaded,
    shouldShowWelcome,
    shouldShowWorkoutTutorial,
    markWelcomeShown,
    markWorkoutTutorialShown,
    markDontShowAgain,
    markCompleted,
  };
}
