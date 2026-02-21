import Link from 'next/link'

/**
 * Grid of exercise image cards at the bottom of the equipment page.
 * Each card links to the exercise detail page.
 */
export default function ExerciseImageCards({ exercises, equipmentSlug, equipmentIcon }) {
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-white">Exercises</h2>
        {equipmentIcon && (
          <img 
            src={equipmentIcon} 
            alt="" 
            className="w-5 h-5" 
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {exercises.map((ex) => (
          <Link
            key={ex.key}
            href={`/equipment/${equipmentSlug}/${ex.key}`}
            className="block"
          >
            <div className="relative rounded-2xl overflow-hidden h-[240px] group">
              <img
                src={ex.image}
                alt={ex.name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
                <span className="text-white text-base font-semibold leading-tight">
                  {ex.name}
                </span>
                <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
