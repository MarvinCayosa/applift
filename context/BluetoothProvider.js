import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BluetoothContext = createContext(null);

const BLE_SERVICE_UUIDS = [
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '4fafc201-1fb5-459e-8fcc-c5c9c331914b', // AppLift IMU service
  '0000180f-0000-1000-8000-00805f9b34fb', // Standard Battery Service
];

const IMU_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const IMU_CHARACTERISTIC_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// Filter out nameless/unknown devices
const isValidDevice = (device) => {
  if (!device) return false;
  const name = device.name || '';
  return name.trim().length > 0 && !name.toLowerCase().includes('unknown');
};

export function BluetoothProvider({ children }) {
  const [availability, setAvailability] = useState(true);
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState(null);
  const deviceRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [devicesFound, setDevicesFound] = useState([]);
  const [pairMessage, setPairMessage] = useState(null);
  const [batteryPercent, setBatteryPercent] = useState(null);
  const batteryCharRef = useRef(null);
  const batteryListenerRef = useRef(null);
  const stdBatteryCharRef = useRef(null);
  const stdBatteryListenerRef = useRef(null);

  // Try standard BLE Battery Service (0x180F) first, then fall back to IMU byte 58
  const startBatteryListener = useCallback(async (server) => {
    // Method 1: Standard BLE Battery Service
    try {
      const batteryService = await server.getPrimaryService('battery_service');
      const batteryChar = await batteryService.getCharacteristic('battery_level');
      // Read initial value
      const initialValue = await batteryChar.readValue();
      if (initialValue.byteLength >= 1) {
        setBatteryPercent(initialValue.getUint8(0));
        console.log('Battery (standard service):', initialValue.getUint8(0) + '%');
      }
      // Subscribe to updates
      await batteryChar.startNotifications();
      const onBatteryUpdate = (event) => {
        try {
          const val = event.target.value;
          if (val.byteLength >= 1) setBatteryPercent(val.getUint8(0));
        } catch (_) {}
      };
      batteryChar.addEventListener('characteristicvaluechanged', onBatteryUpdate);
      stdBatteryCharRef.current = batteryChar;
      stdBatteryListenerRef.current = onBatteryUpdate;
      console.log('✅ Battery listener started (standard BLE Battery Service)');
      // Still also listen on IMU packets as supplementary
    } catch (e) {
      console.log('Standard Battery Service not available:', e.message);
    }

    // Method 2: IMU packet byte 58 (always try as fallback / supplement)
    try {
      const imuService = await server.getPrimaryService(IMU_SERVICE_UUID);
      const imuChar = await imuService.getCharacteristic(IMU_CHARACTERISTIC_UUID);
      
      const onPacket = (event) => {
        try {
          const value = event.target.value;
          if (value.byteLength >= 59) {
            setBatteryPercent(value.getUint8(58));
          }
        } catch (_) {}
      };
      
      await imuChar.startNotifications();
      imuChar.addEventListener('characteristicvaluechanged', onPacket);
      batteryCharRef.current = imuChar;
      batteryListenerRef.current = onPacket;
      console.log('✅ Battery listener started (IMU byte 58, packet size monitored)');
    } catch (e) {
      console.log('Could not start IMU battery listener:', e.message);
    }
  }, []);

  const stopBatteryListener = useCallback(() => {
    if (batteryCharRef.current && batteryListenerRef.current) {
      try {
        batteryCharRef.current.removeEventListener('characteristicvaluechanged', batteryListenerRef.current);
        batteryCharRef.current.stopNotifications();
      } catch (_) {}
    }
    batteryCharRef.current = null;
    batteryListenerRef.current = null;
    if (stdBatteryCharRef.current && stdBatteryListenerRef.current) {
      try {
        stdBatteryCharRef.current.removeEventListener('characteristicvaluechanged', stdBatteryListenerRef.current);
        stdBatteryCharRef.current.stopNotifications();
      } catch (_) {}
    }
    stdBatteryCharRef.current = null;
    stdBatteryListenerRef.current = null;
  }, []);

  // Track availability changes
  useEffect(() => {
    if (!(typeof window !== 'undefined' && navigator.bluetooth && navigator.bluetooth.getAvailability)) return;
    let mounted = true;
    navigator.bluetooth.getAvailability().then((available) => {
      if (mounted) setAvailability(Boolean(available));
    }).catch(() => setAvailability(false));

    const onAvailabilityChanged = (event) => {
      setAvailability(Boolean(event.value ?? event.available));
    };

    try {
      navigator.bluetooth.addEventListener('availabilitychanged', onAvailabilityChanged);
    } catch (e) {
      try { navigator.bluetooth.onavailabilitychanged = onAvailabilityChanged; } catch (_) {}
    }

    return () => {
      mounted = false;
      try { navigator.bluetooth.removeEventListener('availabilitychanged', onAvailabilityChanged); } catch (_) {}
      try { navigator.bluetooth.onavailabilitychanged = null; } catch (_) {}
    };
  }, []);

  // Load paired devices on mount
  // Track availability changes
  useEffect(() => {
    if (!(typeof window !== 'undefined' && navigator.bluetooth && navigator.bluetooth.getAvailability)) return;
    let mounted = true;
    navigator.bluetooth.getAvailability().then((available) => {
      if (mounted) setAvailability(Boolean(available));
    }).catch(() => setAvailability(false));

    const onAvailabilityChanged = (event) => {
      setAvailability(Boolean(event.value ?? event.available));
    };

    try {
      navigator.bluetooth.addEventListener('availabilitychanged', onAvailabilityChanged);
    } catch (e) {
      try { navigator.bluetooth.onavailabilitychanged = onAvailabilityChanged; } catch (_) {}
    }

    return () => {
      mounted = false;
      try { navigator.bluetooth.removeEventListener('availabilitychanged', onAvailabilityChanged); } catch (_) {}
      try { navigator.bluetooth.onavailabilitychanged = null; } catch (_) {}
    };
  }, []);

  const scanDevices = async () => {
    if (!navigator.bluetooth) {
      setAvailability(false);
      return;
    }
    if (!availability) {
      alert('Bluetooth appears to be off on this device. Please enable Bluetooth and try scanning again.');
      return;
    }
    setScanning(true);
    setDevicesFound([]);
    setError(null);

    try {
      // Request AppLift_IMU device specifically
      const tempDevice = await navigator.bluetooth.requestDevice({ 
        filters: [{ name: 'AppLift_IMU' }],
        optionalServices: BLE_SERVICE_UUIDS 
      });
      if (tempDevice && isValidDevice(tempDevice)) {
        setDevicesFound((prev) => {
          const exists = prev.some((d) => d.id === tempDevice.id);
          return exists ? prev : [tempDevice, ...prev];
        });
      } else if (tempDevice && !isValidDevice(tempDevice)) {
        setError('Device has no name or is unknown. Please select a device with a valid name.');
      }
    } catch (err) {
      setError(err.message);
      if (err.name === 'NotAllowedError') setPermissionGranted(false);
    } finally {
      setScanning(false);
    }
  };

  const connectToDevice = async (selectedDevice) => {
    if (!selectedDevice) return;
    try {
      setError(null);
      setPermissionGranted(true);
      setConnecting(true);
      setConnectingDeviceId(selectedDevice.id ?? null);

      if (selectedDevice.gatt && typeof selectedDevice.gatt.connect === 'function') {
        const server = await selectedDevice.gatt.connect();
        const handleDisconnectEvent = () => {
          stopBatteryListener();
          setConnected(false);
          setDevice(null);
          setBatteryPercent(null);
          deviceRef.current = null;
          try { window.localStorage.removeItem('bleDevice'); } catch (_) {}
        };
        selectedDevice.addEventListener('gattserverdisconnected', handleDisconnectEvent);
        if (server && server.connected) {
          setDevice(selectedDevice);
          deviceRef.current = selectedDevice;
          setConnected(true);
          try {
            const safe = { id: selectedDevice.id, name: selectedDevice.name };
            window.localStorage.setItem('bleDevice', JSON.stringify(safe));
          } catch (_) {}
          try {
            const name = selectedDevice.name ?? selectedDevice.id ?? 'device';
            setPairMessage(`Paired with ${name}`);
            setTimeout(() => setPairMessage(null), 4000);
          } catch (_) {}
          (async () => {
            for (const svcUuid of BLE_SERVICE_UUIDS) {
              try {
                const svc = await server.getPrimaryService(svcUuid);
                if (svc) {
                  console.log('Found BLE service on device:', svcUuid);
                  break;
                }
              } catch (e) {}
            }
            // Start persistent battery listener on IMU characteristic
            await startBatteryListener(server);
          })();
        } else {
          setConnected(false);
        }
      } else {
        setDevice(selectedDevice);
        setConnected(true);
        try {
          const safe = { id: selectedDevice.id, name: selectedDevice.name };
          window.localStorage.setItem('bleDevice', JSON.stringify(safe));
        } catch (_) {}
        try {
          const name = selectedDevice.name ?? selectedDevice.id ?? 'device';
          setPairMessage(`Paired with ${name}`);
          setTimeout(() => setPairMessage(null), 4000);
        } catch (_) {}
      }
    } catch (err) {
      setError(err.message ?? String(err));
      setConnected(false);
    } finally {
      setConnecting(false);
      setConnectingDeviceId(null);
    }
  };

  const disconnect = () => {
    stopBatteryListener();
    const currentDevice = deviceRef.current || device;
    if (currentDevice) {
      try {
        if (currentDevice.gatt && currentDevice.gatt.connected) {
          currentDevice.gatt.disconnect();
        }
      } catch (e) {
        console.error('Disconnect error:', e);
      }
    }
    deviceRef.current = null;
    setDevice(null);
    setConnected(false);
    setBatteryPercent(null);
    setDevicesFound((prev) => prev.filter((d) => d.id !== currentDevice?.id));
    try { window.localStorage.removeItem('bleDevice'); } catch (_) {}
  };

  // Restore connection on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('bleDevice');
    if (stored && !connected && !device) {
      try {
        const saved = JSON.parse(stored);
        if (navigator.bluetooth && navigator.bluetooth.getDevices) {
          navigator.bluetooth.getDevices().then((knownDevices) => {
            const found = knownDevices.find((d) => d.id === saved.id);
            if (found) {
              connectToDevice(found);
            } else {
              window.localStorage.removeItem('bleDevice');
            }
          }).catch(() => {
            window.localStorage.removeItem('bleDevice');
          });
        }
      } catch (e) {
        window.localStorage.removeItem('bleDevice');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({
    availability,
    permissionGranted,
    connecting,
    connectingDeviceId,
    connected,
    device,
    devicesFound,
    error,
    scanning,
    pairMessage,
    batteryPercent,
    scanDevices,
    connectToDevice,
    disconnect,
    setPairMessage,
    setBatteryPercent,
  }), [availability, permissionGranted, connecting, connectingDeviceId, connected, device, devicesFound, error, scanning, pairMessage, batteryPercent]);

  return (
    <BluetoothContext.Provider value={value}>
      {children}
    </BluetoothContext.Provider>
  );
}

export function useBluetooth() {
  const ctx = useContext(BluetoothContext);
  if (!ctx) throw new Error('useBluetooth must be used within BluetoothProvider');
  return ctx;
}
