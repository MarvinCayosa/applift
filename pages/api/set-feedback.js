/**
 * AI Set Feedback API
 * Generates a quick 2-sentence AI-powered feedback for a completed set.
 * Uses Vertex AI Gemini 2.5 Flash — IDENTICAL setup to ai-insights.js.
 *
 * Context: AppLift uses an IMU sensor attached to the EQUIPMENT (not the person)
 * to measure rep quality, velocity, ROM, and movement phases.
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
const RATE_LIMIT_MAX = 20;

function checkRateLimit(uid) {
  const now = Date.now();
  const entry = rateLimitMap.get(uid);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(uid, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
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
// VERTEX AI CLIENT — same as ai-insights.js
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
// SYSTEM PROMPT — SET FEEDBACK COACH
// ============================================================
const SYSTEM_PROMPT = `You are a friendly gym coach giving quick feedback after a set. Write exactly 2 short sentences.

CONTEXT:
The app tracks each rep using a sensor on the equipment. Key metrics provided:
- Velocity Loss: Compares best rep speed to average of last 3 reps. Higher velocity loss = more fatigue. >20% means significant fatigue.
- Effective Reps: Reps within 20% of best rep speed — these are the "growth" reps.
- ROM (Range of Motion): Consistency of movement depth across reps.
- Classification: Form quality labels for each rep.
- Smoothness: Movement control score (0-100). Lower scores mean jerky, uncontrolled movement.

RULES:
1. Sentence 1: Tell the user what to focus on improving — pick the biggest issue from velocity loss (fatigue), ROM consistency, or form quality. Keep it simple and encouraging.
2. Sentence 2: Give one clear, easy-to-follow tip for the next set.
3. Talk like a coach, NOT a data scientist. Say things like "You slowed down a lot toward the end" instead of "velocity loss was 35%".
4. Do NOT quote exact numbers or percentages. Use plain language like "slowed down toward the end", "most reps had good form", "range of motion was a bit short".
5. Focus on what the user can ACTUALLY control: slow down, go deeper, stay controlled, lighten the weight.
6. Keep total under 40 words. Be warm and direct.
7. NEVER mention sensors, IMU, cameras, or technical system details.

OUTPUT FORMAT (JSON only, no markdown):
{
  "feedback": "Two sentence feedback here."
}`;

// ============================================================
// BUILD SET DATA PROMPT
// ============================================================
function buildSetPrompt(data) {
  const { exerciseName, equipment, weight, weightUnit, setNumber, totalSets, repsData } = data;

  let prompt = `EXERCISE: ${exerciseName} (${equipment}), ${weight}${weightUnit || 'kg'}\n`;
  prompt += `SET: ${setNumber} of ${totalSets}\n`;
  prompt += `REPS: ${repsData?.length || 0}\n\n`;

  if (repsData?.length) {
    prompt += 'REP DETAILS:\n';
    repsData.forEach((rep, i) => {
      const label = typeof rep.classification === 'string' ? rep.classification
        : rep.classification?.label || '—';
      const vel = rep.meanVelocity || rep.peakVelocity || 0;
      const rom = rep.rom || 0;
      const romUnit = rep.romUnit || '°';
      const lift = rep.liftingTime || 0;
      const lower = rep.loweringTime || 0;

      let line = `  Rep${i + 1}: ${label}`;
      if (vel > 0) line += `, vel ${vel.toFixed(2)}m/s`;
      if (rom > 0) line += `, ROM ${rom.toFixed(1)}${romUnit}`;
      if (lift > 0) line += `, conc ${lift.toFixed(2)}s ecc ${lower.toFixed(2)}s`;
      prompt += line + '\n';
    });

    // Classification distribution
    const distMap = {};
    repsData.forEach(r => {
      const label = typeof r.classification === 'string' ? r.classification
        : r.classification?.label || null;
      if (label) distMap[label] = (distMap[label] || 0) + 1;
    });
    if (Object.keys(distMap).length > 0) {
      const distStr = Object.entries(distMap)
        .map(([lbl, cnt]) => `${lbl}: ${cnt}/${repsData.length}`)
        .join(', ');
      prompt += `\nCLASSIFICATION: ${distStr}\n`;
    }

    // Velocity analysis — Best Rep vs Mean Last 3 (González-Badillo et al.)
    const velocities = repsData.map(r => r.meanVelocity || r.peakVelocity || 0).filter(v => v > 0);
    if (velocities.length >= 3) {
      const baseline = Math.max(...velocities); // Best Rep
      const lastN = Math.min(3, velocities.length);
      const avgLast = velocities.slice(-lastN).reduce((s, v) => s + v, 0) / lastN;
      const drop = baseline > 0 ? Math.round(((baseline - avgLast) / baseline) * 100) : 0;
      const effective = velocities.filter(v => v >= baseline * 0.8).length;
      prompt += `VELOCITY: best rep ${baseline.toFixed(2)}m/s, VL ${drop}%`;
      prompt += `, effective ${effective}/${velocities.length}\n`;
    } else if (velocities.length > 1) {
      const baseline = Math.max(...velocities);
      const last = velocities[velocities.length - 1];
      const drop = baseline > 0 ? Math.round(((baseline - last) / baseline) * 100) : 0;
      prompt += `VELOCITY: best rep ${baseline.toFixed(2)}m/s, drop ${drop}%\n`;
    }

    // Smoothness analysis — Mean Jerk magnitude
    const smoothnessScores = repsData.map(r => r.smoothnessScore).filter(s => s != null && s > 0);
    if (smoothnessScores.length > 0) {
      const avgSmoothness = Math.round(smoothnessScores.reduce((s, v) => s + v, 0) / smoothnessScores.length);
      const minSmoothness = Math.round(Math.min(...smoothnessScores));
      const smoothnessLevel = avgSmoothness >= 75 ? 'good control' : avgSmoothness >= 45 ? 'moderate control' : 'jerky movement';
      prompt += `SMOOTHNESS: avg ${avgSmoothness}/100 (${smoothnessLevel}), lowest ${minSmoothness}\n`;
    }

  }

  prompt += '\nGenerate the 2-sentence feedback JSON.';
  return prompt;
}

// ============================================================
// HANDLER — mirrors ai-insights.js handler exactly
// ============================================================
export default async function handler(req, res) {
  console.log('\n[Set Feedback API] Request received:', {
    method: req.method,
    hasAuth: !!req.headers.authorization,
  });

  // Environment variable check — same as ai-insights
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
    console.error('[Set Feedback API] Missing environment variables:', missingEnv);
    return res.status(500).json({
      error: 'Server configuration error. Missing environment variables.',
      missing: process.env.NODE_ENV === 'development' ? missingEnv : undefined,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate — same as ai-insights
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.split('Bearer ')[1];
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(token);
      console.log('[Set Feedback API] Token verified for UID:', decoded.uid);
    } catch (authError) {
      console.error('[Set Feedback API] Token verification failed:', authError.message);
      return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
    const uid = decoded.uid;

    if (!checkRateLimit(uid)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }

    const { setData } = req.body;
    if (!setData?.exerciseName) {
      return res.status(400).json({ error: 'Missing set data' });
    }

    // Build prompt
    const userPrompt = buildSetPrompt(setData);

    // Call Vertex AI — identical to ai-insights
    console.log('[Set Feedback API] Calling Vertex AI...');
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
      console.error('[Set Feedback API] Empty AI response. Full result:', JSON.stringify(result.response || result, null, 2).slice(0, 500));
      throw new Error('Empty response from AI model');
    }

    console.log('[Set Feedback API] Raw response:', text.slice(0, 300));

    let parsed;
    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('[Set Feedback API] Failed to parse AI response:', text);
      throw new Error('AI response was not valid JSON');
    }

    return res.status(200).json({
      feedback: (parsed.feedback || '').slice(0, 300),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Set Feedback API] Error:', error.message);
    console.error('[Set Feedback API] Stack:', error.stack?.slice(0, 500));

    if (error.message?.includes('quota') || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return res.status(503).json({ error: 'AI service temporarily unavailable.' });
    }
    if (error.message?.includes('timeout') || error.code === 'DEADLINE_EXCEEDED') {
      return res.status(504).json({ error: 'AI service timed out.' });
    }

    return res.status(500).json({
      error: 'Failed to generate feedback.',
      detail: error.message,
    });
  }
}
