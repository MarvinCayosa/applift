/**
 * Simple API health check - no external dependencies
 * This helps diagnose if the issue is with API routes or dependencies
 */

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Simple response - no external dependencies
  return res.status(200).json({
    success: true,
    message: 'API routes are working',
    timestamp: new Date().toISOString(),
    method: req.method,
  });
}
