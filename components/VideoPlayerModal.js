import { useState, useRef, useEffect } from 'react';

export default function VideoPlayerModal({ isOpen, onClose, videoSrc, title }) {
  const [isClosing, setIsClosing] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setIsClosing(false);
    }
  }, [isOpen]);

  useEffect(() => {
    // Pause video when modal closes
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 250);
  };

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 z-[60] flex items-center justify-center transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
      onClick={handleClose}
    >
      {/* Modal Content */}
      <div 
        className={`w-full max-w-4xl mx-4 transition-all duration-300 ${isClosing ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
        style={{ animation: !isClosing ? 'slideUpFade 0.3s ease-out' : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 px-2">
          <button 
            onClick={handleClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-white/20 transition-colors shrink-0"
            aria-label="Go back"
          >
            <img
              src="/images/icons/arrow-point-to-left.png"
              alt="Back"
              className="w-5 h-5 filter brightness-0 invert"
            />
          </button>
          <h2 className="text-lg sm:text-xl font-bold text-white">{title || 'Tutorial Video'}</h2>
        </div>

        {/* Video Player */}
        <div className="relative w-full rounded-2xl overflow-hidden bg-black shadow-2xl">
          <video
            ref={videoRef}
            className="w-full h-auto video-player-custom"
            controls
            controlsList="nodownload"
            playsInline
            preload="metadata"
            style={{ maxHeight: '80vh' }}
          >
            <source src={videoSrc} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUpFade {
          from { 
            opacity: 0;
            transform: translateY(100%);
          }
          to { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /* Custom video player styling - purple theme */
        :global(.video-player-custom::-webkit-media-controls-panel) {
          background-color: rgba(0, 0, 0, 0.8);
        }
        
        /* Progress bar track (background) */
        :global(.video-player-custom::-webkit-media-controls-timeline) {
          background-color: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        
        /* Progress bar fill (purple) */
        :global(.video-player-custom::-webkit-media-controls-timeline::-webkit-slider-runnable-track) {
          background-color: #8b5cf6;
        }
        
        /* Scrubber/thumb (purple circle) */
        :global(.video-player-custom::-webkit-media-controls-timeline::-webkit-slider-thumb) {
          background-color: #8b5cf6;
          border-radius: 50%;
        }
        
        /* Firefox - Progress bar fill */
        :global(.video-player-custom::-moz-range-progress) {
          background-color: #8b5cf6;
          border-radius: 4px;
        }
        
        /* Firefox - Track background */
        :global(.video-player-custom::-moz-range-track) {
          background-color: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
        
        /* Firefox - Thumb */
        :global(.video-player-custom::-moz-range-thumb) {
          background-color: #8b5cf6;
          border-radius: 50%;
        }
      `}</style>
    </div>
  );
}
