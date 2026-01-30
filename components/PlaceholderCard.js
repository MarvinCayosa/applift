import React from 'react'

/**
 * PlaceholderCard - Reserved card for future features
 * Compact half-width card design (300px height)
 * Backend-ready component
 * 
 * @param {Object} props
 * @param {string} props.title - Card title
 * @param {string} props.subtitle - Card subtitle
 * @param {React.ReactNode} props.children - Card content
 */
export default function PlaceholderCard({ 
  title = 'Coming Soon',
  subtitle = 'New feature',
  children
}) {
  return (
    <div className="bg-white/10 rounded-2xl p-3 h-[300px] flex flex-col">
      {/* Header */}
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wide">
          {title}
        </h3>
        <p className="text-[10px] text-white/40">{subtitle}</p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        {children || (
          <>
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <div className="text-[11px] text-white/30">Reserved for future use</div>
          </>
        )}
      </div>
    </div>
  )
}
