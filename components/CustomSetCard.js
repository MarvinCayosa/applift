export default function CustomSetCard({ 
  workout, 
  image,
}) {
  return (
    <div 
      className="shrink-0 snap-center"
      style={{ width: 'calc(100% - 32px)' }}
    >
      {/* Main workout card with static gray outer container */}
      <div
        className="rounded-3xl shadow-lg shadow-black/30"
        style={{
          background: 'linear-gradient(90deg, rgba(60,60,60,0.4), rgba(80,80,80,0.6), rgba(60,60,60,0.4))',
          padding: '6px',
        }}
      >
        {/* Inner container with image and stats */}
        <div className="rounded-[22px] bg-black/90 overflow-hidden">
          <div className="rounded-[20px] overflow-hidden relative w-full mx-auto" style={{ height: 'clamp(200px, 28vh, 300px)' }}>
            {/* Background image */}
            <img
              src={image}
              alt="Custom Set"
              className="w-full h-full object-cover"
            />
            
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Top gradient overlay */}
            <div 
              className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
              style={{
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)',
              }}
            />

            {/* Bottom gradient overlay */}
            <div 
              className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
              }}
            />

            {/* Content overlay */}
            <div className="absolute inset-0 flex flex-col justify-between p-5">
              {/* Title and swap icon */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">
                  Custom Set
                </h2>
                <button
                  type="button"
                  className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
                  aria-label="Refresh"
                >
                  <img src="/images/icons/refresh.png" alt="Refresh" className="w-5 h-5" />
                </button>
              </div>

              {/* Stats - Weight, Sets, Reps */}
              <div className="flex justify-start gap-3">
                <div className="rounded-2xl px-4 py-3 min-w-[90px]">
                  <p className="text-[11px] text-white/70 mb-1">Weight</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-3xl font-bold text-white leading-none">__</p>
                    <p className="text-xs text-white/70 leading-none">kg</p>
                  </div>
                </div>
                <div className="rounded-2xl px-4 py-3 min-w-[70px] text-center">
                  <p className="text-[11px] text-white/70 mb-1">Sets</p>
                  <p className="text-3xl font-bold text-white leading-none">_</p>
                </div>
                <div className="rounded-2xl px-4 py-3 min-w-[70px] text-center">
                  <p className="text-[11px] text-white/70 mb-1">Reps</p>
                  <p className="text-3xl font-bold text-white leading-none">_</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
