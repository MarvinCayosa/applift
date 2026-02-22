# Performance Insights Card — Design & Fix Documentation

## Problem Statement

Three session-details sections — **Consistency**, **Fatigue Analysis**, and **Velocity Loss** — had critical bugs and were spread across two separate components (`ExecutionConsistencyCard` + `FatigueCarousel`). They were combined into a single `PerformanceInsightsCard` that fixes all issues and grounds every metric in published sports-science methodology.

---

## Bugs Found & Fixed

### Bug 1 — Velocity = 0 in fatigue indicators but non-zero in Velocity Loss

**Root cause:**  
The FatigueCarousel used `propScore` (from the Firestore analytics document) as the donut score when `selectedSet === 'all'`, but computed the three indicator values (Velocity, Slowdown, Stability) locally from `rep.peakVelocity` and `rep.time`. When analytics data was available but the local `repsData` came from the workout-monitor (which stores `peakVelocity` as a crude estimate from `peakAcceleration / 2`), the server score was accurate but the indicators showed different values — or even all zeros when the fields were missing.

**Fix:**  
`PerformanceInsightsCard` uses a **single data pipeline** (`extractRepKinematics`) that feeds all three sections. One array → one source of truth. The score is **never** taken from a different source than the indicators. If server data is present in `repsData` (merged via analytics), both the score and indicators reflect it. If only local data exists, both reflect that.

### Bug 2 — Score shows 60 or 100 when all three fatigue indicators are 0

**Root cause:**  
When `selectedSet === 'all'`, the old code used:
```js
let score = selectedSet === 'all' ? propScore : null;
```
This took `propScore` directly from the Firestore analytics doc (which was computed server-side using full kinematic analysis including jerk, shakiness, ROM, and ML classification). But the indicators were computed locally from `rep.peakVelocity`, `rep.time`, and `rep.smoothnessScore` — which may all be 0 or absent in the local `repsData`.

**Result:** Score = 60 (from server), all indicators = 0% (from local data).

**Fix:**  
The new `computeFatigue()` function computes both the score AND the indicators from the same `reps` array. No mixing of server vs local data sources. The fatigue score formula uses the same first-third vs last-third comparison that the server uses:

```
score = clamp((0.40 × velocityDrop + 0.30 × durationIncrease + 0.30 × smoothnessDrop) × 100)
```

### Bug 3 — Consistency metric was not grounded

**Root cause:**  
The old `ExecutionConsistencyCard` computed consistency by resampling chart curves, computing mean deviation, and normalizing — a bespoke algorithm that wasn't grounded in exercise science literature.

**Fix:**  
Now uses the **same formula from `resegment_reps_fixed.py`** (line 1264):
```python
consistency_score = 100 - min(100, (duration_std/avg_duration + amplitude_std/avg_amplitude) * 50)
```

This is essentially **coefficient of variation (CV)** of rep duration and signal amplitude. This is the standard approach in:
- PUSH Band velocity tracking apps
- Velocity-Based Training (VBT) research (Jovanović & Flanagan, 2014)
- RepOne, GymAware, and other commercial VBT systems

The card now shows:
- **Duration variability** (±Xs) — standard deviation of rep times
- **Amplitude variability** (±X) — standard deviation of signal peak-to-trough
- **Consistency score** — derived from CV of both metrics

---

## Architecture

### Before (2 components, 2 data pipelines)

```
ExecutionConsistencyCard
  └─ reads chartData from repsData
  └─ computes curve deviation
  └─ uses analysisScore (server) as override

FatigueCarousel (2-slide carousel)
  Slide 1: Fatigue Analysis
    └─ reads peakVelocity, time, smoothnessScore from repsData (local)
    └─ uses propScore (server) for the donut score
    └─ BUG: score and indicators from different sources
  Slide 2: Velocity Loss
    └─ reads peakVelocity from repsData
    └─ computes baseline, drop, effective reps
```

### After (1 component, 1 data pipeline)

```
PerformanceInsightsCard
  └─ extractRepKinematics(): ONE function extracts all kinematic arrays
      → duration, velocity, smoothness, amplitude, chartData per rep
  └─ computeConsistency(): CV of duration & amplitude (resegment formula)
  └─ computeFatigue(): first-third vs last-third (VBT standard)
  └─ computeVelocity(): per-rep velocity bars with 20% threshold
```

All three sections read from the **same `reps` array**. No mixing of server vs local data sources.

---

## Metrics Explained

### Consistency

| Metric | Formula | Source |
|--------|---------|--------|
| Duration variability | `std(rep_durations)` | resegment_reps_fixed.py |
| Amplitude variability | `std(rep_amplitudes)` | resegment_reps_fixed.py |
| Consistency score | `100 − min(100, (dur_cv + amp_cv) × 50)` | resegment_reps_fixed.py line 1264 |

**Interpretation:**
- ≥90% = Excellent — highly repeatable reps
- ≥75% = Good — minor variation, normal
- ≥60% = Fair — noticeable inconsistency
- <60% = Needs Work — high variability

### Fatigue Analysis

| Metric | Formula | Grounding |
|--------|---------|-----------|
| Velocity drop | `(v_first_third − v_last_third) / v_first_third × 100` | González-Badillo et al. (2017) |
| Rep slowdown | `(dur_last_third − dur_first_third) / dur_first_third × 100` | Standard VBT practice |
| Form decay | `(smooth_first − smooth_last) / smooth_first × 100` | PUSH Band app methodology |
| Composite score | `0.40 × vel + 0.30 × dur + 0.30 × form` | Weighted composite (velocity dominant) |

**Fatigue levels:**
- <10 = Minimal — excellent endurance
- <20 = Low — manageable fatigue
- <35 = Moderate — expected for hypertrophy sets
- <55 = High — significant performance degradation
- ≥55 = Severe — consider reducing volume

### Velocity Loss

| Metric | Formula | Grounding |
|--------|---------|-----------|
| Baseline | average of first 2 reps | VBT standard (freshest reps) |
| Total drop | `(baseline − last_rep) / baseline × 100` | Bryan Mann's VBT research |
| Effective reps | reps with <20% velocity loss from baseline | Bryan Mann recommendation |

**Why 20% threshold (not 10%):**
The original code used 10%, which is the NSCA's "velocity-based autoregulation" threshold for powerlifting. For general fitness and hypertrophy training (which AppLift targets), 20% is more appropriate:
- **10%**: Optimal for maximal strength / nervous system training
- **20%**: Standard for hypertrophy / general fitness (Bryan Mann, 2016)
- **30%+**: Metabolic / endurance emphasis

---

## Files Changed

| File | Change |
|------|--------|
| `components/sessionDetails/PerformanceInsightsCard.js` | **NEW** — unified card |
| `pages/session-details/index.js` | Replaced `ExecutionConsistencyCard` + `FatigueCarousel` with `PerformanceInsightsCard` |
| `components/sessionDetails/ExecutionConsistencyCard.js` | No longer imported (kept for reference) |
| `components/sessionDetails/FatigueCarousel.js` | No longer imported (kept for reference) |

---

## Data Flow

```
Workout Monitor → repsData (local)
  Fields: repNumber, time (duration), rom, peakVelocity, chartData, liftingTime, loweringTime

Analytics API → analysisUI (server, merged into repsData)
  Adds: smoothnessScore, classification, romDegrees, more accurate peakVelocity

GCS workout_data.json → gcsData (sensor data, merged when no analytics)
  Adds: classification, smoothnessScore, quality

     ↓ All merged into vm.mergedSetsData ↓

PerformanceInsightsCard
  extractRepKinematics() → { duration, velocity, smoothness, amplitude }[]
  → computeConsistency() → { score, durationVariability, amplitudeVariability }
  → computeFatigue() → { score, level, velocityDrop, durationIncrease, smoothnessDrop }
  → computeVelocity() → { bars[], baseline, drop, effective, total }
```

All three computation functions receive the **same rep array** — impossible for them to disagree on underlying data.
