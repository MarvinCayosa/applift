import { useState, useEffect } from 'react'

let deferredPrompt = null

/**
 * Initialize PWA install prompt listener
 * Call this once when the app loads
 */
export const initializePWAInstallPrompt = () => {
  if (typeof window === 'undefined') return

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault()
    // Stash the event so it can be triggered later
    deferredPrompt = e
    console.log('PWA install prompt ready')
  })

  window.addEventListener('appinstalled', () => {
    console.log('PWA installed successfully')
    deferredPrompt = null
  })
}

/**
 * Detect platform - iOS, Android, or Desktop
 */
export const detectPlatform = () => {
  if (typeof window === 'undefined') return 'unknown'

  const userAgent = navigator.userAgent || navigator.vendor || window.opera

  // iOS detection
  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return 'ios'
  }

  // Android detection
  if (/android/i.test(userAgent)) {
    return 'android'
  }

  // Desktop/other
  return 'desktop'
}

/**
 * Check if running in standalone mode (installed PWA)
 */
export const isStandalone = () => {
  if (typeof window === 'undefined') return false

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  )
}

/**
 * Install PWA (Android/Desktop Chrome)
 */
export const installPWA = async () => {
  if (!deferredPrompt) {
    console.log('No install prompt available')
    return false
  }

  try {
    // Show the install prompt
    deferredPrompt.prompt()

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt')
      deferredPrompt = null
      return true
    } else {
      console.log('User dismissed the install prompt')
      return false
    }
  } catch (error) {
    console.error('Error installing PWA:', error)
    return false
  }
}

/**
 * Get iOS installation instructions
 */
export const getIOSInstructions = () => {
  const isInSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  
  return {
    isSupported: isInSafari,
    instructions: [
      'Tap the Share button',
      'Scroll down and tap "Add to Home Screen"',
      'Tap "Add" in the top right corner',
    ],
  }
}

/**
 * Custom hook for PWA installation
 */
export const usePWAInstall = () => {
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [platform, setPlatform] = useState('unknown')

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Detect platform
    const detectedPlatform = detectPlatform()
    setPlatform(detectedPlatform)

    // Check if already installed
    setIsInstalled(isStandalone())

    // Check if installable (for Android/Desktop)
    if (deferredPrompt) {
      setIsInstallable(true)
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = () => {
      setIsInstallable(true)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsInstallable(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const installApp = async () => {
    const platform = detectPlatform()

    if (platform === 'ios') {
      // iOS requires manual installation, return instructions
      return getIOSInstructions()
    } else if (platform === 'android' || platform === 'desktop') {
      // Android/Desktop can use the install prompt
      return await installPWA()
    }

    return false
  }

  return {
    isInstallable: isInstallable || platform === 'ios',
    isInstalled,
    platform,
    installApp,
    getIOSInstructions,
  }
}
