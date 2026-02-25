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
// SYSTEM PROMPT — APPLIFT AI COACH (COMPREHENSIVE INPUT, CONCISE OUTPUT)
// ============================================================
const SYSTEM_PROMPT = `You are AppLift's certified AI strength coach. Your recommendations are trusted by users for their accuracy and safety.

═══════════════════════════════════════════════════════════════
APPLIFT EXERCISE CATALOG
═══════════════════════════════════════════════════════════════

EQUIPMENT TYPES:
┌─────────────┬────────────────────────────────────────────────┐
│ Dumbbell    │ Free weights, unilateral/bilateral movements   │
│ Barbell     │ Olympic bar (20kg) or women's bar (15kg)       │
│ Weight Stack│ Cable machines with adjustable pin selection   │
└─────────────┴────────────────────────────────────────────────┘

SUPPORTED EXERCISES & QUALITY LABELS:
┌─────────────────────────┬─────────────┬──────────────────────────────────────────────┐
│ Exercise                │ Equipment   │ Quality Labels (0=Clean, 1=Issue, 2=Issue)   │
├─────────────────────────┼─────────────┼──────────────────────────────────────────────┤
│ Concentration Curls     │ Dumbbell    │ Clean, Uncontrolled Movement, Abrupt Init    │
│ Overhead Extension      │ Dumbbell    │ Clean, Uncontrolled Movement, Abrupt Init    │
│ Bench Press             │ Barbell     │ Clean, Uncontrolled Movement, Incline Asym   │
│ Back Squat              │ Barbell     │ Clean, Uncontrolled Movement, Incline Asym   │
│ Lateral Pulldown        │ Weight Stack│ Clean, Pulling Too Fast, Releasing Too Fast  │
│ Seated Leg Extension    │ Weight Stack│ Clean, Pulling Too Fast, Releasing Too Fast  │
└─────────────────────────┴─────────────┴──────────────────────────────────────────────┘

TARGET MUSCLES:
- Concentration Curls: Biceps brachii (isolated)
- Overhead Extension: Triceps brachii (long head emphasis)
- Bench Press: Pectoralis major, anterior deltoids, triceps
- Back Squat: Quadriceps, glutes, hamstrings, core
- Lateral Pulldown: Latissimus dorsi, biceps, rear deltoids
- Seated Leg Extension: Quadriceps (isolated)

═══════════════════════════════════════════════════════════════
EVIDENCE-BASED GUIDELINES (NSCA/ACSM/STE)
═══════════════════════════════════════════════════════════════

PROGRESSIVE OVERLOAD BY EXPERIENCE:
┌─────────────────┬─────────────────────────────────────────────┐
│ Beginner (<6mo) │ 5-10% load increase MAX, prioritize form    │
│ Intermediate    │ 5-15% increase if consistency >80%          │
│ Advanced (2yr+) │ Standard periodization, deload every 4-6wk  │
└─────────────────┴─────────────────────────────────────────────┘

REP RANGES BY GOAL:
┌──────────────────┬────────┬─────────────┬─────────────────────┐
│ Goal             │ Reps   │ %1RM        │ Rest Between Sets   │
├──────────────────┼────────┼─────────────┼─────────────────────┤
│ Max Strength     │ 1-5    │ 85-100%     │ 2-5 minutes         │
│ Hypertrophy      │ 6-12   │ 65-85%      │ 60-120 seconds      │
│ Muscular Endur.  │ 12-20+ │ <65%        │ 30-60 seconds       │
│ General Fitness  │ 8-15   │ 50-70%      │ 60-90 seconds       │
└──────────────────┴────────┴─────────────┴─────────────────────┘

BARBELL WEIGHTS (include in total load):
- Standard Olympic bar: 20kg
- Women's Olympic bar: 15kg
- EZ curl bar: 7-10kg (typically 8kg)
- Trap/hex bar: 20-25kg

CONSERVATIVE STARTING WEIGHTS (first-time users):
┌─────────────────────┬────────────────────────────────────────┐
│ Barbell exercises   │ 20kg (empty Olympic bar)               │
│ Dumbbell exercises  │ 3-5kg per hand                         │
│ Weight stack machine│ 20-30kg (bottom 1/3 of stack)          │
└─────────────────────┴────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════
DECISION LOGIC FOR RECOMMENDATIONS
═══════════════════════════════════════════════════════════════

WHEN TO INCREASE LOAD:
✓ Clean rep percentage ≥80%
✓ Fatigue score <25%
✓ Consistency score ≥75%
✓ All prescribed reps completed
✓ Tempo controlled (concentric 1-2s, eccentric 2-3s)

WHEN TO MAINTAIN LOAD:
● Clean rep percentage 60-79%
● Fatigue score 25-40%
● Consistency score 60-74%
● Missed 1-2 reps

WHEN TO DECREASE LOAD:
✗ Clean rep percentage <60%
✗ Fatigue score >40%
✗ Consistency score <60%
✗ User reported injury/illness
✗ Tempo too fast (jerky movements)

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON ONLY — NO MARKDOWN, NO EXPLANATIONS)
═══════════════════════════════════════════════════════════════
{
  "recommendedLoad": <int kg, total weight including bar>,
  "sets": <int 2-6>,
  "reps": <int 1-20>,
  "restTimeSeconds": <int 30-300>,
  "estimatedCalories": <int>,
  "recommendedRestDays": <int 1-3>,
  "rationale": "<1-2 sentences referencing specific metrics if available>",
  "safetyNote": "<max 10 words>",
  "guideline": "<max 8 words>",
  "nextSteps": "<max 12 words>"
}

Be precise. Reference data when available. Users trust your expertise.`;

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
// BUILD USER CONTEXT PROMPT (COMPREHENSIVE INPUT)
// ============================================================
function buildUserPrompt({ userProfile, equipment, exerciseName, pastSessions }) {
  // ─── Exercise & Equipment Context ───
  let prompt = `═══ RECOMMENDATION REQUEST ═══\n\n`;
  prompt += `EXERCISE: ${exerciseName}\n`;
  prompt += `EQUIPMENT: ${equipment}\n`;
  
  // Add exercise-specific context
  const exerciseContext = getExerciseContext(exerciseName, equipment);
  prompt += `TARGET MUSCLES: ${exerciseContext.muscles}\n`;
  prompt += `MOVEMENT TYPE: ${exerciseContext.movementType}\n`;
  prompt += `QUALITY LABELS FOR THIS EXERCISE: ${exerciseContext.qualityLabels.join(', ')}\n\n`;

  // ─── User Profile (Complete) ───
  prompt += `═══ USER PROFILE ═══\n`;
  prompt += `Age: ${userProfile.age || 'Not specified'}\n`;
  prompt += `Sex: ${userProfile.gender || 'Not specified'}\n`;
  prompt += `Body Weight: ${userProfile.weight || 'Not specified'} ${userProfile.weightUnit || 'kg'}\n`;
  prompt += `Height: ${userProfile.height || 'Not specified'} ${userProfile.heightUnit || 'cm'}\n`;
  prompt += `Training Experience: ${userProfile.strengthExperience || 'Not specified (assume beginner)'}\n`;
  prompt += `Activity Level: ${userProfile.activityLevel || 'Not specified'}\n`;
  prompt += `Primary Fitness Goal: ${userProfile.fitnessGoal || 'General fitness'}\n`;
  prompt += `Training Priority: ${userProfile.trainingPriority || 'Balanced'}\n`;

  // Calculate experience level
  const experienceLevel = getExperienceLevel(userProfile.strengthExperience);
  prompt += `\nEXPERIENCE CLASSIFICATION: ${experienceLevel.level} (${experienceLevel.description})\n`;
  prompt += `RECOMMENDED LOAD INCREASE RANGE: ${experienceLevel.loadIncreaseRange}\n`;

  // ─── Injury/Illness Constraints ───
  if (userProfile.injuries && userProfile.injuries.length > 0) {
    const validInjuries = userProfile.injuries.filter(i => i && i.trim());
    if (validInjuries.length > 0) {
      prompt += `\n═══ MEDICAL CONSTRAINTS (MUST ACCOMMODATE) ═══\n`;
      validInjuries.forEach((injury) => {
        prompt += `⚠️ ${injury}\n`;
      });
      prompt += `ACTION REQUIRED: Reduce load, modify movement, or avoid if contraindicated.\n`;
    }
  }

  // ─── Past Session Data (Detailed Metrics) ───
  if (pastSessions && pastSessions.length > 0) {
    prompt += `\n═══ PAST SESSION DATA (${pastSessions.length} sessions, most recent first) ═══\n`;
    
    // Calculate aggregate stats across sessions
    const aggregateStats = calculateAggregateStats(pastSessions);
    prompt += `\nAGGREGATE METRICS:\n`;
    prompt += `├─ Total sessions: ${pastSessions.length}\n`;
    prompt += `├─ Avg load used: ${aggregateStats.avgWeight.toFixed(1)} kg\n`;
    prompt += `├─ Max load achieved: ${aggregateStats.maxWeight} kg\n`;
    prompt += `├─ Avg clean rep %: ${aggregateStats.avgCleanRepPct.toFixed(0)}%\n`;
    prompt += `├─ Avg fatigue score: ${aggregateStats.avgFatigue.toFixed(0)}%\n`;
    prompt += `├─ Avg consistency: ${aggregateStats.avgConsistency.toFixed(0)}%\n`;
    prompt += `├─ Trend: ${aggregateStats.trend}\n`;
    prompt += `└─ Days since last session: ${aggregateStats.daysSinceLastSession}\n`;

    prompt += `\nSESSION DETAILS:\n`;
    pastSessions.slice(0, 5).forEach((session, i) => {
      prompt += `\n┌─ Session ${i + 1} ${i === 0 ? '(MOST RECENT)' : ''}\n`;
      prompt += `├─ Date: ${session.date || 'Unknown'}\n`;
      prompt += `├─ Load: ${session.weight || 0} ${session.weightUnit || 'kg'}\n`;
      prompt += `├─ Volume: ${session.sets || 0} sets × ${session.repsPerSet || Math.round((session.reps || 0) / (session.sets || 1))} reps = ${session.reps || 0} total reps\n`;
      
      // ML Classification data
      if (session.cleanRepPct != null) {
        prompt += `├─ ML Clean Reps: ${session.cleanRepPct}% (${session.cleanReps || 0}/${session.reps || 0})\n`;
      }
      if (session.mlClassification) {
        prompt += `├─ ML Quality Distribution: ${session.mlClassification}\n`;
      }
      
      // Tempo/movement data
      if (session.avgConcentric || session.avgEccentric) {
        prompt += `├─ Rep Tempo: ${session.avgEccentric?.toFixed(2) || '?'}s eccentric / ${session.avgConcentric?.toFixed(2) || '?'}s concentric\n`;
      }
      
      // Fatigue & consistency
      if (session.fatigueScore != null) {
        const fatigueLevel = session.fatigueScore < 20 ? 'LOW' : session.fatigueScore < 40 ? 'MODERATE' : 'HIGH';
        prompt += `├─ Fatigue: ${session.fatigueScore}% (${fatigueLevel})\n`;
      }
      if (session.consistencyScore != null) {
        const consistencyLevel = session.consistencyScore >= 80 ? 'EXCELLENT' : session.consistencyScore >= 60 ? 'GOOD' : 'NEEDS WORK';
        prompt += `├─ Consistency: ${session.consistencyScore}% (${consistencyLevel})\n`;
      }
      
      // Form quality
      if (session.quality) {
        prompt += `├─ Overall Form: ${session.quality}\n`;
      }
      
      // Key findings
      if (session.keyFindings && session.keyFindings.length > 0) {
        prompt += `├─ Key Findings: ${session.keyFindings.slice(0, 3).join('; ')}\n`;
      }
      
      prompt += `└─────────────────────────────\n`;
    });

    // Add decision guidance based on metrics
    prompt += `\n═══ DECISION GUIDANCE ═══\n`;
    const guidance = generateGuidance(aggregateStats, pastSessions[0]);
    prompt += guidance;

  } else {
    prompt += `\n═══ NO PAST SESSION DATA ═══\n`;
    prompt += `This is the user's FIRST TIME performing ${exerciseName}.\n`;
    prompt += `\nREQUIRED ACTIONS:\n`;
    prompt += `1. Use CONSERVATIVE starting weight from guidelines\n`;
    prompt += `2. Prioritize movement learning over load\n`;
    prompt += `3. Start at lower end of rep range (8-10 for hypertrophy)\n`;
    prompt += `4. Allow longer rest periods for learning (90-120s)\n`;
    
    if (experienceLevel.level === 'BEGINNER') {
      prompt += `\n⚠️ BEGINNER + FIRST-TIME: Use absolute minimum starting weights.\n`;
      if (equipment.toLowerCase().includes('barbell')) {
        prompt += `   For barbell: Start with empty bar (20kg) ONLY.\n`;
      } else if (equipment.toLowerCase().includes('dumbbell')) {
        prompt += `   For dumbbells: Start with 3-4kg per hand MAX.\n`;
      } else {
        prompt += `   For machines: Start at bottom 1/4 of weight stack (15-25kg).\n`;
      }
    }
  }

  prompt += `\n═══ GENERATE RECOMMENDATION NOW ═══\n`;
  prompt += `Output JSON only. Be precise and reference the data above.\n`;
  
  return prompt;
}

// ─── Helper: Get exercise-specific context ───
function getExerciseContext(exerciseName, equipment) {
  const exerciseMap = {
    'concentration curls': {
      muscles: 'Biceps brachii (isolated)',
      movementType: 'Single-joint, unilateral isolation',
      qualityLabels: ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation']
    },
    'overhead extension': {
      muscles: 'Triceps brachii (long head emphasis)',
      movementType: 'Single-joint isolation',
      qualityLabels: ['Clean', 'Uncontrolled Movement', 'Abrupt Initiation']
    },
    'bench press': {
      muscles: 'Pectoralis major, anterior deltoids, triceps',
      movementType: 'Multi-joint compound push',
      qualityLabels: ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry']
    },
    'back squat': {
      muscles: 'Quadriceps, glutes, hamstrings, core stabilizers',
      movementType: 'Multi-joint compound, lower body dominant',
      qualityLabels: ['Clean', 'Uncontrolled Movement', 'Inclination Asymmetry']
    },
    'lateral pulldown': {
      muscles: 'Latissimus dorsi, biceps, rear deltoids, rhomboids',
      movementType: 'Multi-joint vertical pull',
      qualityLabels: ['Clean', 'Pulling Too Fast', 'Releasing Too Fast']
    },
    'seated leg extension': {
      muscles: 'Quadriceps (isolated)',
      movementType: 'Single-joint isolation, machine-guided',
      qualityLabels: ['Clean', 'Pulling Too Fast', 'Releasing Too Fast']
    }
  };

  const key = exerciseName.toLowerCase();
  return exerciseMap[key] || {
    muscles: 'Target muscles vary',
    movementType: 'Standard resistance exercise',
    qualityLabels: ['Clean', 'Form Issue Type 1', 'Form Issue Type 2']
  };
}

// ─── Helper: Classify experience level ───
function getExperienceLevel(strengthExperience) {
  if (!strengthExperience) {
    return { level: 'BEGINNER', description: 'No experience data, assume new', loadIncreaseRange: '0-5% max' };
  }
  
  const exp = strengthExperience.toLowerCase();
  if (exp.includes('advanced') || exp.includes('3+') || exp.includes('4+') || exp.includes('5+')) {
    return { level: 'ADVANCED', description: '2+ years consistent training', loadIncreaseRange: '5-10% with periodization' };
  }
  if (exp.includes('intermediate') || exp.includes('1-2') || exp.includes('1 year') || exp.includes('2 year')) {
    return { level: 'INTERMEDIATE', description: '6 months to 2 years', loadIncreaseRange: '5-10% if form is solid' };
  }
  return { level: 'BEGINNER', description: 'Less than 6 months or new', loadIncreaseRange: '0-5% max, prioritize form' };
}

// ─── Helper: Calculate aggregate stats from sessions ───
function calculateAggregateStats(sessions) {
  if (!sessions.length) {
    return { avgWeight: 0, maxWeight: 0, avgCleanRepPct: 0, avgFatigue: 0, avgConsistency: 0, trend: 'N/A', daysSinceLastSession: 0 };
  }

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

  // Calculate trend (comparing first vs last session weights)
  let trend = 'STABLE';
  if (sessions.length >= 2) {
    const recent = sessions[0].weight || 0;
    const older = sessions[sessions.length - 1].weight || 0;
    if (recent > older) trend = 'INCREASING ↑';
    else if (recent < older) trend = 'DECREASING ↓';
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

// ─── Helper: Generate decision guidance ───
function generateGuidance(stats, mostRecentSession) {
  let guidance = '';
  
  // Clean rep analysis
  if (stats.avgCleanRepPct >= 80) {
    guidance += `✓ CLEAN REP % HIGH (${stats.avgCleanRepPct.toFixed(0)}%): User demonstrates good form. Safe to progress load.\n`;
  } else if (stats.avgCleanRepPct >= 60) {
    guidance += `● CLEAN REP % MODERATE (${stats.avgCleanRepPct.toFixed(0)}%): Maintain current load, focus on form refinement.\n`;
  } else if (stats.avgCleanRepPct > 0) {
    guidance += `✗ CLEAN REP % LOW (${stats.avgCleanRepPct.toFixed(0)}%): REDUCE load to improve movement quality.\n`;
  }

  // Fatigue analysis
  if (stats.avgFatigue < 25) {
    guidance += `✓ FATIGUE LOW (${stats.avgFatigue.toFixed(0)}%): Recovery good. Can handle load increase.\n`;
  } else if (stats.avgFatigue < 40) {
    guidance += `● FATIGUE MODERATE (${stats.avgFatigue.toFixed(0)}%): Monitor recovery. Small increase OK if form is good.\n`;
  } else {
    guidance += `✗ FATIGUE HIGH (${stats.avgFatigue.toFixed(0)}%): Consider maintaining or reducing load. User may need longer recovery.\n`;
  }

  // Consistency analysis
  if (stats.avgConsistency >= 80) {
    guidance += `✓ CONSISTENCY EXCELLENT (${stats.avgConsistency.toFixed(0)}%): Movement patterns stable. Good candidate for progression.\n`;
  } else if (stats.avgConsistency >= 60) {
    guidance += `● CONSISTENCY MODERATE (${stats.avgConsistency.toFixed(0)}%): Some variability in movement. Maintain load.\n`;
  } else if (stats.avgConsistency > 0) {
    guidance += `✗ CONSISTENCY LOW (${stats.avgConsistency.toFixed(0)}%): Movement patterns unstable. Reduce load for motor learning.\n`;
  }

  // Rest days recommendation
  if (stats.daysSinceLastSession === 0) {
    guidance += `⚠️ SAME DAY SESSION: Be cautious, muscles may not be fully recovered.\n`;
  } else if (stats.daysSinceLastSession >= 7) {
    guidance += `ℹ️ LONG BREAK (${stats.daysSinceLastSession} days): Consider starting slightly lighter to readapt.\n`;
  }

  // Trend analysis
  guidance += `LOAD TREND: ${stats.trend}\n`;

  return guidance;
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
    // MODEL PARAMETERS (tuned for speed & reliability)
    // ============================================================
    // temperature: 0.2 = more deterministic/consistent outputs (0-1 scale)
    // topP: 0.7 = nucleus sampling, limits token selection pool
    // topK: 20 = limits to top 20 tokens (faster inference)
    // maxOutputTokens: 512 = shorter responses = faster generation
    // responseMimeType: 'application/json' = structured output
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.2,        // Lower = more consistent recommendations
        topP: 0.7,               // Focused sampling
        topK: 20,                // Faster token selection
        maxOutputTokens: 512,    // Reduced for speed (was 4096)
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
    
    // Recommended rest days before repeating this exercise (default: 2 days)
    let recommendedRestDays = parsed.recommendedRestDays ?? parsed.recommendation?.recommendedRestDays ?? 2;
    recommendedRestDays = Math.max(1, Math.min(4, Math.round(Number(recommendedRestDays) || 2)));

    console.log('[AI API] Parsed recommendation:', { weight, sets, reps, restTimeSeconds, estimatedCalories, recommendedRestDays });

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
