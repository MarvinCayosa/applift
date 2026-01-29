import { useEffect, useState, useRef } from 'react';

export default function useBluetooth() {
  const [availability, setAvailability] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [device, setDevice] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'scanning' | 'connecting' | 'connected'
  const [error, setError] = useState(null);
  const deviceRef = useRef(null);
  const BLE_SERVICE_UUIDS = [
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
  ];

  // Check Bluetooth availability
  useEffect(() => {
    if (!navigator.bluetooth) {
      setAvailability(false);
      return;
    }

    navigator.bluetooth.getAvailability().then(av => setAvailability(av)).catch(() => setAvailability(false));

    const handleAvailability = (evt) => setAvailability(evt.value);
    try {
      navigator.bluetooth.addEventListener('availabilitychanged', handleAvailability);
      return () => navigator.bluetooth.removeEventListener('availabilitychanged', handleAvailability);
    } catch {}
  }, []);

  // Handle disconnect
  useEffect(() => {
    if (!deviceRef.current) return;
    const dev = deviceRef.current;
    const onDisconnected = () => {
      setStatus('idle');
    };
    dev.addEventListener('gattserverdisconnected', onDisconnected);
    return () => dev.removeEventListener('gattserverdisconnected', onDisconnected);
  }, [deviceRef.current]);

  // Scan & Connect to device
  async function connect() {
    if (!navigator.bluetooth) {
      setError('Web Bluetooth not supported.');
      return;
    }
    if (!availability) {
      setError('Bluetooth is off or unavailable.');
      return;
    }

    setStatus('scanning');
    setError(null);
    try {
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICE_UUIDS });
      setDevice({ name: dev.name || 'Unknown', id: dev.id });
      deviceRef.current = dev;
      setPermissionGranted(true);
      setStatus('connecting');

      if (dev.gatt) {
        const server = await dev.gatt.connect();
        // attempt to discover a common BLE service (NUS / FFE0)
        try {
          for (const s of BLE_SERVICE_UUIDS) {
            try {
              const svc = await server.getPrimaryService(s);
              if (svc) {
                console.log('Found BLE service', s);
                break;
              }
            } catch (e) {}
          }
        } catch (e) {}
        setStatus(server && server.connected ? 'connected' : 'idle');
      } else {
        setStatus('idle');
      }

      dev.addEventListener('gattserverdisconnected', () => {
        setStatus('idle');
      });
    } catch (err) {
      setError(err?.message || String(err));
      setStatus('idle');
    }
  }

  // Disconnect
  async function disconnect() {
    setError(null);
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
      setStatus('idle');
    }
  }

  return {
    availability,
    permissionGranted,
    device,
    status,
    error,
    connect,
    disconnect,
  };
}
