export default function EquipmentIcon({ type, className = 'w-17 h-16' }) {
  const normalized = String(type || '').trim();
  
  let imagePath;
  let defaultClass = className;
  
  switch (normalized) {
    case 'Dumbbell':
    case 'Dumbell':
      imagePath = '/images/equipment-icon/Dumbbell.png';
      break;
    case 'Barbell':
      imagePath = '/images/equipment-icon/Barbell.png';
      break;
    case 'Weight Stack':
      imagePath = '/images/equipment-icon/Weight_stack.png';
      break;
    default:
      imagePath = '/images/equipment-icon/Barbell.png';
  }
  
  return (
    <img 
      src={imagePath} 
      alt={`${type} icon`} 
      className={defaultClass}
    />
  );
}
