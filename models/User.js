/**
 * Model Definitions
 * Type definitions and constants for User model
 */

export const UserModel = {
  // User roles
  ROLES: {
    USER: 'user',
    PREMIUM: 'premium',
    ADMIN: 'admin',
  },

  // User schema
  SCHEMA: {
    id: 'string (UUID)',
    email: 'string',
    password: 'string (hashed)',
    name: 'string',
    avatar: 'string (URL, optional)',
    age: 'number (optional)',
    weight: 'number (optional)',
    height: 'number (optional)',
    role: `'user' | 'premium' | 'admin'`,
    settings: 'object (preferences)',
    createdAt: 'string (ISO date)',
    updatedAt: 'string (ISO date)',
  },

  // Default user data
  DEFAULT: {
    name: '',
    email: '',
    avatar: null,
    age: null,
    weight: null,
    height: null,
    role: 'user',
    settings: {
      theme: 'dark',
      notifications: true,
      units: 'metric',
    },
  },
}

export default UserModel
