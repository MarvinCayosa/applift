import Head from 'next/head'
import { useRouter } from 'next/router'
import { useState, useRef, useEffect } from 'react'

export default function Splash() {
  const router = useRouter()
  const [currentSlide, setCurrentSlide] = useState(0)
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

    // Handle slide query parameter
    if (router.query.slide) {
      const slideNum = parseInt(router.query.slide, 10)
      if (!isNaN(slideNum) && slideNum >= 0 && slideNum < slides.length) {
        setCurrentSlide(slideNum)
      }
    }
  }, [router.query.slide, slides.length])

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    }
  }

  const handleSkip = () => {
    setCurrentSlide(slides.length - 1)
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

  const renderTextContent = () => (
    <div className="mb-6">
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
              className="text-4xl sm:text-5xl md:text-6xl"
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
                ? 'text-5xl sm:text-6xl md:text-7xl'
                : 'text-4xl sm:text-5xl md:text-6xl'}
            >
              {currentSlideData.title}
            </span>
            {currentSlideData.titleHighlight && (
              <>
                {currentSlideData.highlightOnNewLine && <br />}
                {!currentSlideData.highlightOnNewLine && ' '}
                <span 
                  className={currentSlideData.highlightBigger
                    ? 'text-6xl sm:text-7xl md:text-8xl'
                    : 'text-4xl sm:text-5xl md:text-6xl'}
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
          className="text-sm sm:text-base text-white/70 mb-5 leading-relaxed"
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
    // Hide indicators on the final slide
    if (currentSlideData.isFinal) return null

    return (
      <div className="flex items-center justify-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          {slides.map((_, index) => {
            const active = currentSlide === index
            return (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className="transition-all duration-300"
                style={{
                  width: active ? '12px' : '5px',
                  height: '5px',
                  borderRadius: '4px',
                  backgroundColor: active ? currentSlideData.highlightColor : 'rgba(255, 255, 255, 0.3)',
                }}
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
      className="min-h-screen h-screen fixed inset-0 bg-black text-white overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Head>
        <title>AppLift — Achieve strength with insights</title>
        <meta name="description" content="Elevate every rep - Powered by IoT Technology" />
      </Head>

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

      {/* Bottom gradient overlay */}
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

      {/* Content */}
      <div 
        className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-12 sm:px-8 sm:pb-16 md:pb-20"
        style={{
          paddingBottom: 'max(3rem, env(safe-area-inset-bottom, 3rem))'
        }}
      >
        <div className="w-full max-w-2xl mx-auto">
          {/* Large logo on final slide */}
          {currentSlideData.isFinal && !currentSlideData.hideLogo && (
            <div className="flex justify-center mb-16 sm:mb-20 md:mb-24">
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

          <div>{renderTextContent()}</div>
          <div>{renderIndicators()}</div>

          {/* Buttons - Only on final slide */}
          {currentSlideData.isFinal ? (
            <div className="space-y-4">
              <button
                onClick={() => router.push('/signup')}
                className="w-full px-8 py-4 rounded-full font-semibold shadow-lg transition-all duration-300 hover:scale-105 animated-purple-gradient text-white"
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
                }}
              >
                Create an Account
              </button>

              <button
                onClick={() => router.push('/login')}
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
            /* Swipe indicator for non-final slides */
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

      <style jsx>{`
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
        /* Logo zoom animation */
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
      `}</style>
    </div>
  )
}
