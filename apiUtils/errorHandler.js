/**
 * API Error Handler
 * Centralized error handling for API calls
 */

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  static fromResponse(error) {
    const message = error.message || 'Unknown error'
    const status = error.status || 500
    const data = error.data || null

    return new ApiError(message, status, data)
  }
}

/**
 * Error handler utility
 */
export const handleApiError = (error) => {
  if (error instanceof ApiError) {
    return error
  }

  // Network error
  if (error.message === 'Failed to fetch') {
    return new ApiError('Network error. Please check your connection.', 0, error)
  }

  // Timeout error
  if (error.name === 'AbortError') {
    return new ApiError('Request timeout. Please try again.', 408, error)
  }

  // Convert to ApiError
  if (error.status) {
    return ApiError.fromResponse(error)
  }

  // Unknown error
  return new ApiError(error.message || 'Unknown error', 500, error)
}

/**
 * Get user-friendly error message
 */
export const getErrorMessage = (error) => {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.data?.message || 'Invalid request'
      case 401:
        return 'Authentication required. Please log in again.'
      case 403:
        return 'You do not have permission to perform this action.'
      case 404:
        return 'The requested resource was not found.'
      case 408:
        return 'Request timeout. Please try again.'
      case 429:
        return 'Too many requests. Please try again later.'
      case 500:
        return 'Server error. Please try again later.'
      case 0:
        return 'Network error. Please check your connection.'
      default:
        return error.message || 'An error occurred. Please try again.'
    }
  }

  return error.message || 'An unexpected error occurred'
}
