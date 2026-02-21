import { memo } from 'react'

/*───────────────────────────────────────────────────────────────────*
 *  ExerciseHeader
 *
 *  Compact hero block with:
 *    • background exercise image + gradient
 *    • centred back-button + title row
 *    • Statistics / History tab bar at bottom edge
 *───────────────────────────────────────────────────────────────────*/

const ExerciseHeader = memo(({
  title,
  image,
  activeTab,
  onTabChange,
  accentColor,
  onBack,
}) => (
  <div className="relative w-full h-56 overflow-hidden">
    {/* Background image */}
    <img
      src={image}
      alt={title}
      className="absolute inset-0 w-full h-full object-cover"
    />

    {/* Gradient overlay – black top for status-bar, fade to black at bottom */}
    <div
      className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black"
      style={{ bottom: '-5px' }}
    />

    {/* ── Top row: back + title ── */}
    <div className="absolute top-4 left-4 right-4 flex items-center z-10">
      <button
        onClick={onBack}
        className="pt-5 w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-transform"
        aria-label="Go back"
      >
        <svg
          className="w-6 h-6 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      <div className="flex-1 text-center pt-5 pr-9">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
      </div>
    </div>

    {/* ── Tab bar ── */}
    <div className="absolute left-0 right-0 z-10 flex justify-center gap-8" style={{marginTop:"90px"}}>
      {['statistics', 'history'].map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className="relative pb-1.5 text-sm font-semibold capitalize transition-colors active:scale-95"
          style={{ color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.5)' }}
        >
          {tab === 'statistics' ? 'Statistics' : 'History'}
          {activeTab === tab && (
            <span
              className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full transition-all duration-300"
              style={{ backgroundColor: accentColor }}
            />
          )}
        </button>
      ))}
    </div>
  </div>
))

ExerciseHeader.displayName = 'ExerciseHeader'
export default ExerciseHeader
