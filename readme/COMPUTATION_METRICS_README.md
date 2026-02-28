# AppLift: Post-Workout Computation Metrics & ML Pipeline

### A Complete Guide for Non-Coders and Physical Therapist Validators

> **What is this document?**
> This README explains — in plain language — how AppLift collects motion data from a wearable sensor, turns that raw data into meaningful exercise metrics, and uses machine learning to assess movement quality. Every formula, threshold, and strategy is documented so that a physical therapist can understand, verify, and trust the system's outputs.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [The Hardware: IMU Sensor](#2-the-hardware-imu-sensor)
3. [Data Collection Pipeline](#3-data-collection-pipeline)
4. [Signal Filtering & Noise Removal](#4-signal-filtering--noise-removal)
5. [Rep Detection (Counting Reps Automatically)](#5-rep-detection-counting-reps-automatically)
6. [Range of Motion (ROM)](#6-range-of-motion-rom)
7. [Peak Velocity](#7-peak-velocity)
8. [Fatigue Analysis](#8-fatigue-analysis)
9. [Velocity Analysis & Consistency](#9-velocity-analysis--consistency)
10. [Smoothness (Movement Quality)](#10-smoothness-movement-quality)
11. [Movement Phases (Concentric vs. Eccentric)](#11-movement-phases-concentric-vs-eccentric)
12. [Feature Extraction (Turning Data into Numbers)](#12-feature-extraction-turning-data-into-numbers)
13. [Machine Learning Classification](#13-machine-learning-classification)
14. [Post-Workout Summary Metrics](#14-post-workout-summary-metrics)
15. [Scientific References](#15-scientific-references)
16. [Glossary of Terms](#16-glossary-of-terms)

---

## 1. The Big Picture

AppLift is a fitness application that uses a small sensor (called an **IMU** — Inertial Measurement Unit) attached to gym equipment to track how you move during exercise. Think of it like a "Fitbit for your barbell."

### How it works, step by step:

```
┌──────────────┐     Bluetooth     ┌──────────────┐     Analysis     ┌──────────────┐
│  IMU Sensor   │ ───────────────► │  Phone App    │ ──────────────► │  Workout      │
│  (on equipment)│   50 readings/sec │  (AppLift)   │  real-time      │  Report       │
└──────────────┘                   └──────────────┘                  └──────────────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │  Cloud ML     │
                                   │  (Quality     │
                                   │   Grading)    │
                                   └──────────────┘
```

**In simple terms:**
1. You attach the sensor to the equipment (dumbbell, barbell, or weight stack machine).
2. You perform your exercise — the sensor measures your motion 50 times per second.
3. The app receives that data via Bluetooth, filters out noise, counts your reps, and computes metrics like ROM, velocity, smoothness, and fatigue.
4. After the set, the data is sent to a cloud-based machine learning model that grades each rep's execution quality.
5. You get a detailed post-workout report.

---

## 2. The Hardware: IMU Sensor

### What is an IMU?

An **Inertial Measurement Unit (IMU)** is a small electronic chip that contains three types of sensors:

| Sensor | What it Measures | Unit | What It Tells Us |
|--------|-----------------|------|-----------------|
| **Accelerometer** | Linear acceleration (force) in 3 directions (X, Y, Z) | m/s² (meters per second squared) | How fast the equipment is speeding up or slowing down. At rest, it reads ~9.81 m/s² (gravity). |
| **Gyroscope** | Rotational speed around 3 axes (X, Y, Z) | °/s or rad/s (degrees or radians per second) | How fast the equipment is rotating or tilting. |
| **Magnetometer / Fusion** | Orientation in 3D space | Quaternion (w, x, y, z) or Euler angles (roll, pitch, yaw) | Which direction the equipment is pointing and its exact angle. |

### What the sensor sends to the phone (every 20 milliseconds):

| Data Field | Description | Example |
|-----------|-------------|---------|
| `accelX`, `accelY`, `accelZ` | Acceleration on each axis | -0.27, 8.91, 3.42 |
| `gyroX`, `gyroY`, `gyroZ` | Rotational speed on each axis | 0.12, -1.34, 0.05 |
| `roll`, `pitch`, `yaw` | Orientation angles | 12.5°, -3.2°, 178.4° |
| `qw`, `qx`, `qy`, `qz` | Quaternion orientation (more precise than angles) | 0.99, 0.01, -0.08, 0.02 |
| `timestamp` | Time of reading (milliseconds) | 1523 |

> **For the physical therapist:** The accelerometer tells us "how much force is being applied," the gyroscope tells us "how fast the joint is rotating," and the quaternion tells us "the exact 3D orientation of the limb/equipment." Together, these three readings paint a complete picture of the exercise movement.

---

## 3. Data Collection Pipeline

### Step-by-step data flow:

```
Step 1: RAW DATA          Step 2: FILTERING        Step 3: FEATURES         Step 4: METRICS
──────────────────        ─────────────────        ─────────────────        ─────────────────
50Hz IMU readings    ►    Kalman Filter       ►    Per-rep extraction  ►    Fatigue Score
(noisy, raw)              (smooth, clean)           (50+ numbers)            Velocity
                                                                             ROM
                                                                             Smoothness
                                                                             Consistency
                                                                             ML Quality Grade
```

### Sampling Rate
- The sensor sends **50 readings per second** (50 Hz).
- Each reading is a **56-byte packet** containing all the fields listed above.
- Data is transmitted via **Bluetooth Low Energy (BLE)** to the phone.

### Data Format for Storage
When a workout is saved, each rep's data is stored as a structured record:

```
Workout
  └─ Set 1
  │    ├─ Rep 1: [50 samples of sensor data]
  │    ├─ Rep 2: [48 samples of sensor data]
  │    └─ Rep 3: [52 samples of sensor data]
  └─ Set 2
       ├─ Rep 1: [51 samples of sensor data]
       └─ ...
```

Each sample includes: timestamp, 3-axis acceleration, 3-axis gyroscope, 3 Euler angles, 4 quaternion components, plus computed filtered values.

---

## 4. Signal Filtering & Noise Removal

### The Problem
Raw sensor data is **noisy** — it contains tiny vibrations, electrical interference, and random fluctuations that don't represent real movement. If we used raw data directly, our calculations would be inaccurate.

### The Solution: Kalman Filter

We apply a **Kalman Filter** to each axis of the accelerometer. This is a well-established mathematical technique used in aerospace (GPS navigation, rocket guidance) and robotics.

**How it works (simplified):**

Imagine you're trying to track someone walking across a room, but your measurements are wobbly. The Kalman Filter does this:

1. **Predict** where the person should be based on their last known position and speed.
2. **Measure** where the sensor says they are (noisy reading).
3. **Combine** the prediction and measurement — trusting whichever is more reliable.
4. **Output** a smooth, best-estimate position.

**Our filter settings:**
| Parameter | Value | Meaning |
|-----------|-------|---------|
| Process Noise (Q) | 0.01 | "How much we expect real movement to change between readings" |
| Measurement Noise (R) | 0.5 | "How noisy is the sensor" |

**Result:** We get two versions of each reading:
- `rawMagnitude` — the unfiltered, original reading
- `filteredMagnitude` — the Kalman-smoothed reading (used for all calculations)

> **For the physical therapist:** Think of the Kalman Filter as a "noise cancellation" system — similar to how noise-canceling headphones remove background hum while preserving the music. The real movement signal is preserved; only the random jitter is removed.

---

## 5. Rep Detection (Counting Reps Automatically)

### How Does the App Know When a Rep Starts and Ends?

The app uses a **sliding window peak-valley detection algorithm**. In plain English:

1. **Every rep creates a wave pattern** in the acceleration data — the acceleration rises when you lift (concentric) and falls when you lower (eccentric). This looks like a hill and valley when plotted.

2. **The algorithm watches a 1.5-second window** of data and looks for:
   - A **valley** (lowest point — bottom of the movement)
   - A **peak** (highest point — top of the movement)

3. **One complete cycle (valley → peak → valley)** = one rep.

### Detection Parameters

| Parameter | Value | Meaning |
|-----------|-------|---------|
| Window Duration | 1.5 seconds | The "lookback" period for pattern detection |
| Window Overlap | 90% | Check almost every new reading (high responsiveness) |
| Min Peak Prominence | 0.15 m/s² | The minimum height difference between peak and valley for it to count |
| Min Rep Duration | 0.5 seconds | Ignore anything shorter than half a second (probably noise) |
| Max Rep Duration | 8.0 seconds | Ignore anything longer than 8 seconds (probably a pause) |
| Min Peak Distance | 0.75 seconds | Minimum time between two peaks (prevents double-counting) |

### Adaptive Thresholds
The system automatically adjusts its sensitivity based on the current movement range. For strong movements with big accelerations, the threshold rises; for gentle movements, it falls. This means it works whether you're doing heavy deadlifts or light bicep curls.

### Continuous Segmentation (No Gaps)
Each rep's data boundary connects directly to the next — Rep 1 ends at sample X, Rep 2 starts at sample X+1. This ensures no sensor data is lost between reps, which is critical for accurate feature extraction.

> **For the physical therapist:** The rep counter works like a heartbeat monitor — it detects the rhythmic "up-down" pattern of each repetition. The minimum duration of 0.5 seconds filters out jostling or adjustments, and the 8-second maximum filters out pauses between reps.

---

## 6. Range of Motion (ROM)

ROM is one of the most clinically important metrics. AppLift measures it differently depending on the equipment type.

### Two Types of ROM Measurement

#### Type 1: ANGLE ROM (Dumbbell Exercises)
**Used for:** Concentration Curls, Overhead Triceps Extensions

**How it works:**
The sensor is attached to the dumbbell, which rotates as the user curls or extends. We use the **quaternion orientation data** to measure the angular range.

```
Starting Position                    End Position
(arm down)                           (arm curled up)
    │                                    ╱
    │           ROM = angle         ╱
    │           between these   ╱
    │           two positions ╱
    ▼                       ╱
```

**Calculation:**
1. Record the sensor's **baseline quaternion** (starting orientation).
2. For each sample, compute the **angular distance** from baseline using quaternion math.
3. ROM = maximum angle reached minus minimum angle reached during the rep.
4. Auto-detect which rotation axis (roll, pitch, or yaw) has the most movement — this is the "primary axis."

**Unit:** Degrees (°)

#### Type 2: STROKE ROM (Barbell & Weight Stack Exercises)
**Used for:** Bench Press, Back Squats, Lateral Pulldown, Seated Leg Extension

**How it works:**
The sensor moves **linearly** (up and down) rather than rotating. We measure **vertical displacement** — how far the bar or weight stack travels.

```
Top position ──────   ▲
                       │  ROM = distance
                       │  in centimeters
Bottom position ────   ▼
```

**Calculation (5-step process):**

1. **Gravity Removal:** The sensor always measures gravity (~9.81 m/s²) plus any actual movement acceleration. We remove gravity by:
   - Using the quaternion to rotate the acceleration into a "world frame" (so we know which direction is truly up).
   - Subtracting the calibrated gravity magnitude from the vertical component.
   - What remains is the "linear acceleration" — just the movement.

2. **Noise Filtering:**
   - Apply EMA (Exponential Moving Average) smoothing: 25% previous value + 75% current value.
   - Dead-zone: ignore acceleration below 0.06 m/s² (sensor noise floor).

3. **Zero-Velocity Update (ZUPT):**
   - When the equipment is still (not accelerating AND not rotating), force velocity to zero.
   - This prevents "integration drift" — a common problem where small errors accumulate over time.
   - Stillness is detected by checking BOTH:
     - Accelerometer: deviation from gravity < 0.12 m/s²
     - Gyroscope: rotation rate < 0.06 rad/s (~3.4°/s)

4. **Double Integration:**
   - Integrate acceleration → velocity → displacement using the **trapezoidal rule** (more accurate than simple summation).
   - Clamp velocity at ±2.0 m/s and displacement at ±2.0 meters for safety.

5. **Retrospective Correction (RetroCorrect):**
   After the rep ends, we re-process all samples using a **forward-backward integration** technique:
   - Integrate forward (start to end): get one velocity estimate.
   - Integrate backward (end to start): get another velocity estimate.
   - Average both: drift errors cancel out (they go in opposite directions).
   - Force velocity to zero at all rest segments.
   - Apply position detrending to ensure start and end positions match.

**Unit:** Centimeters (cm)

### ROM Calibration Flow
Before the workout:
1. User holds the starting position for 3 seconds (captures baseline).
2. User performs **3 full-ROM calibration reps**.
3. The average ROM of these 3 reps becomes the **target ROM**.
4. During the actual workout, each rep shows **fulfillment %** = (actual ROM / target ROM) × 100.

### ROM Consistency Score
After the set, ROM consistency is calculated:
```
Consistency = (1 - Standard Deviation / Average ROM) × 100
```
A score of 90%+ means the user maintained very consistent range of motion across reps.

> **For the physical therapist:** ROM is measured using the same fundamental approach as clinical goniometry, but automated. The quaternion-based angle measurement is equivalent to measuring joint angle with a digital goniometer. The stroke ROM (displacement) is equivalent to measuring the bar path length with a linear encoder. The calibration process establishes each patient's personal "full ROM" as the target, so fulfillment percentages are individualized — not compared to normative data.

---

## 7. Peak Velocity

### What is Peak Velocity?

Peak velocity is the **fastest speed** the equipment reaches during a rep. In velocity-based training (VBT), it's a gold-standard metric used by commercial devices like PUSH Band, GymAware, and Tendo Unit.

### How We Calculate It

```
Step 1: Get acceleration magnitude for each sample
Step 2: Establish gravity baseline (~9.81 m/s²) from first few samples
Step 3: Subtract gravity → net acceleration
Step 4: Integrate net acceleration over time → velocity curve
Step 5: Remove drift (subtract linear trend from start to end)
Step 6: Peak velocity = maximum absolute value on the velocity curve
```

**In detail:**

1. **Net Acceleration** = measured acceleration magnitude − gravity baseline
   - Positive values = the equipment is accelerating (being pushed/pulled)
   - Negative values = the equipment is decelerating (slowing down)

2. **Trapezoidal Integration** to convert acceleration to velocity:
   ```
   velocity(t) = velocity(t-1) + ½ × [netAccel(t) + netAccel(t-1)] × Δt
   ```
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
A rep is "effective" for strength/power gains if its velocity is within 20% of the best rep's velocity (based on Bryan Mann's research). The app counts how many reps in a set meet this threshold.

> **For the physical therapist:** Peak velocity is directly related to power output (Power = Force × Velocity). A declining peak velocity across reps is one of the earliest and most reliable signs of neuromuscular fatigue — muscles that are tiring produce force more slowly, reducing movement speed even before the patient notices difficulty.

---

## 8. Fatigue Analysis

### What is Fatigue Score?

The fatigue score (0–100) measures how much a person's movement quality deteriorated from the beginning to the end of a set. It combines multiple indicators because fatigue manifests in different ways.

### The Formula

**Without ML classification (kinematic indicators only):**
```
Fatigue Score = (0.35 × Velocity Drop) + (0.25 × Duration Increase)
              + (0.20 × Jerk Increase) + (0.20 × Shakiness Increase)
```

**With ML classification (adds execution quality):**
```
Fatigue Score = (0.25 × Velocity Drop) + (0.18 × Duration Increase)
              + (0.14 × Jerk Increase) + (0.14 × Shakiness Increase)
              + (0.29 × Execution Quality Penalty)
```

### Each Component Explained

#### Component 1: Velocity Drop (D_ω) — "Are they slowing down?"
- **Weight:** 35% (without ML) / 25% (with ML)
- **Calculation:** Compare average peak angular velocity of the **first third** of reps to the **last third**.
- **What it measures:** As muscles fatigue, they produce force more slowly. Peak velocity drops.
- **Example:** First 3 reps average 2.1 rad/s, last 3 reps average 1.5 rad/s → 28.6% drop.

#### Component 2: Duration Increase (I_T) — "Are they taking longer?"
- **Weight:** 25% (without ML) / 18% (with ML)
- **Calculation:** Compare average rep duration of the first third vs. last third.
- **What it measures:** Fatigued muscles move more slowly, so each rep takes longer to complete.
- **Example:** First 3 reps average 1.8 seconds, last 3 reps average 2.4 seconds → 33% increase.

#### Component 3: Jerk Increase (I_J) — "Is the movement getting choppier?"
- **Weight:** 20% (without ML) / 14% (with ML)
- **Calculation:** Compare average jerk (irregularity score) of the first third vs. last third.
- **What it measures:** "Jerk" is the mathematical term for sudden changes in acceleration. As the CNS (central nervous system) fatigues, it struggles to coordinate smooth muscle contractions, resulting in choppy, jerky movements.

#### Component 4: Shakiness Increase (I_S) — "Are they trembling?"
- **Weight:** 20% (without ML) / 14% (with ML)
- **Calculation:** Compare average angular acceleration variability (RMS of angular jerk) of the first third vs. last third.
- **What it measures:** Muscle tremor, instability, and loss of motor control — directly related to motor unit fatigue.

#### Component 5: Execution Quality Penalty (Q_exec) — "Are they using bad form?"
- **Weight:** 29% (only when ML classification is available)
- **Calculation:** Based on the percentage of reps classified as "Clean" by the ML model.
- **Additional penalties for:**
  - **Abrupt Initiation** (>25% of reps) — suggests the user is "jerking" or "swinging" the weight, using momentum to compensate for tired muscles.
  - **Uncontrolled Movement** (>20% of reps) — suggests the user has lost motor control, a direct sign of muscular fatigue.

### Fatigue Levels

| Score | Level | What It Means for the Athlete |
|-------|-------|-------------------------------|
| 0–15 | Minimal | Very fresh — great for power/speed training. |
| 15–30 | Low | Light fatigue — good for strength training. |
| 30–50 | Moderate | Moderate fatigue — suitable for hypertrophy (muscle growth). |
| 50–70 | High | Significant fatigue — approaching failure. Consider stopping. |
| 70–100 | Severe | High risk of form breakdown and injury. Stop the set. |

### Safety Caps
- If 70%+ reps are classified as "Clean," fatigue is capped at moderate (the body is clearly still performing well).
- If all kinematic indicators are mild (<15% change each), fatigue is capped at 45%.

> **For the physical therapist:** This multi-indicator approach mirrors how a therapist clinically assesses fatigue: looking at speed of movement, time to complete tasks, smoothness of motion, presence of tremor, and form breakdown. The weighted formula combines these into a single actionable number. The thresholds are grounded in velocity-based training research (González-Badillo & Sánchez-Medina, 2010; Pareja-Blanco et al., 2017).

---

## 9. Velocity Analysis & Consistency

### Velocity Variability (Coefficient of Variation)

Rather than only comparing the first rep to the last rep (which misses patterns in the middle), we use the **Coefficient of Variation (CV%)**:

```
CV% = (Standard Deviation of all rep velocities / Mean velocity) × 100
```

### Why CV% Is Better Than "First vs. Last"

Consider this pattern across 8 reps:
- Reps 1–3: Steady velocity ✓
- Reps 4–5: Fatigue dip ↓
- Reps 6–8: Momentum compensation ↑ (swinging the weight)

A simple "first vs. last" comparison would show velocity is fine (Rep 1 ≈ Rep 8). But CV% captures the total spread and reveals the instability.

| CV% | Rating | Meaning |
|-----|--------|---------|
| < 8% | Very Consistent | Stable motor pattern — well-practiced movement |
| 8–15% | Moderate | Normal fluctuation for most lifters |
| 15–25% | High Variability | Fatigue compensation — technique is breaking down |
| > 25% | Very Inconsistent | Form breakdown — high injury risk |

### Consistency Score

The overall consistency score combines four sub-scores:

```
Consistency Score = Average of:
  1. ROM Consistency     (how similar the range of motion is across reps)
  2. Smoothness Consistency  (how similar the movement quality is)
  3. Duration Consistency    (how similar the rep timing is)
  4. Peak Acceleration Consistency  (how similar the force output is)
```

Each sub-score is calculated as:
```
Sub-score = 100 - (CV × 333)
```

Where CV is the coefficient of variation for that metric. A CV of 0 (perfectly consistent) gives a score of 100. A CV of 0.30 (30% variation) gives a score of 0.

### Trend Analysis

For each metric, we calculate a **linear regression slope** to detect trends over the set:
- **Negative ROM trend** → range of motion is decreasing (cutting corners)
- **Negative smoothness trend** → movement is getting jerkier
- **Positive duration trend** → reps are getting slower

> **For the physical therapist:** Consistency metrics are analogous to measuring movement variability in motor control research. High variability in ROM or timing may indicate: (1) the patient hasn't fully learned the movement pattern, (2) fatigue is causing compensatory strategies, or (3) pain avoidance behavior is creating inconsistency. The trend analysis helps distinguish "learning variability" (which improves over time) from "fatigue variability" (which worsens).

---

## 10. Smoothness (Movement Quality)

### What is Movement Smoothness?

Smoothness describes how "fluid" or "jerky" a movement is. A perfectly smooth movement has no sudden starts, stops, or direction changes. Think of the difference between a novice lifter (jerky, hesitant) and an experienced lifter (controlled, fluid).

### How We Measure It

We use a **three-component approach** inspired by the SPARC metric (Spectral Arc Length) from rehabilitation science:

#### Component 1: Normalized Jerk (35% weight) — "How sudden are the accelerations?"
- **Jerk** = the rate of change of acceleration (how quickly force changes).
- We compute the jerk at every sample, calculate the mean, and normalize by the ROM.
- **Lower jerk = smoother movement.**
- Threshold: normalized jerk > 0.5 → choppy movement.

#### Component 2: Excess Peaks (25% weight) — "How many 'bumps' are there?"
- A perfect rep has ~2 peaks: one at the top (concentric) and one at the bottom (eccentric).
- Extra peaks indicate hesitation, corrections, or compensations.
- **Fewer excess peaks = smoother movement.**

#### Component 3: Direction Changes (20% weight) — "How often does the movement reverse?"
- Count how many times the acceleration changes from positive to negative (or vice versa).
- Controlled movement has smooth transitions; jerky movement has many rapid reversals.

#### Component 4: Jerk Variability (20% weight) — "How inconsistent is the choppiness?"
- Coefficient of variation of jerk values within a single rep.
- Even if average jerk is moderate, high variability means the movement is "shaky" — alternating between smooth and jerky sections.

### Smoothness Score (0–100)

```
Smoothness = (Jerk Component × 0.35 + Peaks Component × 0.25
            + Direction Component × 0.20 + Variability Component × 0.20) × 100
```

| Score | Rating | Clinical Interpretation |
|-------|--------|------------------------|
| 80–100 | Excellent | Expert-level motor control |
| 60–79 | Good | Controlled movement with minor irregularities |
| 40–59 | Moderate | Noticeable choppiness — technique coaching recommended |
| 20–39 | Poor | Jerky movement — injury risk. Form correction needed. |
| 0–19 | Very Poor | Erratic motion — stop and reassess. |

> **For the physical therapist:** Movement smoothness is a validated marker of motor control and rehabilitation progress. The SPARC metric (Balasubramanian et al., 2015) has been used extensively in stroke rehabilitation to track recovery. In our context, declining smoothness across reps = fatigue-induced loss of motor control. Smoothness is intentionally velocity-independent — a slow, controlled eccentric should score high, while a fast, jerky lift should score low.

---

## 11. Movement Phases (Concentric vs. Eccentric)

### What Are Movement Phases?

Every rep has two main phases:
- **Concentric** (lifting/pushing phase): the muscle shortens under load. This is the "work" phase.
- **Eccentric** (lowering/returning phase): the muscle lengthens under load. This is the "control" phase.

### How We Detect Phases

**Strategy: Primary Axis Peak Detection**

1. **Find the primary movement axis** — whichever acceleration axis (X, Y, or Z) has the greatest range of motion during the rep. This is the axis most aligned with the exercise motion.

2. **Find the turning point** — the most prominent peak or valley on the primary axis. This is where the equipment changes direction (e.g., the top of a bicep curl, the bottom of a squat).

3. **Split the rep:**
   - Everything **before** the turning point = **concentric** phase
   - Everything **after** the turning point = **eccentric** phase

**Enhanced method (when orientation data is available):**
Instead of raw acceleration, we use the **orientation angles** (roll, pitch, yaw) which are gravity-compensated and represent true device rotation. The turning point is the extremum (maximum or minimum) on the primary rotation axis.

### Phase Metrics

| Metric | Calculation | What It Tells Us |
|--------|------------|-----------------|
| Concentric Duration | Time from rep start to turning point | How long the "lifting" takes |
| Eccentric Duration | Time from turning point to rep end | How long the "lowering" takes |
| Concentric:Eccentric Ratio | Concentric time ÷ Eccentric time | Tempo control |
| Concentric % | (Concentric time / Total time) × 100 | Phase balance |
| Peak Time % | (Turning point position / Total rep) × 100 | Where the turnaround occurs |

### Typical Ratios for Training Goals

| Ratio (Concentric : Eccentric) | Training Goal | Example |
|-------------------------------|---------------|---------|
| 1 : 2–3 | Hypertrophy | Slow, controlled lowering with steady lift |
| 1 : 1 | General Strength | Balanced tempo |
| 2–3 : 1 | Power / Explosiveness | Fast, explosive lift with quick return |

> **For the physical therapist:** Eccentric control is clinically important for tendon loading protocols (e.g., Alfredson protocol for Achilles tendinopathy) and for assessing deceleration control after ACL reconstruction. A shortening eccentric phase across reps may indicate the patient is "dropping" the weight rather than controlling it — a sign of fatigue or pain avoidance.

---

## 12. Feature Extraction (Turning Data into Numbers)

### What is Feature Extraction?

To train a machine learning model, we need to convert each rep's raw sensor data (50+ individual readings) into a fixed set of **descriptive numbers**. These numbers — called "features" — capture the essential characteristics of the movement.

### Features We Extract (50+ per rep)

#### Time-Domain Features (from the raw signal)

For each signal channel (accelX, accelY, accelZ, accelMag, gyroX, gyroY, gyroZ, filteredMag, etc.):

| Feature | What It Captures |
|---------|-----------------|
| `mean` | Average value (baseline force/speed) |
| `std` (standard deviation) | Spread of values (variability) |
| `min`, `max`, `range` | Extremes of the signal (ROM indicator) |
| `median`, `p25`, `p75`, `iqr` | Distribution shape (robust to outliers) |
| `skew` | Asymmetry (is the movement lopsided?) |
| `kurtosis` | "Peakedness" (are there sharp spikes?) |
| `energy` | Sum of squares (total signal power) |
| `rms` | Root mean square (effective magnitude) |
| `diff_mean`, `diff_std`, `diff_max` | Rate of change (jerk characteristics) |
| `peak_position` | Where in the rep the peak occurs (0–1) |
| `peak_value` | Maximum signal value |

#### Duration Features
| Feature | What It Captures |
|---------|-----------------|
| `rep_duration_ms` | Total rep time in milliseconds |
| `sample_count` | Number of sensor readings in the rep |
| `avg_sample_rate` | Actual sampling rate (should be ~50 Hz) |

#### Biomechanical Features
| Feature | What It Captures |
|---------|-----------------|
| `rom_roll`, `rom_pitch`, `rom_yaw` | Range of motion on each axis |
| `concentric_duration_ms` | Time for the lifting phase |
| `eccentric_duration_ms` | Time for the lowering phase |
| `concentric_eccentric_ratio` | Tempo control indicator |
| `peak_time_percentage` | Where the turnaround occurs (%) |
| `smoothness_score` | Movement quality (0–100) |
| `normalized_jerk` | Choppiness measure |
| `num_direction_changes` | Number of acceleration reversals |
| `peak_velocity` | Maximum speed achieved |
| `mean_concentric_velocity` | Average speed during lifting |

#### Smoothness Features (LDLJ — Log Dimensionless Jerk)

The **LDLJ** is a research-standard smoothness metric:

```
LDLJ = -ln( (duration / peak_acceleration²) × ∫(jerk²) dt )
```

- More negative = smoother movement
- Closer to 0 = jerkier movement
- Computed for: 3-axis combined, individual axes (X, Y, Z), and filtered magnitude

> **For the physical therapist:** Feature extraction is similar to how a therapist observes multiple aspects of a movement simultaneously — speed, smoothness, symmetry, range, duration. The difference is that the system quantifies all of these objectively and consistently, processing 50+ data points per rep into standardized numbers that can be compared across sessions.

---

## 13. Machine Learning Classification

### What Does the ML Model Do?

The ML model looks at all 50+ features from a single rep and classifies it into one of three categories (specific to each exercise type):

**Dumbbell Exercises** (Concentration Curls, Overhead Extensions):
| Class | Label | What It Means |
|-------|-------|---------------|
| 0 | **Clean** | Textbook execution — controlled throughout |
| 1 | **Uncontrolled Movement** | Excessive wobbling, inconsistent path, loss of control |
| 2 | **Abrupt Initiation** | Sudden, jerky start — using momentum instead of controlled muscle activation |

**Barbell Exercises** (Bench Press, Back Squats):
| Class | Label | What It Means |
|-------|-------|---------------|
| 0 | **Clean** | Balanced, controlled lift |
| 1 | **Uncontrolled Movement** | Unstable bar path, wobbling |
| 2 | **Inclination Asymmetry** | One side moving faster/higher than the other (uneven loading) |

**Weight Stack Exercises** (Lateral Pulldown, Seated Leg Extension):
| Class | Label | What It Means |
|-------|-------|---------------|
| 0 | **Clean** | Smooth, controlled pull and release |
| 1 | **Pulling Too Fast** | Yanking the weight with momentum |
| 2 | **Releasing Too Fast** | Letting the weight drop back instead of controlling the return |

### The Model

| Property | Value |
|----------|-------|
| Algorithm | **Random Forest Classifier** |
| Number of Trees | 200 |
| Training approach | Supervised learning with expert-labeled data |
| Validation | 5-fold cross-validation |
| Accuracy | 94.2%+ |
| Feature Scaling | StandardScaler (mean=0, std=1) |
| Output | Predicted class + confidence score (0–100%) |

### How Random Forest Works (Simplified)

Imagine you have 200 "expert judges" (decision trees). Each judge looks at a different subset of the features and makes their own classification decision. The final answer is decided by **majority vote** — whichever class gets the most votes wins.

```
Rep Features (50+ numbers)
         │
         ├───► Tree 1: "Clean" ─────────┐
         ├───► Tree 2: "Clean" ─────────┤
         ├───► Tree 3: "Uncontrolled" ──┤  Majority Vote
         ├───► Tree 4: "Clean" ─────────┤  ═══════════►  "Clean" (85% confidence)
         ├───► ...                       │
         └───► Tree 200: "Clean" ───────┘
```

**Confidence** = percentage of trees that agreed on the winning class.
- **> 80%** → High confidence (reliable result)
- **60–80%** → Medium confidence (acceptable)
- **< 60%** → Low confidence (manual review recommended)

### Training Pipeline

```
Step 1: COLLECT DATA           Step 2: LABEL DATA           Step 3: EXTRACT FEATURES
────────────────────          ─────────────────            ──────────────────────
Record workouts with          Expert labels each           Compute 50+ features
IMU sensor                    rep as Clean/Poor/etc.       per rep (statistics,
                                                           ROM, smoothness, etc.)

Step 4: STANDARDIZE            Step 5: TRAIN MODEL          Step 6: DEPLOY
───────────────────           ─────────────────            ──────────
Scale all features to         Random Forest learns         Model hosted on
mean=0, std=1                 patterns from labeled        Google Cloud Run,
(so no feature dominates)     data (5-fold CV)             accessible via API
```

### Where the Models Live

Each exercise has its own trained model file:
- `CONCENTRATION_CURLS_RF.pkl`
- `OVERHEAD_EXTENSIONS_RF.pkl`
- `LATERAL_PULLDOWN_RF.pkl`

These are Python pickle files containing the trained Random Forest model, the feature scaler, and the feature name list.

### Fallback: Rule-Based Classification

When the ML API is unavailable (offline mode, network issues), the app uses a **rule-based fallback** that checks:
- Gyroscope variability (high gyro std → Uncontrolled Movement)
- Acceleration range (excessive range → form breakdown)
- Rate of change at start (fast diff_max at beginning → Abrupt Initiation)
- Peak position (early peak → Pulling Too Fast; late peak → Releasing Too Fast)

This is less accurate than ML but provides reasonable estimates.

> **For the physical therapist:** The classification labels are designed to be clinically actionable. "Uncontrolled Movement" maps to what a therapist would describe as "poor motor control" or "compensatory movement." "Abrupt Initiation" corresponds to "momentum use" or "ballistic initiation" — often a compensation strategy for fatigued muscles. "Inclination Asymmetry" corresponds to "lateral imbalance" that a therapist might assess with visual observation. The ML model automates this assessment objectively and consistently.

---

## 14. Post-Workout Summary Metrics

After the workout, all the per-rep metrics are aggregated into a comprehensive report:

### Session-Level Metrics

| Metric | How It's Computed | What It Tells the Patient |
|--------|------------------|--------------------------|
| **Fatigue Score** (0–100) | Weighted formula comparing first third to last third of reps | "How much did your performance decline?" |
| **Fatigue Level** | Thresholded fatigue score | Minimal / Low / Moderate / High / Severe |
| **Consistency Score** (0–100) | Average CV across ROM, smoothness, duration, peak | "How uniform was your technique?" |
| **Average Smoothness** (0–100) | Mean smoothness score across all reps | "How controlled was your movement overall?" |
| **Peak Velocity** (m/s) | Best single-rep peak velocity | "What was your best explosive effort?" |
| **Mean Velocity** (m/s) | Average peak velocity across reps | "What was your typical speed?" |
| **Velocity Loss** (%) | (Best rep velocity − Worst rep velocity) / Best × 100 | "How much did you slow down?" |
| **Effective Reps** | Count of reps within 20% of best velocity | "How many reps were truly productive?" |
| **Average ROM** | Mean ROM across all reps (° or cm) | "What was your typical range of motion?" |
| **ROM Consistency** (%) | (1 − StdDev/Mean) × 100 | "How consistent was your range?" |
| **ROM Fulfillment** (%) | Actual ROM / Target ROM × 100 | "Did you achieve full range of motion?" |
| **Clean Rep %** | (Clean reps / Total reps) × 100 | "What percentage of your reps had good form?" |
| **Concentric:Eccentric Ratio** | Average lifting time / lowering time | "What was your tempo?" |

### Performance Report (Generated Text)

The system generates a text report with:
1. **Session Quality** rating (Excellent / Good / Fair / Poor / Very Poor)
2. **Consistency Rating** (Good / Fair / Poor)
3. **Key Findings** — specific, actionable bullet points like:
   - "✅ Excellent fatigue resistance — stable speed and control throughout"
   - "⚠️ Peak angular velocity dropped 18.3% — muscles slowing"
   - "⚠️ High momentum use (42% abrupt initiation) — consider reducing weight"
   - "⚠️ Within-rep shakiness increased 25.1% — losing motor control"

### Calories Burned

Estimated using the standard exercise metabolic equation, factoring in:
- Weight lifted
- Number of reps and sets
- Rep duration
- Exercise type (compound vs. isolation)

---

## 15. Scientific References

All metrics and thresholds in AppLift are grounded in published sports science and biomechanics research:

### Velocity-Based Training
- **González-Badillo, J.J. & Sánchez-Medina, L. (2010)**. Movement velocity as a measure of loading intensity in resistance training. *International Journal of Sports Medicine*, 31(5), 347–352.
- **Pareja-Blanco, F., et al. (2017)**. Effects of velocity loss during resistance training on performance in professional soccer players. *International Journal of Sports Physiology and Performance*, 12(4), 512–519.
- **Mann, J.B., et al. (2010)**. The effect of autoregulatory progressive resistance exercise vs. linear periodization on strength improvement in college athletes. *Journal of Strength and Conditioning Research*, 24(7), 1718–1723.
- **Dorrell, H.F., et al. (2020)**. Velocity-based training: From theory to application. *Strength and Conditioning Journal*, 42(2), 32–40.
- **Orange, S.T., et al. (2019)**. The validity and reliability of a range of commercially available wearable devices for monitoring barbell velocity. *Journal of Strength and Conditioning Research*.

### Movement Smoothness & Motor Control
- **Balasubramanian, S., et al. (2015)**. A robust and sensitive metric for quantifying movement smoothness. *IEEE Transactions on Biomedical Engineering*, 62(8), 2126–2136.
- **Flash, T. & Hogan, N. (1985)**. The coordination of arm movements: an experimentally confirmed mathematical model. *Journal of Neuroscience*, 5(7), 1688–1703.
- **Rohrer, B., et al. (2002)**. Movement smoothness changes during stroke recovery. *Journal of Neuroscience*, 22(18), 8297–8304.

### IMU-Based Movement Analysis
- **Giggins, O.M., et al. (2013)**. Biofeedback in rehabilitation. *Journal of NeuroEngineering and Rehabilitation*, 10, 60.
- **Whelan, D., et al. (2017)**. Classification of deadlift biomechanics with wearable inertial measurement units. *Journal of Biomechanics*, 58, 155–161.
- **Camomilla, V., et al. (2018)**. Trends supporting the in-field use of wearable inertial sensors for sport performance evaluation. *Sensors*, 18(3), 873.

### Motor Variability & Consistency
- **Newell, K.M. & Corcos, D.M. (1993)**. *Variability and Motor Control*. Human Kinetics.
- **Stergiou, N., et al. (2006)**. Human movement variability, nonlinear dynamics, and pathology. *Journal of Applied Biomechanics*, 22(4), 241–252.
- **Davids, K., et al. (2003)**. Movement systems as dynamical systems. *Sports Medicine*, 33(4), 245–260.

### Training Methodology
- **Roig, M., et al. (2009)**. The effects of eccentric versus concentric resistance training on muscle strength and mass in healthy adults. *Journal of Strength and Conditioning Research*, 23(8), 2226–2243.
- **Schoenfeld, B.J., et al. (2017)**. Effects of tempo during resistance training on muscle hypertrophy. *Sports Medicine*, 47(4), 663–673.
- **Suchomel, T.J., et al. (2018)**. The importance of muscular strength: training considerations. *Sports Medicine*, 48(4), 765–785.

---

## 16. Glossary of Terms

| Term | Definition |
|------|-----------|
| **Accelerometer** | Sensor that measures acceleration (force) along three axes. At rest, it reads gravity (~9.81 m/s²). |
| **BLE** | Bluetooth Low Energy — wireless protocol for transmitting sensor data to the phone. |
| **Coefficient of Variation (CV%)** | Standard deviation divided by mean, expressed as percentage. Measures relative variability. |
| **Concentric Phase** | The phase of exercise where the muscle shortens under load (e.g., curling up). |
| **DTW** | Dynamic Time Warping — algorithm to compare movement patterns of different durations. |
| **Eccentric Phase** | The phase of exercise where the muscle lengthens under load (e.g., lowering the weight). |
| **Euler Angles** | Roll, pitch, and yaw — three angles that describe orientation in 3D space. |
| **Feature** | A single numerical measurement extracted from sensor data (e.g., mean acceleration, ROM). |
| **Feature Extraction** | The process of converting raw sensor data into meaningful numerical features for ML. |
| **Gyroscope** | Sensor that measures rotational velocity (how fast something is spinning). |
| **IMU** | Inertial Measurement Unit — a chip combining accelerometer, gyroscope, and often magnetometer. |
| **Jerk** | Rate of change of acceleration — measures how "sudden" or "sharp" force changes are. |
| **Kalman Filter** | Mathematical algorithm that smooths noisy sensor data while preserving real signal. |
| **LDLJ** | Log Dimensionless Jerk — a standardized smoothness metric from rehabilitation science. |
| **ML** | Machine Learning — algorithms that learn patterns from data to make predictions. |
| **Quaternion** | A four-component number (w, x, y, z) that represents 3D rotation without gimbal lock. More precise than Euler angles. |
| **Random Forest** | ML algorithm that uses hundreds of decision trees voting together for classification. |
| **ROM** | Range of Motion — the angular or linear distance traveled during a movement. |
| **SPARC** | Spectral Arc Length — a frequency-domain smoothness metric. |
| **StandardScaler** | Normalizes features to mean=0 and std=1 so all features contribute equally to ML. |
| **Trapezoidal Integration** | Numerical method to compute area under a curve — used to convert acceleration to velocity. |
| **VBT** | Velocity-Based Training — training methodology that uses movement speed as the primary load/fatigue indicator. |
| **ZUPT** | Zero-Velocity Update — technique that forces velocity to zero when the sensor is stationary, preventing drift. |

---

## Summary Diagram: From Sensor to Report

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        APPLIFT COMPUTATION PIPELINE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────────────┐   │
│  │ IMU      │     │ Kalman   │     │ Rep      │     │ Per-Rep Metrics  │   │
│  │ Sensor   │────►│ Filter   │────►│ Counter  │────►│                  │   │
│  │ (50 Hz)  │     │ (Smooth) │     │ (Peak/   │     │ • ROM (° or cm) │   │
│  └──────────┘     └──────────┘     │  Valley) │     │ • Peak Velocity  │   │
│       │                            └──────────┘     │ • Smoothness     │   │
│  Raw data:                              │           │ • Phase Timing   │   │
│  • 3-axis accel                    Segmented        │ • 50+ Features   │   │
│  • 3-axis gyro                     reps             └────────┬─────────┘   │
│  • Quaternion                                                │             │
│  • Euler angles                                              │             │
│                                                              ▼             │
│                                                    ┌──────────────────┐    │
│  ┌──────────────────────────┐                      │ ML Classification│    │
│  │ POST-WORKOUT REPORT      │◄─────────────────────│ (Random Forest)  │    │
│  │                          │                      │                  │    │
│  │ • Fatigue Score (0-100)  │     ┌───────────┐   │ • Clean          │    │
│  │ • Consistency (0-100)    │◄────│ Set-Level  │   │ • Uncontrolled   │    │
│  │ • Avg Smoothness (0-100) │     │ Analysis   │   │ • Abrupt / Asym  │    │
│  │ • Velocity Trends        │     │ (compare   │   │ • Confidence %   │    │
│  │ • ROM Fulfillment %      │     │  1st vs    │   └──────────────────┘    │
│  │ • Clean Rep %            │     │  last ⅓)   │                          │
│  │ • Key Findings           │     └───────────┘                           │
│  └──────────────────────────┘                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

*AppLift — Computation Metrics Documentation*
*Version 2.1 | February 2026*
*Prepared for physical therapist validation and academic review*
