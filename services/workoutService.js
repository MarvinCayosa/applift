/**
 * Workout Service
 * Handles all workout-related API calls
 */

import httpClient from '../apiUtils/httpClient'
import { ENDPOINTS } from '../config/api'
import { handleApiError } from '../apiUtils/errorHandler'
import { authService } from './authService'

export const workoutService = {
  /**
   * Get all workouts
   */
  async getWorkouts(params = {}) {
    try {
      const token = authService.getToken()
      const queryString = new URLSearchParams(params).toString()
      const url = queryString ? `${ENDPOINTS.WORKOUTS.LIST}?${queryString}` : ENDPOINTS.WORKOUTS.LIST

      const response = await httpClient.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Get single workout
   */
  async getWorkout(id) {
    try {
      const token = authService.getToken()
      const response = await httpClient.get(ENDPOINTS.WORKOUTS.GET(id), {
        headers: { Authorization: `Bearer ${token}` },
      })

      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Create new workout
   */
  async createWorkout(workoutData) {
    try {
      const token = authService.getToken()
      const response = await httpClient.post(ENDPOINTS.WORKOUTS.CREATE, workoutData, {
        headers: { Authorization: `Bearer ${token}` },
      })

      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Update workout
   */
  async updateWorkout(id, workoutData) {
    try {
      const token = authService.getToken()
      const response = await httpClient.put(ENDPOINTS.WORKOUTS.UPDATE(id), workoutData, {
        headers: { Authorization: `Bearer ${token}` },
      })

      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Delete workout
   */
  async deleteWorkout(id) {
    try {
      const token = authService.getToken()
      const response = await httpClient.delete(ENDPOINTS.WORKOUTS.DELETE(id), {
        headers: { Authorization: `Bearer ${token}` },
      })

      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },
}

export default workoutService
