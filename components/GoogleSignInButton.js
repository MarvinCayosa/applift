/**
 * Google Sign-In Button Component
 * Reusable component for Google OAuth sign-in
 */

import React, { useState } from 'react';

export default function GoogleSignInButton({ 
  onSignIn, 
  disabled = false, 
  text = 'Sign in with Google',
  className = '',
  fullWidth = true,
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || isLoading) return;
    
    setIsLoading(true);
    try {
      await onSignIn();
    } catch (error) {
      console.error('Google sign-in error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`
        ${fullWidth ? 'w-full' : ''} 
        inline-flex items-center justify-center 
        rounded-full bg-white text-black font-semibold 
        py-3 px-4 
        transition-all duration-200
        hover:bg-gray-100
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      style={{ fontSize: 'clamp(0.875rem, 3vw, 1rem)' }}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
      ) : (
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="20" 
          height="20" 
          viewBox="0 0 48 48"
          className="mr-2"
        >
          <path 
            fill="#4285F4" 
            d="M24 9.5c3.54 0 6.7 1.22 9.19 3.22l6.85-6.85C35.64 2.34 30.13 0 24 0 14.61 0 6.27 5.7 2.44 14.01l7.98 6.21C12.13 13.09 17.62 9.5 24 9.5z"
          />
          <path 
            fill="#34A853" 
            d="M46.1 24.59c0-1.54-.14-3.02-.39-4.45H24v8.44h12.44c-.54 2.9-2.18 5.36-4.64 7.02l7.19 5.59C43.73 37.13 46.1 31.36 46.1 24.59z"
          />
          <path 
            fill="#FBBC05" 
            d="M10.42 28.22c-1.13-3.36-1.13-6.97 0-10.33l-7.98-6.21C.64 16.61 0 20.21 0 24c0 3.79.64 7.39 2.44 10.32l7.98-6.1z"
          />
          <path 
            fill="#EA4335" 
            d="M24 48c6.13 0 11.64-2.02 15.84-5.5l-7.19-5.59c-2.01 1.35-4.59 2.15-8.65 2.15-6.38 0-11.87-3.59-14.58-8.72l-7.98 6.1C6.27 42.3 14.61 48 24 48z"
          />
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>
      )}
      {isLoading ? 'Signing in...' : text}
    </button>
  );
}
