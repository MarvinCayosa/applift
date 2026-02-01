# Vercel Debugging Guide

## If API routes still don't work on Vercel:

### 1. Check Vercel Function Logs
- Go to Vercel Dashboard → Your Project → Functions tab
- Look for error logs in the `/api/imu-stream` function

### 2. Test Environment Variables
Visit: https://applift.fit/api/check-env
This will tell you if environment variables are properly set.

### 3. Test Basic API
Visit: https://applift.fit/api/test-deployment
This should return a success message if API routes are working.

### 4. Check CORS Issues
The 405 error might be due to:
- Preflight OPTIONS requests not being handled
- CORS headers missing
- Method not allowed

### 5. Enable Vercel Function Logs
Run this command to see real-time logs:
```bash
vercel logs --follow
```

### 6. Common Vercel Issues:
- Private keys not properly formatted (need actual newlines)
- Environment variables not set for all environments (Production, Preview, Development)
- Serverless function timeout (max 30 seconds)
- Package dependencies not installed

### 7. Fallback: Use Serverless Functions
If API routes still don't work, we can convert to Vercel Serverless Functions format.

## Quick Test Commands:

```bash
# Test API endpoint
curl -X POST https://applift.fit/api/imu-stream

# Should return 401 (unauthorized) instead of 405 (method not allowed)
```

If you still get 405 errors, the API route isn't being recognized by Vercel.
