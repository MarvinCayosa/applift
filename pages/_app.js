// pages/_app.js
import '../styles/globals.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { UserProfileProvider } from '../utils/userProfileStore';
import { AuthProvider } from '../context/AuthContext';
import { isPWA, logPWAStatus } from '../utils/pwaDetection';
import { BluetoothProvider } from '../context/BluetoothProvider';
import { WorkoutLoggingProvider } from '../context/WorkoutLoggingContext';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    // Log PWA status for debugging
    logPWAStatus();
    
    // Hide install button if already running as PWA
    if (isPWA()) {
      setShowInstallButton(false);
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
      setDeferredPrompt(e);
      setShowInstallButton(true);
      console.log('beforeinstallprompt captured');
    }

    // Optional: hide install UI if app already installed
    function handleAppInstalled() {
      setDeferredPrompt(null);
      setShowInstallButton(false);
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
  }, []);

  // Simple back button handler - let router manage history
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Just ensure we can go back normally - don't trap the user
    // The app will handle back navigation via router
  }, []);

  // Trigger the browser install prompt (user gesture required)
  async function handleInstallClick() {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('User response to the install prompt:', outcome);
      setDeferredPrompt(null);
      setShowInstallButton(false);
    } catch (err) {
      console.error('Error during install prompt:', err);
    }
  }

  return (
    <AuthProvider>
      <BluetoothProvider>
        <WorkoutLoggingProvider>
          <UserProfileProvider>
            <Component {...pageProps} />
          </UserProfileProvider>
        </WorkoutLoggingProvider>
      </BluetoothProvider>
    </AuthProvider>
  );
}

export default MyApp;
