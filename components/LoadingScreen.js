import React from 'react';

const LoadingScreen = ({ message = "Loading...", showLogo = true }) => {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      {/* Logo */}
      {showLogo && (
        <div className="mb-8">
          <img 
            src="/images/applift-logo/AppLift_Logo_White.png" 
            alt="AppLift" 
            className="h-16 w-auto"
          />
        </div>
      )}
      
      {/* Loading Bar Container */}
      <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-white rounded-full animate-loading-bar shadow-lg shadow-white/30"></div>
      </div>
      
      {/* Loading Message */}
      <div className="text-white text-lg font-medium opacity-80">
        {message}
      </div>
      
      {/* Custom CSS for the loading bar animation */}
      <style jsx>{`
        @keyframes loading-bar {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
        
        .animate-loading-bar {
          animation: loading-bar 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default LoadingScreen;
