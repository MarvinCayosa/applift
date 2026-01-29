/**
 * Auth Error Alert Component
 * Displays authentication errors with dismiss functionality
 */

import React, { useEffect } from 'react';

export default function AuthErrorAlert({ 
  error, 
  onDismiss, 
  autoDismiss = true,
  autoDismissDelay = 5000 
}) {
  useEffect(() => {
    if (autoDismiss && error && onDismiss) {
      const timer = setTimeout(onDismiss, autoDismissDelay);
      return () => clearTimeout(timer);
    }
  }, [error, onDismiss, autoDismiss, autoDismissDelay]);

  if (!error) return null;

  return (
    <div 
      className="bg-rose-50/10 border border-rose-400/30 text-rose-300 rounded-xl backdrop-blur-sm animate-fadeIn"
      style={{ 
        padding: 'clamp(0.75rem, 2vh, 1rem)', 
        fontSize: 'clamp(0.75rem, 2.75vw, 0.875rem)',
      }}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5 flex-shrink-0 mt-0.5" 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path 
            fillRule="evenodd" 
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" 
            clipRule="evenodd" 
          />
        </svg>
        <div className="flex-1">
          <p>{error}</p>
        </div>
        {onDismiss && (
          <button 
            onClick={onDismiss}
            className="flex-shrink-0 p-1 hover:bg-white/10 rounded-full transition-colors"
            aria-label="Dismiss error"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4" 
              viewBox="0 0 20 20" 
              fill="currentColor"
            >
              <path 
                fillRule="evenodd" 
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
                clipRule="evenodd" 
              />
            </svg>
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
