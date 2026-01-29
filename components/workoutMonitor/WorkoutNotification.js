import { useEffect, useState } from 'react';

export default function WorkoutNotification({ notification, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        if (onDismiss) {
          setTimeout(onDismiss, 300); // Wait for fade out
        }
      }, notification.duration || 3000);
      
      return () => clearTimeout(timer);
    }
  }, [notification, onDismiss]);

  if (!notification) return null;

  const backgrounds = {
    rep: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    nfc: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
  };

  const icons = {
    rep: '🎯',
    nfc: '📱',
    success: '✅',
    error: '❌',
    info: 'ℹ️'
  };

  return (
    <div
      className={`fixed top-20 right-4 z-50 px-6 py-3 rounded-lg text-white font-bold text-lg shadow-lg transform transition-all duration-300 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
      style={{
        background: backgrounds[notification.type] || backgrounds.info
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icons[notification.type] || icons.info}</span>
        <span>{notification.message}</span>
      </div>
    </div>
  );
}
