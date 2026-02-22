/**
 * useMovementQuality Hook
 * 
 * Fetches movement quality analytics from Firestore for the dashboard.
 * Aggregates data from userWorkouts/{userId}/{equipment}/{exercise}/analytics/
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firestore';
import { collection, getDocs } from 'firebase/firestore';

export function useMovementQuality(logs = [], hasWorkouts = false) {
  const { user } = useAuth();
  const [qualityData, setQualityData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasWorkouts || logs.length === 0 || !user?.uid) {
      setQualityData(null);
      return;
    }

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        // Get workouts from the last 7 days
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        
        const weeklyLogs = logs.filter(log => {
          const logDate = log.timestamps?.started?.toDate?.() || 
                         log.timestamps?.created?.toDate?.() ||
                         (log.startTime ? new Date(log.startTime) : null);
          return logDate && logDate >= weekAgo;
        });
        
        if (weeklyLogs.length === 0) {
          setQualityData(null);
          setLoading(false);
          return;
        }

        // Normalize equipment names
        const normalizeEquipment = (name) => {
          if (!name) return null;
          const normalized = name.trim().toLowerCase();
          if (normalized === 'dumbell' || normalized === 'dumbbell') return 'dumbbell';
          if (normalized === 'barbell') return 'barbell';
          if (normalized === 'weight-stack' || normalized === 'weight stack' || normalized === 'weightstack' || normalized === 'stack') return 'weight-stack';
          return normalized.replace(/[\s_]+/g, '-');
        };

        // Group logs by equipment and exercise to fetch analytics
        const exerciseGroups = {};
        weeklyLogs.forEach(log => {
          const equipment = normalizeEquipment(log._equipment || log.equipment);
          const exercise = (log._exercise || log.exercise)?.toLowerCase()?.replace(/[\s_]+/g, '-');
          
          if (equipment && exercise) {
            const key = `${equipment}/${exercise}`;
            if (!exerciseGroups[key]) {
              exerciseGroups[key] = { equipment, exercise, logIds: [] };
            }
            exerciseGroups[key].logIds.push(log.id);
          }
        });

        // Fetch analytics for each exercise type
        const allAnalytics = [];
        for (const [key, group] of Object.entries(exerciseGroups)) {
          try {
            const analyticsRef = collection(
              db, 
              'userWorkouts', 
              user.uid, 
              group.equipment, 
              group.exercise, 
              'analytics'
            );
            const snapshot = await getDocs(analyticsRef);
            
            snapshot.forEach(doc => {
              const data = doc.data();
              if (group.logIds.includes(doc.id)) {
                allAnalytics.push({
                  ...data,
                  equipment: group.equipment,
                  logId: doc.id
                });
              }
            });
          } catch (err) {
            console.warn(`[useMovementQuality] Failed to fetch analytics for ${key}:`, err.message);
          }
        }

        if (allAnalytics.length === 0) {
          setQualityData(null);
          setLoading(false);
          return;
        }

        // Calculate movement quality metrics from analytics
        const calculateQualityMetrics = (analytics) => {
          if (analytics.length === 0) return { score: 0, fatigue: 0, consistency: 0, smoothness: 0 };
          
          let fatigueSum = 0;
          let consistencySum = 0;
          let smoothnessSum = 0;
          let totalReps = 0;
          
          analytics.forEach(analysis => {
            const repMetrics = analysis.repMetrics || [];
            repMetrics.forEach(rep => {
              totalReps++;
              
              // Fatigue: Based on velocity loss and form degradation
              const velocityLossPercent = rep.velocityLossPercent || 0;
              const formQuality = rep.classification?.label === 'Clean' ? 1 : 0.6;
              const fatigueScore = Math.max(0, 100 - velocityLossPercent * 5) * formQuality;
              fatigueSum += fatigueScore;
              
              // Consistency: Based on ROM and timing consistency
              const romScore = rep.romDegrees ? Math.min(100, rep.romDegrees) : 75;
              const timingScore = rep.durationMs ? Math.min(100, Math.max(0, 100 - Math.abs(rep.durationMs - 2500) / 50)) : 75;
              const consistencyScore = (romScore + timingScore) / 2;
              consistencySum += consistencyScore;
              
              // Smoothness: Direct from analysis or derived from jerk/classification
              const smoothnessScore = rep.smoothnessScore || (formQuality * 80);
              smoothnessSum += smoothnessScore;
            });
          });
          
          if (totalReps === 0) {
            return { score: 0, fatigue: 0, consistency: 0, smoothness: 0 };
          }
          
          const fatigue = Math.round(fatigueSum / totalReps);
          const consistency = Math.round(consistencySum / totalReps);
          const smoothness = Math.round(smoothnessSum / totalReps);
          
          // Overall score is weighted average
          const score = Math.round((fatigue * 0.4 + consistency * 0.35 + smoothness * 0.25));
          
          return { score, fatigue, consistency, smoothness };
        };

        // Group analytics by equipment type
        const equipmentGroups = {
          dumbbell: [],
          barbell: [],
          weightStack: []
        };
        
        allAnalytics.forEach(analysis => {
          const equipment = analysis.equipment;
          if (equipment === 'dumbbell') {
            equipmentGroups.dumbbell.push(analysis);
          } else if (equipment === 'barbell') {
            equipmentGroups.barbell.push(analysis);
          } else {
            equipmentGroups.weightStack.push(analysis);
          }
        });

        const result = {
          all: calculateQualityMetrics(allAnalytics),
          dumbbell: calculateQualityMetrics(equipmentGroups.dumbbell),
          barbell: calculateQualityMetrics(equipmentGroups.barbell),
          weightStack: calculateQualityMetrics(equipmentGroups.weightStack)
        };
        
        setQualityData(result);
      } catch (error) {
        console.error('[useMovementQuality] Error fetching analytics:', error);
        setQualityData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [user?.uid, logs, hasWorkouts]);

  return { qualityData, loading };
}

export default useMovementQuality;