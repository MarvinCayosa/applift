# Performance Insights — Design & Fix Documentation

## Problem Statement

The FatigueCarousel had a critical data mismatch: the donut fatigue score came from the API (`computeFatigueIndicators()`), but the 3 indicator cards (Velocity, Slowdown, Control) were computed **locally** from `repsData` fields that were often missing or zero. This caused the score to show (e.g.) 42 "Moderate" while all 3 indicators showed 0.0%.

---

## Bugs Found & Fixed

### Bug 1 — Indicator cards show 0% while fatigue score is non-zero

**Root cause:**  
The FatigueCarousel used `propScore` (from the Firestore analytics document) as the donut score, but computed the three indicator values locally from `rep.meanVelocity`, `rep.time`, and `rep.smoothnessScore`. The API fatigue score uses raw IMU kinematic data (gyro peaks, jerk, shakiness) that is NOT stored per-rep in `repsData` — so the local calculation had no data to work with.

**Fix:**  
The API's `computeFatigueIndicators()` already computes and stores `D_omega`, `I_T`, `I_J`, `I_S` in Firestore. These are now:
1. Extracted by `transformAnalysisForUI()` into a `fatigueComponents` object
2. Passed through `useSessionDetailsData` viewModel
3. Passed as a `fatigueComponents` prop to `FatigueCarousel`
4. Displayed directly as the 4 indicator cards

### Bug 2 — Score and indicators from different data sources

**Root cause:**  
Two separate fatigue calculations existed:
- **API-side:** `computeFatigueIndicators()` using D_ω (gyro), I_T (duration), I_J (jerk), I_S (shakiness), Q_exec (ML quality)
- **UI-side:** Local computation in FatigueCarousel using `rep.meanVelocity`, `rep.time`, `rep.smoothnessScore`

These used different data, different metrics, and different weights (old local: 0.35×D + 0.25×T + 0.40×S vs API: 0.35×D_ω + 0.25×I_T + 0.20×I_J + 0.20×I_S).

**Fix:**  
Eliminated the local sub-metric computation entirely (when API data is available). FatigueCarousel now shows the actual API sub-metrics. Local fallback only activates when `fatigueComponents` prop is null.

---

## Architecture

### Before (2 data pipelines — BROKEN)

```
API computeFatigueIndicators()
  ├─ fatigueScore  ──→ Firestore ──→ transformAnalysisForUI ──→ FatigueCarousel prop ✅
  ├─ D_omega       ──→ Firestore ──→ NOT extracted ❌
  ├─ I_T           ──→ Firestore ──→ NOT extracted ❌
  ├─ I_J           ──→ Firestore ──→ NOT extracted ❌
  └─ I_S           ──→ Firestore ──→ NOT extracted ❌

FatigueCarousel (local computation)
  ├─ Donut ring: propScore (API) ✅
  ├─ Velocity card: local CV% from rep.meanVelocity ❌ (often 0)
  ├─ Slowdown card: local CV% from rep.time ❌ (often 0)
  └─ Control card: local smoothness decay from rep.smoothnessScore ❌ (often 0)
```

**Result:** Score = 42, all indicators = 0.0% — completely inconsistent.

### After (single data pipeline — FIXED)

```
API computeFatigueIndicators()
  ├─ fatigueScore        ──→ Firestore ──→ transformAnalysisForUI ──→ fatigueScore prop ──→ Donut ring ✅
  ├─ fatigueLevel        ──→ Firestore ──→ transformAnalysisForUI ──→ fatigueLevel prop ──→ Donut label ✅
  ├─ D_omega             ──→ Firestore ──→ transformAnalysisForUI ──→ fatigueComponents prop ──→ "Velocity" card ✅
  ├─ I_T                 ──→ Firestore ──→ transformAnalysisForUI ──→ fatigueComponents prop ──→ "Slowdown" card ✅
  ├─ I_J                 ──→ Firestore ──→ transformAnalysisForUI ──→ fatigueComponents prop ──→ "Jerk" card ✅
  └─ I_S                 ──→ Firestore ──→ transformAnalysisForUI ──→ fatigueComponents prop ──→ "Shakiness" card ✅
```

**Result:** Score and all 4 indicators come from the same `computeFatigueIndicators()` call — always consistent.

---

## Indicator Card Thresholds

### Velocity (D_ω × 100%)
| Value | Status | Color |
|---|---|---|
| < 10% | Good | 🟢 Green |
| 10–20% | Warning | 🟡 Yellow |
| > 20% | Bad | 🔴 Red |

### Slowdown (I_T × 100%)
| Value | Status | Color |
|---|---|---|
| < 15% | Good | 🟢 Green |
| 15–30% | Warning | 🟡 Yellow |
| > 30% | Bad | 🔴 Red |

### Jerk (I_J × 100%)
| Value | Status | Color |
|---|---|---|
| < 15% | Good | 🟢 Green |
| 15–30% | Warning | 🟡 Yellow |
| > 30% | Bad | 🔴 Red |

### Shakiness (I_S × 100%)
| Value | Status | Color |
|---|---|---|
| < 15% | Good | 🟢 Green |
| 15–25% | Warning | 🟡 Yellow |
| > 25% | Bad | 🔴 Red |

---

## Files Changed

| File | Change |
|------|--------|
| `hooks/useWorkoutAnalysis.js` | `transformAnalysisForUI` now extracts `fatigueComponents: { D_omega, I_T, I_J, I_S, Q_exec, hasMLClassification }` |
| `hooks/useSessionDetailsData.js` | Passes `fatigueComponents` through to viewModel |
| `pages/workout-finished.js` | Passes `fatigueComponents` prop to FatigueCarousel + share data |
| `pages/session-details/index.js` | Passes `fatigueComponents` prop to FatigueCarousel + share data |
| `pages/shared/[id].js` | Passes `fatigueComponents` prop to FatigueCarousel |
| `components/sessionDetails/FatigueCarousel.js` | Uses API sub-metrics directly; shows 4 indicator cards; local fallback only when API unavailable |

---

## Info Overlay Updates

The FatigueCarousel's info overlay (tap ℹ️) now shows the real formula:

**Slide 1 — Understanding Fatigue:**
- Velocity Drop (Dω) — peak movement speed decline
- Rep Slowdown (I_T) — rep duration increase
- Jerk Increase (I_J) — movement choppiness
- Shakiness Increase (I_S) — tremor and instability

**Slide 2 — How It's Computed:**
```
Fatigue = 0.35×Dω + 0.25×I_T + 0.20×I_J + 0.20×I_S
```
With ML classification, weights shift and Q_exec (29%) is added.

---

*Note: The `PerformanceInsightsCard` component exists but is not used in production. FatigueCarousel remains the active component for fatigue display.*
