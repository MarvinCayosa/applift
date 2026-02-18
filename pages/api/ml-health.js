/**
 * ML Health Check API Route
 * 
 * Tests connectivity between Vercel and Cloud Run.
 * 
 * GET /api/ml-health - Check if Cloud Run ML API is reachable
 */

const ML_API_URL = process.env.NEXT_PUBLIC_ML_API_URL || process.env.ML_API_URL || 'http://localhost:8080';

export default async function handler(req, res) {
  const startTime = Date.now();
  const diagnostics = {
    timestamp: new Date().toISOString(),
    mlApiUrl: ML_API_URL,
    envVarSource: process.env.NEXT_PUBLIC_ML_API_URL ? 'NEXT_PUBLIC_ML_API_URL' : 
                  process.env.ML_API_URL ? 'ML_API_URL' : 'fallback (localhost)',
    nodeVersion: process.version,
    vercelRegion: process.env.VERCEL_REGION || 'unknown',
  };

  // Test 1: Root endpoint (health check)
  try {
    const healthResponse = await fetch(`${ML_API_URL}/`, {
      signal: AbortSignal.timeout(15000)
    });
    const healthData = await healthResponse.json();
    diagnostics.healthCheck = {
      status: 'OK',
      httpStatus: healthResponse.status,
      responseTimeMs: Date.now() - startTime,
      data: healthData
    };
  } catch (error) {
    diagnostics.healthCheck = {
      status: 'FAILED',
      errorType: error.name,
      errorMessage: error.message,
      responseTimeMs: Date.now() - startTime,
    };
  }

  // Test 2: Models endpoint
  const modelsStart = Date.now();
  try {
    const modelsResponse = await fetch(`${ML_API_URL}/models`, {
      signal: AbortSignal.timeout(15000)
    });
    const modelsData = await modelsResponse.json();
    diagnostics.modelsCheck = {
      status: 'OK',
      httpStatus: modelsResponse.status,
      responseTimeMs: Date.now() - modelsStart,
      models: modelsData
    };
  } catch (error) {
    diagnostics.modelsCheck = {
      status: 'FAILED',
      errorType: error.name,
      errorMessage: error.message,
      responseTimeMs: Date.now() - modelsStart,
    };
  }

  // Test 3: Quick classify test
  const classifyStart = Date.now();
  try {
    const classifyResponse = await fetch(`${ML_API_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exercise_type: 'CONCENTRATION_CURLS',
        features: {
          rep_duration_ms: 2500,
          sample_count: 50,
          filteredMag_mean: 1.02,
          filteredMag_std: 0.15
        }
      }),
      signal: AbortSignal.timeout(15000)
    });
    const classifyData = await classifyResponse.json();
    diagnostics.classifyTest = {
      status: classifyResponse.ok ? 'OK' : 'ERROR',
      httpStatus: classifyResponse.status,
      responseTimeMs: Date.now() - classifyStart,
      result: classifyData
    };
  } catch (error) {
    diagnostics.classifyTest = {
      status: 'FAILED',
      errorType: error.name,
      errorMessage: error.message,
      responseTimeMs: Date.now() - classifyStart,
    };
  }

  diagnostics.totalTimeMs = Date.now() - startTime;
  diagnostics.overallStatus = 
    diagnostics.healthCheck?.status === 'OK' && 
    diagnostics.modelsCheck?.status === 'OK' && 
    diagnostics.classifyTest?.status === 'OK' 
      ? 'ALL SYSTEMS GO' 
      : 'ISSUES DETECTED';

  const statusCode = diagnostics.overallStatus === 'ALL SYSTEMS GO' ? 200 : 503;
  return res.status(statusCode).json(diagnostics);
}
