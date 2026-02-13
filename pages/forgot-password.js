import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Head from 'next/head'
import { useAuth } from '../context/AuthContext'
import { shouldUseAppMode } from '../utils/pwaInstalled'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isAppMode, setIsAppMode] = useState(false)
  const { resetPassword } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsAppMode(shouldUseAppMode())
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!email.trim()) {
      setError('Please enter your email address.')
      setLoading(false)
      return
    }

    try {
      await resetPassword(email.trim())
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = (e) => {
    e.preventDefault()
    router.push('/login')
  }

  return (
    <>
      <Head>
        <title>Reset Password | Applift</title>
        <meta name="description" content="Reset your Applift password" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
      </Head>

      <style jsx>{`
        .auth-container {
          height: 100dvh;
          width: 100vw;
          overflow: hidden;
          padding-top: max(0.5rem, env(safe-area-inset-top));
          padding-bottom: env(safe-area-inset-bottom);
          padding-left: max(1rem, env(safe-area-inset-left));
          padding-right: max(1rem, env(safe-area-inset-right));
        }

        @media (min-width: 768px) {
          .auth-container {
            min-height: 100vh;
            height: auto;
            overflow: auto;
            padding: 1.5rem;
          }
        }

        .auth-wrapper {
          max-width: 420px;
          max-height: 100%;
          overflow: auto;
        }

        @media (min-width: 768px) {
          .auth-wrapper {
            max-width: 28rem;
            max-height: none;
            overflow: visible;
          }
        }
      `}</style>

      <div className="auth-container bg-black flex items-center justify-center">
        <div className="auth-wrapper relative w-full">
          <div 
            className="bg-white/5 backdrop-blur-md rounded-[36px] shadow-2xl relative"
            style={{
              padding: 'clamp(1rem, 3vh, 2rem)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(0.75rem, 2vh, 1.25rem)',
            }}
          >
            {/* Back Button */}
            <button
              type="button"
              onClick={handleBackToLogin}
              className="absolute p-2 hover:opacity-70 transition-opacity touch-manipulation"
              style={{ 
                top: 'clamp(0.75rem, 2vh, 1rem)',
                left: 'clamp(0.75rem, 2vw, 1rem)',
                marginTop: '8px',
                zIndex: 10,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent'
              }}
              aria-label="Go back"
            >
              <img src="/svg/back-arrow.svg" alt="" width="20" height="20" style={{ pointerEvents: 'none' }} />
            </button>

            {/* Header */}
            <h1 className="font-semibold text-center" style={{
              color: 'var(--app-white)',
              fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
              marginBottom: 'clamp(0.125rem, 0.5vh, 0.25rem)',
            }}>Reset Password</h1>
            <p style={{
              color: 'rgba(238,235,217,0.8)',
              fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
              textAlign: 'center',
              marginBottom: '20px',
            }}>Enter your email to receive a reset link</p>

            {success ? (
              /* Success State */
              <div className="text-center" style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1rem, 3vh, 1.5rem)' }}>
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-4">
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✉️</div>
                  <p style={{ color: 'rgb(52, 211, 153)', fontSize: 'clamp(0.875rem, 3vw, 1rem)', fontWeight: '500' }}>
                    Check your email!
                  </p>
                  <p style={{ color: 'rgba(238,235,217,0.7)', fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)', marginTop: '0.5rem' }}>
                    We've sent a password reset link to <strong style={{ color: 'rgba(238,235,217,0.9)' }}>{email}</strong>
                  </p>
                </div>

                <p style={{ color: 'rgba(238,235,217,0.6)', fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)' }}>
                  Didn't receive the email? Check your spam folder or try again.
                </p>

                <button
                  type="button"
                  onClick={() => { setSuccess(false); setEmail(''); }}
                  className="w-full rounded-full bg-white/10 text-white font-semibold hover:bg-white/20 transition-colors"
                  style={{
                    fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                    padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                  }}
                >
                  Try another email
                </button>

                <Link href="/login">
                  <a 
                    className="w-full rounded-full bg-[#EEEDB9] text-black font-semibold flex items-center justify-center"
                    style={{
                      fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                      padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                    }}
                  >
                    Back to Sign In
                  </a>
                </Link>
              </div>
            ) : (
              /* Form State */
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
                {/* Error message */}
                {error && (
                  <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3" style={{
                    fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
                  }}>
                    <p style={{ color: 'rgb(251, 113, 133)', margin: 0 }}>{error}</p>
                  </div>
                )}

                {/* Email Input */}
                <label className="block">
                  <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-full bg-black/40 text-white placeholder-gray-400 border border-white/5 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all"
                    style={{
                      fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                      padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                      marginTop: 'clamp(0.25rem, 1vh, 0.5rem)',
                    }}
                    placeholder="Enter your email"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </label>

                {/* Submit Button */}
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full rounded-full bg-[#EEEDB9] text-black font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                    padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                    marginTop: 'clamp(0.5rem, 1.5vh, 0.75rem)',
                  }}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>

                {/* Back to login link */}
                <div className="text-center" style={{ fontSize: 'clamp(0.8rem, 2.75vw, 0.875rem)', marginTop: 'clamp(0.5rem, 1.5vh, 1rem)' }}>
                  Remember your password?{' '}
                  <Link href="/login">
                    <a style={{ color: '#a855f7', textDecoration: 'underline' }}>Sign in</a>
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
