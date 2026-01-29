import { useState, useEffect, useRef } from 'react';

export default function ConnectPill({ 
  connected, 
  device, 
  onScan, 
  onConnect, 
  onDisconnect, 
  scanning, 
  devicesFound = [],
  availability,
  collapse = 0
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const pillRef = useRef(null);
  
  // Calculate dimensions based on collapse progress
  const pillWidth = collapse === 0 ? 'w-full max-w-sm' : 'w-14';
  const textOpacity = Math.max(0, 1 - collapse * 1.5); // Fade out text early
  const containerMaxWidth = collapse === 0 ? '100%' : '56px';

  // Close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!pillRef.current) return;
      if (!pillRef.current.contains(e.target)) setIsExpanded(false);
    }
    if (isExpanded) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isExpanded]);

  // Close on ESC key
  useEffect(() => {
    function onEsc(e) {
      if (e.key === 'Escape') setIsExpanded(false);
    }
    if (isExpanded) document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isExpanded]);

  const handleScan = async () => {
    if (onScan) await onScan();
  };

  const handleConnect = async (selectedDevice) => {
    if (onConnect) {
      await onConnect(selectedDevice);
      setIsExpanded(false);
    }
  };

  const handleDisconnect = () => {
    if (onDisconnect) onDisconnect();
    setIsExpanded(false);
  };

  return (
    <>
      {/* Backdrop */}
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] transition-opacity duration-300"
          style={{ animation: 'fadeIn 0.3s ease-out' }}
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* Pill - stays in place, expands like accordion */}
      <div 
        ref={pillRef}
        className={`relative overflow-hidden border shadow-lg transition-all duration-600 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isExpanded 
            ? 'z-[10000] rounded-[24px] px-6 py-6 w-full max-w-sm' 
            : 'z-50 rounded-[32px] py-3'
        }`}
        style={{
          width: collapse > 0 ? '56px' : isExpanded ? '100%' : '100%',
          maxWidth: collapse > 0 ? '56px' : isExpanded ? '28rem' : '28rem',
          paddingLeft: collapse > 0 || isExpanded ? 'auto' : '20px',
          paddingRight: collapse > 0 || isExpanded ? 'auto' : '20px',
          paddingLeft: isExpanded ? '24px' : collapse > 0 ? '12px' : '20px',
          paddingRight: isExpanded ? '24px' : collapse > 0 ? '12px' : '20px',
          maxHeight: isExpanded ? '520px' : '88px',
          background: connected
            ? 'radial-gradient(circle, rgb(141, 184, 11) 0%, rgb(56, 139, 42) 50%, rgb(59, 105, 2) 100%)'
            : 'linear-gradient(90deg, #2A2A2A 0%, #3A3A3A 100%)',
          borderColor: connected ? 'rgba(5, 150, 105, 0.55)' : 'rgba(107, 114, 128, 0.45)',
          boxShadow: connected
            ? '0 18px 50px rgba(16, 185, 129, 0.25)'
            : '0 14px 40px rgba(0, 0, 0, 0.25)',
          transition: isExpanded || collapse > 0 ? 'max-height 600ms ease, padding 400ms ease, border-radius 400ms ease, background 800ms ease-in-out, border-color 800ms ease-in-out, box-shadow 800ms ease-in-out, width 600ms ease, max-width 600ms ease' : 'max-height 600ms ease, padding 400ms ease, border-radius 400ms ease, background 800ms ease-in-out, border-color 800ms ease-in-out, box-shadow 800ms ease-in-out',
          animation: connected ? 'shimmer 12s linear infinite' : 'none',
          backgroundSize: connected ? '150% 100%' : '100% 100%',
          backgroundPosition: 'left center'
        }}
      >
        {!isExpanded && collapse < 1 ? (
          // Collapsed Pill View
          <button 
            onClick={() => setIsExpanded(true)}
            className="flex flex-1 items-center gap-3 w-full cursor-pointer active:scale-98 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ opacity: collapse === 0 ? 1 : 0 }}
          >
            <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 flex-shrink-0 ${
              connected ? 'bg-white/20' : 'bg-gray-600/40'
            }`}>
              <svg width="22" height="22" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path fill="#ffffff" d="m9.41 0l6 6l-4 4l4 4l-6 6H9v-7.59l-3.3 3.3l-1.4-1.42L8.58 10l-4.3-4.3L5.7 4.3L9 7.58V0h.41zM11 4.41V7.6L12.59 6L11 4.41zM12.59 14L11 12.41v3.18L12.59 14z"/>
              </svg>
            </div>
            <div className="flex flex-col leading-tight items-start" style={{ opacity: textOpacity }}>
              <span className="text-xs font-medium tracking-tight text-white">
                Your Device is
              </span>
              <span className="text-sm text-white/80 font-semibold tracking-tight">
                {connected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
          </button>
        ) : collapse >= 1 ? (
          // Fully Collapsed - Icon Only
          <button 
            onClick={() => setIsExpanded(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 cursor-pointer"
            style={{
              background: 'transparent',
              margin: '0 auto'
            }}
            aria-label="Bluetooth"
          >
            <svg width="22" height="22" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <path fill="#ffffff" d="m9.41 0l6 6l-4 4l4 4l-6 6H9v-7.59l-3.3 3.3l-1.4-1.42L8.58 10l-4.3-4.3L5.7 4.3L9 7.58V0h.41zM11 4.41V7.6L12.59 6L11 4.41zM12.59 14L11 12.41v3.18L12.59 14z"/>
            </svg>
          </button>
        ) : (
          // Expanded Modal View
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  connected ? 'bg-white/20' : 'bg-gray-600/40'
                }`}>
                  <svg width="22" height="22" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path fill="#ffffff" d="m9.41 0l6 6l-4 4l4 4l-6 6H9v-7.59l-3.3 3.3l-1.4-1.42L8.58 10l-4.3-4.3L5.7 4.3L9 7.58V0h.41zM11 4.41V7.6L12.59 6L11 4.41zM12.59 14L11 12.41v3.18L12.59 14z"/>
                  </svg>
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold text-white">
                    Bluetooth Pairing
                  </span>
                  <span className="text-xs text-white/70">
                    {connected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setIsExpanded(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            {connected && device ? (
              // Connected State
              <div className="space-y-3">
                <div className="rounded-2xl bg-white/10 border border-white/20 p-4">
                  <div className="text-xs text-white/60 mb-1">Connected Device</div>
                  <div className="text-sm font-semibold text-white">{device.name ?? device.id ?? 'Unknown Device'}</div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="w-full py-3 rounded-full bg-[#b34a4a] hover:bg-[#a24141] text-white font-medium transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              // Disconnected State
              <div className="space-y-3">
                <p className="text-xs text-white/70">
                  Tap Scan to find nearby Bluetooth devices.
                </p>
                
                <button
                  onClick={handleScan}
                  disabled={scanning || !availability}
                  className="w-full py-3 rounded-full bg-white text-black font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {scanning ? 'Scanning…' : 'Scan Devices'}
                </button>

                {!availability && (
                  <p className="text-xs text-red-400 text-center">
                    Bluetooth is off or unavailable.
                  </p>
                )}

                {/* Paired Devices List */}
                {devicesFound.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    <div className="text-xs text-white/60 font-medium">Available Devices</div>
                    {devicesFound.map((dev) => (
                      <button
                        key={dev.id}
                        onClick={() => handleConnect(dev)}
                        className="w-full px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-left transition-colors"
                      >
                        <div className="text-sm font-medium text-white">
                          {dev.name ?? dev.id ?? 'Unknown Device'}
                        </div>
                        <div className="text-xs text-white/60 mt-0.5">Tap to connect</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes shimmer {
          0% {
            background-position: -150% center;
          }
          100% {
            background-position: 150% center;
          }
        }
      `}</style>
    </>
  );
}
