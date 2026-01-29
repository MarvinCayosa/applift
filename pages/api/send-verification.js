/**
 * API Route: /api/send-verification
 * Sends verification email with 6-digit code
 */

// Simple email sending using a mock service (replace with real email service)
// For production, you would use services like SendGrid, AWS SES, or Nodemailer with SMTP

// Rate limiting - simple in-memory store
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // Max 5 verification emails per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now - record.timestamp > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, timestamp: now });
    return true;
  }
  
  if (record.count >= MAX_REQUESTS) {
    return false;
  }
  
  record.count++;
  return true;
}

// Mock email service (replace with actual email service)
async function sendVerificationEmail(email, code, username) {
  // For development/demo purposes, we'll just log the email
  // In production, replace this with actual email sending service
  
  console.log(`
    📧 VERIFICATION EMAIL (Demo Mode)
    ═══════════════════════════════════
    To: ${email}
    Subject: Verify your AppLift account
    
    Hi ${username},
    
    Your verification code is: ${code}
    
    This code will expire in 10 minutes.
    
    Welcome to AppLift!
    ═══════════════════════════════════
  `);

  // Simulate email sending delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  return true;
}

export default async function handler(req, res) {
  // Get client IP for rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
             req.headers['x-real-ip'] || 
             req.socket?.remoteAddress || 
             'unknown';
  
  // Check rate limit
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      error: 'Too many verification requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method === 'POST') {
    const { email, code, username } = req.body;

    // Validate input
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ 
        error: 'Email is required',
        code: 'INVALID_EMAIL'
      });
    }

    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ 
        error: 'Valid 6-digit code is required',
        code: 'INVALID_CODE'
      });
    }

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ 
        error: 'Username is required',
        code: 'INVALID_USERNAME'
      });
    }

    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      // Send verification email
      await sendVerificationEmail(normalizedEmail, code, username);
      
      return res.status(200).json({ 
        success: true,
        message: 'Verification code sent successfully'
      });
    } catch (error) {
      console.error('Error sending verification email:', error);
      
      return res.status(500).json({ 
        error: 'Failed to send verification email. Please try again.',
        code: 'SEND_EMAIL_FAILED'
      });
    }
  }

  // Method not allowed
  res.setHeader('Allow', ['POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
