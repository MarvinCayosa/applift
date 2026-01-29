/**
 * User Service
 * Handles user profile and settings
 */

import httpClient from '../api/httpClient'
import { ENDPOINTS } from '../config/api'
import { handleApiError } from '../api/errorHandler'
import { authService } from './authService'

export const userService = {
  /**
   * Get user profile
   */
  async getProfile() {
    try {
      const token = authService.getToken()
      const response = await httpClient.get(ENDPOINTS.USER.PROFILE, {
        headers: { Authorization: `Bearer ${token}` },
      })

      authService.setUser(response.data)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Update user profile
   */
  async updateProfile(profileData) {
    try {
      const token = authService.getToken()
      const response = await httpClient.put(ENDPOINTS.USER.UPDATE_PROFILE, profileData, {
        headers: { Authorization: `Bearer ${token}` },
      })

      authService.setUser(response.data)
      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Get user settings
   */
  async getSettings() {
    try {
      const token = authService.getToken()
      const response = await httpClient.get(ENDPOINTS.USER.SETTINGS, {
        headers: { Authorization: `Bearer ${token}` },
      })

      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Update user settings
   */
  async updateSettings(settings) {
    try {
      const token = authService.getToken()
      const response = await httpClient.put(ENDPOINTS.USER.UPDATE_SETTINGS, settings, {
        headers: { Authorization: `Bearer ${token}` },
      })

      return response.data
    } catch (error) {
      throw handleApiError(error)
    }
  },
}

export default userService
