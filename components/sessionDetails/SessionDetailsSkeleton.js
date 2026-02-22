/**
 * SessionDetailsSkeleton
 *
 * Loading shimmer skeleton matching the Session Details layout.
 */

export default function SessionDetailsSkeleton() {
  return (
    <div className="min-h-screen bg-black text-white animate-pulse">
      {/* Header skeleton */}
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-white/[0.06]" />
          <div className="flex-1 flex flex-col items-center gap-2 pr-10">
            <div className="h-5 w-40 bg-white/[0.08] rounded" />
            <div className="h-3 w-56 bg-white/[0.06] rounded" />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-2 mb-3">
          <div className="rounded-2xl bg-white/[0.06] min-w-[72px] h-20" />
          <div className="flex-1 rounded-2xl bg-white/[0.06] h-20" />
        </div>

        {/* Timing card */}
        <div className="rounded-2xl bg-white/[0.06] h-14" />
      </div>

      {/* Cards */}
      <div className="px-4 space-y-3">
        {/* Movement graph */}
        <div className="rounded-2xl bg-white/[0.05] h-52" />

        {/* Execution row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/[0.05] h-56" />
          <div className="rounded-2xl bg-white/[0.05] h-56" />
        </div>

        {/* Fatigue */}
        <div className="rounded-2xl bg-white/[0.05] h-56" />

        {/* Phases */}
        <div className="rounded-2xl bg-white/[0.05] h-40" />
      </div>
    </div>
  );
}
