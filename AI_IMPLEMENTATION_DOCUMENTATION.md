# AppLift - Generative AI Implementation Documentation

## Table of Contents
1. [Overview](#overview)
2. [AI Architecture](#ai-architecture)
3. [AI Recommendation System](#ai-recommendation-system)
4. [AI Insights Generation](#ai-insights-generation)
5. [Prompt Engineering](#prompt-engineering)
6. [Data Processing Pipeline](#data-processing-pipeline)
7. [Caching Strategy](#caching-strategy)
8. [Error Handling](#error-handling)

---

## Overview

AppLift integrates Google's Gemini AI (generative AI) to provide:
1. **Personalized Workout Recommendations** - Next workout suggestions based on performance
2. **Session Insights** - Post-workout analysis and feedback
3. **Progressive Overload Guidance** - Intelligent weight/volume progression

### AI Model Used
- **Model**: Gemini 2.5 Flash
- **Provider**: Google AI Studio
- **API**: REST API via `@google/generative-ai` SDK
- **Temperature**: 0.7 (balanced creativity and consistency)
- **Max Tokens**: 2048

---

## AI Architecture

### System Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Completes Workout                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Data Collection & Processing                    │
│  - Workout metrics (sets, reps, weight, duration)           │
│  - Movement quality scores (smoothness, consistency)         │
│  - Fatigue analysis (velocity loss, timing variation)       │
│  - Historical performance data                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Context Building                            │
│  - User profile (experience, goals, preferences)            │
│  - Recent workout history (last 5 sessions)                 │
│  - Progressive overload calculations                         │
│  - Exercise-specific guidelines                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Prompt Construction                             │
│  - System instructions (role, constraints)                   │
│  - Structured data input (JSON format)                       │
│  - Output format specification                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Gemini API Call                                 │
│  - Model: gemini-1.5-flash                                   │
│  - Temperature: 0.7                                          │
│  - Max tokens: 2048                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Response Processing                             │
│  - Parse JSON response                                       │
│  - Validate structure                                        │
│  - Extract recommendations/insights                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Caching & Storage                               │
│  - Save to Firestore (24-hour cache)                        │
│  - Store in memory cache                                     │
│  - Return to client                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## AI Recommendation System

**Location:** `services/aiRecommendationService.js`, `pages/api/ai-recommendation.js`

### Purpose
Generate personalized next workout recommendations based on:
- Current performance level
- Progressive overload principles
- Fatigue state
- Historical trends

### Implementation

#### 1. Data Collection


```javascript
// Fetch recent workout history
const recentWorkouts = await getRecentWorkouts(userId, equipment, exercise, 5);

// Calculate performance metrics
const metrics = {
  avgWeight: calculateAverage(recentWorkouts.map(w => w.weight)),
  avgReps: calculateAverage(recentWorkouts.map(w => w.totalReps)),
  avgSets: calculateAverage(recentWorkouts.map(w => w.totalSets)),
  lastWeight: recentWorkouts[0]?.weight || 0,
  lastReps: recentWorkouts[0]?.totalReps || 0,
  trend: calculateTrend(recentWorkouts)
};
```

#### 2. Progressive Overload Calculation

```javascript
// Calculate next workout targets
const progressiveOverload = {
  // Weight progression (2.5-5% increase)
  suggestedWeight: lastWeight * 1.025,
  
  // Volume progression (5-10% increase)
  suggestedVolume: (lastSets * lastReps) * 1.05,
  
  // Intensity check (prevent overtraining)
  fatigueAdjustment: lastFatigueScore > 70 ? 0.95 : 1.0
};
```

#### 3. Prompt Construction

**System Instructions:**
```javascript
const systemPrompt = `You are an expert strength training coach analyzing workout data.
Your role is to provide personalized, evidence-based recommendations for the next workout.

CRITICAL RULES:
1. Follow progressive overload principles (2.5-5% weight increase OR 5-10% volume increase)
2. Consider fatigue levels - reduce intensity if fatigue score > 70
3. Maintain proper form over heavy weights
4. Provide specific, actionable numbers (sets, reps, weight)
5. Include brief reasoning for recommendations

OUTPUT FORMAT (JSON):
{
  "recommendedSets": number,
  "recommendedReps": number,
  "recommendedWeight": number,
  "reasoning": "Brief explanation (2-3 sentences)",
  "focusArea": "strength|hypertrophy|endurance",
  "restTime": number (seconds)
}`;
```

**User Context:**


```javascript
const userContext = {
  exercise: "Bench Press",
  equipment: "Barbell",
  experienceLevel: "intermediate",
  goal: "strength",
  recentPerformance: {
    lastWorkout: {
      date: "2026-03-27",
      sets: 4,
      reps: 8,
      weight: 60,
      weightUnit: "kg",
      fatigueScore: 45,
      consistencyScore: 82
    },
    last5Workouts: [
      { date: "2026-03-27", weight: 60, totalReps: 32, fatigueScore: 45 },
      { date: "2026-03-24", weight: 57.5, totalReps: 32, fatigueScore: 38 },
      { date: "2026-03-21", weight: 57.5, totalReps: 30, fatigueScore: 42 },
      { date: "2026-03-18", weight: 55, totalReps: 32, fatigueScore: 35 },
      { date: "2026-03-15", weight: 55, totalReps: 28, fatigueScore: 40 }
    ],
    trends: {
      weightProgression: "+9% over 2 weeks",
      volumeProgression: "+14% over 2 weeks",
      fatigueLevel: "moderate"
    }
  }
};
```

#### 4. API Call

```javascript
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 2048,
    responseMimeType: "application/json"
  }
});

const result = await model.generateContent([
  { text: systemPrompt },
  { text: JSON.stringify(userContext) }
]);

const recommendation = JSON.parse(result.response.text());
```

#### 5. Response Example

```json
{
  "recommendedSets": 4,
  "recommendedReps": 8,
  "recommendedWeight": 62.5,
  "reasoning": "You've shown consistent progress with 60kg. A 4% weight increase to 62.5kg maintains progressive overload while keeping fatigue manageable. Your consistency score of 82% indicates good form, supporting this progression.",
  "focusArea": "strength",
  "restTime": 180
}
```

### Validation & Safety Checks

```javascript
// Validate AI response
function validateRecommendation(rec, lastWorkout) {
  // Check weight increase is reasonable (max 10%)
  if (rec.recommendedWeight > lastWorkout.weight * 1.1) {
    rec.recommendedWeight = lastWorkout.weight * 1.05;
  }
  
  // Check volume increase is reasonable (max 20%)
  const newVolume = rec.recommendedSets * rec.recommendedReps;
  const oldVolume = lastWorkout.sets * lastWorkout.reps;
  if (newVolume > oldVolume * 1.2) {
    rec.recommendedReps = Math.floor(oldVolume * 1.1 / rec.recommendedSets);
  }
  
  // Ensure minimum rest time
  if (rec.restTime < 60) rec.restTime = 60;
  
  return rec;
}
```

---

## AI Insights Generation

**Location:** `services/aiInsightsService.js`, `pages/api/ai-insights.js`

### Purpose
Generate post-workout insights analyzing:
- Performance quality
- Form and technique
- Fatigue management
- Progress tracking
- Actionable recommendations

### Implementation

#### 1. Metrics Collection


```javascript
const sessionMetrics = {
  // Basic metrics
  exerciseName: "Concentration Curls",
  equipment: "Dumbbell",
  weight: 13.5,
  weightUnit: "kg",
  totalSets: 2,
  totalReps: 9,
  plannedSets: 2,
  plannedReps: 6,
  durationSec: 78,
  calories: 3,
  
  // Quality metrics
  fatigueScore: 35,
  fatigueLevel: "moderate",
  consistencyScore: 78,
  
  // Per-set breakdown
  setsData: [
    {
      setNumber: 1,
      reps: 5,
      avgROM: 85,
      avgSmoothness: 72,
      classifications: { clean: 3, uncontrolled: 2 }
    },
    {
      setNumber: 2,
      reps: 4,
      avgROM: 80,
      avgSmoothness: 68,
      classifications: { clean: 2, uncontrolled: 2 }
    }
  ],
  
  // ML classification summary
  mlClassification: {
    totalReps: 9,
    clean: 5,
    uncontrolled: 4,
    cleanPercentage: 56
  }
};
```

#### 2. Prompt Construction

**System Instructions:**
```javascript
const systemPrompt = `You are an expert fitness coach analyzing a completed workout session.
Provide actionable insights based on the workout data.

ANALYSIS FRAMEWORK:
1. Performance Quality (form, consistency, ROM)
2. Fatigue Management (velocity loss, timing)
3. Progress Assessment (vs. planned workout)
4. Technique Feedback (specific improvements)
5. Next Steps (recovery, progression)

TONE: Encouraging but honest. Celebrate wins, address issues constructively.

OUTPUT FORMAT (JSON):
{
  "summary": "2-3 sentence overview",
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["area 1", "area 2"],
  "keyInsight": "Most important takeaway",
  "nextSteps": ["action 1", "action 2"]
}`;
```

#### 3. Context Building

```javascript
const analysisContext = {
  session: sessionMetrics,
  interpretation: {
    performanceVsPlanned: totalReps > plannedReps ? "exceeded" : "met",
    formQuality: mlClassification.cleanPercentage > 70 ? "good" : "needs work",
    fatigueLevel: fatigueScore < 50 ? "manageable" : "significant",
    consistency: consistencyScore > 75 ? "excellent" : "variable"
  },
  exerciseGuidelines: {
    name: "Concentration Curls",
    focusPoints: ["controlled eccentric", "full ROM", "elbow stability"],
    commonIssues: ["swinging", "incomplete ROM", "rushing reps"]
  }
};
```

#### 4. Response Example

```json
{
  "summary": "Strong session with 9 reps completed (150% of planned). Form quality was mixed with 56% clean reps, indicating room for improvement in movement control.",
  "strengths": [
    "Exceeded rep target by 50% - excellent work capacity",
    "Maintained consistent ROM across both sets (80-85°)",
    "Fatigue remained moderate (35/100) - good recovery between sets"
  ],
  "improvements": [
    "Focus on slower eccentric phase - 44% of reps showed rushed lowering",
    "Reduce weight slightly to improve form quality (aim for 80%+ clean reps)",
    "Ensure elbow stays stationary throughout movement"
  ],
  "keyInsight": "You have the strength for this weight, but prioritizing form over volume will yield better long-term results. Consider dropping to 12kg for your next session to master the movement pattern.",
  "nextSteps": [
    "Next workout: 2 sets × 8 reps at 12kg with 3-second eccentric",
    "Film a set to check elbow stability and ROM",
    "Rest 48 hours before training biceps again"
  ]
}
```

### Insight Categories

The AI generates insights across multiple dimensions:

#### Performance Insights
- Rep completion vs. target
- Volume progression
- Intensity management
- Time efficiency

#### Form Insights
- Movement quality scores
- ROM consistency
- Phase timing balance
- Common technique errors

#### Fatigue Insights
- Velocity loss patterns
- Set-to-set degradation
- Recovery indicators
- Overtraining warnings

#### Progress Insights
- Week-over-week trends
- Strength gains
- Volume capacity
- Plateau detection

---

## Prompt Engineering

### Best Practices

#### 1. Clear Role Definition


```javascript
// ✅ GOOD: Specific role with constraints
"You are an expert strength training coach with 10+ years experience.
You analyze workout data and provide evidence-based recommendations.
You prioritize safety and proper form over heavy weights."

// ❌ BAD: Vague role
"You are a fitness AI."
```

#### 2. Structured Output Format

```javascript
// ✅ GOOD: JSON schema specified
"OUTPUT FORMAT (JSON):
{
  \"recommendedSets\": number,
  \"recommendedReps\": number,
  \"reasoning\": string
}"

// ❌ BAD: Unstructured
"Give me a recommendation."
```

#### 3. Context-Rich Input

```javascript
// ✅ GOOD: Comprehensive context
{
  exercise: "Bench Press",
  lastWorkout: { sets: 4, reps: 8, weight: 60 },
  history: [...last5Workouts],
  fatigueScore: 45,
  goal: "strength"
}

// ❌ BAD: Minimal context
{
  exercise: "Bench Press",
  weight: 60
}
```

#### 4. Safety Constraints

```javascript
// ✅ GOOD: Explicit safety rules
"SAFETY RULES:
1. Never recommend weight increase > 10%
2. If fatigue score > 70, recommend deload
3. Prioritize form over progression
4. Include rest time recommendations"

// ❌ BAD: No constraints
"Recommend the next workout."
```

### Prompt Templates

#### Recommendation Prompt Template
```javascript
const recommendationPrompt = `
ROLE: Expert strength coach
TASK: Generate next workout recommendation
CONTEXT: ${JSON.stringify(userContext)}

CONSTRAINTS:
- Weight increase: 2.5-5% max
- Volume increase: 5-10% max
- Consider fatigue level
- Maintain proper form

OUTPUT: JSON with sets, reps, weight, reasoning
`;
```

#### Insights Prompt Template
```javascript
const insightsPrompt = `
ROLE: Performance analyst
TASK: Analyze completed workout
CONTEXT: ${JSON.stringify(sessionMetrics)}

ANALYSIS AREAS:
1. Performance vs. plan
2. Form quality (${cleanPercentage}% clean reps)
3. Fatigue management
4. Progress indicators

OUTPUT: JSON with summary, strengths, improvements, next steps
`;
```

---

## Data Processing Pipeline

### Input Data Transformation

#### 1. Raw Data Collection
```javascript
// From Firestore
const workoutLog = {
  results: {
    totalSets: 2,
    totalReps: 9,
    calories: 3,
    setData: [...],
    fatigueScore: 35,
    consistencyScore: 78
  },
  planned: {
    sets: 2,
    reps: 6,
    weight: 13.5
  }
};
```

#### 2. Data Enrichment
```javascript
// Add calculated metrics
const enrichedData = {
  ...workoutLog,
  derived: {
    volumeLoad: totalReps * weight,
    intensityRPE: calculateRPE(fatigueScore),
    formQuality: cleanReps / totalReps,
    performanceRatio: totalReps / plannedReps
  }
};
```

#### 3. Context Assembly
```javascript
// Combine with historical data
const fullContext = {
  current: enrichedData,
  history: recentWorkouts,
  trends: calculateTrends(recentWorkouts),
  userProfile: {
    experience: "intermediate",
    goal: "strength",
    preferences: {...}
  }
};
```

### Output Data Processing

#### 1. Response Parsing
```javascript
// Parse AI response
const rawResponse = await model.generateContent(prompt);
const parsed = JSON.parse(rawResponse.text());
```

#### 2. Validation
```javascript
// Validate structure
const validated = validateAIResponse(parsed, schema);
if (!validated.isValid) {
  throw new Error(`Invalid AI response: ${validated.errors}`);
}
```

#### 3. Post-Processing
```javascript
// Apply safety checks
const safe = applySafetyConstraints(validated.data);

// Round numbers
safe.recommendedWeight = roundToNearestPlate(safe.recommendedWeight);
safe.restTime = Math.round(safe.restTime / 5) * 5; // Round to 5s
```

---

## Caching Strategy

### Multi-Layer Cache

#### Layer 1: Memory Cache (Runtime)
```javascript
const memoryCache = new Map();

function getCachedRecommendation(key) {
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour
    return cached.data;
  }
  return null;
}
```

#### Layer 2: Firestore (Persistent)
```javascript
// Save to Firestore with TTL
await setDoc(doc(db, 'aiCache', cacheKey), {
  data: recommendation,
  createdAt: serverTimestamp(),
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
});
```

#### Layer 3: Client SessionStorage
```javascript
// Cache on client for session duration
sessionStorage.setItem(
  `ai_rec_${equipment}_${exercise}`,
  JSON.stringify({ data: recommendation, timestamp: Date.now() })
);
```

### Cache Invalidation

```javascript
// Invalidate on new workout completion
async function bustRecommendationCache(userId, equipment, exercise) {
  // Clear memory cache
  memoryCache.delete(`${userId}_${equipment}_${exercise}`);
  
  // Clear Firestore cache
  await deleteDoc(doc(db, 'aiCache', `${userId}_${equipment}_${exercise}`));
  
  // Clear client cache
  sessionStorage.removeItem(`ai_rec_${equipment}_${exercise}`);
}
```

### Cache Strategy Decision Tree
```
Request for AI recommendation
  ↓
Check memory cache (< 1 hour old)?
  ↓ Yes → Return cached
  ↓ No
Check Firestore cache (< 24 hours old)?
  ↓ Yes → Return cached + update memory
  ↓ No
Check if workout completed recently (< 5 min)?
  ↓ Yes → Generate new recommendation
  ↓ No
Check client cache (< 1 hour old)?
  ↓ Yes → Return cached
  ↓ No → Generate new recommendation
```

---

## Error Handling

### API Error Handling

```javascript
async function generateRecommendation(context) {
  try {
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text());
  } catch (error) {
    if (error.message.includes('quota')) {
      // API quota exceeded
      return getFallbackRecommendation(context);
    } else if (error.message.includes('timeout')) {
      // Request timeout
      return getCachedRecommendation(context) || getFallbackRecommendation(context);
    } else if (error.message.includes('invalid')) {
      // Invalid response format
      console.error('AI response parsing failed:', error);
      return getFallbackRecommendation(context);
    } else {
      // Unknown error
      throw error;
    }
  }
}
```

### Fallback Recommendations

```javascript
function getFallbackRecommendation(context) {
  // Rule-based fallback when AI fails
  const { lastWorkout } = context;
  
  return {
    recommendedSets: lastWorkout.sets,
    recommendedReps: lastWorkout.reps,
    recommendedWeight: lastWorkout.weight * 1.025, // 2.5% increase
    reasoning: "Based on progressive overload principles (AI unavailable)",
    focusArea: "strength",
    restTime: 120
  };
}
```

### Response Validation

```javascript
function validateAIResponse(response, schema) {
  const errors = [];
  
  // Check required fields
  for (const field of schema.required) {
    if (!(field in response)) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Check data types
  if (typeof response.recommendedSets !== 'number') {
    errors.push('recommendedSets must be a number');
  }
  
  // Check value ranges
  if (response.recommendedSets < 1 || response.recommendedSets > 10) {
    errors.push('recommendedSets must be between 1 and 10');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
```

### Retry Logic

```javascript
async function generateWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
}
```

---

## Performance Optimization

### Request Batching

```javascript
// Batch multiple AI requests
async function batchGenerateInsights(sessions) {
  const promises = sessions.map(session => 
    generateInsights(session).catch(err => ({
      error: err.message,
      session: session.id
    }))
  );
  
  return Promise.all(promises);
}
```

### Lazy Loading

```javascript
// Only generate insights when user views the page
useEffect(() => {
  if (userViewedInsights && !insights) {
    generateInsights(sessionData);
  }
}, [userViewedInsights]);
```

### Response Streaming (Future Enhancement)

```javascript
// Stream AI response for faster perceived performance
const stream = await model.generateContentStream(prompt);
for await (const chunk of stream) {
  updateUI(chunk.text());
}
```

---

## Monitoring & Analytics

### AI Usage Tracking

```javascript
// Track AI API calls
await logAIUsage({
  userId,
  feature: 'recommendation',
  model: 'gemini-1.5-flash',
  tokensUsed: result.usageMetadata.totalTokenCount,
  latency: Date.now() - startTime,
  cached: false
});
```

### Quality Metrics

```javascript
// Track recommendation quality
await logRecommendationQuality({
  recommendationId,
  userAccepted: true,
  userModified: false,
  completionRate: 0.95, // User completed 95% of recommended reps
  feedback: 'helpful'
});
```

### Cost Monitoring

```javascript
// Estimate API costs
const estimatedCost = (tokensUsed / 1000000) * COST_PER_MILLION_TOKENS;
console.log(`AI request cost: $${estimatedCost.toFixed(4)}`);
```

---

## Best Practices

### 1. Prompt Design
- ✅ Be specific about role and constraints
- ✅ Provide structured output format
- ✅ Include safety rules
- ✅ Give rich context
- ❌ Don't use vague instructions
- ❌ Don't rely on unstructured output

### 2. Data Quality
- ✅ Validate input data before sending to AI
- ✅ Enrich with calculated metrics
- ✅ Include historical context
- ❌ Don't send raw, unprocessed data
- ❌ Don't omit important context

### 3. Error Handling
- ✅ Implement fallback logic
- ✅ Validate AI responses
- ✅ Use retry with backoff
- ❌ Don't fail silently
- ❌ Don't trust AI output blindly

### 4. Performance
- ✅ Cache aggressively
- ✅ Invalidate cache appropriately
- ✅ Use lazy loading
- ❌ Don't generate on every request
- ❌ Don't block UI on AI calls

### 5. Cost Management
- ✅ Monitor token usage
- ✅ Use caching to reduce calls
- ✅ Implement rate limiting
- ❌ Don't make unnecessary API calls
- ❌ Don't use expensive models for simple tasks

---

## Future Enhancements

### 1. Multi-Modal AI
- Image analysis for form checking
- Video analysis for technique feedback
- Voice commands for hands-free interaction

### 2. Personalization
- User-specific prompt tuning
- Learning from user feedback
- Adaptive recommendation strategies

### 3. Advanced Features
- Injury risk prediction
- Periodization planning
- Competition preparation guidance
- Nutrition recommendations

### 4. Model Optimization
- Fine-tuned models for fitness domain
- Smaller, faster models for real-time feedback
- On-device inference for privacy

---

## Conclusion

AppLift's AI implementation leverages Google's Gemini to provide intelligent, personalized workout guidance. The system combines:
- **Structured prompts** for consistent, high-quality outputs
- **Rich context** from workout data and user history
- **Safety constraints** to prevent harmful recommendations
- **Multi-layer caching** for performance and cost efficiency
- **Robust error handling** with fallback strategies

This creates a reliable, helpful AI assistant that enhances the workout experience while maintaining safety and accuracy.
