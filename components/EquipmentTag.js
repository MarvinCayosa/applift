import EquipmentIcon from './EquipmentIcon'

// Compact equipment badge for workout tags. Supports Dumbbell, Barbell, Weight Stack.
export default function EquipmentTag({ equipment }) {
  const getEquipmentColor = (type) => {
    const map = {
      Barbell: '#FBBF24', // Yellow
      Dumbbell: '#3B82F6', // Blue
      Dumbbell: '#3B82F6', // Blue (alternate spelling)
      'Weight Stack': '#EF4444', // Red
    }
    return map[type] || '#7c3aed'
  }

  return (
    <div
      className="w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-xl text-white"
      style={{ backgroundColor: getEquipmentColor(equipment) }}
    >
      <EquipmentIcon type={equipment} className="w-6 h-6" />
    </div>
  )
}
