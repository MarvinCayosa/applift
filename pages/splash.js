import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useRef, useEffect } from 'react'
import { isPWA } from '../utils/pwaDetection'
import { usePWAInstall, initializePWAInstallPrompt } from '../utils/pwaInstall'
import { shouldUseAppMode, initializeDisplayModeListeners } from '../utils/pwaInstalled'

export default function Splash() {
  const router = useRouter()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [isAppMode, setIsAppMode] = useState(false)
  const [hideSplashForAppMode, setHideSplashForAppMode] = useState(false)
  const [showPlatformModal, setShowPlatformModal] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const [section2Visible, setSection2Visible] = useState(false)
  const [section3Visible, setSection3Visible] = useState(false)
  const section2Ref = useRef(null)
  const section3Ref = useRef(null)
  const { isInstallable, installApp, isInstalled, platform, getIOSInstructions } = usePWAInstall()
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  const slides = [
    {
      background: '/images/landing-page/introduction-pic.jpg',
      title: 'Welcome to',
      titleHighlight: 'AppLift!',
      highlightColor: '#8b5cf6',
      subtitle: 'Build better habits and make progressive improvements to turn every workout into measurable progress.',
      buttonText: 'Get Started',
      showSkip: true,
      highlightOnNewLine: true,
      titleSmaller: true,
      highlightBigger: true,
    },
    {
      background: '/images/landing-page/introduction-pic1.jpg',
      title: 'Track and learn',
      titleHighlight: 'your progress',
      highlightColor: '#10b981',
      subtitle: 'Monitor and understand your performance to see small efforts lead to big results over time.',
      buttonText: 'Continue',
      showSkip: true,
      highlightOnNewLine: true,
    },
    {
      background: '/images/landing-page/introduction-pic2.jpg',
      title: 'Train smarter,',
      titleHighlight: 'not just harder',
      highlightColor: '#f59e0b',
      subtitle: 'Get insights to help you improve your execution, strength and condition every session.',
      buttonText: 'Continue',
      showSkip: true,
      highlightOnNewLine: true,
    },
    {
      background: '/images/landing-page/introduction-pic3.jpg',
      title: 'Start achieving',
      titleParts: [
        { text: 'Start achieving ', color: 'white' },
        { text: 'strength', color: '#8b5cf6' },
        { text: ' with ', color: 'white' },
        { text: 'insights', color: '#8b5cf6' },
      ],
      titleHighlight: '',
      highlightColor: '#8b5cf6',
      subtitle: 'Powered by IoT Technology for elevating your lifts based on data.',
      buttonText: 'Create an Account',
      showSkip: false,
      isFinal: true,
      hideLogo: true,
      highlightOnNewLine: false,
    },
  ]

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Initialize PWA install prompt listener
    initializePWAInstallPrompt()

    // Initialize app mode using the pwaInstalled module
    setIsAppMode(shouldUseAppMode())

    // Set up display mode change listeners
    const cleanup = initializeDisplayModeListeners((isAppMode) => {
      setIsAppMode(isAppMode)
    })

    // Handle slide query parameter
    if (router.query.slide) {
      const slideNum = parseInt(router.query.slide, 10)
      if (!isNaN(slideNum) && slideNum >= 0 && slideNum < slides.length) {
        setCurrentSlide(slideNum)
      }
    }

    return cleanup
  }, [router.query.slide, slides.length])

  // In installed app mode, only show splash on first launch per session
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isAppMode) {
      setHideSplashForAppMode(false)
      return
    }

    const fromSignOut = router.query?.fromSignOut === '1'
    const slideParam = router.query?.slide

    // If coming from sign-out, always show splash and reset the flag
    if (fromSignOut) {
      sessionStorage.removeItem('applift-appmode-splash-seen')
      setHideSplashForAppMode(false)
      return
    }

    // If there's a slide param (e.g., from back button on login/signup), show splash
    if (slideParam) {
      setHideSplashForAppMode(false)
      return
    }

    const seen = sessionStorage.getItem('applift-appmode-splash-seen')
    if (seen) {
      setHideSplashForAppMode(true)
      router.replace('/dashboard')
      return
    }

    sessionStorage.setItem('applift-appmode-splash-seen', 'true')
    setHideSplashForAppMode(false)
  }, [isAppMode, router, router.query?.fromSignOut, router.query?.slide])

  // Handle back button - go to previous slide on splash page
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => {
      // On splash page, go to previous slide instead of exiting
      if (currentSlide > 0) {
        setCurrentSlide((prev) => prev - 1)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentSlide])

  // Auto-play carousel in web/not-installed mode
  useEffect(() => {
    if (isAppMode) return
    const interval = setInterval(() => {
      if (isPaused) return
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }, 5000)

    return () => clearInterval(interval)
  }, [isAppMode, isPaused, slides.length])

  // Reveal Section 2 and 3 on scroll
  useEffect(() => {
    if (typeof window === 'undefined') return

    const observerOptions = {
      root: null,
      threshold: 0.15,
      rootMargin: '0px 0px -10% 0px',
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        if (section2Ref.current && entry.target === section2Ref.current) {
          setSection2Visible(true)
          observer.unobserve(entry.target)
        }
        if (section3Ref.current && entry.target === section3Ref.current) {
          setSection3Visible(true)
          observer.unobserve(entry.target)
        }
      })
    }, observerOptions)

    if (section2Ref.current) observer.observe(section2Ref.current)
    if (section3Ref.current) observer.observe(section3Ref.current)

    return () => observer.disconnect()
  }, [])

  const handleNext = () => {
    // Only advance slides; navigation happens via explicit buttons on final slide
    if (isAppMode) {
      if (currentSlide < slides.length - 1) {
        setCurrentSlide(currentSlide + 1)
      }
    } else {
      setCurrentSlide((prev) => (prev + 1) % slides.length)
    }
  }

  const handleSkip = () => {
    setCurrentSlide(slides.length - 1)
  }

  const handleInstall = async () => {
    const installed = await installApp()
    if (installed) {
      console.log('PWA installed successfully')
    }
  }

  const handleInstallClick = () => {
    // Detect platform automatically
    const detectedPlatform = platform
    
    if (detectedPlatform === 'ios') {
      setShowIOSInstructions(true)
    } else if (detectedPlatform === 'android' || detectedPlatform === 'desktop') {
      // Show modal for manual selection or directly install
      setShowPlatformModal(true)
    } else {
      // Fallback - show modal
      setShowPlatformModal(true)
    }
  }

  const handlePlatformSelect = async (selectedPlatform) => {
    if (selectedPlatform === 'android') {
      const installed = await installApp()
      if (installed) {
        console.log('PWA installed successfully')
      }
      setShowPlatformModal(false)
    } else if (selectedPlatform === 'ios') {
      setShowPlatformModal(false)
      setShowIOSInstructions(true)
    }
  }

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    const swipeDistance = touchStartX.current - touchEndX.current
    
    if (swipeDistance > 50) {
      // Swipe left - next slide
      handleNext()
    } else if (swipeDistance < -50) {
      // Swipe right - previous slide
      if (currentSlide > 0) {
        setCurrentSlide(currentSlide - 1)
      }
    }
    
    touchStartX.current = 0
    touchEndX.current = 0
  }

  const currentSlideData = slides[currentSlide]

  // If app-mode splash is suppressed, render nothing to avoid flicker during redirect
  if (hideSplashForAppMode) return null

  const renderTextContent = (isCompact = false) => (
    <div 
      key={`slide-${currentSlide}`}
      className="mb-6"
    >
      <h1 
        className="leading-tight mb-3 font-bold"
        style={{ 
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
        }}
      >
        {currentSlideData.titleParts ? (
          // 4th slide with colored parts
          currentSlideData.titleParts.map((part, idx) => (
            <span 
              key={idx}
              className={isCompact ? 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl' : 'text-5xl sm:text-6xl md:text-7xl lg:text-8xl'}
              style={{ color: part.color }}
            >
              {part.text}
            </span>
          ))
        ) : (
          // Other slides
          <>
            <span 
              className={currentSlideData.titleSmaller
                ? (isCompact ? 'text-4xl sm:text-5xl md:text-6xl lg:text-6xl' : 'text-6xl sm:text-7xl md:text-8xl lg:text-9xl')
                : (isCompact ? 'text-4xl sm:text-5xl md:text-6xl lg:text-6xl' : 'text-5xl sm:text-6xl md:text-7xl lg:text-8xl')}
            >
              {currentSlideData.title}
            </span>
            {currentSlideData.titleHighlight && (
              <>
                {currentSlideData.highlightOnNewLine && <br />}
                {!currentSlideData.highlightOnNewLine && ' '}
                <span 
                  className={currentSlideData.highlightBigger
                    ? (isCompact ? 'text-5xl sm:text-6xl md:text-6xl lg:text-7xl' : 'text-6xl sm:text-7xl md:text-8xl lg:text-9xl')
                    : (isCompact ? 'text-4xl sm:text-5xl md:text-6xl lg:text-6xl' : 'text-5xl sm:text-6xl md:text-7xl lg:text-8xl')}
                  style={{ color: currentSlideData.highlightColor }}
                >
                  {currentSlideData.titleHighlight}
                </span>
              </>
            )}
          </>
        )}
      </h1>

      {currentSlideData.subtitle && (
        <p 
          className={isCompact ? 'text-sm sm:text-base text-white/70 mb-5 leading-relaxed' : 'text-sm sm:text-base md:text-lg text-white/70 mb-6 leading-relaxed'}
          style={{ 
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
            color: '#eee',
          }}
        >
          {currentSlideData.subtitle}
        </p>
      )}
    </div>
  )

  const renderIndicators = () => {
    // Hide indicators on the final slide across all modes
    if (currentSlideData.isFinal) return null

    return (
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          {slides.map((_, index) => {
            const active = currentSlide === index
            const base = {
              width: active ? '12px' : '5px',
              height: '5px',
              borderRadius: '4px',
              backgroundColor: active ? currentSlideData.highlightColor : 'rgba(255, 255, 255, 0.3)',
            }

            if (isAppMode) {
              return (
                <div
                  key={index}
                  className="transition-all duration-300"
                  style={base}
                />
              )
            }

            return (
              <button
                key={index}
                onClick={() => {
                  setCurrentSlide(index)
                }}
                className="transition-all duration-300"
                style={base}
                aria-label={`Go to slide ${index + 1}`}
              />
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen relative bg-black text-white overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Head>
        <title>AppLift — Achieve strength with insights</title>
        <meta name="description" content="Elevate every rep - Powered by IoT Technology" />
      </Head>

      {/* Header removed on slides 1 to 3 as requested */}

      {/* Background carousel - crossfade transition */}
      <div className="absolute inset-0">
        {slides.map((slide, index) => (
          <div
            key={index}
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{
              opacity: currentSlide === index ? 1 : 0,
              zIndex: currentSlide === index ? 1 : 0,
            }}
          >
            <img 
              src={slide.background} 
              alt="" 
              className="w-full h-full object-cover" 
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
            <div className="absolute inset-0 bg-black/50" />
            {/* Per-slide gradient with button color aura */}
            <div 
              className="absolute bottom-0 left-0 right-0"
              style={{
                height: '60%',
                background: `linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.7) 30%, ${slide.highlightColor}20 50%, transparent 100%)`,
                filter: 'blur(2px)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Bottom gradient overlay with blurred color aura */}
      <div 
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-5"
        style={{
          height: '70%',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.98) 0%, rgba(0, 0, 0, 0.85) 20%, rgba(139, 92, 246, 0.2) 35%, rgba(16, 185, 129, 0.15) 50%, transparent 100%)',
          filter: 'blur(1px)',
        }}
      />
      <div 
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-6"
        style={{
          height: '50%',
          background: 'linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.7) 30%, transparent 100%)',
        }}
      />

      {isAppMode ? (
        <div 
          key={`slide-content-${currentSlide}`}
          className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-12 sm:px-8 sm:pb-16 md:pb-20"
        >
          <div className="w-full max-w-2xl mx-auto">
            {/* Large logo on final slide - above text with equal spacing */}
            {currentSlideData.isFinal && !currentSlideData.hideLogo && (
              <div className="flex justify-center mb-16 sm:mb-20 md:mb-24 logo-zoom">
                <img
                  src="/images/applift-logo/AppLift_Logo_White.png"
                  alt="AppLift"
                  className="object-contain"
                  style={{
                    width: 'clamp(6rem, 20vw, 10rem)',
                    height: 'clamp(6rem, 20vw, 10rem)',
                  }}
                />
              </div>
            )}

              <div className="content-fade-up-1">{renderTextContent()}</div>
            <div className="content-fade-up-2">{renderIndicators()}</div>

            {/* Context-aware action button (Install/Open App) */}
            {isInstallable && !isAppMode && (
              <div className="mb-4 content-fade-up-3">
                <button
                  onClick={handleInstall}
                  className="w-full px-8 py-4 rounded-full font-semibold shadow-lg transition-all duration-300 hover:scale-105"
                  style={{
                    backgroundColor: currentSlideData.highlightColor,
                    color: '#000',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                  }}
                >
                  Install App
                </button>
              </div>
            )}

            {/* Buttons (App / installed mode) - Only on final slide */}
            {currentSlideData.isFinal ? (
              <div className="space-y-4 content-fade-up-3">
                <button
                  onClick={() => router.replace('/signup')}
                  className="w-full px-8 py-4 rounded-full font-semibold shadow-lg transition-all duration-300 hover:scale-105 animated-purple-gradient text-white"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                  }}
                >
                  Create an Account
                </button>

                <button
                  onClick={() => router.replace('/login')}
                  className="w-full px-8 py-4 rounded-full font-medium transition-all duration-300 hover:scale-105"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.2)',
                  }}
                >
                  Have an account?{' '}
                  <span style={{ color: '#c4b5fd' }}>Sign In</span>
                </button>
              </div>
            ) : (
              /* Subtle tap indicator for swiping to next slide */
              <div className="flex flex-col items-center pb-4">
                <div 
                  className="text-white/60 text-xs font-medium"
                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif' }}
                >
                  Swipe to continue
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 overflow-y-auto" style={{ height: '100vh' }}>
          {/* Section 1 - Hero */}
          <section className="relative min-h-screen flex items-center justify-center">
            {/* Hero Background Image */}
            <div className="absolute inset-0">
              <img 
                src="/images/landing-page/introduction-pic3.jpg" 
                alt="" 
                className="w-full h-full object-cover" 
              />
              <div className="absolute inset-0 bg-black/40" />
              {/* Bottom gradient fade */}
              <div 
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: '40%',
                  background: 'linear-gradient(to top, rgba(0, 0, 0, 1) 0%, transparent 100%)',
                }}
              />
            </div>

            {/* Hero Content */}
            <div className="relative z-10 text-center px-6 max-w-4xl mx-auto flex flex-col items-center justify-center">
              <h1 
                className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-3 leading-tight content-fade-up-1"
                style={{ 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
                }}
              >
                Achieve <span style={{ color: '#8b5cf6' }}>strength</span><br />with <span style={{ color: '#8b5cf6' }}>insights</span>
              </h1>
              
              <p 
                className="text-sm sm:text-base md:text-lg lg:text-xl text-white/50 max-w-2xl mx-auto mb-5 sm:mb-6 font-light leading-relaxed content-fade-up-2"
                style={{ 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                  color: '#eee',
                }}
              >
                Powered by IoT technology to elevate your lifts through data.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-row flex-nowrap gap-2 items-center justify-center mb-4 content-fade-up-3">
                {/* Install Now Button - Primary */}
                <button
                  onClick={handleInstallClick}
                  className="px-4 py-2 sm:px-5 sm:py-2 md:px-6 md:py-3 rounded-full text-xs sm:text-sm md:text-sm font-semibold shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2 justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    color: '#fff',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.4)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Install Now
                </button>

                {/* Visit Site Button - Secondary */}
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-4 py-2 sm:px-5 sm:py-2 md:px-6 md:py-3 rounded-full text-xs sm:text-sm md:text-sm font-semibold transition-all duration-300 hover:scale-105 active:scale-95 flex items-center gap-2 justify-center"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    boxShadow: '0 8px 16px 0 rgba(0, 0, 0, 0.2)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                    <polyline points="14 4 20 4 20 10" />
                    <line x1="10" y1="14" x2="20" y2="4" />
                  </svg>
                  Visit Site
                </button>
              </div>
            </div>

            {/* Bouncing Down Chevron */}
            <div
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce-slow cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label="Scroll to next section"
              onClick={() => section2Ref.current?.scrollIntoView({ behavior: 'smooth' })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  section2Ref.current?.scrollIntoView({ behavior: 'smooth' })
                }
              }}
            >
              <svg 
                width="32" 
                height="32" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="white" 
                strokeWidth="3" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="opacity-70"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </section>

          {/* Section 2 - Core Value Proposition */}
          <section 
            ref={section2Ref}
            className={`relative min-h-screen flex flex-col items-center justify-center py-16 sm:py-20 px-6 ${section2Visible ? 'section-visible' : ''}`} 
            style={{ background: '#000' }}>

            {/* Background Aura */}
            <div className="absolute inset-0 overflow-hidden">
              <div 
                className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
                style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
              />
              <div 
                className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
                style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }}
              />
            </div>

            {/* Section Content */}
            <div className="relative z-10 w-full max-w-7xl mx-auto">
              {/* Section Heading */}
              <div className="text-center mb-12 sm:mb-16 lg:mb-20">
                <h2 
                  className="text-3xl sm:text-4xl md:text-5xl font-bold text-white section-fade-up"
                  style={{ 
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
                  }}
                >
                  See how <span style={{ textShadow: '0 0 20px rgba(139, 92, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.2)' }}>AppLift</span><br />elevates your training
                </h2>
              </div>

              {/* Cards Container */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-end">
                {/* Card 1 - Left */}
                <div 
                  className="group rounded-3xl overflow-hidden transition-all duration-500 section-card-fade relative h-80 sm:h-[400px] hover-float">
                  {/* Full Background Image */}
                  <img 
                    src="/images/landing-page/introduction-pic1.jpg" 
                    alt="Track progress" 
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Overlay Border & Shadow (glass effect) */}
                  <div 
                    className="absolute inset-0 rounded-3xl"
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
                      pointerEvents: 'none',
                    }}
                  />
                  
                  {/* Bottom Gradient Overlay - Gradient Blur (only bottom) */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-2/3 rounded-b-3xl"
                    style={{
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.3) 70%, rgba(0, 0, 0, 0.6) 100%)',
                      maskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)',
                      backdropFilter: 'blur(0px) blur(8px)',
                      WebkitBackdropFilter: 'blur(0px) blur(8px)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Text Content - Overlaid at Bottom */}
                  <div className="absolute inset-0 rounded-3xl flex flex-col justify-end p-4 sm:p-6 lg:p-8 pointer-events-none">
                    <h3 
                      className="text-lg sm:text-xl lg:text-2xl font-bold mb-2 text-white"
                      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}
                    >
                      Track and learn your <span style={{ color: '#10b981' }}>progress</span>
                    </h3>
                    <p 
                      className="text-xs sm:text-sm text-white/80 leading-relaxed"
                      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif', color: '#eee' }}
                    >
                      Monitor and understand your performance to see how small efforts lead to big results over time.
                    </p>
                  </div>
                </div>

                {/* Card 2 - Center (Elevated) */}
                <div 
                  className="group rounded-3xl overflow-hidden transition-all duration-500 section-card-fade card-elevated md:scale-105 relative h-80 sm:h-[400px] hover-float"
                  style={{
                    transform: 'translateY(-20px)',
                  }}
                >
                  {/* Full Background Image */}
                  <img 
                    src="/images/landing-page/introduction-pic.jpg" 
                    alt="Train smarter" 
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Overlay Border & Shadow (enhanced for center card) */}
                  <div 
                    className="absolute inset-0 rounded-3xl"
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
                      pointerEvents: 'none',
                    }}
                  />
                  
                  {/* Bottom Gradient Overlay - Gradient Blur (only bottom) */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-2/3 rounded-b-3xl"
                    style={{
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.35) 70%, rgba(0, 0, 0, 0.65) 100%)',
                      maskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)',
                      backdropFilter: 'blur(0px) blur(10px)',
                      WebkitBackdropFilter: 'blur(0px) blur(10px)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Text Content - Overlaid at Bottom */}
                  <div className="absolute inset-0 rounded-3xl flex flex-col justify-end p-4 sm:p-6 lg:p-8 pointer-events-none">
                    <h3 
                      className="text-lg sm:text-xl lg:text-2xl font-bold mb-2 text-white"
                      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}
                    >
                      Train <span style={{ color: '#f59e0b' }}>smarter</span>, not just harder
                    </h3>
                    <p 
                      className="text-xs sm:text-sm text-white/80 leading-relaxed"
                      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif', color: '#eee' }}
                    >
                      Get insights that help improve your execution, strength, and conditioning every session.
                    </p>
                  </div>
                </div>

                {/* Card 3 - Right */}
                <div 
                  className="group rounded-3xl overflow-hidden transition-all duration-500 section-card-fade relative h-80 sm:h-[400px] hover-float">
                  {/* Full Background Image */}
                  <img 
                    src="/images/landing-page/introduction-pic2.jpg" 
                    alt="Lift safely" 
                    className="w-full h-full object-cover"
                  />
                  
                  {/* Overlay Border & Shadow (glass effect) */}
                  <div 
                    className="absolute inset-0 rounded-3xl"
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.05)',
                      pointerEvents: 'none',
                    }}
                  />
                  
                  {/* Bottom Gradient Overlay - Gradient Blur (only bottom) */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 h-2/3 rounded-b-3xl"
                    style={{
                      background: 'linear-gradient(to bottom, transparent 0%, rgba(0, 0, 0, 0.3) 70%, rgba(0, 0, 0, 0.6) 100%)',
                      maskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 40%, black 100%)',
                      backdropFilter: 'blur(0px) blur(8px)',
                      WebkitBackdropFilter: 'blur(0px) blur(8px)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Text Content - Overlaid at Bottom */}
                  <div className="absolute inset-0 rounded-3xl flex flex-col justify-end p-4 sm:p-6 lg:p-8 pointer-events-none">
                    <h3 
                      className="text-lg sm:text-xl lg:text-2xl font-bold mb-2 text-white"
                      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}
                    >
                      Lift with <span style={{ color: '#8b5cf6' }}>confidence</span> and <span style={{ color: '#8b5cf6' }}>safety</span>
                    </h3>
                    <p 
                      className="text-xs sm:text-sm text-white/80 leading-relaxed"
                      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif', color: '#eee' }}
                    >
                      Data-driven feedback helps you maintain proper form, reduce injury risk, and progress at the right pace.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3 - Call to Action */}
          <section 
            ref={section3Ref}
            className={`relative min-h-screen flex items-center justify-center py-20 px-6 ${section3Visible ? 'section-visible' : ''}`}>
            {/* CTA Background Image */}
            <div className="absolute inset-0">
              <img 
                src="/images/landing-page/introduction-pic2.jpg" 
                alt="" 
                className="w-full h-full object-cover" 
              />
              <div className="absolute inset-0 bg-black/60" />
              {/* Top black gradient */}
              <div 
                className="absolute top-0 left-0 right-0"
                style={{
                  height: '40%',
                  background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%)',
                }}
              />
              {/* Bottom black gradient */}
              <div 
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: '50%',
                  background: 'linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%)',
                }}
              />
            </div>

            {/* CTA Content */}
            <div className="relative z-10 text-center max-w-3xl mx-auto">
              <h2 
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-8 section-fade-up"
                style={{ 
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
                  color: 'white',
                }}
              >
                Join AppLift now
              </h2>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center section-fade-up" style={{ animationDelay: '0.2s' }}>
                <button
                  onClick={handleInstallClick}
                  className="px-8 py-4 rounded-full font-semibold shadow-lg transition-all duration-300 hover:scale-105 w-full sm:w-auto"
                  style={{
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    color: '#fff',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    minWidth: '12rem',
                    boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.4)',
                  }}
                >
                  How to install
                </button>
                <button
                  onClick={() => router.replace('/signup')}
                  className="px-8 py-4 rounded-full font-semibold shadow-lg transition-all duration-300 hover:scale-105 w-full sm:w-auto"
                  style={{
                    backgroundColor: '#fff',
                    color: '#000',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    minWidth: '12rem',
                  }}
                >
                  Create an account
                </button>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => router.replace('/login')}
                  className="text-white/80 hover:text-white transition-colors duration-200 font-medium"
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                    color: '#eee',
                  }}
                >
                  Already a member? <span className="underline">Sign in</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Platform Selection Modal */}
      {showPlatformModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onClick={() => setShowPlatformModal(false)}
        >
          <div 
            className="relative max-w-md w-full p-8 rounded-3xl"
            style={{
              background: 'linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 30, 0.98))',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPlatformModal(false)}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-2xl font-bold text-white mb-2">Select Your Device</h2>
            <p className="text-white/70 mb-6 text-sm" style={{ color: '#eee' }}>Choose your platform to install AppLift</p>
            
            

            <div className="space-y-3">
              <button
                onClick={() => handlePlatformSelect('android')}
                className="w-full p-4 rounded-xl text-left transition-all duration-300 hover:scale-102 flex items-center gap-4"
                style={{
                  background: 'linear-gradient(135deg, #34A853 0%, #2D8E47 100%)',
                  boxShadow: '0 4px 12px rgba(52, 168, 83, 0.3)',
                }}
              >
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="#34A853">
                    <path d="M17.523 15.341l-.835-1.446a.966.966 0 0 0-.354-.354.966.966 0 0 0-.476-.127H8.142a.966.966 0 0 0-.476.127.966.966 0 0 0-.354.354l-.835 1.446a.97.97 0 0 0 0 .954c.094.166.222.306.375.411.154.105.329.176.514.208v2.965c0 .199.079.39.22.531.14.14.331.22.53.22h.862c.199 0 .39-.08.531-.22.14-.141.219-.332.219-.531v-2.848h3.544v2.848c0 .199.079.39.22.531.14.14.331.22.53.22h.862c.199 0 .39-.08.531-.22.14-.141.219-.332.219-.531v-2.965c.185-.032.36-.103.514-.208.153-.105.281-.245.375-.411a.97.97 0 0 0 0-.954zM9.5 11.414a.966.966 0 0 1-.476-.127.966.966 0 0 1-.354-.354L7.835 9.487a.97.97 0 0 1 0-.954.966.966 0 0 1 .354-.354.966.966 0 0 1 .476-.127h5.67c.17 0 .335.044.476.127.142.083.261.203.354.354l.835 1.446a.97.97 0 0 1 0 .954.966.966 0 0 1-.354.354.966.966 0 0 1-.476.127H9.5zm-2-5.828C7.5 4.253 8.753 3 10.25 3h3.5c1.497 0 2.75 1.253 2.75 2.75v.836H7.5v-.836zm9 0v.836h1.25c.414 0 .75.336.75.75v7.5c0 .414-.336.75-.75.75H5.25c-.414 0-.75-.336-.75-.75v-7.5c0-.414.336-.75.75-.75H6.5v-.836C6.5 3.701 8.201 2 10.25 2h3.5c2.049 0 3.75 1.701 3.75 3.75z" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold text-lg">Android</div>
                  <div className="text-white/80 text-sm">Install on Android device</div>
                </div>
              </button>

              <button
                onClick={() => handlePlatformSelect('ios')}
                className="w-full p-4 rounded-xl text-left transition-all duration-300 hover:scale-102 flex items-center gap-4"
                style={{
                  background: 'linear-gradient(135deg, #007AFF 0%, #0056B3 100%)',
                  boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                }}
              >
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="#007AFF">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                  </svg>
                </div>
                <div>
                  <div className="text-white font-semibold text-lg">iOS</div>
                  <div className="text-white/80 text-sm">Install on iPhone/iPad</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS Installation Instructions Modal */}
      {showIOSInstructions && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
          onClick={() => setShowIOSInstructions(false)}
        >
          <div 
            className="relative max-w-md w-full p-8 rounded-3xl"
            style={{
              background: 'linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 30, 0.98))',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIOSInstructions(false)}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Install on iOS</h2>
                <p className="text-white/70 text-sm" style={{ color: '#eee' }}>Safari browser required</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 font-semibold">1</div>
                <div>
                  <p className="text-white font-medium" style={{ color: '#eee' }}>Tap the Share button</p>
                  <p className="text-white/60 text-sm" style={{ color: '#eee' }}>Located at the bottom of Safari</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 font-semibold">2</div>
                <div>
                  <p className="text-white font-medium" style={{ color: '#eee' }}>Scroll and tap "Add to Home Screen"</p>
                  <p className="text-white/60 text-sm" style={{ color: '#eee' }}>You may need to scroll down in the menu</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 font-semibold">3</div>
                <div>
                  <p className="text-white font-medium" style={{ color: '#eee' }}>Tap "Add" in the top right</p>
                  <p className="text-white/60 text-sm" style={{ color: '#eee' }}>AppLift will be added to your home screen</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSInstructions(false)}
              className="w-full px-6 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #007AFF 0%, #0056B3 100%)',
                color: 'white',
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-up {
          animation: fadeUp 0.6s ease-out forwards;
        }
        /* Animated subtle 3-purple gradient for final CTA */
        @keyframes purpleGradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animated-purple-gradient {
          background: linear-gradient(135deg, #a78bfa, #8b5cf6, #7c3aed, #6d28d9);
          background-size: 400% 400%;
          animation: purpleGradientShift 4s ease infinite;
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.35);
        }
        /* Logo zoom animation - bigger enlargement */
        @keyframes logoZoom {
          0% {
            opacity: 0;
            transform: scale(0.5);
          }
          60% {
            opacity: 1;
            transform: scale(1.1);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .logo-zoom {
          animation: logoZoom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        /* Black fade starts earlier - begins at 0.3s while logo is still animating */
        @keyframes blackFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .black-fade-early {
          animation: blackFadeIn 0.5s ease-out 0.3s forwards;
        }
        @keyframes bounceSlow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-bounce-slow {
          animation: bounceSlow 2s ease-in-out infinite;
        }
        .glass-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .glass-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 48px 0 rgba(139, 92, 246, 0.2);
        }
        .card-item {
          animation: fadeUp 0.8s ease-out forwards;
          opacity: 0;
        }
        .card-item:nth-child(1) {
          animation-delay: 0.1s;
        }
        .card-item:nth-child(2) {
          animation-delay: 0.2s;
        }
        .card-item:nth-child(3) {
          animation-delay: 0.3s;
        }
        .card-elevated {
          position: relative;
        }
        /* Scroll-triggered animations for sections 2 and 3 */
        .section-fade-up {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s ease-out, transform 0.8s ease-out;
        }
        .section-visible .section-fade-up {
          opacity: 1;
          transform: translateY(0);
        }
        .section-card-fade {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.8s ease-out, transform 0.8s ease-out;
        }
        .section-visible .section-card-fade:nth-child(1) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.1s;
        }
        .section-visible .section-card-fade:nth-child(2) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.2s;
        }
        .section-visible .section-card-fade:nth-child(3) {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 0.3s;
        }
        /* Floating hover effect - just float, no glow */
        .hover-float {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .hover-float:hover {
          transform: translateY(-12px);
        }
        @media (max-width: 767px) {
          .card-elevated {
            transform: scale(1) !important;
            transform: translateY(0) !important;
          }
          .card-elevated:first-of-type {
            order: -1;
          }
        }
        /* Smooth scroll behavior */
        html {
          scroll-behavior: smooth;
        }
      `}</style>
    </div>
  )
}
