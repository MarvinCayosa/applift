/**
 * AIRecommendationSkeleton
 * 
 * Loading skeleton for the AI recommendation card.
 * Shows a gradient shimmer animation while the AI generates a recommendation.
 */

export default function AIRecommendationSkeleton({ equipmentColor = '#8B5CF6' }) {
  return (
    <div className="space-y-3">
      {/* Generating text */}
      <div className="flex items-center justify-center gap-2">
        <div className="relative flex items-center gap-1.5">
          <img src="/images/gemini.png" alt="Gemini" className="w-4 h-4 animate-pulse" />
          <p className="text-sm font-medium bg-gradient-to-r from-violet-400 via-purple-300 to-violet-400 bg-clip-text text-transparent animate-pulse">
            Generating AI Recommendation...
          </p>
        </div>
      </div>

      {/* Skeleton card */}
      <div 
        className="rounded-3xl overflow-hidden animate-pulse"
        style={{ padding: '6px' }}
      >
        <div 
          className="rounded-[22px] overflow-hidden"
          style={{ 
            background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(139,92,246,0.05) 50%, rgba(139,92,246,0.15) 100%)',
            border: '1px solid rgba(139,92,246,0.2)',
          }}
        >
          {/* Image placeholder */}
          <div 
            className="relative w-full"
            style={{ height: 'clamp(170px, 22vh, 220px)' }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-white/[0.02] ai-shimmer" />
            
            {/* Skeleton content overlay */}
            <div className="absolute inset-0 flex flex-col justify-between p-3">
              {/* Title skeleton */}
              <div className="pr-12">
                <div className="h-6 w-48 rounded-lg bg-white/10 ai-shimmer" />
              </div>

              {/* Stats skeleton */}
              <div className="space-y-2">
                <div className="rounded-2xl px-3 py-2 bg-black/50">
                  <div className="flex justify-between items-center gap-2">
                    {/* Weight */}
                    <div className="flex-1 text-center space-y-1">
                      <div className="h-3 w-10 mx-auto rounded bg-white/10 ai-shimmer" />
                      <div className="h-8 w-12 mx-auto rounded-lg bg-white/10 ai-shimmer" />
                    </div>
                    <div className="w-px h-10 bg-white/10" />
                    {/* Sets */}
                    <div className="flex-1 text-center space-y-1">
                      <div className="h-3 w-8 mx-auto rounded bg-white/10 ai-shimmer" />
                      <div className="h-8 w-8 mx-auto rounded-lg bg-white/10 ai-shimmer" />
                    </div>
                    <div className="w-px h-10 bg-white/10" />
                    {/* Reps */}
                    <div className="flex-1 text-center space-y-1">
                      <div className="h-3 w-8 mx-auto rounded bg-white/10 ai-shimmer" />
                      <div className="h-8 w-8 mx-auto rounded-lg bg-white/10 ai-shimmer" />
                    </div>
                  </div>
                </div>

                {/* Bottom bar skeleton */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex gap-3">
                    <div className="h-3 w-16 rounded bg-white/10 ai-shimmer" />
                    <div className="h-3 w-16 rounded bg-white/10 ai-shimmer" />
                  </div>
                  <div className="h-3 w-20 rounded bg-white/10 ai-shimmer" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reasoning skeleton */}
      <div className="rounded-2xl bg-white/[0.04] border border-white/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-violet-500/10 ai-shimmer" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-28 rounded bg-white/10 ai-shimmer" />
            <div className="h-2 w-44 rounded bg-white/5 ai-shimmer" />
          </div>
        </div>
      </div>

      <style jsx>{`
        .ai-shimmer {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(139, 92, 246, 0.08) 40%,
            rgba(139, 92, 246, 0.15) 50%,
            rgba(139, 92, 246, 0.08) 60%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: aiShimmer 2s ease-in-out infinite;
        }
        @keyframes aiShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
