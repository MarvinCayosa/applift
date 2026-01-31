import { useState, useEffect, useCallback } from 'react';
import { MovementQualityService } from '../services/movementQualityService';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook for managing movement quality data
 * @returns {Object} Movement quality data and methods
 */
export function useMovementQuality() {
  const { user } = useAuth();
  const [equipmentData, setEquipmentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  // Load initial movement quality data
  useEffect(() => {
    const loadData = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await MovementQualityService.getAllMovementQualityData(user.uid);
        setEquipmentData(data);
      } catch (err) {
        console.error('Error loading movement quality data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user?.uid]);

  /**
   * Update movement quality after a workout
   * @param {Object} workoutData - IMU data from the workout
   * @param {string} equipmentType - Type of equipment used
   */
  const updateFromWorkout = useCallback(async (workoutData, equipmentType) => {
    if (!user?.uid) return;

    try {
      setError(null);
      const updatedData = await MovementQualityService.updateMovementQuality(
        user.uid,
        workoutData,
        equipmentType
      );
      setEquipmentData(updatedData);
      return updatedData;
    } catch (err) {
      console.error('Error updating movement quality:', err);
      setError(err.message);
      throw err;
    }
  }, [user?.uid]);

  /**
   * Refresh data from backend
   */
  const refreshData = useCallback(async () => {
    if (!user?.uid) return;

    try {
      setLoading(true);
      setError(null);
      const data = await MovementQualityService.getAllMovementQualityData(user.uid);
      setEquipmentData(data);
      return data;
    } catch (err) {
      console.error('Error refreshing movement quality data:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  /**
   * Change the active filter
   * @param {string} filter - Filter value ('all', 'dumbbell', 'barbell', 'weightStack')
   */
  const changeFilter = useCallback((filter) => {
    setActiveFilter(filter);
  }, []);

  /**
   * Get current filtered data
   */
  const getCurrentData = useCallback(() => {
    if (!equipmentData) return null;
    return equipmentData[activeFilter] || equipmentData.all;
  }, [equipmentData, activeFilter]);

  return {
    // Data
    equipmentData,
    currentData: getCurrentData(),
    activeFilter,
    loading,
    error,
    
    // Methods
    updateFromWorkout,
    refreshData,
    changeFilter,
    
    // Computed values
    hasData: !!equipmentData,
    overallScore: equipmentData?.all?.score || 0
  };
}
