import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'applift:userProfile'

const defaultProfile = {
  // Account
  userId: null,
  username: '',
  email: '',
  authProvider: 'email',
  // Terms
  termsAccepted: false,
  termsAcceptedAt: null,
  // Personal
  gender: '',
  birthMonth: '',
  birthYear: '',
  age: null, // computed
  // Physical (normalized + raw for convenience)
  height: null, // centimeters
  heightUnit: 'ft', // 'ft' | 'cm'
  heightFeet: '',
  heightInches: '',
  heightCm: '',
  weight: null, // kg
  // Fitness
  fitnessLevel: '',
  fitnessGoal: '',
  liftingConfidence: '',
  // Meta
  createdAt: null,
  onboardingCompleted: false,
}

const UserProfileContext = createContext(null)

export function UserProfileProvider({ children }) {
  const [profile, setProfile] = useState(() => {
    if (typeof window === 'undefined') return defaultProfile
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      return raw ? { ...defaultProfile, ...JSON.parse(raw) } : defaultProfile
    } catch (e) {
      console.warn('Failed to read profile storage:', e)
      return defaultProfile
    }
  })

  // Persist profile changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
    } catch (e) {
      console.warn('Failed to persist profile:', e)
    }
  }, [profile])

  const updateProfile = (partial) => {
    setProfile((prev) => ({ ...prev, ...partial }))
  }

  const resetProfile = () => setProfile(defaultProfile)

  const value = useMemo(() => ({ profile, updateProfile, resetProfile }), [profile])
  return (
    <UserProfileContext.Provider value={value}>
      {children}
    </UserProfileContext.Provider>
  )
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext)
  if (!ctx) throw new Error('useUserProfile must be used within UserProfileProvider')
  return ctx
}
