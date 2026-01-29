import { useCallback, useEffect, useRef, useState } from 'react';
import { useBluetooth } from '../context/BluetoothProvider';
import { KalmanFilter } from '../utils/KalmanFilter';

const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const CHARACTERISTIC_UUID_IMU = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const CHARACTERISTIC_UUID_NFC = 'ceb5483e-36e1-4688-b7f5-ea07361b26a8';

export function useIMUData(onIMUData, onNFCData) {
  const { device, connected } = useBluetooth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState(null);
  const characteristicRef = useRef(null);
  const nfcCharacteristicRef = useRef(null);
  
  // Kalman filters for smoothing
  const kalmanFiltersRef = useRef({
    x: new KalmanFilter(0.01, 0.5, 1, 0),
    y: new KalmanFilter(0.01, 0.5, 1, 0),
    z: new KalmanFilter(0.01, 0.5, 1, 9.81)
  });

  const handleIMUData = useCallback((event) => {
    try {
      const value = event.target.value;
      const dataView = new DataView(value.buffer);
      
      // Parse IMU data (40 bytes)
      const imuData = {
        accelX: dataView.getFloat32(0, true),
        accelY: dataView.getFloat32(4, true),
        accelZ: dataView.getFloat32(8, true),
        gyroX: dataView.getFloat32(12, true),
        gyroY: dataView.getFloat32(16, true),
        gyroZ: dataView.getFloat32(20, true),
        roll: dataView.getFloat32(24, true),
        pitch: dataView.getFloat32(28, true),
        yaw: dataView.getFloat32(32, true),
        timestamp: dataView.getUint32(36, true)
      };
      
      // Calculate raw magnitude
      const rawMagnitude = Math.sqrt(
        imuData.accelX * imuData.accelX +
        imuData.accelY * imuData.accelY +
        imuData.accelZ * imuData.accelZ
      );
      
      // Apply Kalman filtering
      const filters = kalmanFiltersRef.current;
      const filteredX = filters.x.update(imuData.accelX);
      const filteredY = filters.y.update(imuData.accelY);
      const filteredZ = filters.z.update(imuData.accelZ);
      
      // Calculate filtered magnitude
      const filteredMagnitude = Math.sqrt(
        filteredX * filteredX +
        filteredY * filteredY +
        filteredZ * filteredZ
      );
      
      // Pass to callback with both raw and filtered data
      if (onIMUData) {
        onIMUData({
          ...imuData,
          rawMagnitude,
          filteredX,
          filteredY,
          filteredZ,
          filteredMagnitude
        });
      }
    } catch (err) {
      console.error('Error parsing IMU data:', err);
      setError(err.message);
    }
  }, [onIMUData]);

  const handleNFCData = useCallback((event) => {
    try {
      const value = event.target.value;
      const dataView = new DataView(value.buffer);
      
      // First byte is the length
      const length = dataView.getUint8(0);
      
      // Extract equipment name
      let equipmentName = '';
      for (let i = 1; i <= length && i < value.byteLength; i++) {
        equipmentName += String.fromCharCode(dataView.getUint8(i));
      }
      
      if (onNFCData) {
        onNFCData(equipmentName);
      }
    } catch (err) {
      console.error('Error parsing NFC data:', err);
      setError(err.message);
    }
  }, [onNFCData]);

  useEffect(() => {
    if (!device || !connected || !device.gatt) {
      setIsSubscribed(false);
      return;
    }

    let mounted = true;

    async function subscribeToCharacteristics() {
      try {
        setError(null);
        
        // Get service
        const server = device.gatt;
        if (!server.connected) {
          await server.connect();
        }
        
        const service = await server.getPrimaryService(SERVICE_UUID);
        
        // Subscribe to IMU data
        const imuCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_IMU);
        await imuCharacteristic.startNotifications();
        imuCharacteristic.addEventListener('characteristicvaluechanged', handleIMUData);
        characteristicRef.current = imuCharacteristic;
        
        // Try to subscribe to NFC data (optional)
        try {
          const nfcCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID_NFC);
          await nfcCharacteristic.startNotifications();
          nfcCharacteristic.addEventListener('characteristicvaluechanged', handleNFCData);
          nfcCharacteristicRef.current = nfcCharacteristic;
        } catch (nfcError) {
          console.warn('NFC characteristic not available:', nfcError);
        }
        
        if (mounted) {
          setIsSubscribed(true);
        }
      } catch (err) {
        console.error('Failed to subscribe to characteristics:', err);
        if (mounted) {
          setError(err.message);
          setIsSubscribed(false);
        }
      }
    }

    subscribeToCharacteristics();

    return () => {
      mounted = false;
      
      // Cleanup subscriptions
      if (characteristicRef.current) {
        try {
          characteristicRef.current.removeEventListener('characteristicvaluechanged', handleIMUData);
          characteristicRef.current.stopNotifications();
        } catch (e) {
          console.error('Error cleaning up IMU characteristic:', e);
        }
        characteristicRef.current = null;
      }
      
      if (nfcCharacteristicRef.current) {
        try {
          nfcCharacteristicRef.current.removeEventListener('characteristicvaluechanged', handleNFCData);
          nfcCharacteristicRef.current.stopNotifications();
        } catch (e) {
          console.error('Error cleaning up NFC characteristic:', e);
        }
        nfcCharacteristicRef.current = null;
      }
    };
  }, [device, connected, handleIMUData, handleNFCData]);

  const resetFilters = useCallback(() => {
    kalmanFiltersRef.current.x.reset(0);
    kalmanFiltersRef.current.y.reset(0);
    kalmanFiltersRef.current.z.reset(9.81);
  }, []);

  return {
    isSubscribed,
    error,
    resetFilters
  };
}
