/**
 * Full AI Recommendation Test — replicates the exact real endpoint flow
 * WITHOUT auth, so we can test from browser directly.
 * Hit: https://applift.fit/api/ai-test
 */

import { VertexAI } from '@google-cloud/vertexai';
import admin from 'firebase-admin';

// Same Firebase Admin init as the real endpoint
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (initErr) {
    console.error('Firebase Admin init failed:', initErr.message);
  }
}

// Same system prompt as the real endpoint
const SYSTEM_PROMPT = `You are a certified strength and conditioning coach AI for AppLift, a fitness training application.

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object, no markdown, no code fences, no explanation outside the JSON. The JSON must have this exact structure:
{
  "recommendedLoad": <number in kg>,
  "sets": <integer>,
  "reps": <integer>,
  "restTimeSeconds": <integer>,
  "estimatedCalories": <integer>,
  "safetyJustification": "<1-2 sentences>",
  "guidelineReference": "<which guideline applies>",
  "progressionNotes": "<brief coaching note>"
}`;

export default async function handler(req, res) {
  const results = {
    timestamp: new Date().toISOString(),
    steps: [],
  };

  // Step 1: Firebase Admin check
  try {
    const apps = admin.apps;
    results.steps.push({ step: 'Firebase Admin', status: 'PASS', appCount: apps.length });
  } catch (e) {
    results.steps.push({ step: 'Firebase Admin', status: 'FAIL', error: e.message });
  }

  // Step 2: Create Vertex AI client (exact same as real endpoint)
  let vertexAI;
  try {
    const project = process.env.VERTEX_AI_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCS_PROJECT_ID;
    const location = process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    const clientEmail = process.env.VERTEX_AI_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL;
    const privateKey = (process.env.VERTEX_AI_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY)?.replace(/\\n/g, '\n');

    vertexAI = new VertexAI({
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
    results.steps.push({ step: 'Vertex AI Client', status: 'PASS' });
  } catch (e) {
    results.steps.push({ step: 'Vertex AI Client', status: 'FAIL', error: e.message });
    return res.status(200).json(results);
  }

  // Step 3: Create model (exact same config as real endpoint)
  let generativeModel;
  try {
    const model = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';
    generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
    });
    results.steps.push({ step: 'Model Config', status: 'PASS', model });
  } catch (e) {
    results.steps.push({ step: 'Model Config', status: 'FAIL', error: e.message });
    return res.status(200).json(results);
  }

  // Step 4: Generate content (exact same pattern as real endpoint)
  try {
    const userPrompt = `Generate a workout recommendation for the following:

EXERCISE: Flat Bench Barbell Press
EQUIPMENT: Barbell

USER PROFILE:
- Weight: 75 kg
- Training Experience: intermediate
- Primary Goal: muscle_gain

NO PAST SESSION DATA available. Generate a CONSERVATIVE initial recommendation.`;

    const startTime = Date.now();
    const result = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });
    const elapsed = Date.now() - startTime;

    let responseText;
    if (typeof result.response?.text === 'function') {
      responseText = result.response.text();
    } else {
      responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    // Dump full response structure to see thinking vs. output parts
    const candidates = result.response?.candidates || [];
    const allParts = candidates[0]?.content?.parts || [];
    const partsInfo = allParts.map((p, i) => ({
      index: i,
      hasText: !!p.text,
      textLength: p.text?.length,
      textPreview: p.text?.slice(0, 200),
      thought: p.thought || false,
    }));

    results.steps.push({ 
      step: 'Generate Content', 
      status: responseText ? 'PASS' : 'FAIL — empty response',
      elapsed: `${elapsed}ms`,
      rawResponseLength: responseText?.length,
      rawResponseFirst500: responseText?.slice(0, 500),
      rawResponseLast200: responseText?.slice(-200),
      candidateCount: candidates.length,
      partsCount: allParts.length,
      partsInfo,
      finishReason: candidates[0]?.finishReason,
    });

    // Step 5: Parse JSON (exact same as real endpoint)
    if (responseText) {
      try {
        const cleaned = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        results.steps.push({ 
          step: 'JSON Parse', 
          status: 'PASS',
          parsed,
        });
      } catch (parseErr) {
        results.steps.push({ 
          step: 'JSON Parse', 
          status: 'FAIL',
          error: parseErr.message,
          rawToDebug: responseText?.slice(0, 300),
        });
      }
    }
  } catch (genError) {
    results.steps.push({ 
      step: 'Generate Content', 
      status: 'FAIL',
      error: genError.message?.slice(0, 500),
      errorName: genError.name,
      errorCode: genError.code,
      stack: genError.stack?.slice(0, 300),
    });
  }

  // Step 6: Test Auth verification (simulate what happens with a real token)
  try {
    // Just test that admin.auth() is callable
    const auth = admin.auth();
    results.steps.push({ step: 'Firebase Auth Service', status: 'PASS' });
  } catch (authErr) {
    results.steps.push({ step: 'Firebase Auth Service', status: 'FAIL', error: authErr.message });
  }

  return res.status(200).json(results);
}
