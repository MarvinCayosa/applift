# Fatigue & Velocity Analysis — Technical Documentation

## Overview

AppLift computes fatigue and velocity metrics from IMU sensor data captured during each workout. The system uses a **single source of truth**: the API computes the fatigue score server-side and stores it in Firestore. The UI displays the API score directly, with three local diagnostic sub-metrics shown as supporting indicators.

---

## 1. Fatigue Score (0–100)

### Where it's computed

| Location | Role |
|---|---|
| `pages/api/analyze-workout.js` → `computeFatigueIndicators()` | Server-side computation, stored in Firestore |
| `services/workoutAnalysisService.js` → `computeFatigueIndicators()` | Client-side mirror (used during live workout) |
| `components/sessionDetails/FatigueCarousel.js` | Display — uses the API prop; local fallback only if API score missing |

### Algorithm — Kinematic Degradation Model

The score measures **how much performance degrades from early reps to late reps**, not absolute variability. This approach distinguishes true fatigue (progressive decline) from natural rep-to-rep noise.

#### Step 1: Split reps into thirds

```
nReps = total rep count
third = floor(nReps / 3)    // at least 1

firstThird = reps[0 .. third-1]
lastThird  = reps[nReps-third .. nReps-1]
```

#### Step 2: Compute 4 kinematic indicators

Each indicator compares the **first third average** vs **last third average**:

| Indicator | Symbol | What it measures | Formula |
|---|---|---|---|
| **Velocity Change** | D_ω | Peak angular velocity (gyro) or peak accel **drop** | `max(0, (avgFirst - avgLast) / avgFirst)` |
| **Tempo Increase** | I_T | Rep duration getting longer (muscles slowing) | `(avgDurLast - avgDurFirst) / avgDurFirst` |
| **Jerk Increase** | I_J | Mean jerk rising (jerkier movement) | `(avgJerkLast - avgJerkFirst) / avgJerkFirst` |
| **Shakiness Increase** | I_S | Within-rep shakiness rising (motor control loss) | `(avgShakyLast - avgShakyFirst) / avgShakyFirst` |

All indicators are **clamped to ≥ 0** (only degradation counts, not improvement).

> **D_ω direction fix (v4):** Previously used `|avgFirst - avgLast|` which penalized
> velocity *increases* (warming up) as fatigue. Now only velocity **drops** count.

#### Step 3: ML Classification Quality (Q_exec)

When ML classification data is available (clean vs unclean rep labels):

```
Q_exec = (100 - cleanPercentage) / 100

// Additional penalties:
if abruptInitiation% > 25% → Q_exec += (abruptPct - 0.25) * 0.4
if uncontrolled%     > 20% → Q_exec += (uncontrolledPct - 0.20) * 0.5

Q_exec clamped to [0, 1]
```

#### Step 4: Weighted composite

**With ML classification:**
```
fatigueRaw = 0.25 × D_ω + 0.18 × I_T + 0.14 × I_J + 0.14 × I_S + 0.29 × Q_exec
```

**Without ML classification (kinematic only):**
```
fatigueRaw = 0.35 × D_ω + 0.25 × I_T + 0.20 × I_J + 0.20 × I_S
```

#### Step 5: Boost for severe indicators (conservative)

```
worstIndicator = max(D_ω, I_T, I_J, I_S)
if worstIndicator > 0.50:
    fatigueRaw += (worstIndicator - 0.50) × 0.25

if Q_exec > 0.60:
    fatigueRaw += (Q_exec - 0.60) × 0.2
```

#### Step 5b: Sanity caps

```
// Good execution quality limits fatigue (can't be severe with 70%+ clean reps)
if cleanPercentage ≥ 70:
    maxFatigue = (50 - (cleanPct - 70) × 0.43) / 100
    fatigueRaw = min(fatigueRaw, maxFatigue)

// Mild kinematics can't produce severe score
if all kinematic indicators < 0.15:
    fatigueRaw = min(fatigueRaw, 0.45)
```

#### Step 6: Scale to 0–100

```
fatigueScore = min(100, fatigueRaw × 100)
```

#### Step 7: Multi-set aggregation (v4)

When a workout has **multiple sets**, fatigue is computed **per-set** first, then aggregated via weighted average by rep count. This avoids **cross-set calibration contamination** — a critical fix for dumbbell/free-weight exercises where the IMU sensor recalibrates between sets.

```
if sets > 1:
    overallScore = Σ(setFatigueScore × setRepCount) / totalReps
else:
    overallScore = computeFatigueIndicators(allReps)
```

**Why per-set?** When sets are concatenated, the "first third" may be Set 1 reps and the "last third" may be Set 2 reps. Any sensor recalibration between sets creates artificial degradation patterns that look like fatigue but aren't real. Per-set analysis ensures we only measure degradation *within* each set.

### Fatigue Level Thresholds (forgiving scale)

| Score | Level | Color | Session Quality |
|---|---|---|---|
| 0 – 14 | **Minimal** | 🟢 Green | Excellent |
| 15 – 29 | **Low** | 🟢 Green | Good |
| 30 – 49 | **Moderate** | 🟡 Yellow | Fair |
| 50 – 69 | **High** | 🟠 Orange | Poor |
| 70 – 100 | **Severe** | 🔴 Red | Very Poor |

### Why "forgiving"?

These thresholds are intentionally lenient because:
- IMU sensors on gym equipment (not body-worn) produce inherently noisier signals
- Small 5–15% degradation in velocity/tempo is **normal** within a set
- A beginner's first sets often show higher variability without true fatigue
- Only scores ≥ 70 are labeled "Severe" — requires substantial multi-indicator decline

---

## 2. Diagnostic Sub-Metrics (FatigueCarousel indicator cards)

These three metrics are computed **locally** in `FatigueCarousel` for the indicator cards. They do **not** influence the primary fatigue score — they provide supplementary diagnostic details.

### 2.1 Velocity CV%

**Coefficient of Variation** of velocity across all reps (uses MCV when available, falls back to peak velocity).

```
CV = (standardDeviation(velocities) / mean(velocities)) × 100
```

| CV% | Status | Meaning |
|---|---|---|
| < 10% | Good | Very consistent power output |
| 10-20% | Warning | Some variability |
| > 20% | Bad | High variability |

### 2.2 Tempo CV%

**Coefficient of Variation** of rep durations.

```
CV = (standardDeviation(durations) / mean(durations)) × 100
```

| CV% | Status | Meaning |
|---|---|---|
| < 12% | 🟢 Good | Steady tempo |
| 12–25% | 🟡 Warning | Erratic pacing |
| > 25% | 🔴 Bad | Significant tempo loss |

### 2.3 Smoothness Decay

**Percentage drop** in LDLJ-based smoothness scores from first third to last third.

```
decay = max(0, (avgSmoothFirst - avgSmoothLast) / avgSmoothFirst × 100)
```

| Decay% | Status | Meaning |
|---|---|---|
| < 12% | 🟢 Good | Movement quality maintained |
| 12–30% | 🟡 Warning | Some quality loss |
| > 30% | 🔴 Bad | Major degradation |

---

## 3. Velocity Analysis (Slide 2)

The second carousel slide shows a **per-rep bar chart** of velocity with effective/ineffective classification.

### Primary Metric: Mean Concentric Velocity (MCV)

The system uses **Mean Concentric Velocity (MCV)** as the primary velocity metric when available. MCV is the average of the absolute velocity profile across the rep, computed from accelerometer integration. It is more stable and noise-resistant than peak velocity (PV), which captures only the single fastest instant and can be inflated by sensor noise spikes.

When MCV is not available (e.g., legacy data or local-only computation fallback), the system falls back to **Peak Velocity**.

### How "Effective" vs "Ineffective" reps are determined

A rep is **effective** if its velocity hasn't dropped significantly from the baseline.

#### Step 1: Data quality filtering

```
Exclude reps with velocity ≤ 0.02 m/s (noise floor)
```

Reps below this threshold are likely stationary sensor readings or noise artifacts and are excluded from baseline calculation.

#### Step 2: Establish baseline

```
validReps = reps where velocity > 0.02 m/s
baseline = max(first 3 validReps' velocity)
```

The baseline is the **fastest (maximum) of the first 3 valid reps**, not the average of the first 2. This approach is more robust because:
- Averaging can be skewed by a single slow warm-up rep or sensor glitch
- Taking the best of 3 captures the lifter's true initial capability
- A 3-rep window provides sufficient sampling while still representing the "fresh" state

#### Step 3: Compute velocity loss per rep

```
dropPercent = ((baseline - repVelocity) / baseline) × 100
```

#### Step 4: Classify

```
if dropPercent < 10%  →  Effective  (cyan bar, full opacity)
if dropPercent >= 10% →  Ineffective (slate bar, dimmed)
```

### Why 10%?

The **10% velocity loss threshold** is an industry-standard Velocity-Based Training (VBT) cutoff:

- **Bryan Mann (2016)** — Popularized the 10-20% velocity loss range as the zone where reps remain neurally productive
- **González-Badillo et al. (2017)** — Showed that limiting sets to <20% velocity loss optimizes strength gains while reducing unnecessary fatigue
- **Pérez-Castilla et al. (2019)** — Confirmed that reps beyond 20% velocity loss primarily add metabolic stress without proportional strength benefit
- In practice, **<10% loss** = the rep still has high neural drive and is mechanically efficient. Beyond 10%, the muscle is compensating — rep quality starts declining even if the weight is still moving.

### Outlier Detection (Workout-Finished View)

The `FatigueVelocityCarousel` component applies additional IQR-based outlier detection:

```
sorted = all non-zero velocities, sorted ascending
Q1 = 25th percentile, Q3 = 75th percentile
IQR = Q3 - Q1
upperThreshold = max(Q3 + 1.5 × IQR, median × 2)
lowerThreshold = max(0.1, Q1 - 1.5 × IQR)
```

Reps outside these bounds are flagged as extreme values and excluded from baseline/statistics but still displayed visually.

### Stats row

| Metric | Definition |
|---|---|
| **Peak** | Baseline velocity (fastest of first 3 valid reps) in m/s |
| **Variability** | Velocity CV% across all valid reps |
| **Effective** | Count of effective reps / total reps |

### Bar chart colors

| Color | Meaning |
|---|---|
| Cyan (`#22d3ee`) | Effective rep (< 10% drop from baseline) |
| Slate (`#475569`, 50% opacity) | Ineffective rep (>= 10% drop from baseline) |

---

## 4. Data Flow

```
IMU Sensor → RepCounter (per-rep metrics)
    ↓
analyze-workout API → computeFatigueIndicators()
    ↓
Firestore: { fatigueScore: 10.2, fatigueLevel: 'minimal', ... }
    ↓
useWorkoutAnalysis hook → transformAnalysisForUI()
    ↓
FatigueCarousel
  ├── Slide 1: Donut ring (API score) + 3 diagnostic cards (local CV metrics)
  └── Slide 2: Velocity bar chart (local per-rep baseline comparison)
```

### Files involved

| File | Purpose |
|---|---|
| `pages/api/analyze-workout.js` | Server-side fatigue computation |
| `services/workoutAnalysisService.js` | Client-side mirror for live workout |
| `hooks/useWorkoutAnalysis.js` | Transforms API response for UI |
| `components/sessionDetails/FatigueCarousel.js` | Display (session-details, workout-finished, shared page) |

---

## 5. Minimum Data Requirements

| Metric | Minimum reps needed |
|---|---|
| Fatigue score (API) | 3 reps |
| FatigueCarousel sub-metrics | 2 reps (velocity/tempo), 3 reps (smoothness) |
| Velocity analysis bars | 1 rep |
| Effective rep classification | 2 reps (need baseline) |

If fewer reps are available, the component shows `--` placeholders and a 0 score.
