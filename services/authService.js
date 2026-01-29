/**
 * Authentication Service
 * Handles user authentication, login, signup, and token management
 */

import httpClient from './httpClient'
import { ENDPOINTS } from '../config/api'
import { handleApiError } from './errorHandler'

const AUTH_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_KEY = 'user_data'

export const authService = {
  /**
   * Login user
   */
  async login(email, password) {
    try {
      const response = await httpClient.post(ENDPOINTS.AUTH.LOGIN, {
        email,
        password,
      })

      this.setTokens(response.data.token, response.data.refreshToken)
      this.setUser(response.data.user)

      return {
        success: true,
        user: response.data.user,
        token: response.data.token,
      }
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Signup user
   */
  async signup(email, password, name) {
    try {
      const response = await httpClient.post(ENDPOINTS.AUTH.SIGNUP, {
        email,
        password,
        name,
      })

      this.setTokens(response.data.token, response.data.refreshToken)
      this.setUser(response.data.user)

      return {
        success: true,
        user: response.data.user,
        token: response.data.token,
      }
    } catch (error) {
      throw handleApiError(error)
    }
  },

  /**
   * Logout user
   */
  async logout() {
    try {
      const token = this.getToken()
      if (token) {
        await httpClient.post(ENDPOINTS.AUTH.LOGOUT, {}, {
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      this.clearTokens()
      this.clearUser()
    }
  },

  /**
   * Refresh token
   */
  async refreshToken() {
    try {
      const refreshToken = this.getRefreshToken()
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }

      const response = await httpClient.post(ENDPOINTS.AUTH.REFRESH, {
        refreshToken,
      })

      this.setToken(response.data.token)
      return response.data.token
    } catch (error) {
      this.clearTokens()
      throw handleApiError(error)
    }
  },

  /**
   * Verify token
   */
  async verifyToken() {
    try {
      const token = this.getToken()
      if (!token) {
        return { valid: false, user: null }
      }

      const response = await httpClient.get(ENDPOINTS.AUTH.VERIFY, {
        headers: { Authorization: `Bearer ${token}` },
      })

      this.setUser(response.data.user)
      return { valid: true, user: response.data.user }
    } catch (error) {
      this.clearTokens()
      return { valid: false, user: null }
    }
  },

  /**
   * Get current token
   */
  getToken() {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(AUTH_TOKEN_KEY)
  },

  /**
   * Get refresh token
   */
  getRefreshToken() {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  },

  /**
   * Set tokens
   */
  setTokens(token, refreshToken) {
    if (typeof window === 'undefined') return
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    }
  },

  /**
   * Set token
   */
  setToken(token) {
    if (typeof window === 'undefined') return
    localStorage.setItem(AUTH_TOKEN_KEY, token)
  },

  /**
   * Clear tokens
   */
  clearTokens() {
    if (typeof window === 'undefined') return
    localStorage.removeItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },

  /**
   * Get current user
   */
  getUser() {
    if (typeof window === 'undefined') return null
    const user = localStorage.getItem(USER_KEY)
    return user ? JSON.parse(user) : null
  },

  /**
   * Set user
   */
  setUser(user) {
    if (typeof window === 'undefined') return
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  /**
   * Clear user
   */
  clearUser() {
    if (typeof window === 'undefined') return
    localStorage.removeItem(USER_KEY)
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.getToken()
  },
}

export default authService
