/**
 * FatigueVelocityCarousel - Re-export from sessionDetails
 * 
 * This component now re-exports FatigueCarousel from sessionDetails
 * to maintain a single source of truth for Fatigue Analysis.
 * 
 * Two-slide carousel: 
 *   Slide 1: Velocity Loss (VL) - González-Badillo methodology
 *   Slide 2: Smoothness (Mean Jerk Magnitude) - Movement quality analysis
 */

import FatigueCarousel from '../sessionDetails/FatigueCarousel';
export default FatigueCarousel;
