export default function InstructionModal({ isOpen, onClose }) {
  if (!isOpen) return null;

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
        className="relative max-w-md w-full p-8 rounded-3xl max-h-[85vh] overflow-y-auto"
        style={{
          background: 'linear-gradient(145deg, rgba(30, 30, 40, 0.95), rgba(20, 20, 30, 0.98))',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-white mb-2">How to Use AppLift</h2>
        <p className="text-white/70 mb-6 text-sm">Follow these steps to get started</p>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                1
              </div>
              <h3 className="text-lg font-semibold text-white">Connect Your Device</h3>
            </div>
            <p className="text-white/70 text-sm ml-11">
              Click on the connection pill at the top, then tap "Scan Devices" to find your AppLift_IMU device. 
              Select it from the list to establish a Bluetooth connection.
            </p>
          </div>

          {/* Step 2 */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                2
              </div>
              <h3 className="text-lg font-semibold text-white">Scan Equipment</h3>
            </div>
            <p className="text-white/70 text-sm ml-11">
              Once connected, use your AppLift device to scan the NFC tag on your gym equipment 
              (Barbell, Dumbell, or Weight Stack). The equipment will be detected automatically.
            </p>
          </div>

          {/* Step 3 */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                3
              </div>
              <h3 className="text-lg font-semibold text-white">Choose Your Workout</h3>
            </div>
            <p className="text-white/70 text-sm ml-11">
              After scanning, a carousel of available exercises for that equipment will appear. 
              Swipe through and select the workout you want to perform.
            </p>
          </div>

          {/* Alternative */}
          <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
              <span>💡</span> Manual Entry
            </h3>
            <p className="text-white/70 text-sm">
              Don't have your device? Click "Enter manually" to select equipment without scanning. 
              This is useful for quick workouts when your AppLift device is not available.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
