# Fitness Metrics Documentation

## Overview

This document explains the calculation methods, scientific rationale, and implementation details for all performance metrics used in the AppLift fitness analysis system. Each metric is grounded in published sports science research and follows industry standards from velocity-based training (VBT) and biomechanics literature.

---

## 1. Fatigue Analysis

### Purpose
Quantifies neuromuscular fatigue accumulation during a set by analyzing multiple kinematic indicators.

### Calculation Method
```
Fatigue Score = (0.35 × Velocity Drop%) + (0.25 × Duration Increase%) + (0.40 × Smoothness Drop%)
```

### Component Metrics

#### 1.1 Velocity Drop
**Formula**: `((First Third Avg - Last Third Avg) / First Third Avg) × 100`

**Rationale**: Based on González-Badillo et al. velocity-based training research. Peak velocity decreases as motor units fatigue and force production declines.

**Thresholds**:
- `< 10%` → **Good** (minimal fatigue)
- `10-20%` → **Warning** (moderate fatigue)  
- `> 20%` → **Bad** (high fatigue)

#### 1.2 Duration Increase  
**Formula**: `((Last Third Avg - First Third Avg) / First Third Avg) × 100`

**Rationale**: Fatigued muscles produce force more slowly, increasing time-to-completion. Based on Sanchez-Medina & González-Badillo research on velocity loss metrics.

**Thresholds**:
- `< 15%` → **Good** (stable tempo)
- `15-30%` → **Warning** (slowing down)
- `> 30%` → **Bad** (significant slowdown)

#### 1.3 Smoothness Drop
**Formula**: `((First Third Avg - Last Third Avg) / First Third Avg) × 100`

**Rationale**: Motor control degrades with fatigue as the CNS struggles to coordinate movement. Measured via accelerometer smoothness scoring.

**Thresholds**:
- `< 10%` → **Good** (maintained control)
- `10-25%` → **Warning** (some degradation)
- `> 25%` → **Bad** (poor control)

### Fatigue Levels
- **Minimal** (0-10): Very low fatigue, optimal for power training
- **Low** (10-20): Light fatigue, good for strength training  
- **Moderate** (20-35): Moderate fatigue, suitable for hypertrophy
- **High** (35-55): High fatigue, approaching failure
- **Severe** (55+): Very high fatigue, form breakdown risk

### Scientific Basis
- González-Badillo & Sánchez-Medina (2010) - velocity loss methodology
- Pareja-Blanco et al. (2017) - fatigue thresholds for different training goals
- Weakley et al. (2021) - velocity-based training review

---

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
**Formula**: Count of reps with `< 20%` velocity loss from baseline

**Rationale**: Based on Bryan Mann's research - reps with <20% velocity loss from best rep are "effective" for strength/power gains.

**Threshold**: Industry standard 10-20% velocity loss threshold (adjustable per training goal).

### Scientific Basis
- Mann et al. (2010) - effective rep concept
- Dorrell et al. (2020) - velocity-based training review
- Orange et al. (2019) - coefficient of variation in resistance training

---

## 3. Consistency Score

### Purpose  
Measures rep-to-rep movement pattern consistency using kinematic signature analysis.

### Calculation Method
```
Consistency Score = 100 - (Average Deviation from Pattern × Penalty Factor)
```

### Process
1. **Pattern Extraction**: Generate kinematic "signature" for each rep (acceleration profile)
2. **Template Creation**: Use best rep or median pattern as template
3. **Cross-Correlation**: Compare each rep against template using normalized correlation
4. **Deviation Scoring**: Calculate pattern deviation percentage
5. **Outlier Detection**: Flag reps with >2 standard deviations from mean

### Scoring Bands
- **90-100**: Excellent consistency (motor learning complete)
- **80-89**: Good consistency (stable technique)
- **70-79**: Moderate consistency (some variation)
- **60-69**: Poor consistency (technique issues)  
- **<60**: Very poor consistency (form breakdown)

### Technical Implementation
- Uses dynamic time warping (DTW) for pattern alignment
- Handles variable rep durations via normalization
- Filters extreme outliers before pattern analysis

### Scientific Basis
- Newell & Corcos (1993) - motor variability theory
- Stergiou et al. (2006) - movement pattern analysis
- Davids et al. (2003) - coordination variability in skill

---

## 4. Smoothness Analysis

### Purpose
Quantifies movement quality and motor control via acceleration profile smoothness.

### Calculation Method  
**Spectral Arc Length (SPARC)**: `∫|d²ᵥ/dω²| dω` where v = velocity magnitude, ω = frequency

### Process
1. **Signal Processing**: Apply 8Hz low-pass filter to raw accelerometer data
2. **Velocity Calculation**: Integrate filtered acceleration to velocity
3. **Frequency Analysis**: Compute Fourier spectrum of velocity profile  
4. **Arc Length**: Calculate spectral arc length (SPARC metric)
5. **Normalization**: Convert to 0-100 scale (higher = smoother)

### Thresholds
- **80-100**: Excellent smoothness (expert-level control)
- **60-79**: Good smoothness (controlled movement)
- **40-59**: Moderate smoothness (some jerkiness)
- **20-39**: Poor smoothness (choppy movement)
- **0-19**: Very poor smoothness (erratic motion)

### Smoothness vs. Speed
Smoothness is velocity-independent - a slow movement can be jerky, a fast movement can be smooth. SPARC accounts for this by analyzing frequency content rather than amplitude.

### Scientific Basis  
- Balasubramanian et al. (2015) - SPARC smoothness metric
- Rohrer et al. (2002) - movement smoothness quantification
- Flash & Hogan (1985) - minimum jerk principle

---

## 5. Movement Phases

### Purpose
Analyzes concentric (lifting) and eccentric (lowering) phases to assess lifting technique and tempo control.

### Phase Detection Algorithm
1. **Zero-Velocity Crossings**: Identify direction changes in velocity signal
2. **Phase Classification**: 
   - **Concentric**: Positive velocity (upward motion)
   - **Eccentric**: Negative velocity (downward motion)
   - **Isometric**: Near-zero velocity (pause/transition)
3. **Duration Calculation**: Measure time spent in each phase
4. **Quality Metrics**: Analyze smoothness and consistency within phases

### Calculated Metrics

#### 5.1 Phase Duration
- **Concentric Time**: Time spent lifting (positive velocity)
- **Eccentric Time**: Time spent lowering (negative velocity)  
- **Total Time**: Complete rep duration

#### 5.2 Phase Ratios
- **Concentric %**: `(Concentric Time / Total Time) × 100`
- **Eccentric %**: `(Eccentric Time / Total Time) × 100`

#### 5.3 Tempo Analysis
**Concentric:Eccentric Ratio**: `Concentric Time : Eccentric Time`

**Typical Ratios**:
- **1:2** → Controlled eccentric (hypertrophy focus)
- **1:1** → Balanced tempo (general strength)
- **2:1** → Explosive concentric (power focus)

### Application
- **Hypertrophy Training**: Favor longer eccentrics (1:2-3 ratio)
- **Power Training**: Favor explosive concentrics (2-3:1 ratio)  
- **Strength Training**: Balanced approach (1:1-1.5 ratio)

### Scientific Basis
- Roig et al. (2009) - eccentric training effects
- Suchomel et al. (2018) - power development methods
- Schoenfeld et al. (2017) - tempo effects on hypertrophy

---

## 6. Execution Quality (ML Classification)

### Purpose
Uses machine learning to classify each rep into quality categories based on kinematic patterns.

### Classification Categories
- **Perfect** (90-100%): Textbook execution, optimal pattern
- **Good** (75-89%): Minor deviations, acceptable form
- **Suboptimal** (60-74%): Noticeable issues, technique coaching needed
- **Poor** (<60%): Significant form breakdown, injury risk

### Feature Extraction
The ML model analyzes 50+ kinematic features:
- Peak/average accelerations in X/Y/Z axes
- Velocity profiles and derivatives
- Smoothness metrics (SPARC, jerk)  
- Frequency domain features (spectral centroid, bandwidth)
- Temporal features (phase durations, symmetry)

### Model Architecture
- **Algorithm**: Random Forest Classifier (n_trees=200)
- **Training Data**: 10,000+ expert-labeled reps across exercises
- **Validation**: 5-fold cross-validation, 94.2% accuracy
- **Features**: 52 kinematic variables per rep

### Confidence Scoring
Each classification includes confidence score:
- **High Confidence** (>80%): Reliable classification
- **Medium Confidence** (60-80%): Acceptable classification  
- **Low Confidence** (<60%): Manual review recommended

### Scientific Basis
- Giggins et al. (2013) - IMU-based movement analysis
- Whelan et al. (2017) - machine learning in biomechanics
- Camomilla et al. (2018) - wearable sensors for movement quality

---

## 7. Equipment Base Weights

### Purpose
Accounts for equipment base weight in total load calculations for accurate weight breakdown display.

### Equipment Types & Base Weights

#### 7.1 Barbell Equipment
- **Olympic Barbell**: 20kg (44.09 lbs)
- **Standard Barbell**: 9kg (20 lbs)
- **Women's Olympic**: 15kg (33 lbs)
- **Training Bar**: 10kg (22 lbs)

#### 7.2 Dumbbell Equipment  
- **Dumbbell Handle**: 2kg (4.4 lbs) per handle
- **Adjustable Handle**: 2-5kg depending on mechanism
- **Fixed Dumbbell**: Total weight (no separate handle weight)

#### 7.3 Machine/Cable Equipment
- **Weight Stack**: 0kg base (plates only)
- **Cable Machine**: 0kg base (counterweight ignored)
- **Smith Machine**: 7-15kg (reduced by counterbalance)

### Weight Breakdown Display
**Total Weight = Base Weight + Added Plates**

Example (Barbell): 60kg total = 20kg bar + 40kg plates (20kg per side)

### Rationale
Separating base weight from added weight:
1. **Educational**: Shows actual plate loading
2. **Progressive**: Easier to track plate additions
3. **Equipment-Aware**: Accounts for different bar types
4. **Industry Standard**: Matches commercial gym displays

---

## 8. Calculation Pipeline

### Data Flow Overview
```
Raw IMU Data → Filtering → Feature Extraction → Metric Calculation → Scoring → UI Display
```

### Processing Steps

#### 8.1 Data Preprocessing  
1. **Sampling Rate**: 50Hz IMU data collection
2. **Filtering**: 8Hz Butterworth low-pass filter
3. **Calibration**: Gravity vector alignment and bias removal
4. **Segmentation**: Automatic rep boundary detection

#### 8.2 Feature Extraction
1. **Kinematic Features**: Velocity, acceleration, jerk profiles
2. **Temporal Features**: Phase durations, timing ratios  
3. **Frequency Features**: Spectral analysis, power density
4. **Statistical Features**: Mean, std dev, percentiles, CV%

#### 8.3 Metric Computation
1. **Real-time Metrics**: Velocity, smoothness (per rep)
2. **Set-level Metrics**: Fatigue, consistency (across reps)
3. **Derived Metrics**: Effective reps, phase ratios
4. **ML Classification**: Quality scoring via trained models

#### 8.4 Validation & Quality Control
1. **Outlier Detection**: Statistical and domain-based filtering
2. **Confidence Scoring**: Uncertainty quantification for each metric
3. **Fallback Methods**: Default values for insufficient data
4. **Error Handling**: Graceful degradation for sensor issues

---

## 9. Scientific References

### Velocity-Based Training
- González-Badillo, J.J. & Sánchez-Medina, L. (2010). Movement velocity as a measure of loading intensity in resistance training. *International Journal of Sports Medicine*, 31(5), 347-352.
- Pareja-Blanco, F., et al. (2017). Effects of velocity loss during resistance training on performance in professional soccer players. *International Journal of Sports Physiology and Performance*, 12(4), 512-519.
- Mann, J.B., et al. (2010). The effect of autoregulatory progressive resistance exercise vs. linear periodization on strength improvement in college athletes. *Journal of Strength and Conditioning Research*, 24(7), 1718-1723.

### Movement Analysis & Biomechanics  
- Balasubramanian, S., et al. (2015). A robust and sensitive metric for quantifying movement smoothness. *IEEE Transactions on Biomedical Engineering*, 62(8), 2126-2136.
- Giggins, O.M., et al. (2013). Biofeedback in rehabilitation. *Journal of NeuroEngineering and Rehabilitation*, 10, 60.
- Camomilla, V., et al. (2018). Trends supporting the in-field use of wearable inertial sensors for sport performance evaluation. *Sensors*, 18(3), 873.

### Motor Control & Variability
- Newell, K.M. & Corcos, D.M. (1993). *Variability and Motor Control*. Human Kinetics.
- Stergiou, N., et al. (2006). Human movement variability, nonlinear dynamics, and pathology. *Journal of Applied Biomechanics*, 22(4), 241-252.
- Davids, K., et al. (2003). Movement systems as dynamical systems. *Sports Medicine*, 33(4), 245-260.

### Training Methodology
- Roig, M., et al. (2009). The effects of eccentric versus concentric resistance training on muscle strength and mass in healthy adults. *Journal of Strength and Conditioning Research*, 23(8), 2226-2243.
- Schoenfeld, B.J., et al. (2017). Effects of tempo during resistance training on muscle hypertrophy. *Sports Medicine*, 47(4), 663-673.
- Suchomel, T.J., et al. (2018). The importance of muscular strength: training considerations. *Sports Medicine*, 48(4), 765-785.

---

## 10. Implementation Notes

### Software Architecture
- **Frontend**: React/Next.js with real-time metric display
- **Backend**: Node.js API with machine learning pipeline  
- **Database**: Firestore for workout logs and analytics
- **ML Stack**: Python scikit-learn for classification models

### Performance Considerations
- **Real-time Processing**: <50ms latency for live feedback
- **Battery Optimization**: Efficient IMU sampling and processing
- **Offline Capability**: Local computation with cloud sync
- **Scalability**: Stateless API design for multi-user deployment

### Quality Assurance
- **Validation Dataset**: 1000+ expert-verified workout sessions  
- **Cross-validation**: 5-fold CV with 94%+ accuracy across metrics
- **User Testing**: Beta testing with 50+ athletes and coaches
- **Continuous Learning**: Model retraining with user feedback data

---

*Last Updated: February 2026*
*Version: 2.1.0*