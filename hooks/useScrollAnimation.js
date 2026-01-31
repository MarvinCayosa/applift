import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook for scroll animations using Intersection Observer
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

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay > 0) {
            setTimeout(() => {
              setIsVisible(true);
              setHasTriggered(true);
            }, delay);
          } else {
            setIsVisible(true);
            setHasTriggered(true);
          }
        } else if (!triggerOnce) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    observer.observe(element);

    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [threshold, rootMargin, triggerOnce, delay]);

  return {
    ref,
    isVisible: triggerOnce ? hasTriggered : isVisible,
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
