import { useRouter } from 'next/router';

export default function PerformanceHeader({ workoutName, equipment }) {
  const router = useRouter();

  return (
    <div className="pt-10 sm:pt-10 pb-2 relative flex items-center justify-center">
      <button
        onClick={() => router.back()}
        className="absolute left-0 flex items-center justify-center h-10 w-10 rounded-full hover:bg-white/10 transition-all shrink-0"
        aria-label="Go back"
      >
        <img
          src="/images/icons/arrow-point-to-left.png"
          alt="Back"
          className="w-5 h-5 filter brightness-0 invert"
        />
      </button>
      
      {/* Page Title - Centered */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-white">Performance Details</h1>
        <p className="text-sm text-gray-400">{workoutName} • {equipment}</p>
      </div>
    </div>
  );
}
