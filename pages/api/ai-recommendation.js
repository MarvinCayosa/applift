/**
 * AI Recommendation API Route
 * Server-side endpoint that calls Vertex AI Gemini 2.5 Flash.
 * All secrets stay server-side. Never exposed to the client.
 */

import { VertexAI } from '@google-cloud/vertexai';
import admin from 'firebase-admin';

// ============================================================
// FIREBASE ADMIN INIT (reuse existing if available)
// ============================================================
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

// ============================================================
// RATE LIMITING (in-memory, per-server instance)
// ============================================================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // max 10 requests per minute per user

function checkRateLimit(uid) {
  const now = Date.now();
  const userEntry = rateLimitMap.get(uid);

  if (!userEntry || now - userEntry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(uid, { windowStart: now, count: 1 });
    return true;
  }

  if (userEntry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userEntry.count++;
  return true;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(uid);
    }
  }
}, 5 * 60 * 1000);

// ============================================================
// SYSTEM PROMPT — APPLIFT AI COACH (NSCA/ACSM/STE)
// ============================================================
const SYSTEM_PROMPT = `You are AppLift's certified AI strength coach. Apply NSCA/ACSM/STE principles using the data provided.

SYSTEM CONTEXT:
AppLift uses a single IMU sensor on the equipment to track movement. No camera. All quality data comes from accelerometer, gyroscope, magnetometer readings. NEVER mention cameras or video.

EQUIPMENT LOADING RULES:
- Barbell: recommendedLoad = bar + plates. Bar weights: Olympic 20kg, Women's 15kg, EZ 8kg. weightBreakdown must show exactly what to load (e.g. "20kg bar + 5kg per side" or "Bar only (20kg)").
- Dumbbell: 2kg handle. weightBreakdown shows handle + plates (e.g. "2kg handle + 8kg plates").
- Weight Stack: 5kg increments only. weightBreakdown shows stack weight (e.g. "25kg on stack").

SAFETY:
- Respect injuries — reduce load or avoid contraindicated movements.
- Prioritize controlled, quality reps.
- Do NOT under-load experienced users. Match load to their level.
- If user has past session data, base decisions on actual performance — not generic starting weights.

BEGINNER HANDLING:
- For beginners: prioritize form mastery before load progression. Start toward the lower end of reference ranges.
- First time with this exercise? Be conservative — let them learn the movement pattern before loading up.
- Only suggest weight increases for beginners after they demonstrate good form quality in prior sessions.
- If a beginner's cleanRepPct or movement quality was poor last session, maintain or reduce load rather than progress.
- Err on the side of caution with new users — they can always add weight, but injury sets them back.

DATA PROVIDED IN USER PROMPT:
You will receive the user's profile (experience, activity level, goal, body weight), exercise-specific reference ranges, ML quality metrics (cleanRepPct, fatigue, consistency, velocity loss, smoothness), and session history. Use ALL of this data to make your decision.

KEY METRICS (defined for reference — interpret them holistically, do not apply rigid thresholds):
- cleanRepPct: % of reps classified "Clean" by ML model. Higher = better form.
- fatigueScore: % fatigue detected. Higher = more fatigued.
- consistencyScore: % rep-to-rep consistency. Higher = more consistent.
- velocityLoss (avgVelocityLoss): % drop in peak angular velocity from first to last rep. Industry standard: <10% = excellent, 10-20% = moderate, >20% = high fatigue. This is the MOST IMPORTANT metric for load progression decisions.
- smoothness (avgSmoothness): Movement control score (0–100). Derived from mean jerk magnitude (rate of acceleration change). 75-100 = smooth/controlled, 45-74 = moderate control, <45 = jerky/rushed movement.

VELOCITY LOSS INTERPRETATION (CRITICAL FOR LOAD DECISIONS):
- <10%: Excellent power output maintained. User can handle MORE load or volume.
OUTPUT FORMAT (JSON only, no markdown):
{
  "recommendedLoad": <kg total>,
  "sets": <int>,
  "reps": <int>,
  "restTimeSeconds": <int>,
  "estimatedCalories": <int>,
  "recommendedRestDays": <1-3>,
  "weightBreakdown": "<exact loading instructions>",
  "rationale": "<2-3 sentences MUST reference specific velocity loss % and smoothness score from last session if available, explain load decision based on these metrics>",
  "safetyNote": "<1 sentence>",
  "guideline": "<max 15 words>",
  "nextSteps": "<1 sentence for next session, include specific metric targets like 'aim for <15% velocity loss' or 'maintain smoothness >70'>"
}. High velocity loss (>20%) + High smoothness (>75): User is fatigued but form is good. MAINTAIN load, add rest day.
4. High velocity loss (>20%) + Low smoothness (<45): REDUCE load by 10-15%, prioritize recovery.

Your job: Analyze the data holistically. Weigh the user's experience level, activity level, goals, session history, form quality, fatigue, velocity loss, and smoothness together. Make a balanced recommendation — safe but appropriately challenging for the user's level. ALWAYS reference specific velocity loss and smoothness values in your rationale when available.
{
  "recommendedLoad": <kg total>,
  "sets": <int>,
  "reps": <int>,
  "restTimeSeconds": <int>,
  "estimatedCalories": <int>,
  "recommendedRestDays": <1-3>,
  "weightBreakdown": "<exact loading instructions>",
  "rationale": "<2-3 sentences referencing the specific data you based this on>",
  "safetyNote": "<1 sentence>",
  "guideline": "<max 15 words>",
  "nextSteps": "<1 sentence for next session>"
}

Calorie estimate: MET(3-6) x user_kg x duration_min / 60.`;

// ============================================================
// EXERCISE-SPECIFIC CONTEXT TABLE
// Provides programmatic per-exercise guidance so the prompt
// is tailored to the selected equipment + exercise combo.
// ============================================================
const EXERCISE_CONTEXT = {
  'Concentration Curls': {
    equipment: 'Dumbbell',
    muscleGroups: ['biceps'],
    movementType: 'isolation',
    mlLabels: ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
    typicalRanges: {
      beginner:     { male: [3, 6],   female: [2, 4] },
      intermediate: { male: [8, 16],  female: [5, 10] },
      advanced:     { male: [16, 25], female: [10, 18] },
    },
    bodyweightMultiplier: null,
    notes: 'Single-arm isolation.',
  },
  'Overhead Extension': {
    equipment: 'Dumbbell',
    muscleGroups: ['triceps'],
    movementType: 'isolation',
    mlLabels: ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation'],
    typicalRanges: {
      beginner:     { male: [3, 6],   female: [2, 4] },
      intermediate: { male: [8, 16],  female: [5, 10] },
      advanced:     { male: [16, 25], female: [10, 18] },
    },
    bodyweightMultiplier: null,
    notes: 'Overhead position — requires shoulder mobility.',
  },
  'Bench Press': {
    equipment: 'Barbell',
    muscleGroups: ['chest', 'shoulders', 'triceps'],
    movementType: 'compound',
    mlLabels: ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
    typicalRanges: {
      beginner:     { male: [20, 35],  female: [15, 25] },
      intermediate: { male: [40, 75],  female: [25, 45] },
      advanced:     { male: [80, 130], female: [45, 75] },
    },
    bodyweightMultiplier: {
      beginner:     { male: [0.25, 0.45], female: [0.20, 0.35] },
      intermediate: { male: [0.55, 1.0],  female: [0.35, 0.65] },
      advanced:     { male: [1.0, 1.5],   female: [0.65, 1.0] },
    },
    notes: 'Compound press. Include bar weight (20kg) in total.',
  },
  'Back Squat': {
    equipment: 'Barbell',
    muscleGroups: ['quads', 'glutes', 'hamstrings'],
    movementType: 'compound',
    mlLabels: ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry'],
    typicalRanges: {
      beginner:     { male: [20, 45],  female: [15, 30] },
      intermediate: { male: [50, 95],  female: [30, 60] },
      advanced:     { male: [100, 170], female: [60, 110] },
    },
    bodyweightMultiplier: {
      beginner:     { male: [0.3, 0.6],  female: [0.25, 0.45] },
      intermediate: { male: [0.7, 1.25], female: [0.45, 0.85] },
      advanced:     { male: [1.25, 2.0], female: [0.85, 1.4] },
    },
    notes: 'Compound lift. Include bar weight (20kg) in total.',
  },
  'Lateral Pulldown': {
    equipment: 'Weight Stack',
    muscleGroups: ['lats', 'biceps'],
    movementType: 'compound',
    mlLabels: ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
    typicalRanges: {
      beginner:     { male: [15, 25],  female: [10, 20] },
      intermediate: { male: [30, 55],  female: [20, 40] },
      advanced:     { male: [55, 85],  female: [40, 60] },
    },
    bodyweightMultiplier: null,
    notes: 'Weight stack in 5kg increments.',
  },
  'Seated Leg Extension': {
    equipment: 'Weight Stack',
    muscleGroups: ['quads'],
    movementType: 'isolation',
    mlLabels: ['Clean', 'Pulling Too Fast', 'Releasing Too Fast'],
    typicalRanges: {
      beginner:     { male: [15, 25],  female: [10, 20] },
      intermediate: { male: [30, 55],  female: [20, 40] },
      advanced:     { male: [55, 85],  female: [40, 65] },
    },
    bodyweightMultiplier: null,
    notes: 'Weight stack in 5kg increments.',
  },
};

/**
 * Get exercise-specific context string for the AI prompt.
 * Returns weight ranges, bodyweight estimates, and exercise notes
 * tailored to the user's experience, gender, and body weight.
 */
function getExerciseContext(exerciseName, equipment, userProfile) {
  const ctx = EXERCISE_CONTEXT[exerciseName];
  if (!ctx) return '';

  const exp = (userProfile.strengthExperience || 'beginner').toLowerCase();
  const gender = (userProfile.gender || 'male').toLowerCase();
  const genderKey = gender.includes('female') || gender.includes('woman') ? 'female' : 'male';
  const bodyWeightKg = parseFloat(userProfile.weight) || 70;

  let lines = [];
  lines.push(`\nEXERCISE: ${exerciseName}`);
  lines.push(`- Type: ${ctx.movementType}`);
  lines.push(`- Muscles: ${ctx.muscleGroups.join(', ')}`);
  lines.push(`- ML labels for this exercise: ${ctx.mlLabels.join(', ')}`);

  // Typical weight ranges for this experience level
  const range = ctx.typicalRanges[exp] || ctx.typicalRanges['intermediate'];
  const [lo, hi] = range[genderKey] || range['male'];
  lines.push(`- Reference range (${exp}, ${genderKey}): ${lo}–${hi}kg`);

  // Bodyweight multiplier (for barbell compounds)
  if (ctx.bodyweightMultiplier) {
    const bwRange = ctx.bodyweightMultiplier[exp] || ctx.bodyweightMultiplier['intermediate'];
    const [bwLo, bwHi] = bwRange[genderKey] || bwRange['male'];
    const estLo = Math.round(bodyWeightKg * bwLo);
    const estHi = Math.round(bodyWeightKg * bwHi);
    lines.push(`- BW-relative estimate (${bodyWeightKg}kg × ${bwLo}–${bwHi}): ${estLo}–${estHi}kg`);
  }

  if (ctx.notes) {
    lines.push(`- ${ctx.notes}`);
  }

  return lines.join('\n') + '\n';
}

// ============================================================
// VERTEX AI CLIENT INITIALIZATION
// ============================================================
function getVertexAIClient() {
  // Support both naming conventions (VERTEX_AI_* and GCS_*)
  const project = process.env.VERTEX_AI_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCS_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const clientEmail = process.env.VERTEX_AI_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL;
  const privateKey = (process.env.VERTEX_AI_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  // Use explicit service account credentials for Vertex AI
  const vertexAI = new VertexAI({
    project,
    location,
    googleAuthOptions: {
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
      projectId: project,
    },
  });

  return vertexAI;
}

// ============================================================
// BUILD USER CONTEXT PROMPT (COMPACT)
// ============================================================
function buildUserPrompt({ userProfile, equipment, exerciseName, pastSessions, sessionContext, barWeight }) {
  let prompt = `EXERCISE: ${exerciseName} (${equipment})\n`;

  // If barbell and bar weight is known, tell the AI explicitly
  const isBarbell = (equipment || '').toLowerCase().includes('barbell');
  if (isBarbell && barWeight != null) {
    prompt += `BAR WEIGHT: ${barWeight}kg (this is the bar the user is using — recommend PLATE weight on top of this)\n`;
  }

  // User basics — include activityLevel with description
  const experience = userProfile.strengthExperience || 'beginner';
  const activityLevel = userProfile.activityLevel || 2;
  const activityDescriptions = {
    1: 'Sedentary — daily basic activities only, no regular exercise',
    2: 'Somewhat Active — 30-60 min moderate activity most days',
    3: 'Active — exercises regularly, 3-4x per week, good work capacity',
    4: 'Very Active — intense exercise 6-7x per week, high work capacity',
  };
  
  prompt += `USER: ${userProfile.age || '?'}y ${userProfile.gender || '?'}, ${userProfile.weight || '?'}${userProfile.weightUnit || 'kg'}\n`;
  prompt += `- Experience: ${experience}\n`;
  prompt += `- Activity Level: ${activityLevel}/4 — ${activityDescriptions[activityLevel] || 'Unknown'}\n`;
  prompt += `- Goal: ${userProfile.fitnessGoal || 'general fitness'}\n`;
  if (userProfile.trainingPriority) prompt += `- Training Priority: ${userProfile.trainingPriority}\n`;

  // Exercise-specific context (programmatic — tailored to this exact exercise, user profile, and gender)
  prompt += getExerciseContext(exerciseName, equipment, userProfile);

  // Injuries (compact)
  if (userProfile.injuries?.length) {
    const valid = userProfile.injuries.filter(i => i?.trim());
    if (valid.length) prompt += `INJURIES: ${valid.join(', ')}\n`;
  }

  // ── SESSION CONTEXT (time since last session, total sessions, feedback) ──
  if (sessionContext) {
    prompt += `\nSESSION CONTEXT:\n`;
    prompt += `- Total sessions with this exercise: ${sessionContext.totalSessions || 0}\n`;
    
    if (sessionContext.timeSinceLastSession) {
      prompt += `- Time since last session: ${sessionContext.timeSinceLastSession}\n`;
      
      // Recovery time — send raw hours, let AI decide
      const hours = sessionContext.hoursSinceLastSession || 0;
      if (hours > 0) {
        prompt += `- Hours since last session: ${Math.round(hours)}h\n`;
      }
    }
    
    // Previous session feedback (user's self-assessment) — data only
    if (sessionContext.lastFeedback) {
      const fb = sessionContext.lastFeedback;
      prompt += `\nUSER FEEDBACK FROM LAST SESSION:\n`;
      if (fb.feelingRating != null) {
        const feelingText = ['Very Poor', 'Poor', 'Okay', 'Good', 'Great'][fb.feelingRating - 1] || 'Unknown';
        prompt += `- Feeling: ${feelingText} (${fb.feelingRating}/5)\n`;
      }
      if (fb.difficultyRating != null) {
        const diffText = ['Too Easy', 'Easy', 'Just Right', 'Hard', 'Too Hard'][fb.difficultyRating - 1] || 'Unknown';
        prompt += `- Difficulty: ${diffText} (${fb.difficultyRating}/5)\n`;
      }
      if (fb.recommendationRating != null) {
        prompt += `- AI recommendation rating: ${fb.recommendationRating}/5\n`;
      }
      if (fb.notes) {
        prompt += `- Notes: "${fb.notes}"\n`;
      }
    }
  }

  // Past sessions — raw data, no interpretation
  if (pastSessions?.length > 0) {
    prompt += `\nSESSION HISTORY (${pastSessions.length} sessions, most recent first):\n`;
    pastSessions.slice(0, 3).forEach((s, i) => {
      prompt += `S${i+1}: ${s.weight || 0}kg × ${s.sets || 0}s × ${s.reps || 0}r`;
      if (s.cleanRepPct != null) prompt += `, cleanRepPct: ${s.cleanRepPct}%`;
      if (s.fatigueScore != null) prompt += `, fatigue: ${s.fatigueScore}%`;
      if (s.consistencyScore != null) prompt += `, consistency: ${s.consistencyScore}%`;
      if (s.avgVelocityLoss != null) prompt += `, velocityLoss: ${s.avgVelocityLoss.toFixed(1)}%`;
      if (s.avgSmoothness != null) prompt += `, smoothness: ${s.avgSmoothness.toFixed(0)}/100`;
      if (s.mlClassification) prompt += `, mlDistribution: ${s.mlClassification}`;
      if (s.date) prompt += ` (${s.date})`;
      prompt += `\n`;
    });
  } else {
    prompt += `\nFIRST TIME: No session history for this exercise.\n`;
  }

  return prompt;
}

// ─── Helper: Generate weight breakdown for response ───
function generateWeightBreakdown(totalWeight, equipment, barWeight = null) {
  const eq = equipment.toLowerCase();
  if (eq.includes('barbell')) {
    const bar = barWeight ?? 20;
    const plates = totalWeight - bar;
    // Show 0 for bar only (like dumbbells), otherwise show breakdown
    if (plates <= 0) return `${bar}kg bar + 0kg = ${totalWeight}kg`;
    const platePerSide = plates / 2;
    return `${bar}kg bar + ${platePerSide}kg per side = ${totalWeight}kg`;
  }
  if (eq.includes('dumbbell')) {
    const handle = 2;
    const plates = totalWeight - handle;
    // Show 0 for handle only, otherwise show breakdown
    if (plates <= 0) return `${handle}kg handle + 0kg = ${totalWeight}kg`;
    return `${handle}kg handle + ${plates}kg = ${totalWeight}kg`;
  }
  if (eq.includes('weight stack') || eq.includes('machine') || eq.includes('cable')) {
    return `${totalWeight}kg on stack`;
  }
  return `${totalWeight}kg total`;
}

// ============================================================
// API HANDLER
// ============================================================
export default async function handler(req, res) {
  console.log('\n🚀 [AI API] Request received:', {
    method: req.method,
    hasAuth: !!req.headers.authorization,
    body: req.body ? Object.keys(req.body) : 'no body'
  });

  // Environment variable check (log what's missing) - supports both naming conventions
  const envCheck = {
    GOOGLE_CLOUD_PROJECT: !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCS_PROJECT_ID),
    GOOGLE_CLOUD_LOCATION: true, // Has default fallback
    VERTEX_AI_CLIENT_EMAIL: !!(process.env.VERTEX_AI_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL),
    VERTEX_AI_PRIVATE_KEY: !!(process.env.VERTEX_AI_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY),
    VERTEX_AI_MODEL: true, // Has default fallback
    FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
  };
  const missingEnv = Object.entries(envCheck).filter(([k, v]) => !v).map(([k]) => k);
  if (missingEnv.length > 0) {
    console.error('❌ [AI API] Missing environment variables:', missingEnv);
    return res.status(500).json({ 
      error: 'Server configuration error. Missing environment variables.',
      missing: process.env.NODE_ENV === 'development' ? missingEnv : undefined
    });
  }

  if (req.method !== 'POST') {
    console.log('❌ [AI API] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify Firebase auth token
    const authHeader = req.headers.authorization;
    console.log('🔐 [AI API] Auth check:', {
      hasHeader: !!authHeader,
      startsWithBearer: authHeader?.startsWith('Bearer '),
      tokenLength: authHeader ? authHeader.split(' ')[1]?.length : 0
    });
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('❌ [AI API] Missing or invalid authorization token');
      return res.status(401).json({ error: 'Missing or invalid authorization token' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log('✅ [AI API] Token verified for UID:', decodedToken.uid);
    } catch (authError) {
      console.log('❌ [AI API] Token verification failed:', authError.message);
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }

    const uid = decodedToken.uid;

    // Rate limit check
    if (!checkRateLimit(uid)) {
      return res.status(429).json({ 
        error: 'Too many requests. Please wait a moment before trying again.',
        retryAfter: 60 
      });
    }

    // Validate request body
    const { userProfile, equipment, exerciseName, pastSessions, triggeredBy, sessionContext, barWeight } = req.body;

    if (!equipment || !exerciseName) {
      return res.status(400).json({ error: 'Missing required fields: equipment, exerciseName' });
    }

    // Build the user prompt
    const userPrompt = buildUserPrompt({ userProfile: userProfile || {}, equipment, exerciseName, pastSessions, sessionContext, barWeight });
    console.log('📝 [AI API] Generated prompt length:', userPrompt.length);

    // Call Vertex AI Gemini 2.5 Flash
    console.log('🤖 [AI API] Calling Vertex AI...');
    const vertexAI = getVertexAIClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

    const generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.45,   // Balanced: enough variance to avoid robotic repetition, low enough for consistency
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
    });

    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });

    // Handle different Gemini response formats
    let responseText;
    if (typeof result.response?.text === 'function') {
      responseText = result.response.text();
    } else {
      responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!responseText) {
      console.error('Empty AI response. Full result:', JSON.stringify(result.response || result, null, 2).slice(0, 500));
      throw new Error('Empty response from AI model');
    }
    
    console.log('[AI API] Raw response (first 300 chars):', responseText.slice(0, 300));

    // Parse JSON response — strip markdown fences if present
    let parsed;
    try {
      const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText);
      throw new Error('AI response was not valid JSON');
    }

    // Normalize response — handle both flat and nested formats from the model
    // Flat format: { recommendedLoad, sets, reps, restTimeSeconds, estimatedCalories, safetyJustification, ... }
    // Nested format: { recommendation: { weight, sets, reps, restTimeSeconds, estimatedCalories }, reasoning: { safetyJustification, ... } }
    let weight, sets, reps, restTimeSeconds, estimatedCalories, safetyJustification, guidelineReference, progressionNotes;

    if (parsed.recommendation && typeof parsed.recommendation === 'object') {
      // Nested format
      weight = parsed.recommendation.weight ?? parsed.recommendation.recommendedLoad ?? 0;
      sets = parsed.recommendation.sets ?? 3;
      reps = parsed.recommendation.reps ?? 8;
      restTimeSeconds = parsed.recommendation.restTimeSeconds ?? 90;
      estimatedCalories = parsed.recommendation.estimatedCalories ?? parsed.estimatedCalories ?? 45;
      safetyJustification = parsed.reasoning?.safetyNote ?? parsed.reasoning?.safetyJustification ?? parsed.safetyNote ?? parsed.safetyJustification ?? '';
      guidelineReference = parsed.reasoning?.guideline ?? parsed.reasoning?.guidelineReference ?? parsed.guideline ?? parsed.guidelineReference ?? '';
      progressionNotes = parsed.reasoning?.nextSteps ?? parsed.reasoning?.progressionNotes ?? parsed.nextSteps ?? parsed.progressionNotes ?? '';
    } else {
      // Flat format
      weight = parsed.recommendedLoad ?? parsed.weight ?? 0;
      sets = parsed.sets ?? 3;
      reps = parsed.reps ?? 8;
      restTimeSeconds = parsed.restTimeSeconds ?? 90;
      estimatedCalories = parsed.estimatedCalories ?? 45;
      safetyJustification = parsed.safetyNote ?? parsed.safetyJustification ?? '';
      guidelineReference = parsed.guideline ?? parsed.guidelineReference ?? '';
      progressionNotes = parsed.nextSteps ?? parsed.progressionNotes ?? '';
    }

    // Safety bounds — clamp values to sane ranges
    weight = Math.max(0, Math.min(500, Number(weight) || 0));
    sets = Math.max(1, Math.min(10, Math.round(Number(sets) || 3)));
    reps = Math.max(1, Math.min(15, Math.round(Number(reps) || 8)));
    restTimeSeconds = Math.max(15, Math.min(600, Math.round(Number(restTimeSeconds) || 90)));
    estimatedCalories = Math.max(5, Math.min(500, Math.round(Number(estimatedCalories) || 45)));

    // Recommended rest days (default 2)
    let recommendedRestDays = parsed.recommendedRestDays ?? parsed.recommendation?.recommendedRestDays ?? 2;
    recommendedRestDays = Math.max(1, Math.min(4, Math.round(Number(recommendedRestDays) || 2)));

    // Weight breakdown — always generate server-side to ensure consistent format
    // AI sometimes returns just a number (e.g. "25kg") instead of the handle+plates breakdown
    let weightBreakdown = generateWeightBreakdown(weight, equipment, barWeight ?? null);

    console.log('[AI API] Parsed recommendation:', { weight, sets, reps, restTimeSeconds, estimatedCalories, recommendedRestDays, weightBreakdown });

    // Extract rationale (new field) with fallback
    const rationale = parsed.rationale || '';

    return res.status(200).json({
      recommendation: {
        weight,
        sets,
        reps,
        restTimeSeconds,
        estimatedCalories,
        recommendedRestDays,
        weightBreakdown,
      },
      reasoning: {
        rationale: rationale || 'Recommendation based on your profile and established guidelines.',
        safetyJustification: safetyJustification || 'Follow proper form throughout all sets.',
        guidelineReference: guidelineReference || 'NSCA/ACSM general principles.',
        progressionNotes: progressionNotes || '',
      },
    });

  } catch (error) {
    console.error('AI Recommendation API Error:', error.message);
    console.error('Error stack:', error.stack?.slice(0, 500));

    // Check for specific error types
    if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return res.status(503).json({ 
        error: 'AI service temporarily unavailable due to quota limits. Please try again later.' 
      });
    }

    if (error.message?.includes('timeout') || error.code === 'DEADLINE_EXCEEDED') {
      return res.status(504).json({ 
        error: 'AI service timed out. Please try again.' 
      });
    }

    return res.status(500).json({ 
      error: 'Failed to generate recommendation. Please try again later.',
      detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
