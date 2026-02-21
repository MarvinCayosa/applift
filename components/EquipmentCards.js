import React from 'react'
import Link from 'next/link'

/**
 * Equipment data with images and routes
 * Using local workout card images
 */
const equipmentData = [
  {
    id: 'barbell',
    name: 'Barbell',
    image: '/images/workout-cards/barbell.webp',
    href: '/equipment/barbell',
  },
  {
    id: 'dumbbell',
    name: 'Dumbbell',
    image: '/images/workout-cards/dumbbell.png',
    href: '/equipment/dumbbell',
  },
  {
    id: 'weight-stack',
    name: 'Weight Stack',
    image: '/images/workout-cards/lat-pulldown.webp',
    href: '/equipment/weight-stack',
  },
]

/**
 * Single equipment card component
 */
function EquipmentCard({ equipment }) {
  return (
    <Link href={equipment.href} className="flex-1 block">
      <div className="relative h-[160px] rounded-2xl overflow-hidden group">
        {/* Background image */}
        <img
          src={equipment.image}
          alt={equipment.name}
          className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
            equipment.id === 'dumbbell' ? 'scale-[2.2]' : ''
          }`}
          style={equipment.id === 'dumbbell' ? { 
            transform: 'scale(2.2) translateX(15px) translateY(15px)',
            objectPosition: 'center'
          } : {}}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
          <span className="text-white text-sm font-semibold leading-tight">
            {equipment.name}
          </span>
          <svg
            className="w-4 h-4 text-white/70"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  )
}

/**
 * EquipmentCards - Equipment selector that fits all cards on one screen
 * Links to individual equipment pages with exercise history and summaries
 */
export default function EquipmentCards() {
  return (
    <div>
      {/* Section title */}
      <h2 className="text-xl font-bold text-white mb-4">Exercises</h2>
      {/* Cards container - fits all cards in one row */}
      <div className="flex gap-3">
        {equipmentData.map((equipment) => (
          <EquipmentCard key={equipment.id} equipment={equipment} />
        ))}
      </div>
    </div>
  )
}
