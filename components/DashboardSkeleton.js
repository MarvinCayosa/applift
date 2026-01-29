/**
 * Dashboard Loading Skeleton
 * Displays while dashboard content is loading
 */

export default function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header with avatar skeleton */}
      <div className="sticky top-0 z-40 bg-black/95 backdrop-blur-sm border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          {/* Left side - title skeleton */}
          <div className="flex-1">
            <div className="h-8 w-32 bg-gray-800 rounded animate-pulse"></div>
          </div>

          {/* Right side - avatar skeleton */}
          <div className="h-10 w-10 bg-gray-800 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Section 1: Quick Stats */}
        <div className="space-y-3">
          <div className="h-6 w-48 bg-gray-800 rounded animate-pulse"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-gray-900 rounded-lg p-4 space-y-2">
                <div className="h-4 w-20 bg-gray-800 rounded animate-pulse"></div>
                <div className="h-8 w-16 bg-gray-800 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Chart skeleton */}
        <div className="bg-gray-900 rounded-lg p-4 space-y-3">
          <div className="h-6 w-48 bg-gray-800 rounded animate-pulse"></div>
          <div className="h-64 w-full bg-gray-800 rounded animate-pulse"></div>
        </div>

        {/* Section 3: Workout cards skeleton */}
        <div className="space-y-3">
          <div className="h-6 w-48 bg-gray-800 rounded animate-pulse"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-900 rounded-lg h-24 animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom navigation skeleton */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm border-t border-white/10 h-20 flex justify-around items-center px-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-6 h-6 bg-gray-800 rounded animate-pulse"></div>
            <div className="w-8 h-2 bg-gray-800 rounded animate-pulse"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
