import { useRouter } from 'next/router';

export default function PerformanceHeader({ workoutName, equipment }) {
  const router = useRouter();

  return (
    <div className="pt-2.5 sm:pt-3.5 lg:pt-5 pb-2 sm:pb-3 relative flex items-center justify-center content-fade-up-1">
      <button
        onClick={() => router.back()}
        className="absolute left-0 flex items-center justify-center h-10 w-10 sm:h-11 sm:w-11 lg:h-12 lg:w-12 rounded-full hover:bg-white/10 transition-all shrink-0"
        aria-label="Go back"
      >
        <img
          src="/images/icons/arrow-point-to-left.png"
          alt="Back"
          className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 filter brightness-0 invert"
        />
      </button>
      
      {/* Page Title - Centered */}
      <div className="text-center">
        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white">Performance Details</h1>
        <p className="text-xs sm:text-sm lg:text-base text-gray-400">{workoutName} • {equipment}</p>
      </div>
    </div>
  );
}
