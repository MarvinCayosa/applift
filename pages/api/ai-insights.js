/**
 * AI Session Insights API
 * Generates a one-time post-workout summary using Vertex AI Gemini 2.5 Flash.
 * Accepts all workout metrics and returns a paragraph + bullet points.
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
// RATE LIMITING
// ============================================================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10; // max 10 requests per minute per user (same as recommendations)

function checkRateLimit(uid) {
  const now = Date.now();
  const entry = rateLimitMap.get(uid);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(uid, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) rateLimitMap.delete(uid);
  }
}, 5 * 60 * 1000);

// ============================================================
// VERTEX AI CLIENT
// ============================================================
function getVertexClient() {
  const project = process.env.VERTEX_AI_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCS_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const clientEmail = process.env.VERTEX_AI_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL;
  const privateKey = (process.env.VERTEX_AI_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  return new VertexAI({
    project,
    location,
    googleAuthOptions: {
      credentials: { client_email: clientEmail, private_key: privateKey },
      projectId: project,
    },
  });
}

// ============================================================
// SYSTEM PROMPT — SESSION INSIGHTS COACH
// ============================================================
const SYSTEM_PROMPT = `You are AppLift's AI performance analyst. Given workout metrics, produce a concise post-workout session summary.

RULES:
- Be specific: reference actual numbers (velocity, fatigue %, ROM, rep counts).
- Keep the summary to 2-3 sentences maximum.
- Provide 3-5 bullet points with actionable observations (each 1 short sentence).
- Use professional, encouraging coaching tone. No fluff or generic praise.
- If any metric is missing or zero, skip it — do not mention unavailable data.
- Focus on standout positives AND areas for improvement.

OUTPUT FORMAT (JSON only, no markdown):
{
  "summary": "2-3 sentence overview paragraph",
  "bullets": ["bullet 1", "bullet 2", "bullet 3"]
}`;

// ============================================================
// BUILD COMPACT METRICS PROMPT
// ============================================================
function buildMetricsPrompt(data) {
  const {
    exerciseName, equipment, weight, weightUnit,
    totalSets, totalReps, plannedSets, plannedReps,
    durationSec, calories,
    setsData, fatigueScore, consistencyScore,
  } = data;

  let prompt = `EXERCISE: ${exerciseName} (${equipment}), ${weight}${weightUnit || 'kg'}\n`;
  prompt += `PLAN: ${plannedSets}×${plannedReps} | ACTUAL: ${totalSets} sets, ${totalReps} reps\n`;
  if (durationSec) prompt += `DURATION: ${Math.floor(durationSec / 60)}m ${durationSec % 60}s\n`;
  if (calories) prompt += `CALORIES: ${calories}\n`;

  // Completion
  const plannedTotal = (plannedSets || 0) * (plannedReps || 0);
  if (plannedTotal > 0) {
    const pct = Math.round((totalReps / plannedTotal) * 100);
    prompt += `COMPLETION: ${pct}% (${totalReps}/${plannedTotal})\n`;
  }

  // Per-set breakdown (compact)
  if (setsData?.length) {
    prompt += `\nSET BREAKDOWN:\n`;
    setsData.forEach((set, i) => {
      const reps = set.repsData || [];
      if (!reps.length) return;

      // Build classification distribution for this set
      const distMap = {};
      reps.forEach(r => {
        const label = typeof r.classification === 'string' ? r.classification
          : (r.isClean === true || r.quality === 'good') ? 'Clean'
          : r.isClean === false ? 'Unclassified' : null;
        if (label) distMap[label] = (distMap[label] || 0) + 1;
      });
      const distStr = Object.entries(distMap)
        .map(([lbl, cnt]) => `${lbl}: ${Math.round((cnt / reps.length) * 100)}%`)
        .join(', ');

      const avgVel = reps.reduce((s, r) => s + (r.peakVelocity || 0), 0) / reps.length;
      const avgSmooth = reps.reduce((s, r) => s + (r.smoothnessScore || 0), 0) / reps.length;
      const avgROM = reps.reduce((s, r) => s + (r.rom || 0), 0) / reps.length;
      const romUnit = reps[0]?.romUnit || '°';
      const avgLift = reps.reduce((s, r) => s + (r.liftingTime || 0), 0) / reps.length;
      const avgLower = reps.reduce((s, r) => s + (r.loweringTime || 0), 0) / reps.length;

      let line = `  Set${i + 1}: ${reps.length} reps [${distStr}]`;
      if (avgVel > 0) line += `, vel ${avgVel.toFixed(2)}m/s`;
      if (avgSmooth > 0) line += `, smooth ${avgSmooth.toFixed(1)}`;
      if (avgROM > 0) line += `, ROM ${avgROM.toFixed(1)}${romUnit}`;
      if (avgLift > 0) line += `, conc ${avgLift.toFixed(2)}s ecc ${avgLower.toFixed(2)}s`;
      prompt += line + '\n';
    });

    // Overall execution quality distribution across all reps
    const allReps = setsData.flatMap(s => s.repsData || []);
    if (allReps.length > 0) {
      const overallDist = {};
      allReps.forEach(r => {
        const label = typeof r.classification === 'string' ? r.classification
          : (r.isClean === true || r.quality === 'good') ? 'Clean'
          : r.isClean === false ? 'Unclassified' : null;
        if (label) overallDist[label] = (overallDist[label] || 0) + 1;
      });
      const overallStr = Object.entries(overallDist)
        .map(([lbl, cnt]) => `${lbl}: ${Math.round((cnt / allReps.length) * 100)}% (${cnt})`)
        .join(', ');
      prompt += `EXECUTION DISTRIBUTION (${allReps.length} total reps): ${overallStr}\n`;
    }
  }

  // Fatigue & consistency scores
  if (fatigueScore != null) prompt += `FATIGUE SCORE: ${fatigueScore}%\n`;
  if (consistencyScore != null) prompt += `CONSISTENCY SCORE: ${consistencyScore}%\n`;

  prompt += `\nGenerate the session summary JSON.`;
  return prompt;
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req, res) {
  console.log('\n[AI Insights API] Request received:', {
    method: req.method,
    hasAuth: !!req.headers.authorization,
  });

  // Environment variable check — same pattern as ai-recommendation
  const envCheck = {
    GOOGLE_CLOUD_PROJECT: !!(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCS_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID),
    VERTEX_AI_CLIENT_EMAIL: !!(process.env.VERTEX_AI_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL),
    VERTEX_AI_PRIVATE_KEY: !!(process.env.VERTEX_AI_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY),
    FIREBASE_PROJECT_ID: !!process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: !!process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: !!process.env.FIREBASE_PRIVATE_KEY,
  };
  const missingEnv = Object.entries(envCheck).filter(([, v]) => !v).map(([k]) => k);
  if (missingEnv.length > 0) {
    console.error('[AI Insights API] Missing environment variables:', missingEnv);
    return res.status(500).json({
      error: 'Server configuration error. Missing environment variables.',
      missing: process.env.NODE_ENV === 'development' ? missingEnv : undefined,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
      console.log('[AI Insights API] Token verified for UID:', decoded.uid);
    } catch (authError) {
      console.error('[AI Insights API] Token verification failed:', authError.message);
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
    const uid = decoded.uid;

    if (!checkRateLimit(uid)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }

    const { metrics } = req.body;
    if (!metrics?.exerciseName) {
      return res.status(400).json({ error: 'Missing metrics data' });
    }

    // Build prompt
    const userPrompt = buildMetricsPrompt(metrics);

    // Call Vertex AI — same pattern as ai-recommendation
    console.log('[AI Insights API] Calling Vertex AI...');
    const vertexAI = getVertexClient();
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';
    const generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.4,
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

    let text;
    if (typeof result.response?.text === 'function') {
      text = result.response.text();
    } else {
      text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!text) {
      console.error('[AI Insights API] Empty AI response. Full result:', JSON.stringify(result.response || result, null, 2).slice(0, 500));
      throw new Error('Empty response from AI model');
    }

    console.log('[AI Insights API] Raw response (first 300 chars):', text.slice(0, 300));

    let parsed;
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('[AI Insights API] Failed to parse AI response:', text);
      throw new Error('AI response was not valid JSON');
    }

    const summary = (parsed.summary || '').slice(0, 500);
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map(b => String(b).slice(0, 200)).slice(0, 6)
      : [];

    return res.status(200).json({ summary, bullets });
  } catch (error) {
    console.error('[AI Insights API] Error:', error.message);
    console.error('[AI Insights API] Stack:', error.stack?.slice(0, 500));

    if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return res.status(503).json({ error: 'AI service temporarily unavailable.' });
    }
    if (error.message?.includes('timeout') || error.code === 'DEADLINE_EXCEEDED') {
      return res.status(504).json({ error: 'AI service timed out.' });
    }

    return res.status(500).json({
      error: 'Failed to generate insights.',
      detail: error.message,
    });
  }
}
