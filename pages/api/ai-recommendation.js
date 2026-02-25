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
// SYSTEM PROMPT — APPLIFT AI COACH (OPTIMIZED FOR COST)
// ============================================================
const SYSTEM_PROMPT = `AppLift AI Coach: Evidence-based recommendations (NSCA/ACSM).

EXERCISES & QUALITY LABELS:
• Concentration Curls (Dumbbell): Clean, Uncontrolled Movement, Abrupt Initiation
• Overhead Extension (Dumbbell): Clean, Uncontrolled Movement, Abrupt Initiation  
• Bench Press (Barbell): Clean, Uncontrolled Movement, Inclination Asymmetry
• Back Squat (Barbell): Clean, Uncontrolled Movement, Inclination Asymmetry
• Lateral Pulldown (Weight Stack): Clean, Pulling Too Fast, Releasing Too Fast
• Seated Leg Extension (Weight Stack): Clean, Pulling Too Fast, Releasing Too Fast

BARBELL WEIGHTS: Olympic 20kg, Women's 15kg, EZ 8kg, Trap 22kg (include in total)
- Always clarify if recommendation is "bar only" or "bar + plates"
- Example: 20kg = "Bar only", 30kg = "20kg bar + 10kg plates"

DUMBBELL WEIGHTS: Always specify per-hand weight for clarity
- Example: 10kg total = "5kg per hand", 20kg total = "10kg per hand"

PROGRESSION RULES:
• Beginner (<6mo): 0-5% increase, start conservative
• Intermediate (6mo-2y): 5-10% if form good
• Advanced (2y+): 5-15% with periodization

LOAD DECISIONS:
• Increase: Clean reps ≥80%, Fatigue <25%, Consistency ≥75%
• Maintain: Clean reps 60-79%, Fatigue 25-40%, Consistency 60-74%  
• Decrease: Clean reps <60%, Fatigue >40%, Consistency <60%

REP RANGES: Strength 1-5, Hypertrophy 6-12, Endurance 12+
REST: Strength 2-5min, Hyper 60-120s, Endurance 30-60s

OUTPUT JSON:
{
  "recommendedLoad": <kg>,
  "sets": <int>,
  "reps": <int>, 
  "restTimeSeconds": <int>,
  "estimatedCalories": <int>,
  "recommendedRestDays": <1-3>,
  "weightBreakdown": "<clear breakdown like 'Bar only (20kg)' or '20kg bar + 10kg plates' or '5kg per hand'>",
  "rationale": "<max 2 sentences>",
  "safetyNote": "<max 8 words>", 
  "guideline": "<max 6 words>",
  "nextSteps": "<max 10 words>"
}`;

// ============================================================
// BUILD USER CONTEXT PROMPT (COMPACT)
// ============================================================
function buildUserPrompt({ userProfile, equipment, exerciseName, pastSessions }) {
  let prompt = `EXERCISE: ${exerciseName} (${equipment})\n`;
  
  // User basics
  prompt += `USER: ${userProfile.age || '?'}y ${userProfile.gender || '?'} ${userProfile.weight || '?'}kg, `;
  prompt += `exp: ${userProfile.strengthExperience || 'beginner'}, goal: ${userProfile.fitnessGoal || 'fitness'}\n`;
  
  // Injuries
  if (userProfile.injuries?.length) {
    prompt += `INJURIES: ${userProfile.injuries.filter(i => i?.trim()).join(', ')}\n`;
  }
  
  // Past sessions (compact format)
  if (pastSessions?.length > 0) {
    const stats = calculateAggregateStats(pastSessions);
    prompt += `HISTORY (${pastSessions.length} sessions): avg ${stats.avgWeight.toFixed(0)}kg, max ${stats.maxWeight}kg, `;
    prompt += `${stats.avgCleanRepPct.toFixed(0)}% clean, ${stats.avgFatigue.toFixed(0)}% fatigue, `;
    prompt += `${stats.avgConsistency.toFixed(0)}% consistency, trend: ${stats.trend}\n`;
    
    // Recent session details (most important)
    const recent = pastSessions[0];
    if (recent) {
      prompt += `LAST: ${recent.weight || 0}kg × ${recent.sets || 0}s × ${recent.repsPerSet || 0}r`;
      if (recent.cleanRepPct != null) prompt += `, ${recent.cleanRepPct}% clean`;
      if (recent.fatigueScore != null) prompt += `, ${recent.fatigueScore}% fatigue`;
      if (recent.consistencyScore != null) prompt += `, ${recent.consistencyScore}% consistency`;
      prompt += `\n`;
    }
    
    // Decision guidance (minimal)
    if (stats.avgCleanRepPct >= 80 && stats.avgFatigue < 25) {
      prompt += `GUIDANCE: Safe to increase load\n`;
    } else if (stats.avgCleanRepPct < 60 || stats.avgFatigue > 40) {
      prompt += `GUIDANCE: Reduce load, improve form\n`;
    } else {
      prompt += `GUIDANCE: Maintain current load\n`;
    }
  } else {
    prompt += `FIRST TIME: Use conservative starting weights\n`;
  }
  
  return prompt;
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

// ─── Helper: Calculate aggregate stats (compact) ───
function calculateAggregateStats(sessions) {
  if (!sessions.length) return { avgWeight: 0, maxWeight: 0, avgCleanRepPct: 0, avgFatigue: 0, avgConsistency: 0, trend: 'N/A', daysSinceLastSession: 0 };

  let totalWeight = 0, maxWeight = 0, totalCleanPct = 0, cleanPctCount = 0;
  let totalFatigue = 0, fatigueCount = 0, totalConsistency = 0, consistencyCount = 0;

  sessions.forEach(s => {
    const w = s.weight || 0;
    totalWeight += w;
    if (w > maxWeight) maxWeight = w;
    
    if (s.cleanRepPct != null) { totalCleanPct += s.cleanRepPct; cleanPctCount++; }
    if (s.fatigueScore != null) { totalFatigue += s.fatigueScore; fatigueCount++; }
    if (s.consistencyScore != null) { totalConsistency += s.consistencyScore; consistencyCount++; }
  });

  // Calculate trend
  let trend = 'STABLE';
  if (sessions.length >= 2) {
    const recent = sessions[0].weight || 0;
    const older = sessions[sessions.length - 1].weight || 0;
    if (recent > older) trend = 'UP';
    else if (recent < older) trend = 'DOWN';
  }

  // Days since last session
  let daysSinceLastSession = 0;
  if (sessions[0]?.date) {
    const lastDate = new Date(sessions[0].date);
    daysSinceLastSession = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  return {
    avgWeight: totalWeight / sessions.length,
    maxWeight,
    avgCleanRepPct: cleanPctCount > 0 ? totalCleanPct / cleanPctCount : 0,
    avgFatigue: fatigueCount > 0 ? totalFatigue / fatigueCount : 0,
    avgConsistency: consistencyCount > 0 ? totalConsistency / consistencyCount : 0,
    trend,
    daysSinceLastSession
  };
}

// ─── Helper: Generate weight breakdown explanation ───
function generateWeightBreakdown(totalWeight, equipment) {
  const equipmentType = equipment.toLowerCase();
  
  if (equipmentType.includes('barbell')) {
    const barWeight = 20; // Standard Olympic bar
    if (totalWeight <= barWeight) {
      return `Bar only (${totalWeight}kg)`;
    } else {
      const plateWeight = totalWeight - barWeight;
      return `${barWeight}kg bar + ${plateWeight}kg plates`;
    }
  } 
  else if (equipmentType.includes('dumbbell')) {
    const perHand = totalWeight / 2;
    return `${perHand}kg per hand (${totalWeight}kg total)`;
  } 
  else if (equipmentType.includes('weight stack') || equipmentType.includes('machine')) {
    return `${totalWeight}kg on weight stack`;
  } 
  else {
    return `${totalWeight}kg total weight`;
  }
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

    // ============================================================
    // MODEL PARAMETERS (optimized for speed & cost)
    // ============================================================
    // temperature: 0.1 = very deterministic (was 0.2)
    // topP: 0.6 = more focused sampling (was 0.7)  
    // topK: 15 = fewer tokens considered (was 20)
    // maxOutputTokens: 256 = much shorter responses (was 512)
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.1,        // More deterministic for consistent format
        topP: 0.6,               // More focused sampling
        topK: 15,                // Faster token selection
        maxOutputTokens: 256,    // Reduced further for cost savings
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
    // Flat format: { recommendedLoad, sets, reps, restTimeSeconds, estimatedCalories, weightBreakdown, safetyJustification, ... }
    // Nested format: { recommendation: { weight, sets, reps, restTimeSeconds, estimatedCalories }, reasoning: { safetyJustification, ... } }
    let weight, sets, reps, restTimeSeconds, estimatedCalories, weightBreakdown, safetyJustification, guidelineReference, progressionNotes;

    if (parsed.recommendation && typeof parsed.recommendation === 'object') {
      // Nested format
      weight = parsed.recommendation.weight ?? parsed.recommendation.recommendedLoad ?? 0;
      sets = parsed.recommendation.sets ?? 3;
      reps = parsed.recommendation.reps ?? 8;
      restTimeSeconds = parsed.recommendation.restTimeSeconds ?? 90;
      estimatedCalories = parsed.recommendation.estimatedCalories ?? parsed.estimatedCalories ?? 45;
      weightBreakdown = parsed.recommendation.weightBreakdown ?? parsed.weightBreakdown ?? '';
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
      weightBreakdown = parsed.weightBreakdown ?? '';
      safetyJustification = parsed.safetyNote ?? parsed.safetyJustification ?? '';
      guidelineReference = parsed.guideline ?? parsed.guidelineReference ?? '';
      progressionNotes = parsed.nextSteps ?? parsed.progressionNotes ?? '';
    }

    // Generate fallback weight breakdown if AI didn't provide one
    if (!weightBreakdown) {
      weightBreakdown = generateWeightBreakdown(weight, equipment);
    }

    // Safety bounds — clamp values to sane ranges
    weight = Math.max(0, Math.min(500, Number(weight) || 0));
    sets = Math.max(1, Math.min(10, Math.round(Number(sets) || 3)));
    reps = Math.max(1, Math.min(30, Math.round(Number(reps) || 8)));
    restTimeSeconds = Math.max(15, Math.min(600, Math.round(Number(restTimeSeconds) || 90)));
    estimatedCalories = Math.max(5, Math.min(500, Math.round(Number(estimatedCalories) || 45)));
    
    // Recommended rest days before repeating this exercise (default: 2 days)
    let recommendedRestDays = parsed.recommendedRestDays ?? parsed.recommendation?.recommendedRestDays ?? 2;
    recommendedRestDays = Math.max(1, Math.min(4, Math.round(Number(recommendedRestDays) || 2)));

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
        rationale: rationale || 'Based on your profile and NSCA/ACSM guidelines.',
        safetyJustification: safetyJustification || 'Maintain proper form.',
        guidelineReference: guidelineReference || 'NSCA/ACSM principles',
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
