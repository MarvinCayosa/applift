/**
 * HTTP Client Utility
 * Centralized HTTP client for API calls with error handling and interceptors
 */

import { API_CONFIG, ENDPOINTS } from '../config/api'

/**
 * HTTP Client for making API requests
 */
class HttpClient {
  constructor(config = API_CONFIG) {
    this.baseURL = config.baseURL
    this.timeout = config.timeout
    this.headers = config.headers
    this.interceptors = {
      request: [],
      response: [],
      error: [],
    }
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor) {
    this.interceptors.request.push(interceptor)
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor) {
    this.interceptors.response.push(interceptor)
  }

  /**
   * Add error interceptor
   */
  addErrorInterceptor(interceptor) {
    this.interceptors.error.push(interceptor)
  }

  /**
   * Execute request interceptors
   */
  async executeRequestInterceptors(config) {
    let finalConfig = { ...config }
    for (const interceptor of this.interceptors.request) {
      finalConfig = await interceptor(finalConfig)
    }
    return finalConfig
  }

  /**
   * Execute response interceptors
   */
  async executeResponseInterceptors(response) {
    let finalResponse = response
    for (const interceptor of this.interceptors.response) {
      finalResponse = await interceptor(finalResponse)
    }
    return finalResponse
  }

  /**
   * Execute error interceptors
   */
  async executeErrorInterceptors(error) {
    let finalError = error
    for (const interceptor of this.interceptors.error) {
      finalError = await interceptor(finalError)
    }
    return finalError
  }

  /**
   * Make HTTP request
   */
  async request(method, url, options = {}) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${url}`,
        headers: { ...this.headers, ...options.headers },
        timeout: options.timeout || this.timeout,
        ...options,
      }

      // Execute request interceptors
      const finalConfig = await this.executeRequestInterceptors(config)

      // Make request
      const response = await fetch(finalConfig.url, {
        method: finalConfig.method,
        headers: finalConfig.headers,
        body: finalConfig.data ? JSON.stringify(finalConfig.data) : undefined,
        signal: AbortSignal.timeout(finalConfig.timeout),
      })

      // Parse response
      let responseData
      const contentType = response.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        responseData = await response.json()
      } else {
        responseData = await response.text()
      }

      // Check if response is ok
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`)
        error.status = response.status
        error.data = responseData
        error.response = response
        throw error
      }

      const finalResponse = {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: responseData,
      }

      // Execute response interceptors
      return await this.executeResponseInterceptors(finalResponse)
    } catch (error) {
      // Execute error interceptors
      const finalError = await this.executeErrorInterceptors(error)
      throw finalError
    }
  }

  /**
   * GET request
   */
  get(url, options = {}) {
    return this.request('GET', url, options)
  }

  /**
   * POST request
   */
  post(url, data, options = {}) {
    return this.request('POST', url, { ...options, data })
  }

  /**
   * PUT request
   */
  put(url, data, options = {}) {
    return this.request('PUT', url, { ...options, data })
  }

  /**
   * PATCH request
   */
  patch(url, data, options = {}) {
    return this.request('PATCH', url, { ...options, data })
  }

  /**
   * DELETE request
   */
  delete(url, options = {}) {
    return this.request('DELETE', url, options)
  }
}

// Export singleton instance
const httpClient = new HttpClient()
export default httpClient
export { HttpClient }
