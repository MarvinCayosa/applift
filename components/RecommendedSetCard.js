
import { useState, useEffect, useRef } from 'react';

// Helper to lighten a hex color
function lightenColor(hex, amount = 0.2) {
  if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return hex;
  const expand = (h) => h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
  const full = expand(hex);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(Math.round(parseInt(full.substr(1, 2), 16) + (255 - parseInt(full.substr(1, 2), 16)) * amount));
  const g = clamp(Math.round(parseInt(full.substr(3, 2), 16) + (255 - parseInt(full.substr(3, 2), 16)) * amount));
  const b = clamp(Math.round(parseInt(full.substr(5, 2), 16) + (255 - parseInt(full.substr(5, 2), 16)) * amount));
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export default function RecommendedSetCard({ 
  equipment, 
  workout, 
  recommendedSets, 
  recommendedReps, 
  image, 
  equipmentColor,
  weight = 5,
  weightUnit = 'kg',
  time = 45,
  timeUnit = 'Secs',
  burnCalories = 45,
  // Custom set values from parent
  customWeight = null,
  customSets = null,
  customReps = null,
  customWeightUnit = 'kg',
  // Callback to open modal
  onCustomFieldClick = () => {},
  // Callback when carousel slide changes
  onActiveIndexChange = () => {}
}) {
  const darkenColor = (hex, amount = 0.12) => {
    if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return hex;
    const expand = (h) => h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
    const full = expand(hex);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp(Math.round(parseInt(full.substr(1, 2), 16) * (1 - amount)));
    const g = clamp(Math.round(parseInt(full.substr(3, 2), 16) * (1 - amount)));
    const b = clamp(Math.round(parseInt(full.substr(5, 2), 16) * (1 - amount)));
    const toHex = (v) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const [activeIndex, setActiveIndex] = useState(0);
  const carouselRef = useRef(null);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const handleScroll = () => {
      const scrollLeft = carousel.scrollLeft;
      const cardWidth = carousel.offsetWidth;
      const index = Math.round(scrollLeft / cardWidth);
      setActiveIndex(index);
      // Notify parent of active index change
      onActiveIndexChange(index);
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, [onActiveIndexChange]);

  // Handle opening modal for specific field - calls parent callback
  const handleCustomFieldClick = (field) => {
    onCustomFieldClick(field);
  };

  const cards = [
    {
      type: 'recommended',
      weight,
      weightUnit,
      sets: recommendedSets,
      reps: recommendedReps,
      time,
      timeUnit,
      burnCalories
    },
    {
      type: 'custom',
      weight: customWeight,
      weightUnit: customWeightUnit,
      sets: customSets,
      reps: customReps,
      time: 0,
      timeUnit,
      burnCalories: 0
    }
  ];

  return (
    <div className="space-y-3">
      <h3 
        className="text-sm font-medium text-center bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent animate-gradient-text transition-opacity duration-300"
        style={{ opacity: activeIndex === 0 ? 1 : 0 }}
      >
        Here is a Recommended Set for You
      </h3>
      
      {/* Mobile Carousel container */}
      <div 
        ref={carouselRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth md:hidden content-fade-up-3"
        style={{ 
          animationDelay: '0.2s'
        }}
      >
        {cards.map((card, idx) => (
          <div 
            key={idx} 
            className="shrink-0 snap-center px-2"
            style={{ width: '100%' }}
          >
            {/* Main workout card with animated outer container */}
            <div
              className={`rounded-3xl shadow-lg shadow-black/30 ${card.type === 'custom' ? '' : 'animate-shimmer'}`}
              style={{
                background: card.type === 'custom' 
                  ? 'rgba(120,120,120,0.8)'
                  : `linear-gradient(90deg, ${darkenColor(equipmentColor, 0.3)}, ${lightenColor(equipmentColor, 0.4)}, ${equipmentColor}, ${darkenColor(equipmentColor, 0.3)})`,
                backgroundSize: '400% 100%',
                animationDuration: card.type === 'custom' ? undefined : '7s',
                padding: '6px',
              }}
            >
              {/* Inner container with image and stats */}
              <div className="rounded-[22px] bg-black/90 overflow-hidden">
              <div className="rounded-2xl overflow-hidden relative w-full mx-auto" style={{ height: 'clamp(200px, 28vh, 300px)' }}>
                {/* Background image */}
                <img
                  src={image}
                  alt={workout}
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

                {/* Bottom gradient overlay - stronger for bottom content */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
                  style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
                  }}
                />

                {/* Refresh button - fixed position */}
                <button
                  type="button"
                  className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors z-10"
                  aria-label="Refresh"
                >
                  <img src="/images/icons/refresh.png" alt="Refresh" className="w-5 h-5" />
                </button>

                {/* Content overlay */}
                <div className="absolute inset-0 flex flex-col justify-between p-5">
                  {/* Title */}
                  <div className="flex items-center">
                    <h2 className="text-2xl font-bold text-white">
                      {workout}
                    </h2>
                  </div>

                  {/* Bottom content area */}
                  <div className="space-y-3">
                    {/* Stats - Weight, Sets, Reps - Compact dark background */}
                    <div className="rounded-3xl px-4 py-4 w-full mx-auto shadow-lg shadow-black/40 border border-black/20 bg-black/50">
                      <div className="flex justify-between items-center">
                        {card.type === 'custom' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCustomFieldClick('weight')}
                              className="flex-1 py-1 hover:bg-white/10 rounded-xl transition-colors text-center"
                            >
                              <p className="text-xs text-white/70 mb-0.5">Weight</p>
                              <div className="flex items-baseline justify-center gap-1">
                                <p className="text-4xl font-bold leading-none" style={{ color: customWeight ? equipmentColor : 'rgba(255,255,255,0.4)' }}>
                                  {customWeight || '-'}
                                </p>
                                <p className="text-xs text-white/70 leading-none">{card.weightUnit}</p>
                              </div>
                            </button>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <button
                              type="button"
                              onClick={() => handleCustomFieldClick('sets')}
                              className="flex-1 py-1 hover:bg-white/10 rounded-xl transition-colors text-center"
                            >
                              <p className="text-xs text-white/70 mb-0.5">Sets</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: customSets ? equipmentColor : 'rgba(255,255,255,0.4)' }}>
                                {customSets || '-'}
                              </p>
                            </button>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <button
                              type="button"
                              onClick={() => handleCustomFieldClick('reps')}
                              className="flex-1 py-1 hover:bg-white/10 rounded-xl transition-colors text-center"
                            >
                              <p className="text-xs text-white/70 mb-0.5">Reps</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: customReps ? equipmentColor : 'rgba(255,255,255,0.4)' }}>
                                {customReps || '-'}
                              </p>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 py-1 text-center">
                              <p className="text-xs text-white/70 mb-0.5">Weight</p>
                              <div className="flex items-baseline justify-center gap-1">
                                <p className="text-4xl font-bold leading-none" style={{ color: equipmentColor }}>
                                  {card.weight}
                                </p>
                                <p className="text-xs text-white/70 leading-none">{card.weightUnit}</p>
                              </div>
                            </div>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <div className="flex-1 py-1 text-center">
                              <p className="text-xs text-white/70 mb-0.5">Sets</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: equipmentColor }}>
                                {card.sets}
                              </p>
                            </div>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <div className="flex-1 py-1 text-center">
                              <p className="text-xs text-white/70 mb-0.5">Reps</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: equipmentColor }}>
                                {card.reps}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Bottom bar - inside image */}
                    {card.type === 'recommended' && (
                      <div className="flex items-center justify-between px-2">
                        <div className="flex gap-4">
                          {/* Time */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 flex items-center justify-center">
                              <img src="/images/icons/time.png" alt="Time" className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-[10px] text-white/80 leading-tight">Time</p>
                              <p className="text-sm font-semibold text-white leading-tight">
                                {`${card.time} ${card.timeUnit}`}
                              </p>
                            </div>
                          </div>
                          
                          {/* Burn */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 flex items-center justify-center">
                              <img src="/images/icons/burn.png" alt="Burn" className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-[10px] text-white/80 leading-tight">Burn</p>
                              <p className="text-sm font-semibold text-white leading-tight">
                                {`${card.burnCalories} kcal`}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Powered by */}
                        <p className="text-[10px] text-white leading-tight text-right opacity-50">
                          Powered by<br />Vertex AI Studio
                        </p>
                      </div>
                    )}
                    {card.type === 'custom' && (
                      <div className="flex items-center justify-center gap-2 px-2">
                        <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <p className="text-xs text-white/70">Enter your custom set</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Grid - Two Cards Side by Side */}
      <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-4 content-fade-up-3" style={{ animationDelay: '0.2s' }}>
        {cards.map((card, idx) => (
          <div key={idx}>
            {/* Main workout card with animated outer container */}
            <div
              className={`rounded-3xl shadow-lg shadow-black/30 ${card.type === 'custom' ? '' : 'animate-shimmer'}`}
              style={{
                background: card.type === 'custom' 
                  ? 'rgba(120,120,120,0.8)'
                  : `linear-gradient(90deg, #fff 0%, ${equipmentColor} 20%, #fff 40%, ${equipmentColor} 60%, #fff 80%, ${equipmentColor} 100%)`,
                backgroundSize: '400% 100%',
                animationDuration: card.type === 'custom' ? undefined : '3s',
                padding: '8px', // Thicker border
              }}
            >
              {/* Inner container with image and stats */}
              <div className="rounded-[21px] bg-black/90 overflow-hidden">
              <div className="rounded-2xl overflow-hidden relative" style={{ height: 'clamp(240px, 35vh, 400px)' }}>
                {/* Background image */}
                <img
                  src={image}
                  alt={workout}
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

                {/* Bottom gradient overlay - stronger for bottom content */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
                  style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)',
                  }}
                />

                {/* Refresh button - fixed position */}
                <button
                  type="button"
                  className="absolute top-4 right-4 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors z-10"
                  aria-label="Refresh"
                >
                  <img src="/images/icons/refresh.png" alt="Refresh" className="w-5 h-5" />
                </button>

                {/* Content overlay */}
                <div className="absolute inset-0 flex flex-col justify-between p-5">
                  {/* Title */}
                  <div className="flex items-center">
                    <h2 className="text-2xl font-bold text-white">
                      {workout}
                    </h2>
                  </div>

                  {/* Bottom content area */}
                  <div className="space-y-3">
                    {/* Stats - Weight, Sets, Reps - Compact dark background */}
                    <div className="rounded-3xl px-4 py-4 w-full mx-auto shadow-lg shadow-black/40 border border-black/20 bg-black/50">
                      <div className="flex justify-between items-center">
                        {card.type === 'custom' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCustomFieldClick('weight')}
                              className="flex-1 py-1 hover:bg-white/10 rounded-xl transition-colors text-center"
                            >
                              <p className="text-xs text-white/70 mb-0.5">Weight</p>
                              <div className="flex items-baseline justify-center gap-1">
                                <p className="text-4xl font-bold leading-none" style={{ color: customWeight ? equipmentColor : 'rgba(255,255,255,0.4)' }}>
                                  {customWeight || '-'}
                                </p>
                                <p className="text-xs text-white/70 leading-none">{card.weightUnit}</p>
                              </div>
                            </button>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <button
                              type="button"
                              onClick={() => handleCustomFieldClick('sets')}
                              className="flex-1 py-1 hover:bg-white/10 rounded-xl transition-colors text-center"
                            >
                              <p className="text-xs text-white/70 mb-0.5">Sets</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: customSets ? equipmentColor : 'rgba(255,255,255,0.4)' }}>
                                {customSets || '-'}
                              </p>
                            </button>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <button
                              type="button"
                              onClick={() => handleCustomFieldClick('reps')}
                              className="flex-1 py-1 hover:bg-white/10 rounded-xl transition-colors text-center"
                            >
                              <p className="text-xs text-white/70 mb-0.5">Reps</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: customReps ? equipmentColor : 'rgba(255,255,255,0.4)' }}>
                                {customReps || '-'}
                              </p>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 py-1 text-center">
                              <p className="text-xs text-white/70 mb-0.5">Weight</p>
                              <div className="flex items-baseline justify-center gap-1">
                                <p className="text-4xl font-bold leading-none" style={{ color: equipmentColor }}>
                                  {card.weight}
                                </p>
                                <p className="text-xs text-white/70 leading-none">{card.weightUnit}</p>
                              </div>
                            </div>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <div className="flex-1 py-1 text-center">
                              <p className="text-xs text-white/70 mb-0.5">Sets</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: equipmentColor }}>
                                {card.sets}
                              </p>
                            </div>
                            <span className="text-white/50 text-3xl font-light">|</span>
                            <div className="flex-1 py-1 text-center">
                              <p className="text-xs text-white/70 mb-0.5">Reps</p>
                              <p className="text-4xl font-bold leading-none" style={{ color: equipmentColor }}>
                                {card.reps}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Bottom bar - inside image */}
                    {card.type === 'recommended' && (
                      <div className="flex items-center justify-between px-2">
                        <div className="flex gap-4">
                          {/* Time */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 flex items-center justify-center">
                              <img src="/images/icons/time.png" alt="Time" className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-[10px] text-white/80 leading-tight">Time</p>
                              <p className="text-sm font-semibold text-white leading-tight">
                                {`${card.time} ${card.timeUnit}`}
                              </p>
                            </div>
                          </div>
                          
                          {/* Burn */}
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 flex items-center justify-center">
                              <img src="/images/icons/burn.png" alt="Burn" className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-[10px] text-white/80 leading-tight">Burn</p>
                              <p className="text-sm font-semibold text-white leading-tight">
                                {`${card.burnCalories} kcal`}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Powered by */}
                        <p className="text-[10px] text-white leading-tight text-right opacity-50">
                          Powered by<br />Vertex AI Studio
                        </p>
                      </div>
                    )}
                    {card.type === 'custom' && (
                      <div className="flex items-center justify-center gap-2 px-2">
                        <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <p className="text-xs text-white/70">Enter your custom set</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Subtext - fades together with header when on recommended set */}
      <p 
        className="text-xs text-center text-white/50 content-fade-up-3 transition-opacity duration-300 mb-2" 
        style={{ animationDelay: '0.35s', opacity: activeIndex === 0 ? 1 : 0 }}
      >
        Swipe right for custom set
      </p>

      {/* Carousel dots - Mobile only */}
      <div className="flex justify-center gap-2.5 px-4 mb-4 md:hidden content-fade-up-3" style={{ animationDelay: '0.3s' }}>
        {cards.map((_, idx) => (
          <span
            key={idx}
            className={`${idx === activeIndex ? 'bg-white h-2 w-8' : 'bg-white/30 h-2 w-2 hover:bg-white/50'} rounded-full transition-all duration-300`}
          />
        ))}
      </div>
    </div>
  );
}
