/**
 * PWA Installed Mode Detection and Behavior Module
 * 
 * This module handles all logic related to detecting when AppLift is running
 * as an installed PWA (standalone mode) and managing UI behavior specific to
 * the installed app experience.
 */

/**
 * Detects whether the app is running in installed PWA mode (standalone)
 * 
 * This function checks multiple indicators:
 * - CSS display-mode media queries (standalone, fullscreen)
 * - navigator.standalone (iOS Safari)
 * - window.matchMedia for display-mode
 * 
 * @returns {boolean} True if the app is running as an installed PWA
 */
export function isInstalledPWA() {
  if (typeof window === 'undefined') return false

  // Check display-mode: standalone via media query
  const mqStandalone = window.matchMedia('(display-mode: standalone)').matches
  
  // Check display-mode: fullscreen via media query
  const mqFullscreen = window.matchMedia('(display-mode: fullscreen)').matches
  
  // Check iOS Safari standalone mode
  const iosStandalone = 'standalone' in navigator && navigator.standalone === true
  
  return mqStandalone || mqFullscreen || iosStandalone
}

/**
 * Detects whether the app is running on a mobile or tablet device
 * 
 * @returns {boolean} True if the device is mobile or tablet
 */
export function isMobileOrTablet() {
  if (typeof window === 'undefined') return false
  
  const mobileUserAgent = /iPhone|iPad|iPod|Android|Tablet|Mobile|Windows Phone/i.test(
    navigator.userAgent
  )
  const touchDevice = navigator.maxTouchPoints > 1 && window.innerWidth <= 1024
  
  return mobileUserAgent || touchDevice
}

/**
 * Determines if the app should be in "App Mode"
 * App Mode is active when the app is both:
 * 1. Running as an installed PWA (standalone)
 * 2. On a mobile or tablet device
 * 
 * @returns {boolean} True if App Mode should be active
 */
export function shouldUseAppMode() {
  return isInstalledPWA() && isMobileOrTablet()
}

/**
 * Initializes event listeners for PWA display mode changes
 * 
 * This function sets up listeners to detect when the app transitions
 * between browser mode and installed PWA mode (e.g., when user adds
 * the app to home screen or opens it from there).
 * 
 * @param {Function} callback - Function to call when display mode changes
 * @returns {Function} Cleanup function to remove event listeners
 */
export function initializeDisplayModeListeners(callback) {
  if (typeof window === 'undefined') return () => {}

  const mqStandalone = window.matchMedia('(display-mode: standalone)')
  const mqFullscreen = window.matchMedia('(display-mode: fullscreen)')

  const handleModeChange = () => {
    const isAppMode = shouldUseAppMode()
    callback(isAppMode)
  }

  // Add event listeners with fallback for older browsers
  const addListener = (mq) => {
    if (mq.addEventListener) {
      mq.addEventListener('change', handleModeChange)
    } else if (mq.addListener) {
      // Fallback for older browsers
      mq.addListener(handleModeChange)
    }
  }

  const removeListener = (mq) => {
    if (mq.removeEventListener) {
      mq.removeEventListener('change', handleModeChange)
    } else if (mq.removeListener) {
      // Fallback for older browsers
      mq.removeListener(handleModeChange)
    }
  }

  // Set up listeners
  addListener(mqStandalone)
  addListener(mqFullscreen)

  // Return cleanup function
  return () => {
    removeListener(mqStandalone)
    removeListener(mqFullscreen)
  }
}

/**
 * Gets the current app mode status with device detection
 * 
 * This is a convenience function that returns an object with
 * detailed information about the current PWA state.
 * 
 * @returns {Object} Object containing:
 *   - isInstalled: boolean - Whether app is in standalone mode
 *   - isMobile: boolean - Whether device is mobile/tablet
 *   - isAppMode: boolean - Whether App Mode should be active
 */
export function getAppModeStatus() {
  return {
    isInstalled: isInstalledPWA(),
    isMobile: isMobileOrTablet(),
    isAppMode: shouldUseAppMode(),
  }
}
