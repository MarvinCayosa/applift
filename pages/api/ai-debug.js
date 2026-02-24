/**
 * AI Recommendation Diagnostic Endpoint
 * Hit https://applift.fit/api/ai-debug to see what's missing
 */

export default async function handler(req, res) {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    vertexAI: {},
    firebase: {},
    steps: [],
  };

  // Step 1: Check ALL Vertex AI env vars
  const vertexVars = {
    VERTEX_AI_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID,
    VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION,
    VERTEX_AI_MODEL: process.env.VERTEX_AI_MODEL,
    VERTEX_AI_CLIENT_EMAIL: process.env.VERTEX_AI_CLIENT_EMAIL,
    VERTEX_AI_PRIVATE_KEY: process.env.VERTEX_AI_PRIVATE_KEY ? `SET (${process.env.VERTEX_AI_PRIVATE_KEY.length} chars)` : 'MISSING',
    VERTEX_AI_PRIVATE_KEY_ID: process.env.VERTEX_AI_PRIVATE_KEY_ID ? 'SET' : 'MISSING',
  };

  // Fallback vars
  const fallbackVars = {
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? 'SET' : 'MISSING',
    GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION ? 'SET' : 'MISSING',
    GCS_PROJECT_ID: process.env.GCS_PROJECT_ID ? 'SET' : 'MISSING',
    GCS_CLIENT_EMAIL: process.env.GCS_CLIENT_EMAIL ? 'SET' : 'MISSING',
    GCS_PRIVATE_KEY: process.env.GCS_PRIVATE_KEY ? `SET (${process.env.GCS_PRIVATE_KEY.length} chars)` : 'MISSING',
  };

  const firebaseVars = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING',
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? `SET (${process.env.FIREBASE_PRIVATE_KEY.length} chars)` : 'MISSING',
  };

  diagnostics.vertexAI = {
    primary: Object.fromEntries(
      Object.entries(vertexVars).map(([k, v]) => [k, v && !v.toString().includes('MISSING') ? (k.includes('KEY') ? v : v) : 'MISSING'])
    ),
    fallback: fallbackVars,
  };
  diagnostics.firebase = firebaseVars;

  // Determine effective project/email
  const effectiveProject = process.env.VERTEX_AI_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCS_PROJECT_ID;
  const effectiveEmail = process.env.VERTEX_AI_CLIENT_EMAIL || process.env.GCS_CLIENT_EMAIL;
  const effectiveKey = process.env.VERTEX_AI_PRIVATE_KEY || process.env.GCS_PRIVATE_KEY;

  diagnostics.effective = {
    project: effectiveProject || 'NONE — WILL FAIL',
    clientEmail: effectiveEmail || 'NONE — WILL FAIL',
    hasPrivateKey: !!effectiveKey,
    privateKeyLength: effectiveKey?.length || 0,
    privateKeyStartsCorrectly: effectiveKey?.includes('BEGIN PRIVATE KEY') || false,
  };

  // Step 2: Try to initialize Vertex AI client
  if (effectiveProject && effectiveEmail && effectiveKey) {
    try {
      const { VertexAI } = await import('@google-cloud/vertexai');
      const privateKey = effectiveKey.replace(/\\n/g, '\n');
      
      const vertexAI = new VertexAI({
        project: effectiveProject,
        location: process.env.VERTEX_AI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        googleAuthOptions: {
          credentials: {
            client_email: effectiveEmail,
            private_key: privateKey,
          },
          projectId: effectiveProject,
        },
      });

      diagnostics.steps.push({ step: 'VertexAI Client Init', status: 'PASS' });

      // Step 3: Try to call the model
      try {
        const model = process.env.VERTEX_AI_MODEL || 'gemini-2.0-flash';
        const generativeModel = vertexAI.preview.getGenerativeModel({
          model,
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 100,
          },
        });

        diagnostics.steps.push({ step: `Model Load (${model})`, status: 'PASS' });

        // Step 4: Simple API call (no JSON mode, no system instruction)
        try {
          const result = await generativeModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Say "hello" in JSON: {"message":"hello"}' }] }],
          });

          let responseText;
          if (typeof result.response?.text === 'function') {
            responseText = result.response.text();
          } else {
            responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          }

          diagnostics.steps.push({ 
            step: 'Simple API Call', 
            status: 'PASS',
            response: responseText?.slice(0, 200),
          });
        } catch (apiError) {
          diagnostics.steps.push({ 
            step: 'Simple API Call', 
            status: 'FAIL',
            error: apiError.message,
            hint: getHint(apiError.message),
          });
        }

        // Step 5: Test with responseMimeType (JSON mode) — matches real endpoint
        try {
          const jsonModel = vertexAI.preview.getGenerativeModel({
            model,
            generationConfig: {
              temperature: 0.3,
              topP: 0.8,
              topK: 40,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
            },
            systemInstruction: {
              parts: [{ text: 'You are a fitness coach. Respond with JSON only.' }],
            },
          });

          const result2 = await jsonModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Recommend weight for bench press. Respond as: {"weight":60,"sets":3,"reps":8}' }] }],
          });

          let responseText2;
          if (typeof result2.response?.text === 'function') {
            responseText2 = result2.response.text();
          } else {
            responseText2 = result2.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          }

          diagnostics.steps.push({ 
            step: 'JSON Mode + SystemInstruction Call', 
            status: 'PASS',
            response: responseText2?.slice(0, 300),
          });
        } catch (jsonError) {
          diagnostics.steps.push({ 
            step: 'JSON Mode + SystemInstruction Call', 
            status: 'FAIL',
            error: jsonError.message?.slice(0, 500),
            hint: getHint(jsonError.message),
          });
        }

        // Step 6: Test with gemini-2.0-flash as fallback
        try {
          const fallbackModel = vertexAI.preview.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 256,
              responseMimeType: 'application/json',
            },
            systemInstruction: {
              parts: [{ text: 'You are a fitness coach. Respond with JSON only.' }],
            },
          });

          const result3 = await fallbackModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Recommend weight for bench press. JSON: {"weight":60,"sets":3,"reps":8}' }] }],
          });

          let responseText3;
          if (typeof result3.response?.text === 'function') {
            responseText3 = result3.response.text();
          } else {
            responseText3 = result3.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          }

          diagnostics.steps.push({ 
            step: 'Fallback gemini-2.0-flash Call', 
            status: 'PASS',
            response: responseText3?.slice(0, 300),
          });
        } catch (fallbackError) {
          diagnostics.steps.push({ 
            step: 'Fallback gemini-2.0-flash Call', 
            status: 'FAIL',
            error: fallbackError.message?.slice(0, 500),
            hint: getHint(fallbackError.message),
          });
        }
      } catch (modelError) {
        diagnostics.steps.push({ 
          step: 'Model Load', 
          status: 'FAIL',
          error: modelError.message,
        });
      }
    } catch (initError) {
      diagnostics.steps.push({ 
        step: 'VertexAI Client Init', 
        status: 'FAIL',
        error: initError.message,
      });
    }
  } else {
    diagnostics.steps.push({ 
      step: 'VertexAI Client Init', 
      status: 'SKIP — Missing env vars',
      missingProject: !effectiveProject,
      missingEmail: !effectiveEmail,
      missingKey: !effectiveKey,
    });
  }

  // Summary
  const failedSteps = diagnostics.steps.filter(s => s.status?.startsWith('FAIL'));
  diagnostics.summary = {
    status: failedSteps.length === 0 && diagnostics.steps.some(s => s.status === 'PASS') ? 'ALL GOOD' : 'HAS ISSUES',
    failedSteps: failedSteps.map(s => `${s.step}: ${s.error || s.status}`),
    action: getActionItems(diagnostics),
  };

  return res.status(200).json(diagnostics);
}

function getHint(errorMessage) {
  if (errorMessage?.includes('PERMISSION_DENIED') || errorMessage?.includes('403')) {
    return 'Service account lacks Vertex AI permissions. Go to Google Cloud Console > IAM > Add role "Vertex AI User" to the service account.';
  }
  if (errorMessage?.includes('NOT_FOUND') || errorMessage?.includes('404')) {
    return 'Model or project not found. Check VERTEX_AI_PROJECT_ID and VERTEX_AI_MODEL. Make sure Vertex AI API is enabled.';
  }
  if (errorMessage?.includes('UNAUTHENTICATED') || errorMessage?.includes('401')) {
    return 'Authentication failed. The private key may be invalid or the service account may be disabled.';
  }
  if (errorMessage?.includes('RESOURCE_EXHAUSTED') || errorMessage?.includes('quota')) {
    return 'Quota exceeded. Check your Google Cloud billing and Vertex AI quotas.';
  }
  if (errorMessage?.includes('API has not been used') || errorMessage?.includes('accessNotConfigured')) {
    return 'Vertex AI API is NOT enabled. Go to Google Cloud Console > APIs & Services > Enable "Vertex AI API" (aiplatform.googleapis.com).';
  }
  return 'Check Google Cloud Console for more details.';
}

function getActionItems(diagnostics) {
  const items = [];
  
  if (diagnostics.effective.project === 'NONE — WILL FAIL') {
    items.push('Add VERTEX_AI_PROJECT_ID to Vercel Environment Variables');
  }
  if (diagnostics.effective.clientEmail === 'NONE — WILL FAIL') {
    items.push('Add VERTEX_AI_CLIENT_EMAIL to Vercel Environment Variables');
  }
  if (!diagnostics.effective.hasPrivateKey) {
    items.push('Add VERTEX_AI_PRIVATE_KEY to Vercel Environment Variables');
  }
  if (!diagnostics.effective.privateKeyStartsCorrectly && diagnostics.effective.hasPrivateKey) {
    items.push('VERTEX_AI_PRIVATE_KEY format is wrong — must start with "-----BEGIN PRIVATE KEY-----"');
  }
  
  if (items.length === 0) {
    const apiCallStep = diagnostics.steps.find(s => s.step === 'Vertex AI API Call');
    if (apiCallStep?.status === 'FAIL') {
      items.push(apiCallStep.hint || 'Check Vertex AI API is enabled and service account has permissions');
    }
  }
  
  if (items.length === 0) {
    items.push('Configuration looks correct! If still failing, check Vercel function logs.');
  }
  
  return items;
}
