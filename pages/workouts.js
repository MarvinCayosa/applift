import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import BottomNav from '../components/BottomNav';
import ConnectPill from '../components/ConnectPill';
import EquipmentIcon from '../components/EquipmentIcon';
import EquipmentSelectionModal from '../components/EquipmentSelectionModal';
import InstructionModal from '../components/InstructionModal';
import { useBluetooth } from '../context/BluetoothProvider';

const exercisesByEquipment = {
  Barbell: [
    {
      title: 'Flat Bench Barbell Press',
      image: '/images/workout-cards/barbell-flat-bench-press.jpg',
    },
    {
      title: 'Front Squats',
      image: '/images/workout-cards/barbell-front-squats.jpg',
    },
  ],
  Dumbell: [
    {
      title: 'Concentration Curls',
      image: '/images/workout-cards/dumbell-concentration-curls.jpg',
    },
    {
      title: 'Single-arm Overhead Extension',
      image: '/images/workout-cards/dumbell-overhead-extension.jpg',
    },
  ],
  'Weight Stack': [
    {
      title: 'Lateral Pulldown',
      image: '/images/workout-cards/weightstack-lateral-pulldown.jpg',
    },
    {
      title: 'Seated Leg Extension',
      image: '/images/workout-cards/weightstack-seated-leg-extension.jpg',
    },
  ],
};

const comingSoonImages = {
  Barbell: '/images/workout-cards/barbell-comingsoon.jpg',
  Dumbell: '/images/workout-cards/dumbell-comingsoon.jpg',
  'Weight Stack': '/images/workout-cards/weightstack-comingsoon.jpg',
};

export default function Workouts() {
  const router = useRouter();
  const {
    connected,
    device,
    connecting,
    scanning,
    error,
    permissionGranted,
    availability,
    devicesFound,
    scanDevices,
    connectToDevice,
    disconnect,
  } = useBluetooth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [scannedEquipment, setScannedEquipment] = useState(null);
  const [workoutCarouselIndex, setWorkoutCarouselIndex] = useState(0);
  const workoutCarouselRef = useRef(null);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showInstructionModal, setShowInstructionModal] = useState(false);
  const [wasConnected, setWasConnected] = useState(false);

  // Get workouts based on scanned equipment
  const workouts = scannedEquipment
    ? scannedEquipment.type === 'Barbell' || scannedEquipment.type === 'Dumbell' || scannedEquipment.type === 'Weight Stack'
      ? [
          ...(exercisesByEquipment[scannedEquipment.type] || []),
          { 
            title: 'Coming Soon', 
            image: comingSoonImages[scannedEquipment.type], 
            isComingSoon: true 
          },
        ]
      : (exercisesByEquipment[scannedEquipment.type] || [])
    : [];

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Load scanned equipment from localStorage on mount only if we're currently connected
    const saved = window.localStorage.getItem('scannedEquipment');
    if (saved && connected) {
      try {
        setScannedEquipment(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load scanned equipment:', e);
      }
    }

    // Clear any stale saved equipment if we're not connected to avoid showing ghost tags
    if (!connected) {
      try {
        window.localStorage.removeItem('scannedEquipment');
      } catch (e) {
        console.error('Failed to clear scanned equipment:', e);
      }
    }
    
    window.__mockScanEquipment = (type = 'Barbell', deviceId = 'MOCK-001') => setScannedEquipment({ type, deviceId });
    window.__clearScanEquipment = () => setScannedEquipment(null);
  }, [connected]);

  // Save scanned equipment to localStorage whenever it changes (only when connected)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (scannedEquipment && connected) {
      try {
        window.localStorage.setItem('scannedEquipment', JSON.stringify(scannedEquipment));
      } catch (e) {
        console.error('Failed to save scanned equipment:', e);
      }
    } else if (!scannedEquipment && connected) {
      // Clear localStorage when equipment is cleared while still connected
      try {
        window.localStorage.removeItem('scannedEquipment');
      } catch (e) {
        console.error('Failed to clear scanned equipment:', e);
      }
    }
  }, [scannedEquipment, connected]);

  // Track connection state changes and only clear equipment when disconnecting
  useEffect(() => {
    if (wasConnected && !connected) {
      // Device was connected but is now disconnected - clear equipment
      setScannedEquipment(null);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('scannedEquipment');
        } catch (e) {
          console.error('Failed to clear scanned equipment:', e);
        }
      }
    }
    setWasConnected(connected);
  }, [connected, wasConnected]);

  // Get colors based on equipment type
  const getEquipmentColors = (equipmentType) => {
    switch (equipmentType) {
      case 'Barbell':
        return {
          outerBg: 'bg-[#b87700]', // dark orange-gold
          outerBorder: 'border-[#e69b00]',
          outerShadow: 'shadow-amber-700/30',
          innerBg: 'bg-[#f0b233]',
          innerBorder: 'border-[#f5c042]',
          innerShadow: 'shadow-amber-500',
          buttonBg: 'bg-[#e69b00]',
          buttonHover: 'hover:bg-[#f0b233]',
        };
      case 'Dumbell':
        return {
          outerBg: 'bg-[#0C4A6E]', // dark blue
          outerBorder: 'border-[#0369A1]',
          outerShadow: 'shadow-blue-900/20',
          innerBg: 'bg-[#3B82F6]',
          innerBorder: 'border-[#60A5FA]',
          innerShadow: 'shadow-blue-600',
          buttonBg: 'bg-[#2563EB]',
          buttonHover: 'hover:bg-[#3B82F6]',
        };
      case 'Weight Stack':
        return {
          outerBg: 'bg-[#7C2D12]', // dark orange
          outerBorder: 'border-[#DC2626]',
          outerShadow: 'shadow-orange-900/20',
          innerBg: 'bg-[#F97316]',
          innerBorder: 'border-[#FB923C]',
          innerShadow: 'shadow-orange-600',
          buttonBg: 'bg-[#EA580C]',
          buttonHover: 'hover:bg-[#F97316]',
        };
      default:
        return {
          outerBg: 'bg-[#5B21B6]',
          outerBorder: 'border-[#7C3AED]',
          outerShadow: 'shadow-purple-900/20',
          innerBg: 'bg-[#7C3AED]',
          innerBorder: 'border-[#8B5CF6]',
          innerShadow: 'shadow-purple-900',
          buttonBg: 'bg-[#6D28D9]',
          buttonHover: 'hover:bg-[#8B5CF6]',
        };
    }
  };

  // Subscribe to NFC equipment detection when BLE device is connected
  useEffect(() => {
    if (!connected || !device) {
      return;
    }

    const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
    const NFC_CHARACTERISTIC_UUID = 'ceb5483e-36e1-4688-b7f5-ea07361b26a8';

    async function subscribeToNFC() {
      try {
        if (!device.gatt || !device.gatt.connected) {
          console.log('Device not connected to GATT');
          return;
        }

        console.log('Getting Service for NFC...');
        const service = await device.gatt.getPrimaryService(SERVICE_UUID);

        // Subscribe to NFC equipment characteristic
        console.log('Getting NFC Characteristic...');
        const nfcCharacteristic = await service.getCharacteristic(NFC_CHARACTERISTIC_UUID);
        await nfcCharacteristic.startNotifications();
        
        nfcCharacteristic.addEventListener('characteristicvaluechanged', handleNFCData);
        
        console.log('✅ Subscribed to NFC equipment detection! Scan an NFC tag to detect equipment.');

      } catch (error) {
        console.error('NFC subscription failed:', error);
        console.log('Device may not support NFC equipment detection');
      }
    }

    function handleNFCData(event) {
      const value = event.target.value;
      const dataView = new DataView(value.buffer);
      
      // First byte is the length
      const length = dataView.getUint8(0);
      
      // Extract equipment name (remaining bytes)
      let equipmentName = '';
      for (let i = 1; i <= length && i < value.byteLength; i++) {
        equipmentName += String.fromCharCode(dataView.getUint8(i));
      }
      
      console.log('📡 NFC Equipment detected:', equipmentName);
      
      // Map equipment name to our format
      const equipmentMap = {
        'Barbell': 'Barbell',
        'Dumbell': 'Dumbell',
        'Dumbbell': 'Dumbell',
        'Weight Stack': 'Weight Stack',
        'WeightStack': 'Weight Stack'
      };
      
      const mappedEquipment = equipmentMap[equipmentName] || equipmentName;
      
      // Update scanned equipment state
      setScannedEquipment({
        type: mappedEquipment,
        deviceId: `NFC-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString()
      });
    }

    subscribeToNFC();

  }, [connected, device]);

  useEffect(() => {
    const carousel = workoutCarouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = 305 + 16; // Updated card width + gap
      const peekAmount = 40;
      const effectiveScroll = scrollLeft - peekAmount;
      const activeIndex = Math.max(0, Math.round(effectiveScroll / cardWidth));
      setWorkoutCarouselIndex(Math.min(activeIndex, workouts.length - 1));
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, [workouts.length]);

  return (
    <div className="relative min-h-screen bg-black text-white pb-24">
      <Head>
        <title>Workouts — AppLift</title>
      </Head>

      <main className="mx-auto w-full max-w-4xl px-3 sm:px-4 md:px-6 pt-6 sm:pt-8 md:pt-10 space-y-4 sm:space-y-5 md:space-y-6">
        {/* Connection status pill */}
        <div className="flex justify-center content-fade-up-1 px-1 sm:px-0">
          <ConnectPill 
            connected={connected}
            device={device}
            onScan={scanDevices}
            onConnect={connectToDevice}
            onDisconnect={disconnect}
            scanning={scanning}
            devicesFound={devicesFound}
            availability={availability}
          />
        </div>

        {/* Scan equipment card */}
        <div className={`flex justify-center ${scannedEquipment ? 'content-fade-up-3' : 'content-fade-up-2'}`} key={scannedEquipment ? scannedEquipment.type : 'no-equipment'}>
          <section
            className={`relative w-full max-w-md rounded-3xl p-3 sm:p-4 space-y-3 transition-colors duration-300 ease-out ${
              scannedEquipment && connected
                ? scannedEquipment.type === 'Barbell' || scannedEquipment.type === 'Dumbell' || scannedEquipment.type === 'Weight Stack'
                  ? `${getEquipmentColors(scannedEquipment.type).outerBg} border ${getEquipmentColors(scannedEquipment.type).outerBorder} shadow-lg ${getEquipmentColors(scannedEquipment.type).outerShadow}`
                  : 'bg-[#3A3A3A] border border-gray-600 shadow-lg shadow-black/40'
                : connected
                ? 'bg-[#5B21B6] border border-[#7C3AED] shadow-lg shadow-purple-900/20'
                : 'bg-[#2A2A2A] border border-gray-600/45 shadow-lg shadow-black/25'
            }`}
          >
            {scannedEquipment ? (
              <div className={`relative rounded-2xl px-4 py-5 flex flex-col gap-4 ${
                scannedEquipment.type === 'Barbell' || scannedEquipment.type === 'Dumbell' || scannedEquipment.type === 'Weight Stack'
                  ? `${getEquipmentColors(scannedEquipment.type).innerBg} border ${getEquipmentColors(scannedEquipment.type).innerBorder}`
                  : 'bg-[#505050] border border-gray-500'
              } min-h-[190px] transition-colors duration-300 ease-out`}>
                {/* X button to clear equipment and choose new one */}
                <button 
                  onClick={() => setScannedEquipment(null)}
                  className="absolute top-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-white/90 hover:bg-white/30 transition-colors"
                  aria-label="Clear equipment"
                >
                  ✕
                </button>

                <div className="flex items-start justify-between text-sm text-white/85 font-medium pr-8">
                  <span>Scan Equipment</span>
                </div>
                {scannedEquipment.type === 'Barbell' || scannedEquipment.type === 'Dumbell' || scannedEquipment.type === 'Weight Stack' ? (
                  <div className="flex items-center gap-5">
                    <div className={`flex h-24 w-36 items-center justify-center rounded-2xl p-4 ${getEquipmentColors(scannedEquipment.type).outerBg} border ${getEquipmentColors(scannedEquipment.type).outerBorder} shadow-lg ${getEquipmentColors(scannedEquipment.type).innerShadow}`}>
                      <EquipmentIcon type={scannedEquipment.type} />
                    </div>
                    <div className="flex-1 flex flex-col gap-2 justify-center">
                      <span className="text-xs text-white/80">Equipment Type</span>
                      <span className="text-3xl font-semibold tracking-tight text-white">{scannedEquipment.type}</span>
                      {scannedEquipment.deviceId && (
                        <span className="text-[11px] text-white/80">Device ID: {scannedEquipment.deviceId}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 py-4">
                    <div className="flex h-24 w-36 items-center justify-center rounded-2xl p-4">
                      <img src="/images/icons/invalid-tag.png" alt="Invalid Tag" className="w-16 h-16" />
                    </div>
                    <div className="text-center space-y-2">
                      <span className="text-2xl font-semibold text-white">Invalid Tag</span>
                      <p className="text-sm text-white/70">Please try again</p>
                      <button
                        onClick={() => setShowEquipmentModal(true)}
                        className="mt-2 px-6 py-2.5 rounded-full font-medium text-sm transition-all duration-300 bg-[#7C3AED] hover:bg-[#8B5CF6] text-white shadow-lg shadow-purple-900/30"
                      >
                        Enter manually
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div 
                className="relative rounded-2xl px-4 py-8 flex flex-col gap-4 bg-white/5 border border-white/10 min-h-[190px] items-center justify-center overflow-hidden"
                style={{
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                {/* Info button in inner container for disconnected state */}
                <button 
                  onClick={() => setShowInstructionModal(true)}
                  className={`absolute top-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                    connected
                      ? 'bg-[#7C3AED] text-white/90 hover:bg-[#8B5CF6]'
                      : 'bg-gray-700/80 text-white/60 hover:bg-gray-600'
                  }`}
                  aria-label="Instructions"
                >
                  ℹ
                </button>

                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <img
                      src="/images/device-icon/Applift_Device_White.png"
                      alt="AppLift Device"
                      className="w-12 h-12"
                    />
                  </div>
                  <p className="text-base text-white/70 font-medium">
                    {connected ? 'Scan equipment to start!' : 'Connect to your device'}
                  </p>
                </div>
              </div>
            )}

            {scannedEquipment && (scannedEquipment.type === 'Barbell' || scannedEquipment.type === 'Dumbell' || scannedEquipment.type === 'Weight Stack') && (
              <div className="text-center text-xs text-purple-100 font-medium tracking-wide">
                Equipment Scanned Successfully ✪
              </div>
            )}
          </section>
        </div>

        {/* Workout carousel */}
        {scannedEquipment && (
          <section className="pt-2 sm:pt-4 pb-8 sm:pb-12 space-y-4 sm:space-y-6">
            <h2 className="text-center text-xs sm:text-sm font-semibold text-white/80 px-4 content-fade-up-3" style={{ animationDelay: '0.15s' }}>Choose Your Workout</h2>

          {/* Mobile Carousel - centered with peek */}
          <div 
            ref={workoutCarouselRef}
            className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-center scrollbar-hide scroll-smooth content-fade-up-3 md:hidden"
            style={{
              paddingLeft: 'calc(50% - 140px)',
              paddingRight: 'calc(50% - 140px)',
              animationDelay: '0.3s'
            }}
          >
            {workouts.map((workout, idx) => (
              <article
                key={workout.title + idx}
                className="min-w-[280px] max-w-[280px] sm:min-w-[305px] sm:max-w-[305px] shrink-0 snap-center rounded-2xl sm:rounded-3xl overflow-hidden group relative h-72 sm:h-80 transition-all duration-300 cursor-pointer hover:scale-105"
                style={{
                  boxShadow: '0 12px 24px rgba(0, 0, 0, 0.3)',
                }}
                onClick={() => {
                  if (!workout.isComingSoon) {
                    router.push(
                      `/selectedWorkout?equipment=${encodeURIComponent(
                        scannedEquipment.type
                      )}&workout=${encodeURIComponent(workout.title)}`
                    );
                  }
                }}
              >
                {workout.isComingSoon ? (
                  <>
                    {/* Coming Soon Card - Blurred background image */}
                    <img
                      src={workout.image}
                      alt="Coming Soon"
                      className="w-full h-full object-cover blur-md scale-110"
                    />
                    {/* Darker overlay to deepen blur */}
                    <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-black/35 mix-blend-multiply" />
                    {/* Global gradient overlay from bottom */}
                    <div
                      className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none"
                      style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)',
                      }}
                    />
                    {/* Black gradient from bottom covering text */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 rounded-b-3xl pointer-events-none"
                      style={{
                        height: '45%',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                      }}
                    />
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl sm:text-2xl font-semibold text-white/90">Coming Soon</span>
                      <span className="text-xs sm:text-sm text-white/60 mt-1 sm:mt-2">More exercises on the way</span>
                    </div>
                  </>
                ) : (
                  <>
                    <img
                      src={workout.image}
                      alt={workout.title}
                      className="w-full h-full object-cover"
                    />
                    {/* Global gradient overlay from bottom */}
                    <div
                      className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none"
                      style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)',
                      }}
                    />
                    {/* Black gradient from bottom covering text */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 rounded-b-2xl sm:rounded-b-3xl pointer-events-none"
                      style={{
                        height: '45%',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                      }}
                    />
                    
                    {/* Content overlay - only title */}
                    <div className="absolute inset-0 flex items-end p-3 sm:p-4">
                      <h3 className="text-lg sm:text-xl font-semibold text-white">{workout.title}</h3>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>

          {/* Tablet/Desktop Grid - 2 cards on tablet, 3 cards on desktop */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 content-fade-up-3 px-4" style={{ animationDelay: '0.3s' }}>
            {workouts.map((workout, idx) => (
              <article
                key={workout.title + idx}
                className="rounded-2xl sm:rounded-3xl overflow-hidden group relative h-72 sm:h-80 transition-all duration-300 cursor-pointer hover:scale-105"
                style={{
                  boxShadow: '0 12px 24px rgba(0, 0, 0, 0.3)',
                }}
                onClick={() => {
                  if (!workout.isComingSoon) {
                    router.push(
                      `/selectedWorkout?equipment=${encodeURIComponent(
                        scannedEquipment.type
                      )}&workout=${encodeURIComponent(workout.title)}`
                    );
                  }
                }}
              >
                {workout.isComingSoon ? (
                  <>
                    <img
                      src={workout.image}
                      alt="Coming Soon"
                      className="w-full h-full object-cover blur-md scale-110"
                    />
                    <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-black/35 mix-blend-multiply" />
                    <div
                      className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none"
                      style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)',
                      }}
                    />
                    <div 
                      className="absolute bottom-0 left-0 right-0 rounded-b-2xl sm:rounded-b-3xl pointer-events-none"
                      style={{
                        height: '45%',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                      }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl sm:text-2xl font-semibold text-white/90">Coming Soon</span>
                      <span className="text-xs sm:text-sm text-white/60 mt-1 sm:mt-2">More exercises on the way</span>
                    </div>
                  </>
                ) : (
                  <>
                    <img
                      src={workout.image}
                      alt={workout.title}
                      className="w-full h-full object-cover"
                    />
                    <div
                      className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none"
                      style={{
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)',
                      }}
                    />
                    <div 
                      className="absolute bottom-0 left-0 right-0 rounded-b-2xl sm:rounded-b-3xl pointer-events-none"
                      style={{
                        height: '45%',
                        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                      }}
                    />
                    <div className="absolute inset-0 flex items-end p-3 sm:p-4">
                      <h3 className="text-lg sm:text-xl font-semibold text-white">{workout.title}</h3>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>

          {/* Dots - Mobile only (hidden when all cards visible) */}
          <div className="flex justify-center gap-2 sm:gap-2.5 px-4 md:hidden">
            {workouts.map((_, idx) => (
              <span
                key={idx}
                className={`${idx === workoutCarouselIndex ? 'bg-white h-2 w-8' : 'bg-white/30 h-2 w-2 hover:bg-white/50'} rounded-full transition-all duration-300`}
              />
            ))}
          </div>
        </section>
        )}
      </main>

      {/* Modals */}
      <EquipmentSelectionModal 
        isOpen={showEquipmentModal}
        onClose={() => setShowEquipmentModal(false)}
        onSelect={setScannedEquipment}
        connected={connected}
      />

      <InstructionModal 
        isOpen={showInstructionModal}
        onClose={() => setShowInstructionModal(false)}
      />

      {/* Existing bottom nav */}
      <BottomNav />

    </div>
  );
}
