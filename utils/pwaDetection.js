// utils/pwaDetection.js

/**
 * Detects if the app is running as an installed PWA
 * @returns {boolean} - true if running as standalone PWA
 */
export const isPWA = () => {
  if (typeof window === 'undefined') return false;
  
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true // iOS Safari specific
  );
};

/**
 * Detects if running on iOS device
 * @returns {boolean} - true if iOS device
 */
export const isIOS = () => {
  if (typeof window === 'undefined') return false;
  
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPad on iOS 13+
  );
};

/**
 * Detects if running as iOS PWA (standalone mode)
 * @returns {boolean} - true if iOS PWA
 */
export const isIOSPWA = () => {
  if (typeof window === 'undefined') return false;
  
  return isIOS() && window.navigator.standalone === true;
};

/**
 * Gets the current display mode
 * @returns {string} - 'fullscreen', 'standalone', 'minimal-ui', or 'browser'
 */
export const getDisplayMode = () => {
  if (typeof window === 'undefined') return 'browser';
  
  if (window.matchMedia('(display-mode: fullscreen)').matches) {
    return 'fullscreen';
  }
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return 'standalone';
  }
  if (window.matchMedia('(display-mode: minimal-ui)').matches) {
    return 'minimal-ui';
  }
  return 'browser';
};

/**
 * Hook to use PWA detection in React components
 * Usage: const isPWAMode = usePWADetection();
 */
export const usePWADetection = () => {
  if (typeof window === 'undefined') return false;
  
  const [pwaMode, setPWAMode] = React.useState(isPWA());
  
  React.useEffect(() => {
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    const fullscreenQuery = window.matchMedia('(display-mode: fullscreen)');
    
    const handleChange = () => {
      setPWAMode(isPWA());
    };
    
    displayModeQuery.addEventListener('change', handleChange);
    fullscreenQuery.addEventListener('change', handleChange);
    
    return () => {
      displayModeQuery.removeEventListener('change', handleChange);
      fullscreenQuery.removeEventListener('change', handleChange);
    };
  }, []);
  
  return pwaMode;
};

/**
 * Logs PWA status to console (useful for debugging)
 */
export const logPWAStatus = () => {
  if (typeof window === 'undefined') return;
  
  const status = {
    isPWA: isPWA(),
    isIOS: isIOS(),
    isIOSPWA: isIOSPWA(),
    displayMode: getDisplayMode(),
    isStandalone: window.matchMedia('(display-mode: standalone)').matches,
    isFullscreen: window.matchMedia('(display-mode: fullscreen)').matches,
    isIOSStandalone: window.navigator.standalone,
    safeAreaInsets: {
      top: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top'),
      bottom: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom'),
      left: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-left'),
      right: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-right')
    },
    userAgent: navigator.userAgent
  };
  
  console.log('🚀 PWA Status:', status);
  
  if (status.isIOSPWA) {
    console.log('✅ Running as iOS PWA in standalone mode');
  } else if (status.isIOS) {
    console.log('📱 iOS detected - Add to Home Screen for fullscreen');
  }
  
  return status;
};
