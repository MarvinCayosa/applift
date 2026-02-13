import Head from 'next/head'
import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../context/AuthContext'
import { shouldUseAppMode } from '../utils/pwaInstalled'
import LoadingScreen from '../components/LoadingScreen'

export default function Login() {
  const router = useRouter()
  const { signInWithEmail, signInWithGoogle, user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const [emailError, setEmailError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [showPwReminder, setShowPwReminder] = useState(false)
  const [isAppMode, setIsAppMode] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIsAppMode(shouldUseAppMode())
  }, [])

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      // Use router.replace to prevent back button from returning to login
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?"':{}|<>\-_=+\/\\\[\]`~;]/.test(password),
  }

  async function handleSubmit(e) {
    e.preventDefault()
    // Clear any previous custom validity
    if (emailRef.current) emailRef.current.setCustomValidity('')
    if (passwordRef.current) passwordRef.current.setCustomValidity('')
    setEmailError(false)
    setPasswordError(false)

    // Email required
    if (!email) {
      if (emailRef.current) {
        emailRef.current.reportValidity()
        emailRef.current.focus()
        setEmailError(true)
      }
      return
    }
    if (!email.includes('@')) {
      if (emailRef.current) {
        emailRef.current.setCustomValidity('Email must contain an @')
        emailRef.current.reportValidity()
        emailRef.current.focus()
      }
      return
    }

    // Password rules
    const pwErrors = []
    if (!requirements.uppercase) pwErrors.push('include an uppercase letter')
    if (!requirements.number) pwErrors.push('include a number')
    if (!requirements.special) pwErrors.push('include a special character')
    if (!requirements.length) pwErrors.push('be at least 8 characters')

    if (pwErrors.length) {
      const message = `Password must ${pwErrors.join(', ')}`
      if (passwordRef.current) {
        passwordRef.current.setCustomValidity(message)
        passwordRef.current.reportValidity()
        passwordRef.current.focus()
        setPasswordError(true)
      }
      return
    }

    try {
      setError('');
      setIsSigningIn(true);
      await signInWithEmail(email, password)
      
      // Redirect happens automatically via useEffect when user state updates
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'Failed to sign in. Please check your credentials.')
      setIsSigningIn(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      setError('');
      setIsSigningIn(true);
      const result = await signInWithGoogle()
      
      if (result?.isNewUser && !result?.onboardingCompleted) {
        // New user - redirect to signup step 3 (birthday) to complete profile
        // Skip step 1 (terms) and step 2 (account) since Google already provided auth
        router.push('/signup?step=3&provider=google');
      } else {
        // Existing user with completed onboarding - redirect happens automatically via useEffect
      }
    } catch (err) {
      console.error('Google sign-in error:', err)
      setError('Google sign-in failed: ' + (err.message || 'Unknown error'))
      setIsSigningIn(false);
    }
  }

  // Handle back button to go to splash
  const handleBackToSplash = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Go to splash page final slide (slide 3 = index 3 with Create Account/Sign In buttons)
    window.location.href = '/splash?slide=3';
  }

  // Show loading state while checking authentication
  if (loading) {
    return <LoadingScreen message="Loading..." />
  }

  // Show signing in loading screen
  if (isSigningIn) {
    return <LoadingScreen message="Signing you in..." />
  }

  // Don't render login form if already authenticated
  if (user) {
    return null
  }

  return (
    <>
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

        @media (display-mode: fullscreen), (display-mode: standalone) {
          .auth-container {
            padding-top: max(1.25rem, env(safe-area-inset-top, 1.25rem));
          }
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
      <Head>
        <title>Log in — AppLift</title>
        <meta name="description" content="Log in to your account" />
      </Head>
      
      <div className="auth-wrapper relative w-full">
        <div className="bg-white/5 backdrop-blur-md rounded-[36px] shadow-2xl relative" style={{
          padding: 'clamp(1rem, 3vh, 2rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(0.75rem, 2vh, 1.25rem)',
        }}>
          {/* Back button - inside container, upper left */}
          <button
            onClick={handleBackToSplash}
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
          
          <h1 className="font-semibold text-center" style={{
            color: 'var(--app-white)',
            fontSize: 'clamp(1.25rem, 4vw, 1.5rem)',
            marginBottom: 'clamp(0.125rem, 0.5vh, 0.25rem)',
          }}>Welcome Back!</h1>
          <p style={{
            color: 'rgba(238,235,217,0.8)',
            fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
            textAlign: 'center',
            marginBottom: '15px',
          }}>Sign in to your account</p>

          {/* Error message */}
          {error && (
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3" style={{
              fontSize: 'clamp(0.75rem, 2.5vw, 0.875rem)',
            }}>
              <p style={{ color: 'rgb(251, 113, 133)', margin: 0 }}>{error}</p>
            </div>
          )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(0.75rem, 2vh, 1rem)' }}>
              <label className="block">
                <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>Email</span>
              <input
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(false); if (emailRef.current) emailRef.current.setCustomValidity('') }}
                  className={`w-full rounded-full bg-black/40 text-white placeholder-gray-400 border ${emailError ? 'border-rose-400' : 'border-white/5'}`}
                  style={{
                    fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                    padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                    marginTop: 'clamp(0.25rem, 1vh, 0.5rem)',
                  }}
                  placeholder="Email"
                required
              />
            </label>

            <label className="block relative">
              <span style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: 'rgba(238,235,217,0.85)' }}>Password</span>
              <div className="relative" style={{ marginTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>
                <input
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(false); if (passwordRef.current) passwordRef.current.setCustomValidity('') }}
                  onFocus={() => setShowPwReminder(true)}
                  onBlur={() => setShowPwReminder(false)}
                  className={`w-full rounded-full bg-black/40 text-white placeholder-gray-400 ${passwordError ? 'border-rose-400' : 'border border-white/5'} focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 transition-all`}
                  style={{
                    fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                    padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(2.5rem, 8vw, 3rem) clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
                  }}
                  placeholder="Password"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="currentColor">
                      <path d="M73 39.1C63.6 29.7 48.4 29.7 39.1 39.1C29.8 48.5 29.7 63.7 39 73.1L567 601.1C576.4 610.5 591.6 610.5 600.9 601.1C610.2 591.7 610.3 576.5 600.9 567.2L504.5 470.8C507.2 468.4 509.9 466 512.5 463.6C559.3 420.1 590.6 368.2 605.5 332.5C608.8 324.6 608.8 315.8 605.5 307.9C590.6 272.2 559.3 220.2 512.5 176.8C465.4 133.1 400.7 96.2 319.9 96.2C263.1 96.2 214.3 114.4 173.9 140.4L73 39.1zM208.9 175.1C241 156.2 278.1 144 320 144C385.2 144 438.8 173.6 479.9 211.7C518.4 247.4 545 290 558.5 320C544.9 350 518.3 392.5 479.9 428.3C476.8 431.1 473.7 433.9 470.5 436.7L425.8 392C439.8 371.5 448 346.7 448 320C448 249.3 390.7 192 320 192C293.3 192 268.5 200.2 248 214.2L208.9 175.1zM390.9 357.1L282.9 249.1C294 243.3 306.6 240 320 240C364.2 240 400 275.8 400 320C400 333.4 396.7 346 390.9 357.1zM135.4 237.2L101.4 203.2C68.8 240 46.4 279 34.5 307.7C31.2 315.6 31.2 324.4 34.5 332.3C49.4 368 80.7 420 127.5 463.4C174.6 507.1 239.3 544 320.1 544C357.4 544 391.3 536.1 421.6 523.4L384.2 486C364.2 492.4 342.8 496 320 496C254.8 496 201.2 466.4 160.1 428.3C121.6 392.6 95 350 81.5 320C91.9 296.9 110.1 266.4 135.5 237.2z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 640 640" fill="currentColor">
                      <path d="M320 144C254.8 144 201.2 173.6 160.1 211.7C121.6 247.5 95 290 81.4 320C95 350 121.6 392.5 160.1 428.3C201.2 466.4 254.8 496 320 496C385.2 496 438.8 466.4 479.9 428.3C518.4 392.5 545 350 558.6 320C545 290 518.4 247.5 479.9 211.7C438.8 173.6 385.2 144 320 144zM127.4 176.6C174.5 132.8 239.2 96 320 96C400.8 96 465.5 132.8 512.6 176.6C559.4 220.1 590.7 272 605.6 307.7C608.9 315.6 608.9 324.4 605.6 332.3C590.7 368 559.4 420 512.6 463.4C465.5 507.1 400.8 544 320 544C239.2 544 174.5 507.2 127.4 463.4C80.6 419.9 49.3 368 34.4 332.3C31.1 324.4 31.1 315.6 34.4 307.7C49.3 272 80.6 220 127.4 176.6zM320 400C364.2 400 400 364.2 400 320C400 290.4 383.9 264.5 360 250.7C358.6 310.4 310.4 358.6 250.7 360C264.5 383.9 290.4 400 320 400zM240.4 311.6C242.9 311.9 245.4 312 248 312C283.3 312 312 283.3 312 248C312 245.4 311.8 242.9 311.6 240.4C274.2 244.3 244.4 274.1 240.5 311.5zM286 196.6C296.8 193.6 308.2 192.1 319.9 192.1C328.7 192.1 337.4 193 345.7 194.7C346 194.8 346.2 194.8 346.5 194.9C404.4 207.1 447.9 258.6 447.9 320.1C447.9 390.8 390.6 448.1 319.9 448.1C258.3 448.1 206.9 404.6 194.7 346.7C192.9 338.1 191.9 329.2 191.9 320.1C191.9 309.1 193.3 298.3 195.9 288.1C196.1 287.4 196.2 286.8 196.4 286.2C208.3 242.8 242.5 208.6 285.9 196.7z" />
                    </svg>
                  )}
                </button>
              </div>
              {showPwReminder ? (
                <div style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: '#fb7185', marginTop: 'clamp(0.25rem, 1vh, 0.5rem)' }}>At least 8 characters with an uppercase, number, and symbol.</div>
              ) : null}
            </label>

            <div className="flex items-center justify-end">
              <Link href="/forgot-password">
                <a style={{ fontSize: 'clamp(0.7rem, 2.5vw, 0.75rem)', color: '#a855f7', textDecoration: 'underline' }}>Forgot password?</a>
              </Link>
            </div>

            {/* Submit Button */}
            <button type="submit" className="w-full rounded-full bg-[#EEEDB9] text-black font-semibold flex items-center justify-center" style={{
              fontSize: 'clamp(0.875rem, 3vw, 1rem)',
              padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
            }}>
              <span>Sign in</span>
            </button>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full rounded-full bg-white text-black font-semibold inline-flex items-center justify-center"
              style={{
                fontSize: 'clamp(0.875rem, 3vw, 1rem)',
                padding: 'clamp(0.625rem, 2vh, 0.75rem) clamp(0.875rem, 3vw, 1rem)',
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 48 48" className="mr-2 flex-shrink-0"><path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.22l6.85-6.85C35.64 2.34 30.13 0 24 0 14.61 0 6.27 5.7 2.44 14.01l7.98 6.21C12.13 13.09 17.62 9.5 24 9.5z"/><path fill="#34A853" d="M46.1 24.59c0-1.54-.14-3.02-.39-4.45H24v8.44h12.44c-.54 2.9-2.18 5.36-4.64 7.02l7.19 5.59C43.73 37.13 46.1 31.36 46.1 24.59z"/><path fill="#FBBC05" d="M10.42 28.22c-1.13-3.36-1.13-6.97 0-10.33l-7.98-6.21C.64 16.61 0 20.21 0 24c0 3.79.64 7.39 2.44 10.32l7.98-6.1z"/><path fill="#EA4335" d="M24 48c6.13 0 11.64-2.02 15.84-5.5l-7.19-5.59c-2.01 1.35-4.59 2.15-8.65 2.15-6.38 0-11.87-3.59-14.58-8.72l-7.98 6.1C6.27 42.3 14.61 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
              <span>Sign in with Google</span>
            </button>

            <div className="text-center" style={{ fontSize: 'clamp(0.8rem, 2.75vw, 0.875rem)', marginTop: 'clamp(0.5rem, 1.5vh, 1rem)' }}>Don't have an account? <Link href="/signup"><a style={{ color: 'var(--app-white)' }}>Sign up</a></Link></div>
          </form>
        </div>
      </div>
      </div>
    </>
  )
}
