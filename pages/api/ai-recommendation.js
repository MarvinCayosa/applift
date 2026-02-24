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
// SYSTEM PROMPT — NSCA / ACSM / STE GUIDELINES EMBEDDED
// ============================================================
const SYSTEM_PROMPT = `You are a certified strength and conditioning coach AI for AppLift, a fitness training application.

ALL recommendations MUST strictly comply with established exercise science guidelines from:
- NSCA (National Strength and Conditioning Association)
- ACSM (American College of Sports Medicine)
- STE (Strength and Conditioning Education) principles

SAFETY RULES (NON-NEGOTIABLE):
1. NEVER recommend loads exceeding safe progressive overload thresholds.
2. For beginners (less than 6 months experience): use ONLY conservative progression (5-10% load increase maximum between sessions).
3. For intermediates (6 months - 2 years): moderate progression (5-15% load increase is acceptable if form quality is high).
4. For advanced (2+ years): allow standard progressive overload with appropriate deload recommendations.
5. ALWAYS respect user-reported injuries and illnesses — reduce load, suggest modifications, or avoid contraindicated movements entirely.
6. Prioritize CONTROLLED, QUALITY repetitions over heavy load.
7. Rest periods MUST follow evidence-based ranges:
   - Strength (1-5 reps): 2-5 minutes
   - Hypertrophy (6-12 reps): 60-120 seconds
   - Endurance (12+ reps): 30-60 seconds
8. NEVER provide medical advice — defer to medical professionals for injuries.
9. If injury data is present, EXPLICITLY state movement modifications or load adjustments.
10. Total volume (sets × reps × load) must be appropriate for the user's training level and goals.

REP RANGES BY GOAL (NSCA/ACSM Guidelines):
- Maximal Strength: 1-5 reps, 85-100% 1RM, 3-6 sets
- Hypertrophy: 6-12 reps, 65-85% 1RM, 3-5 sets  
- Muscular Endurance: 12-20+ reps, <65% 1RM, 2-4 sets
- General Fitness: 8-15 reps, moderate load, 2-3 sets

PROGRESSIVE OVERLOAD PRINCIPLES:
- Increase load only when the user can complete all prescribed reps with proper form
- For first-time exercises with no data: start at the LOWER end of appropriate ranges
- Consider the user's body weight, training age, and exercise complexity

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object, no markdown, no code fences, no explanation outside the JSON. The JSON must have this exact structure:
{
  "recommendedLoad": <number in kg, use 0 if bodyweight only>,
  "sets": <integer>,
  "reps": <integer>,
  "restTimeSeconds": <integer, rest between sets in seconds>,
  "estimatedCalories": <integer, estimated kcal burned for the entire exercise based on sets, reps, load, and user weight>,
  "safetyJustification": "<1 SHORT sentence, max 30 words, explaining safety considerations>",
  "guidelineReference": "<short reference, max 15 words, e.g. ACSM Hypertrophy Guidelines>",
  "progressionNotes": "<1 SHORT sentence, max 25 words, about what to focus on>"
}

CALORIE ESTIMATION GUIDELINES:
- Base MET value for resistance training varies by intensity (3-6 METs)
- Heavier loads and more sets = higher calorie burn
- Formula estimate: (MET × user_weight_kg × duration_minutes) / 60
- Duration estimate: (sets × reps × 3 seconds per rep + sets × restTimeSeconds) / 60 minutes
- Provide a reasonable estimate (typically 30-150 kcal for a single exercise)`;

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
// BUILD USER CONTEXT PROMPT
// ============================================================
function buildUserPrompt({ userProfile, equipment, exerciseName, pastSessions }) {
  let prompt = `Generate a workout recommendation for the following:\n\n`;
  prompt += `EXERCISE: ${exerciseName}\n`;
  prompt += `EQUIPMENT: ${equipment}\n\n`;

  prompt += `USER PROFILE:\n`;
  if (userProfile.age) prompt += `- Age: ${userProfile.age}\n`;
  if (userProfile.gender) prompt += `- Sex: ${userProfile.gender}\n`;
  if (userProfile.weight) prompt += `- Weight: ${userProfile.weight} ${userProfile.weightUnit || 'kg'}\n`;
  if (userProfile.height) prompt += `- Height: ${userProfile.height} ${userProfile.heightUnit || 'cm'}\n`;
  if (userProfile.strengthExperience) prompt += `- Training Experience: ${userProfile.strengthExperience}\n`;
  if (userProfile.activityLevel) prompt += `- Activity Level: ${userProfile.activityLevel}\n`;
  if (userProfile.fitnessGoal) prompt += `- Primary Goal: ${userProfile.fitnessGoal}\n`;
  if (userProfile.trainingPriority) prompt += `- Training Priority: ${userProfile.trainingPriority}\n`;

  // Injury / Illness data
  if (userProfile.injuries && userProfile.injuries.length > 0) {
    const validInjuries = userProfile.injuries.filter(i => i && i.trim());
    if (validInjuries.length > 0) {
      prompt += `\nINJURIES / ILLNESSES (MUST account for these):\n`;
      validInjuries.forEach((injury, i) => {
        prompt += `- ${injury}\n`;
      });
      prompt += `\nIMPORTANT: Adjust recommendations to accommodate the above conditions. Reduce load if necessary. Suggest form modifications. If the exercise is contraindicated for any listed condition, recommend a much lighter load with explicit caution.\n`;
    }
  }

  // Past session data (summarized, not raw IMU)
  if (pastSessions && pastSessions.length > 0) {
    prompt += `\nPAST SESSION DATA (most recent first):\n`;
    pastSessions.slice(0, 5).forEach((session, i) => {
      prompt += `Session ${i + 1}:\n`;
      if (session.weight) prompt += `  - Load: ${session.weight} ${session.weightUnit || 'kg'}\n`;
      if (session.sets) prompt += `  - Sets completed: ${session.sets}\n`;
      if (session.reps) prompt += `  - Reps per set: ${session.reps}\n`;
      if (session.quality) prompt += `  - Execution quality: ${session.quality}\n`;
      if (session.date) prompt += `  - Date: ${session.date}\n`;
      if (session.performance) prompt += `  - Performance summary: ${session.performance}\n`;
    });
    prompt += `\nUse this data to apply progressive overload appropriately. If the user's form quality was poor in recent sessions, do NOT increase load.\n`;
  } else {
    prompt += `\nNO PAST SESSION DATA available for this exercise. This is the user's first time.\n`;
    prompt += `Generate a CONSERVATIVE initial recommendation based on the user's profile and established guidelines.\n`;
    prompt += `Start at the LOWER end of appropriate ranges for safety.\n`;
  }

  return prompt;
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
      safetyJustification = parsed.reasoning?.safetyJustification ?? parsed.safetyJustification ?? '';
      guidelineReference = parsed.reasoning?.guidelineReference ?? parsed.guidelineReference ?? '';
      progressionNotes = parsed.reasoning?.progressionNotes ?? parsed.progressionNotes ?? '';
    } else {
      // Flat format
      weight = parsed.recommendedLoad ?? parsed.weight ?? 0;
      sets = parsed.sets ?? 3;
      reps = parsed.reps ?? 8;
      restTimeSeconds = parsed.restTimeSeconds ?? 90;
      estimatedCalories = parsed.estimatedCalories ?? 45;
      safetyJustification = parsed.safetyJustification ?? '';
      guidelineReference = parsed.guidelineReference ?? '';
      progressionNotes = parsed.progressionNotes ?? '';
    }

    // Safety bounds — clamp values to sane ranges
    weight = Math.max(0, Math.min(500, Number(weight) || 0));
    sets = Math.max(1, Math.min(10, Math.round(Number(sets) || 3)));
    reps = Math.max(1, Math.min(30, Math.round(Number(reps) || 8)));
    restTimeSeconds = Math.max(15, Math.min(600, Math.round(Number(restTimeSeconds) || 90)));
    estimatedCalories = Math.max(5, Math.min(500, Math.round(Number(estimatedCalories) || 45)));

    console.log('[AI API] Parsed recommendation:', { weight, sets, reps, restTimeSeconds, estimatedCalories });

    return res.status(200).json({
      recommendation: {
        weight,
        sets,
        reps,
        restTimeSeconds,
        estimatedCalories,
      },
      reasoning: {
        safetyJustification: safetyJustification || 'Recommendation follows established guidelines.',
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
