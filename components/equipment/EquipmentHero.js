import { useRouter } from 'next/router'

/**
 * Hero header with a full-bleed background image, back button,
 * equipment name, and "Statistics" subtitle.
 */
export default function EquipmentHero({ label, heroImage }) {
  const router = useRouter()

  return (
    <div className="relative w-full h-56 overflow-hidden">
      {/* Background image */}
      <img
        src={heroImage}
        alt={label}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black" />

      {/* Top row: back button + title aligned */}
      <div className="absolute top-4 left-4 right-4 flex items-center z-10">
        <button
          onClick={() => router.back()}
          className="p-2"
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 text-center pt-2 pr-9">
          <h1 className="text-2xl font-bold text-white">{label}</h1>
          <p className="text-xs text-white/60">Statistics</p>
        </div>
      </div>
    </div>
  )
}
