# Velocity Analysis — BACKUP OF ORIGINAL (Pre-Revision)

> This file preserves the **original** velocity analysis sections from all three README files
> and the original code logic, before they were revised to the updated methodology.
> Created as a backup per explicit request.

---

## ORIGINAL FROM: METRICS_DOCUMENTATION.md (Section 2)

```markdown
## 2. Velocity Analysis  

### Purpose
Analyzes movement velocity patterns to assess power output, fatigue, and training effectiveness using industry-standard VBT metrics.

### Key Metrics

#### 2.1 Peak Velocity
**Calculation**: Real peak velocity (m/s) from accelerometer integration during concentric phase.

**Rationale**: Peak velocity directly correlates with power output and neuromuscular readiness. Used by commercial VBT devices (PUSH, Gymaware, Tendo).

#### 2.2 Velocity Variability (Coefficient of Variation)
**Formula**: `(Standard Deviation / Mean Velocity) × 100`

**Rationale**: CV% captures velocity consistency regardless of rep order, superior to simple "drop" calculations. Accounts for non-sequential fatigue patterns (momentum compensation, mid-set recovery).

**Thresholds**:
- `< 8%` → **Very Consistent** (stable motor pattern)
- `8-15%` → **Moderate Variability** (normal fluctuation)  
- `15-25%` → **High Variability** (fatigue compensation)
- `> 25%` → **Very Inconsistent** (form breakdown)

**Why CV% > First-to-Last Drop?**
Traditional "velocity drop" (first vs last rep) fails when velocity patterns are non-sequential:
- Reps 1-3: Consistent baseline
- Reps 4-5: Fatigue dip  
- Reps 6-8: Momentum compensation

CV% captures the total spread, providing a more accurate fatigue assessment.

#### 2.3 Effective Reps
**Formula**: Count of reps with `< 10%` velocity drop from baseline (average of first 2 reps)

**Code logic**:
\```
baseline = average of first 2 reps' peak velocity
dropPercent = ((baseline - repVelocity) / baseline) × 100
if dropPercent < 10% → ✅ Effective
if dropPercent ≥ 10% → ❌ Ineffective
\```

**Rationale**: Based on Bryan Mann's research and VBT literature — reps within <10% velocity loss maintain high neural drive and mechanical efficiency. Beyond 10%, the muscle is compensating and rep quality declines.

**Threshold**: 10% velocity loss cutoff (González-Badillo et al., 2017; Pérez-Castilla et al., 2019).

### Scientific Basis
- Mann et al. (2010) - effective rep concept
- Dorrell et al. (2020) - velocity-based training review
- Orange et al. (2019) - coefficient of variation in resistance training
```

---

## ORIGINAL FROM: COMPUTATION_METRICS_README.md (Section 7)

```markdown
## 7. Peak Velocity

### What is Peak Velocity?

Peak velocity is the **fastest speed** the equipment reaches during a rep. In velocity-based training (VBT), it's a gold-standard metric used by commercial devices like PUSH Band, GymAware, and Tendo Unit.

### How We Calculate It

\```
Step 1: Get acceleration magnitude for each sample
Step 2: Establish gravity baseline (~9.81 m/s²) from first few samples
Step 3: Subtract gravity → net acceleration
Step 4: Integrate net acceleration over time → velocity curve
Step 5: Remove drift (subtract linear trend from start to end)
Step 6: Peak velocity = maximum absolute value on the velocity curve
\```

**In detail:**

1. **Net Acceleration** = measured acceleration magnitude − gravity baseline
   - Positive values = the equipment is accelerating (being pushed/pulled)
   - Negative values = the equipment is decelerating (slowing down)

2. **Trapezoidal Integration** to convert acceleration to velocity:
   \```
   velocity(t) = velocity(t-1) + ½ × [netAccel(t) + netAccel(t-1)] × Δt
   \```
   This is more accurate than simple multiplication because it accounts for the acceleration changing between samples.

3. **Drift Removal** — Without correction, small errors accumulate and velocity "drifts" away from zero. We apply a linear detrend:
   - The velocity at the start of a rep should be ~0.
   - The velocity at the end of a rep should be ~0.
   - Any remaining velocity is assumed to be drift and is subtracted linearly.

4. **Peak Velocity** = the maximum |velocity| during the rep.

### What the Numbers Mean

| Peak Velocity | Training Zone | Typical Exercise |
|--------------|---------------|-----------------|
| > 1.3 m/s | Speed-Strength | Light squats, power cleans |
| 0.75 – 1.3 m/s | Strength-Speed | Moderate bench press |
| 0.5 – 0.75 m/s | Strength | Heavy squats |
| < 0.5 m/s | Maximum Strength | Near-max deadlifts |

### Effective Reps
A rep is "effective" for strength/power gains if its velocity hasn't dropped more than **10%** from the baseline (average of first 2 reps' peak velocity). The app counts how many reps in a set meet this threshold.

**Code logic:**
\```
baseline = average of first 2 reps' peak velocity
dropPercent = ((baseline - repVelocity) / baseline) × 100
if dropPercent < 10% → ✅ Effective (cyan bar)
if dropPercent ≥ 10% → ❌ Ineffective (dimmed bar)
\```

This 10% VBT cutoff is based on research by Mann (2016), González-Badillo et al. (2017), and Pérez-Castilla et al. (2019) — reps within <10% velocity loss maintain high neural drive and mechanical efficiency.

> **For the physical therapist:** Peak velocity is directly related to power output (Power = Force × Velocity). A declining peak velocity across reps is one of the earliest and most reliable signs of neuromuscular fatigue — muscles that are tiring produce force more slowly, reducing movement speed even before the patient notices difficulty.
```

---

## ORIGINAL FROM: FATIGUE_VELOCITY_ANALYSIS.md (Section 3)

```markdown
## 3. Velocity Analysis (Slide 2)

The second carousel slide shows a **per-rep bar chart** of peak velocity with effective/ineffective classification.

### How "Effective" vs "Ineffective" reps are determined

A rep is **effective** if its velocity hasn't dropped significantly from the baseline.

#### Step 1: Establish baseline

\```
baseline = average of first 2 reps' peak velocity
\```

#### Step 2: Compute velocity loss per rep

\```
dropPercent = ((baseline - repVelocity) / baseline) × 100
\```

#### Step 3: Classify

\```
if dropPercent < 10%  →  ✅ Effective  (cyan bar, full opacity)
if dropPercent ≥ 10%  →  ❌ Ineffective (slate bar, dimmed)
\```

### Why 10%?

The **10% velocity loss threshold** is an industry-standard Velocity-Based Training (VBT) cutoff:

- **Bryan Mann (2016)** — Popularized the 10–20% velocity loss range as the zone where reps remain neurally productive
- **González-Badillo et al. (2017)** — Showed that limiting sets to <20% velocity loss optimizes strength gains while reducing unnecessary fatigue
- **Pérez-Castilla et al. (2019)** — Confirmed that reps beyond 20% velocity loss primarily add metabolic stress without proportional strength benefit
- In practice, **<10% loss** = the rep still has high neural drive and is mechanically efficient. Beyond 10%, the muscle is compensating — rep quality starts declining even if the weight is still moving.

### Stats row

| Metric | Definition |
|---|---|
| **Peak** | Baseline velocity (avg of first 2 reps) in m/s |
| **Variability** | Velocity CV% across all reps |
| **Effective** | Count of effective reps / total reps |

### Bar chart colors

| Color | Meaning |
|---|---|
| Cyan (`#22d3ee`) | Effective rep (< 10% drop) |
| Slate (`#475569`, 50% opacity) | Ineffective rep (≥ 10% drop) |
```

---

## ORIGINAL CODE LOGIC

### FatigueCarousel.js — Velocity metrics (lines ~185-215)
```javascript
const baseSize = Math.min(2, vels.length);
const baseline = vels.slice(0, baseSize).reduce((s, x) => s + x.v, 0) / baseSize;
// ...
const enriched = vels.map(x => {
  const d = baseline > 0 ? ((baseline - x.v) / baseline) * 100 : 0;
  return { ...x, dropPct: Math.round(d * 10) / 10, isEff: d < 10 };
});
```

### VelocityLossChart.js — Baseline (lines ~68-74)
```javascript
const baselineSampleSize = Math.min(2, velocities.length);
const baselineVelocity = velocities
  .slice(0, baselineSampleSize)
  .reduce((sum, v) => sum + v.velocity, 0) / baselineSampleSize;
```

### useWorkoutSession.js — computeLocalPeakVelocity (lines ~90-130)
```javascript
// Peak velocity = max absolute velocity
const peakVelocity = Math.max(...velocityProfile.map(v => Math.abs(v)));
return Math.round(peakVelocity * 100) / 100;
```

### workoutAnalysisService.js — analyzeRep velocity output (lines ~510-515)
```javascript
peakVelocity: peakLinearVelocity,     // TRUE peak velocity in m/s
meanVelocity: meanLinearVelocity,     // Mean velocity in m/s
velocityProfile,                       // Full velocity curve
```
