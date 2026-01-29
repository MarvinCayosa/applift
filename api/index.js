/**
 * API Index
 * Central export point for all API utilities and services
 */

// HTTP Client
export { default as httpClient, HttpClient } from './httpClient'

// Error handling
export { ApiError, handleApiError, getErrorMessage } from './errorHandler'

// Services
export { default as authService } from '../services/authService'
export { default as workoutService } from '../services/workoutService'
export { default as userService } from '../services/userService'

// Config
export { API_CONFIG, ENDPOINTS } from '../config/api'

