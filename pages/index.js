import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const [stage, setStage] = useState('initial');
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  
  // Timing constants
  const initialHold = 1000;
  const revealDuration = 450;
  const finalHold = 600; // Reduced for faster sequence
  const reverseDuration = 350; // Reduced for faster sequence
  const zoomDuration = 800; // Faster zoom for quicker black transition
  const fadeStartOffset = 0; // Fade begins immediately with zoom for seamless transition
  const fadeDuration = 800; // Synchronized with zoom duration
  const blackHold = 150; // Brief hold on full black before navigation

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('SW registered:', reg))
        .catch((err) => console.log('SW registration failed:', err));
    }
  }, []);

  const router = useRouter();

  useEffect(() => {
    if (isAnimationComplete) {
      return; // Skip if animation has already run
    }

    const timers = [];
    const totalAnimationTime = initialHold + revealDuration + finalHold + reverseDuration + zoomDuration + blackHold;

    timers.push(
      setTimeout(() => setStage('revealing'), initialHold),
      setTimeout(() => setStage('finalHold'), initialHold + revealDuration),
      setTimeout(() => setStage('reversing'), initialHold + revealDuration + finalHold),
      setTimeout(() => setStage('zooming'), initialHold + revealDuration + finalHold + reverseDuration),
      setTimeout(() => setStage('fullBlack'), initialHold + revealDuration + finalHold + reverseDuration + zoomDuration),
      setTimeout(
        () => {
          setIsAnimationComplete(true);
          // Always go to splash - let users choose to sign in from there
          router.replace('/splash');
        },
        totalAnimationTime
      )
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [isAnimationComplete, initialHold, revealDuration, finalHold, reverseDuration, zoomDuration, blackHold, router]);

  // Calculate responsive logo size (scales with viewport)
  const getResponsiveLogoSize = () => {
    // Logo size driven by CSS variable --logo-size
    return {
      width: 'var(--logo-size)',
      height: 'var(--logo-size)',
    };
  };

  const logoTransform = () => {
    if (stage === 'revealing' || stage === 'finalHold') return 'translateX(-12px)';
    return 'translateX(0)';
  };

  const textStyle = {
    color: '#FFFFFF',
    opacity: stage === 'revealing' || stage === 'finalHold' ? 1 : 0,
    transform: stage === 'revealing' || stage === 'finalHold' ? 'translateX(0)' : 'translateX(16px)',
    marginLeft: stage === 'revealing' || stage === 'finalHold' ? '8px' : '0px',
    maxWidth: stage === 'revealing' || stage === 'finalHold' ? 'clamp(220px, 60vw, 700px)' : '0px',
    overflow: 'hidden',
    maxHeight: 'var(--logo-size)',
    gap: 'calc(var(--logo-size) * 0.13)',
    transition: `opacity ${revealDuration}ms ease-in-out, transform ${revealDuration}ms ease-in-out, margin-left ${revealDuration}ms ease-in-out, max-width ${revealDuration}ms ease-in-out`,
    fontFamily: '"Akira Expanded", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
  };

  const wrapperStyle = {
    transition: stage === 'zooming' || stage === 'fullBlack'
      ? `transform ${zoomDuration}ms cubic-bezier(0.4, 0.0, 0.6, 1), opacity ${fadeDuration}ms ease-out` 
      : 'none',
    transform: stage === 'zooming' || stage === 'fullBlack' ? 'scale(0.3)' : 'scale(1)', // Zoom out instead of zoom in
    opacity: stage === 'zooming' || stage === 'fullBlack' ? 0 : 1, // Fade out
    position: 'relative',
    zIndex: stage === 'zooming' || stage === 'fullBlack' ? 10000 : 10,
  };

  return (
    <>
      {/* Black zoom transition overlay for illusion effect - positioned at document root */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'black',
          opacity: stage === 'zooming' ? 1 : stage === 'fullBlack' ? 1 : 0,
          transition: stage === 'zooming'
            ? `opacity ${zoomDuration * 0.7}ms cubic-bezier(0.4, 0.0, 0.6, 1)` // Faster black fade
            : stage === 'fullBlack'
            ? 'none'
            : `opacity ${fadeDuration}ms ease-in-out`,
          zIndex: 9999,
          pointerEvents: 'none',
          willChange: 'opacity',
        }}
      />

      <div className="relative min-h-screen flex items-center justify-center bg-black overflow-hidden" style={{ zIndex: 1 }}>
        <Head>
          <title>AppLift Test - Landing</title>
          <meta name="description" content="AppLift Strength & Conditioning Assistant" />
        </Head>

        <div className="relative z-10 flex items-center justify-center px-4">
          <div className="flex items-center" style={{
            ...wrapperStyle,
            ['--logo-size']: 'clamp(2.5rem, 8vw, 5rem)',
          }}>
            <img
              src="/images/applift-logo/AppLift_Logo_White.png"
              alt="AppLift logo"
              style={{
                ...getResponsiveLogoSize(),
                objectFit: 'contain',
                transform: logoTransform(),
                transition: `transform ${stage === 'zooming' ? zoomDuration : revealDuration}ms ease-in-out`,
                willChange: 'transform, scale',
              }}
            />
            <div className="flex flex-col items-start" style={textStyle}>
              <span 
                className="font-extrabold tracking-tight whitespace-nowrap"
                style={{
                  fontSize: 'calc(var(--logo-size) * 0.58)',
                  lineHeight: 1,
                  fontFamily: '"Akira Expanded SuperBold", "Akira Expanded", sans-serif',
                }}
              >
                AppLift
              </span>
              <span
                className="font-normal tracking-normal whitespace-nowrap"
                style={{
                  fontSize: 'calc(var(--logo-size) * 0.28)',
                  lineHeight: 1,
                  display: 'inline-block',
                  color: '#cccccc',
                }}
              >
                Your S&C buddy
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
