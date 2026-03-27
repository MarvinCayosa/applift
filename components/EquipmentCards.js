import React, { useRef, useState } from 'react'
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
    <Link href={equipment.href} className="flex-shrink-0 block w-[45vw] max-w-[200px] md:w-[30vw] md:max-w-[280px]">
      <div className="relative rounded-2xl overflow-hidden group" style={{ aspectRatio: '3/4' }}>
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
        <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
          <span className="text-white text-2xl font-semibold leading-tight">
            {equipment.name}
          </span>
          <svg
            className="w-5 h-5 text-white/70"
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
 * EquipmentCards - Equipment selector with horizontally scrollable cards
 * Links to individual equipment pages with exercise history and summaries
 */
export default function EquipmentCards() {
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
    scrollRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUp = () => {
    if (!scrollRef.current) return;
    setIsDragging(false);
    scrollRef.current.style.cursor = 'grab';
  };

  const handleMouseLeave = () => {
    if (isDragging && scrollRef.current) {
      setIsDragging(false);
      scrollRef.current.style.cursor = 'grab';
    }
  };

  return (
    <div>
      {/* Section title */}
      <h2 className="text-xl font-bold text-white mb-4">Exercises</h2>
      {/* Cards container - horizontally scrollable */}
      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 cursor-grab"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {equipmentData.map((equipment) => (
          <EquipmentCard key={equipment.id} equipment={equipment} />
        ))}
      </div>
    </div>
  )
}
