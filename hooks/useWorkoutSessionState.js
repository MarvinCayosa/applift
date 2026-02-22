/**
 * useWorkoutSessionState — Single source-of-truth state machine
 *
 * Manages the high-level session state so that the workout monitor page
 * can react predictably to BLE drops, network loss, and cancel requests.
 *
 * States:
 *   IDLE                     – No workout is active.
 *   ACTIVE                   – Recording, BLE connected, network available.
 *   PAUSED_BLE_DISCONNECTED  – BLE dropped; session frozen, awaiting reconnect.
 *   ACTIVE_OFFLINE           – BLE connected but no internet; continue locally.
 *   CANCEL_CONFIRM           – User requested cancel; show confirmation.
 *   RESUMING_COUNTDOWN       – BLE reconnected; 3-2-1 countdown before ACTIVE.
 *
 * Transitions are explicit — only the `transition()` function can change
 * state, and it validates the from→to pair.
 */

import { useState, useCallback, useRef } from 'react';

/** Valid states. */
export const SESSION_STATES = Object.freeze({
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  PAUSED_BLE_DISCONNECTED: 'PAUSED_BLE_DISCONNECTED',
  ACTIVE_OFFLINE: 'ACTIVE_OFFLINE',
  CANCEL_CONFIRM: 'CANCEL_CONFIRM',
  RESUMING_COUNTDOWN: 'RESUMING_COUNTDOWN',
  WAITING_FOR_INTERNET: 'WAITING_FOR_INTERNET',
});

/** Allowed transitions:  { from: [to, ...] } */
const VALID_TRANSITIONS = {
  [SESSION_STATES.IDLE]: [SESSION_STATES.ACTIVE, SESSION_STATES.ACTIVE_OFFLINE],
  [SESSION_STATES.ACTIVE]: [
    SESSION_STATES.PAUSED_BLE_DISCONNECTED,
    SESSION_STATES.ACTIVE_OFFLINE,
    SESSION_STATES.CANCEL_CONFIRM,
    SESSION_STATES.WAITING_FOR_INTERNET,
    SESSION_STATES.IDLE, // workout complete
  ],
  [SESSION_STATES.PAUSED_BLE_DISCONNECTED]: [
    SESSION_STATES.RESUMING_COUNTDOWN,
    SESSION_STATES.CANCEL_CONFIRM,
    SESSION_STATES.IDLE, // cancel confirmed
  ],
  [SESSION_STATES.ACTIVE_OFFLINE]: [
    SESSION_STATES.ACTIVE,                   // network restored
    SESSION_STATES.PAUSED_BLE_DISCONNECTED,  // BLE also dropped
    SESSION_STATES.CANCEL_CONFIRM,
    SESSION_STATES.WAITING_FOR_INTERNET,     // workout ended while offline
    SESSION_STATES.IDLE,
  ],
  [SESSION_STATES.CANCEL_CONFIRM]: [
    SESSION_STATES.ACTIVE,                   // user chose "Keep workout"
    SESSION_STATES.ACTIVE_OFFLINE,           // keep workout while offline
    SESSION_STATES.PAUSED_BLE_DISCONNECTED,  // keep workout while BLE disconnected
    SESSION_STATES.WAITING_FOR_INTERNET,     // keep workout while waiting
    SESSION_STATES.IDLE,                     // discard confirmed
  ],
  [SESSION_STATES.RESUMING_COUNTDOWN]: [
    SESSION_STATES.ACTIVE,
    SESSION_STATES.ACTIVE_OFFLINE,           // network lost during countdown
    SESSION_STATES.PAUSED_BLE_DISCONNECTED,  // BLE dropped again during countdown
    SESSION_STATES.IDLE,
  ],
  [SESSION_STATES.WAITING_FOR_INTERNET]: [
    SESSION_STATES.ACTIVE,                   // internet restored → analyzing
    SESSION_STATES.CANCEL_CONFIRM,           // user wants to cancel
    SESSION_STATES.IDLE,                     // complete or discard
  ],
};

/**
 * @returns {{ sessionState, transition, isState, previousState }}
 */
export function useWorkoutSessionState() {
  const [sessionState, setSessionState] = useState(SESSION_STATES.IDLE);
  const previousStateRef = useRef(SESSION_STATES.IDLE);

  /**
   * Transition to a new state, validating the move.
   * Returns true if the transition was applied.
   */
  const transition = useCallback((to) => {
    setSessionState((current) => {
      const allowed = VALID_TRANSITIONS[current] || [];
      if (!allowed.includes(to)) {
        console.warn(`[SessionState] Invalid transition ${current} → ${to}`);
        return current; // no-op
      }
      console.log(`[SessionState] ${current} → ${to}`);
      previousStateRef.current = current;
      return to;
    });
    return true;
  }, []);

  /** Check if the session is in a specific state. */
  const isState = useCallback(
    (state) => sessionState === state,
    [sessionState]
  );

  return {
    sessionState,
    transition,
    isState,
    previousState: previousStateRef.current,
  };
}
