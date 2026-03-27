// pages/_app.js
import '../styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { UserProfileProvider } from '../utils/userProfileStore';
import { isPWA, logPWAStatus } from '../utils/pwaDetection';
import PWAInstallPrompt from '../components/PWAInstallPrompt';

const AppProviders = dynamic(() => import('../components/AppProviders'));

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const isSplashRoute = router.pathname === '/splash';

  useEffect(() => {
    if (isSplashRoute) return;

    // Log PWA status for debugging
    logPWAStatus();
    
    // Hide install button if already running as PWA
    if (isPWA()) {
      console.log('✅ Running as installed PWA - install button hidden');
    }
    
    // Detect fullscreen/standalone mode and add class to html for CSS targeting
    const detectFullscreen = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
      const iosStandalone = 'standalone' in navigator && navigator.standalone === true;
      
      if (isStandalone || isFullscreen || iosStandalone) {
        document.documentElement.classList.add('pwa-standalone');
      } else {
        document.documentElement.classList.remove('pwa-standalone');
      }
    };
    detectFullscreen();
    
    // Listen for display mode changes
    const mqStandalone = window.matchMedia('(display-mode: standalone)');
    const mqFullscreen = window.matchMedia('(display-mode: fullscreen)');
    mqStandalone.addEventListener?.('change', detectFullscreen);
    mqFullscreen.addEventListener?.('change', detectFullscreen);
    
    // Register service worker (ensure /public/sw.js exists)
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => console.log('SW registered with scope:', reg.scope))
        .catch((err) => console.error('SW registration failed:', err));
    }

    // Capture beforeinstallprompt to show a custom install UI
    function handleBeforeInstallPrompt(e) {
      e.preventDefault();
      console.log('beforeinstallprompt captured');
    }

    // Optional: hide install UI if app already installed
    function handleAppInstalled() {
      console.log('PWA installed');
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mqStandalone.removeEventListener?.('change', detectFullscreen);
      mqFullscreen.removeEventListener?.('change', detectFullscreen);
    };
  }, [isSplashRoute]);

  // Simple back button handler - let router manage history
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Just ensure we can go back normally - don't trap the user
    // The app will handle back navigation via router
  }, []);

  const splashTree = (
    <UserProfileProvider>
      <Component {...pageProps} />
    </UserProfileProvider>
  );

  // Avoid initializing Firebase Auth on the splash route to keep LCP-critical
  // network chains short. Auth initializes once user continues to app flows.
  if (isSplashRoute) {
    return splashTree;
  }

  return (
    <AppProviders>
      <Component {...pageProps} />
      <PWAInstallPrompt />
    </AppProviders>
  );
}

export default MyApp;
