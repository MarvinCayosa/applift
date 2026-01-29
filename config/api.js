/**
 * API Configuration
 * Central configuration for backend API connections
 */

export const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000'),
  headers: {
    'Content-Type': 'application/json',
  },
}

export const ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/api/auth/login',
    SIGNUP: '/api/auth/signup',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    VERIFY: '/api/auth/verify',
  },
  
  // User
  USER: {
    PROFILE: '/api/user/profile',
    UPDATE_PROFILE: '/api/user/profile',
    SETTINGS: '/api/user/settings',
    UPDATE_SETTINGS: '/api/user/settings',
  },
  
  // Workouts
  WORKOUTS: {
    LIST: '/api/workouts',
    CREATE: '/api/workouts',
    GET: (id) => `/api/workouts/${id}`,
    UPDATE: (id) => `/api/workouts/${id}`,
    DELETE: (id) => `/api/workouts/${id}`,
  },
  
  // Exercises
  EXERCISES: {
    LIST: '/api/exercises',
    GET: (id) => `/api/exercises/${id}`,
    SEARCH: '/api/exercises/search',
  },
  
  // Equipment
  EQUIPMENT: {
    LIST: '/api/equipment',
    GET: (id) => `/api/equipment/${id}`,
  },
  
  // History
  HISTORY: {
    LIST: '/api/history',
    GET: (id) => `/api/history/${id}`,
    CREATE: '/api/history',
  },
  
  // Bluetooth Devices
  DEVICES: {
    LIST: '/api/devices',
    PAIR: '/api/devices/pair',
    UNPAIR: (id) => `/api/devices/${id}`,
    GET: (id) => `/api/devices/${id}`,
  },
}

export default API_CONFIG
