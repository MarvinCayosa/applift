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
const SYSTEM_PROMPT = `You are a friendly gym coach giving a quick holistic recap after a set. Write 2-3 short sentences.

CONTEXT:
The app tracks each rep using a sensor on the equipment. You receive:
- Velocity Loss (VL %): Best rep speed vs average of last 3 reps. >20% = significant fatigue.
- Effective Reps: Reps within 20% of best rep speed — the "growth" reps.
- ROM (Range of Motion): Movement depth per rep (degrees or cm). Look at consistency across reps.
- Classification: Per-rep form quality labels (e.g. Good Form, Partial Rep, Compensating, etc.).
- Smoothness: Movement control score 0-100. <45 jerky, 45-74 moderate, 75+ smooth.
- Phase Timing: Concentric (lifting) and eccentric (lowering) durations per rep. Ideal eccentric is ~2× concentric.
- Rep Trend: How metrics change from first rep to last (fatigue pattern).

RULES:
1. Give a SHORT overall picture of the set covering: speed/fatigue, form quality, movement control, and ROM — in plain language. Mention what went well AND what needs work.
2. End with one specific, actionable tip for the next set based on the weakest area.
3. Talk like a coach, NOT a data scientist. Use phrases like "your speed held up nicely", "form started breaking down", "a bit jerky on the last few", "solid depth throughout".
4. Do NOT quote raw numbers, percentages, or scores. Convert data into natural observations.
5. Keep total under 50 words. Be warm, specific, and direct.
6. NEVER mention sensors, IMU, cameras, or technical system details.
7. If most metrics are good, acknowledge that and give a small refinement tip — don't invent problems.

OUTPUT FORMAT (JSON only, no markdown):
{
  "feedback": "2-3 sentence feedback here."
}`;

// ============================================================
// BUILD SET DATA PROMPT
// ============================================================
function buildSetPrompt(data) {
  const { exerciseName, equipment, weight, weightUnit, setNumber, totalSets, repsData } = data;

  let prompt = `EXERCISE: ${exerciseName} (${equipment}), ${weight}${weightUnit || 'kg'}\n`;
  prompt += `SET: ${setNumber} of ${totalSets}\n`;
  prompt += `REPS COMPLETED: ${repsData?.length || 0}\n\n`;

  if (repsData?.length) {
    // ── Per-rep detail table ──
    prompt += 'REP-BY-REP:\n';
    repsData.forEach((rep, i) => {
      const label = typeof rep.classification === 'string' ? rep.classification
        : rep.classification?.label || '—';
      const vel = rep.meanVelocity || rep.peakVelocity || 0;
      const rom = rep.rom || 0;
      const romUnit = rep.romUnit || '°';
      const lift = rep.liftingTime || 0;
      const lower = rep.loweringTime || 0;
      const smooth = rep.smoothnessScore;

      let line = `  Rep${i + 1}: ${label}`;
      if (vel > 0) line += `, vel ${vel.toFixed(2)}m/s`;
      if (rom > 0) line += `, ROM ${rom.toFixed(1)}${romUnit}`;
      if (lift > 0) line += `, conc ${lift.toFixed(2)}s ecc ${lower.toFixed(2)}s`;
      if (smooth != null) line += `, smooth ${Math.round(smooth)}/100`;
      prompt += line + '\n';
    });

    // ── Form quality distribution ──
    const distMap = {};
    repsData.forEach(r => {
      const label = typeof r.classification === 'string' ? r.classification
        : r.classification?.label || null;
      if (label) distMap[label] = (distMap[label] || 0) + 1;
    });
    if (Object.keys(distMap).length > 0) {
      const distStr = Object.entries(distMap)
        .sort((a, b) => b[1] - a[1])
        .map(([lbl, cnt]) => `${lbl}: ${cnt}/${repsData.length}`)
        .join(', ');
      prompt += `\nFORM QUALITY: ${distStr}\n`;
    }

    // ── Velocity / fatigue analysis ──
    const velocities = repsData.map(r => r.meanVelocity || r.peakVelocity || 0).filter(v => v > 0);
    if (velocities.length >= 3) {
      const baseline = Math.max(...velocities);
      const lastN = Math.min(3, velocities.length);
      const avgLast = velocities.slice(-lastN).reduce((s, v) => s + v, 0) / lastN;
      const drop = baseline > 0 ? Math.round(((baseline - avgLast) / baseline) * 100) : 0;
      const effective = velocities.filter(v => v >= baseline * 0.8).length;
      const fatigueLabel = drop > 30 ? 'heavy fatigue' : drop > 20 ? 'moderate fatigue' : drop > 10 ? 'mild fatigue' : 'minimal fatigue';
      prompt += `\nVELOCITY: best ${baseline.toFixed(2)}m/s, VL ${drop}% (${fatigueLabel})`;
      prompt += `, effective reps ${effective}/${velocities.length}\n`;
      // First-half vs second-half trend
      const mid = Math.ceil(velocities.length / 2);
      const firstHalf = velocities.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
      const secondHalf = velocities.slice(mid).reduce((s, v) => s + v, 0) / (velocities.length - mid);
      const trendPct = firstHalf > 0 ? Math.round(((firstHalf - secondHalf) / firstHalf) * 100) : 0;
      prompt += `SPEED TREND: first-half avg ${firstHalf.toFixed(2)} → second-half avg ${secondHalf.toFixed(2)} (${trendPct > 10 ? 'noticeable slowdown' : 'fairly consistent'})\n`;
    } else if (velocities.length > 0) {
      const baseline = Math.max(...velocities);
      const last = velocities[velocities.length - 1];
      const drop = baseline > 0 ? Math.round(((baseline - last) / baseline) * 100) : 0;
      prompt += `\nVELOCITY: best ${baseline.toFixed(2)}m/s, drop ${drop}%\n`;
    }

    // ── ROM consistency ──
    const roms = repsData.map(r => r.rom || 0).filter(r => r > 0);
    if (roms.length >= 2) {
      const romUnit = repsData[0]?.romUnit || '°';
      const avgRom = roms.reduce((s, v) => s + v, 0) / roms.length;
      const minRom = Math.min(...roms);
      const maxRom = Math.max(...roms);
      const romRange = maxRom - minRom;
      const romCV = avgRom > 0 ? Math.round((Math.sqrt(roms.reduce((s, v) => s + (v - avgRom) ** 2, 0) / roms.length) / avgRom) * 100) : 0;
      const romLabel = romCV <= 8 ? 'very consistent' : romCV <= 15 ? 'mostly consistent' : 'inconsistent';
      prompt += `\nROM: avg ${avgRom.toFixed(1)}${romUnit}, range ${minRom.toFixed(1)}-${maxRom.toFixed(1)}, variability ${romCV}% (${romLabel})\n`;
    }

    // ── Smoothness / movement control ──
    const smoothnessScores = repsData.map(r => r.smoothnessScore).filter(s => s != null && s > 0);
    if (smoothnessScores.length > 0) {
      const avgSmooth = Math.round(smoothnessScores.reduce((s, v) => s + v, 0) / smoothnessScores.length);
      const minSmooth = Math.round(Math.min(...smoothnessScores));
      const smoothLabel = avgSmooth >= 75 ? 'smooth and controlled' : avgSmooth >= 45 ? 'moderate control' : 'jerky/rushed';
      // Trend: first half vs second half
      let smoothTrend = '';
      if (smoothnessScores.length >= 4) {
        const mid = Math.ceil(smoothnessScores.length / 2);
        const firstAvg = Math.round(smoothnessScores.slice(0, mid).reduce((s, v) => s + v, 0) / mid);
        const secondAvg = Math.round(smoothnessScores.slice(mid).reduce((s, v) => s + v, 0) / (smoothnessScores.length - mid));
        smoothTrend = firstAvg > secondAvg + 10 ? ', control dropped toward end' : firstAvg < secondAvg - 10 ? ', improved control toward end' : ', control stayed steady';
      }
      prompt += `\nSMOOTHNESS: avg ${avgSmooth}/100 (${smoothLabel}), lowest rep ${minSmooth}${smoothTrend}\n`;
    }

    // ── Phase timing ──
    const concTimes = repsData.map(r => r.liftingTime || 0).filter(t => t > 0);
    const eccTimes = repsData.map(r => r.loweringTime || 0).filter(t => t > 0);
    if (concTimes.length > 0 && eccTimes.length > 0) {
      const avgConc = concTimes.reduce((s, v) => s + v, 0) / concTimes.length;
      const avgEcc = eccTimes.reduce((s, v) => s + v, 0) / eccTimes.length;
      const ratio = avgConc > 0 ? (avgEcc / avgConc).toFixed(1) : '—';
      const tempoLabel = avgEcc >= avgConc * 1.8 ? 'good eccentric control' : avgEcc >= avgConc * 1.2 ? 'decent tempo' : 'lowering too fast';
      prompt += `\nTEMPO: avg conc ${avgConc.toFixed(2)}s / ecc ${avgEcc.toFixed(2)}s (ratio ${ratio}:1, ${tempoLabel})\n`;
    }
  }

  prompt += '\nUsing ALL the data above, generate a holistic 2-3 sentence feedback JSON.';
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
      feedback: (parsed.feedback || '').slice(0, 400), // Increased from 300 to 400
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
