import { db } from '../config/firestore';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  where, 
  orderBy, 
  getDocs,
  Timestamp 
} from 'firebase/firestore';

/**
 * Movement Quality Service
 * Manages weekly aggregated IMU movement quality metrics
 * Metrics: Angular Velocity Variability, Jerk (Smoothness), ROM Consistency
 */
export class MovementQualityService {
  
  /**
   * Get weekly movement quality data for a user
   * @param {string} userId - The user's ID
   * @param {string} equipmentFilter - Filter by equipment type ('all', 'dumbbell', 'barbell', 'weightStack')
   * @returns {Promise<Object>} Movement quality data
   */
  static async getWeeklyMovementQuality(userId, equipmentFilter = 'all') {
    try {
      const docRef = doc(db, 'users', userId, 'movementQuality', 'weekly');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return equipmentFilter === 'all' ? data : (data[equipmentFilter] || data.all);
      }

      // Return default data if no records exist
      return this.getDefaultData();
    } catch (error) {
      console.error('Error fetching movement quality data:', error);
      throw error;
    }
  }

  /**
   * Get all equipment-filtered movement quality data
   * @param {string} userId - The user's ID
   * @returns {Promise<Object>} All movement quality data by equipment type
   */
  static async getAllMovementQualityData(userId) {
    try {
      const docRef = doc(db, 'users', userId, 'movementQuality', 'weekly');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data();
      }

      return this.getDefaultData();
    } catch (error) {
      console.error('Error fetching all movement quality data:', error);
      throw error;
    }
  }

  /**
   * Update movement quality metrics after a workout
   * @param {string} userId - The user's ID
   * @param {Object} workoutData - IMU data from the workout
   * @param {string} equipmentType - Type of equipment used
   * @returns {Promise<Object>} Updated movement quality data
   */
  static async updateMovementQuality(userId, workoutData, equipmentType = 'dumbbell') {
    try {
      const docRef = doc(db, 'users', userId, 'movementQuality', 'weekly');
      const docSnap = await getDoc(docRef);

      let currentData = docSnap.exists() ? docSnap.data() : this.getDefaultData();

      // Calculate new metrics from workout data
      const newMetrics = this.calculateMetrics(workoutData);

      // Update the specific equipment type data
      const equipmentKey = this.normalizeEquipmentType(equipmentType);
      
      // Weighted average with existing data (80% existing, 20% new for smooth updates)
      const updatedEquipmentData = this.mergeMetrics(
        currentData[equipmentKey] || this.getDefaultEquipmentData(),
        newMetrics,
        0.8
      );

      // Update 'all' category as well
      const updatedAllData = this.calculateAllData(currentData, equipmentKey, updatedEquipmentData);

      const updatedData = {
        ...currentData,
        [equipmentKey]: updatedEquipmentData,
        all: updatedAllData,
        lastUpdated: Timestamp.now(),
        weekStart: this.getWeekStart()
      };

      await setDoc(docRef, updatedData, { merge: true });

      return updatedData;
    } catch (error) {
      console.error('Error updating movement quality:', error);
      throw error;
    }
  }

  /**
   * Calculate metrics from raw IMU workout data
   * @param {Object} workoutData - Raw IMU data
   * @returns {Object} Calculated metrics
   */
  static calculateMetrics(workoutData) {
    const {
      angularVelocityData = [],
      accelerationData = [],
      repData = []
    } = workoutData;

    // Calculate Angular Velocity Variability (lower is better, inverted to score)
    const angularVelocity = this.calculateAngularVelocityScore(angularVelocityData);

    // Calculate Smoothness (jerk analysis - lower jerk is smoother)
    const smoothness = this.calculateSmoothnessScore(accelerationData);

    // Calculate ROM Consistency
    const romConsistency = this.calculateROMConsistencyScore(repData);

    // Overall score is weighted average
    const score = Math.round(
      angularVelocity * 0.3 +
      smoothness * 0.4 +
      romConsistency * 0.3
    );

    return {
      score,
      angularVelocity,
      smoothness,
      romConsistency
    };
  }

  /**
   * Calculate angular velocity variability score
   * @param {Array} data - Angular velocity readings
   * @returns {number} Score 0-100
   */
  static calculateAngularVelocityScore(data) {
    if (!data || data.length === 0) return 75; // Default score

    // Calculate coefficient of variation
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / mean) * 100;

    // Convert CV to score (lower CV = higher score)
    // CV of 0 = 100, CV of 50+ = 50
    const score = Math.max(50, Math.min(100, 100 - cv));
    return Math.round(score);
  }

  /**
   * Calculate smoothness score from jerk analysis
   * @param {Array} data - Acceleration data
   * @returns {number} Score 0-100
   */
  static calculateSmoothnessScore(data) {
    if (!data || data.length < 2) return 75; // Default score

    // Calculate jerk (derivative of acceleration)
    const jerks = [];
    for (let i = 1; i < data.length; i++) {
      jerks.push(Math.abs(data[i] - data[i - 1]));
    }

    // Average jerk magnitude
    const avgJerk = jerks.reduce((a, b) => a + b, 0) / jerks.length;

    // Convert to score (lower jerk = higher score)
    // Normalize assuming typical jerk range 0-10
    const normalizedJerk = Math.min(avgJerk / 10, 1);
    const score = Math.round(100 - (normalizedJerk * 50));
    return Math.max(50, Math.min(100, score));
  }

  /**
   * Calculate ROM consistency score
   * @param {Array} repData - Data from each rep
   * @returns {number} Score 0-100
   */
  static calculateROMConsistencyScore(repData) {
    if (!repData || repData.length < 2) return 75; // Default score

    // Extract ROM values from each rep
    const romValues = repData.map(rep => rep.rom || rep.range || 100);

    // Calculate consistency (lower std dev = higher consistency)
    const mean = romValues.reduce((a, b) => a + b, 0) / romValues.length;
    const variance = romValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / romValues.length;
    const stdDev = Math.sqrt(variance);

    // Convert to score (assume ROM measured in degrees, target < 5 degree variation)
    const variationPercent = (stdDev / mean) * 100;
    const score = Math.round(100 - (variationPercent * 2));
    return Math.max(50, Math.min(100, score));
  }

  /**
   * Merge old and new metrics with weighted average
   */
  static mergeMetrics(oldData, newData, oldWeight = 0.8) {
    const newWeight = 1 - oldWeight;
    return {
      score: Math.round(oldData.score * oldWeight + newData.score * newWeight),
      angularVelocity: Math.round(oldData.angularVelocity * oldWeight + newData.angularVelocity * newWeight),
      smoothness: Math.round(oldData.smoothness * oldWeight + newData.smoothness * newWeight),
      romConsistency: Math.round(oldData.romConsistency * oldWeight + newData.romConsistency * newWeight)
    };
  }

  /**
   * Calculate aggregate 'all' data from all equipment types
   */
  static calculateAllData(currentData, updatedKey, updatedData) {
    const equipmentTypes = ['dumbbell', 'barbell', 'weightStack'];
    let totalScore = 0, totalAngular = 0, totalSmoothness = 0, totalRom = 0;
    let count = 0;

    equipmentTypes.forEach(type => {
      const data = type === updatedKey ? updatedData : (currentData[type] || null);
      if (data) {
        totalScore += data.score;
        totalAngular += data.angularVelocity;
        totalSmoothness += data.smoothness;
        totalRom += data.romConsistency;
        count++;
      }
    });

    if (count === 0) return this.getDefaultEquipmentData();

    return {
      score: Math.round(totalScore / count),
      angularVelocity: Math.round(totalAngular / count),
      smoothness: Math.round(totalSmoothness / count),
      romConsistency: Math.round(totalRom / count)
    };
  }

  /**
   * Normalize equipment type string
   */
  static normalizeEquipmentType(type) {
    const typeMap = {
      'dumbbell': 'dumbbell',
      'dumbbells': 'dumbbell',
      'barbell': 'barbell',
      'barbells': 'barbell',
      'cable': 'weightStack',
      'cables': 'weightStack',
      'weight stack': 'weightStack',
      'weightstack': 'weightStack',
      'machine': 'weightStack'
    };
    return typeMap[type.toLowerCase()] || 'dumbbell';
  }

  /**
   * Get start of current week (Monday)
   */
  static getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return Timestamp.fromDate(monday);
  }

  /**
   * Default data structure
   */
  static getDefaultData() {
    const defaultEquipment = this.getDefaultEquipmentData();
    return {
      all: defaultEquipment,
      dumbbell: { ...defaultEquipment, score: 88, angularVelocity: 85, smoothness: 90, romConsistency: 89 },
      barbell: { ...defaultEquipment, score: 84, angularVelocity: 80, smoothness: 87, romConsistency: 85 },
      weightStack: { ...defaultEquipment, score: 82, angularVelocity: 78, smoothness: 86, romConsistency: 82 }
    };
  }

  /**
   * Default equipment data
   */
  static getDefaultEquipmentData() {
    return {
      score: 86,
      angularVelocity: 82,
      smoothness: 89,
      romConsistency: 87
    };
  }

  /**
   * Reset weekly data (call at start of new week)
   */
  static async resetWeeklyData(userId) {
    try {
      const docRef = doc(db, 'users', userId, 'movementQuality', 'weekly');
      await setDoc(docRef, {
        ...this.getDefaultData(),
        lastUpdated: Timestamp.now(),
        weekStart: this.getWeekStart()
      });
    } catch (error) {
      console.error('Error resetting weekly data:', error);
      throw error;
    }
  }
}
