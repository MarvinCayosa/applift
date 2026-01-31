/**
 * Authentication Context
 * Provides centralized auth state management across the application
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { app } from '../config/firebase';
import { db } from '../config/firestore';

const AuthContext = createContext(null);

// Auth error messages mapping
const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use': 'This email is already registered. Please log in instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/operation-not-allowed': 'Email/password accounts are not enabled. Please contact support.',
  'auth/weak-password': 'Password is too weak. Please use at least 8 characters with uppercase, numbers, and symbols.',
  'auth/user-disabled': 'This account has been disabled. Please contact support.',
  'auth/user-not-found': 'No account found with this email. Please sign up first.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled. Please try again.',
  'auth/popup-blocked': 'Pop-up was blocked. Please allow pop-ups for this site.',
  'auth/requires-recent-login': 'Please log in again to complete this action.',
  'auth/invalid-credential': 'Invalid credentials. Please check your email and password.',
  'auth/invalid-login-credentials': 'Invalid email or password. Please try again.',
};

const getAuthErrorMessage = (error) => {
  const code = error?.code || '';
  return AUTH_ERROR_MESSAGES[code] || error?.message || 'An unexpected error occurred. Please try again.';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  
  // Configure Google OAuth scopes
  googleProvider.addScope('profile');
  googleProvider.addScope('email');
  googleProvider.setCustomParameters({
    'prompt': 'consent'
  });

  // Clear auth error
  const clearError = useCallback(() => setAuthError(null), []);

  // Fetch user profile from Firestore
  const fetchUserProfile = useCallback(async (uid) => {
    if (!uid) return null;
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        return { uid, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }, []);

  // Update user profile in Firestore
  const updateUserProfile = useCallback(async (profileData) => {
    if (!user?.uid) throw new Error('No authenticated user');
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        ...profileData,
        updatedAt: serverTimestamp(),
      });
      const updatedProfile = await fetchUserProfile(user.uid);
      setUserProfile(updatedProfile);
      return updatedProfile;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }, [user, fetchUserProfile]);

  // Sign up with email and password
  const signUpWithEmail = useCallback(async (email, password, profileData = {}) => {
    setAuthError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      
      // Create user profile in Firestore
      const profile = {
        email: newUser.email,
        provider: 'email',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        onboardingCompleted: false,
        ...profileData,
      };
      
      await setDoc(doc(db, 'users', newUser.uid), profile);
      setUserProfile({ uid: newUser.uid, ...profile });
      
      return { user: newUser, profile, isNewUser: true };
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, [auth]);

  // Sign in with email and password
  const signInWithEmail = useCallback(async (email, password) => {
    setAuthError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const profile = await fetchUserProfile(userCredential.user.uid);
      setUserProfile(profile);
      
      return { 
        user: userCredential.user, 
        profile,
        isNewUser: false,
        onboardingCompleted: profile?.onboardingCompleted ?? false 
      };
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, [auth, fetchUserProfile]);

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      console.log('🔐 Starting Google Sign-In...');
      console.log('📱 User Agent:', navigator.userAgent);
      console.log('🌐 Current URL:', window.location.href);
      
      // Try popup first (works on desktop and some mobile browsers)
      let result;
      try {
        result = await signInWithPopup(auth, googleProvider);
        console.log('✅ Google Sign-In successful via popup');
      } catch (popupError) {
        // If popup fails (PWA mode, blocked popup, etc), try redirect
        if (popupError.code === 'auth/popup-blocked' || 
            popupError.code === 'auth/internal-error' ||
            popupError.code === 'auth/operation-not-supported-in-this-environment') {
          console.log('⚠️ Popup failed, attempting redirect flow...');
          console.log('Popup error:', popupError.code);
          
          // Store intended destination
          sessionStorage.setItem('auth_redirect_source', 'google');
          
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw popupError;
      }
      
      const googleUser = result.user;
      
      console.log('✅ Google Sign-In successful for user:', googleUser.email);
      
      // Check if user profile exists
      const existingProfile = await fetchUserProfile(googleUser.uid);
      
      if (existingProfile) {
        // Existing user - update last login
        console.log('👤 Existing user found, updating last login');
        await updateDoc(doc(db, 'users', googleUser.uid), {
          lastLoginAt: serverTimestamp(),
        });
        setUserProfile(existingProfile);
        setUser(googleUser);
        
        return { 
          user: googleUser, 
          profile: existingProfile,
          isNewUser: false,
          onboardingCompleted: existingProfile.onboardingCompleted ?? false 
        };
      } else {
        // New user - create basic profile (onboarding not completed)
        console.log('🆕 New user detected, creating profile');
        const newProfile = {
          email: googleUser.email,
          displayName: googleUser.displayName || '',
          photoURL: googleUser.photoURL || '',
          provider: 'google',
          username: googleUser.displayName || googleUser.email?.split('@')[0] || 'User',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          onboardingCompleted: false,
        };
        
        await setDoc(doc(db, 'users', googleUser.uid), newProfile);
        setUserProfile({ uid: googleUser.uid, ...newProfile });
        setUser(googleUser);
        
        return { 
          user: googleUser, 
          profile: newProfile,
          isNewUser: true,
          onboardingCompleted: false 
        };
      }
    } catch (error) {
      console.error('❌ Google sign-in error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Full error object:', error);
      
      // Provide detailed error context
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('ℹ️ User closed the Google sign-in popup');
      } else if (error.code === 'auth/popup-blocked') {
        console.log('⚠️ Popup was blocked by the browser');
      } else if (error.code === 'auth/internal-error') {
        console.log('⚠️ Firebase internal error - may be due to:');
        console.log('  - PWA mode popup restrictions');
        console.log('  - Missing OAuth consent screen');
        console.log('  - Firebase project configuration issue');
      }
      
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, [auth, googleProvider, fetchUserProfile]);

  // Complete onboarding
  const completeOnboarding = useCallback(async (profileData) => {
    if (!user?.uid) throw new Error('No authenticated user');
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        ...profileData,
        onboardingCompleted: true,
        onboardingCompletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const updatedProfile = await fetchUserProfile(user.uid);
      setUserProfile(updatedProfile);
      return updatedProfile;
    } catch (error) {
      console.error('Error completing onboarding:', error);
      throw error;
    }
  }, [user, fetchUserProfile]);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserProfile(null);
      
      // Clear local storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('applift:userProfile');
        sessionStorage.removeItem('applift-appmode-splash-seen');
      }
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }, [auth]);

  // Reset password - sends email using Firebase's built-in template
  const resetPassword = useCallback(async (email) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message);
    }
  }, [auth]);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          const profile = await fetchUserProfile(firebaseUser.uid);
          setUserProfile(profile);
        } else {
          setUser(null);
          setUserProfile(null);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [auth, fetchUserProfile]);

  // Handle Google Sign-In redirect results (for PWA/mobile)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleRedirectResult = async () => {
      try {
        console.log('🔄 Checking for Google Sign-In redirect result...');
        const result = await getRedirectResult(auth);
        
        if (result?.user) {
          console.log('✅ Google Sign-In redirect completed for:', result.user.email);
          
          // Check if user profile exists
          const existingProfile = await fetchUserProfile(result.user.uid);
          
          if (!existingProfile) {
            // New user from redirect - create basic profile
            console.log('🆕 New user from redirect, creating profile');
            const newProfile = {
              email: result.user.email,
              displayName: result.user.displayName || '',
              photoURL: result.user.photoURL || '',
              provider: 'google',
              username: result.user.displayName || result.user.email?.split('@')[0] || 'User',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              onboardingCompleted: false,
            };
            
            await setDoc(doc(db, 'users', result.user.uid), newProfile);
          } else {
            // Existing user - update last login
            console.log('👤 Existing user from redirect, updating last login');
            await updateDoc(doc(db, 'users', result.user.uid), {
              lastLoginAt: serverTimestamp(),
            });
          }
          
          // Clear redirect source flag
          sessionStorage.removeItem('auth_redirect_source');
        }
      } catch (error) {
        if (error.code === 'auth/network-request-failed') {
          console.log('ℹ️ Network error checking redirect result - will handle in auth state change');
        } else if (error.code !== 'auth/cancelled-popup-request') {
          console.error('Error handling redirect result:', error);
        }
      }
    };
    
    handleRedirectResult();
  }, [auth, fetchUserProfile]);

  // Context value
  const value = useMemo(() => ({
    user,
    userProfile,
    loading,
    authError,
    isAuthenticated: !!user,
    isOnboardingComplete: userProfile?.onboardingCompleted ?? false,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    resetPassword,
    updateUserProfile,
    completeOnboarding,
    clearError,
    fetchUserProfile,
  }), [
    user,
    userProfile,
    loading,
    authError,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    resetPassword,
    updateUserProfile,
    completeOnboarding,
    clearError,
    fetchUserProfile,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
