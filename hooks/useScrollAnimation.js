import { useEffect, useRef, useState, useLayoutEffect } from 'react';

// Use useLayoutEffect on client, useEffect on server (SSR safety)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Custom hook for scroll animations using Intersection Observer
 * 
 * IMPORTANT: This hook starts with isVisible=false to allow animation.
 * The CSS must use progressive enhancement - elements visible by default,
 * hidden class only applied when JS adds it.
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Threshold for triggering animation (0.1 = 10% visible)
 * @param {string} options.rootMargin - Root margin for intersection observer
 * @param {boolean} options.triggerOnce - Whether to trigger animation only once
 * @param {number} options.delay - Delay before animation starts (in ms)
 * @returns {Object} - { ref, isVisible, hasTriggered }
 */
export const useScrollAnimation = ({
  threshold = 0.1,
  rootMargin = '0px',
  triggerOnce = true,
  delay = 0
} = {}) => {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const observerRef = useRef(null);
  const timeoutRef = useRef(null);
  const hasTriggeredRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      // If no element, make visible immediately (fallback)
      setIsVisible(true);
      return;
    }

    // Trigger visibility with optional delay
    const triggerVisible = () => {
      if (hasTriggeredRef.current) return;
      
      const doTrigger = () => {
        hasTriggeredRef.current = true;
        setIsVisible(true);
        setHasTriggered(true);
      };

      if (delay > 0) {
        timeoutRef.current = setTimeout(doTrigger, delay);
      } else {
        doTrigger();
      }
    };

    // Check if element is in viewport
    const isElementInViewport = () => {
      const rect = element.getBoundingClientRect();
      const windowHeight = window.innerHeight || document.documentElement.clientHeight;
      return rect.top < windowHeight && rect.bottom > 0;
    };

    // Immediate check - if already in viewport, trigger animation
    if (isElementInViewport()) {
      triggerVisible();
      return;
    }

    // Set up Intersection Observer for elements not initially visible
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTriggeredRef.current) {
          triggerVisible();
          if (triggerOnce && observerRef.current) {
            observerRef.current.disconnect();
          }
        } else if (!triggerOnce && !entry.isIntersecting) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    observerRef.current.observe(element);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [threshold, rootMargin, triggerOnce, delay]);

  return {
    ref,
    isVisible,
    hasTriggered
  };
};

/**
 * Hook for staggered animations (multiple elements with incremental delays)
 * @param {number} count - Number of elements to animate
 * @param {number} staggerDelay - Delay between each element animation (in ms)
 * @param {Object} options - Same options as useScrollAnimation
 * @returns {Array} - Array of animation objects for each element
 */
export const useStaggeredScrollAnimation = (count, staggerDelay = 100, options = {}) => {
  const animations = [];
  
  for (let i = 0; i < count; i++) {
    const animation = useScrollAnimation({
      ...options,
      delay: (options.delay || 0) + (i * staggerDelay)
    });
    animations.push(animation);
  }
  
  return animations;
};

export default useScrollAnimation;
