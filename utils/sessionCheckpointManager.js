/**
 * Session Checkpoint Manager
 *
 * Maintains deterministic checkpoints during a workout session so that
 * after a BLE disconnect/reconnect the session can be rolled back to
 * the end of the last fully completed rep.
 *
 * Checkpoint structure:
 *   {
 *     repCount,        // total completed reps in the current set
 *     sampleIndex,     // index into the RepCounter sample buffer
 *     elapsedTime,     // seconds elapsed for the current set
 *     fullChartLen,    // length of the full chart arrays at checkpoint time
 *     timestamp,       // Date.now() when checkpoint was written
 *   }
 *
 * Rules:
 * - A checkpoint is written after every fully completed rep.
 * - A checkpoint is written at set boundaries (set end).
 * - On rollback, all samples, reps, and chart data AFTER the checkpoint
 *   are discarded.  The session resumes cleanly from that point.
 */

export class SessionCheckpointManager {
  constructor() {
    /** @type {object|null} Latest checkpoint */
    this._checkpoint = null;
    /** @type {object|null} Backup of previous checkpoint (safety net) */
    this._prevCheckpoint = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Save a checkpoint after a completed rep or set end.
   *
   * @param {object} state
   * @param {number} state.repCount        – Completed reps in the current set.
   * @param {number} state.sampleIndex     – RepCounter sample buffer length.
   * @param {number} state.elapsedTime     – Timer seconds for the current set.
   * @param {number} state.fullChartLen    – Length of full chart data arrays.
   * @param {number} [state.lastRepCountRef] – Value of lastRepCountRef for proper resume.
   * @param {number} [state.lastCompletedRepEndTimestamp]   – End timestamp of the last completed rep.
   * @param {number} [state.lastCompletedRepEndSampleIndex] – End sample index of the last completed rep.
   */
  saveCheckpoint(state) {
    this._prevCheckpoint = this._checkpoint;
    this._checkpoint = {
      ...state,
      timestamp: Date.now(),
    };
    console.log('[Checkpoint] Saved:', this._checkpoint);
  }

  /**
   * Retrieve the latest checkpoint.
   * @returns {object|null}
   */
  getCheckpoint() {
    return this._checkpoint;
  }

  /**
   * Roll back session buffers to the latest checkpoint.
   *
   * This function mutates the provided refs/states in-place to truncate
   * everything recorded after the checkpoint.
   *
   * @param {object}   ctx
   * @param {object}   ctx.repCounterRef   – Ref to the RepCounter instance.
   * @param {object}   ctx.fullTimeData    – Ref to full time data array.
   * @param {object}   ctx.fullRawAccel    – Ref to full raw accel data array.
   * @param {object}   ctx.fullFilteredAccel – Ref to full filtered accel data array.
   * @param {object}   ctx.rawDataLog      – Ref to raw data log array.
   * @param {Function} ctx.setRepStats     – State setter for rep stats.
   * @param {Function} ctx.setElapsedTime  – State setter for elapsed time.
   * @param {Function} ctx.setTimeData     – State setter for display-time array.
   * @param {Function} ctx.setRawAccelData – State setter for display raw accel.
   * @param {Function} ctx.setFilteredAccelData – State setter for display filtered accel.
   * @param {object}   ctx.lastRepCountRef – Ref that tracks last known rep count.
   *
   * @returns {boolean} true if rollback was applied, false if no checkpoint.
   */
  rollback(ctx) {
    const cp = this._checkpoint;
    if (!cp) {
      console.warn('[Checkpoint] No checkpoint to roll back to');
      return false;
    }

    console.log('[Checkpoint] Rolling back to:', cp);

    const rc = ctx.repCounterRef.current;

    // 1. Truncate RepCounter's internal buffers
    //    RepCounter stores samples in allSamples and reps in reps[]
    const exportedData = rc.exportData();

    // Keep only reps up to the checkpoint rep count
    if (exportedData.reps.length > cp.repCount) {
      // We need to rebuild the RepCounter state.
      // The simplest deterministic approach: keep samples up to sampleIndex.
      rc.truncateTo(cp.repCount, cp.sampleIndex);
    }

    // 2. Truncate full chart arrays
    if (ctx.fullTimeData.current.length > cp.fullChartLen) {
      ctx.fullTimeData.current.length = cp.fullChartLen;
    }
    if (ctx.fullRawAccel.current.length > cp.fullChartLen) {
      ctx.fullRawAccel.current.length = cp.fullChartLen;
    }
    if (ctx.fullFilteredAccel.current.length > cp.fullChartLen) {
      ctx.fullFilteredAccel.current.length = cp.fullChartLen;
    }

    // 3. Truncate raw data log
    if (ctx.rawDataLog.current.length > cp.sampleIndex) {
      ctx.rawDataLog.current.length = cp.sampleIndex;
    }

    // 4. Update React state
    ctx.setRepStats(rc.getStats());
    ctx.setElapsedTime(cp.elapsedTime);
    ctx.lastRepCountRef.current = cp.repCount;

    // 5. Rebuild display chart data from truncated full arrays
    const MAX_CHART = 100;
    ctx.setTimeData(ctx.fullTimeData.current.slice(-MAX_CHART));
    ctx.setRawAccelData(ctx.fullRawAccel.current.slice(-MAX_CHART));
    ctx.setFilteredAccelData(ctx.fullFilteredAccel.current.slice(-MAX_CHART));

    console.log('[Checkpoint] Rollback complete — repCount:', cp.repCount);
    return true;
  }

  /**
   * Clear all checkpoints (e.g. on workout cancel or new set).
   */
  clear() {
    this._checkpoint = null;
    this._prevCheckpoint = null;
  }
}
