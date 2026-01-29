import { useState, useEffect, useRef } from 'react';

export default function RecommendedSetCard({ 
  equipment, 
  workout, 
  recommendedSets, 
  recommendedReps, 
  image, 
  equipmentColor,
  weight = 60,
  weightUnit = 'kg',
  time = 45,
  timeUnit = 'Secs',
  burnCalories = 45
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
    };

    carousel.addEventListener('scroll', handleScroll);
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, []);

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
      weight: 0,
      weightUnit,
      sets: 0,
      reps: 0,
      time: 0,
      timeUnit,
      burnCalories: 0
    }
  ];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-center bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
        Here is a Recommended Set for You
      </h3>
      
      {/* Mobile Carousel container */}
      <div 
        ref={carouselRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth -mx-4 px-4 md:hidden"
      >
        {cards.map((card, idx) => (
          <div key={idx} className="min-w-full shrink-0 snap-center">
            {/* Main workout card with outer container */}
            <div
              className="rounded-3xl p-1 border border-white/20 shadow-lg shadow-black/30"
              style={{
                backgroundColor: darkenColor(equipmentColor, 0.14),
              }}
            >
              {/* Inner image container */}
              <div className="rounded-[20px] overflow-hidden relative h-56 max-w-[360px] mx-auto">
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
                      {card.type === 'custom' ? 'Custom Set' : workout}
                    </h2>
                    <button
                      type="button"
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      aria-label="Refresh"
                    >
                      <img src="/images/icons/refresh.png" alt="Refresh" className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Stats - Weight, Sets, Reps */}
                  <div className="flex justify-start gap-3">
                    <div className="bg-white/8 backdrop-blur-sm rounded-2xl px-4 py-3 min-w-[90px]">
                      <p className="text-[11px] text-white/70 mb-1">Weight</p>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold text-white leading-none">
                          {card.type === 'custom' ? '__' : card.weight}
                        </p>
                        <p className="text-xs text-white/70 leading-none">{card.weightUnit}</p>
                      </div>
                    </div>
                    <div className="bg-white/8 backdrop-blur-sm rounded-2xl px-4 py-3 min-w-[70px] text-center">
                      <p className="text-[11px] text-white/70 mb-1">Sets</p>
                      <p className="text-3xl font-bold text-white leading-none">
                        {card.type === 'custom' ? '_' : card.sets}
                      </p>
                    </div>
                    <div className="bg-white/8 backdrop-blur-sm rounded-2xl px-4 py-3 min-w-[70px] text-center">
                      <p className="text-[11px] text-white/70 mb-1">Reps</p>
                      <p className="text-3xl font-bold text-white leading-none">
                        {card.type === 'custom' ? '_' : card.reps}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom section - Time, Burn, Powered by */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex gap-4">
                  {/* Time */}
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 flex items-center justify-center">
                      <img src="/images/icons/time.png" alt="Time" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/80 leading-tight">Time</p>
                      <p className="text-sm font-semibold text-white leading-tight">
                        {card.type === 'custom' ? '__' : `${card.time} ${card.timeUnit}`}
                      </p>
                    </div>
                  </div>
                  
                  {/* Burn */}
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 flex items-center justify-center">
                      <img src="/images/icons/burn.png" alt="Burn" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/80 leading-tight">Burn</p>
                      <p className="text-sm font-semibold text-white leading-tight">
                        {card.type === 'custom' ? '__' : `${card.burnCalories} kcal`}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Powered by */}
                <p className="text-[10px] text-white leading-tight text-right opacity-50">
                  Powered by<br />Vertex AI Studio
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Grid - Two Cards Side by Side */}
      <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cards.map((card, idx) => (
          <div key={idx}>
            {/* Main workout card with outer container */}
            <div
              className="rounded-3xl p-1 border border-white/20 shadow-lg shadow-black/30"
              style={{
                backgroundColor: darkenColor(equipmentColor, 0.14),
              }}
            >
              {/* Inner image container */}
              <div className="rounded-[20px] overflow-hidden relative h-56">
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
                      {card.type === 'custom' ? 'Custom Set' : workout}
                    </h2>
                    <button
                      type="button"
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      aria-label="Refresh"
                    >
                      <img src="/images/icons/refresh.png" alt="Refresh" className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Stats - Weight, Sets, Reps */}
                  <div className="flex justify-start gap-3">
                    <div className="bg-white/8 backdrop-blur-sm rounded-2xl px-4 py-3 min-w-[90px]">
                      <p className="text-[11px] text-white/70 mb-1">Weight</p>
                      <div className="flex items-baseline gap-1">
                        <p className="text-3xl font-bold text-white leading-none">
                          {card.type === 'custom' ? '__' : card.weight}
                        </p>
                        <p className="text-xs text-white/70 leading-none">{card.weightUnit}</p>
                      </div>
                    </div>
                    <div className="bg-white/8 backdrop-blur-sm rounded-2xl px-4 py-3 min-w-[70px] text-center">
                      <p className="text-[11px] text-white/70 mb-1">Sets</p>
                      <p className="text-3xl font-bold text-white leading-none">
                        {card.type === 'custom' ? '_' : card.sets}
                      </p>
                    </div>
                    <div className="bg-white/8 backdrop-blur-sm rounded-2xl px-4 py-3 min-w-[70px] text-center">
                      <p className="text-[11px] text-white/70 mb-1">Reps</p>
                      <p className="text-3xl font-bold text-white leading-none">
                        {card.type === 'custom' ? '_' : card.reps}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom section - Time, Burn, Powered by */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex gap-4">
                  {/* Time */}
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 flex items-center justify-center">
                      <img src="/images/icons/time.png" alt="Time" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/80 leading-tight">Time</p>
                      <p className="text-sm font-semibold text-white leading-tight">
                        {card.type === 'custom' ? '__' : `${card.time} ${card.timeUnit}`}
                      </p>
                    </div>
                  </div>
                  
                  {/* Burn */}
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 flex items-center justify-center">
                      <img src="/images/icons/burn.png" alt="Burn" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-white/80 leading-tight">Burn</p>
                      <p className="text-sm font-semibold text-white leading-tight">
                        {card.type === 'custom' ? '__' : `${card.burnCalories} kcal`}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* Powered by */}
                <p className="text-[10px] text-white leading-tight text-right opacity-50">
                  Powered by<br />Vertex AI Studio
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Carousel dots - Mobile only */}
      <div className="flex justify-center gap-2.5 px-4 md:hidden">
        {cards.map((_, idx) => (
          <span
            key={idx}
            className={`${idx === activeIndex ? 'bg-white h-2 w-8' : 'bg-white/30 h-2 w-2 hover:bg-white/50'} rounded-full transition-all duration-300`}
          />
        ))}
      </div>

      {/* Subtext */}
      <p className="text-xs text-center text-white/10">Swipe right for custom set</p>
    </div>
  );
}
