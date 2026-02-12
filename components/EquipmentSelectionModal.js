import EquipmentIcon from './EquipmentIcon';

export default function EquipmentSelectionModal({ isOpen, onClose, onSelect, connected = true }) {
  if (!isOpen) return null;

  // Get colors based on equipment type (matching workouts.js)
  const getEquipmentColors = (equipmentType) => {
    switch (equipmentType) {
      case 'Barbell':
        return {
          outerBg: 'bg-[#b87700]',
          outerBorder: 'border-[#e69b00]',
          innerBg: 'bg-[#f0b233]',
          innerBorder: 'border-[#f5c042]',
        };
      case 'Dumbbell':
        return {
          outerBg: 'bg-[#0C4A6E]',
          outerBorder: 'border-[#0369A1]',
          innerBg: 'bg-[#3B82F6]',
          innerBorder: 'border-[#60A5FA]',
        };
      case 'Weight Stack':
        return {
          outerBg: 'bg-[#7f1d1d]',
          outerBorder: 'border-[#dc2626]',
          innerBg: 'bg-[#ef4444]',
          innerBorder: 'border-[#f87171]',
        };
      default:
        return {
          outerBg: 'bg-[#5B21B6]',
          outerBorder: 'border-[#7C3AED]',
          innerBg: 'bg-[#7C3AED]',
          innerBorder: 'border-[#8B5CF6]',
        };
    }
  };

  // If not connected, show message instead of equipment selection
  if (!connected) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
        onClick={onClose}
      >
        <div 
          className="relative max-w-md w-full p-8 rounded-3xl bg-[#1a1a1a]"
          style={{
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <img src="/images/device-icon/Applift_Device_White.png" alt="AppLift Device" className="w-12 h-12" />
            <h2 className="text-xl font-bold text-white text-center">Connect Your Device</h2>
            <p className="text-white/70 text-center text-sm">
              Connect to your AppLift device before choosing an equipment
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  const equipmentOptions = [
    { type: 'Barbell' },
    { type: 'Dumbbell' },
    { type: 'Weight Stack' },
  ];

  const handleSelect = (type) => {
    onSelect({ type, deviceId: 'MANUAL' });
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'modalBackdropFadeIn 400ms ease-out forwards',
      }}
      onClick={onClose}
    >
      <div 
        className="relative max-w-md w-full p-8 rounded-[28px] bg-[#1c1c1e]"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          animation: 'modalContentScaleUp 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          opacity: 0,
          transform: 'scale(0.9) translateY(20px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-white/70 hover:bg-white/12 hover:text-white transition-all duration-200"
          aria-label="Close"
          style={{ 
            animation: 'modalElementSlideIn 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
            animationDelay: '100ms',
            opacity: 0,
            transform: 'translateY(10px)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="mb-7">
          <h2 
            className="text-2xl font-bold text-white mb-2" 
            style={{ 
              animation: 'modalElementSlideIn 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
              animationDelay: '150ms',
              opacity: 0,
              transform: 'translateY(10px)',
            }}
          >
            Select Equipment
          </h2>
          <p 
            className="text-sm text-white/60 leading-relaxed" 
            style={{ 
              animation: 'modalElementSlideIn 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
              animationDelay: '200ms',
              opacity: 0,
              transform: 'translateY(10px)',
            }}
          >
            If the device can't read the NFC tag, manually select your equipment below.
          </p>
        </div>

        <div className="space-y-3">
          {equipmentOptions.map((equipment, idx) => {
            const colors = getEquipmentColors(equipment.type);
            return (
              <button
                key={equipment.type}
                onClick={() => handleSelect(equipment.type)}
                className={`w-full p-4 rounded-[20px] transition-all duration-200 active:scale-[0.98] flex items-center gap-4 ${colors.outerBg} border ${colors.outerBorder} hover:brightness-110`}
                style={{
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                  animation: 'modalElementSlideIn 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  animationDelay: `${280 + idx * 100}ms`,
                  opacity: 0,
                  transform: 'translateY(15px)',
                }}
              >
                <div className={`flex h-16 w-16 items-center justify-center rounded-[16px] p-2 ${colors.innerBg} border ${colors.innerBorder} shadow-inner`}>
                  <EquipmentIcon type={equipment.type} className="w-16 h-15" />
                </div>
                <div className="text-left flex-1">
                  <div className="text-white font-semibold text-lg tracking-tight">{equipment.type}</div>
                </div>
                <svg 
                  className="w-5 h-5 opacity-40" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
