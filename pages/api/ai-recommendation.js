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
const SYSTEM_PROMPT = `You are AppLift's certified AI strength coach. Follow NSCA/ACSM/STE guidelines strictly.

APPLIFT EXERCISE CATALOG & ML QUALITY LABELS:
- Concentration Curls (Dumbbell, biceps): Clean, Uncontrolled Movement, Abrupt Initiation
- Overhead Extension (Dumbbell, triceps): Clean, Uncontrolled Movement, Abrupt Initiation
- Bench Press (Barbell, chest/shoulders/triceps): Clean, Uncontrolled Movement, Inclination Asymmetry
- Back Squat (Barbell, quads/glutes/hamstrings): Clean, Uncontrolled Movement, Inclination Asymmetry
- Lateral Pulldown (Weight Stack, lats/biceps): Clean, Pulling Too Fast, Releasing Too Fast
- Seated Leg Extension (Weight Stack, quads): Clean, Pulling Too Fast, Releasing Too Fast

BARBELL WEIGHTS (always include bar in total): Olympic 20kg, Women's 15kg, EZ 8kg
- IMPORTANT: recommendedLoad = bar + plates combined. weightBreakdown must show EXACTLY what to load.
- Barbell example: recommendedLoad=30 → weightBreakdown "20kg bar + 5kg per side"
- Barbell bar only: recommendedLoad=20 → weightBreakdown "Bar only (20kg)"
- Dumbbell: specify handle + plate per hand, e.g. recommendedLoad=6 → weightBreakdown "2kg handle + 4kg plates per hand"
- Weight Stack / Machine: recommendedLoad=25 → weightBreakdown "25kg on stack"
- Always tell user exactly what plates/weight to load — never just show a total

SAFETY RULES:
1. Beginners (<6mo): 5-10% max increase, start with minimal weights
2. Intermediates (6mo-2y): 5-15% if form quality is high
3. Advanced (2y+): standard progressive overload with deload every 4-6 weeks
4. ALWAYS respect injuries — reduce load or avoid contraindicated movements
5. Prioritize controlled, quality reps over heavy load

STARTING WEIGHTS (beginners/first-time):
- Barbell: empty bar only (20kg)
- Dumbbell: 3-5kg per hand
- Weight Stack: 20-25kg

REP RANGES: Strength 1-5 (85-100% 1RM, rest 2-5min), Hypertrophy 6-12 (65-85%, rest 60-120s), Endurance 12+ (<65%, rest 30-60s)

LOAD DECISIONS (based on ML data):
- Increase: clean reps >=80%, fatigue <25%, consistency >=75%
- Maintain: clean reps 60-79%, fatigue 25-40%
- Decrease: clean reps <60%, fatigue >40%, consistency <60%

OUTPUT FORMAT (JSON only, no markdown):
{
  "recommendedLoad": <kg total>,
  "sets": <int>,
  "reps": <int>,
  "restTimeSeconds": <int>,
  "estimatedCalories": <int>,
  "recommendedRestDays": <1-3>,
  "weightBreakdown": "<e.g. 'Bar only (20kg)' or '20kg bar + 10kg plates' or '5kg per hand'>",
  "rationale": "<2-3 sentences referencing specific data if available>",
  "safetyNote": "<1 sentence>",
  "guideline": "<max 15 words>",
  "nextSteps": "<1 sentence for next session>"
}

Calorie estimate: MET(3-6) x user_kg x duration_min / 60, typically 30-150 kcal per exercise.`;

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
function buildUserPrompt({ userProfile, equipment, exerciseName, pastSessions }) {
  let prompt = `EXERCISE: ${exerciseName} (${equipment})\n`;

  // User basics (compact)
  prompt += `USER: ${userProfile.age || '?'}y ${userProfile.gender || '?'}, ${userProfile.weight || '?'}${userProfile.weightUnit || 'kg'}, `;
  prompt += `exp: ${userProfile.strengthExperience || 'beginner'}, goal: ${userProfile.fitnessGoal || 'general fitness'}\n`;

  // Beginner flag
  const isBeginner = !userProfile.strengthExperience || 
                    userProfile.strengthExperience.toLowerCase().includes('beginner') ||
                    userProfile.strengthExperience.toLowerCase().includes('new') ||
                    userProfile.strengthExperience === 'Less than 6 months' ||
                    userProfile.strengthExperience === '0-6 months';
  if (isBeginner) {
    prompt += `⚠️ BEGINNER: Use minimal starting weights, prioritize form\n`;
  }

  // Injuries (compact)
  if (userProfile.injuries?.length) {
    const valid = userProfile.injuries.filter(i => i?.trim());
    if (valid.length) prompt += `INJURIES: ${valid.join(', ')}\n`;
  }

  // Past sessions (compact)
  if (pastSessions?.length > 0) {
    prompt += `\nHISTORY (${pastSessions.length} sessions, most recent first):\n`;
    pastSessions.slice(0, 3).forEach((s, i) => {
      prompt += `S${i+1}: ${s.weight || 0}kg × ${s.sets || 0}s × ${s.reps || 0}r`;
      if (s.quality) prompt += `, form: ${s.quality}`;
      if (s.fatigueScore != null) prompt += `, fatigue: ${s.fatigueScore}%`;
      if (s.consistencyScore != null) prompt += `, consistency: ${s.consistencyScore}%`;
      if (s.mlClassification) prompt += `, ML: ${s.mlClassification}`;
      if (s.date) prompt += ` (${s.date})`;
      prompt += `\n`;
    });
  } else {
    prompt += `FIRST TIME: No past data. Use conservative starting weights.\n`;
  }

  return prompt;
}

// ─── Helper: Generate weight breakdown for response ───
function generateWeightBreakdown(totalWeight, equipment) {
  const eq = equipment.toLowerCase();
  if (eq.includes('barbell')) {
    const bar = 20;
    if (totalWeight <= bar) return `Bar only (${totalWeight}kg)`;
    const platePerSide = (totalWeight - bar) / 2;
    return `${bar}kg bar + ${platePerSide}kg per side`;
  }
  if (eq.includes('dumbbell')) {
    // Assume ~2kg handle for adjustable dumbbells
    const handle = 2;
    if (totalWeight <= handle) return `Handle only (${totalWeight}kg per hand)`;
    const plates = totalWeight - handle;
    return `${handle}kg handle + ${plates}kg plates per hand`;
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
    const { userProfile, equipment, exerciseName, pastSessions, triggeredBy } = req.body;

    if (!equipment || !exerciseName) {
      return res.status(400).json({ error: 'Missing required fields: equipment, exerciseName' });
    }

    // Build the user prompt
    const userPrompt = buildUserPrompt({ userProfile: userProfile || {}, equipment, exerciseName, pastSessions });
    console.log('📝 [AI API] Generated prompt length:', userPrompt.length);

    // Call Vertex AI Gemini 2.5 Flash
    console.log('🤖 [AI API] Calling Vertex AI...');
    const vertexAI = getVertexAIClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

    const generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
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
    reps = Math.max(1, Math.min(30, Math.round(Number(reps) || 8)));
    restTimeSeconds = Math.max(15, Math.min(600, Math.round(Number(restTimeSeconds) || 90)));
    estimatedCalories = Math.max(5, Math.min(500, Math.round(Number(estimatedCalories) || 45)));

    // Recommended rest days (default 2)
    let recommendedRestDays = parsed.recommendedRestDays ?? parsed.recommendation?.recommendedRestDays ?? 2;
    recommendedRestDays = Math.max(1, Math.min(4, Math.round(Number(recommendedRestDays) || 2)));

    // Weight breakdown — use AI's if provided, otherwise generate
    let weightBreakdown = parsed.weightBreakdown ?? parsed.recommendation?.weightBreakdown ?? '';
    if (!weightBreakdown) {
      weightBreakdown = generateWeightBreakdown(weight, equipment);
    }

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
